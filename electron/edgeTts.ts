import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { TTSEmotionStyle, TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem } from '../src/types'
import {
  EDGE_TTS_ENGINE,
  EDGE_TTS_MODEL_ID,
  EDGE_TTS_VOICE_ID,
  clampTTSEmotionIntensity,
  createEdgeTTSVoiceId,
  normalizeTTSEmotionStyle,
  stripEdgeTTSVoiceId
} from '../src/utils/ttsCatalog'

type EdgeRemoteVoice = {
  Name?: string
  ShortName: string
  Gender?: string
  Locale?: string
  FriendlyName?: string
  Status?: string
  VoiceTag?: {
    ContentCategories?: string[]
    VoicePersonalities?: string[]
  }
}

const EDGE_VOICE_DOCS_URL = 'https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts'
const EDGE_CHINESE_LOCALE_RE = /^zh-/i
const EDGE_SAMPLE_RATE = 24000
const EDGE_AUDIO_MIME_TYPE = 'audio/webm'
const EDGE_DEFAULT_VOICE_SHORTNAME = 'zh-CN-XiaoxiaoNeural'
const EDGE_VOICE_DISPLAY_NAME_MAP: Record<string, string> = {
  'zh-CN-XiaoxiaoNeural': '晓晓',
  'zh-CN-XiaoyiNeural': '晓伊',
  'zh-CN-YunjianNeural': '云健',
  'zh-CN-YunxiNeural': '云希',
  'zh-CN-YunxiaNeural': '云夏',
  'zh-CN-YunyangNeural': '云扬',
  'zh-CN-liaoning-XiaobeiNeural': '晓北',
  'zh-CN-shaanxi-XiaoniNeural': '晓妮',
  'zh-HK-HiuGaaiNeural': '晓佳',
  'zh-HK-HiuMaanNeural': '晓曼',
  'zh-HK-WanLungNeural': '云龙',
  'zh-TW-HsiaoChenNeural': '晓臻',
  'zh-TW-HsiaoYuNeural': '晓雨',
  'zh-TW-YunJheNeural': '云哲'
}

let edgeTTSHandlersRegistered = false
let cachedVoices: { expiresAt: number; voices: EdgeRemoteVoice[] } | null = null

