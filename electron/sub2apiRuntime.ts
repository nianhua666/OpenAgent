import { spawn } from 'child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { request as httpRequest } from 'http'
import { app } from 'electron'
import { basename, dirname, join, normalize } from 'path'
import type {
  Sub2ApiDesktopRuntimeConfig,
  Sub2ApiDesktopSetupProfile,
  Sub2ApiRuntimeState,
  Sub2ApiSetupActionResult,
  Sub2ApiSetupDatabaseConfig,
  Sub2ApiSetupDiagnostics,
  Sub2ApiSetupRedisConfig
} from '../src/types'

type Sub2ApiRuntimeManagerOptions = {
  getDataDir: () => string
  onStateChange?: (state: Sub2ApiRuntimeState) => void
}

type ResolvedRuntimeContext = {
  config: Sub2ApiDesktopRuntimeConfig
  dependencyRoot: string
  bundledBinaryPath: string
  resolvedBinaryPath: string
  usingBundledBinary: boolean
  resolvedDataDir: string
  resolvedConfigPath: string
  configExists: boolean
  logFilePath: string
  baseUrl: string
  adminUrl: string
  healthEndpoint: string
  binaryExists: boolean
}

const SUB2API_RUNTIME_DIR_NAME = 'sub2api-runtime'
const SUB2API_BINARY_NAME = process.platform === 'win32' ? 'sub2api.exe' : 'sub2api'
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 38080
const MAX_LOG_LINES = 160
const HEALTH_POLL_INTERVAL = 5000
const HEALTH_REQUEST_TIMEOUT = 1500
const STOP_TIMEOUT = 5000
const SETUP_REQUEST_TIMEOUT = 8000
const SETUP_INSTALL_TIMEOUT = 60000

type SetupEnvelope<T = unknown> = {
  code?: number
  message?: string
  data?: T
}

type SetupStatusPayload = {
  needs_setup?: boolean
  step?: string
}

type SetupHttpResult<T = unknown> = {
  ok: boolean
  statusCode: number
  message: string
  data: T | null
  rawText: string
}

function normalizePath(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? normalize(trimmed) : ''
}

function ensureDirectoryExists(targetPath: string) {
  if (targetPath && !existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true })
  }
}

function normalizeHost(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || DEFAULT_HOST
}

function normalizePort(value: unknown) {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) {
    return DEFAULT_PORT
  }

  return Math.min(Math.max(Math.round(nextValue), 1), 65535)
}

function resolveClientHost(host: string) {
  const normalizedHost = normalizeHost(host)
  if (normalizedHost === '0.0.0.0' || normalizedHost === '::' || normalizedHost === '::0') {
    return '127.0.0.1'
  }

  return normalizedHost
}

function normalizeRuntimeConfig(saved?: Partial<Sub2ApiDesktopRuntimeConfig> | null): Sub2ApiDesktopRuntimeConfig {
  return {
    autoStart: Boolean(saved?.autoStart),
    host: normalizeHost(saved?.host),
    port: normalizePort(saved?.port),
    runMode: saved?.runMode === 'standard' ? 'standard' : 'simple',
    binaryPath: normalizePath(saved?.binaryPath),
    dataDir: normalizePath(saved?.dataDir),
    configPath: normalizePath(saved?.configPath),
    logLevel: saved?.logLevel === 'debug' || saved?.logLevel === 'warn' || saved?.logLevel === 'error' ? saved.logLevel : 'info'
  }
}

