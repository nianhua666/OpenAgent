import { ipcMain, net } from 'electron'
import type { TTSEmotionStyle, TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem } from '../src/types'
import {
  AZURE_TTS_ENGINE,
  AZURE_TTS_MODEL_ID,
  AZURE_TTS_VOICE_ID,
  TTS_EMOTION_STYLE_OPTIONS,
  clampTTSEmotionIntensity,
  createAzureTTSVoiceId,
  normalizeTTSEmotionStyle,
  stripAzureTTSVoiceId
} from '../src/utils/ttsCatalog'

type AzureSpeechSettings = {
  ttsAzureKey?: string
  ttsAzureRegion?: string
}

type AzureVoiceDescriptor = {
  Name?: string
  DisplayName?: string
  LocalName?: string
  ShortName: string
  Gender?: string
  Locale?: string
  LocaleName?: string
  StyleList?: string[]
  RolePlayList?: string[]
  SampleRateHertz?: string
  VoiceType?: string
  Status?: string
}

const AZURE_VOICE_DOCS_URL = 'https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts#voice-styles-and-roles'
const AZURE_AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const AZURE_AUDIO_MIME_TYPE = 'audio/mpeg'
const AZURE_SAMPLE_RATE = 24000
const AZURE_DEFAULT_REGION = 'southeastasia'
const AZURE_CHINESE_LOCALE_RE = /^zh-/i
const AZURE_DEFAULT_VOICE_SHORTNAME = 'zh-CN-XiaoxiaoNeural'

const AZURE_DISPLAY_NAME_MAP: Record<string, string> = {
  'zh-CN-XiaoxiaoNeural': '晓晓',
  'zh-CN-XiaoyiNeural': '晓伊',
  'zh-CN-YunxiNeural': '云希',
  'zh-CN-YunyangNeural': '云扬'
}

let azureTTSHandlersRegistered = false
let cachedVoices: { region: string; expiresAt: number; voices: AzureVoiceDescriptor[] } | null = null

function normalizeAzureRegion(region: string | undefined) {
  return (region || '').trim().toLowerCase()
}

function resolveAzureCredentials(settingsResolver: () => AzureSpeechSettings) {
  const settings = settingsResolver() || {}
  const key = (settings.ttsAzureKey || '').trim()
  const region = normalizeAzureRegion(settings.ttsAzureRegion) || AZURE_DEFAULT_REGION

  if (!key) {
    throw new Error('请先在语音设置里填写 Azure Speech Key。')
  }

  if (!region) {
    throw new Error('请先在语音设置里填写 Azure Speech Region。')
  }

  return { key, region }
}

