import type { TTSEngine, TTSEmotionStyle, TTSModelLibraryItem, TTSVoiceLibraryItem } from '@/types'

export const KOKORO_TTS_ENGINE: TTSEngine = 'kokoro-js-zh'
export const SYSTEM_TTS_ENGINE: TTSEngine = 'system-speech'
export const EDGE_TTS_ENGINE: TTSEngine = 'edge-neural'
export const DEFAULT_TTS_ENGINE: TTSEngine = KOKORO_TTS_ENGINE
export const DEFAULT_TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
export const DEFAULT_TTS_VOICE_ID = 'zf_xiaobei'
export const SYSTEM_TTS_MODEL_ID = 'system:default'
export const SYSTEM_TTS_VOICE_ID = 'system:auto'
export const EDGE_TTS_MODEL_ID = 'edge:neural'
export const EDGE_TTS_VOICE_ID = 'edge:zh-CN-XiaoxiaoNeural'
export const DEFAULT_TTS_SAMPLE_TEXT = '你好，我是 OpenAgent 的 Live2D 语音助手。'
export const DEFAULT_TTS_EMOTION_STYLE: TTSEmotionStyle = 'auto'
export const DEFAULT_TTS_EMOTION_INTENSITY = 1.1

export const TTS_ENGINE_OPTIONS: Array<{ value: TTSEngine; label: string; description: string }> = [
  {
    value: EDGE_TTS_ENGINE,
    label: 'Edge 神经语音',
    description: '在线中文神经语音，发音更清晰，并通过韵律控制模拟更自然的情绪化 AI 播报。'
  },
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

export const TTS_EMOTION_STYLE_OPTIONS: Array<{ value: TTSEmotionStyle; label: string; description: string }> = [
  { value: 'auto', label: '自动感情', description: '根据回复内容自动在亲和、鼓舞、说明、安慰等语气间切换。' },
  { value: 'neutral', label: '中性', description: '关闭情绪风格，保持自然但克制的中性播报。' },
  { value: 'assistant', label: '助手', description: '更像数字助理，适合默认 AI 回复。' },
  { value: 'friendly', label: '亲切', description: '更温和、更靠近陪伴式对话。' },
  { value: 'cheerful', label: '愉快', description: '适合积极反馈、鼓励和欢迎语。' },
  { value: 'excited', label: '兴奋', description: '适合强烈正反馈和高能播报。' },
  { value: 'hopeful', label: '期待', description: '适合鼓励、展望和轻度激励场景。' },
  { value: 'empathetic', label: '共情', description: '适合安慰、解释限制或照顾用户情绪。' },
  { value: 'calm', label: '沉稳', description: '适合说明步骤、回报结果和长句播报。' },
  { value: 'narration-relaxed', label: '舒缓旁白', description: '适合较长解释和陪伴式朗读。' },
  { value: 'narration-professional', label: '专业旁白', description: '适合正式说明、总结和报告。' },
  { value: 'serious', label: '严肃', description: '适合风险提示、错误说明和警告。' },
  { value: 'sad', label: '低落', description: '适合遗憾、致歉或柔和的失落语气。' }
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

const EDGE_VOICE_DOCS_URL = 'https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts'

const EDGE_FALLBACK_VOICE_META: Record<string, { name: string; accent: string; description: string; sampleText: string; recommended?: boolean }> = {
  'zh-CN-XiaoxiaoNeural': {
    name: '晓晓',
    accent: '普通话',
    description: '微软中文神经女声，清晰度高，适合默认 AI 助手播报与较自然的情绪表达。',
    sampleText: '你好，我会用更自然的中文语音继续跟进这轮任务。',
    recommended: true
  },
  'zh-CN-XiaoyiNeural': {
    name: '晓伊',
    accent: '普通话',
    description: '更活泼的中文神经女声，适合轻快、亲切和更有陪伴感的回复。',
    sampleText: '今天这部分进度我已经帮你整理好了，我们继续。'
  },
  'zh-CN-YunjianNeural': {
    name: '云健',
    accent: '普通话',
    description: '更有力度的中文神经男声，适合强调、提示和偏激情的说明。',
    sampleText: '我已经确认关键结果，下面直接进入下一步。'
  },
  'zh-CN-YunxiNeural': {
    name: '云希',
    accent: '普通话',
    description: '更明亮的中文神经男声，适合轻松、阳光、互动感更强的播报。',
    sampleText: '别担心，这一步我已经替你想清楚了。'
  },
  'zh-CN-YunyangNeural': {
    name: '云扬',
    accent: '普通话',
    description: '专业、稳定的中文神经男声，适合报告式和步骤式回复。',
    sampleText: '当前结果已经确认，接下来我会继续补充细节。'
  },
  'zh-CN-liaoning-XiaobeiNeural': {
    name: '晓北',
    accent: '东北官话',
    description: '带东北口音的中文神经女声，幽默感更强。',
    sampleText: '这轮进度已经稳住了，咱们继续往下推。'
  },
  'zh-CN-shaanxi-XiaoniNeural': {
    name: '晓妮',
    accent: '陕西中原官话',
    description: '带方言色彩的中文神经女声，辨识度更高。',
    sampleText: '我已经把重点给你捋顺了，接着往下看就行。'
  }
}

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

function createEdgeFallbackVoice(shortName: string, locale: string, gender: 'female' | 'male'): TTSVoiceLibraryItem {
  const meta = EDGE_FALLBACK_VOICE_META[shortName] || {
    name: shortName.replace(/^zh-[A-Z-]+-/, '').replace(/Neural$/i, ''),
    accent: locale,
    description: '微软 Edge 在线神经语音，可提供更清晰的中文播报。',
    sampleText: DEFAULT_TTS_SAMPLE_TEXT,
    recommended: false
  }

  return {
    id: createEdgeTTSVoiceId(shortName),
    engine: EDGE_TTS_ENGINE,
    modelId: EDGE_TTS_MODEL_ID,
    name: meta.name,
    locale,
    gender,
    accent: meta.accent,
    description: meta.description,
    sampleText: meta.sampleText,
    sourceLabel: 'Microsoft Edge Neural',
    sourceUrl: EDGE_VOICE_DOCS_URL,
    recommended: meta.recommended,
    builtIn: false
  }
}

export function normalizeTTSEngine(engine?: string | null): TTSEngine {
  if (engine === SYSTEM_TTS_ENGINE) {
    return SYSTEM_TTS_ENGINE
  }

  if (engine === EDGE_TTS_ENGINE) {
    return EDGE_TTS_ENGINE
  }

  return DEFAULT_TTS_ENGINE
}

export function isSystemTTSEngine(engine?: string | null) {
  return normalizeTTSEngine(engine) === SYSTEM_TTS_ENGINE
}

export function isEdgeTTSEngine(engine?: string | null) {
  return normalizeTTSEngine(engine) === EDGE_TTS_ENGINE
}

export function createSystemTTSVoiceId(rawVoiceId: string) {
  const normalized = rawVoiceId.trim()
  return normalized ? `system:${normalized}` : SYSTEM_TTS_VOICE_ID
}

export function createEdgeTTSVoiceId(rawVoiceId: string) {
  const normalized = rawVoiceId.trim()
  return normalized ? `edge:${normalized}` : EDGE_TTS_VOICE_ID
}

export function isSystemTTSVoiceId(voiceId?: string | null) {
  return typeof voiceId === 'string' && voiceId.startsWith('system:')
}

export function isEdgeTTSVoiceId(voiceId?: string | null) {
  return typeof voiceId === 'string' && voiceId.startsWith('edge:')
}

export function stripSystemTTSVoiceId(voiceId?: string | null) {
  if (!voiceId) {
    return ''
  }

  return voiceId.replace(/^system:/, '').trim()
}

export function stripEdgeTTSVoiceId(voiceId?: string | null) {
  if (!voiceId) {
    return ''
  }

  return voiceId.replace(/^edge:/, '').trim()
}

export function normalizeTTSEmotionStyle(style?: string | null): TTSEmotionStyle {
  return TTS_EMOTION_STYLE_OPTIONS.find(item => item.value === style)?.value || DEFAULT_TTS_EMOTION_STYLE
}

export function clampTTSEmotionIntensity(value?: number | null) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TTS_EMOTION_INTENSITY
  }

  return Math.min(Math.max(Number(value), 0.6), 2)
}