function normalizeSetupProfile(saved?: Partial<Sub2ApiDesktopSetupProfile> | null): Sub2ApiDesktopSetupProfile {
  return {
    database: {
      host: typeof saved?.database?.host === 'string' && saved.database.host.trim() ? saved.database.host.trim() : '127.0.0.1',
      port: normalizePort(saved?.database?.port ?? 5432),
      user: typeof saved?.database?.user === 'string' && saved.database.user.trim() ? saved.database.user.trim() : 'postgres',
      password: typeof saved?.database?.password === 'string' ? saved.database.password : '',
      dbname: typeof saved?.database?.dbname === 'string' && saved.database.dbname.trim() ? saved.database.dbname.trim() : 'sub2api',
      sslmode: saved?.database?.sslmode === 'require' || saved?.database?.sslmode === 'verify-ca' || saved?.database?.sslmode === 'verify-full'
        ? saved.database.sslmode
        : 'disable'
    },
    redis: {
      host: typeof saved?.redis?.host === 'string' && saved.redis.host.trim() ? saved.redis.host.trim() : '127.0.0.1',
      port: normalizePort(saved?.redis?.port ?? 6379),
      password: typeof saved?.redis?.password === 'string' ? saved.redis.password : '',
      db: Math.min(Math.max(Number.isFinite(saved?.redis?.db) ? Number(saved?.redis?.db) : 0, 0), 15),
      enableTls: Boolean(saved?.redis?.enableTls)
    },
    admin: {
      email: typeof saved?.admin?.email === 'string' ? saved.admin.email.trim() : '',
      password: typeof saved?.admin?.password === 'string' ? saved.admin.password : ''
    },
    timezone: typeof saved?.timezone === 'string' && saved.timezone.trim() ? saved.timezone.trim() : 'Asia/Shanghai'
  }
}

function normalizeSetupDatabaseConfig(saved?: Partial<Sub2ApiSetupDatabaseConfig> | null): Sub2ApiSetupDatabaseConfig {
  return {
    host: typeof saved?.host === 'string' && saved.host.trim() ? saved.host.trim() : '127.0.0.1',
    port: normalizePort(saved?.port ?? 5432),
    user: typeof saved?.user === 'string' && saved.user.trim() ? saved.user.trim() : 'postgres',
    password: typeof saved?.password === 'string' ? saved.password : '',
    dbname: typeof saved?.dbname === 'string' && saved.dbname.trim() ? saved.dbname.trim() : 'sub2api',
    sslmode: saved?.sslmode === 'require' || saved?.sslmode === 'verify-ca' || saved?.sslmode === 'verify-full'
      ? saved.sslmode
      : 'disable'
  }
}

function normalizeSetupRedisConfig(saved?: Partial<Sub2ApiSetupRedisConfig> | null): Sub2ApiSetupRedisConfig {
  const redisDb = Number.isFinite(saved?.db) ? Number(saved?.db) : 0
  return {
    host: typeof saved?.host === 'string' && saved.host.trim() ? saved.host.trim() : '127.0.0.1',
    port: normalizePort(saved?.port ?? 6379),
    password: typeof saved?.password === 'string' ? saved.password : '',
    db: Math.min(Math.max(redisDb, 0), 15),
    enableTls: Boolean(saved?.enableTls)
  }
}

function buildBaseUrl(host: string, port: number) {
  return `http://${resolveClientHost(host)}:${normalizePort(port)}`
}

function clipLogs(logs: string[]) {
  return logs.slice(-MAX_LOG_LINES)
}

function wait(timeout: number) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

function buildLaunchPendingMessage(context: ResolvedRuntimeContext) {
  if (!context.configExists) {
    return '本地进程已启动，但还没有检测到 config.yaml；如果是首次运行，请打开后台完成 Sub2API 初始化。'
  }

  return '本地进程已启动，但健康接口尚未就绪；请检查 config.yaml、数据库和 Redis 是否已经准备好。'
}

function buildMissingBinaryMessage(context: ResolvedRuntimeContext) {
  return `未找到 Sub2API 可执行文件。当前解析路径为 ${context.resolvedBinaryPath}；请把二进制放到 ${context.bundledBinaryPath}，或在界面中手动指定 binaryPath。`
}

function buildSetupStatusEndpoint(context: ResolvedRuntimeContext) {
  return `${context.adminUrl}/setup/status`
}

function buildSetupDatabaseEndpoint(context: ResolvedRuntimeContext) {
  return `${context.adminUrl}/setup/test-db`
}

function buildSetupRedisEndpoint(context: ResolvedRuntimeContext) {
  return `${context.adminUrl}/setup/test-redis`
}

function buildSetupInstallEndpoint(context: ResolvedRuntimeContext) {
  return `${context.adminUrl}/setup/install`
}

function normalizeSetupActionDetails(details: string, fallback: string) {
  const normalized = String(details || '').trim()
  return normalized || fallback
}

