import type {
  AIConfig,
  AIChatMessage,
  AIToolCall,
  AIProviderModel,
  AIProtocol,
  AIChatPreferences,
  AIModelCapabilities,
  AIModelLimits,
  AIChatAttachment,
  AIContextMetrics
} from '@/types'
import { useSettingsStore } from '@/stores/settings'
import { useAIStore } from '@/stores/ai'
import { useAIResourcesStore } from '@/stores/aiResources'
import { coerceToolArguments, stringifyToolArguments } from '@/utils/aiToolArgs'

type SupportedProtocol = 'openai' | 'anthropic' | 'gemini' | 'ollama-local' | 'ollama-cloud'

interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface StreamCallbacks {
  onToken: (token: string) => void
  onReasoning?: (token: string) => void
  onToolCall: (toolCall: AIToolCall) => void
  onProviderMetadata?: (metadata: Record<string, unknown>) => void
  onDone: () => void | Promise<void>
  onError: (error: string) => void
}

type AnthropicModelsError = Error & { fallbackToStatic?: boolean }

type ResponsesContentPart = {
  type: 'input_text' | 'output_text' | 'input_image'
  text?: string
  image_url?: string
}

type ResponsesInputItem = {
  type?: 'function_call' | 'function_call_output'
  role?: 'system' | 'user' | 'assistant'
  content?: string | ResponsesContentPart[]
  call_id?: string
  name?: string
  arguments?: string
  id?: string
  output?: string
}

type ResponsesToolDefinition = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

type ResponsesOutputSummary = {
  type?: string
  text?: string
}

type ResponsesOutputItem = {
  type?: string
  id?: string
  role?: string
  content?: Array<{ type?: string; text?: string }>
  status?: string
  summary?: ResponsesOutputSummary[]
  call_id?: string
  name?: string
  arguments?: string
}

type ResponsesUsage = {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
  }
}

type ResponsesApiResponse = {
  id?: string
  model?: string
  status?: string
  output?: ResponsesOutputItem[]
  usage?: ResponsesUsage
  error?: {
    message?: string
  }
  incomplete_details?: {
    reason?: string
  }
}

type GeminiInlineData = {
  mimeType?: string
  data?: string
}

type GeminiFunctionCall = {
  name?: string
  args?: Record<string, unknown>
}

type GeminiFunctionResponse = {
  name?: string
  response?: Record<string, unknown>
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  functionCall?: GeminiFunctionCall
  functionResponse?: GeminiFunctionResponse
  thought?: boolean
  thoughtSignature?: string
  thought_signature?: string
}

type GeminiContent = {
  role?: string
  parts?: GeminiPart[]
}

type GeminiCandidate = {
  content?: GeminiContent
  finishReason?: string
}

type GeminiGenerateContentResponse = {
  candidates?: GeminiCandidate[]
  promptFeedback?: {
    blockReason?: string
  }
  error?: {
    message?: string
  }
}

type ResponsesStreamEvent = {
  type?: string
  response?: ResponsesApiResponse
  item?: ResponsesOutputItem
  output_index?: number
  content_index?: number
  item_id?: string
  call_id?: string
  name?: string
  arguments?: string
  delta?: string
  text?: string
  error?: {
    message?: string
  }
  message?: string
}

class OpenAIRequestError extends Error {
  status: number
  responseText: string
  endpointType: 'chat-completions' | 'responses'

  constructor(endpointType: 'chat-completions' | 'responses', status: number, responseText: string, message: string) {
    super(message)
    this.name = 'OpenAIRequestError'
    this.status = status
    this.responseText = responseText
    this.endpointType = endpointType
  }
}

const DEFAULT_MODEL_CAPABILITIES: AIModelCapabilities = {
  vision: false,
  thinking: false,
  toolUse: true,
  imageInput: false,
  taskPlanning: true,
  mcpControl: true
}

const DEFAULT_MODEL_LIMITS: AIModelLimits = {
  maxContextTokens: 131072,
  maxOutputTokens: 16384
}

const CONTEXT_SAFETY_BUFFER = 1536
const FILE_TEXT_PREVIEW_LIMIT = 24000

type ModelLimitPreset = {
  pattern: RegExp
  maxContextTokens: number
  maxOutputTokens: number
}

const OPENAI_LIMIT_PRESETS: ModelLimitPreset[] = [
  { pattern: /gpt-4\.1/i, maxContextTokens: 1048576, maxOutputTokens: 32768 },
  { pattern: /gpt-5|o3|o4|gpt-oss/i, maxContextTokens: 262144, maxOutputTokens: 65536 },
  { pattern: /gpt-4o|gpt-4\.5/i, maxContextTokens: 131072, maxOutputTokens: 16384 },
  { pattern: /gpt-4o-mini|gpt-4-turbo|gpt-4/i, maxContextTokens: 131072, maxOutputTokens: 16384 },
  { pattern: /gpt-3\.5/i, maxContextTokens: 16384, maxOutputTokens: 4096 }
]

const ANTHROPIC_LIMIT_PRESETS: ModelLimitPreset[] = [
  { pattern: /claude-4|claude-3\.7|sonnet-4/i, maxContextTokens: 200000, maxOutputTokens: 32000 },
  { pattern: /claude-3\.5/i, maxContextTokens: 200000, maxOutputTokens: 8192 },
  { pattern: /claude-3/i, maxContextTokens: 200000, maxOutputTokens: 4096 }
]

const GEMINI_LIMIT_PRESETS: ModelLimitPreset[] = [
  { pattern: /gemini-2\.5|gemini-1\.5/i, maxContextTokens: 1048576, maxOutputTokens: 65536 },
  { pattern: /gemini-2/i, maxContextTokens: 1048576, maxOutputTokens: 8192 },
  { pattern: /gemini/i, maxContextTokens: 1048576, maxOutputTokens: 8192 }
]

const OLLAMA_LIMIT_PRESETS: ModelLimitPreset[] = [
  { pattern: /qwen3|qwq|deepseek-r1/i, maxContextTokens: 131072, maxOutputTokens: 16384 },
  { pattern: /qwen2\.5-vl|qwen2\.5|qwen/i, maxContextTokens: 65536, maxOutputTokens: 16384 },
  { pattern: /llama-?3\.3|llama-?3\.2|llama-?3\.1|mistral|gemma/i, maxContextTokens: 32768, maxOutputTokens: 8192 }
]

function isOllamaProtocol(protocol: AIProtocol): protocol is 'ollama-local' | 'ollama-cloud' {
  return protocol === 'ollama-local' || protocol === 'ollama-cloud'
}

function inferCustomProtocol(baseUrl: string, modelName: string): SupportedProtocol {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl).toLowerCase()
  const normalizedModelName = modelName.trim().toLowerCase()

  if (
    /generativelanguage\.googleapis\.com|\/v1beta(?:\/|$)|:(?:generatecontent|streamgeneratecontent|counttokens)\b/.test(normalizedBaseUrl)
    || normalizedModelName.startsWith('gemini')
  ) {
    return 'gemini'
  }

  if (/anthropic|\/messages(?:\/|$)/.test(normalizedBaseUrl) || normalizedModelName.startsWith('claude')) {
    return 'anthropic'
  }

  if (/localhost:11434|127\.0\.0\.1:11434/.test(normalizedBaseUrl)) {
    return 'ollama-local'
  }

  if (/ollama\.com\/api/.test(normalizedBaseUrl)) {
    return 'ollama-cloud'
  }

  return 'openai'
}

function resolveProtocol(protocol: AIProtocol, baseUrl = '', modelName = ''): SupportedProtocol {
  if (protocol === 'anthropic') {
    return 'anthropic'
  }

  if (protocol === 'gemini') {
    return 'gemini'
  }

  if (isOllamaProtocol(protocol)) {
    return protocol
  }

  if (protocol === 'custom') {
    return inferCustomProtocol(baseUrl, modelName)
  }

  return 'openai'
}

function resolveConfigProtocol(config: AIConfig): SupportedProtocol {
  return resolveProtocol(config.protocol, config.baseUrl, config.model)
}

function trimTrailingSlashes(url: string) {
  return url.trim().replace(/\/+$/, '')
}

function getDefaultOllamaBase(protocol: 'ollama-local' | 'ollama-cloud') {
  return protocol === 'ollama-local' ? 'http://localhost:11434/api' : 'https://ollama.com/api'
}

function ensureAnthropicBase(baseUrl: string) {
  const sanitized = trimTrailingSlashes(baseUrl)
  if (!sanitized) {
    return 'https://api.anthropic.com/v1'
  }

  if (sanitized.endsWith('/messages')) {
    return sanitized.slice(0, -'/messages'.length)
  }

  return sanitized
}

function ensureOpenAIBase(baseUrl: string) {
  const sanitized = trimTrailingSlashes(baseUrl)
  if (!sanitized) {
    return 'https://api.openai.com/v1'
  }

  return sanitized
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models$/i, '')
}

function normalizeGeminiModelName(modelName: string) {
  return modelName.trim().replace(/^models\//i, '')
}

function ensureGeminiBase(baseUrl: string) {
  const sanitized = trimTrailingSlashes(baseUrl)
  if (!sanitized) {
    return 'https://generativelanguage.googleapis.com/v1beta'
  }

  return sanitized
    .replace(/\/models\/[^/?#]+:(generateContent|streamGenerateContent|countTokens)(\?[^#]+)?$/i, '')
    .replace(/\/models\/[^/?#]+$/i, '')
    .replace(/\/models$/i, '')
}

function ensureOllamaBase(baseUrl: string, protocol: 'ollama-local' | 'ollama-cloud') {
  const sanitized = trimTrailingSlashes(baseUrl)
  if (!sanitized) {
    return getDefaultOllamaBase(protocol)
  }

  return sanitized
    .replace(/\/chat$/i, '')
    .replace(/\/tags$/i, '')
    .replace(/\/api\/chat$/i, '/api')
    .replace(/\/api\/tags$/i, '/api')
    .replace(/\/v1\/chat\/completions$/i, '/api')
    .replace(/\/v1\/models$/i, '/api')
    .replace(/\/v1$/i, '/api')
}

function normalizeChatUrl(baseUrl: string, protocol: SupportedProtocol) {
  if (protocol === 'anthropic') {
    return `${ensureAnthropicBase(baseUrl)}/messages`
  }

  if (protocol === 'gemini') {
    return ensureGeminiBase(baseUrl)
  }

  if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    return `${ensureOllamaBase(baseUrl, protocol)}/chat`
  }

  return `${ensureOpenAIBase(baseUrl)}/chat/completions`
}

function normalizeResponsesUrl(baseUrl: string) {
  return `${ensureOpenAIBase(baseUrl)}/responses`
}

function normalizeModelsUrl(baseUrl: string, protocol: SupportedProtocol) {
  if (protocol === 'anthropic') {
    return ''
  }

  if (protocol === 'gemini') {
    return `${ensureGeminiBase(baseUrl)}/models`
  }

  if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    return `${ensureOllamaBase(baseUrl, protocol)}/tags`
  }

  return `${ensureOpenAIBase(baseUrl)}/models`
}

function buildOpenAICompatibleHeaders(config: AIConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  return headers
}

function buildAnthropicHeaders(config: AIConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01'
  }
}

function buildGeminiHeaders(config: AIConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  const apiKey = config.apiKey.trim()
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

function buildOllamaHeaders(config: AIConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  return headers
}

function shouldUseOpenAIResponsesApi(config: AIConfig) {
  return resolveConfigProtocol(config) === 'openai' && config.connectionTemplate === 'sub2api-openai'
}

function normalizeOpenAIErrorText(errorText: string) {
  return errorText.toLowerCase()
}

function shouldFallbackToResponses(config: AIConfig, error: unknown) {
  if (!(error instanceof OpenAIRequestError)) {
    return false
  }

  if (resolveConfigProtocol(config) !== 'openai' || error.endpointType !== 'chat-completions') {
    return false
  }

  const normalizedErrorText = normalizeOpenAIErrorText(error.responseText)
  return error.status >= 400
    && error.status < 500
    && (
      normalizedErrorText.includes('unsupported legacy protocol')
      || normalizedErrorText.includes('please use /v1/responses')
      || normalizedErrorText.includes('/v1/chat/completions is not supported')
      || (normalizedErrorText.includes('legacy protocol') && normalizedErrorText.includes('/v1/responses'))
    )
}

function shouldFallbackToChatCompletions(config: AIConfig, error: unknown) {
  if (!(error instanceof OpenAIRequestError)) {
    return false
  }

  if (resolveConfigProtocol(config) !== 'openai' || error.endpointType !== 'responses') {
    return false
  }

  const normalizedErrorText = normalizeOpenAIErrorText(error.responseText)
  return error.status === 404
    || error.status === 405
    || error.status === 501
    || (
      error.status >= 400
      && error.status < 500
      && (
        normalizedErrorText.includes('please use /v1/chat/completions')
        || normalizedErrorText.includes('/v1/responses is not supported')
        || normalizedErrorText.includes('responses is not supported')
        || (normalizedErrorText.includes('/responses') && normalizedErrorText.includes('not supported'))
      )
    )
}

function formatOpenAIRequestError(error: unknown) {
  return error instanceof Error ? error.message : '未知错误'
}

function isWindowsMcpEnabled() {
  try {
    return useSettingsStore().settings.windowsMcpEnabled
  } catch {
    return true
  }
}

function buildModelCapabilities(partial?: Partial<AIModelCapabilities>): AIModelCapabilities {
  return {
    ...DEFAULT_MODEL_CAPABILITIES,
    ...(partial ?? {})
  }
}

function readNumericCandidate(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) {
    return 0
  }

  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }

    if (typeof value === 'string') {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric
      }
    }
  }

  return 0
}

