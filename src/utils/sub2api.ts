import type { AIConfig, AIGatewayTemplate, AIProtocol, AIProviderModel } from '@/types'
import { fetchAvailableModels } from '@/utils/ai'

export type Sub2ApiMode = 'claude' | 'openai' | 'antigravity'

export type Sub2ApiCheckState = 'success' | 'error' | 'pending'

export type Sub2ApiCheckItem = {
  id: string
  label: string
  endpoint: string
  state: Sub2ApiCheckState
  message: string
}

export type Sub2ApiModePreset = {
  value: Sub2ApiMode
  title: string
  tag: string
  description: string
  protocol: AIProtocol
  connectionTemplate: AIGatewayTemplate
  routeSuffix: string
  recommendedModel: string
  connectionHint: string
  routeHint: string
}

export type Sub2ApiStoredConfig = {
  gatewayRoot: string
  apiKey: string
  activeMode: Sub2ApiMode
  preferredModels: Record<Sub2ApiMode, string>
}

export type Sub2ApiModelCatalog = {
  models: AIProviderModel[]
  updatedAt: number
  error: string
}

export type Sub2ApiModelRegistry = Record<Sub2ApiMode, Sub2ApiModelCatalog>

export type Sub2ApiCheckRegistry = Record<Sub2ApiMode, Sub2ApiCheckItem[]>

export const SUB2API_GATEWAY_PLACEHOLDER = 'https://your-sub2api.example.com'

export const SUB2API_MODE_PRESETS: Record<Sub2ApiMode, Sub2ApiModePreset> = {
  claude: {
    value: 'claude',
    title: 'Claude 路由',
    tag: 'Messages',
    description: '走标准 /v1/messages，适合 Claude 系列模型与桌面工具调用。',
    protocol: 'anthropic',
    connectionTemplate: 'sub2api-claude',
    routeSuffix: '/v1',
    recommendedModel: 'claude-3-7-sonnet-latest',
    connectionHint: '通过 Sub2API 的 Claude 兼容路由接入，适合 Claude 官方与兼容账号池。',
    routeHint: '会自动映射到 {gateway}/v1/messages 与 {gateway}/v1/models。'
  },
  openai: {
    value: 'openai',
    title: 'OpenAI 路由',
    tag: 'Chat / Responses',
    description: '走 /v1/chat/completions 与 /v1/responses，适合 GPT、o 系列和兼容上游。',
    protocol: 'openai',
    connectionTemplate: 'sub2api-openai',
    routeSuffix: '/v1',
    recommendedModel: 'gpt-5.4',
    connectionHint: '通过 Sub2API 的 OpenAI 路由接入，桌面端会优先走原生 Responses，适合 GPT、o 系列和 Codex 风格客户端。',
    routeHint: '会自动映射到 {gateway}/v1/chat/completions、{gateway}/v1/responses 与 {gateway}/v1/models。'
  },
  antigravity: {
    value: 'antigravity',
    title: 'Antigravity Claude 专线',
    tag: '专线',
    description: '走 /antigravity/v1/messages，只使用 Antigravity 账号池，不混入普通 Claude 调度。',
    protocol: 'anthropic',
    connectionTemplate: 'sub2api-antigravity',
    routeSuffix: '/antigravity/v1',
    recommendedModel: 'claude-3-7-sonnet-latest',
    connectionHint: '通过 Sub2API 的 Antigravity 专线访问 Claude 路由，适合需要隔离账号池的场景。',
    routeHint: '会自动映射到 {gateway}/antigravity/v1/messages 与 {gateway}/antigravity/v1/models。'
  }
}

