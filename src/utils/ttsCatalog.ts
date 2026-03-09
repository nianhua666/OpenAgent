import type { TTSEngine, TTSModelLibraryItem, TTSVoiceLibraryItem } from '@/types'

export const KOKORO_TTS_ENGINE: TTSEngine = 'kokoro-js-zh'
export const SYSTEM_TTS_ENGINE: TTSEngine = 'system-speech'
export const DEFAULT_TTS_ENGINE: TTSEngine = KOKORO_TTS_ENGINE
export const DEFAULT_TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
export const DEFAULT_TTS_VOICE_ID = 'zf_xiaobei'
export const SYSTEM_TTS_MODEL_ID = 'system:default'
export const SYSTEM_TTS_VOICE_ID = 'system:auto'
export const DEFAULT_TTS_SAMPLE_TEXT = '你好，我是 OpenAgent 的 Live2D 语音助手。'

export const TTS_ENGINE_OPTIONS: Array<{ value: TTSEngine; label: string; description: string }> = [
  {
    value: KOKORO_TTS_ENGINE,
    label: 'Kokoro 离线引擎',
    description: '本地模型推理，支持离线缓存、自定义模型和更多开源音色。'
  },
  {
    value: SYSTEM_TTS_ENGINE,
    label: '系统语音引擎',
    description: '直接调用 Windows / Chromium 系统语音，启动更快，更适合实时播报。'
  }
]

const LEGACY_TTS_MODEL_ID_MAP: Record<string, string> = {
  'kokoro-zh-default': DEFAULT_TTS_MODEL_ID
}

const BUILTIN_TTS_MODEL_IDS = new Set<string>([DEFAULT_TTS_MODEL_ID])
const BUILTIN_TTS_VOICE_IDS = new Set<string>([
  'zf_xiaobei',
  'zf_xiaoni',
  'zf_xiaoxiao',
  'zf_xiaoyi',
  'zm_yunjian',
  'zm_yunxi'
])

function createVoice(
  id: string,
  name: string,
  locale: string,
  gender: 'female' | 'male',
  accent: string,
  description: string,
  sampleText: string,
  options: Partial<Pick<TTSVoiceLibraryItem, 'recommended' | 'builtIn' | 'modelId'>> = {}
): TTSVoiceLibraryItem {
  return {
    id,
    engine: KOKORO_TTS_ENGINE,
    modelId: options.modelId || DEFAULT_TTS_MODEL_ID,
    name,
    locale,
    gender,
    accent,
    description,
    sampleText,
    sourceLabel: 'kokoro-js-zh / Hugging Face',
    sourceUrl: `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/blob/main/voices/${id}.bin`,
    recommended: options.recommended,
    builtIn: options.builtIn
  }
}

function createSystemFallbackVoice(id: string, name: string, locale = 'zh-CN', accent = '系统语音'): TTSVoiceLibraryItem {
  return {
    id,
    engine: SYSTEM_TTS_ENGINE,
    modelId: SYSTEM_TTS_MODEL_ID,
    name,
    locale,
    gender: 'female',
    accent,
    description: '直接调用系统语音，延迟更低，适合实时播报与较长文本朗读。',
    sampleText: DEFAULT_TTS_SAMPLE_TEXT,
    sourceLabel: '系统语音 / SpeechSynthesis',
    sourceUrl: 'system://speech-synthesis',
    recommended: id === SYSTEM_TTS_VOICE_ID,
    builtIn: true
  }
}

export function normalizeTTSEngine(engine?: string | null): TTSEngine {
  return engine === SYSTEM_TTS_ENGINE ? SYSTEM_TTS_ENGINE : DEFAULT_TTS_ENGINE
}

export function isSystemTTSEngine(engine?: string | null) {
  return normalizeTTSEngine(engine) === SYSTEM_TTS_ENGINE
}

export function createSystemTTSVoiceId(rawVoiceId: string) {
  const normalized = rawVoiceId.trim()
  return normalized ? `system:${normalized}` : SYSTEM_TTS_VOICE_ID
}

export function isSystemTTSVoiceId(voiceId?: string | null) {
  return typeof voiceId === 'string' && voiceId.startsWith('system:')
}