function matchLimitPreset(modelName: string, presets: ModelLimitPreset[]) {
  return presets.find(preset => preset.pattern.test(modelName))
}

export function inferModelLimits(modelName: string, protocol: AIProtocol, raw?: Record<string, unknown>): AIModelLimits {
  const normalizedName = modelName.toLowerCase()
  const details = raw?.details && typeof raw.details === 'object' ? raw.details as Record<string, unknown> : undefined
  const metadata = raw && typeof raw === 'object' ? raw : undefined
  const directContext = readNumericCandidate(metadata, ['context_length', 'context_window', 'max_context_tokens', 'num_ctx', 'inputTokenLimit', 'input_token_limit'])
    || readNumericCandidate(details, ['context_length', 'context_window', 'num_ctx', 'inputTokenLimit', 'input_token_limit'])
  const directOutput = readNumericCandidate(metadata, ['max_output_tokens', 'max_completion_tokens', 'output_token_limit', 'outputTokenLimit', 'output_token_limit'])
    || readNumericCandidate(details, ['max_output_tokens', 'num_predict', 'outputTokenLimit', 'output_token_limit'])

  let preset = DEFAULT_MODEL_LIMITS
  if (protocol === 'anthropic') {
    preset = matchLimitPreset(normalizedName, ANTHROPIC_LIMIT_PRESETS) || { pattern: /.*/, maxContextTokens: 200000, maxOutputTokens: 8192 }
  } else if (protocol === 'gemini') {
    preset = matchLimitPreset(normalizedName, GEMINI_LIMIT_PRESETS) || { pattern: /.*/, maxContextTokens: 1048576, maxOutputTokens: 8192 }
  } else if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    preset = matchLimitPreset(normalizedName, OLLAMA_LIMIT_PRESETS) || { pattern: /.*/, maxContextTokens: 32768, maxOutputTokens: 8192 }
  } else {
    preset = matchLimitPreset(normalizedName, OPENAI_LIMIT_PRESETS) || DEFAULT_MODEL_LIMITS
  }

  return {
    maxContextTokens: Math.max(directContext || preset.maxContextTokens, 4096),
    maxOutputTokens: Math.max(Math.min(directOutput || preset.maxOutputTokens, directContext || preset.maxContextTokens), 512)
  }
}

export function resolveConfigTokenLimits(config: AIConfig) {
  const limits = inferModelLimits(config.model, config.protocol)
  const maxOutputTokens = Math.min(Math.max(config.maxTokens || limits.maxOutputTokens, 256), limits.maxOutputTokens)
  const selectedContextTokens = Math.min(Math.max(config.contextWindow || limits.maxContextTokens, 4096), limits.maxContextTokens)

  return {
    ...limits,
    maxOutputTokens,
    selectedContextTokens,
    recommendedInputBudget: Math.max(selectedContextTokens - maxOutputTokens - CONTEXT_SAFETY_BUFFER, 2048)
  }
}

export function estimateTextTokens(text: string) {
  if (!text) {
    return 0
  }

  const latinChars = (text.match(/[\u0000-\u00ff]/g) || []).length
  const wideChars = Math.max(text.length - latinChars, 0)
  return Math.ceil(latinChars / 4 + wideChars / 1.6)
}

function estimateAttachmentTokens(attachment: AIChatAttachment) {
  if (attachment.type === 'image') {
    return 1200
  }

  if (attachment.textContent) {
    return estimateTextTokens(attachment.textContent) + 40
  }

  return 40
}

export function estimateMessageTokens(message: AIChatMessage) {
  const base = estimateTextTokens(message.content || '') + 12
  const attachmentCost = (message.attachments ?? []).reduce((total, attachment) => total + estimateAttachmentTokens(attachment), 0)
  const toolCallCost = (message.toolCalls ?? []).reduce((total, toolCall) => total + estimateTextTokens(toolCall.name) + estimateTextTokens(toolCall.arguments || ''), 0)
  return base + attachmentCost + toolCallCost
}

export function estimateMessagesTokens(messages: AIChatMessage[]) {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}

export function createContextMetrics(
  estimatedInputTokens: number,
  config: AIConfig,
  compressionCount = 0,
  lastCompressedAt?: number
): AIContextMetrics {
  const limits = resolveConfigTokenLimits(config)

  return {
    estimatedInputTokens,
    selectedContextTokens: limits.selectedContextTokens,
    modelMaxContextTokens: limits.maxContextTokens,
    maxOutputTokens: limits.maxOutputTokens,
    usageRatio: limits.selectedContextTokens > 0 ? estimatedInputTokens / limits.selectedContextTokens : 0,
    compressionCount,
    lastCompressedAt
  }
}

export function inferModelCapabilities(modelName: string, protocol: AIProtocol, raw?: Record<string, unknown>): AIModelCapabilities {
  const normalizedName = modelName.toLowerCase()
  const rawText = JSON.stringify(raw || {}).toLowerCase()
  const capabilityText = `${normalizedName} ${rawText}`

  const vision = /(vision|multimodal|image|vl|llava|minicpm-v|internvl|qwen(?:2\.5|3)?-vl|qwen-vl|gpt-4o|gpt-4\.1|claude-3|claude-4|gemini|glm-4v)/i.test(capabilityText)
  const thinking = /(reason|thinking|o1|o3|gpt-5|gpt-oss|r1|qwq|qwen3|claude-3-7|claude-4|sonnet-4|deepseek-r1)/i.test(capabilityText)
  const toolUse = protocol !== 'custom' || !/chat-only|no-tools/i.test(capabilityText)

  return buildModelCapabilities({
    vision,
    imageInput: vision,
    thinking,
    toolUse,
    taskPlanning: toolUse,
    mcpControl: toolUse
  })
}

export function getModelCapabilityLabels(capabilities?: AIModelCapabilities) {
  if (!capabilities) {
    return []
  }

  const labels: string[] = []
  if (capabilities.vision) labels.push('视觉')
  if (capabilities.thinking) labels.push('思考')
  if (capabilities.toolUse) labels.push('工具')
  if (capabilities.taskPlanning) labels.push('规划')
  if (capabilities.mcpControl) labels.push('MCP')
  return labels
}

export function getModelLimitLabels(limits?: AIModelLimits) {
  if (!limits) {
    return []
  }

  return [`上下文 ${limits.maxContextTokens.toLocaleString()}`, `输出 ${limits.maxOutputTokens.toLocaleString()}`]
}

export function getRecommendedAutoSteps(config: AIConfig) {
  const limits = resolveConfigTokenLimits(config)
  const baselineOutput = Math.max(Math.min(limits.maxOutputTokens, 8192), 4096)
  const recommended = Math.round(limits.selectedContextTokens / baselineOutput)
  return Math.min(Math.max(recommended, 12), 96)
}

function resolveRuntimeCapabilities(config: AIConfig) {
  return inferModelCapabilities(config.model, config.protocol)
}

function supportsThinkingMode(config: AIConfig, preferences?: Partial<AIChatPreferences>) {
  return Boolean(preferences?.thinkingEnabled) && resolveRuntimeCapabilities(config).thinking
}

function supportsImageInput(message: AIChatMessage) {
  return Array.isArray(message.attachments) && message.attachments.some(attachment => attachment.type === 'image' && attachment.dataUrl)
}

function buildImageAttachmentSummary(message: AIChatMessage) {
  const imageAttachments = (message.attachments ?? []).filter(attachment => attachment.type === 'image' && attachment.dataUrl)
  if (imageAttachments.length === 0) {
    return ''
  }

  return imageAttachments
    .map(attachment => `- ${attachment.name}${attachment.width && attachment.height ? ` (${attachment.width}x${attachment.height})` : ''}`)
    .join('\n')
}

function buildImageAttachmentPrompt(message: AIChatMessage) {
  const attachmentSummary = buildImageAttachmentSummary(message)
  if (!attachmentSummary) {
    return ''
  }

  const baseInstruction = message.content.trim()
    ? '请结合本轮已附带的图片或截图一起分析，并直接描述图像中的可见内容、文本、界面状态和关键变化。除非附件缺失、损坏或分辨率不足，不要笼统回答“无法解析图像”。'
    : '用户本轮仅提供了图片或截图附件。请先直接分析图像内容，识别可见文本、界面元素、状态和布局，再继续完成任务。除非附件缺失、损坏或分辨率不足，不要笼统回答“无法解析图像”。'

  return `${baseInstruction}\n${attachmentSummary}`
}

function buildAttachmentTextContent(attachment: AIChatAttachment) {
  if (attachment.type !== 'file') {
    return ''
  }

  const title = `文件 ${attachment.name}${attachment.mimeType ? ` (${attachment.mimeType})` : ''}`
  if (attachment.textContent) {
    const suffix = attachment.truncated ? '\n[文件内容已截断]' : ''
    return `${title}\n${attachment.textContent.slice(0, FILE_TEXT_PREVIEW_LIMIT)}${suffix}`
  }

  return `${title}\n当前文件为非文本或暂不支持直接解析，仅已附加元数据。`
}

function buildMessageTextContent(message: AIChatMessage) {
  const imagePrompt = message.role === 'user' ? buildImageAttachmentPrompt(message) : ''
  const assistantImageSummary = message.role === 'assistant'
    ? buildImageAttachmentSummary(message)
    : ''
  const fileSections = (message.attachments ?? [])
    .filter(attachment => attachment.type === 'file')
    .map(attachment => buildAttachmentTextContent(attachment))
    .filter(Boolean)

  if (!imagePrompt && !assistantImageSummary && fileSections.length === 0) {
    return message.content
  }

  return [
    message.content,
    imagePrompt,
    assistantImageSummary ? `本轮助手还生成了以下图片附件：\n${assistantImageSummary}` : '',
    ...fileSections
  ].filter(Boolean).join('\n\n')
}

export function splitEmbeddedReasoningContent(content: string) {
  const reasoningParts: string[] = []
  const cleanedContent = content
    .replace(/<(think|thinking|reasoning)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, reasoningBody: string) => {
      const normalizedReasoning = String(reasoningBody || '').trim()
      if (normalizedReasoning) {
        reasoningParts.push(normalizedReasoning)
      }
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    content: cleanedContent,
    reasoningContent: reasoningParts.join('\n\n').trim()
  }
}

function getThinkingLevel(preferences?: Partial<AIChatPreferences>) {
  if (preferences?.thinkingLevel === 'low' || preferences?.thinkingLevel === 'high') {
    return preferences.thinkingLevel
  }

  return 'medium'
}

function stripDataUrlPrefix(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(',')
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl
}

function parseToolArguments(toolName: string, args: string): Record<string, unknown> {
  return coerceToolArguments(toolName, args)
}

function mergeStreamingArgumentText(existing: string, incoming: string) {
  if (!existing) {
    return incoming
  }

  if (!incoming) {
    return existing
  }

  if (incoming.startsWith(existing)) {
    return incoming
  }

  if (existing.startsWith(incoming)) {
    return existing
  }

  const maxOverlap = Math.min(existing.length, incoming.length)
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existing.endsWith(incoming.slice(0, size))) {
      return existing + incoming.slice(size)
    }
  }

  return existing + incoming
}