function trimTrailingSlashes(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function normalizeSub2ApiGatewayRoot(value: string) {
  return trimTrailingSlashes(value)
    .replace(/\/antigravity\/v1beta$/i, '')
    .replace(/\/antigravity\/v1$/i, '')
    .replace(/\/v1beta$/i, '')
    .replace(/\/v1$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/models$/i, '')
}

export function buildSub2ApiBaseUrl(root: string, mode: Sub2ApiMode) {
  const normalizedRoot = normalizeSub2ApiGatewayRoot(root)
  if (!normalizedRoot) {
    return ''
  }

  return `${normalizedRoot}${SUB2API_MODE_PRESETS[mode].routeSuffix}`
}

export function buildSub2ApiHeaders(apiKey: string, protocol: AIProtocol) {
  if (protocol === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01'
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  return headers
}

export async function readSub2ApiErrorText(response: Response) {
  try {
    return (await response.text()).slice(0, 240)
  } catch {
    return ''
  }
}

export function resolveSub2ApiMode(template: AIGatewayTemplate): Sub2ApiMode | null {
  if (template === 'sub2api-claude') {
    return 'claude'
  }

  if (template === 'sub2api-openai') {
    return 'openai'
  }

  if (template === 'sub2api-antigravity') {
    return 'antigravity'
  }

  return null
}

export function createDefaultSub2ApiConfig(): Sub2ApiStoredConfig {
  return {
    gatewayRoot: '',
    apiKey: '',
    activeMode: 'openai',
    preferredModels: {
      claude: SUB2API_MODE_PRESETS.claude.recommendedModel,
      openai: SUB2API_MODE_PRESETS.openai.recommendedModel,
      antigravity: SUB2API_MODE_PRESETS.antigravity.recommendedModel
    }
  }
}

export function normalizeSub2ApiConfig(saved: Partial<Sub2ApiStoredConfig> | null | undefined): Sub2ApiStoredConfig {
  const defaults = createDefaultSub2ApiConfig()
  const preferredModels = {
    ...defaults.preferredModels,
    ...(saved?.preferredModels ?? {})
  }

  const activeMode = saved?.activeMode === 'claude' || saved?.activeMode === 'openai' || saved?.activeMode === 'antigravity'
    ? saved.activeMode
    : defaults.activeMode

  return {
    gatewayRoot: normalizeSub2ApiGatewayRoot(saved?.gatewayRoot || ''),
    apiKey: typeof saved?.apiKey === 'string' ? saved.apiKey.trim() : '',
    activeMode,
    preferredModels: {
      claude: preferredModels.claude?.trim() || defaults.preferredModels.claude,
      openai: preferredModels.openai?.trim() || defaults.preferredModels.openai,
      antigravity: preferredModels.antigravity?.trim() || defaults.preferredModels.antigravity
    }
  }
}

export function createEmptySub2ApiModelRegistry(): Sub2ApiModelRegistry {
  return {
    claude: { models: [], updatedAt: 0, error: '' },
    openai: { models: [], updatedAt: 0, error: '' },
    antigravity: { models: [], updatedAt: 0, error: '' }
  }
}

export function normalizeSub2ApiModelRegistry(saved: Partial<Sub2ApiModelRegistry> | null | undefined): Sub2ApiModelRegistry {
  const defaults = createEmptySub2ApiModelRegistry()
  const registry = { ...defaults, ...(saved ?? {}) }

  return {
    claude: {
      models: Array.isArray(registry.claude?.models) ? registry.claude.models : [],
      updatedAt: Number.isFinite(registry.claude?.updatedAt) ? Number(registry.claude.updatedAt) : 0,
      error: typeof registry.claude?.error === 'string' ? registry.claude.error : ''
    },
    openai: {
      models: Array.isArray(registry.openai?.models) ? registry.openai.models : [],
      updatedAt: Number.isFinite(registry.openai?.updatedAt) ? Number(registry.openai.updatedAt) : 0,
      error: typeof registry.openai?.error === 'string' ? registry.openai.error : ''
    },
    antigravity: {
      models: Array.isArray(registry.antigravity?.models) ? registry.antigravity.models : [],
      updatedAt: Number.isFinite(registry.antigravity?.updatedAt) ? Number(registry.antigravity.updatedAt) : 0,
      error: typeof registry.antigravity?.error === 'string' ? registry.antigravity.error : ''
    }
  }
}

export function createEmptySub2ApiCheckRegistry(): Sub2ApiCheckRegistry {
  return {
    claude: [],
    openai: [],
    antigravity: []
  }
}

export function normalizeSub2ApiCheckRegistry(saved: Partial<Sub2ApiCheckRegistry> | null | undefined): Sub2ApiCheckRegistry {
  const defaults = createEmptySub2ApiCheckRegistry()
  const registry = { ...defaults, ...(saved ?? {}) }

  return {
    claude: Array.isArray(registry.claude) ? registry.claude : [],
    openai: Array.isArray(registry.openai) ? registry.openai : [],
    antigravity: Array.isArray(registry.antigravity) ? registry.antigravity : []
  }
}

export function getSub2ApiPreferredModel(config: Sub2ApiStoredConfig, mode: Sub2ApiMode) {
  return config.preferredModels[mode]?.trim() || SUB2API_MODE_PRESETS[mode].recommendedModel
}

export function buildSub2ApiAiPatch(config: Sub2ApiStoredConfig, mode: Sub2ApiMode): Partial<AIConfig> {
  const preset = SUB2API_MODE_PRESETS[mode]
  return {
    protocol: preset.protocol,
    connectionTemplate: preset.connectionTemplate,
    apiKey: config.apiKey.trim(),
    baseUrl: buildSub2ApiBaseUrl(config.gatewayRoot, mode),
    model: getSub2ApiPreferredModel(config, mode)
  }
}

export function buildSub2ApiAiConfig(config: Sub2ApiStoredConfig, mode: Sub2ApiMode): AIConfig {
  return {
    apiKey: config.apiKey.trim(),
    baseUrl: buildSub2ApiBaseUrl(config.gatewayRoot, mode),
    model: getSub2ApiPreferredModel(config, mode),
    protocol: SUB2API_MODE_PRESETS[mode].protocol,
    connectionTemplate: SUB2API_MODE_PRESETS[mode].connectionTemplate,
    contextWindow: 128000,
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: ''
  }
}

export async function fetchSub2ApiModels(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, signal?: AbortSignal) {
  return fetchAvailableModels(buildSub2ApiAiConfig(config, mode), signal)
}

export async function runSub2ApiCapabilityCheck(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, modelOverride?: string) {
  const normalizedConfig = normalizeSub2ApiConfig(config)
  const gatewayRoot = normalizedConfig.gatewayRoot
  const currentPreset = SUB2API_MODE_PRESETS[mode]

  if (!gatewayRoot) {
    throw new Error('请先填写 Sub2API 网关根地址')
  }

  if (!normalizedConfig.apiKey.trim()) {
    throw new Error('请先填写 Sub2API API Key')
  }

  const currentBaseUrl = buildSub2ApiBaseUrl(gatewayRoot, mode)
  const currentModel = modelOverride?.trim() || getSub2ApiPreferredModel(normalizedConfig, mode)
  const currentHeaders = buildSub2ApiHeaders(normalizedConfig.apiKey, currentPreset.protocol)
  const checks: Sub2ApiCheckItem[] = []

  const modelsUrl = `${currentBaseUrl}/models`
  const modelsResponse = await fetch(modelsUrl, {
    method: 'GET',
    headers: currentHeaders
  })

  if (!modelsResponse.ok) {
    checks.push({
      id: 'models',
      label: '模型列表',
      endpoint: modelsUrl,
      state: 'error',
      message: `请求失败 (${modelsResponse.status})：${await readSub2ApiErrorText(modelsResponse) || '未返回更多信息'}`
    })
  } else {
    const payload = await modelsResponse.json().catch(() => null)
    const modelCount = Array.isArray((payload as { data?: unknown[] } | null)?.data)
      ? (payload as { data: unknown[] }).data.length
      : Array.isArray((payload as { models?: unknown[] } | null)?.models)
        ? (payload as { models: unknown[] }).models.length
        : 0

    checks.push({
      id: 'models',
      label: '模型列表',
      endpoint: modelsUrl,
      state: 'success',
      message: modelCount > 0 ? `已返回 ${modelCount} 个模型。` : '接口可访问，但未返回模型列表。'
    })
  }

  if (currentPreset.protocol === 'anthropic') {
    const messagesUrl = `${currentBaseUrl}/messages`
    const messagesResponse = await fetch(messagesUrl, {
      method: 'POST',
      headers: currentHeaders,
      body: JSON.stringify({
        model: currentModel,
        max_tokens: 1,
        stream: false,
        messages: [{ role: 'user', content: 'ping' }]
      })
    })

    if (!messagesResponse.ok) {
      checks.push({
        id: 'messages',
        label: `${currentPreset.title} 请求`,
        endpoint: messagesUrl,
        state: 'error',
        message: `请求失败 (${messagesResponse.status})：${await readSub2ApiErrorText(messagesResponse) || '未返回更多信息'}`
      })
    } else {
      checks.push({
        id: 'messages',
        label: `${currentPreset.title} 请求`,
        endpoint: messagesUrl,
        state: 'success',
        message: `模型 ${currentModel} 已可正常响应。`
      })
    }

    checks.push({
      id: 'codex-ready',
      label: 'Codex / Responses 路径',
      endpoint: `${buildSub2ApiBaseUrl(gatewayRoot, 'openai')}/responses`,
      state: 'pending',
      message: '当前不在 OpenAI 路由。要验证 Codex 额度，请切换到「OpenAI 路由」后重新检查。'
    })

    return checks
  }

  const chatUrl = `${currentBaseUrl}/chat/completions`
  const chatResponse = await fetch(chatUrl, {
    method: 'POST',
    headers: currentHeaders,
    body: JSON.stringify({
      model: currentModel,
      stream: false,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })

  if (!chatResponse.ok) {
    checks.push({
      id: 'chat-completions',
      label: 'Chat Completions 路径',
      endpoint: chatUrl,
      state: 'error',
      message: `请求失败 (${chatResponse.status})：${await readSub2ApiErrorText(chatResponse) || '未返回更多信息'}`
    })
  } else {
    checks.push({
      id: 'chat-completions',
      label: 'Chat Completions 路径',
      endpoint: chatUrl,
      state: 'success',
      message: `模型 ${currentModel} 已可通过 OpenAI 兼容路由访问。`
    })
  }

  const responsesUrl = `${currentBaseUrl}/responses`
  const responsesResponse = await fetch(responsesUrl, {
    method: 'POST',
    headers: currentHeaders,
    body: JSON.stringify({
      model: currentModel,
      store: false,
      max_output_tokens: 1,
      input: 'ping'
    })
  })

  if (!responsesResponse.ok) {
    checks.push({
      id: 'responses',
      label: 'Codex / Responses 路径',
      endpoint: responsesUrl,
      state: 'error',
      message: `请求失败 (${responsesResponse.status})：${await readSub2ApiErrorText(responsesResponse) || '未返回更多信息'}`
    })
  } else {
    checks.push({
      id: 'responses',
      label: 'Codex / Responses 路径',
      endpoint: responsesUrl,
      state: 'success',
      message: 'Responses API 已可用。若服务端分组绑定的是 OpenAI OAuth / Codex 登录账号，这条路径就能消耗 Codex 额度。'
    })
  }

  return checks
}

export function createSub2ApiCodexConfigToml(config: Sub2ApiStoredConfig, model = 'gpt-5.4') {
  return `model_provider = "OpenAI"
model = "${model}"
review_model = "${model}"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${buildSub2ApiBaseUrl(config.gatewayRoot, 'openai') || `${SUB2API_GATEWAY_PLACEHOLDER}/v1`}"
wire_api = "responses"
supports_websockets = true
requires_openai_auth = true

[features]
responses_websockets_v2 = true`
}

export function createSub2ApiCodexAuthJson(apiKey: string) {
  return JSON.stringify({
    OPENAI_API_KEY: apiKey.trim() || 'sk-your-sub2api-key'
  }, null, 2)
}