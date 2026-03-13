import type {
  AIConfig,
  AIGatewayTemplate,
  AIProtocol,
  AIProviderModel,
  Sub2ApiDesktopManagedConfig,
  Sub2ApiDesktopRuntimeConfig,
  Sub2ApiDesktopSetupProfile,
  Sub2ApiGatewayMode,
  Sub2ApiRuntimeState,
  Sub2ApiSetupDiagnosticItem,
  Sub2ApiSetupDiagnostics
} from '@/types'
import { fetchAvailableModels } from '@/utils/ai'

export type Sub2ApiMode = 'claude' | 'openai' | 'gemini' | 'antigravity'

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
  gatewayMode: Sub2ApiGatewayMode
  gatewayRoot: string
  apiKey: string
  activeMode: Sub2ApiMode
  preferredModels: Record<Sub2ApiMode, string>
  desktopRuntime: Sub2ApiDesktopRuntimeConfig
  desktopManaged: Sub2ApiDesktopManagedConfig
  desktopSetup: Sub2ApiDesktopSetupProfile
}

export type Sub2ApiModelCatalog = {
  models: AIProviderModel[]
  updatedAt: number
  error: string
}

export type Sub2ApiModelRegistry = Record<Sub2ApiMode, Sub2ApiModelCatalog>

export type Sub2ApiCheckRegistry = Record<Sub2ApiMode, Sub2ApiCheckItem[]>

export type Sub2ApiRuntimePresentationTone = 'success' | 'info' | 'warning' | 'danger'

export const SUB2API_GATEWAY_PLACEHOLDER = 'https://your-sub2api.example.com'
export const SUB2API_DESKTOP_DEFAULT_HOST = '127.0.0.1'
export const SUB2API_DESKTOP_DEFAULT_PORT = 38080
export const SUB2API_SETUP_DEFAULT_TIMEZONE = 'Asia/Shanghai'
export const SUB2API_DESKTOP_DEFAULT_ADMIN_EMAIL = 'admin@openagent.local'
export const SUB2API_DESKTOP_DEFAULT_API_KEY_NAME = 'OpenAgent Desktop'
export const SUB2API_DESKTOP_SHARED_PASSWORD = 'OpenAgentnh'

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
    tag: 'Responses 优先',
    description: '主走 /v1/responses；如果服务端仍保留 legacy 兼容层，也可额外兼容 /v1/chat/completions。',
    protocol: 'openai',
    connectionTemplate: 'sub2api-openai',
    routeSuffix: '/v1',
    recommendedModel: 'gpt-5.4',
    connectionHint: '通过 Sub2API 的 OpenAI 路由接入，桌面端会优先走原生 Responses，适合 GPT、o 系列和 Codex 风格客户端。',
    routeHint: '会自动映射到 {gateway}/v1/responses 与 {gateway}/v1/models；如果服务端保留 legacy 兼容层，也可访问 {gateway}/v1/chat/completions。'
  },
  gemini: {
    value: 'gemini',
    title: 'Gemini 路由',
    tag: 'v1beta',
    description: '走 /v1beta/models 与 :generateContent / :streamGenerateContent，适合 Gemini 原生 REST 客户端。',
    protocol: 'gemini',
    connectionTemplate: 'sub2api-gemini',
    routeSuffix: '/v1beta',
    recommendedModel: 'gemini-2.5-flash',
    connectionHint: '通过 Sub2API 的 Gemini 原生路由接入，适合 Google AI Studio / Gemini CLI 风格客户端与 Gemini 账号池。',
    routeHint: '会自动映射到 {gateway}/v1beta/models，以及 {gateway}/v1beta/models/{model}:generateContent / :streamGenerateContent。'
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

function normalizeSub2ApiDesktopHost(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || SUB2API_DESKTOP_DEFAULT_HOST
}

function normalizeSub2ApiDesktopPort(value: unknown) {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) {
    return SUB2API_DESKTOP_DEFAULT_PORT
  }

  return Math.min(Math.max(Math.round(nextValue), 1), 65535)
}

function normalizeNonNegativeInteger(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(nextValue), 0), max)
}

function normalizeSslMode(value: unknown): 'disable' | 'require' | 'verify-ca' | 'verify-full' {
  if (value === 'require' || value === 'verify-ca' || value === 'verify-full') {
    return value
  }

  return 'disable'
}

function quoteYamlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function resolveDesktopClientHost(host: string) {
  const normalizedHost = normalizeSub2ApiDesktopHost(host)
  if (normalizedHost === '0.0.0.0' || normalizedHost === '::' || normalizedHost === '::0') {
    return SUB2API_DESKTOP_DEFAULT_HOST
  }

  return normalizedHost
}