function emitToolCalls(toolCallsMap: Map<number, AIToolCall>, callbacks: StreamCallbacks) {
  for (const [, toolCall] of [...toolCallsMap.entries()].sort((a, b) => a[0] - b[0])) {
    if (toolCall.name) {
      callbacks.onToolCall(toolCall)
    }
  }
}

function mergeToolCalls(toolCallsMap: Map<number, AIToolCall>, toolCalls: Array<Record<string, unknown>>) {
  toolCalls.forEach((toolCall, index) => {
    const toolIndex = Number(toolCall.index ?? index)
    if (!toolCallsMap.has(toolIndex)) {
      toolCallsMap.set(toolIndex, {
        id: `call_${toolIndex}`,
        name: '',
        arguments: ''
      })
    }

    const existing = toolCallsMap.get(toolIndex)!
    const fn = (toolCall.function as Record<string, unknown> | undefined) ?? {}
    const rawArguments = fn.arguments ?? toolCall.arguments ?? ''
    const nextArguments = typeof rawArguments === 'string'
      ? rawArguments
      : JSON.stringify(rawArguments || {})

    if (typeof toolCall.id === 'string' && toolCall.id) {
      existing.id = toolCall.id
    }

    if (typeof fn.name === 'string' && fn.name) {
      existing.name = fn.name
    } else if (typeof toolCall.name === 'string' && toolCall.name) {
      existing.name = toolCall.name
    }

    if (nextArguments) {
      existing.arguments = mergeStreamingArgumentText(existing.arguments, nextArguments)
    }
  })
}

function collectTextFragments(value: unknown, collector: string[]) {
  if (typeof value === 'string') {
    if (value) {
      collector.push(value)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTextFragments(item, collector))
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  ;['text', 'content', 'summary', 'reasoning', 'thinking'].forEach(key => {
    if (key in record) {
      collectTextFragments(record[key], collector)
    }
  })
}

function extractTextFromUnknown(value: unknown) {
  const collector: string[] = []
  collectTextFragments(value, collector)
  return collector.join('')
}

function extractOpenAIContentDelta(delta: Record<string, unknown>) {
  return extractTextFromUnknown(delta.content)
}

function extractOpenAIReasoningDelta(delta: Record<string, unknown>) {
  const candidates = [delta.reasoning, delta.reasoning_content, delta.reasoningContent, delta.thinking]
  return candidates.map(extractTextFromUnknown).find(Boolean) || ''
}

function extractOpenAIReasoningMessage(message: Record<string, unknown> | undefined) {
  if (!message) {
    return ''
  }

  const candidates = [message.reasoning, message.reasoning_content, message.reasoningContent, message.thinking]
  return candidates.map(extractTextFromUnknown).find(Boolean) || ''
}

function extractAnthropicThinkingBlock(block: Record<string, unknown> | undefined) {
  if (!block) {
    return ''
  }

  return extractTextFromUnknown(block.thinking ?? block.text ?? block.summary)
}

function extractOllamaReasoningMessage(message: Record<string, unknown> | undefined) {
  if (!message) {
    return ''
  }

  return extractTextFromUnknown(message.thinking ?? message.reasoning)
}

function mergeResponsesFunctionCall(
  toolCallsMap: Map<number, AIToolCall>,
  toolIndexById: Map<string, number>,
  outputIndex: number,
  item?: ResponsesOutputItem,
  callId?: string,
  argumentsText?: string
) {
  const resolvedCallId = callId || item?.call_id || item?.id || `call_${outputIndex}`
  if (!toolCallsMap.has(outputIndex)) {
    toolCallsMap.set(outputIndex, {
      id: resolvedCallId,
      name: item?.name || '',
      arguments: ''
    })
  }

  const toolCall = toolCallsMap.get(outputIndex)!
  toolCall.id = resolvedCallId
  if (item?.name) {
    toolCall.name = item.name
  }

  if (argumentsText) {
    toolCall.arguments = mergeStreamingArgumentText(toolCall.arguments, argumentsText)
  } else if (item?.arguments) {
    toolCall.arguments = mergeStreamingArgumentText(toolCall.arguments, item.arguments)
  }

  toolIndexById.set(toolCall.id, outputIndex)
}

function extractResponsesErrorMessage(event: ResponsesStreamEvent) {
  return event.response?.error?.message || event.error?.message || event.message || 'Responses 响应异常'
}

function parseResponsesOutput(response: ResponsesApiResponse) {
  let content = ''
  let reasoningContent = ''
  const toolCalls: AIToolCall[] = []

  for (const item of response.output ?? []) {
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && part.text) {
          content += part.text
        }
      }
      continue
    }

    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id || item.id || `call_${toolCalls.length}`,
        name: item.name || '',
        arguments: item.arguments || ''
      })
      continue
    }

    if (item.type === 'reasoning') {
      const summaryText = (item.summary ?? [])
        .map(summary => summary.type === 'summary_text' ? summary.text || '' : '')
        .filter(Boolean)
        .join('')
      reasoningContent += summaryText
    }
  }

  return { content, toolCalls, reasoningContent }
}

function appendAnthropicMessage(
  messages: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }>,
  role: 'user' | 'assistant',
  content: Array<Record<string, unknown>>
) {
  if (content.length === 0) {
    return
  }

  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === role) {
    lastMessage.content.push(...content)
    return
  }

  messages.push({ role, content: [...content] })
}

function buildOpenAIMessagesPayload(messages: AIChatMessage[]) {
  return messages.map(message => {
    const payload: Record<string, unknown> = {
      role: message.role,
      content: buildMessageTextContent(message)
    }

    if (message.role === 'user' && supportsImageInput(message)) {
      const parts: Array<Record<string, unknown>> = []
      const textContent = buildMessageTextContent(message)
      if (textContent) {
        parts.push({ type: 'text', text: textContent })
      }

      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' && attachment.dataUrl) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: attachment.dataUrl
            }
          })
        }
      }

      payload.content = parts
    }

    if (message.toolCalls?.length) {
      payload.tool_calls = message.toolCalls.map(toolCall => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: stringifyToolArguments(toolCall.name, toolCall.arguments)
        }
      }))
    }

    if (message.toolCallId) {
      payload.tool_call_id = message.toolCallId
    }

    return payload
  })
}

function buildOllamaMessagesPayload(messages: AIChatMessage[]) {
  const toolCallNames = new Map<string, string>()

  return messages
    .filter(message => message.role !== 'system')
    .map(message => {
      const payload: Record<string, unknown> = {
        role: message.role,
        content: buildMessageTextContent(message)
      }

      if (supportsImageInput(message)) {
        payload.images = (message.attachments ?? [])
          .filter((attachment): attachment is AIChatAttachment & { type: 'image'; dataUrl: string } => attachment.type === 'image' && typeof attachment.dataUrl === 'string' && attachment.dataUrl.length > 0)
          .map(attachment => stripDataUrlPrefix(attachment.dataUrl))
      }

      if (message.toolCalls?.length) {
        const normalizedToolCalls = message.toolCalls.filter(toolCall => toolCall.name.trim())
        if (normalizedToolCalls.length > 0) {
          payload.tool_calls = normalizedToolCalls.map(toolCall => {
            toolCallNames.set(toolCall.id, toolCall.name)
            return {
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: parseToolArguments(toolCall.name, toolCall.arguments)
              }
            }
          })
        }
      }

      if (message.toolCallId) {
        payload.tool_call_id = message.toolCallId
      }

      if (message.role === 'tool') {
        payload.tool_name = message.toolName || (message.toolCallId ? toolCallNames.get(message.toolCallId) : '') || 'tool_result'
      }

      return payload
    })
}

function buildAnthropicPayload(messages: AIChatMessage[]) {
  const systemParts: string[] = []
  const conversation: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = []

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) {
        systemParts.push(message.content.trim())
      }
      continue
    }

    if (message.role === 'user') {
      const blocks: Array<Record<string, unknown>> = []
      const textContent = buildMessageTextContent(message)

      if (textContent || !supportsImageInput(message)) {
        blocks.push({ type: 'text', text: textContent || '' })
      }

      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' && attachment.dataUrl) {
          const [meta, base64 = ''] = attachment.dataUrl.split(',', 2)
          const mediaType = meta.replace(/^data:/i, '').replace(/;base64$/i, '') || attachment.mimeType
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64
            }
          })
        }
      }

      appendAnthropicMessage(conversation, 'user', blocks)
      continue
    }

    if (message.role === 'assistant') {
      const blocks: Array<Record<string, unknown>> = []

      if (message.content) {
        blocks.push({ type: 'text', text: message.content })
      }

      for (const toolCall of message.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: parseToolArguments(toolCall.name, toolCall.arguments)
        })
      }

      appendAnthropicMessage(conversation, 'assistant', blocks)
      continue
    }

    if (message.role === 'tool') {
      if (message.toolCallId) {
        appendAnthropicMessage(conversation, 'user', [{
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: message.content || ''
        }])
      } else if (message.content) {
        appendAnthropicMessage(conversation, 'user', [{ type: 'text', text: message.content }])
      }
    }
  }

  return {
    system: systemParts.join('\n\n'),
    messages: conversation
  }
}

function buildAnthropicTools(tools: OpenAIToolDefinition[]) {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }))
}

function appendGeminiMessage(messages: GeminiContent[], role: 'user' | 'model', parts: GeminiPart[]) {
  if (parts.length === 0) {
    return
  }

  messages.push({ role, parts: cloneGeminiParts(parts) })
}

function getGeminiThoughtSignature(part: GeminiPart) {
  if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
    return part.thoughtSignature
  }

  if (typeof part.thought_signature === 'string' && part.thought_signature.trim()) {
    return part.thought_signature
  }

  return ''
}

function cloneGeminiPart(part: GeminiPart): GeminiPart {
  const nextPart: GeminiPart = {}

  if (typeof part.text === 'string') {
    nextPart.text = part.text
  }

  if (part.inlineData && typeof part.inlineData === 'object') {
    nextPart.inlineData = {
      mimeType: typeof part.inlineData.mimeType === 'string' ? part.inlineData.mimeType : undefined,
      data: typeof part.inlineData.data === 'string' ? part.inlineData.data : undefined
    }
  }

  if (part.functionCall && typeof part.functionCall === 'object') {
    nextPart.functionCall = {
      name: typeof part.functionCall.name === 'string' ? part.functionCall.name : undefined,
      args: part.functionCall.args && typeof part.functionCall.args === 'object' && !Array.isArray(part.functionCall.args)
        ? part.functionCall.args
        : {}
    }
  }

  if (part.functionResponse && typeof part.functionResponse === 'object') {
    nextPart.functionResponse = {
      name: typeof part.functionResponse.name === 'string' ? part.functionResponse.name : undefined,
      response: part.functionResponse.response && typeof part.functionResponse.response === 'object' && !Array.isArray(part.functionResponse.response)
        ? part.functionResponse.response
        : {}
    }
  }

  if (typeof part.thought === 'boolean') {
    nextPart.thought = part.thought
  }

  const thoughtSignature = getGeminiThoughtSignature(part)
  if (thoughtSignature) {
    nextPart.thoughtSignature = thoughtSignature
  }

  return nextPart
}

function cloneGeminiParts(parts: GeminiPart[] | undefined) {
  return Array.isArray(parts) ? parts.map(part => cloneGeminiPart(part)) : []
}

function normalizeStoredGeminiParts(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as GeminiPart[]
  }

  return value
    .filter((item): item is GeminiPart => Boolean(item) && typeof item === 'object')
    .map(item => cloneGeminiPart(item))
    .filter(part => Object.keys(part).length > 0)
}

function parseGeminiFunctionResponseValue(content: string) {
  if (!content.trim()) {
    return { content: '' }
  }

  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return { result: parsed }
  } catch {
    return { content }
  }
}

function buildGeminiSystemInstruction(messages: AIChatMessage[]) {
  const systemText = messages
    .filter(message => message.role === 'system')
    .map(message => buildMessageTextContent(message).trim())
    .filter(Boolean)
    .join('\n\n')

  if (!systemText) {
    return undefined
  }

  return {
    parts: [{ text: systemText }]
  }
}

