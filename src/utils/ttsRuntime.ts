import { KokoroTTS } from 'kokoro-js-zh'
import type { TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem } from '@/types'
import {
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_TTS_VOICE_ID,
  DEFAULT_TTS_SAMPLE_TEXT,
  SYSTEM_TTS_ENGINE,
  SYSTEM_TTS_MODEL_ID,
  SYSTEM_TTS_VOICE_ID,
  createSystemTTSVoiceId,
  getTTSVoiceOption,
  isBuiltinTTSModel,
  isSystemTTSVoiceId,
  normalizeTTSEngine,
  normalizeTTSModelId
} from '@/utils/ttsCatalog'

type KokoroRuntime = {
  modelId: string
  instance: InstanceType<typeof KokoroTTS>
}

type TTSAudioBlobResult = {
  audioBlob: Blob
  result: TTSSynthesisResult
}

const TTS_AUDIO_MIME_TYPE = 'audio/wav'
const TRANSFORMERS_CACHE_NAME = 'transformers-cache'
const KOKORO_VOICE_CACHE_NAME = 'kokoro-voices'
const DEFAULT_MODEL_REVISION = 'main'
const runtimeCache = new Map<string, Promise<KokoroRuntime>>()

function emitTTSRuntimeProgress(detail: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new CustomEvent('openagent:tts-progress', { detail }))
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Number(value), min), max)
}

function normalizeModelId(modelId: string | undefined) {
  return normalizeTTSModelId(modelId)
}

function normalizeTTSInputText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/\r?\n+/g, '。')
    .replace(/[|/\\]+/g, '，')
    .replace(/[_~]+/g, ' ')
    .replace(/([。！？；，,.!?]){2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSpeechSynthesisInstance() {
  if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    return null
  }

  return window.speechSynthesis
}

function resolvePreferredKokoroDevice() {
  const navigatorLike = typeof navigator !== 'undefined'
    ? navigator as Navigator & { gpu?: unknown; ml?: unknown }
    : null

  if (navigatorLike?.gpu) {
    return 'webgpu'
  }

  return 'wasm'
}

function resolveLocalRuntimeAssetBase() {
  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL('./assets/', window.location.href).href
  }

  return './assets/'
}

function resolveVoiceAssetUrl(voiceId: string) {
  return `https://huggingface.co/${DEFAULT_TTS_MODEL_ID}/resolve/${DEFAULT_MODEL_REVISION}/voices/${voiceId}.bin`
}

function resolveModelConfigUrl(modelId: string) {
  return `https://huggingface.co/${modelId}/resolve/${DEFAULT_MODEL_REVISION}/config.json`
}

function canUseCacheStorage() {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined'
}

async function openCache(name: string) {
  if (!canUseCacheStorage()) {
    return null
  }

  try {
    return await window.caches.open(name)
  } catch {
    return null
  }
}

async function loadSystemSpeechVoices() {
  const synthesis = getSpeechSynthesisInstance()
  if (!synthesis) {
    return []
  }

  const existingVoices = synthesis.getVoices()
  if (existingVoices.length > 0) {
    return existingVoices
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const handleVoicesChanged = () => {
      const nextVoices = synthesis.getVoices()
      if (nextVoices.length > 0) {
        cleanup()
        resolve(nextVoices)
      }
    }

    const cleanup = () => {
      synthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      resolve(synthesis.getVoices())
    }, 1200)

    synthesis.addEventListener('voiceschanged', handleVoicesChanged)
  })
}

function inferSystemVoiceGender(name: string): 'female' | 'male' {
  return /(female|xiaoxiao|xiaoyi|xiaoni|xiaobei|huihui|tingting|yaoyao|zhiyu|女)/i.test(name) ? 'female' : 'male'
}

function inferSystemVoiceAccent(lang: string) {
  if (/zh-cn/i.test(lang)) {
    return '普通话'
  }

  if (/zh-tw/i.test(lang)) {
    return '繁中 / 台湾'
  }

  if (/zh-hk/i.test(lang)) {
    return '粤语 / 香港'
  }

  return lang || '系统语音'
}