export function stripSystemTTSVoiceId(voiceId?: string | null) {
  if (!voiceId) {
    return ''
  }

  return voiceId.replace(/^system:/, '').trim()
}

function resolveEngineFromModelId(modelId?: string | null) {
  return modelId?.trim().startsWith('system:') ? SYSTEM_TTS_ENGINE : KOKORO_TTS_ENGINE
}

export function getDefaultTTSModelId(engine: TTSEngine = DEFAULT_TTS_ENGINE) {
  return engine === SYSTEM_TTS_ENGINE ? SYSTEM_TTS_MODEL_ID : DEFAULT_TTS_MODEL_ID
}

export function getDefaultTTSVoiceId(engine: TTSEngine = DEFAULT_TTS_ENGINE) {
  return engine === SYSTEM_TTS_ENGINE ? SYSTEM_TTS_VOICE_ID : DEFAULT_TTS_VOICE_ID
}

export function normalizeTTSModelId(modelId?: string | null, engine?: TTSEngine) {
  const resolvedEngine = normalizeTTSEngine(engine || resolveEngineFromModelId(modelId))
  const normalized = modelId?.trim()
  if (!normalized) {
    return getDefaultTTSModelId(resolvedEngine)
  }

  if (resolvedEngine === SYSTEM_TTS_ENGINE) {
    return SYSTEM_TTS_MODEL_ID
  }

  return LEGACY_TTS_MODEL_ID_MAP[normalized] || normalized
}

export const TTS_MODEL_LIBRARY: TTSModelLibraryItem[] = [
  {
    id: DEFAULT_TTS_MODEL_ID,
    engine: KOKORO_TTS_ENGINE,
    modelId: DEFAULT_TTS_MODEL_ID,
    aliasIds: ['kokoro-zh-default'],
    name: 'Kokoro 82M 中文扩展',
    description: '默认内置离线模型。打包后可直接本地播报，同时继续支持把远程模型缓存到浏览器持久缓存中。',
    language: 'zh-CN',
    sourceLabel: 'Hugging Face / onnx-community',
    sourceUrl: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX',
    defaultVoiceId: DEFAULT_TTS_VOICE_ID,
    recommended: true,
    builtIn: true
  },
  {
    id: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
    engine: KOKORO_TTS_ENGINE,
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
    name: 'Kokoro 82M Timestamped',
    description: '官方时间戳增强变体。默认不随包内置，可在联网环境下远程缓存后离线复用。',
    language: 'multilingual',
    sourceLabel: 'Hugging Face / onnx-community',
    sourceUrl: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
    defaultVoiceId: DEFAULT_TTS_VOICE_ID,
    remote: true
  },
  {
    id: SYSTEM_TTS_MODEL_ID,
    engine: SYSTEM_TTS_ENGINE,
    modelId: SYSTEM_TTS_MODEL_ID,
    name: '系统默认语音',
    description: '直接调用 Windows / Chromium 已安装语音，启动极快，适合低延迟播报与长文本朗读。',
    language: 'system',
    sourceLabel: '系统语音 / SpeechSynthesis',
    sourceUrl: 'system://speech-synthesis',
    defaultVoiceId: SYSTEM_TTS_VOICE_ID,
    recommended: true,
    builtIn: true
  }
]