function buildGeminiContents(messages: AIChatMessage[]) {
  const conversation: GeminiContent[] = []
  const toolCallNames = new Map<string, string>()

  for (const message of messages) {
    if (message.role === 'system') {
      continue
    }

    if (message.role === 'user') {
      const parts: GeminiPart[] = []
      const textContent = buildMessageTextContent(message)

      if (textContent || !supportsImageInput(message)) {
        parts.push({ text: textContent || '' })
      }

      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' && attachment.dataUrl) {
          const [meta, base64 = ''] = attachment.dataUrl.split(',', 2)
          const mimeType = meta.replace(/^data:/i, '').replace(/;base64$/i, '') || attachment.mimeType || 'image/png'
          parts.push({
            inlineData: {
              mimeType,
              data: base64
            }
          })
        }
      }

      appendGeminiMessage(conversation, 'user', parts)
      continue
    }

    if (message.role === 'assistant') {
      const storedParts = normalizeStoredGeminiParts(message.providerMetadata?.geminiParts)
      if (storedParts.length > 0) {
        for (const toolCall of message.toolCalls ?? []) {
          if (toolCall.name.trim()) {
            toolCallNames.set(toolCall.id, toolCall.name)
          }
        }

        appendGeminiMessage(conversation, 'model', storedParts)
        continue
      }

      const parts: GeminiPart[] = []

      if (message.content) {
        parts.push({ text: message.content })
      }

      for (const toolCall of message.toolCalls ?? []) {
        if (!toolCall.name.trim()) {
          continue
        }

        toolCallNames.set(toolCall.id, toolCall.name)
        const thoughtSignature = typeof toolCall.providerMetadata?.geminiThoughtSignature === 'string'
          ? toolCall.providerMetadata.geminiThoughtSignature
          : ''

        parts.push({
          functionCall: {
            name: toolCall.name,
            args: parseToolArguments(toolCall.name, toolCall.arguments)
          },
          ...(thoughtSignature ? { thoughtSignature } : {})
        })
      }

      appendGeminiMessage(conversation, 'model', parts)
      continue
    }

    if (message.role === 'tool') {
      if (message.toolCallId) {
        const toolName = message.toolName || toolCallNames.get(message.toolCallId) || 'tool_result'
        appendGeminiMessage(conversation, 'user', [{
          functionResponse: {
            name: toolName,
            response: parseGeminiFunctionResponseValue(message.content || '')
          }
        }])
      } else if (message.content) {
        appendGeminiMessage(conversation, 'user', [{ text: message.content }])
      }
    }
  }

  return conversation
}

function buildGeminiTools(config: AIConfig) {
  const declarations = getAvailableTools(config.protocol)
    .filter(tool => tool.function.name.trim())
    .map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }))

  return declarations.length > 0
    ? [{ functionDeclarations: declarations }]
    : []
}

function buildGeminiGenerateContentUrl(baseUrl: string, model: string, stream = false) {
  const normalizedModel = normalizeGeminiModelName(model)
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  return `${ensureGeminiBase(baseUrl)}/models/${encodeURIComponent(normalizedModel)}:${action}`
}

function buildGeminiBody(
  config: AIConfig,
  messages: AIChatMessage[],
  includeTools = true
) {
  const limits = resolveConfigTokenLimits(config)
  const body: Record<string, unknown> = {
    contents: buildGeminiContents(messages),
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: limits.maxOutputTokens
    }
  }

  const systemInstruction = buildGeminiSystemInstruction(messages)
  if (systemInstruction) {
    body.systemInstruction = systemInstruction
  }

  const tools = includeTools ? buildGeminiTools(config) : []
  if (tools.length > 0) {
    body.tools = tools
    body.toolConfig = {
      functionCallingConfig: {
        mode: 'AUTO'
      }
    }
  }

  return body
}

function parseGeminiCandidate(candidate: GeminiCandidate | undefined) {
  let content = ''
  let reasoningContent = ''
  const toolCalls: AIToolCall[] = []
  const parts = cloneGeminiParts(candidate?.content?.parts)

  for (const [index, part] of parts.entries()) {
    if (typeof part.text === 'string' && part.text) {
      if (part.thought) {
        reasoningContent += part.text
      } else {
        content += part.text
      }
    }

    if (part.functionCall?.name) {
      const thoughtSignature = getGeminiThoughtSignature(part)
      toolCalls.push({
        id: `gemini_call_${index}`,
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args || {}),
        ...(thoughtSignature ? { providerMetadata: { geminiThoughtSignature: thoughtSignature } } : {})
      })
    }
  }

  return { content, reasoningContent, toolCalls, parts }
}

function normalizeGeminiResponseChunks(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is GeminiGenerateContentResponse => Boolean(item) && typeof item === 'object')
  }

  if (payload && typeof payload === 'object') {
    return [payload as GeminiGenerateContentResponse]
  }

  return []
}

function extractGeminiErrorMessage(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as GeminiGenerateContentResponse
    return parsed.error?.message || rawText
  } catch {
    return rawText
  }
}

function mergeGeminiToolCalls(toolCallsMap: Map<number, AIToolCall>, candidate: GeminiCandidate | undefined, candidateIndex: number) {
  for (const [partIndex, part] of cloneGeminiParts(candidate?.content?.parts).entries()) {
    if (!part.functionCall?.name) {
      continue
    }

    const toolIndex = candidateIndex * 100 + partIndex
    const nextArguments = JSON.stringify(part.functionCall.args || {})
    const thoughtSignature = getGeminiThoughtSignature(part)
    if (!toolCallsMap.has(toolIndex)) {
      toolCallsMap.set(toolIndex, {
        id: `gemini_call_${candidateIndex}_${partIndex}`,
        name: part.functionCall.name,
        arguments: nextArguments,
        ...(thoughtSignature ? { providerMetadata: { geminiThoughtSignature: thoughtSignature } } : {})
      })
      continue
    }

    const existing = toolCallsMap.get(toolIndex)!
    existing.name = part.functionCall.name
    existing.arguments = mergeStreamingArgumentText(existing.arguments, nextArguments)
    if (thoughtSignature) {
      existing.providerMetadata = {
        ...(existing.providerMetadata ?? {}),
        geminiThoughtSignature: thoughtSignature
      }
    }
  }
}

function buildOpenAICompatibleBody(
  config: AIConfig,
  messages: AIChatMessage[],
  stream: boolean,
  includeTools = true,
  preferences?: Partial<AIChatPreferences>,
  includeThinking = true
) {
  const limits = resolveConfigTokenLimits(config)
  const body: Record<string, unknown> = {
    model: config.model,
    messages: buildOpenAIMessagesPayload(messages),
    temperature: config.temperature,
    max_tokens: limits.maxOutputTokens,
    stream
  }

  if (includeTools) {
    body.tools = getAvailableTools(config.protocol)
  }

  if (includeThinking && supportsThinkingMode(config, preferences)) {
    body.reasoning_effort = getThinkingLevel(preferences)
  }

  return body
}

function buildResponsesInputItems(messages: AIChatMessage[]): ResponsesInputItem[] {
  return messages.flatMap(message => {
    if (message.role === 'system') {
      const content = buildMessageTextContent(message).trim()
      return content ? [{ role: 'system', content }] : []
    }

    if (message.role === 'user') {
      const textContent = buildMessageTextContent(message)
      if (!supportsImageInput(message)) {
        return [{ role: 'user', content: textContent }]
      }

      const contentParts: ResponsesContentPart[] = []
      if (textContent) {
        contentParts.push({ type: 'input_text', text: textContent })
      }

      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' && attachment.dataUrl) {
          contentParts.push({
            type: 'input_image',
            image_url: attachment.dataUrl
          })
        }
      }

      return [{ role: 'user', content: contentParts }]
    }

    if (message.role === 'assistant') {
      const items: ResponsesInputItem[] = []
      const textContent = buildMessageTextContent(message)
      if (textContent) {
        items.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: textContent }]
        })
      }

      for (const toolCall of message.toolCalls ?? []) {
        items.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments || '{}',
          id: toolCall.id
        })
      }

      return items
    }

    const output = buildMessageTextContent(message) || '(empty)'
    return [{
      type: 'function_call_output',
      call_id: message.toolCallId || '',
      output
    }]
  })
}

function buildResponsesToolDefinitions(config: AIConfig): ResponsesToolDefinition[] {
  return getAvailableTools(config.protocol).map(tool => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }))
}

function buildOpenAIResponsesBody(
  config: AIConfig,
  messages: AIChatMessage[],
  stream: boolean,
  includeTools = true,
  preferences?: Partial<AIChatPreferences>,
  includeThinking = true
) {
  const limits = resolveConfigTokenLimits(config)
  const body: Record<string, unknown> = {
    model: config.model,
    input: buildResponsesInputItems(messages),
    stream,
    store: false,
    max_output_tokens: limits.maxOutputTokens,
    temperature: config.temperature
  }

  if (includeTools) {
    body.tools = buildResponsesToolDefinitions(config)
  }

  if (includeThinking && supportsThinkingMode(config, preferences)) {
    body.reasoning = {
      effort: getThinkingLevel(preferences),
      summary: 'auto'
    }
  }

  return body
}

function buildOllamaBody(
  config: AIConfig,
  messages: AIChatMessage[],
  stream: boolean,
  includeTools = true
) {
  const limits = resolveConfigTokenLimits(config)
  const systemMessage = messages.find(message => message.role === 'system')
  const body: Record<string, unknown> = {
    model: config.model,
    messages: buildOllamaMessagesPayload(messages),
    stream,
    options: {
      temperature: config.temperature,
      num_predict: limits.maxOutputTokens
    }
  }

  if (systemMessage?.content.trim()) {
    body.system = systemMessage.content
  }

  if (includeTools) {
    body.tools = getAvailableTools(config.protocol).map(tool => ({
      type: tool.type,
      function: tool.function
    }))
  }

  return body
}

function shouldRetryWithoutTools(protocol: SupportedProtocol, status: number, errorText: string) {
  return (protocol === 'openai' || protocol === 'gemini' || protocol === 'ollama-local' || protocol === 'ollama-cloud')
    && (status === 400 || status === 404 || status === 422)
    && /tool|tools|function|schema|unsupported/i.test(errorText)
}

function shouldRetryWithoutThinking(status: number, errorText: string) {
  return (status === 400 || status === 404 || status === 422)
    && /thinking|reasoning|reasoning_effort|budget_tokens|unsupported/i.test(errorText)
}

async function requestOpenAICompatible(
  config: AIConfig,
  stream: boolean,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const protocol = resolveConfigProtocol(config)
  const url = normalizeChatUrl(config.baseUrl, protocol)
  const allowTools = options?.includeTools !== false
  const queue: Array<{ includeTools: boolean; includeThinking: boolean }> = [{ includeTools: allowTools, includeThinking: true }]
  const attempted = new Set<string>()
  let lastErrorText = ''
  let lastStatus = 500

  while (queue.length > 0) {
    const attempt = queue.shift()!
    const attemptKey = `${attempt.includeTools}-${attempt.includeThinking}`
    if (attempted.has(attemptKey)) {
      continue
    }

    attempted.add(attemptKey)
    const response = await fetch(url, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
      body: JSON.stringify(buildOpenAICompatibleBody(config, messages, stream, attempt.includeTools, preferences, attempt.includeThinking)),
      signal
    })

    if (response.ok) {
      return { response, includeTools: attempt.includeTools, includeThinking: attempt.includeThinking }
    }

    lastStatus = response.status
    lastErrorText = await response.text()

    if (allowTools && attempt.includeTools && shouldRetryWithoutTools(protocol, response.status, lastErrorText)) {
      queue.push({ includeTools: false, includeThinking: attempt.includeThinking })
    }

    if (attempt.includeThinking && shouldRetryWithoutThinking(response.status, lastErrorText)) {
      queue.push({ includeTools: attempt.includeTools, includeThinking: false })
    }
  }

  throw new OpenAIRequestError(
    'chat-completions',
    lastStatus,
    lastErrorText,
    `API 请求失败 (${lastStatus}): ${lastErrorText.slice(0, 200)}`
  )
}

