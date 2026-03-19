import { randomBytes } from 'crypto'
import { request as httpRequest } from 'http'
import { createSub2ApiRuntimeManager } from './sub2apiRuntime'
import type {
  Sub2ApiDesktopAccessResult,
  Sub2ApiDesktopManagedConfig,
  Sub2ApiDesktopRuntimeConfig,
  Sub2ApiRuntimeState,
  Sub2ApiSetupActionResult,
  Sub2ApiSetupDatabaseConfig,
  Sub2ApiSetupDiagnostics,
  Sub2ApiSetupRedisConfig,
  Sub2ApiDesktopSetupProfile
} from '../src/types'

type Sub2ApiDesktopManagerOptions = {
  getDataDir: () => string
  onStateChange?: (state: Sub2ApiRuntimeState) => void
}

type HttpJsonResult = {
  ok: boolean
  statusCode: number
  message: string
  body: string
  json: unknown
}

const DEFAULT_SHARED_PASSWORD = 'OpenAgentnh'
const DEFAULT_ADMIN_EMAIL = 'admin@openagent.local'
const DEFAULT_API_KEY_NAME = 'OpenAgent Desktop'
const REQUEST_TIMEOUT = 10000

function normalizeManagedConfig(saved?: Partial<Sub2ApiDesktopManagedConfig> | null): Sub2ApiDesktopManagedConfig {
  return {
    sharedPassword: typeof saved?.sharedPassword === 'string' && saved.sharedPassword.trim() ? saved.sharedPassword : DEFAULT_SHARED_PASSWORD,
    adminEmail: typeof saved?.adminEmail === 'string' && saved.adminEmail.trim() ? saved.adminEmail.trim() : DEFAULT_ADMIN_EMAIL,
    apiKeyName: typeof saved?.apiKeyName === 'string' && saved.apiKeyName.trim() ? saved.apiKeyName.trim() : DEFAULT_API_KEY_NAME
  }
}

function getRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function extractAccessToken(payload: unknown): string {
  const record = getRecord(payload)
  if (!record) {
    return ''
  }

  if (typeof record.access_token === 'string' && record.access_token.trim()) {
    return record.access_token.trim()
  }

  const data = getRecord(record.data)
  if (data && typeof data.access_token === 'string' && data.access_token.trim()) {
    return data.access_token.trim()
  }

  return ''
}

function extractApiKey(payload: unknown): string {
  const record = getRecord(payload)
  if (!record) {
    return ''
  }

  if (typeof record.key === 'string' && record.key.trim()) {
    return record.key.trim()
  }

  const data = getRecord(record.data)
  if (data && typeof data.key === 'string' && data.key.trim()) {
    return data.key.trim()
  }

  return ''
}

function extractArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload
      .map(item => getRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
  }

  const record = getRecord(payload)
  if (!record) {
    return []
  }

  const recordData = getRecord(record.data)
  const directItems: unknown[] = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.records)
      ? record.records
      : Array.isArray(record.data)
        ? record.data
        : Array.isArray(recordData?.items)
          ? recordData.items
          : []

  return directItems
    .map(item => getRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
}

async function requestJson(url: string, method: 'GET' | 'POST', payload?: unknown, headers?: Record<string, string>): Promise<HttpJsonResult> {
  return new Promise(resolve => {
    const serializedPayload = typeof payload === 'undefined' ? '' : JSON.stringify(payload)
    const requestHeaders: Record<string, string | number> = {
      Accept: 'application/json',
      ...(headers ?? {})
    }

    if (serializedPayload) {
      requestHeaders['Content-Type'] = 'application/json'
      requestHeaders['Content-Length'] = Buffer.byteLength(serializedPayload)
    }

    const req = httpRequest(new URL(url), {
      method,
      timeout: REQUEST_TIMEOUT,
      headers: requestHeaders
    }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        body += chunk
      })
      res.on('end', () => {
        let parsed: unknown = null
        let message = `HTTP ${res.statusCode || 500}`

        if (body.trim()) {
          try {
            parsed = JSON.parse(body)
            const record = getRecord(parsed)
            if (record && typeof record.message === 'string' && record.message.trim()) {
              message = record.message.trim()
            }
          } catch {
            message = body.trim().slice(0, 240) || message
          }
        }

        resolve({
          ok: (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300,
          statusCode: res.statusCode || 500,
          message,
          body,
          json: parsed
        })
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('请求超时'))
    })
    req.on('error', error => {
      resolve({
        ok: false,
        statusCode: 0,
        message: error instanceof Error ? error.message : '请求失败',
        body: '',
        json: null
      })
    })

    if (serializedPayload) {
      req.write(serializedPayload)
    }

    req.end()
  })
}