function buildAzureVoicesUrl(region: string) {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`
}

function buildAzureSynthesisUrl(region: string) {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
}

function escapeXml(text: string) {
  return text.replace(/[<>&"']/g, character => {
    switch (character) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      case "'":
        return '&apos;'
      default:
        return character
    }
  })
}

function normalizeInputText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/\r?\n+/g, '。')
    .replace(/[|/\\]+/g, '，')
    .replace(/[_~]+/g, ' ')
    .replace(/([。！？；，,.!?]){2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferAccent(locale: string) {
  if (/liaoning/i.test(locale)) {
    return '东北官话'
  }

  if (/shaanxi/i.test(locale)) {
    return '陕西中原官话'
  }

  if (/zh-cn/i.test(locale)) {
    return '普通话'
  }

  if (/zh-hk/i.test(locale)) {
    return '粤语 / 香港'
  }

  if (/zh-tw/i.test(locale)) {
    return '繁中 / 台湾'
  }

  return locale || '中文神经语音'
}

function normalizeGender(gender: string | undefined): 'female' | 'male' {
  return /male/i.test(gender || '') && !/female/i.test(gender || '') ? 'male' : 'female'
}

function prettifyVoiceName(voice: AzureVoiceDescriptor) {
  return AZURE_DISPLAY_NAME_MAP[voice.ShortName]
    || voice.LocalName?.trim()
    || voice.DisplayName?.trim()
    || voice.ShortName.replace(/^zh-[A-Z-]+-/, '').replace(/Neural$/i, '')
}

function normalizeSupportedEmotionStyles(styleList: string[] | undefined) {
  const allowedStyles = new Set(TTS_EMOTION_STYLE_OPTIONS.map(item => item.value))
  return (styleList || [])
    .map(style => normalizeTTSEmotionStyle(style))
    .filter(style => style !== 'auto' && style !== 'neutral' && allowedStyles.has(style))
    .filter((style, index, list) => list.indexOf(style) === index)
}

function buildVoiceDescription(voice: AzureVoiceDescriptor) {
  const styles = normalizeSupportedEmotionStyles(voice.StyleList)
  const roles = (voice.RolePlayList || []).filter(Boolean)
  const fragments = ['Azure Speech 官方神经语音，支持 express-as 与 styledegree 真情绪播报。']

  if (styles.length > 0) {
    fragments.push(`可用风格：${styles.slice(0, 6).join(' / ')}${styles.length > 6 ? ' 等' : ''}。`)
  }

  if (roles.length > 0) {
    fragments.push(`可切角色：${roles.join(' / ')}。`)
  }

  return fragments.join(' ')
}

function buildSampleText(voice: AzureVoiceDescriptor) {
  const styles = normalizeSupportedEmotionStyles(voice.StyleList)
  if (styles.includes('customerservice')) {
    return '你好，我会更耐心地把这一步给你讲清楚。'
  }

  if (styles.includes('assistant')) {
    return '你好，我现在可以用更真实的情绪语气继续播报。'
  }

  if (styles.includes('narration-professional')) {
    return '当前结果已经确认，我现在开始正式汇报重点。'
  }

  return '你好，我现在切换到了 Azure 官方情绪语音。'
}

function mapAzureVoiceToLibraryItem(voice: AzureVoiceDescriptor): TTSVoiceLibraryItem {
  return {
    id: createAzureTTSVoiceId(voice.ShortName),
    engine: AZURE_TTS_ENGINE,
    modelId: AZURE_TTS_MODEL_ID,
    name: prettifyVoiceName(voice),
    locale: voice.Locale || 'zh-CN',
    gender: normalizeGender(voice.Gender),
    accent: inferAccent(voice.Locale || ''),
    description: buildVoiceDescription(voice),
    sampleText: buildSampleText(voice),
    sourceLabel: 'Azure Speech',
    sourceUrl: AZURE_VOICE_DOCS_URL,
    emotionStyles: normalizeSupportedEmotionStyles(voice.StyleList),
    roles: (voice.RolePlayList || []).filter(Boolean),
    recommended: voice.ShortName === AZURE_DEFAULT_VOICE_SHORTNAME,
    builtIn: false
  }
}

function formatRate(speed: number | undefined) {
  const clampedSpeed = Math.min(Math.max(Number.isFinite(speed) ? Number(speed) : 1, 0.7), 1.35)
  const percent = Math.round((clampedSpeed - 1) * 100)
  return `${percent >= 0 ? '+' : ''}${percent}%`
}

function resolveAutoEmotionStyle(text: string, voice: AzureVoiceDescriptor): TTSEmotionStyle | '' {
  const normalized = text.replace(/\s+/g, '')
  const supported = new Set(normalizeSupportedEmotionStyles(voice.StyleList))

  const pickFirstSupported = (candidates: TTSEmotionStyle[]) => candidates.find(candidate => supported.has(candidate)) || ''

  if (/抱歉|对不起|遗憾|可惜|不好意思/.test(normalized)) {
    return pickFirstSupported(['sorry', 'empathetic', 'sad', 'gentle'])
  }

  if (/别担心|我理解|理解你|没关系|辛苦了|安慰/.test(normalized)) {
    return pickFirstSupported(['empathetic', 'gentle', 'friendly', 'calm'])
  }

  if (/注意|警告|风险|失败|错误|异常|必须|严禁|危险/.test(normalized)) {
    return pickFirstSupported(['serious', 'fearful', 'angry'])
  }

  if (/太好了|太棒了|恭喜|欢迎|成功了|搞定了|好耶/.test(normalized)) {
    return pickFirstSupported(normalized.includes('！') ? ['excited', 'cheerful', 'friendly'] : ['cheerful', 'friendly', 'hopeful'])
  }

  if (/希望|期待|继续加油|会更好|马上就好/.test(normalized)) {
    return pickFirstSupported(['hopeful', 'cheerful', 'assistant'])
  }

  if (normalized.length > 90) {
    return pickFirstSupported(['narration-relaxed', 'narration-professional', 'newscast', 'calm'])
  }

  return pickFirstSupported(['assistant', 'chat', 'friendly', 'calm'])
}

function resolveEmotionStyle(style: TTSEmotionStyle | undefined, text: string, voice: AzureVoiceDescriptor) {
  const normalizedStyle = normalizeTTSEmotionStyle(style)
  const supported = new Set(normalizeSupportedEmotionStyles(voice.StyleList))

  if (normalizedStyle === 'neutral') {
    return ''
  }

  if (normalizedStyle === 'auto') {
    return resolveAutoEmotionStyle(text, voice)
  }

  if (supported.has(normalizedStyle)) {
    return normalizedStyle
  }

  return resolveAutoEmotionStyle(text, voice)
}

function resolvePreferredVoice(voices: AzureVoiceDescriptor[], requestedVoiceId: string | undefined) {
  const shortName = stripAzureTTSVoiceId(requestedVoiceId) || AZURE_DEFAULT_VOICE_SHORTNAME
  return voices.find(voice => voice.ShortName === shortName)
    || voices.find(voice => voice.ShortName === AZURE_DEFAULT_VOICE_SHORTNAME)
    || voices[0]
}

function buildAzureSSML(payload: TTSSynthesizePayload, voice: AzureVoiceDescriptor) {
  const normalizedText = normalizeInputText(payload.text)
  const escapedText = escapeXml(normalizedText)
  const style = resolveEmotionStyle(payload.emotionStyle, normalizedText, voice)
  const rate = formatRate(payload.speed)
  const styleDegree = clampTTSEmotionIntensity(payload.emotionIntensity).toFixed(2)
  const prosody = `<prosody rate="${rate}">${escapedText}</prosody>`
  const content = style
    ? `<mstts:express-as style="${style}" styledegree="${styleDegree}">${prosody}</mstts:express-as>`
    : prosody

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voice.Locale || 'zh-CN'}"><voice name="${voice.ShortName}">${content}</voice></speak>`
}