async function requestOpenAIResponses(
  config: AIConfig,
  stream: boolean,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const url = normalizeResponsesUrl(config.baseUrl)
  const allowTools = options?.includeTools !== false
  const queue: Array<{ includeTools: boolean; includeThinking: boolean }> = [{ includeTools: allowTools, includeThinking: true }]
  const attempted = new Set<string>()
  let lastErrorText = ''
  let lastStatus = 500

  while (queue.length > 0) {
    const attempt = queue.shift()!
    const attemptKey = `${attempt.includeTools}-${attempt.includeThinking}`
    if (attempted.has(attemptKey)) {
      continue
    }

    attempted.add(attemptKey)
    const response = await fetch(url, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
      body: JSON.stringify(buildOpenAIResponsesBody(config, messages, stream, attempt.includeTools, preferences, attempt.includeThinking)),
      signal
    })

    if (response.ok) {
      return { response, includeTools: attempt.includeTools, includeThinking: attempt.includeThinking }
    }

    lastStatus = response.status
    lastErrorText = await response.text()

    if (allowTools && attempt.includeTools && shouldRetryWithoutTools('openai', response.status, lastErrorText)) {
      queue.push({ includeTools: false, includeThinking: attempt.includeThinking })
    }

    if (attempt.includeThinking && shouldRetryWithoutThinking(response.status, lastErrorText)) {
      queue.push({ includeTools: attempt.includeTools, includeThinking: false })
    }
  }

  throw new OpenAIRequestError(
    'responses',
    lastStatus,
    lastErrorText,
    `Responses 请求失败 (${lastStatus}): ${lastErrorText.slice(0, 200)}`
  )
}

async function streamOpenAIResponsesFlow(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const { response } = await requestOpenAIResponses(config, true, messages, preferences, options, signal)

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError('响应体为空')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const toolCallsMap = new Map<number, AIToolCall>()
  const toolIndexById = new Map<string, number>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || !trimmedLine.startsWith('data:')) {
        continue
      }

      const payload = trimmedLine.slice(5).trim()
      if (payload === '[DONE]') {
        emitToolCalls(toolCallsMap, callbacks)
        await callbacks.onDone()
        return
      }

      try {
        const event = JSON.parse(payload) as ResponsesStreamEvent
        const eventType = event.type || ''

        if (eventType === 'response.output_text.delta') {
          const textDelta = event.delta || event.text || ''
          if (textDelta) {
            callbacks.onToken(textDelta)
          }
          continue
        }

        if (eventType === 'response.reasoning_summary_text.delta') {
          const reasoningDelta = event.delta || event.text || ''
          if (reasoningDelta) {
            callbacks.onReasoning?.(reasoningDelta)
          }
          continue
        }

        if (eventType === 'response.output_item.added' && event.item?.type === 'function_call') {
          const outputIndex = Number(event.output_index ?? toolCallsMap.size)
          mergeResponsesFunctionCall(toolCallsMap, toolIndexById, outputIndex, event.item)
          continue
        }

        if (eventType === 'response.function_call_arguments.delta' || eventType === 'response.function_call_arguments.done') {
          const outputIndex = typeof event.output_index === 'number'
            ? event.output_index
            : (event.call_id ? toolIndexById.get(event.call_id) : undefined) ?? (event.item_id ? toolIndexById.get(event.item_id) : undefined) ?? toolCallsMap.size
          mergeResponsesFunctionCall(toolCallsMap, toolIndexById, outputIndex, undefined, event.call_id || event.item_id, event.delta || event.arguments || '')
          continue
        }

        if (eventType === 'response.failed') {
          callbacks.onError(extractResponsesErrorMessage(event))
          return
        }

        if (eventType === 'response.completed' || eventType === 'response.incomplete') {
          const parsedResponse = event.response
          if (parsedResponse) {
            for (const [index, item] of (parsedResponse.output ?? []).entries()) {
              if (item.type === 'function_call') {
                mergeResponsesFunctionCall(toolCallsMap, toolIndexById, index, item)
              }
            }
          }

          emitToolCalls(toolCallsMap, callbacks)
          await callbacks.onDone()
          return
        }
      } catch {
        // 等待下一个 SSE 片段拼接完整。
      }
    }
  }

  emitToolCalls(toolCallsMap, callbacks)
  await callbacks.onDone()
}

async function streamOpenAICompatibleFlow(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const { response } = await requestOpenAICompatible(config, true, messages, preferences, options, signal)

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError('响应体为空')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const toolCallsMap = new Map<number, AIToolCall>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || !trimmedLine.startsWith('data:')) {
        continue
      }

      const payload = trimmedLine.slice(5).trim()
      if (payload === '[DONE]') {
        emitToolCalls(toolCallsMap, callbacks)
        await callbacks.onDone()
        return
      }

      try {
        const parsed = JSON.parse(payload)
        const choice = parsed.choices?.[0]
        const delta = (choice?.delta ?? {}) as Record<string, unknown>

        if (!delta) {
          continue
        }

        const contentDelta = extractOpenAIContentDelta(delta)
        const reasoningDelta = extractOpenAIReasoningDelta(delta)

        if (contentDelta) {
          callbacks.onToken(contentDelta)
        }

        if (reasoningDelta) {
          callbacks.onReasoning?.(reasoningDelta)
        }

        if (Array.isArray(delta.tool_calls)) {
          mergeToolCalls(toolCallsMap, delta.tool_calls)
        }

        if (choice?.finish_reason === 'tool_calls' || choice?.finish_reason === 'stop') {
          emitToolCalls(toolCallsMap, callbacks)
          await callbacks.onDone()
          return
        }
      } catch {
        // 等待下一个 SSE 片段拼接完整。
      }
    }
  }

  emitToolCalls(toolCallsMap, callbacks)
  await callbacks.onDone()
}

async function chatCompletionOpenAIResponsesFlow(
  config: AIConfig,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const { response } = await requestOpenAIResponses(config, false, messages, preferences, options, signal)
  const data = await response.json() as ResponsesApiResponse
  if (data.status === 'failed') {
    throw new Error(data.error?.message || 'Responses 请求失败')
  }

  return parseResponsesOutput(data)
}

async function chatCompletionOpenAICompatibleFlow(
  config: AIConfig,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const { response } = await requestOpenAICompatible(config, false, messages, preferences, options, signal)
  const data = await response.json()
  const choice = data.choices?.[0]?.message
  const content = choice?.content ?? ''
  const reasoningContent = extractOpenAIReasoningMessage(choice)
  const toolCalls: AIToolCall[] = (choice?.tool_calls ?? []).map((toolCall: Record<string, unknown>, index: number) => ({
    id: String(toolCall.id || `call_${index}`),
    name: String((toolCall.function as { name?: string } | undefined)?.name || ''),
    arguments: String((toolCall.function as { arguments?: string } | undefined)?.arguments || '')
  }))

  return { content, toolCalls, reasoningContent }
}

async function requestGemini(
  config: AIConfig,
  stream: boolean,
  messages: AIChatMessage[],
  _preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const url = buildGeminiGenerateContentUrl(config.baseUrl, config.model, stream)
  const allowTools = options?.includeTools !== false
  const queue: Array<{ includeTools: boolean }> = [{ includeTools: allowTools }]
  const attempted = new Set<string>()
  let lastErrorText = ''
  let lastStatus = 500

  while (queue.length > 0) {
    const attempt = queue.shift()!
    const attemptKey = String(attempt.includeTools)
    if (attempted.has(attemptKey)) {
      continue
    }

    attempted.add(attemptKey)
    const response = await fetch(url, {
      method: 'POST',
      headers: buildGeminiHeaders(config),
      body: JSON.stringify(buildGeminiBody(config, messages, attempt.includeTools)),
      signal
    })

    if (response.ok) {
      return { response, includeTools: attempt.includeTools }
    }

    lastStatus = response.status
    lastErrorText = extractGeminiErrorMessage(await response.text())

    if (allowTools && attempt.includeTools && shouldRetryWithoutTools('gemini', response.status, lastErrorText)) {
      queue.push({ includeTools: false })
    }
  }

  throw new Error(`Gemini 请求失败 (${lastStatus}): ${lastErrorText.slice(0, 200)}`)
}

async function streamGeminiChat(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  try {
    const { response } = await requestGemini(config, true, messages, preferences, options, signal)
    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('响应体为空')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const toolCallsMap = new Map<number, AIToolCall>()
    const previousTextByCandidate = new Map<number, string>()
    const previousReasoningByCandidate = new Map<number, string>()
    const finalPartsByCandidate = new Map<number, GeminiPart[]>()

    const emitGeminiProviderMetadata = () => {
      const parts = finalPartsByCandidate.get(0)
      if (parts?.length) {
        callbacks.onProviderMetadata?.({ geminiParts: parts })
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || !line.startsWith('data:')) {
          continue
        }

        const payload = line.slice(5).trim()
        if (!payload) {
          continue
        }

        if (payload === '[DONE]') {
          emitToolCalls(toolCallsMap, callbacks)
          emitGeminiProviderMetadata()
          await callbacks.onDone()
          return
        }

        try {
          const chunks = normalizeGeminiResponseChunks(JSON.parse(payload))
          for (const chunk of chunks) {
            if (chunk.error?.message) {
              callbacks.onError(chunk.error.message)
              return
            }

            for (const [candidateIndex, candidate] of (chunk.candidates ?? []).entries()) {
              const parsed = parseGeminiCandidate(candidate)
              if (parsed.parts.length > 0) {
                finalPartsByCandidate.set(candidateIndex, parsed.parts)
              }
              const previousText = previousTextByCandidate.get(candidateIndex) || ''
              const previousReasoning = previousReasoningByCandidate.get(candidateIndex) || ''
              const nextText = parsed.content
              const nextReasoning = parsed.reasoningContent
              const textDelta = nextText.startsWith(previousText) ? nextText.slice(previousText.length) : nextText
              const reasoningDelta = nextReasoning.startsWith(previousReasoning) ? nextReasoning.slice(previousReasoning.length) : nextReasoning

              if (textDelta) {
                callbacks.onToken(textDelta)
              }

              if (reasoningDelta) {
                callbacks.onReasoning?.(reasoningDelta)
              }

              previousTextByCandidate.set(candidateIndex, nextText)
              previousReasoningByCandidate.set(candidateIndex, nextReasoning)
              mergeGeminiToolCalls(toolCallsMap, candidate, candidateIndex)
            }
          }
        } catch {
          // 等待下一个 SSE 片段拼接完整。
        }
      }
    }

    emitToolCalls(toolCallsMap, callbacks)
    emitGeminiProviderMetadata()
    await callbacks.onDone()
  } catch (error) {
    if (signal?.aborted) {
      return
    }

    callbacks.onError(`请求失败: ${(error as Error).message}`)
  }
}

async function chatCompletionGemini(
  config: AIConfig,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const { response } = await requestGemini(config, false, messages, preferences, options, signal)
  const data = await response.json() as GeminiGenerateContentResponse
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  if ((!data.candidates || data.candidates.length === 0) && data.promptFeedback?.blockReason) {
    throw new Error(`Gemini 请求被拦截: ${data.promptFeedback.blockReason}`)
  }

  return parseGeminiCandidate(data.candidates?.[0])
}