export function createSub2ApiDesktopManager(options: Sub2ApiDesktopManagerOptions) {
  let desiredManagedConfig = normalizeManagedConfig()
  let managedApiKeyDetected = false

  function attachManagedState(runtimeState: Sub2ApiRuntimeState) {
    return {
      ...runtimeState,
      managedAdminEmail: desiredManagedConfig.adminEmail,
      managedApiKeyName: desiredManagedConfig.apiKeyName,
      managedApiKeyDetected
    } satisfies Sub2ApiRuntimeState
  }

  function emitManagedState(runtimeState: Sub2ApiRuntimeState) {
    const nextState = attachManagedState(runtimeState)
    options.onStateChange?.(nextState)
    return nextState
  }

  function syncManagedConfig(managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    desiredManagedConfig = normalizeManagedConfig({
      ...desiredManagedConfig,
      ...(managedConfig ?? {})
    })
  }

  const binaryManager = createSub2ApiRuntimeManager({
    getDataDir: options.getDataDir,
    onStateChange: (runtimeState) => {
      void emitManagedState(runtimeState)
    }
  })

  async function getRuntimeState(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    return emitManagedState(await binaryManager.getRuntimeState(runtimeConfig))
  }

  async function startRuntime(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    return emitManagedState(await binaryManager.startRuntime(runtimeConfig))
  }

  async function stopRuntime() {
    return emitManagedState(await binaryManager.stopRuntime())
  }

  async function restartRuntime(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    return emitManagedState(await binaryManager.restartRuntime(runtimeConfig))
  }

  async function inspectSetup(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>): Promise<Sub2ApiSetupDiagnostics> {
    syncManagedConfig(managedConfig)
    const diagnostics = await binaryManager.inspectSetup(runtimeConfig)

    return {
      ...diagnostics,
      items: [
        ...diagnostics.items,
        diagnostics.status.needsSetup === false
          ? {
            id: 'desktop-access',
            label: '桌面专属 Key 自动接入',
            level: managedApiKeyDetected ? 'success' : 'info',
            message: managedApiKeyDetected
              ? `已识别 ${desiredManagedConfig.apiKeyName}，可直接同步到 AI 设置。`
              : `初始化完成后，OpenAgent 会尝试使用 ${desiredManagedConfig.adminEmail} 自动登录后台并创建或复用 ${desiredManagedConfig.apiKeyName}。`
          }
          : {
            id: 'desktop-access',
            label: '桌面专属 Key 自动接入',
            level: 'info',
            message: '当前实例还未完成初始化。完成 setup 后即可自动识别或创建 OpenAgent 专属 API Key。'
          }
      ]
    }
  }

  async function testSetupDatabase(payload: Partial<Sub2ApiSetupDatabaseConfig>, runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>) {
    return binaryManager.testSetupDatabase(payload, runtimeConfig)
  }

  async function testSetupRedis(payload: Partial<Sub2ApiSetupRedisConfig>, runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>) {
    return binaryManager.testSetupRedis(payload, runtimeConfig)
  }

  async function loginAdmin(baseUrl: string) {
    const result = await requestJson(`${baseUrl}/api/v1/auth/login`, 'POST', {
      email: desiredManagedConfig.adminEmail,
      password: desiredManagedConfig.sharedPassword
    })
    const accessToken = extractAccessToken(result.json)
    if (!result.ok || !accessToken) {
      throw new Error('未能自动登录本地 Sub2API 管理员账号，请确认初始化时填写的管理员邮箱和密码与当前自动接入参数一致。')
    }

    return accessToken
  }

  async function findExistingApiKey(baseUrl: string, accessToken: string) {
    const query = encodeURIComponent(desiredManagedConfig.apiKeyName)
    const result = await requestJson(`${baseUrl}/api/v1/keys?page=1&page_size=100&search=${query}`, 'GET', undefined, {
      Authorization: `Bearer ${accessToken}`
    })

    if (!result.ok) {
      return ''
    }

    const matched = extractArray(result.json).find(item => item.name === desiredManagedConfig.apiKeyName && typeof item.key === 'string' && item.key.trim())
    return typeof matched?.key === 'string' ? matched.key.trim() : ''
  }

  async function createApiKey(baseUrl: string, accessToken: string) {
    const customKey = `sk-${randomBytes(18).toString('hex')}`
    const payloads = [
      { name: desiredManagedConfig.apiKeyName, custom_key: customKey },
      { name: desiredManagedConfig.apiKeyName }
    ]

    for (const payload of payloads) {
      const result = await requestJson(`${baseUrl}/api/v1/keys`, 'POST', payload, {
        Authorization: `Bearer ${accessToken}`
      })
      const apiKey = extractApiKey(result.json)
      if (result.ok && apiKey) {
        return apiKey
      }
    }

    throw new Error('未能自动创建 OpenAgent 专属 API Key，请先在后台确认管理员账号可登录。')
  }

  async function installSetup(payload: Partial<Sub2ApiDesktopSetupProfile>, runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    const result = await binaryManager.installSetup(payload, runtimeConfig)
    if (!result.success) {
      return result
    }

    const access = await ensureDesktopAccess(runtimeConfig, managedConfig)
    if (!access.success) {
      return {
        ...result,
        details: `${result.details}${result.details ? ' ' : ''}${access.message}`
      } satisfies Sub2ApiSetupActionResult
    }

    return {
      ...result,
      details: `${result.details}${result.details ? ' ' : ''}已自动同步 ${access.apiKeyName || '专属 API Key'}。`,
      data: {
        result: result.data,
        access
      }
    } satisfies Sub2ApiSetupActionResult
  }

  async function ensureDesktopAccess(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>, currentApiKey?: string): Promise<Sub2ApiDesktopAccessResult> {
    syncManagedConfig(managedConfig)

    let runtimeState = await getRuntimeState(runtimeConfig, managedConfig)
    if (runtimeState.status !== 'running') {
      runtimeState = await startRuntime(runtimeConfig, managedConfig)
    }

    const setupDiagnostics = await binaryManager.inspectSetup(runtimeConfig).catch(() => null)
    if (setupDiagnostics?.status.needsSetup !== false) {
      managedApiKeyDetected = false
      const nextState = emitManagedState(runtimeState)
      return {
        success: false,
        gatewayRoot: nextState.baseUrl,
        adminUrl: nextState.adminUrl,
        apiKey: '',
        apiKeyName: desiredManagedConfig.apiKeyName,
        adminEmail: desiredManagedConfig.adminEmail,
        message: '当前本地 Sub2API 还没有完成初始化，请先打开内嵌后台完成 setup。',
        runtimeState: nextState
      }
    }

    const currentKey = typeof currentApiKey === 'string' ? currentApiKey.trim() : ''

    try {
      const accessToken = await loginAdmin(runtimeState.baseUrl)
      let apiKey = currentKey || await findExistingApiKey(runtimeState.baseUrl, accessToken)
      if (!apiKey) {
        apiKey = await createApiKey(runtimeState.baseUrl, accessToken)
      }

      managedApiKeyDetected = Boolean(apiKey)
      const nextState = emitManagedState(runtimeState)
      return {
        success: Boolean(apiKey),
        gatewayRoot: nextState.baseUrl,
        adminUrl: nextState.adminUrl,
        apiKey,
        apiKeyName: desiredManagedConfig.apiKeyName,
        adminEmail: desiredManagedConfig.adminEmail,
        message: currentKey && currentKey === apiKey
          ? '已复用当前 Sub2API API Key'
          : '已自动识别本地 Sub2API 与 OpenAgent 专属 API Key',
        runtimeState: nextState
      }
    } catch (error) {
      if (currentKey) {
        managedApiKeyDetected = false
        const nextState = emitManagedState(runtimeState)
        return {
          success: true,
          gatewayRoot: nextState.baseUrl,
          adminUrl: nextState.adminUrl,
          apiKey: currentKey,
          apiKeyName: desiredManagedConfig.apiKeyName,
          adminEmail: desiredManagedConfig.adminEmail,
          message: '未能自动识别专属 Key，已继续复用当前填写的 API Key。',
          runtimeState: nextState
        }
      }

      managedApiKeyDetected = false
      const nextState = emitManagedState(runtimeState)
      return {
        success: false,
        gatewayRoot: nextState.baseUrl,
        adminUrl: nextState.adminUrl,
        apiKey: '',
        apiKeyName: desiredManagedConfig.apiKeyName,
        adminEmail: desiredManagedConfig.adminEmail,
        message: error instanceof Error ? error.message : '自动识别本地专属 API Key 失败',
        runtimeState: nextState
      }
    }
  }

  async function syncSource(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    const result = await binaryManager.syncSource(runtimeConfig)
    await getRuntimeState(runtimeConfig, managedConfig)
    return result
  }

  async function buildSource(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    const result = await binaryManager.buildSource(runtimeConfig)
    await getRuntimeState(runtimeConfig, managedConfig)
    return result
  }

  async function startDependencies(profile?: Partial<Sub2ApiDesktopSetupProfile>, runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    const result = await binaryManager.startDependencies(profile, runtimeConfig)
    await getRuntimeState(runtimeConfig, managedConfig)
    return result
  }

  async function stopDependencies(runtimeConfig?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) {
    syncManagedConfig(managedConfig)
    const result = await binaryManager.stopDependencies(runtimeConfig)
    await getRuntimeState(runtimeConfig, managedConfig)
    return result
  }

  async function shutdown() {
    await binaryManager.shutdown()
  }

  return {
    getRuntimeState,
    startRuntime,
    stopRuntime,
    restartRuntime,
    inspectSetup,
    testSetupDatabase,
    testSetupRedis,
    installSetup,
    startDependencies,
    stopDependencies,
    syncSource,
    buildSource,
    ensureDesktopAccess,
    shutdown
  }
}