function mapSystemSpeechVoice(voice: SpeechSynthesisVoice): TTSVoiceLibraryItem {
  return {
    id: createSystemTTSVoiceId(voice.voiceURI || voice.name),
    engine: SYSTEM_TTS_ENGINE,
    modelId: SYSTEM_TTS_MODEL_ID,
    name: voice.name,
    locale: voice.lang || 'zh-CN',
    gender: inferSystemVoiceGender(voice.name),
    accent: inferSystemVoiceAccent(voice.lang || ''),
    description: `系统语音${voice.default ? '，当前默认音色' : ''}`,
    sampleText: DEFAULT_TTS_SAMPLE_TEXT,
    sourceLabel: '系统语音 / SpeechSynthesis',
    sourceUrl: 'system://speech-synthesis',
    recommended: /zh/i.test(voice.lang || '')
  }
}

function selectBestSystemSpeechVoice(voices: SpeechSynthesisVoice[], voiceId?: string) {
  if (voices.length === 0) {
    return null
  }

  if (isSystemTTSVoiceId(voiceId)) {
    const normalizedVoiceId = (voiceId || '').replace(/^system:/, '')
    const requestedVoice = voices.find(voice => voice.voiceURI === normalizedVoiceId || voice.name === normalizedVoiceId)
    if (requestedVoice) {
      return requestedVoice
    }
  }

  return voices.find(voice => /zh-cn/i.test(voice.lang))
    || voices.find(voice => /zh/i.test(voice.lang))
    || voices.find(voice => voice.default)
    || voices[0]
}

async function getKokoroRuntime(modelId: string) {
  const normalizedModelId = normalizeModelId(modelId)
  const cachedRuntime = runtimeCache.get(normalizedModelId)
  if (cachedRuntime) {
    return cachedRuntime
  }

  const runtimePromise = (async () => {
    const preferredDevice = resolvePreferredKokoroDevice()

    emitTTSRuntimeProgress({
      status: 'loading-model',
      modelId: normalizedModelId,
      device: preferredDevice
    })

    const instance = await KokoroTTS.from_pretrained(normalizedModelId, {
      dtype: 'q8',
      device: preferredDevice,
      progress_callback: (progress: unknown) => {
        emitTTSRuntimeProgress({
          status: 'progress',
          modelId: normalizedModelId,
          progress
        })
      },
      envConfig: {
        allowLocalModels: true,
        allowRemoteModels: true,
        localModelPath: './models/',
        wasmPaths: resolveLocalRuntimeAssetBase(),
        useFS: false,
        useFSCache: false,
        useBrowserCache: true,
        useCustomCache: false
      }
    })

    emitTTSRuntimeProgress({
      status: 'model-ready',
      modelId: normalizedModelId,
      device: preferredDevice,
      voiceCount: Object.keys(instance.voices || {}).length
    })

    return {
      modelId: normalizedModelId,
      instance
    }
  })().catch((error) => {
    emitTTSRuntimeProgress({
      status: 'failed',
      modelId: normalizedModelId,
      error: error instanceof Error ? error.message : '语音模型初始化失败'
    })
    runtimeCache.delete(normalizedModelId)
    throw error
  })

  runtimeCache.set(normalizedModelId, runtimePromise)
  return runtimePromise
}

function buildErrorResult(payload: TTSSynthesizePayload, voiceName: string, error: unknown): TTSAudioBlobResult {
  return {
    audioBlob: new Blob([], { type: TTS_AUDIO_MIME_TYPE }),
    result: {
      success: false,
      engine: normalizeTTSEngine(payload.engine || DEFAULT_TTS_ENGINE),
      modelId: normalizeModelId(payload.modelId),
      voiceId: payload.voiceId || DEFAULT_TTS_VOICE_ID,
      voiceName,
      mimeType: TTS_AUDIO_MIME_TYPE,
      error: error instanceof Error ? error.message : '语音合成失败'
    }
  }
}