async function requestAzureVoices(key: string, region: string) {
  const response = await net.fetch(buildAzureVoicesUrl(region), {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': key
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Azure 语音列表请求失败 (${response.status}): ${message.slice(0, 200)}`)
  }

  const voices = await response.json() as AzureVoiceDescriptor[]
  return voices.filter(voice => AZURE_CHINESE_LOCALE_RE.test(voice.Locale || '') || AZURE_CHINESE_LOCALE_RE.test(voice.ShortName || ''))
}

export async function listAzureSpeechVoices(settingsResolver: () => AzureSpeechSettings) {
  const { key, region } = resolveAzureCredentials(settingsResolver)

  if (cachedVoices && cachedVoices.region === region && cachedVoices.expiresAt > Date.now()) {
    return cachedVoices.voices
  }

  const voices = await requestAzureVoices(key, region)
  const ordered = [...voices].sort((left, right) => {
    const leftWeight = left.ShortName === AZURE_DEFAULT_VOICE_SHORTNAME ? -1 : /zh-cn/i.test(left.Locale || '') ? 0 : 1
    const rightWeight = right.ShortName === AZURE_DEFAULT_VOICE_SHORTNAME ? -1 : /zh-cn/i.test(right.Locale || '') ? 0 : 1
    return leftWeight - rightWeight || prettifyVoiceName(left).localeCompare(prettifyVoiceName(right), 'zh-Hans-CN')
  })

  cachedVoices = {
    region,
    expiresAt: Date.now() + 10 * 60_000,
    voices: ordered
  }
  return ordered
}

export async function synthesizeAzureSpeech(payload: TTSSynthesizePayload, settingsResolver: () => AzureSpeechSettings): Promise<TTSSynthesisResult> {
  const normalizedText = normalizeInputText(payload.text)
  if (!normalizedText) {
    return {
      success: false,
      engine: AZURE_TTS_ENGINE,
      modelId: AZURE_TTS_MODEL_ID,
      voiceId: payload.voiceId || AZURE_TTS_VOICE_ID,
      voiceName: 'Azure Speech',
      mimeType: AZURE_AUDIO_MIME_TYPE,
      error: '缺少要播报的文本'
    }
  }

  try {
    const { key, region } = resolveAzureCredentials(settingsResolver)
    const voices = await listAzureSpeechVoices(settingsResolver)
    const voice = resolvePreferredVoice(voices, payload.voiceId)
    if (!voice) {
      return {
        success: false,
        engine: AZURE_TTS_ENGINE,
        modelId: AZURE_TTS_MODEL_ID,
        voiceId: payload.voiceId || AZURE_TTS_VOICE_ID,
        voiceName: 'Azure Speech',
        mimeType: AZURE_AUDIO_MIME_TYPE,
        error: '当前 Azure Speech 没有可用的中文音色'
      }
    }

    const response = await net.fetch(buildAzureSynthesisUrl(region), {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': AZURE_AUDIO_FORMAT,
        'User-Agent': 'OpenAgent'
      },
      body: buildAzureSSML({ ...payload, text: normalizedText }, voice)
    })

    if (!response.ok) {
      const message = await response.text()
      return {
        success: false,
        engine: AZURE_TTS_ENGINE,
        modelId: AZURE_TTS_MODEL_ID,
        voiceId: createAzureTTSVoiceId(voice.ShortName),
        voiceName: prettifyVoiceName(voice),
        mimeType: AZURE_AUDIO_MIME_TYPE,
        error: `Azure 情绪语音合成失败 (${response.status}): ${message.slice(0, 200)}`
      }
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer())
    return {
      success: true,
      engine: AZURE_TTS_ENGINE,
      modelId: AZURE_TTS_MODEL_ID,
      voiceId: createAzureTTSVoiceId(voice.ShortName),
      voiceName: prettifyVoiceName(voice),
      mimeType: AZURE_AUDIO_MIME_TYPE,
      audioBase64: audioBuffer.toString('base64'),
      sampleRate: Number.parseInt(voice.SampleRateHertz || '', 10) || AZURE_SAMPLE_RATE
    }
  } catch (error) {
    return {
      success: false,
      engine: AZURE_TTS_ENGINE,
      modelId: AZURE_TTS_MODEL_ID,
      voiceId: payload.voiceId || AZURE_TTS_VOICE_ID,
      voiceName: 'Azure Speech',
      mimeType: AZURE_AUDIO_MIME_TYPE,
      error: error instanceof Error ? error.message : 'Azure 情绪语音合成失败'
    }
  }
}

export function registerAzureTTSHandlers(settingsResolver: () => AzureSpeechSettings) {
  if (azureTTSHandlersRegistered) {
    return
  }

  azureTTSHandlersRegistered = true

  ipcMain.handle('tts:listAzureVoices', async () => {
    const voices = await listAzureSpeechVoices(settingsResolver)
    return voices.map(mapAzureVoiceToLibraryItem)
  })

  ipcMain.handle('tts:synthesizeAzure', async (_event, payload: TTSSynthesizePayload) => {
    return synthesizeAzureSpeech(payload, settingsResolver)
  })
}