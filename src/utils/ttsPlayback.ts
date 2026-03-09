import type { AppSettings, TTSSynthesizePayload, TTSSynthesisResult } from '@/types'
import { isSystemTTSEngine } from '@/utils/ttsCatalog'
import { playSystemSpeech, stopSystemSpeechPlayback, synthesizeTextToSpeech } from '@/utils/ttsRuntime'

let currentAudio: HTMLAudioElement | null = null
let currentAudioUrl = ''

function stopCurrentAudio() {
  if (!currentAudio) {
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl)
      currentAudioUrl = ''
    }
    return
  }

  currentAudio.pause()
  currentAudio.src = ''
  currentAudio.load()
  currentAudio = null

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = ''
  }
}

export function stopTTSPlayback() {
  stopCurrentAudio()
  stopSystemSpeechPlayback()
}

export function extractSpeakableText(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[>#*_~-]+/g, ' ')
    .replace(/\r?\n+/g, '。')
    .replace(/[|/\\]+/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createTTSPayload(settings: AppSettings, text: string, overrides: Partial<TTSSynthesizePayload> = {}): TTSSynthesizePayload {
  return {
    text,
    engine: overrides.engine || settings.ttsEngine,
    modelId: overrides.modelId || settings.ttsModelId,
    voiceId: overrides.voiceId || settings.ttsVoiceId,
    speed: overrides.speed ?? settings.ttsSpeed
  }
}

export async function playTextToSpeech(settings: AppSettings, text: string, overrides: Partial<TTSSynthesizePayload> = {}) {
  const speakableText = extractSpeakableText(text)
  if (!speakableText) {
    throw new Error('当前消息没有可播报的文本')
  }

  const payload = createTTSPayload(settings, speakableText, overrides)
  if (isSystemTTSEngine(payload.engine)) {
    stopCurrentAudio()
    return playSystemSpeech(payload, settings.ttsVolume)
  }

  const { audioBlob, result } = await synthesizeTextToSpeech(payload)
  if (!result.success || !audioBlob.size) {
    throw new Error(result.error || '语音合成失败')
  }

  stopCurrentAudio()
  currentAudioUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(currentAudioUrl)
  audio.volume = settings.ttsVolume
  currentAudio = audio

  audio.addEventListener('ended', () => {
    if (currentAudio === audio) {
      currentAudio = null
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl)
        currentAudioUrl = ''
      }
    }
  }, { once: true })

  audio.addEventListener('error', () => {
    if (currentAudio === audio) {
      currentAudio = null
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl)
        currentAudioUrl = ''
      }
    }
  }, { once: true })

  await audio.play()
  return result
}

export type TTSPlaybackResult = TTSSynthesisResult