export function createDefaultSub2ApiDesktopRuntimeConfig(): Sub2ApiDesktopRuntimeConfig {
  return {
    autoStart: false,
    host: SUB2API_DESKTOP_DEFAULT_HOST,
    port: SUB2API_DESKTOP_DEFAULT_PORT,
    runMode: 'standard',
    binaryPath: '',
    dataDir: '',
    configPath: '',
    logLevel: 'info'
  }
}

export function createDefaultSub2ApiDesktopManagedConfig(): Sub2ApiDesktopManagedConfig {
  return {
    sharedPassword: SUB2API_DESKTOP_SHARED_PASSWORD,
    adminEmail: SUB2API_DESKTOP_DEFAULT_ADMIN_EMAIL,
    apiKeyName: SUB2API_DESKTOP_DEFAULT_API_KEY_NAME
  }
}

export function createDefaultSub2ApiDesktopSetupProfile(): Sub2ApiDesktopSetupProfile {
  return {
    database: {
      host: '127.0.0.1',
      port: 5432,
      user: 'sub2api',
      password: SUB2API_DESKTOP_SHARED_PASSWORD,
      dbname: 'sub2api',
      sslmode: 'disable'
    },
    redis: {
      host: '127.0.0.1',
      port: 6379,
      password: SUB2API_DESKTOP_SHARED_PASSWORD,
      db: 0,
      enableTls: false
    },
    admin: {
      email: SUB2API_DESKTOP_DEFAULT_ADMIN_EMAIL,
      password: SUB2API_DESKTOP_SHARED_PASSWORD
    },
    timezone: SUB2API_SETUP_DEFAULT_TIMEZONE
  }
}

export function normalizeSub2ApiDesktopManagedConfig(saved: Partial<Sub2ApiDesktopManagedConfig> | null | undefined): Sub2ApiDesktopManagedConfig {
  const defaults = createDefaultSub2ApiDesktopManagedConfig()
  return {
    sharedPassword: typeof saved?.sharedPassword === 'string' && saved.sharedPassword.trim()
      ? saved.sharedPassword
      : defaults.sharedPassword,
    adminEmail: typeof saved?.adminEmail === 'string' && saved.adminEmail.trim()
      ? saved.adminEmail.trim()
      : defaults.adminEmail,
    apiKeyName: typeof saved?.apiKeyName === 'string' && saved.apiKeyName.trim()
      ? saved.apiKeyName.trim()
      : defaults.apiKeyName
  }
}

export function normalizeSub2ApiDesktopSetupProfile(saved: Partial<Sub2ApiDesktopSetupProfile> | null | undefined): Sub2ApiDesktopSetupProfile {
  const defaults = createDefaultSub2ApiDesktopSetupProfile()
  return {
    database: {
      host: typeof saved?.database?.host === 'string' ? saved.database.host.trim() || defaults.database.host : defaults.database.host,
      port: normalizeSub2ApiDesktopPort(saved?.database?.port ?? defaults.database.port),
      user: typeof saved?.database?.user === 'string' ? saved.database.user.trim() : defaults.database.user,
      password: typeof saved?.database?.password === 'string' ? saved.database.password : defaults.database.password,
      dbname: typeof saved?.database?.dbname === 'string' ? saved.database.dbname.trim() : defaults.database.dbname,
      sslmode: normalizeSslMode(saved?.database?.sslmode)
    },
    redis: {
      host: typeof saved?.redis?.host === 'string' ? saved.redis.host.trim() || defaults.redis.host : defaults.redis.host,
      port: normalizeSub2ApiDesktopPort(saved?.redis?.port ?? defaults.redis.port),
      password: typeof saved?.redis?.password === 'string' ? saved.redis.password : defaults.redis.password,
      db: normalizeNonNegativeInteger(saved?.redis?.db, defaults.redis.db, 15),
      enableTls: typeof saved?.redis?.enableTls === 'boolean' ? saved.redis.enableTls : defaults.redis.enableTls
    },
    admin: {
      email: typeof saved?.admin?.email === 'string' ? saved.admin.email.trim() : defaults.admin.email,
      password: typeof saved?.admin?.password === 'string' ? saved.admin.password : defaults.admin.password
    },
    timezone: typeof saved?.timezone === 'string' && saved.timezone.trim() ? saved.timezone.trim() : defaults.timezone
  }
}

export function normalizeSub2ApiDesktopRuntimeConfig(saved: Partial<Sub2ApiDesktopRuntimeConfig> | null | undefined): Sub2ApiDesktopRuntimeConfig {
  const defaults = createDefaultSub2ApiDesktopRuntimeConfig()
  return {
    autoStart: typeof saved?.autoStart === 'boolean' ? saved.autoStart : defaults.autoStart,
    host: normalizeSub2ApiDesktopHost(saved?.host),
    port: normalizeSub2ApiDesktopPort(saved?.port),
    runMode: saved?.runMode === 'simple' || saved?.runMode === 'standard' ? saved.runMode : defaults.runMode,
    binaryPath: typeof saved?.binaryPath === 'string' ? saved.binaryPath.trim() : defaults.binaryPath,
    dataDir: typeof saved?.dataDir === 'string' ? saved.dataDir.trim() : defaults.dataDir,
    configPath: typeof saved?.configPath === 'string' ? saved.configPath.trim() : defaults.configPath,
    logLevel: saved?.logLevel === 'debug' || saved?.logLevel === 'warn' || saved?.logLevel === 'error' ? saved.logLevel : defaults.logLevel
  }
}