export const TTS_VOICE_LIBRARY: TTSVoiceLibraryItem[] = [
  createSystemFallbackVoice(SYSTEM_TTS_VOICE_ID, '系统自动选择', 'zh-CN', '自动匹配'),
  createVoice('zf_xiaobei', '小贝', 'zh-CN', 'female', '中文女声', '当前默认女声。开源中文语音里兼容性最好，适合作为 Live2D 自动播报默认值。', DEFAULT_TTS_SAMPLE_TEXT, { recommended: true, builtIn: true }),
  createVoice('zf_xiaoni', '小妮', 'zh-CN', 'female', '中文女声', '较柔和的中文女声，适合长时间驻留播报。', '今天的任务我会继续帮你跟进。', { builtIn: true }),
  createVoice('zf_xiaoxiao', '小晓', 'zh-CN', 'female', '中文女声', '更清脆的中文女声，适合提示类回复。', '我已经整理好了这轮对话的重点。', { builtIn: true }),
  createVoice('zf_xiaoyi', '小艺', 'zh-CN', 'female', '中文女声', '偏稳重的中文女声，适合信息较长的播报。', '如果你需要，我可以继续把下一步操作也说出来。', { builtIn: true }),
  createVoice('zm_yunjian', '云剑', 'zh-CN', 'male', '中文男声', '较稳的中文男声。', '我会先确认当前窗口状态，再决定下一步。', { builtIn: true }),
  createVoice('zm_yunxi', '云溪', 'zh-CN', 'male', '中文男声', '更轻快的中文男声。', '账号导出已经完成，我现在回报结果。', { builtIn: true }),
  createVoice('zm_yunxia', '云夏', 'zh-CN', 'male', '中文男声', '更明亮的中文男声，适合短句提示与播报。', '接下来我会继续检查这一轮结果。'),
  createVoice('zm_yunyang', '云扬', 'zh-CN', 'male', '中文男声', '偏中性的中文男声，适合流程型说明。', '我已经为你准备好了下一步建议。'),
  createVoice('af_heart', 'Heart', 'en-US', 'female', '美式女声', '官方质量最稳定的英文女声之一，适合英文补充信息。', 'Hello, I have prepared the next step for you.', { recommended: true }),
  createVoice('af_bella', 'Bella', 'en-US', 'female', '美式女声', '更自然的英文女声，适合长句说明。', 'I can keep reading the details if you want.'),
  createVoice('af_nicole', 'Nicole', 'en-US', 'female', '美式女声', '更偏播客感的英文女声。', 'The report is ready and I can summarize it for you.'),
  createVoice('af_alloy', 'Alloy', 'en-US', 'female', '美式女声', '清晰直接的英文女声。', 'The current configuration has been updated successfully.'),
  createVoice('af_sarah', 'Sarah', 'en-US', 'female', '美式女声', '适合中性、稳定的英文播报。', 'I will verify the data before taking the next action.'),
  createVoice('am_adam', 'Adam', 'en-US', 'male', '美式男声', '偏低沉的英文男声。', 'I have finished the validation and can continue now.'),
  createVoice('am_michael', 'Michael', 'en-US', 'male', '美式男声', '较稳重的英文男声。', 'The task is moving forward with the latest context.'),
  createVoice('am_fenrir', 'Fenrir', 'en-US', 'male', '美式男声', '更有力度的英文男声。', 'The system tools are ready for the next operation.'),
  createVoice('am_puck', 'Puck', 'en-US', 'male', '美式男声', '更轻快的英文男声。', 'Everything looks good so far.'),
  createVoice('am_echo', 'Echo', 'en-US', 'male', '美式男声', '偏中性的英文男声。', 'I can replay the result once more if needed.'),
  createVoice('bf_emma', 'Emma', 'en-GB', 'female', '英式女声', '英式英语女声，适合需要更稳重语气的场景。', 'I have checked the current status and everything is in order.'),
  createVoice('bf_isabella', 'Isabella', 'en-GB', 'female', '英式女声', '更柔和的英式女声。', 'I can continue with the remaining steps.'),
  createVoice('bm_george', 'George', 'en-GB', 'male', '英式男声', '英式英语男声，适合简短确认。', 'The requested action has been completed.'),
  createVoice('bm_lewis', 'Lewis', 'en-GB', 'male', '英式男声', '偏轻快的英式男声。', 'I am ready to proceed with the next instruction.'),
  createVoice('ef_dora', 'Dora', 'es-ES', 'female', '西语女声', '适合西语简短播报。', 'Hola, ya tengo listo el siguiente paso.'),
  createVoice('em_alex', 'Alex', 'es-ES', 'male', '西语男声', '偏中性的西语男声。', 'La configuración ya fue actualizada correctamente.'),
  createVoice('em_santa', 'Santa', 'es-ES', 'male', '西语男声', '适合提示类西语播报。', 'Puedo continuar con el resto del proceso.')
]