export async function isTTSModelCached(modelId: string) {
  const normalizedModelId = normalizeModelId(modelId)
  if (normalizedModelId === SYSTEM_TTS_MODEL_ID || isBuiltinTTSModel(normalizedModelId)) {
    return true
  }

  const cache = await openCache(TRANSFORMERS_CACHE_NAME)
  if (!cache) {
    return false
  }

  const matched = await cache.match(resolveModelConfigUrl(normalizedModelId))
  return Boolean(matched)
}

export async function isTTSVoiceCached(voiceId: string) {
  const normalizedVoiceId = voiceId.trim()
  if (!normalizedVoiceId) {
    return false
  }

  if (isSystemTTSVoiceId(normalizedVoiceId)) {
    return true
  }

  const cache = await openCache(KOKORO_VOICE_CACHE_NAME)
  if (!cache) {
    return false
  }

  const matched = await cache.match(normalizedVoiceId)
  return Boolean(matched)
}

export async function cacheTTSModel(modelId: string) {
  if (normalizeModelId(modelId) === SYSTEM_TTS_MODEL_ID) {
    return true
  }

  await getKokoroRuntime(modelId)
  return true
}

export async function cacheTTSVoice(voiceId: string) {
  const normalizedVoiceId = voiceId.trim()
  if (!normalizedVoiceId) {
    throw new Error('缺少要缓存的音色 ID')
  }

  if (isSystemTTSVoiceId(normalizedVoiceId)) {
    return true
  }

  const cache = await openCache(KOKORO_VOICE_CACHE_NAME)
  if (!cache) {
    throw new Error('当前环境不支持持久语音缓存')
  }

  const existing = await cache.match(normalizedVoiceId)
  if (existing) {
    return true
  }

  const response = await fetch(resolveVoiceAssetUrl(normalizedVoiceId))
  if (!response.ok) {
    throw new Error(`远程音色下载失败：${response.status}`)
  }

  await cache.put(normalizedVoiceId, response.clone())
  emitTTSRuntimeProgress({
    status: 'voice-cached',
    voiceId: normalizedVoiceId
  })
  return true
}

export function clearTTSRuntimeCache(modelId?: string) {
  const normalizedModelId = modelId ? normalizeModelId(modelId) : ''
  if (normalizedModelId) {
    runtimeCache.delete(normalizedModelId)
    return
  }

  runtimeCache.clear()
}

export function isSystemSpeechSupported() {
  return Boolean(getSpeechSynthesisInstance())
}

export async function listSystemSpeechVoices() {
  const voices = await loadSystemSpeechVoices()
  const orderedVoices = [...voices].sort((left, right) => {
    const leftWeight = /zh/i.test(left.lang) ? 0 : 1
    const rightWeight = /zh/i.test(right.lang) ? 0 : 1
    return leftWeight - rightWeight || left.name.localeCompare(right.name)
  })

  const defaultVoice = getTTSVoiceOption(SYSTEM_TTS_VOICE_ID, SYSTEM_TTS_MODEL_ID, SYSTEM_TTS_ENGINE)
  const dynamicVoices = orderedVoices.map(mapSystemSpeechVoice)

  return [defaultVoice, ...dynamicVoices.filter(voice => voice.id !== defaultVoice.id)]
}

export function stopSystemSpeechPlayback() {
  const synthesis = getSpeechSynthesisInstance()
  if (!synthesis) {
    return
  }

  if (synthesis.speaking || synthesis.pending) {
    synthesis.cancel()
  }
}