export function buildSub2ApiDesktopGatewayRoot(runtimeConfig: Partial<Sub2ApiDesktopRuntimeConfig> | null | undefined) {
  const normalizedRuntimeConfig = normalizeSub2ApiDesktopRuntimeConfig(runtimeConfig)
  return `http://${resolveDesktopClientHost(normalizedRuntimeConfig.host)}:${normalizedRuntimeConfig.port}`
}

export function createDefaultSub2ApiRuntimeState(): Sub2ApiRuntimeState {
  const defaultBaseUrl = buildSub2ApiDesktopGatewayRoot(createDefaultSub2ApiDesktopRuntimeConfig())
  return {
    status: 'stopped',
    mode: 'desktop',
    host: SUB2API_DESKTOP_DEFAULT_HOST,
    port: SUB2API_DESKTOP_DEFAULT_PORT,
    baseUrl: defaultBaseUrl,
    adminUrl: defaultBaseUrl,
    pid: null,
    startedAt: 0,
    healthy: false,
    healthEndpoint: `${defaultBaseUrl}/health`,
    healthMessage: '本地网关尚未启动',
    resolvedBinaryPath: '',
    binaryExists: false,
    usingBundledBinary: false,
    resolvedDataDir: '',
    resolvedConfigPath: '',
    configExists: false,
    logFilePath: '',
    dependencyRoot: '',
    bundledBinaryPath: '',
    lastError: '',
    lastExitCode: null,
    managedAdminEmail: SUB2API_DESKTOP_DEFAULT_ADMIN_EMAIL,
    managedApiKeyName: SUB2API_DESKTOP_DEFAULT_API_KEY_NAME,
    managedApiKeyDetected: false,
    logs: []
  }
}

export function normalizeSub2ApiRuntimeState(saved: Partial<Sub2ApiRuntimeState> | null | undefined): Sub2ApiRuntimeState {
  const defaults = createDefaultSub2ApiRuntimeState()
  const host = normalizeSub2ApiDesktopHost(saved?.host)
  const port = normalizeSub2ApiDesktopPort(saved?.port)
  const baseUrl = typeof saved?.baseUrl === 'string' && saved.baseUrl.trim()
    ? saved.baseUrl.trim()
    : `http://${resolveDesktopClientHost(host)}:${port}`

  return {
    status: saved?.status === 'starting' || saved?.status === 'running' || saved?.status === 'stopping' || saved?.status === 'error' || saved?.status === 'missing-binary' || saved?.status === 'unavailable'
      ? saved.status
      : defaults.status,
    mode: saved?.mode === 'external' ? 'external' : 'desktop',
    host,
    port,
    baseUrl,
    adminUrl: typeof saved?.adminUrl === 'string' && saved.adminUrl.trim() ? saved.adminUrl.trim() : baseUrl,
    pid: Number.isFinite(saved?.pid) ? Number(saved?.pid) : null,
    startedAt: Number.isFinite(saved?.startedAt) ? Number(saved?.startedAt) : defaults.startedAt,
    healthy: Boolean(saved?.healthy),
    healthEndpoint: typeof saved?.healthEndpoint === 'string' && saved.healthEndpoint.trim() ? saved.healthEndpoint.trim() : `${baseUrl}/health`,
    healthMessage: typeof saved?.healthMessage === 'string' ? saved.healthMessage : defaults.healthMessage,
    resolvedBinaryPath: typeof saved?.resolvedBinaryPath === 'string' ? saved.resolvedBinaryPath.trim() : defaults.resolvedBinaryPath,
    binaryExists: typeof saved?.binaryExists === 'boolean' ? saved.binaryExists : defaults.binaryExists,
    usingBundledBinary: typeof saved?.usingBundledBinary === 'boolean' ? saved.usingBundledBinary : defaults.usingBundledBinary,
    resolvedDataDir: typeof saved?.resolvedDataDir === 'string' ? saved.resolvedDataDir.trim() : defaults.resolvedDataDir,
    resolvedConfigPath: typeof saved?.resolvedConfigPath === 'string' ? saved.resolvedConfigPath.trim() : defaults.resolvedConfigPath,
    configExists: typeof saved?.configExists === 'boolean' ? saved.configExists : defaults.configExists,
    logFilePath: typeof saved?.logFilePath === 'string' ? saved.logFilePath.trim() : defaults.logFilePath,
    dependencyRoot: typeof saved?.dependencyRoot === 'string' ? saved.dependencyRoot.trim() : defaults.dependencyRoot,
    bundledBinaryPath: typeof saved?.bundledBinaryPath === 'string' ? saved.bundledBinaryPath.trim() : defaults.bundledBinaryPath,
    lastError: typeof saved?.lastError === 'string' ? saved.lastError : defaults.lastError,
    lastExitCode: Number.isFinite(saved?.lastExitCode) ? Number(saved?.lastExitCode) : null,
    managedAdminEmail: typeof saved?.managedAdminEmail === 'string' && saved.managedAdminEmail.trim() ? saved.managedAdminEmail.trim() : defaults.managedAdminEmail,
    managedApiKeyName: typeof saved?.managedApiKeyName === 'string' && saved.managedApiKeyName.trim() ? saved.managedApiKeyName.trim() : defaults.managedApiKeyName,
    managedApiKeyDetected: typeof saved?.managedApiKeyDetected === 'boolean' ? saved.managedApiKeyDetected : defaults.managedApiKeyDetected,
    logs: Array.isArray(saved?.logs) ? saved.logs.map(item => String(item)).slice(-160) : defaults.logs
  }
}