function createCustomTTSModelOption(modelId: string): TTSModelLibraryItem {
  return {
    id: modelId,
    engine: KOKORO_TTS_ENGINE,
    modelId,
    name: modelId.split('/').pop() || modelId,
    description: '自定义 Hugging Face / ONNX 模型标识。若模型兼容 Kokoro 推理结构，可通过“缓存模型”按钮远程拉取并离线复用。',
    language: 'custom',
    sourceLabel: '自定义远程模型',
    sourceUrl: `https://huggingface.co/${modelId}`,
    defaultVoiceId: DEFAULT_TTS_VOICE_ID,
    remote: true
  }
}

function isCompatibleKokoroModel(modelId: string) {
  return /onnx-community\/Kokoro-82M/i.test(modelId)
}

export function isBuiltinTTSModel(modelId?: string | null) {
  const normalized = modelId?.trim()
  if (!normalized) {
    return true
  }

  return normalized === SYSTEM_TTS_MODEL_ID || BUILTIN_TTS_MODEL_IDS.has(normalizeTTSModelId(normalized))
}

export function isBuiltinTTSVoice(voiceId?: string | null) {
  return !!voiceId && BUILTIN_TTS_VOICE_IDS.has(voiceId.trim())
}

export function listTTSModels(engine: TTSEngine = DEFAULT_TTS_ENGINE) {
  const resolvedEngine = normalizeTTSEngine(engine)
  return TTS_MODEL_LIBRARY.filter(item => item.engine === resolvedEngine)
}

export function getTTSModelOption(modelId: string, engine?: TTSEngine) {
  const resolvedEngine = normalizeTTSEngine(engine || resolveEngineFromModelId(modelId))
  const normalizedModelId = normalizeTTSModelId(modelId, resolvedEngine)
  return TTS_MODEL_LIBRARY.find(item => item.engine === resolvedEngine && (item.modelId === normalizedModelId || item.id === normalizedModelId || item.aliasIds?.includes(normalizedModelId)))
    ?? (resolvedEngine === SYSTEM_TTS_ENGINE ? TTS_MODEL_LIBRARY.find(item => item.id === SYSTEM_TTS_MODEL_ID)! : createCustomTTSModelOption(normalizedModelId))
}

export function listTTSVoices(modelId = DEFAULT_TTS_MODEL_ID, engine?: TTSEngine) {
  const resolvedEngine = normalizeTTSEngine(engine || resolveEngineFromModelId(modelId))
  if (resolvedEngine === SYSTEM_TTS_ENGINE) {
    return TTS_VOICE_LIBRARY.filter(item => item.engine === SYSTEM_TTS_ENGINE)
  }

  const normalizedModelId = normalizeTTSModelId(modelId, resolvedEngine)
  const exactMatches = TTS_VOICE_LIBRARY.filter(item => item.modelId === normalizedModelId)
  if (exactMatches.length > 0) {
    return exactMatches
  }

  if (isCompatibleKokoroModel(normalizedModelId)) {
    return TTS_VOICE_LIBRARY.filter(item => item.modelId === DEFAULT_TTS_MODEL_ID)
  }

  return TTS_VOICE_LIBRARY.filter(item => item.modelId === DEFAULT_TTS_MODEL_ID)
}

export function getTTSVoiceOption(voiceId: string, modelId = DEFAULT_TTS_MODEL_ID, engine?: TTSEngine) {
  const resolvedEngine = normalizeTTSEngine(engine || resolveEngineFromModelId(modelId))
  const voices = listTTSVoices(modelId, resolvedEngine)

  if (resolvedEngine === SYSTEM_TTS_ENGINE) {
    const normalizedVoiceId = isSystemTTSVoiceId(voiceId) ? voiceId : SYSTEM_TTS_VOICE_ID
    return voices.find(item => item.id === normalizedVoiceId)
      ?? createSystemFallbackVoice(normalizedVoiceId, stripSystemTTSVoiceId(normalizedVoiceId) || '系统自动选择')
  }

  return voices.find(item => item.id === voiceId) ?? voices[0] ?? TTS_VOICE_LIBRARY.find(item => item.engine === KOKORO_TTS_ENGINE)!
}