async function requestOllama(
  config: AIConfig,
  stream: boolean,
  messages: AIChatMessage[],
  _preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const protocol = resolveConfigProtocol(config)
  if (protocol !== 'ollama-local' && protocol !== 'ollama-cloud') {
    throw new Error('当前配置不是 Ollama 协议')
  }

  const url = normalizeChatUrl(config.baseUrl, protocol)
  let includeTools = options?.includeTools !== false
  let response = await fetch(url, {
    method: 'POST',
    headers: buildOllamaHeaders(config),
    body: JSON.stringify(buildOllamaBody(config, messages, stream, includeTools)),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()

    if (includeTools && shouldRetryWithoutTools(protocol, response.status, errorText)) {
      includeTools = false
      response = await fetch(url, {
        method: 'POST',
        headers: buildOllamaHeaders(config),
        body: JSON.stringify(buildOllamaBody(config, messages, stream, includeTools)),
        signal
      })

      if (response.ok) {
        return { response, includeTools }
      }

      const retryErrorText = await response.text()
      throw new Error(`Ollama 请求失败 (${response.status}): ${retryErrorText.slice(0, 200)}`)
    }

    throw new Error(`Ollama 请求失败 (${response.status}): ${errorText.slice(0, 200)}`)
  }

  return { response, includeTools }
}

function parseOpenAIModels(data: unknown): AIProviderModel[] {
  const rawModels = Array.isArray((data as { data?: unknown[] } | null)?.data)
    ? (data as { data: Array<Record<string, unknown>> }).data
    : []

  return rawModels.reduce<AIProviderModel[]>((result, model) => {
      const id = String(model.id || '')
      if (!id) {
        return result
      }

      const capabilities = inferModelCapabilities(id, 'openai', model)
      const limits = inferModelLimits(id, 'openai', model)
      result.push({
        id,
        name: id,
        label: id,
        description: [
          typeof model.owned_by === 'string' ? model.owned_by : '',
          getModelCapabilityLabels(capabilities).join(' / '),
          getModelLimitLabels(limits).join(' / ')
        ].filter(Boolean).join(' · ') || undefined,
        provider: typeof model.owned_by === 'string' ? model.owned_by : 'OpenAI 兼容',
        capabilities,
        limits
      })

      return result
    }, [])
}

function parseAnthropicModels(data: unknown): AIProviderModel[] {
  const rawModels = Array.isArray((data as { data?: unknown[] } | null)?.data)
    ? (data as { data: Array<Record<string, unknown>> }).data
    : []

  return rawModels.reduce<AIProviderModel[]>((result, model) => {
      const id = String(model.id || '')
      if (!id) {
        return result
      }

      const displayName = typeof model.display_name === 'string' ? model.display_name.trim() : ''
      const capabilities = inferModelCapabilities(id, 'anthropic', model)
      const limits = inferModelLimits(id, 'anthropic', model)
      result.push({
        id,
        name: id,
        label: displayName || id,
        description: [
          displayName && displayName !== id ? id : '',
          getModelCapabilityLabels(capabilities).join(' / '),
          getModelLimitLabels(limits).join(' / ')
        ].filter(Boolean).join(' · ') || undefined,
        provider: 'Anthropic 兼容',
        capabilities,
        limits
      })

      return result
    }, [])
}

function parseGeminiModels(data: unknown): AIProviderModel[] {
  const rawModels = Array.isArray((data as { models?: unknown[] } | null)?.models)
    ? (data as { models: Array<Record<string, unknown>> }).models
    : []

  return rawModels.reduce<AIProviderModel[]>((result, model) => {
      const rawName = String(model.name || model.id || '')
      const name = normalizeGeminiModelName(rawName)
      if (!name) {
        return result
      }

      const displayName = typeof model.displayName === 'string'
        ? model.displayName.trim()
        : typeof model.display_name === 'string'
          ? model.display_name.trim()
          : ''
      const capabilities = inferModelCapabilities(name, 'gemini', model)
      const limits = inferModelLimits(name, 'gemini', model)
      result.push({
        id: name,
        name,
        label: displayName || name,
        description: [
          typeof model.description === 'string' ? model.description.trim() : '',
          getModelCapabilityLabels(capabilities).join(' / '),
          getModelLimitLabels(limits).join(' / ')
        ].filter(Boolean).join(' · ') || undefined,
        provider: 'Gemini 兼容',
        capabilities,
        limits
      })

      return result
    }, [])
}

function parseOllamaModels(data: unknown): AIProviderModel[] {
  const rawModels = Array.isArray((data as { models?: unknown[] } | null)?.models)
    ? (data as { models: Array<Record<string, unknown>> }).models
    : []

  return rawModels.reduce<AIProviderModel[]>((result, model) => {
      const name = String(model.name || model.model || '')
      if (!name) {
        return result
      }

      const details = (model.details as Record<string, unknown> | undefined) || {}
      const descriptionParts = [details.parameter_size, details.quantization_level]
        .filter((item): item is string => typeof item === 'string' && item.length > 0)

      const capabilities = inferModelCapabilities(name, 'ollama-local', model)
      const limits = inferModelLimits(name, 'ollama-local', model)
      result.push({
        id: name,
        name,
        label: name,
        description: [descriptionParts.join(' · '), getModelCapabilityLabels(capabilities).join(' / '), getModelLimitLabels(limits).join(' / ')].filter(Boolean).join(' · ') || undefined,
        provider: 'Ollama',
        capabilities,
        limits
      })

      return result
    }, [])
}

async function fetchOpenAICompatibleModels(config: AIConfig, signal?: AbortSignal) {
  const response = await fetch(normalizeModelsUrl(config.baseUrl, resolveConfigProtocol(config)), {
    method: 'GET',
    headers: buildOpenAICompatibleHeaders(config),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`模型列表请求失败 (${response.status}): ${errorText.slice(0, 200)}`)
  }

  return parseOpenAIModels(await response.json())
}

async function fetchAnthropicModels(config: AIConfig, signal?: AbortSignal) {
  const response = await fetch(`${ensureAnthropicBase(config.baseUrl)}/models`, {
    method: 'GET',
    headers: buildAnthropicHeaders(config),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(`Anthropic 模型列表请求失败 (${response.status}): ${errorText.slice(0, 200)}`) as AnthropicModelsError
    error.fallbackToStatic = response.status === 404 || response.status === 405 || response.status === 501
    throw error
  }

  return parseAnthropicModels(await response.json())
}

async function fetchGeminiModels(config: AIConfig, signal?: AbortSignal) {
  const response = await fetch(normalizeModelsUrl(config.baseUrl, 'gemini'), {
    method: 'GET',
    headers: buildGeminiHeaders(config),
    signal
  })

  if (!response.ok) {
    const errorText = extractGeminiErrorMessage(await response.text())
    throw new Error(`Gemini 模型列表请求失败 (${response.status}): ${errorText.slice(0, 200)}`)
  }

  return parseGeminiModels(await response.json())
}

async function fetchOllamaModels(config: AIConfig, signal?: AbortSignal) {
  const protocol = resolveConfigProtocol(config)
  if (protocol !== 'ollama-local' && protocol !== 'ollama-cloud') {
    return []
  }

  const response = await fetch(normalizeModelsUrl(config.baseUrl, protocol), {
    method: 'GET',
    headers: buildOllamaHeaders(config),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ollama 模型列表请求失败 (${response.status}): ${errorText.slice(0, 200)}`)
  }

  return parseOllamaModels(await response.json())
}

export async function fetchAvailableModels(config: AIConfig, signal?: AbortSignal): Promise<AIProviderModel[]> {
  const protocol = resolveConfigProtocol(config)

  if (protocol === 'anthropic') {
    try {
      const remoteModels = await fetchAnthropicModels(config, signal)
      if (remoteModels.length > 0) {
        return remoteModels
      }
    } catch (error) {
      const fallbackError = error as AnthropicModelsError
      if (!fallbackError.fallbackToStatic) {
        throw error
      }

      // 远端不支持 /models 时，回退到内置常用模型列表。
    }

    return [
      {
        id: 'claude-3-7-sonnet-latest',
        name: 'claude-3-7-sonnet-latest',
        label: 'claude-3-7-sonnet-latest',
        description: 'Anthropic 官方最新 Sonnet · 视觉 / 思考 / 工具 / 规划 / MCP',
        provider: 'Anthropic',
        capabilities: buildModelCapabilities({ vision: true, thinking: true, imageInput: true }),
        limits: inferModelLimits('claude-3-7-sonnet-latest', 'anthropic')
      },
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'claude-3-5-sonnet-latest',
        label: 'claude-3-5-sonnet-latest',
        description: 'Anthropic 官方稳定 Sonnet · 视觉 / 工具 / 规划 / MCP',
        provider: 'Anthropic',
        capabilities: buildModelCapabilities({ vision: true, imageInput: true }),
        limits: inferModelLimits('claude-3-5-sonnet-latest', 'anthropic')
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'claude-3-5-haiku-latest',
        label: 'claude-3-5-haiku-latest',
        description: 'Anthropic 官方快速模型 · 视觉 / 工具 / 规划 / MCP',
        provider: 'Anthropic',
        capabilities: buildModelCapabilities({ vision: true, imageInput: true }),
        limits: inferModelLimits('claude-3-5-haiku-latest', 'anthropic')
      }
    ]
  }

  if (protocol === 'gemini') {
    return fetchGeminiModels(config, signal)
  }

  if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    return fetchOllamaModels(config, signal)
  }

  return fetchOpenAICompatibleModels(config, signal)
}

/** 可供 AI 调用的工具列表 */
export function getAvailableTools(_protocol: AIConfig['protocol']): OpenAIToolDefinition[] {
  const toolList: OpenAIToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'query_accounts',
        description: '查询账号数据。返回结构化 JSON，其中包含账号 ID、类型、状态、字段数据和导出记录。',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'string', description: '账号类型 ID，留空表示查询全部类型' },
            status: { type: 'string', enum: ['in_stock', 'exported', 'all'], description: '账号状态' },
            keyword: { type: 'string', description: '搜索关键字' },
            limit: { type: 'number', description: '返回数量限制，默认 20，最大 100' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'import_accounts',
        description: '批量导入账号。accounts 中每个对象只能使用当前类型已定义的字段 key，缺失必填字段时会直接失败；source 和 totalCost 都是可选元数据。',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'string', description: '账号类型 ID' },
            accounts: {
              type: 'array',
              items: {
                type: 'object',
                description: '账号字段键值对，字段 key 必须与 get_account_types 返回的字段定义一致'
              },
              description: '账号数据数组'
            },
            source: { type: 'string', description: '来源说明，可留空' },
            totalCost: { type: 'number', description: '总成本，可留空或填 0' }
          },
          required: ['typeId', 'accounts']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'export_accounts',
        description: '导出指定账号。accountIds 必须来自 query_accounts 返回的账号 ID，且必须仍处于在库状态；destination 和 totalProfit 都是可选元数据。',
        parameters: {
          type: 'object',
          properties: {
            typeId: { type: 'string', description: '账号类型 ID' },
            accountIds: { type: 'array', items: { type: 'string' }, description: '要导出的账号 ID 列表' },
            destination: { type: 'string', description: '导出目的地，可留空' },
            totalProfit: { type: 'number', description: '总利润，可留空或填 0' }
          },
          required: ['typeId', 'accountIds']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_account_types',
        description: '获取所有账号类型与字段结构、导入分隔符、导出分隔符等规则。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_account_type',
        description: '创建新的账号类型。适合用户明确要求新建账号类型后再导入账号。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '账号类型名称，例如 Google 账号' },
            color: { type: 'string', description: '类型颜色，例如 #5b9bd5' },
            fields: {
              type: 'array',
              description: '字段定义，至少 1 个',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: '字段 key，建议英文小写' },
                  name: { type: 'string', description: '字段中文名' },
                  required: { type: 'boolean', description: '是否必填' }
                },
                required: ['key', 'name', 'required']
              }
            },
            importSeparator: { type: 'string', description: '导入字段分隔符' },
            exportSeparator: { type: 'string', description: '导出字段分隔符' },
            accountSeparator: { type: 'string', description: '导入账号分隔符，留空可用换行' },
            exportAccountSeparator: { type: 'string', description: '导出账号分隔符，留空可用换行' }
          },
          required: ['name', 'fields']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_live2d_models',
        description: '获取当前激活的 Live2D 模型和本地已缓存模型列表。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_windows_mcp_status',
        description: '获取 Windows MCP 是否内置、是否开启、当前可用的系统级能力清单。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'navigate_app',
        description: '打开主窗口并跳转到指定页面。适合把用户带到账号管理、设置、Agent、导入、导出等页面。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              enum: ['/accounts', '/types', '/import', '/export', '/records', '/settings', '/ai-settings', '/ai', '/data'],
              description: '应用页面路由'
            }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'set_live2d_enabled',
        description: '显示或隐藏 Live2D 悬浮窗。',
        parameters: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: 'true 为显示，false 为隐藏' }
          },
          required: ['enabled']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_task_plan',
        description: '创建或更新当前会话的任务计划、步骤和状态。长任务开始时优先调用。',
        parameters: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: '任务目标描述' },
            status: { type: 'string', enum: ['planning', 'running', 'completed', 'blocked'], description: '任务状态' },
            summary: { type: 'string', description: '当前阶段摘要' },
            maxIterations: { type: 'number', description: '最大自主循环步数' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '步骤标题' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'], description: '步骤状态' },
                  note: { type: 'string', description: '步骤说明或阻塞点' }
                },
                required: ['title', 'status']
              }
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'complete_task',
        description: '标记当前会话任务完成，并写入最终摘要。开启自动记忆时会归档到长期记忆。',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '任务完成摘要' }
          },
          required: ['summary']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'remember',
        description: '将重要信息写入长期记忆。适合记录用户偏好、固定格式要求、业务规则和长期目标。',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '要记住的内容' },
            category: { type: 'string', enum: ['preference', 'fact', 'context', 'instruction'], description: '记忆分类' }
          },
          required: ['content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_managed_ai_resources',
        description: '获取当前统一托管的外部 MCP 服务器与技能清单，包括启用状态、工具数量和描述。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'install_mcp_server',
        description: '安装或登记一个可供 AI 调用的托管 MCP 服务器，并自动刷新其工具列表。可用 packageName 安装，也可直接提供 command/args 接入现有服务器。',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '服务器唯一标识，建议英文短名' },
            name: { type: 'string', description: '服务器显示名称' },
            description: { type: 'string', description: '服务器用途说明' },
            packageName: { type: 'string', description: 'npm 包名，例如 @modelcontextprotocol/server-filesystem' },
            entryCommand: { type: 'string', description: '安装后实际启动的入口命令；未知时可省略，默认取包名最后一段' },
            command: { type: 'string', description: '若已存在可执行 MCP 服务，可直接提供启动命令' },
            args: { type: 'array', items: { type: 'string' }, description: '启动参数列表' },
            env: { type: 'object', description: '额外环境变量键值对' },
            cwd: { type: 'string', description: '工作目录' },
            enabled: { type: 'boolean', description: '安装后是否立即启用，默认 true' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'refresh_mcp_server_tools',
        description: '重新探测托管 MCP 服务器当前可用的工具列表，并同步到统一注册表。',
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: '托管 MCP 服务器 ID' }
          },
          required: ['serverId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'set_mcp_server_enabled',
        description: '启用或停用某个托管 MCP 服务器。停用后其工具将不再暴露给模型。',
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: '托管 MCP 服务器 ID' },
            enabled: { type: 'boolean', description: '是否启用' }
          },
          required: ['serverId', 'enabled']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'remove_mcp_server',
        description: '从统一注册表移除一个托管 MCP 服务器。仅移除注册信息，不强制删除本地安装目录。',
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: '托管 MCP 服务器 ID' }
          },
          required: ['serverId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'upsert_ai_skill',
        description: '新增或更新一个统一托管技能。技能内容会注入系统提示词，帮助模型在特定领域稳定执行。',
        parameters: {
          type: 'object',
          properties: {
            skillId: { type: 'string', description: '技能 ID，可留空自动生成' },
            name: { type: 'string', description: '技能名称' },
            description: { type: 'string', description: '技能用途说明' },
            content: { type: 'string', description: '技能正文内容' },
            enabled: { type: 'boolean', description: '是否启用，默认 true' }
          },
          required: ['name', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'set_ai_skill_enabled',
        description: '启用或停用某个托管技能。停用后该技能不再注入系统提示词。',
        parameters: {
          type: 'object',
          properties: {
            skillId: { type: 'string', description: '技能 ID' },
            enabled: { type: 'boolean', description: '是否启用' }
          },
          required: ['skillId', 'enabled']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'remove_ai_skill',
        description: '从统一注册表移除某个托管技能。',
        parameters: {
          type: 'object',
          properties: {
            skillId: { type: 'string', description: '技能 ID' }
          },
          required: ['skillId']
        }
      }
    },
  ]

  // Agent 增强工具（模型路由 + 子代理）
  const aiStore = useAIStore()
  toolList.push(
    {
      type: 'function',
      function: {
        name: 'route_model',
        description: '分析当前任务并自主选择最适合的模型。返回推荐的模型名、协议和选择理由。在遇到需要特殊能力（大上下文、视觉、深度推理）的任务时调用。',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: '当前任务描述' },
            preferSpeed: { type: 'boolean', description: '是否优先速度（默认平衡质量与速度）' }
          },
          required: ['task']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'spawn_sub_agent',
        description: '生成并运行一个独立子代理执行特定子任务。子代理拥有独立的 Prompt 和可选的独立模型，适合并行处理分析、编码、测试等子任务。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '子代理名称，如"前端开发者"' },
            role: { type: 'string', description: '角色标识: code-analyst, frontend-dev, backend-dev, tester, reviewer, architect, devops' },
            task: { type: 'string', description: '分配给子代理的任务描述' },
            contextFromParent: { type: 'string', description: '从当前对话注入给子代理的关键上下文' },
            model: { type: 'string', description: '可选：指定子代理使用的模型' }
          },
          required: ['name', 'role', 'task']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_sub_agent_status',
        description: '获取当前会话下子代理的执行状态与结果。可选传入 agentId 只查看某一个子代理。',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: '可选：子代理 ID' }
          }
        }
      }
    },
  )

  // IDE 模式工具（仅 IDE 模式下启用）
  if (aiStore.agentMode === 'ide') {
    toolList.push(
      {
        type: 'function',
        function: {
          name: 'ide_read_file',
          description: '读取工作区中的文件内容。路径相对于工作区根目录。',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '相对文件路径' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_write_file',
          description: '在工作区中创建或覆盖文件。自动创建中间目录。',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '相对文件路径' },
              content: { type: 'string', description: '文件内容' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_list_directory',
          description: '列出工作区目录内容。返回文件和子目录的名称及类型。',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '相对目录路径，留空表示根目录' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_search_files',
          description: '在工作区中按文件名模式搜索文件。支持 glob 模式（如 **/*.ts）或子串匹配。',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: '搜索模式' }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_create_plan',
          description: '为当前工作区创建项目开发计划。将生成 PLAN.md 到 .openagent/ 目录。',
          parameters: {
            type: 'object',
            properties: {
              goal: { type: 'string', description: '项目目标' },
              overview: { type: 'string', description: '项目概述' },
              techStack: { type: 'array', items: { type: 'string' }, description: '技术栈列表' }
            },
            required: ['goal', 'overview', 'techStack']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_update_plan_status',
          description: '更新当前项目计划的执行状态。适用于用户确认计划后切换到 approved / in-progress，也适用于暂停或完成时同步状态与文档。',
          parameters: {
            type: 'object',
            properties: {
              planId: { type: 'string', description: '计划 ID' },
              status: { type: 'string', enum: ['drafting', 'approved', 'in-progress', 'completed', 'paused'], description: '目标计划状态' },
              note: { type: 'string', description: '可选：状态变更说明，将写入开发日志' }
            },
            required: ['planId', 'status']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_advance_task',
          description: '更新项目计划中某个任务的状态。自动同步阶段进度和开发日志；若任务失败，会结合失败反馈和当前上下文自动触发动态重规划。',
          parameters: {
            type: 'object',
            properties: {
              planId: { type: 'string', description: '计划 ID' },
              taskId: { type: 'string', description: '任务 ID' },
              status: { type: 'string', enum: ['pending', 'in-progress', 'completed', 'failed', 'skipped'], description: '目标状态' },
              output: { type: 'string', description: '任务输出或说明' }
            },
            required: ['planId', 'taskId', 'status']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_replan_plan',
          description: '基于真实代码 diff、失败反馈与上下文摘要重新规划当前项目计划。适合计划已漂移、任务失败或需要重新排序执行路径时调用。',
          parameters: {
            type: 'object',
            properties: {
              planId: { type: 'string', description: '计划 ID' },
              reason: { type: 'string', description: '触发重规划的原因，如 task-failed、manual-review、workspace-drift' },
              taskId: { type: 'string', description: '可选：关联的任务 ID' },
              failureOutput: { type: 'string', description: '可选：失败日志、构建报错或回归现象' },
              contextSummary: { type: 'string', description: '可选：希望纳入重规划的上下文摘要' }
            },
            required: ['planId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_get_plan',
          description: '获取当前项目计划的完整状态，包括所有阶段、任务和进度。',
          parameters: {
            type: 'object',
            properties: {
              planId: { type: 'string', description: '计划 ID' }
            },
            required: ['planId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ide_log',
          description: '向开发日志添加一条记录。',
          parameters: {
            type: 'object',
            properties: {
              planId: { type: 'string', description: '计划 ID' },
              type: { type: 'string', enum: ['plan', 'decision', 'milestone', 'error'], description: '日志类型' },
              title: { type: 'string', description: '标题' },
              content: { type: 'string', description: '内容' }
            },
            required: ['planId', 'type', 'title', 'content']
          }
        }
      },
    )
  }

  if (isWindowsMcpEnabled()) {
    toolList.push(
      {
      type: 'function',
      function: {
        name: 'execute_command',
        description: '在 Windows 上执行单行 PowerShell 命令。请谨慎使用，仅执行安全的系统操作；reason 可选，但应先在回复里说明用途。',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'PowerShell 命令' },
            reason: { type: 'string', description: '执行原因说明' }
          },
          required: ['command']
        }
      }
      },
      {
      type: 'function',
      function: {
        name: 'read_screen',
        description: '读取全屏、当前前台窗口或指定窗口的截图，并返回截图路径、尺寸和窗口位置信息。适用于聊天软件、浏览器、IDE、资源管理器、登录框、文件选择器等所有桌面软件。执行代操作前，必须先 list_windows -> focus_window -> read_screen 做视觉确认；界面变化后再次截图，执行后再截图验证结果。',
        parameters: {
          type: 'object',
          properties: {
            region: { type: 'string', enum: ['full', 'active', 'window'], description: '截图区域：full 为整屏，active 为当前前台窗口，window 为指定窗口' },
            windowId: { type: 'number', description: '目标窗口 ID，来自 list_windows；region=window 时优先使用' },
            windowHandle: { type: 'string', description: '目标窗口句柄，来自 list_windows 的 handle/windowHandle；当模型误拿到句柄而不是 id 时可直接传入' },
            windowTitle: { type: 'string', description: '目标窗口标题，作为无法使用 ID 时的兜底匹配' },
            processName: { type: 'string', description: '目标进程名，例如 Weixin 或 WeChat' }
          }
        }
      }
      },
      {
      type: 'function',
      function: {
        name: 'mouse_click',
        description: '在屏幕指定坐标执行鼠标点击。坐标必须来自最新一次 read_screen 的视觉确认；如果点击后界面发生变化，下一步前必须重新 read_screen。',
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: '屏幕 X 坐标' },
            y: { type: 'number', description: '屏幕 Y 坐标' },
            button: { type: 'string', enum: ['left', 'right', 'middle'], description: '鼠标按键' },
            clickType: { type: 'string', enum: ['single', 'double'], description: '点击类型' }
          },
          required: ['x', 'y']
        }
      }
      },
      {
      type: 'function',
      function: {
        name: 'keyboard_input',
        description: '模拟键盘输入文本或按键。为避免输入到错误窗口，优先先调用 list_windows 获取 id，再把 windowId 一并传入；输入前必须先确认目标窗口和目标输入框都已就绪，若不确定请先 mouse_click 聚焦控件，再在发送后 read_screen 验证。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要输入的文本' },
            keys: { type: 'string', description: '特殊按键组合，如 ctrl+c、enter、tab' },
            windowId: { type: 'number', description: '目标窗口 ID，强烈建议优先使用' },
            windowHandle: { type: 'string', description: '目标窗口句柄，作为模型误用 handle 时的兼容入参' },
            windowTitle: { type: 'string', description: '目标窗口标题，作为无法使用 ID 时的兜底匹配' },
            processName: { type: 'string', description: '目标进程名，例如 Weixin' }
          }
        }
      }
      },
      {
      type: 'function',
      function: {
        name: 'list_windows',
        description: '列出当前所有可聚焦窗口的结构化信息，返回 id、handle/windowHandle、processName、title、isForeground。后续优先使用 id 精确聚焦；如果模型错误拿到 handle，也可以把 windowHandle 传给其它 MCP 工具。只要出现新弹窗、标题变化或软件切换，就应重新调用。',
        parameters: { type: 'object', properties: {} }
      }
      },
      {
      type: 'function',
      function: {
        name: 'focus_window',
        description: '将指定窗口置于前台。优先传 id，只有拿不到 id 时才退化为标题或进程名匹配；窗口聚焦成功后仍必须 read_screen 确认当前页面与控件状态，不能直接假定可以输入。',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number', description: '窗口 ID，来自 list_windows' },
            windowHandle: { type: 'string', description: '窗口句柄，来自 list_windows 的 handle/windowHandle；只有模型没有正确保留 id 时再用' },
            title: { type: 'string', description: '窗口标题（模糊匹配）' },
            processName: { type: 'string', description: '进程名，例如 Weixin' }
          },
          required: []
        }
      }
      }
    )
  }

  try {
    const resourcesStore = useAIResourcesStore()
    toolList.push(...resourcesStore.enabledManagedMcpTools.map(({ server, tool }) => ({
      type: 'function' as const,
      function: {
        name: tool.invocationName,
        description: `托管 MCP 工具，来自服务器「${server.name}」：${tool.description}`,
        parameters: tool.inputSchema && Object.keys(tool.inputSchema).length > 0
          ? tool.inputSchema
          : { type: 'object', properties: {} }
      }
    })))
  } catch {
    // AI 资源 store 尚未初始化时回退为仅使用内置工具。
  }

  return toolList
}

async function streamOpenAIChat(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const preferResponses = shouldUseOpenAIResponsesApi(config)

  if (preferResponses) {
    try {
      await streamOpenAIResponsesFlow(config, messages, callbacks, preferences, options, signal)
    } catch (error) {
      if (signal?.aborted) {
        return
      }

      if (!shouldFallbackToChatCompletions(config, error)) {
        callbacks.onError(`请求失败: ${formatOpenAIRequestError(error)}`)
        return
      }

      try {
        await streamOpenAICompatibleFlow(config, messages, callbacks, preferences, options, signal)
      } catch (fallbackError) {
        if (signal?.aborted) {
          return
        }

        callbacks.onError(`请求失败: ${formatOpenAIRequestError(fallbackError)}`)
      }
    }

    return
  }

  try {
    await streamOpenAICompatibleFlow(config, messages, callbacks, preferences, options, signal)
  } catch (error) {
    if (signal?.aborted) {
      return
    }

    if (!shouldFallbackToResponses(config, error)) {
      callbacks.onError(`请求失败: ${formatOpenAIRequestError(error)}`)
      return
    }

    try {
      await streamOpenAIResponsesFlow(config, messages, callbacks, preferences, options, signal)
    } catch (fallbackError) {
      if (signal?.aborted) {
        return
      }

      callbacks.onError(`请求失败: ${formatOpenAIRequestError(fallbackError)}`)
    }
  }
}

async function streamAnthropicChat(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const tools = getAvailableTools(config.protocol)
  const anthropicPayload = buildAnthropicPayload(messages)
  const buildBody = (includeThinking: boolean) => {
    const limits = resolveConfigTokenLimits(config)
    const body: Record<string, unknown> = {
      model: config.model,
      messages: anthropicPayload.messages,
      temperature: config.temperature,
      max_tokens: limits.maxOutputTokens,
      stream: true
    }

    if (options?.includeTools !== false) {
      body.tools = buildAnthropicTools(tools)
    }

    if (anthropicPayload.system) {
      body.system = anthropicPayload.system
    }

    if (includeThinking && supportsThinkingMode(config, preferences)) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(Math.max(Math.floor(config.maxTokens * 0.4), 1024), Math.max(config.maxTokens - 256, 1024))
      }
    }

    return body
  }

  try {
    let includeThinking = true
    let response = await fetch(normalizeChatUrl(config.baseUrl, 'anthropic'), {
      method: 'POST',
      headers: buildAnthropicHeaders(config),
      body: JSON.stringify(buildBody(includeThinking)),
      signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (includeThinking && shouldRetryWithoutThinking(response.status, errorText)) {
        includeThinking = false
        response = await fetch(normalizeChatUrl(config.baseUrl, 'anthropic'), {
          method: 'POST',
          headers: buildAnthropicHeaders(config),
          body: JSON.stringify(buildBody(includeThinking)),
          signal
        })
      }

      if (!response.ok) {
        const retryErrorText = await response.text()
        callbacks.onError(`API 请求失败 (${response.status}): ${retryErrorText.slice(0, 200)}`)
        return
      }
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('响应体为空')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''
    const toolCallsMap = new Map<number, AIToolCall>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          currentEvent = ''
          continue
        }

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
          continue
        }

        if (!line.startsWith('data:')) {
          continue
        }

        const payload = line.slice(5).trim()
        if (!payload) {
          continue
        }

        try {
          const parsed = JSON.parse(payload)

          if (currentEvent === 'error') {
            callbacks.onError(parsed.error?.message || parsed.message || 'Anthropic 响应异常')
            return
          }

          if (currentEvent === 'content_block_start') {
            const block = parsed.content_block
            const index = parsed.index ?? 0

            if (block?.type === 'text' && typeof block.text === 'string' && block.text) {
              callbacks.onToken(block.text)
            }

            if (block?.type === 'thinking') {
              const thinkingText = extractAnthropicThinkingBlock(block)
              if (thinkingText) {
                callbacks.onReasoning?.(thinkingText)
              }
            }

            if (block?.type === 'tool_use') {
              toolCallsMap.set(index, {
                id: block.id || `call_${index}`,
                name: block.name || '',
                arguments: block.input && Object.keys(block.input).length > 0 ? JSON.stringify(block.input) : ''
              })
            }

            continue
          }

          if (currentEvent === 'content_block_delta') {
            const delta = parsed.delta
            const index = parsed.index ?? 0

            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              callbacks.onToken(delta.text)
            }

            if (delta?.type === 'thinking_delta') {
              const thinkingText = extractAnthropicThinkingBlock(delta)
              if (thinkingText) {
                callbacks.onReasoning?.(thinkingText)
              }
            }

            if (delta?.type === 'input_json_delta') {
              if (!toolCallsMap.has(index)) {
                toolCallsMap.set(index, {
                  id: `call_${index}`,
                  name: '',
                  arguments: ''
                })
              }

              const existing = toolCallsMap.get(index)!
              existing.arguments += delta.partial_json || ''
            }

            continue
          }

          if (currentEvent === 'message_stop') {
            emitToolCalls(toolCallsMap, callbacks)
            await callbacks.onDone()
            return
          }
        } catch {
          // 等待下一个 SSE 片段拼接完整。
        }
      }
    }

    emitToolCalls(toolCallsMap, callbacks)
    await callbacks.onDone()
  } catch (error) {
    if (signal?.aborted) {
      return
    }
    callbacks.onError(`请求失败: ${(error as Error).message}`)
  }
}

async function streamOllamaChat(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  try {
    const { response } = await requestOllama(config, true, messages, preferences, options, signal)
    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('响应体为空')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const toolCallsMap = new Map<number, AIToolCall>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          continue
        }

        try {
          const parsed = JSON.parse(line)
          const message = parsed.message || {}

          if (typeof message.content === 'string' && message.content) {
            callbacks.onToken(message.content)
          }

          const reasoningText = extractOllamaReasoningMessage(message)
          if (reasoningText) {
            callbacks.onReasoning?.(reasoningText)
          }

          if (Array.isArray(message.tool_calls)) {
            mergeToolCalls(toolCallsMap, message.tool_calls)
          }

          if (parsed.done) {
            emitToolCalls(toolCallsMap, callbacks)
            await callbacks.onDone()
            return
          }
        } catch {
          // 等待后续换行补齐 JSON 片段。
        }
      }
    }

    emitToolCalls(toolCallsMap, callbacks)
    await callbacks.onDone()
  } catch (error) {
    if (signal?.aborted) {
      return
    }
    callbacks.onError(`请求失败: ${(error as Error).message}`)
  }
}

/** 流式调用 AI API */
export async function streamChat(
  config: AIConfig,
  messages: AIChatMessage[],
  callbacks: StreamCallbacks,
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
) {
  const protocol = resolveConfigProtocol(config)

  if (protocol === 'anthropic') {
    await streamAnthropicChat(config, messages, callbacks, preferences, options, signal)
    return
  }

  if (protocol === 'gemini') {
    await streamGeminiChat(config, messages, callbacks, preferences, options, signal)
    return
  }

  if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    await streamOllamaChat(config, messages, callbacks, preferences, options, signal)
    return
  }

  await streamOpenAIChat(config, messages, callbacks, preferences, options, signal)
}

async function chatCompletionOpenAI(config: AIConfig, messages: AIChatMessage[], preferences?: Partial<AIChatPreferences>, options?: { includeTools?: boolean }, signal?: AbortSignal) {
  if (shouldUseOpenAIResponsesApi(config)) {
    try {
      return await chatCompletionOpenAIResponsesFlow(config, messages, preferences, options, signal)
    } catch (error) {
      if (!shouldFallbackToChatCompletions(config, error)) {
        throw error
      }

      return chatCompletionOpenAICompatibleFlow(config, messages, preferences, options, signal)
    }
  }

  try {
    return await chatCompletionOpenAICompatibleFlow(config, messages, preferences, options, signal)
  } catch (error) {
    if (!shouldFallbackToResponses(config, error)) {
      throw error
    }

    return chatCompletionOpenAIResponsesFlow(config, messages, preferences, options, signal)
  }
}

async function chatCompletionAnthropic(config: AIConfig, messages: AIChatMessage[], preferences?: Partial<AIChatPreferences>, options?: { includeTools?: boolean }, signal?: AbortSignal) {
  const tools = getAvailableTools(config.protocol)
  const anthropicPayload = buildAnthropicPayload(messages)
  const limits = resolveConfigTokenLimits(config)
  const body: Record<string, unknown> = {
    model: config.model,
    messages: anthropicPayload.messages,
    temperature: config.temperature,
    max_tokens: limits.maxOutputTokens,
    stream: false
  }

  if (options?.includeTools !== false) {
    body.tools = buildAnthropicTools(tools)
  }

  if (anthropicPayload.system) {
    body.system = anthropicPayload.system
  }

  if (supportsThinkingMode(config, preferences)) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: Math.min(Math.max(Math.floor(config.maxTokens * 0.4), 1024), Math.max(config.maxTokens - 256, 1024))
    }
  }

  let response = await fetch(normalizeChatUrl(config.baseUrl, 'anthropic'), {
    method: 'POST',
    headers: buildAnthropicHeaders(config),
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    if (body.thinking && shouldRetryWithoutThinking(response.status, errorText)) {
      delete body.thinking
      response = await fetch(normalizeChatUrl(config.baseUrl, 'anthropic'), {
        method: 'POST',
        headers: buildAnthropicHeaders(config),
        body: JSON.stringify(body),
        signal
      })
    }

    if (!response.ok) {
      const retryErrorText = await response.text()
      throw new Error(`API 请求失败 (${response.status}): ${retryErrorText.slice(0, 200)}`)
    }
  }

  const data = await response.json()
  const contentBlocks = Array.isArray(data.content) ? data.content : []
  const content = contentBlocks
    .filter((block: Record<string, unknown>) => block.type === 'text')
    .map((block: Record<string, unknown>) => String(block.text || ''))
    .join('')
  const reasoningContent = contentBlocks
    .filter((block: Record<string, unknown>) => block.type === 'thinking')
    .map((block: Record<string, unknown>) => extractAnthropicThinkingBlock(block))
    .join('')

  const toolCalls: AIToolCall[] = contentBlocks
    .filter((block: Record<string, unknown>) => block.type === 'tool_use')
    .map((block: Record<string, unknown>, index: number) => ({
      id: String(block.id || `call_${index}`),
      name: String(block.name || ''),
      arguments: JSON.stringify((block.input as Record<string, unknown> | undefined) || {})
    }))

  return { content, toolCalls, reasoningContent }
}

async function chatCompletionOllama(config: AIConfig, messages: AIChatMessage[], preferences?: Partial<AIChatPreferences>, options?: { includeTools?: boolean }, signal?: AbortSignal) {
  const { response } = await requestOllama(config, false, messages, preferences, options, signal)
  const data = await response.json()
  const message = data.message || {}
  const content = typeof message.content === 'string' ? message.content : ''
  const reasoningContent = extractOllamaReasoningMessage(message)
  const toolCalls: AIToolCall[] = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((toolCall: Record<string, unknown>, index: number) => {
      const fn = (toolCall.function as Record<string, unknown> | undefined) || {}
      return {
        id: String(toolCall.id || `call_${index}`),
        name: String(fn.name || ''),
        arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {})
      }
    })
    : []

  return { content, toolCalls, reasoningContent }
}

/** 非流式调用（用于简单单轮查询） */
export async function chatCompletion(
  config: AIConfig,
  messages: AIChatMessage[],
  preferences?: Partial<AIChatPreferences>,
  options?: { includeTools?: boolean },
  signal?: AbortSignal
): Promise<{ content: string; toolCalls: AIToolCall[]; reasoningContent?: string }> {
  const protocol = resolveConfigProtocol(config)

  if (protocol === 'anthropic') {
    return chatCompletionAnthropic(config, messages, preferences, options, signal)
  }

  if (protocol === 'gemini') {
    return chatCompletionGemini(config, messages, preferences, options, signal)
  }

  if (protocol === 'ollama-local' || protocol === 'ollama-cloud') {
    return chatCompletionOllama(config, messages, preferences, options, signal)
  }

  return chatCompletionOpenAI(config, messages, preferences, options, signal)
}