export async function playSystemSpeech(payload: TTSSynthesizePayload, volume = 1): Promise<TTSSynthesisResult> {
  const synthesis = getSpeechSynthesisInstance()
  if (!synthesis) {
    throw new Error('当前环境不支持系统语音播报')
  }

  const normalizedText = normalizeTTSInputText(payload.text)
  if (!normalizedText) {
    throw new Error('缺少要播报的文本')
  }

  const voices = await loadSystemSpeechVoices()
  const selectedVoice = selectBestSystemSpeechVoice(voices, payload.voiceId)
  const resolvedVoiceId = selectedVoice ? createSystemTTSVoiceId(selectedVoice.voiceURI || selectedVoice.name) : SYSTEM_TTS_VOICE_ID
  const resolvedVoice = getTTSVoiceOption(resolvedVoiceId, SYSTEM_TTS_MODEL_ID, SYSTEM_TTS_ENGINE)

  emitTTSRuntimeProgress({
    status: 'generating',
    engine: SYSTEM_TTS_ENGINE,
    voiceId: resolvedVoiceId,
    textLength: normalizedText.length
  })

  stopSystemSpeechPlayback()

  return new Promise<TTSSynthesisResult>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(normalizedText)
    utterance.voice = selectedVoice || null
    utterance.lang = selectedVoice?.lang || 'zh-CN'
    utterance.rate = clampNumber(payload.speed, 0.7, 1.35, 1)
    utterance.volume = clampNumber(volume, 0, 1, 1)

    utterance.onend = (event) => {
      emitTTSRuntimeProgress({
        status: 'generated',
        engine: SYSTEM_TTS_ENGINE,
        voiceId: resolvedVoiceId,
        durationMs: Math.round((event.elapsedTime || 0) * 1000)
      })
      resolve({
        success: true,
        engine: SYSTEM_TTS_ENGINE,
        modelId: SYSTEM_TTS_MODEL_ID,
        voiceId: resolvedVoiceId,
        voiceName: resolvedVoice.name,
        mimeType: 'audio/system',
        durationMs: Math.round((event.elapsedTime || 0) * 1000)
      })
    }

    utterance.onerror = (event) => {
      const message = event.error || '系统语音播放失败'
      emitTTSRuntimeProgress({
        status: 'failed',
        engine: SYSTEM_TTS_ENGINE,
        error: message
      })
      reject(new Error(message))
    }

    synthesis.speak(utterance)
  })
}

export async function synthesizeTextToSpeech(payload: TTSSynthesizePayload): Promise<TTSAudioBlobResult> {
  const engine = normalizeTTSEngine(payload.engine || DEFAULT_TTS_ENGINE)
  const modelId = normalizeTTSModelId(payload.modelId, engine)
  const voiceOption = getTTSVoiceOption(payload.voiceId || DEFAULT_TTS_VOICE_ID, modelId, engine)
  const normalizedText = normalizeTTSInputText(payload.text)

  if (!normalizedText) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id,
      text: normalizedText
    }, voiceOption.name, '缺少要合成的文本')
  }

  if (engine === SYSTEM_TTS_ENGINE) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id,
      text: normalizedText
    }, voiceOption.name, '系统语音引擎不输出离线音频文件，请直接调用播放接口')
  }

  try {
    const runtime = await getKokoroRuntime(modelId)
    const availableVoices = runtime.instance.voices
    const resolvedVoiceId = ((voiceOption.id in availableVoices ? voiceOption.id : DEFAULT_TTS_VOICE_ID) as keyof typeof availableVoices)
    const speed = clampNumber(payload.speed, 0.7, 1.35, 1)

    emitTTSRuntimeProgress({
      status: 'generating',
      engine,
      modelId,
      voiceId: String(resolvedVoiceId),
      textLength: normalizedText.length,
      speed
    })

    const audio = await runtime.instance.generate(normalizedText, {
      voice: resolvedVoiceId,
      speed
    })

    const durationMs = Math.round((audio.audio.length / audio.sampling_rate) * 1000)

    emitTTSRuntimeProgress({
      status: 'generated',
      engine,
      modelId,
      voiceId: String(resolvedVoiceId),
      durationMs,
      sampleRate: audio.sampling_rate
    })

    return {
      audioBlob: audio.toBlob(),
      result: {
        success: true,
        engine,
        modelId,
        voiceId: String(resolvedVoiceId),
        voiceName: voiceOption.name,
        mimeType: TTS_AUDIO_MIME_TYPE,
        durationMs,
        sampleRate: audio.sampling_rate
      }
    }
  } catch (error) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id
    }, voiceOption.name, error)
  }
}