function resolveEngineFromModelId(modelId?: string | null) {
  const normalized = modelId?.trim()
  if (normalized?.startsWith('system:')) {
    return SYSTEM_TTS_ENGINE
  }

  if (normalized?.startsWith('edge:')) {
    return EDGE_TTS_ENGINE
  }

  return KOKORO_TTS_ENGINE
}

export function getDefaultTTSModelId(engine: TTSEngine = DEFAULT_TTS_ENGINE) {
  if (engine === SYSTEM_TTS_ENGINE) {
    return SYSTEM_TTS_MODEL_ID
  }

  if (engine === EDGE_TTS_ENGINE) {
    return EDGE_TTS_MODEL_ID
  }

  return DEFAULT_TTS_MODEL_ID
}

export function getDefaultTTSVoiceId(engine: TTSEngine = DEFAULT_TTS_ENGINE) {
  if (engine === SYSTEM_TTS_ENGINE) {
    return SYSTEM_TTS_VOICE_ID
  }

  if (engine === EDGE_TTS_ENGINE) {
    return EDGE_TTS_VOICE_ID
  }

  return DEFAULT_TTS_VOICE_ID
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

  if (resolvedEngine === EDGE_TTS_ENGINE) {
    return EDGE_TTS_MODEL_ID
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
    id: EDGE_TTS_MODEL_ID,
    engine: EDGE_TTS_ENGINE,
    modelId: EDGE_TTS_MODEL_ID,
    name: 'Microsoft Edge 中文神经语音',
    description: '在线神经语音引擎，中文发音更清晰，并通过韵律参数模拟情绪风格。适合作为 AI 助手主播报引擎。',
    language: 'zh-CN',
    sourceLabel: 'Microsoft Edge Read Aloud',
    sourceUrl: EDGE_VOICE_DOCS_URL,
    defaultVoiceId: EDGE_TTS_VOICE_ID,
    recommended: true,
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
  createEdgeFallbackVoice('zh-CN-XiaoxiaoNeural', 'zh-CN', 'female'),
  createEdgeFallbackVoice('zh-CN-XiaoyiNeural', 'zh-CN', 'female'),
  createEdgeFallbackVoice('zh-CN-YunjianNeural', 'zh-CN', 'male'),
  createEdgeFallbackVoice('zh-CN-YunxiNeural', 'zh-CN', 'male'),
  createEdgeFallbackVoice('zh-CN-YunyangNeural', 'zh-CN', 'male'),
  createEdgeFallbackVoice('zh-CN-liaoning-XiaobeiNeural', 'zh-CN-liaoning', 'female'),
  createEdgeFallbackVoice('zh-CN-shaanxi-XiaoniNeural', 'zh-CN-shaanxi', 'female'),
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
    ?? (resolvedEngine === SYSTEM_TTS_ENGINE
      ? TTS_MODEL_LIBRARY.find(item => item.id === SYSTEM_TTS_MODEL_ID)!
      : resolvedEngine === EDGE_TTS_ENGINE
        ? TTS_MODEL_LIBRARY.find(item => item.id === EDGE_TTS_MODEL_ID)!
        : createCustomTTSModelOption(normalizedModelId))
}

export function listTTSVoices(modelId = DEFAULT_TTS_MODEL_ID, engine?: TTSEngine) {
  const resolvedEngine = normalizeTTSEngine(engine || resolveEngineFromModelId(modelId))
  if (resolvedEngine === SYSTEM_TTS_ENGINE) {
    return TTS_VOICE_LIBRARY.filter(item => item.engine === SYSTEM_TTS_ENGINE)
  }

  if (resolvedEngine === EDGE_TTS_ENGINE) {
    return TTS_VOICE_LIBRARY.filter(item => item.engine === EDGE_TTS_ENGINE)
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

  if (resolvedEngine === EDGE_TTS_ENGINE) {
    const normalizedVoiceId = isEdgeTTSVoiceId(voiceId) ? voiceId : EDGE_TTS_VOICE_ID
    return voices.find(item => item.id === normalizedVoiceId)
      ?? createEdgeFallbackVoice(stripEdgeTTSVoiceId(normalizedVoiceId) || stripEdgeTTSVoiceId(EDGE_TTS_VOICE_ID), 'zh-CN', 'female')
  }

  return voices.find(item => item.id === voiceId) ?? voices[0] ?? TTS_VOICE_LIBRARY.find(item => item.engine === KOKORO_TTS_ENGINE)!
}