export function createEmptySub2ApiSetupDiagnostics(): Sub2ApiSetupDiagnostics {
  return {
    checkedAt: 0,
    status: {
      reachable: false,
      needsSetup: null,
      step: 'unknown',
      endpoint: '',
      statusCode: null,
      message: '尚未检查 setup 状态'
    },
    items: []
  }
}

export function normalizeSub2ApiSetupDiagnostics(saved: Partial<Sub2ApiSetupDiagnostics> | null | undefined): Sub2ApiSetupDiagnostics {
  const defaults = createEmptySub2ApiSetupDiagnostics()
  return {
    checkedAt: Number.isFinite(saved?.checkedAt) ? Number(saved?.checkedAt) : defaults.checkedAt,
    status: {
      reachable: typeof saved?.status?.reachable === 'boolean' ? saved.status.reachable : defaults.status.reachable,
      needsSetup: typeof saved?.status?.needsSetup === 'boolean' ? saved.status.needsSetup : defaults.status.needsSetup,
      step: typeof saved?.status?.step === 'string' && saved.status.step.trim() ? saved.status.step.trim() : defaults.status.step,
      endpoint: typeof saved?.status?.endpoint === 'string' ? saved.status.endpoint.trim() : defaults.status.endpoint,
      statusCode: Number.isFinite(saved?.status?.statusCode) ? Number(saved?.status?.statusCode) : defaults.status.statusCode,
      message: typeof saved?.status?.message === 'string' ? saved.status.message : defaults.status.message
    },
    items: Array.isArray(saved?.items)
      ? saved.items.map(item => ({
        id: String(item?.id || ''),
        label: String(item?.label || ''),
        level: item?.level === 'success' || item?.level === 'info' || item?.level === 'warning' || item?.level === 'error' ? item.level : 'info',
        message: String(item?.message || '')
      })).filter(item => item.id && item.label)
      : defaults.items
  }
}

export function buildSub2ApiSetupFormIssues(profile: Sub2ApiDesktopSetupProfile): Sub2ApiSetupDiagnosticItem[] {
  const normalizedProfile = normalizeSub2ApiDesktopSetupProfile(profile)
  const issues: Sub2ApiSetupDiagnosticItem[] = []

  if (!normalizedProfile.database.host) {
    issues.push({ id: 'database-host', label: 'PostgreSQL 主机', level: 'error', message: '缺少 PostgreSQL 主机地址。' })
  }
  if (!normalizedProfile.database.user) {
    issues.push({ id: 'database-user', label: 'PostgreSQL 用户', level: 'error', message: '缺少 PostgreSQL 用户名。' })
  }
  if (!normalizedProfile.database.dbname) {
    issues.push({ id: 'database-name', label: 'PostgreSQL 数据库', level: 'error', message: '缺少 PostgreSQL 数据库名。' })
  }
  if (!normalizedProfile.redis.host) {
    issues.push({ id: 'redis-host', label: 'Redis 主机', level: 'error', message: '缺少 Redis 主机地址。' })
  }
  if (!normalizedProfile.admin.email) {
    issues.push({ id: 'admin-email', label: '管理员邮箱', level: 'error', message: '缺少管理员邮箱。' })
  } else if (!isLikelyEmail(normalizedProfile.admin.email)) {
    issues.push({ id: 'admin-email-format', label: '管理员邮箱', level: 'error', message: '管理员邮箱格式无效，setup 接口会直接拒绝该请求。' })
  }
  if (!normalizedProfile.admin.password) {
    issues.push({ id: 'admin-password', label: '管理员密码', level: 'error', message: '缺少管理员密码。' })
  } else if (normalizedProfile.admin.password.length < 8) {
    issues.push({ id: 'admin-password-length', label: '管理员密码', level: 'error', message: '管理员密码至少需要 8 位，setup 接口会直接拒绝过短密码。' })
  }
  if (!normalizedProfile.timezone) {
    issues.push({ id: 'timezone', label: '时区', level: 'warning', message: `未设置时区时，预览会回退到 ${SUB2API_SETUP_DEFAULT_TIMEZONE}。` })
  }

  return issues
}

