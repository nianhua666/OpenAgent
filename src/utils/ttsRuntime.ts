import { KokoroTTS } from 'kokoro-js-zh'
import type { TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem } from '@/types'
import {
  AZURE_TTS_ENGINE,
  AZURE_TTS_MODEL_ID,
  AZURE_TTS_VOICE_ID,
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_TTS_VOICE_ID,
  DEFAULT_TTS_SAMPLE_TEXT,
  EDGE_TTS_ENGINE,
  EDGE_TTS_MODEL_ID,
  EDGE_TTS_VOICE_ID,
  SYSTEM_TTS_ENGINE,
  SYSTEM_TTS_MODEL_ID,
  SYSTEM_TTS_VOICE_ID,
  createSystemTTSVoiceId,
  getTTSVoiceOption,
  isAzureTTSEngine,
  isBuiltinTTSVoice,
  isBuiltinTTSModel,
  isEdgeTTSEngine,
  isSystemTTSVoiceId,
  isSystemTTSEngine,
  normalizeTTSEngine,
  normalizeTTSModelId
} from '@/utils/ttsCatalog'

type KokoroRuntime = {
  modelId: string
  device: 'webgpu' | 'wasm'
  dtype: 'fp32' | 'q8'
  instance: InstanceType<typeof KokoroTTS>
}

type KokoroRuntimePreference = {
  device: 'webgpu' | 'wasm'
  dtype: 'fp32' | 'q8'
}

type TTSAudioBlobResult = {
  audioBlob: Blob
  result: TTSSynthesisResult
}

const TTS_AUDIO_MIME_TYPE = 'audio/wav'
const TRANSFORMERS_CACHE_NAME = 'transformers-cache'
const KOKORO_VOICE_CACHE_NAME = 'kokoro-voices'
const DEFAULT_MODEL_REVISION = 'main'
const OPENAGENT_BUNDLED_RESOURCE_BASE = 'openagent://app/'
const runtimeCache = new Map<string, Promise<KokoroRuntime>>()
let currentSystemAudio: HTMLAudioElement | null = null
let currentSystemAudioUrl = ''

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

function resolvePreferredKokoroRuntimeOrder(): KokoroRuntimePreference[] {
  const navigatorLike = typeof navigator !== 'undefined'
    ? navigator as Navigator & { gpu?: unknown; ml?: unknown }
    : null

  if (navigatorLike?.gpu) {
    return [
      { device: 'webgpu', dtype: 'fp32' },
      { device: 'wasm', dtype: 'q8' }
    ]
  }

  return [{ device: 'wasm', dtype: 'q8' }]
}

function isBundledDesktopRuntime() {
  return typeof window !== 'undefined'
    && Boolean(window.electronAPI)
    && (window.location.protocol === 'file:' || window.location.protocol === 'openagent:')
}

function resolveLocalRuntimeAssetBase() {
  if (isBundledDesktopRuntime()) {
    return `${OPENAGENT_BUNDLED_RESOURCE_BASE}assets/`
  }

  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL('./assets/', window.location.href).href
  }

  return './assets/'
}

function resolveLocalModelBase() {
  return isBundledDesktopRuntime() ? `${OPENAGENT_BUNDLED_RESOURCE_BASE}models/` : './models/'
}

function resolveBundledVoiceAssetUrl(voiceId: string) {
  return `${OPENAGENT_BUNDLED_RESOURCE_BASE}voices/${voiceId}.bin`
}

function resolveVoiceAssetUrl(voiceId: string) {
  if (isBundledDesktopRuntime() && isBuiltinTTSVoice(voiceId)) {
    return resolveBundledVoiceAssetUrl(voiceId)
  }

  return `https://huggingface.co/${DEFAULT_TTS_MODEL_ID}/resolve/${DEFAULT_MODEL_REVISION}/voices/${voiceId}.bin`
}

function resolveModelConfigUrl(modelId: string) {
  return `https://huggingface.co/${modelId}/resolve/${DEFAULT_MODEL_REVISION}/config.json`
}

function canUseCacheStorage() {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined'
}

function stopCurrentSystemAudio() {
  if (!currentSystemAudio) {
    if (currentSystemAudioUrl) {
      URL.revokeObjectURL(currentSystemAudioUrl)
      currentSystemAudioUrl = ''
    }
    return
  }

  currentSystemAudio.pause()
  currentSystemAudio.src = ''
  currentSystemAudio.load()
  currentSystemAudio = null

  if (currentSystemAudioUrl) {
    URL.revokeObjectURL(currentSystemAudioUrl)
    currentSystemAudioUrl = ''
  }
}