function buildSetupDatabaseTarget(config: Sub2ApiSetupDatabaseConfig) {
  return `${config.host}:${config.port}/${config.dbname}`
}

function buildSetupRedisTarget(config: Sub2ApiSetupRedisConfig) {
  return `${config.host}:${config.port}/db${config.db}`
}

function formatSetupDependencyFailure(label: 'PostgreSQL' | 'Redis', target: string, details: string) {
  const normalized = normalizeSetupActionDetails(details, `${label} 未返回更多错误信息`)
  const lower = normalized.toLowerCase()

  if (lower.includes('connection refused') || lower.includes('actively refused') || lower.includes('connectex')) {
    return `${label} 无法连接到 ${target}。当前地址没有服务在监听，请先启动 ${label} 服务，或改成正确的主机和端口。原始错误：${normalized}`
  }

  if (lower.includes('no such host') || lower.includes('name or service not known') || lower.includes('getaddrinfo')) {
    return `${label} 主机解析失败：${target}。请确认主机名可解析，或直接改成可访问的 IP 地址。原始错误：${normalized}`
  }

  if (lower.includes('authentication failed') || lower.includes('password authentication failed') || lower.includes('invalid password') || lower.includes('noauth')) {
    return `${label} 鉴权失败：${target}。请确认账号、密码和认证方式是否正确。原始错误：${normalized}`
  }

  if (label === 'PostgreSQL' && lower.includes('does not exist')) {
    return `PostgreSQL 已连接到 ${target}，但目标数据库不存在。请先创建数据库，或改成已有数据库名。原始错误：${normalized}`
  }

  return normalized
}

function formatSetupInstallFailure(profile: Sub2ApiDesktopSetupProfile, details: string) {
  const normalized = normalizeSetupActionDetails(details, '未返回更多错误信息')
  const lower = normalized.toLowerCase()

  if (lower.includes('postgres') || lower.includes('database') || lower.includes(String(profile.database.port))) {
    return formatSetupDependencyFailure('PostgreSQL', buildSetupDatabaseTarget(profile.database), normalized)
  }

  if (lower.includes('redis') || lower.includes(String(profile.redis.port))) {
    return formatSetupDependencyFailure('Redis', buildSetupRedisTarget(profile.redis), normalized)
  }

  return normalized
}

async function waitForFile(targetPath: string, timeout = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (existsSync(targetPath)) {
      return true
    }

    await wait(250)
  }

  return existsSync(targetPath)
}

function patchConfigTimezone(configPath: string, timezone: string) {
  const normalizedTimezone = timezone.trim()
  if (!normalizedTimezone || !existsSync(configPath)) {
    return
  }

  const quotedTimezone = `'${normalizedTimezone.replace(/'/g, "''")}'`
  const source = readFileSync(configPath, 'utf-8')
  const nextContent = /^timezone:\s*.*$/m.test(source)
    ? source.replace(/^timezone:\s*.*$/m, `timezone: ${quotedTimezone}`)
    : `${source.replace(/\s*$/, '')}\ntimezone: ${quotedTimezone}\n`

  if (nextContent !== source) {
    writeFileSync(configPath, nextContent, 'utf-8')
  }
}

async function requestSetupJson<T>(endpoint: string, method: 'GET' | 'POST', body?: unknown, timeout = SETUP_REQUEST_TIMEOUT): Promise<SetupHttpResult<T>> {
  return new Promise(resolve => {
    const url = new URL(endpoint)
    const serializedBody = typeof body === 'undefined' ? '' : JSON.stringify(body)
    const headers: Record<string, string | number> = {
      Accept: 'application/json'
    }

    if (serializedBody) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(serializedBody)
    }

    const req = httpRequest(url, {
      method,
      timeout,
      headers
    }, res => {
      let rawText = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        rawText += chunk
      })
      res.on('end', () => {
        const statusCode = res.statusCode || 500
        let message = `HTTP ${statusCode}`
        let data: T | null = null
        let ok = statusCode >= 200 && statusCode < 300

        if (rawText.trim()) {
          try {
            const envelope = JSON.parse(rawText) as SetupEnvelope<T>
            if (typeof envelope.message === 'string' && envelope.message.trim()) {
              message = envelope.message.trim()
            }
            if (typeof envelope.code === 'number') {
              ok = ok && envelope.code === 0
            }
            data = typeof envelope.data === 'undefined' ? null : envelope.data
          } catch {
            message = rawText.trim().slice(0, 240) || message
          }
        }

        resolve({
          ok,
          statusCode,
          message,
          data,
          rawText: rawText.trim().slice(0, 2000)
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
        data: null,
        rawText: ''
      })
    })

    if (serializedBody) {
      req.write(serializedBody)
    }
    req.end()
  })
}