export function buildSub2ApiSetupInstallPayload(runtimeConfig: Partial<Sub2ApiDesktopRuntimeConfig> | null | undefined, profile: Partial<Sub2ApiDesktopSetupProfile> | null | undefined) {
  const normalizedRuntimeConfig = normalizeSub2ApiDesktopRuntimeConfig(runtimeConfig)
  const normalizedProfile = normalizeSub2ApiDesktopSetupProfile(profile)
  return {
    database: {
      host: normalizedProfile.database.host,
      port: normalizedProfile.database.port,
      user: normalizedProfile.database.user,
      password: normalizedProfile.database.password,
      dbname: normalizedProfile.database.dbname,
      sslmode: normalizedProfile.database.sslmode
    },
    redis: {
      host: normalizedProfile.redis.host,
      port: normalizedProfile.redis.port,
      password: normalizedProfile.redis.password,
      db: normalizedProfile.redis.db,
      enable_tls: normalizedProfile.redis.enableTls
    },
    admin: {
      email: normalizedProfile.admin.email,
      password: normalizedProfile.admin.password
    },
    server: {
      host: normalizedRuntimeConfig.host,
      port: normalizedRuntimeConfig.port,
      mode: normalizedRuntimeConfig.logLevel === 'debug' ? 'debug' : 'release'
    }
  }
}