function createObjectUrlFromBase64(base64: string, mimeType: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

function hasNativeSystemTTSBridge() {
  return typeof window !== 'undefined'
    && typeof window.electronAPI?.listSystemTTSVoices === 'function'
    && typeof window.electronAPI?.synthesizeSystemTTS === 'function'
}

function hasNativeAzureTTSBridge() {
  return typeof window !== 'undefined'
    && typeof window.electronAPI?.listAzureTTSVoices === 'function'
    && typeof window.electronAPI?.synthesizeAzureTTS === 'function'
}

function hasNativeEdgeTTSBridge() {
  return typeof window !== 'undefined'
    && typeof window.electronAPI?.listEdgeTTSVoices === 'function'
    && typeof window.electronAPI?.synthesizeEdgeTTS === 'function'
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
    const runtimePreferences = resolvePreferredKokoroRuntimeOrder()
    let lastError: unknown = null

    for (let index = 0; index < runtimePreferences.length; index += 1) {
      const runtimePreference = runtimePreferences[index]

      emitTTSRuntimeProgress({
        status: 'loading-model',
        modelId: normalizedModelId,
        device: runtimePreference.device,
        dtype: runtimePreference.dtype
      })

      try {
        const instance = await KokoroTTS.from_pretrained(normalizedModelId, {
          dtype: runtimePreference.dtype,
          device: runtimePreference.device,
          progress_callback: (progress: unknown) => {
            emitTTSRuntimeProgress({
              status: 'progress',
              modelId: normalizedModelId,
              device: runtimePreference.device,
              dtype: runtimePreference.dtype,
              progress
            })
          },
          envConfig: {
            allowLocalModels: true,
            allowRemoteModels: true,
            localModelPath: resolveLocalModelBase(),
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
          device: runtimePreference.device,
          dtype: runtimePreference.dtype,
          voiceCount: Object.keys(instance.voices || {}).length
        })

        return {
          modelId: normalizedModelId,
          device: runtimePreference.device,
          dtype: runtimePreference.dtype,
          instance
        }
      } catch (error) {
        lastError = error

        if (index < runtimePreferences.length - 1) {
          emitTTSRuntimeProgress({
            status: 'device-fallback',
            modelId: normalizedModelId,
            device: runtimePreference.device,
            dtype: runtimePreference.dtype,
            nextDevice: runtimePreferences[index + 1].device,
            nextDtype: runtimePreferences[index + 1].dtype,
            error: error instanceof Error ? error.message : '当前设备不可用，正在切换后备推理后端'
          })
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('语音模型初始化失败')
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

  if (isBuiltinTTSVoice(normalizedVoiceId) && isBundledDesktopRuntime()) {
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
  return hasNativeSystemTTSBridge() || Boolean(getSpeechSynthesisInstance())
}

export function isAzureSpeechSupported() {
  return hasNativeAzureTTSBridge()
}

export function isEdgeSpeechSupported() {
  return hasNativeEdgeTTSBridge()
}

export async function listAzureSpeechVoices() {
  if (!hasNativeAzureTTSBridge()) {
    return []
  }

  const remoteVoices = await window.electronAPI.listAzureTTSVoices()
  const orderedVoices = [...remoteVoices].sort((left, right) => {
    const leftWeight = /zh-cn/i.test(left.locale) ? 0 : /zh/i.test(left.locale) ? 1 : 2
    const rightWeight = /zh-cn/i.test(right.locale) ? 0 : /zh/i.test(right.locale) ? 1 : 2
    return leftWeight - rightWeight || left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

  const defaultVoice = getTTSVoiceOption(AZURE_TTS_VOICE_ID, AZURE_TTS_MODEL_ID, AZURE_TTS_ENGINE)
  return [defaultVoice, ...orderedVoices.filter(voice => voice.id !== defaultVoice.id)]
}

export async function listEdgeSpeechVoices() {
  if (!hasNativeEdgeTTSBridge()) {
    return []
  }

  const remoteVoices = await window.electronAPI.listEdgeTTSVoices()
  const orderedVoices = [...remoteVoices].sort((left, right) => {
    const leftWeight = /zh-cn/i.test(left.locale) ? 0 : /zh/i.test(left.locale) ? 1 : 2
    const rightWeight = /zh-cn/i.test(right.locale) ? 0 : /zh/i.test(right.locale) ? 1 : 2
    return leftWeight - rightWeight || left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

  const defaultVoice = getTTSVoiceOption(EDGE_TTS_VOICE_ID, EDGE_TTS_MODEL_ID, EDGE_TTS_ENGINE)
  return [defaultVoice, ...orderedVoices.filter(voice => voice.id !== defaultVoice.id)]
}

export async function listSystemSpeechVoices() {
  if (hasNativeSystemTTSBridge()) {
    const nativeVoices = await window.electronAPI.listSystemTTSVoices()
    const orderedVoices = [...nativeVoices].sort((left, right) => {
      const leftWeight = /zh/i.test(left.locale) ? 0 : 1
      const rightWeight = /zh/i.test(right.locale) ? 0 : 1
      return leftWeight - rightWeight || left.name.localeCompare(right.name)
    })

    const defaultVoice = getTTSVoiceOption(SYSTEM_TTS_VOICE_ID, SYSTEM_TTS_MODEL_ID, SYSTEM_TTS_ENGINE)
    return [defaultVoice, ...orderedVoices.filter(voice => voice.id !== defaultVoice.id)]
  }

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
  stopCurrentSystemAudio()

  const synthesis = getSpeechSynthesisInstance()
  if (!synthesis) {
    return
  }

  if (synthesis.speaking || synthesis.pending) {
    synthesis.cancel()
  }
}

export async function playAzureSpeech(payload: TTSSynthesizePayload, volume = 1): Promise<TTSSynthesisResult> {
  if (!hasNativeAzureTTSBridge()) {
    throw new Error('当前环境暂不支持 Azure 情绪语音播报')
  }

  const normalizedText = normalizeTTSInputText(payload.text)
  if (!normalizedText) {
    throw new Error('缺少要播报的文本')
  }

  emitTTSRuntimeProgress({
    status: 'generating',
    engine: AZURE_TTS_ENGINE,
    voiceId: payload.voiceId,
    textLength: normalizedText.length,
    emotionStyle: payload.emotionStyle,
    emotionIntensity: payload.emotionIntensity
  })

  stopSystemSpeechPlayback()
  const result = await window.electronAPI.synthesizeAzureTTS({
    ...payload,
    text: normalizedText,
    engine: AZURE_TTS_ENGINE,
    modelId: AZURE_TTS_MODEL_ID
  })

  if (!result.success || !result.audioBase64) {
    const message = result.error || 'Azure 情绪语音播放失败'
    emitTTSRuntimeProgress({
      status: 'failed',
      engine: AZURE_TTS_ENGINE,
      error: message
    })
    throw new Error(message)
  }

  currentSystemAudioUrl = createObjectUrlFromBase64(result.audioBase64, result.mimeType || 'audio/mpeg')
  const audio = new Audio(currentSystemAudioUrl)
  audio.volume = clampNumber(volume, 0, 1, 1)
  currentSystemAudio = audio

  audio.addEventListener('ended', () => {
    if (currentSystemAudio === audio) {
      stopCurrentSystemAudio()
    }
  }, { once: true })

  audio.addEventListener('error', () => {
    if (currentSystemAudio === audio) {
      stopCurrentSystemAudio()
    }
  }, { once: true })

  await audio.play()
  emitTTSRuntimeProgress({
    status: 'generated',
    engine: AZURE_TTS_ENGINE,
    voiceId: result.voiceId,
    durationMs: result.durationMs
  })
  return result
}

export async function playEdgeSpeech(payload: TTSSynthesizePayload, volume = 1): Promise<TTSSynthesisResult> {
  if (!hasNativeEdgeTTSBridge()) {
    throw new Error('当前环境暂不支持 Edge 神经语音播报')
  }

  const normalizedText = normalizeTTSInputText(payload.text)
  if (!normalizedText) {
    throw new Error('缺少要播报的文本')
  }

  emitTTSRuntimeProgress({
    status: 'generating',
    engine: EDGE_TTS_ENGINE,
    voiceId: payload.voiceId,
    textLength: normalizedText.length,
    emotionStyle: payload.emotionStyle,
    emotionIntensity: payload.emotionIntensity
  })

  stopSystemSpeechPlayback()
  const result = await window.electronAPI.synthesizeEdgeTTS({
    ...payload,
    text: normalizedText,
    engine: EDGE_TTS_ENGINE,
    modelId: EDGE_TTS_MODEL_ID
  })

  if (!result.success || !result.audioBase64) {
    const message = result.error || 'Edge 神经语音播放失败'
    emitTTSRuntimeProgress({
      status: 'failed',
      engine: EDGE_TTS_ENGINE,
      error: message
    })
    throw new Error(message)
  }

  currentSystemAudioUrl = createObjectUrlFromBase64(result.audioBase64, result.mimeType || 'audio/mpeg')
  const audio = new Audio(currentSystemAudioUrl)
  audio.volume = clampNumber(volume, 0, 1, 1)
  currentSystemAudio = audio

  audio.addEventListener('ended', () => {
    if (currentSystemAudio === audio) {
      stopCurrentSystemAudio()
    }
  }, { once: true })

  audio.addEventListener('error', () => {
    if (currentSystemAudio === audio) {
      stopCurrentSystemAudio()
    }
  }, { once: true })

  await audio.play()
  emitTTSRuntimeProgress({
    status: 'generated',
    engine: EDGE_TTS_ENGINE,
    voiceId: result.voiceId,
    durationMs: result.durationMs
  })
  return result
}

export async function playSystemSpeech(payload: TTSSynthesizePayload, volume = 1): Promise<TTSSynthesisResult> {
  if (hasNativeSystemTTSBridge()) {
    const normalizedText = normalizeTTSInputText(payload.text)
    if (!normalizedText) {
      throw new Error('缺少要播报的文本')
    }

    emitTTSRuntimeProgress({
      status: 'generating',
      engine: SYSTEM_TTS_ENGINE,
      voiceId: payload.voiceId,
      textLength: normalizedText.length
    })

    stopSystemSpeechPlayback()
    const result = await window.electronAPI.synthesizeSystemTTS({
      ...payload,
      text: normalizedText,
      engine: SYSTEM_TTS_ENGINE,
      modelId: SYSTEM_TTS_MODEL_ID
    })

    if (!result.success || !result.audioBase64) {
      const message = result.error || '系统语音播放失败'
      emitTTSRuntimeProgress({
        status: 'failed',
        engine: SYSTEM_TTS_ENGINE,
        error: message
      })
      throw new Error(message)
    }

    currentSystemAudioUrl = createObjectUrlFromBase64(result.audioBase64, result.mimeType || TTS_AUDIO_MIME_TYPE)
    const audio = new Audio(currentSystemAudioUrl)
    audio.volume = clampNumber(volume, 0, 1, 1)
    currentSystemAudio = audio

    audio.addEventListener('ended', () => {
      if (currentSystemAudio === audio) {
        stopCurrentSystemAudio()
      }
    }, { once: true })

    audio.addEventListener('error', () => {
      if (currentSystemAudio === audio) {
        stopCurrentSystemAudio()
      }
    }, { once: true })

    await audio.play()
    emitTTSRuntimeProgress({
      status: 'generated',
      engine: SYSTEM_TTS_ENGINE,
      voiceId: result.voiceId,
      durationMs: result.durationMs
    })
    return result
  }

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
  if (synthesis.paused) {
    synthesis.resume()
  }

  return new Promise<TTSSynthesisResult>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(normalizedText)
    let settled = false
    utterance.voice = selectedVoice || null
    utterance.lang = selectedVoice?.lang || 'zh-CN'
    utterance.rate = clampNumber(payload.speed, 0.7, 1.35, 1)
    utterance.pitch = 1
    utterance.volume = clampNumber(volume, 0, 1, 1)

    const startupTimeoutId = window.setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      synthesis.cancel()
      const message = '系统语音未能启动播放，请检查当前 Windows 语音组件或改用其他音色。'
      emitTTSRuntimeProgress({
        status: 'failed',
        engine: SYSTEM_TTS_ENGINE,
        error: message
      })
      reject(new Error(message))
    }, 4000)

    const clearStartupTimeout = () => {
      window.clearTimeout(startupTimeoutId)
    }

    utterance.onstart = () => {
      clearStartupTimeout()
    }

    utterance.onend = (event) => {
      if (settled) {
        return
      }

      settled = true
      clearStartupTimeout()
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
      if (settled) {
        return
      }

      settled = true
      clearStartupTimeout()
      const message = event.error || '系统语音播放失败'
      emitTTSRuntimeProgress({
        status: 'failed',
        engine: SYSTEM_TTS_ENGINE,
        error: message
      })
      reject(new Error(message))
    }

    window.setTimeout(() => {
      if (settled) {
        return
      }

      try {
        synthesis.speak(utterance)
      } catch (error) {
        if (settled) {
          return
        }

        settled = true
        clearStartupTimeout()
        reject(error instanceof Error ? error : new Error('系统语音播放失败'))
      }
    }, 0)
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

  if (isSystemTTSEngine(engine)) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id,
      text: normalizedText
    }, voiceOption.name, '系统语音引擎不输出离线音频文件，请直接调用播放接口')
  }

  if (isAzureTTSEngine(engine)) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id,
      text: normalizedText
    }, voiceOption.name, 'Azure 情绪语音通过主进程直接播放，请调用实时播放接口')
  }

  if (isEdgeTTSEngine(engine)) {
    return buildErrorResult({
      ...payload,
      engine,
      modelId,
      voiceId: voiceOption.id,
      text: normalizedText
    }, voiceOption.name, 'Edge 神经语音引擎通过主进程直接播放，请调用实时播放接口')
  }

  try {
    const runtime = await getKokoroRuntime(modelId)
    const availableVoices = runtime.instance.voices
    const resolvedVoiceId = ((voiceOption.id in availableVoices ? voiceOption.id : DEFAULT_TTS_VOICE_ID) as keyof typeof availableVoices)
    const speed = clampNumber(payload.speed, 0.7, 1.35, 1)

    if (isBundledDesktopRuntime() && isBuiltinTTSVoice(String(resolvedVoiceId))) {
      await cacheTTSVoice(String(resolvedVoiceId))
    }

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