export function createSub2ApiRuntimeManager(options: Sub2ApiRuntimeManagerOptions) {
  let desiredConfig = normalizeRuntimeConfig()
  let runtimeProcess: ReturnType<typeof spawn> | null = null
  let healthTimer: NodeJS.Timeout | null = null
  let stopPromise: Promise<Sub2ApiRuntimeState> | null = null

  function resolveRuntimeContext(partial?: Partial<Sub2ApiDesktopRuntimeConfig>, allowConfigUpdate = !runtimeProcess) {
    if (partial && allowConfigUpdate) {
      desiredConfig = normalizeRuntimeConfig({
        ...desiredConfig,
        ...partial
      })
    }

    const dependencyRoot = app.isPackaged
      ? join(process.resourcesPath, SUB2API_RUNTIME_DIR_NAME)
      : join(process.cwd(), 'build', SUB2API_RUNTIME_DIR_NAME)

    const bundledBinaryPath = join(dependencyRoot, 'bin', SUB2API_BINARY_NAME)
    const resolvedBinaryPath = desiredConfig.binaryPath || bundledBinaryPath
    const usingBundledBinary = !desiredConfig.binaryPath

    let resolvedDataDir = desiredConfig.dataDir || join(options.getDataDir(), SUB2API_RUNTIME_DIR_NAME)
    let resolvedConfigPath = desiredConfig.configPath || join(resolvedDataDir, 'config.yaml')

    if (desiredConfig.configPath && existsSync(desiredConfig.configPath)) {
      const configName = basename(desiredConfig.configPath).toLowerCase()
      if (configName === 'config.yaml' || configName === 'config.yml') {
        resolvedDataDir = dirname(desiredConfig.configPath)
        resolvedConfigPath = desiredConfig.configPath
      }
    }

    const baseUrl = buildBaseUrl(desiredConfig.host, desiredConfig.port)
    const logFilePath = join(resolvedDataDir, 'logs', 'sub2api-launcher.log')

    return {
      config: desiredConfig,
      dependencyRoot,
      bundledBinaryPath,
      resolvedBinaryPath,
      usingBundledBinary,
      resolvedDataDir,
      resolvedConfigPath,
      configExists: existsSync(resolvedConfigPath),
      logFilePath,
      baseUrl,
      adminUrl: baseUrl,
      healthEndpoint: `${baseUrl}/health`,
      binaryExists: existsSync(resolvedBinaryPath)
    } satisfies ResolvedRuntimeContext
  }

  let state: Sub2ApiRuntimeState = (() => {
    const context = resolveRuntimeContext()
    return {
      status: context.binaryExists ? 'stopped' : 'missing-binary',
      mode: 'desktop',
      host: context.config.host,
      port: context.config.port,
      baseUrl: context.baseUrl,
      adminUrl: context.adminUrl,
      pid: null,
      startedAt: 0,
      healthy: false,
      healthEndpoint: context.healthEndpoint,
      healthMessage: context.binaryExists ? '本地网关尚未启动' : buildMissingBinaryMessage(context),
      resolvedBinaryPath: context.resolvedBinaryPath,
      binaryExists: context.binaryExists,
      usingBundledBinary: context.usingBundledBinary,
      resolvedDataDir: context.resolvedDataDir,
      resolvedConfigPath: context.resolvedConfigPath,
      configExists: context.configExists,
      logFilePath: context.logFilePath,
      dependencyRoot: context.dependencyRoot,
      bundledBinaryPath: context.bundledBinaryPath,
      lastError: context.binaryExists ? '' : buildMissingBinaryMessage(context),
      lastExitCode: null,
      managedAdminEmail: '',
      managedApiKeyName: '',
      managedApiKeyDetected: false,
      logs: [] as string[]
    } satisfies Sub2ApiRuntimeState
  })()

  function emitState(patch: Partial<Sub2ApiRuntimeState> = {}, context = resolveRuntimeContext(undefined, false)) {
    state = {
      ...state,
      host: context.config.host,
      port: context.config.port,
      baseUrl: context.baseUrl,
      adminUrl: context.adminUrl,
      healthEndpoint: context.healthEndpoint,
      resolvedBinaryPath: context.resolvedBinaryPath,
      binaryExists: context.binaryExists,
      usingBundledBinary: context.usingBundledBinary,
      resolvedDataDir: context.resolvedDataDir,
      resolvedConfigPath: context.resolvedConfigPath,
      configExists: context.configExists,
      logFilePath: context.logFilePath,
      dependencyRoot: context.dependencyRoot,
      bundledBinaryPath: context.bundledBinaryPath,
      ...patch,
      logs: Array.isArray(patch.logs) ? clipLogs(patch.logs) : state.logs
    }
    options.onStateChange?.(state)
    return state
  }

  function writeLauncherLog(source: string, message: string, context = resolveRuntimeContext(undefined, false)) {
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }

    ensureDirectoryExists(dirname(context.logFilePath))
    const lines = trimmed
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${source}: ${line}`)

    if (lines.length === 0) {
      return
    }

    appendFileSync(context.logFilePath, `${lines.join('\n')}\n`, 'utf-8')
    emitState({ logs: [...state.logs, ...lines] }, context)
  }

  function stopHealthPolling() {
    if (healthTimer) {
      clearInterval(healthTimer)
      healthTimer = null
    }
  }

  async function requestHealth(endpoint: string) {
    return new Promise<{ healthy: boolean; message: string }>(resolve => {
      const req = httpRequest(endpoint, {
        method: 'GET',
        timeout: HEALTH_REQUEST_TIMEOUT
      }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
            resolve({
              healthy: true,
              message: body.trim().slice(0, 180) || '本地网关健康检查通过'
            })
            return
          }

          resolve({
            healthy: false,
            message: `/health 返回 ${(res.statusCode || 500).toString()}`
          })
        })
      })

      req.on('timeout', () => {
        req.destroy(new Error('健康检查超时'))
      })
      req.on('error', error => {
        resolve({
          healthy: false,
          message: error instanceof Error ? error.message : '健康检查失败'
        })
      })
      req.end()
    })
  }

  async function refreshHealthState() {
    if (!runtimeProcess) {
      return state
    }

    const context = resolveRuntimeContext(undefined, false)
    const result = await requestHealth(context.healthEndpoint)
    if (!runtimeProcess) {
      return state
    }

    if (result.healthy) {
      return emitState({
        status: 'running',
        healthy: true,
        healthMessage: result.message || '本地网关健康检查通过'
      }, context)
    }

    return emitState({
      status: state.status === 'starting' ? 'starting' : 'running',
      healthy: false,
      healthMessage: result.message || buildLaunchPendingMessage(context)
    }, context)
  }

  async function inspectSetup(partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupDiagnostics> {
    const currentState = await getRuntimeState(partial)
    const context = resolveRuntimeContext(undefined, false)
    const installLockPath = join(context.resolvedDataDir, '.installed')
    const statusResult = await requestSetupJson<SetupStatusPayload>(buildSetupStatusEndpoint(context), 'GET')

    const items: Sub2ApiSetupDiagnostics['items'] = [
      currentState.binaryExists
        ? { id: 'binary', label: 'Sub2API 二进制', level: 'success', message: `已找到可执行文件：${currentState.resolvedBinaryPath}` }
        : { id: 'binary', label: 'Sub2API 二进制', level: 'error', message: buildMissingBinaryMessage(context) },
      currentState.status === 'running'
        ? { id: 'runtime', label: '本地网关进程', level: currentState.healthy ? 'success' : 'warning', message: currentState.healthMessage || '本地网关已启动，但健康检查还未完全通过。' }
        : { id: 'runtime', label: '本地网关进程', level: currentState.status === 'error' ? 'error' : 'warning', message: currentState.healthMessage || '本地网关尚未启动。' },
      currentState.configExists
        ? { id: 'config', label: 'config.yaml', level: 'success', message: `已检测到配置文件：${currentState.resolvedConfigPath}` }
        : { id: 'config', label: 'config.yaml', level: 'info', message: '当前还没有 config.yaml；首次安装完成后会自动生成。' },
      existsSync(installLockPath)
        ? { id: 'install-lock', label: '.installed 锁文件', level: 'success', message: `已检测到安装锁：${installLockPath}` }
        : { id: 'install-lock', label: '.installed 锁文件', level: 'info', message: '当前还没有安装锁文件；若是首次部署，这属于正常状态。' },
      statusResult.ok
        ? statusResult.data?.needs_setup
          ? { id: 'setup-status', label: '初始化状态', level: 'warning', message: '服务端确认当前实例还没有完成初始化，可以直接在本页执行安装。' }
          : { id: 'setup-status', label: '初始化状态', level: 'success', message: '服务端确认当前实例已经完成初始化。' }
        : { id: 'setup-status', label: '初始化状态', level: currentState.status === 'running' ? 'warning' : 'info', message: `未能读取 /setup/status：${statusResult.message}` }
    ]

    return {
      checkedAt: Date.now(),
      status: {
        reachable: statusResult.ok,
        needsSetup: statusResult.ok ? Boolean(statusResult.data?.needs_setup) : null,
        step: statusResult.ok && typeof statusResult.data?.step === 'string' && statusResult.data.step.trim() ? statusResult.data.step.trim() : 'unknown',
        endpoint: buildSetupStatusEndpoint(context),
        statusCode: statusResult.statusCode || null,
        message: statusResult.ok
          ? statusResult.data?.needs_setup
            ? 'setup 向导已就绪，当前实例仍需初始化。'
            : 'setup 状态已返回：当前实例已完成初始化。'
          : `无法读取 setup 状态：${statusResult.message}`
      },
      items
    }
  }

  async function testSetupDatabase(payload: Partial<Sub2ApiSetupDatabaseConfig> | null | undefined, partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    const normalizedDatabase = normalizeSetupDatabaseConfig(payload)
    const result = await requestSetupJson<{ message?: string }>(buildSetupDatabaseEndpoint(context), 'POST', normalizedDatabase)
    return {
      success: result.ok,
      code: result.statusCode,
      message: result.ok ? 'PostgreSQL 连接测试通过' : 'PostgreSQL 连接测试失败',
      details: result.ok
        ? normalizeSetupActionDetails(result.data?.message?.trim() || result.message, 'Connection successful')
        : formatSetupDependencyFailure('PostgreSQL', buildSetupDatabaseTarget(normalizedDatabase), result.rawText || result.message),
      data: result.data
    }
  }

  async function testSetupRedis(payload: Partial<Sub2ApiSetupRedisConfig> | null | undefined, partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    const normalizedRedis = normalizeSetupRedisConfig(payload)
    const result = await requestSetupJson<{ message?: string }>(buildSetupRedisEndpoint(context), 'POST', {
      host: normalizedRedis.host,
      port: normalizedRedis.port,
      password: normalizedRedis.password,
      db: normalizedRedis.db,
      enable_tls: normalizedRedis.enableTls
    })
    return {
      success: result.ok,
      code: result.statusCode,
      message: result.ok ? 'Redis 连接测试通过' : 'Redis 连接测试失败',
      details: result.ok
        ? normalizeSetupActionDetails(result.data?.message?.trim() || result.message, 'Connection successful')
        : formatSetupDependencyFailure('Redis', buildSetupRedisTarget(normalizedRedis), result.rawText || result.message),
      data: result.data
    }
  }

  async function installSetup(payload: Partial<Sub2ApiDesktopSetupProfile> | null | undefined, partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    const profile = normalizeSetupProfile(payload)
    const result = await requestSetupJson<{ message?: string; restart?: boolean }>(buildSetupInstallEndpoint(context), 'POST', {
      database: profile.database,
      redis: {
        host: profile.redis.host,
        port: profile.redis.port,
        password: profile.redis.password,
        db: profile.redis.db,
        enable_tls: profile.redis.enableTls
      },
      admin: profile.admin,
      server: {
        host: context.config.host,
        port: context.config.port,
        mode: context.config.logLevel === 'debug' ? 'debug' : 'release'
      }
    }, SETUP_INSTALL_TIMEOUT)

    if (result.ok && await waitForFile(context.resolvedConfigPath, 5000)) {
      patchConfigTimezone(context.resolvedConfigPath, profile.timezone)
    }

    let restartWarning = ''
    if (result.ok) {
      try {
        await restartRuntime(partial)
      } catch (error) {
        restartWarning = error instanceof Error ? error.message : '本地网关重启失败'
      }
    }

    if (result.ok) {
      writeLauncherLog('setup', restartWarning
        ? `Sub2API 初始化已完成，但本地网关重启失败：${restartWarning}`
        : result.data?.message?.trim() || 'Sub2API 初始化已完成，桌面运行时已自动重启。', context)
    }

    return {
      success: result.ok,
      code: result.statusCode,
      message: result.ok ? 'Sub2API 初始化完成' : 'Sub2API 初始化失败',
      details: result.ok
        ? restartWarning
          ? `安装已完成，但本地网关自动重启失败：${restartWarning}`
          : result.data?.message?.trim() || 'Installation completed successfully. Desktop runtime restarted.'
        : formatSetupInstallFailure(profile, result.rawText || result.message),
      data: result.data
    }
  }

  function startHealthPolling() {
    stopHealthPolling()
    healthTimer = setInterval(() => {
      void refreshHealthState()
    }, HEALTH_POLL_INTERVAL)
  }

  async function waitForInitialHealth() {
    for (let index = 0; index < 8; index += 1) {
      if (!runtimeProcess) {
        return false
      }

      const nextState = await refreshHealthState()
      if (nextState.healthy) {
        return true
      }

      await wait(700)
    }

    if (!runtimeProcess) {
      return false
    }

    const context = resolveRuntimeContext(undefined, false)
    emitState({
      status: 'running',
      healthy: false,
      healthMessage: buildLaunchPendingMessage(context)
    }, context)
    return false
  }

  function prepareLaunchContext(context: ResolvedRuntimeContext) {
    ensureDirectoryExists(context.resolvedDataDir)
    ensureDirectoryExists(dirname(context.logFilePath))

    if (desiredConfig.configPath && existsSync(desiredConfig.configPath)) {
      const configName = basename(desiredConfig.configPath).toLowerCase()
      if (configName !== 'config.yaml' && configName !== 'config.yml') {
        copyFileSync(desiredConfig.configPath, context.resolvedConfigPath)
      }
    }

    return resolveRuntimeContext(undefined, false)
  }

  function attachRuntimeListeners(child: ReturnType<typeof spawn>) {
    child.stdout?.on('data', chunk => {
      writeLauncherLog('stdout', chunk.toString())
    })

    child.stderr?.on('data', chunk => {
      writeLauncherLog('stderr', chunk.toString())
    })

    child.on('error', error => {
      stopHealthPolling()
      runtimeProcess = null
      const context = resolveRuntimeContext(undefined, false)
      const message = error instanceof Error ? error.message : '本地网关启动失败'
      writeLauncherLog('launcher', message, context)
      emitState({
        status: context.binaryExists ? 'error' : 'missing-binary',
        pid: null,
        healthy: false,
        lastError: message,
        healthMessage: message
      }, context)
    })

    child.on('exit', (code, signal) => {
      stopHealthPolling()
      runtimeProcess = null
      const context = resolveRuntimeContext(undefined, false)
      const wasStopping = state.status === 'stopping'
      const hasBinary = context.binaryExists
      const nextStatus = !hasBinary
        ? 'missing-binary'
        : wasStopping || code === 0
          ? 'stopped'
          : 'error'
      const exitMessage = wasStopping
        ? '本地网关已停止'
        : signal
          ? `本地网关已退出 (${signal})`
          : `本地网关已退出 (${code ?? 'unknown'})`

      writeLauncherLog('launcher', exitMessage, context)
      emitState({
        status: nextStatus,
        pid: null,
        healthy: false,
        healthMessage: nextStatus === 'missing-binary' ? buildMissingBinaryMessage(context) : exitMessage,
        lastError: nextStatus === 'error' ? exitMessage : nextStatus === 'missing-binary' ? buildMissingBinaryMessage(context) : '',
        lastExitCode: typeof code === 'number' ? code : null
      }, context)
    })
  }

  async function getRuntimeState(partial?: Partial<Sub2ApiDesktopRuntimeConfig>) {
    const context = resolveRuntimeContext(partial, !runtimeProcess)
    if (!runtimeProcess) {
      const nextStatus = context.binaryExists
        ? state.status === 'error' && state.lastError
          ? 'error'
          : 'stopped'
        : 'missing-binary'
      const nextErrorMessage = !context.binaryExists
        ? buildMissingBinaryMessage(context)
        : nextStatus === 'error' && state.lastError
          ? state.lastError
          : ''
      return emitState({
        status: nextStatus,
        mode: 'desktop',
        pid: null,
        healthy: false,
        healthMessage: nextErrorMessage || '本地网关尚未启动',
        lastError: nextErrorMessage
      }, context)
    }

    return emitState({}, context)
  }

  async function startRuntime(partial?: Partial<Sub2ApiDesktopRuntimeConfig>) {
    if (runtimeProcess) {
      return getRuntimeState()
    }

    const preparedContext = prepareLaunchContext(resolveRuntimeContext(partial))
    if (!preparedContext.binaryExists) {
      return emitState({
        status: 'missing-binary',
        healthy: false,
        healthMessage: buildMissingBinaryMessage(preparedContext),
        lastError: buildMissingBinaryMessage(preparedContext)
      }, preparedContext)
    }

    const useShell = /\.(cmd|bat)$/i.test(preparedContext.resolvedBinaryPath)
    const env = {
      ...process.env,
      DATA_DIR: preparedContext.resolvedDataDir,
      SERVER_HOST: preparedContext.config.host,
      SERVER_PORT: String(preparedContext.config.port),
      RUN_MODE: preparedContext.config.runMode,
      LOG_LEVEL: preparedContext.config.logLevel,
      GIN_MODE: 'release'
    }

    emitState({
      status: 'starting',
      pid: null,
      startedAt: Date.now(),
      healthy: false,
      healthMessage: '正在启动本地 Sub2API 网关...',
      lastError: ''
    }, preparedContext)

    writeLauncherLog('launcher', `启动命令：${preparedContext.resolvedBinaryPath}`, preparedContext)
    runtimeProcess = spawn(preparedContext.resolvedBinaryPath, [], {
      cwd: preparedContext.resolvedDataDir,
      env,
      shell: useShell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    attachRuntimeListeners(runtimeProcess)
    emitState({ pid: runtimeProcess.pid ?? null }, preparedContext)
    startHealthPolling()
    await waitForInitialHealth()
    return emitState({}, preparedContext)
  }

  async function stopRuntime() {
    if (!runtimeProcess) {
      return getRuntimeState()
    }

    if (stopPromise) {
      return stopPromise
    }

    const child = runtimeProcess
    const context = resolveRuntimeContext(undefined, false)
    emitState({
      status: 'stopping',
      healthy: false,
      healthMessage: '正在停止本地 Sub2API 网关...'
    }, context)
    stopHealthPolling()

    stopPromise = new Promise(resolve => {
      const timeoutHandle = setTimeout(() => {
        if (runtimeProcess === child && !child.killed) {
          try {
            child.kill('SIGKILL')
          } catch {
            stopPromise = null
            resolve(emitState({
              status: context.binaryExists ? 'stopped' : 'missing-binary',
              pid: null,
              healthMessage: context.binaryExists ? '本地网关已停止' : buildMissingBinaryMessage(context)
            }, context))
          }
        }
      }, STOP_TIMEOUT)

      child.once('exit', () => {
        clearTimeout(timeoutHandle)
        stopPromise = null
        resolve(getRuntimeState())
      })

      try {
        child.kill('SIGTERM')
      } catch {
        clearTimeout(timeoutHandle)
        runtimeProcess = null
        stopPromise = null
        resolve(getRuntimeState())
      }
    })

    return stopPromise
  }

  async function restartRuntime(partial?: Partial<Sub2ApiDesktopRuntimeConfig>) {
    await stopRuntime()
    return startRuntime(partial)
  }

  async function shutdown() {
    try {
      await stopRuntime()
    } catch {
      return undefined
    }
    return undefined
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
    shutdown
  }
}