function createTempDirectory() {
  const targetDir = join(app.getPath('temp'), `openagent-edge-tts-${Date.now()}-${randomUUID()}`)
  mkdirSync(targetDir, { recursive: true })
  return targetDir
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

function prettifyEdgeVoiceName(voice: EdgeRemoteVoice) {
  return EDGE_VOICE_DISPLAY_NAME_MAP[voice.ShortName]
    || voice.FriendlyName?.replace(/^Microsoft\s+/i, '').replace(/\s+Online.*$/i, '').trim()
    || voice.ShortName.replace(/^zh-[A-Z-]+-/, '').replace(/Neural$/i, '')
}

function buildVoiceDescription(voice: EdgeRemoteVoice) {
  const personalities = (voice.VoiceTag?.VoicePersonalities || []).map(item => item.trim()).filter(Boolean)
  const categories = (voice.VoiceTag?.ContentCategories || []).map(item => item.trim()).filter(Boolean)
  const fragments = ['微软 Edge 在线神经语音，中文清晰度和自然度明显高于当前离线小模型。']

  if (personalities.length > 0) {
    fragments.push(`风格倾向：${personalities.join(' / ')}。`)
  }

  if (categories.length > 0) {
    fragments.push(`更适合：${categories.join(' / ')}。`)
  }

  return fragments.join(' ')
}

function buildSampleText(voice: EdgeRemoteVoice) {
  const personalities = (voice.VoiceTag?.VoicePersonalities || []).join(' ').toLowerCase()
  if (/professional|reliable/.test(personalities)) {
    return '当前结果已经确认，我现在开始汇报重点。'
  }

  if (/lively|sunshine|cute|humorous/.test(personalities)) {
    return '这轮任务的关键点我已经替你理清了，我们继续往下推进。'
  }

  if (/warm/.test(personalities)) {
    return '你好，我会用更自然的中文语音继续陪你完成这轮任务。'
  }

  return '你好，我现在切换到了更自然的中文神经语音。'
}

function mapEdgeVoiceToLibraryItem(voice: EdgeRemoteVoice): TTSVoiceLibraryItem {
  return {
    id: createEdgeTTSVoiceId(voice.ShortName),
    engine: EDGE_TTS_ENGINE,
    modelId: EDGE_TTS_MODEL_ID,
    name: prettifyEdgeVoiceName(voice),
    locale: voice.Locale || 'zh-CN',
    gender: normalizeGender(voice.Gender),
    accent: inferAccent(voice.Locale || ''),
    description: buildVoiceDescription(voice),
    sampleText: buildSampleText(voice),
    sourceLabel: 'Microsoft Edge Neural',
    sourceUrl: EDGE_VOICE_DOCS_URL,
    recommended: voice.ShortName === EDGE_DEFAULT_VOICE_SHORTNAME || voice.ShortName === stripEdgeTTSVoiceId(EDGE_TTS_VOICE_ID),
    builtIn: false
  }
}

async function fetchEdgeVoices() {
  const tts = new MsEdgeTTS()
  try {
    const voices = await tts.getVoices() as EdgeRemoteVoice[]
    return voices.filter(voice => EDGE_CHINESE_LOCALE_RE.test(voice.Locale || '') || EDGE_CHINESE_LOCALE_RE.test(voice.ShortName || ''))
  } finally {
    tts.close()
  }
}

export async function listEdgeNeuralVoices() {
  if (cachedVoices && cachedVoices.expiresAt > Date.now()) {
    return cachedVoices.voices
  }

  const voices = await fetchEdgeVoices()
  const orderedVoices = [...voices].sort((left, right) => {
    const leftWeight = /zh-cn/i.test(left.Locale || '') ? 0 : /zh-hk|zh-tw/i.test(left.Locale || '') ? 1 : 2
    const rightWeight = /zh-cn/i.test(right.Locale || '') ? 0 : /zh-hk|zh-tw/i.test(right.Locale || '') ? 1 : 2
    return leftWeight - rightWeight || prettifyEdgeVoiceName(left).localeCompare(prettifyEdgeVoiceName(right), 'zh-Hans-CN')
  })

  cachedVoices = {
    expiresAt: Date.now() + 10 * 60_000,
    voices: orderedVoices
  }
  return orderedVoices
}

function formatRate(speed: number | undefined) {
  const clampedSpeed = Math.min(Math.max(Number.isFinite(speed) ? Number(speed) : 1, 0.7), 1.35)
  const percent = Math.round((clampedSpeed - 1) * 100)
  return `${percent >= 0 ? '+' : ''}${percent}%`
}

function formatPitch(pitchHz: number) {
  const rounded = Math.round(pitchHz)
  return `${rounded >= 0 ? '+' : ''}${rounded}Hz`
}

function formatVolume(volumePercent: number) {
  const rounded = Math.round(volumePercent)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

function resolveAutoEmotionStyle(text: string): Exclude<TTSEmotionStyle, 'auto' | 'neutral'> {
  const normalized = text.replace(/\s+/g, '')

  if (/抱歉|对不起|遗憾|别担心|没关系|辛苦了|理解你|我理解|安慰|难过|伤心|可惜/.test(normalized)) {
    return 'empathetic'
  }

  if (/注意|警告|风险|失败|错误|异常|必须|严禁|不要|不可|危险/.test(normalized)) {
    return 'serious'
  }

  if (/太好了|太棒了|恭喜|成功了|搞定了|完成了|欢迎|真不错|好耶/.test(normalized)) {
    return normalized.includes('！') ? 'excited' : 'cheerful'
  }

  if (/希望|期待|继续加油|会更好|马上就好/.test(normalized)) {
    return 'hopeful'
  }

  if (normalized.length > 90) {
    return 'narration-relaxed'
  }

  return 'assistant'
}

function resolveEmotionStyle(style: TTSEmotionStyle | undefined, text: string) {
  const normalizedStyle = normalizeTTSEmotionStyle(style)
  if (normalizedStyle === 'neutral') {
    return ''
  }

  if (normalizedStyle !== 'auto') {
    return normalizedStyle
  }

  return resolveAutoEmotionStyle(text)
}

function resolveEmotionProsody(style: ReturnType<typeof resolveEmotionStyle>, intensity: number) {
  const scaledIntensity = Math.min(Math.max(intensity, 0.6), 1.6)
  const scale = style ? scaledIntensity : 0

  switch (style) {
    case 'assistant':
      return { rateDelta: 0.02 * scale, pitchHz: 10 * scale, volumePercent: 2 * scale }
    case 'friendly':
      return { rateDelta: 0.04 * scale, pitchHz: 18 * scale, volumePercent: 4 * scale }
    case 'cheerful':
      return { rateDelta: 0.08 * scale, pitchHz: 26 * scale, volumePercent: 6 * scale }
    case 'excited':
      return { rateDelta: 0.12 * scale, pitchHz: 42 * scale, volumePercent: 8 * scale }
    case 'hopeful':
      return { rateDelta: 0.05 * scale, pitchHz: 20 * scale, volumePercent: 4 * scale }
    case 'empathetic':
      return { rateDelta: -0.06 * scale, pitchHz: -12 * scale, volumePercent: -2 * scale }
    case 'calm':
      return { rateDelta: -0.08 * scale, pitchHz: -8 * scale, volumePercent: -3 * scale }
    case 'narration-relaxed':
      return { rateDelta: -0.1 * scale, pitchHz: -4 * scale, volumePercent: -2 * scale }
    case 'narration-professional':
      return { rateDelta: -0.03 * scale, pitchHz: -2 * scale, volumePercent: 1 * scale }
    case 'serious':
      return { rateDelta: -0.05 * scale, pitchHz: -18 * scale, volumePercent: -1 * scale }
    case 'sad':
      return { rateDelta: -0.12 * scale, pitchHz: -24 * scale, volumePercent: -4 * scale }
    default:
      return { rateDelta: 0, pitchHz: 0, volumePercent: 0 }
  }
}

function stringifyUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function buildEdgeSSML(payload: TTSSynthesizePayload, voice: EdgeRemoteVoice) {
  const normalizedText = normalizeInputText(payload.text)
  const escapedText = escapeXml(normalizedText)
  const emotionStyle = resolveEmotionStyle(payload.emotionStyle, normalizedText)
  const emotionIntensity = clampTTSEmotionIntensity(payload.emotionIntensity)
  const prosody = resolveEmotionProsody(emotionStyle, emotionIntensity)
  const content = `<prosody rate="${formatRate((payload.speed ?? 1) + prosody.rateDelta)}" pitch="${formatPitch(prosody.pitchHz)}" volume="${formatVolume(prosody.volumePercent)}">${escapedText}</prosody>`

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voice.Locale || 'zh-CN'}"><voice name="${voice.ShortName}">${content}</voice></speak>`
}

function resolvePreferredVoice(voices: EdgeRemoteVoice[], requestedVoiceId: string | undefined) {
  const shortName = stripEdgeTTSVoiceId(requestedVoiceId) || EDGE_DEFAULT_VOICE_SHORTNAME
  return voices.find(voice => voice.ShortName === shortName)
    || voices.find(voice => voice.ShortName === EDGE_DEFAULT_VOICE_SHORTNAME)
    || voices[0]
}

export async function synthesizeEdgeSpeech(payload: TTSSynthesizePayload): Promise<TTSSynthesisResult> {
  const normalizedText = normalizeInputText(payload.text)
  if (!normalizedText) {
    return {
      success: false,
      engine: EDGE_TTS_ENGINE,
      modelId: EDGE_TTS_MODEL_ID,
      voiceId: payload.voiceId || EDGE_TTS_VOICE_ID,
      voiceName: 'Edge 神经语音',
      mimeType: EDGE_AUDIO_MIME_TYPE,
      error: '缺少要播报的文本'
    }
  }

  const tempDir = createTempDirectory()
  const tts = new MsEdgeTTS()

  try {
    const voices = await listEdgeNeuralVoices()
    const voice = resolvePreferredVoice(voices, payload.voiceId)
    if (!voice) {
      return {
        success: false,
        engine: EDGE_TTS_ENGINE,
        modelId: EDGE_TTS_MODEL_ID,
        voiceId: payload.voiceId || EDGE_TTS_VOICE_ID,
        voiceName: 'Edge 神经语音',
        mimeType: 'audio/mpeg',
        error: '当前没有可用的中文 Edge 神经音色'
      }
    }

    await tts.setMetadata(voice.ShortName, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, {
      voiceLocale: voice.Locale || 'zh-CN'
    })

    const { audioFilePath } = await tts.rawToFile(tempDir, buildEdgeSSML({ ...payload, text: normalizedText }, voice))
    const audioBuffer = readFileSync(audioFilePath)

    return {
      success: true,
      engine: EDGE_TTS_ENGINE,
      modelId: EDGE_TTS_MODEL_ID,
      voiceId: createEdgeTTSVoiceId(voice.ShortName),
      voiceName: prettifyEdgeVoiceName(voice),
      mimeType: EDGE_AUDIO_MIME_TYPE,
      audioBase64: audioBuffer.toString('base64'),
      sampleRate: EDGE_SAMPLE_RATE
    }
  } catch (error) {
    return {
      success: false,
      engine: EDGE_TTS_ENGINE,
      modelId: EDGE_TTS_MODEL_ID,
      voiceId: payload.voiceId || EDGE_TTS_VOICE_ID,
      voiceName: 'Edge 神经语音',
      mimeType: EDGE_AUDIO_MIME_TYPE,
      error: stringifyUnknownError(error) || 'Edge 神经语音合成失败'
    }
  } finally {
    tts.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function registerEdgeTTSHandlers() {
  if (edgeTTSHandlersRegistered) {
    return
  }

  edgeTTSHandlersRegistered = true

  ipcMain.handle('tts:listEdgeVoices', async () => {
    const voices = await listEdgeNeuralVoices()
    return voices.map(mapEdgeVoiceToLibraryItem)
  })

  ipcMain.handle('tts:synthesizeEdge', async (_event, payload: TTSSynthesizePayload) => {
    return synthesizeEdgeSpeech(payload)
  })
}