export function createSub2ApiSetupConfigPreview(runtimeConfig: Partial<Sub2ApiDesktopRuntimeConfig> | null | undefined, profile: Partial<Sub2ApiDesktopSetupProfile> | null | undefined) {
  const normalizedRuntimeConfig = normalizeSub2ApiDesktopRuntimeConfig(runtimeConfig)
  const normalizedProfile = normalizeSub2ApiDesktopSetupProfile(profile)
  const timezone = normalizedProfile.timezone || SUB2API_SETUP_DEFAULT_TIMEZONE

  return `# Sub2API 初始化预览\n# 说明：管理员密码不会写入 config.yaml；JWT 密钥会在安装时自动生成\nserver:\n  host: ${quoteYamlString(normalizedRuntimeConfig.host)}\n  port: ${normalizedRuntimeConfig.port}\n  mode: ${quoteYamlString(normalizedRuntimeConfig.logLevel === 'debug' ? 'debug' : 'release')}\ndatabase:\n  host: ${quoteYamlString(normalizedProfile.database.host)}\n  port: ${normalizedProfile.database.port}\n  user: ${quoteYamlString(normalizedProfile.database.user)}\n  password: ${quoteYamlString(normalizedProfile.database.password)}\n  dbname: ${quoteYamlString(normalizedProfile.database.dbname)}\n  sslmode: ${quoteYamlString(normalizedProfile.database.sslmode)}\nredis:\n  host: ${quoteYamlString(normalizedProfile.redis.host)}\n  port: ${normalizedProfile.redis.port}\n  password: ${quoteYamlString(normalizedProfile.redis.password)}\n  db: ${normalizedProfile.redis.db}\n  enable_tls: ${normalizedProfile.redis.enableTls ? 'true' : 'false'}\njwt:\n  secret: '<install-time autogenerated>'\n  expire_hour: 24\ndefault:\n  user_concurrency: 5\n  user_balance: 0\n  api_key_prefix: 'sk-'\n  rate_multiplier: 1\nrate_limit:\n  requests_per_minute: 60\n  burst_size: 10\ntimezone: ${quoteYamlString(timezone)}\n`
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

  if (protocol === 'gemini') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (apiKey.trim()) {
      headers['x-goog-api-key'] = apiKey.trim()
    }

    return headers
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

function isResponsesOnlyCompatibilityError(status: number, message: string) {
  if (status < 400 || status >= 500) {
    return false
  }

  const normalizedMessage = message.toLowerCase()
  return normalizedMessage.includes('unsupported legacy protocol')
    || normalizedMessage.includes('please use /v1/responses')
    || (normalizedMessage.includes('/v1/chat/completions') && normalizedMessage.includes('not supported'))
    || (normalizedMessage.includes('legacy protocol') && normalizedMessage.includes('/v1/responses'))
}

function normalizeGeminiModelName(model: string) {
  return model.trim().replace(/^models\//i, '')
}

function buildGeminiGenerateContentEndpoint(baseUrl: string, model: string, stream = false) {
  const normalizedModel = normalizeGeminiModelName(model)
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  return `${baseUrl}/models/${encodeURIComponent(normalizedModel)}:${action}`
}

export function resolveSub2ApiMode(template: AIGatewayTemplate): Sub2ApiMode | null {
  if (template === 'sub2api-claude') {
    return 'claude'
  }

  if (template === 'sub2api-openai') {
    return 'openai'
  }

  if (template === 'sub2api-gemini') {
    return 'gemini'
  }

  if (template === 'sub2api-antigravity') {
    return 'antigravity'
  }

  return null
}

export function createDefaultSub2ApiConfig(): Sub2ApiStoredConfig {
  return {
    gatewayMode: 'desktop',
    gatewayRoot: '',
    apiKey: '',
    activeMode: 'openai',
    preferredModels: {
      claude: SUB2API_MODE_PRESETS.claude.recommendedModel,
      openai: SUB2API_MODE_PRESETS.openai.recommendedModel,
      gemini: SUB2API_MODE_PRESETS.gemini.recommendedModel,
      antigravity: SUB2API_MODE_PRESETS.antigravity.recommendedModel
    },
    desktopRuntime: createDefaultSub2ApiDesktopRuntimeConfig(),
    desktopManaged: createDefaultSub2ApiDesktopManagedConfig(),
    desktopSetup: createDefaultSub2ApiDesktopSetupProfile()
  }
}

export function normalizeSub2ApiConfig(saved: Partial<Sub2ApiStoredConfig> | null | undefined): Sub2ApiStoredConfig {
  const defaults = createDefaultSub2ApiConfig()
  const legacyPreferredModels = saved?.preferredModels as Record<string, string> | undefined
  const legacyAntigravityGeminiModel = typeof legacyPreferredModels?.['antigravity-gemini'] === 'string'
    ? legacyPreferredModels['antigravity-gemini'].trim()
    : ''
  const preferredModels = {
    ...defaults.preferredModels,
    ...(saved?.preferredModels ?? {})
  }
  const inferredGatewayMode = saved?.gatewayMode === 'desktop' || saved?.gatewayMode === 'external'
    ? saved.gatewayMode
    : typeof saved?.gatewayRoot === 'string' && saved.gatewayRoot.trim()
      ? 'external'
      : defaults.gatewayMode

  const savedActiveMode = saved?.activeMode as string | undefined
  const activeMode = savedActiveMode === 'claude'
    || savedActiveMode === 'openai'
    || savedActiveMode === 'gemini'
    || savedActiveMode === 'antigravity'
    ? savedActiveMode
    : savedActiveMode === 'antigravity-gemini'
      ? 'antigravity'
    : defaults.activeMode

  return {
    gatewayMode: inferredGatewayMode,
    gatewayRoot: normalizeSub2ApiGatewayRoot(saved?.gatewayRoot || ''),
    apiKey: typeof saved?.apiKey === 'string' ? saved.apiKey.trim() : '',
    activeMode,
    preferredModels: {
      claude: preferredModels.claude?.trim() || defaults.preferredModels.claude,
      openai: preferredModels.openai?.trim() || defaults.preferredModels.openai,
      gemini: preferredModels.gemini?.trim() || defaults.preferredModels.gemini,
      antigravity: preferredModels.antigravity?.trim() || legacyAntigravityGeminiModel || defaults.preferredModels.antigravity
    },
    desktopRuntime: normalizeSub2ApiDesktopRuntimeConfig(saved?.desktopRuntime),
    desktopManaged: normalizeSub2ApiDesktopManagedConfig(saved?.desktopManaged),
    desktopSetup: normalizeSub2ApiDesktopSetupProfile(saved?.desktopSetup)
  }
}

export function resolveSub2ApiGatewayRoot(config: Sub2ApiStoredConfig, runtimeState?: Partial<Sub2ApiRuntimeState> | null) {
  if (config.gatewayMode === 'desktop') {
    if (typeof runtimeState?.baseUrl === 'string' && runtimeState.baseUrl.trim()) {
      return normalizeSub2ApiGatewayRoot(runtimeState.baseUrl)
    }

    return normalizeSub2ApiGatewayRoot(buildSub2ApiDesktopGatewayRoot(config.desktopRuntime))
  }

  return normalizeSub2ApiGatewayRoot(config.gatewayRoot)
}

export function hasSub2ApiSignal(config: Partial<Sub2ApiStoredConfig> | null | undefined, runtimeState?: Partial<Sub2ApiRuntimeState> | null) {
  return Boolean(
    config?.apiKey?.trim()
    || config?.gatewayRoot?.trim()
    || runtimeState?.status && runtimeState.status !== 'stopped'
    || runtimeState?.managedApiKeyDetected
    || runtimeState?.healthy
    || runtimeState?.logs?.length
  )
}

export function getSub2ApiRuntimePresentation(runtimeState: Partial<Sub2ApiRuntimeState> | null | undefined, gatewayMode: Sub2ApiGatewayMode = 'desktop') {
  if (gatewayMode === 'external') {
    return {
      label: runtimeState?.healthy ? '外部网关可用' : '外部网关待验证',
      detail: runtimeState?.healthMessage?.trim() || '当前通过外部 Sub2API 网关接入，可在 Agent 内直接执行模型读取与能力检查。',
      tone: runtimeState?.healthy ? 'success' : 'info'
    } satisfies {
      label: string
      detail: string
      tone: Sub2ApiRuntimePresentationTone
    }
  }

  switch (runtimeState?.status) {
    case 'running':
      return {
        label: runtimeState.healthy ? '本地网关运行中' : '本地服务已启动',
        detail: runtimeState.healthMessage?.trim() || (runtimeState.healthy ? '本地 Sub2API 网关已经就绪，可直接用于 Agent 与 Codex 路由。' : '进程已启动，但健康检查还没有完全通过。'),
        tone: runtimeState.healthy ? 'success' : 'info'
      } satisfies {
        label: string
        detail: string
        tone: Sub2ApiRuntimePresentationTone
      }
    case 'starting':
      return {
        label: '本地网关启动中',
        detail: runtimeState.healthMessage?.trim() || '正在拉起本地 Sub2API 网关，稍后即可读取模型与接管 Agent。',
        tone: 'info'
      }
    case 'stopping':
      return {
        label: '本地网关停止中',
        detail: runtimeState.healthMessage?.trim() || '当前正在停止本地 Sub2API 网关。',
        tone: 'info'
      }
    case 'missing-binary':
      return {
        label: '缺少本地二进制',
        detail: runtimeState.lastError?.trim() || '尚未找到 Sub2API 运行时二进制，请先在 Sub2API 页面完成运行时准备。',
        tone: 'warning'
      }
    case 'unavailable':
      return {
        label: '当前环境不可用',
        detail: runtimeState.lastError?.trim() || '当前环境无法直接托管本地 Sub2API 运行时，请改用外部网关。',
        tone: 'warning'
      }
    case 'error':
      return {
        label: '本地网关异常',
        detail: runtimeState.lastError?.trim() || runtimeState.healthMessage?.trim() || '本地 Sub2API 网关启动失败或运行过程中退出。',
        tone: 'danger'
      }
    default:
      return {
        label: '本地网关未启动',
        detail: runtimeState?.healthMessage?.trim() || '尚未启动本地 Sub2API 网关，当前无法直接读取账号池模型或执行能力检查。',
        tone: 'warning'
      }
  }
}

export function createEmptySub2ApiModelRegistry(): Sub2ApiModelRegistry {
  return {
    claude: { models: [], updatedAt: 0, error: '' },
    openai: { models: [], updatedAt: 0, error: '' },
    gemini: { models: [], updatedAt: 0, error: '' },
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
    gemini: {
      models: Array.isArray(registry.gemini?.models) ? registry.gemini.models : [],
      updatedAt: Number.isFinite(registry.gemini?.updatedAt) ? Number(registry.gemini.updatedAt) : 0,
      error: typeof registry.gemini?.error === 'string' ? registry.gemini.error : ''
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
    gemini: [],
    antigravity: []
  }
}

export function normalizeSub2ApiCheckRegistry(saved: Partial<Sub2ApiCheckRegistry> | null | undefined): Sub2ApiCheckRegistry {
  const defaults = createEmptySub2ApiCheckRegistry()
  const registry = { ...defaults, ...(saved ?? {}) }

  return {
    claude: Array.isArray(registry.claude) ? registry.claude : [],
    openai: Array.isArray(registry.openai) ? registry.openai : [],
    gemini: Array.isArray(registry.gemini) ? registry.gemini : [],
    antigravity: Array.isArray(registry.antigravity) ? registry.antigravity : []
  }
}

export function getSub2ApiPreferredModel(config: Sub2ApiStoredConfig, mode: Sub2ApiMode) {
  return config.preferredModels[mode]?.trim() || SUB2API_MODE_PRESETS[mode].recommendedModel
}

export function buildSub2ApiAiPatch(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, runtimeState?: Partial<Sub2ApiRuntimeState> | null): Partial<AIConfig> {
  const preset = SUB2API_MODE_PRESETS[mode]
  return {
    protocol: preset.protocol,
    connectionTemplate: preset.connectionTemplate,
    apiKey: config.apiKey.trim(),
    baseUrl: buildSub2ApiBaseUrl(resolveSub2ApiGatewayRoot(config, runtimeState), mode),
    model: getSub2ApiPreferredModel(config, mode)
  }
}

export function buildSub2ApiAiConfig(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, runtimeState?: Partial<Sub2ApiRuntimeState> | null): AIConfig {
  return {
    apiKey: config.apiKey.trim(),
    baseUrl: buildSub2ApiBaseUrl(resolveSub2ApiGatewayRoot(config, runtimeState), mode),
    model: getSub2ApiPreferredModel(config, mode),
    protocol: SUB2API_MODE_PRESETS[mode].protocol,
    connectionTemplate: SUB2API_MODE_PRESETS[mode].connectionTemplate,
    contextWindow: 128000,
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: ''
  }
}

export async function fetchSub2ApiModels(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, signal?: AbortSignal, runtimeState?: Partial<Sub2ApiRuntimeState> | null) {
  return fetchAvailableModels(buildSub2ApiAiConfig(config, mode, runtimeState), signal)
}

export async function runSub2ApiCapabilityCheck(config: Sub2ApiStoredConfig, mode: Sub2ApiMode, modelOverride?: string, runtimeState?: Partial<Sub2ApiRuntimeState> | null) {
  const normalizedConfig = normalizeSub2ApiConfig(config)
  const gatewayRoot = resolveSub2ApiGatewayRoot(normalizedConfig, runtimeState)
  const currentPreset = SUB2API_MODE_PRESETS[mode]

  if (!gatewayRoot) {
    throw new Error(normalizedConfig.gatewayMode === 'desktop' ? '请先在 Sub2API 页面启动本地网关' : '请先填写 Sub2API 网关根地址')
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

  if (currentPreset.protocol === 'gemini') {
    const generateContentUrl = buildGeminiGenerateContentEndpoint(currentBaseUrl, currentModel)
    const generateContentResponse = await fetch(generateContentUrl, {
      method: 'POST',
      headers: currentHeaders,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: 'ping' }]
        }],
        generationConfig: {
          maxOutputTokens: 1,
          temperature: 0
        }
      })
    })

    if (!generateContentResponse.ok) {
      checks.push({
        id: 'gemini-generate-content',
        label: `${currentPreset.title} 请求`,
        endpoint: generateContentUrl,
        state: 'error',
        message: `请求失败 (${generateContentResponse.status})：${await readSub2ApiErrorText(generateContentResponse) || '未返回更多信息'}`
      })
    } else {
      checks.push({
        id: 'gemini-generate-content',
        label: `${currentPreset.title} 请求`,
        endpoint: generateContentUrl,
        state: 'success',
        message: `模型 ${normalizeGeminiModelName(currentModel)} 已可正常响应。`
      })
    }

    checks.push({
      id: 'codex-ready',
      label: 'Codex / Responses 路径',
      endpoint: `${buildSub2ApiBaseUrl(gatewayRoot, 'openai')}/responses`,
      state: 'pending',
      message: '当前不在 OpenAI 路由。要验证 Codex / Responses 能力，请切换到「OpenAI 路由」后重新检查。'
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

  let usesResponsesOnlyCompatibility = false
  if (!chatResponse.ok) {
    const chatErrorText = await readSub2ApiErrorText(chatResponse)
    usesResponsesOnlyCompatibility = isResponsesOnlyCompatibilityError(chatResponse.status, chatErrorText)

    checks.push({
      id: 'chat-completions',
      label: 'Legacy Chat Completions 兼容层',
      endpoint: chatUrl,
      state: usesResponsesOnlyCompatibility ? 'pending' : 'error',
      message: usesResponsesOnlyCompatibility
        ? '服务端已明确关闭 legacy /v1/chat/completions，仅保留 /v1/responses。这不会影响当前 OpenAgent 与 Codex 主链路。'
        : `请求失败 (${chatResponse.status})：${chatErrorText || '未返回更多信息'}`
    })
  } else {
    checks.push({
      id: 'chat-completions',
      label: 'Legacy Chat Completions 兼容层',
      endpoint: chatUrl,
      state: 'success',
      message: `服务端仍兼容 /v1/chat/completions，旧版 OpenAI 客户端也可通过这条路径访问模型 ${currentModel}。`
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
      message: usesResponsesOnlyCompatibility
        ? 'Responses API 已可用。当前服务端属于 Responses-only 模式，OpenAgent 会继续优先走这条主路径；若分组绑定的是 OpenAI OAuth / Codex 登录账号，这条路径也能消耗 Codex 额度。'
        : 'Responses API 已可用。当前桌面助手会优先走这条主路径；若服务端分组绑定的是 OpenAI OAuth / Codex 登录账号，这条路径也能消耗 Codex 额度。'
    })
  }

  return checks
}

export function createSub2ApiCodexConfigToml(config: Sub2ApiStoredConfig, model = 'gpt-5.4', runtimeState?: Partial<Sub2ApiRuntimeState> | null) {
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
base_url = "${buildSub2ApiBaseUrl(resolveSub2ApiGatewayRoot(config, runtimeState), 'openai') || `${SUB2API_GATEWAY_PLACEHOLDER}/v1`}"
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
