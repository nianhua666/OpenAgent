import { spawn, spawnSync } from 'child_process'
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
  sourceDir: string
  sourceRepoUrl: string
  sourceDetected: boolean
  sourceBackendExists: boolean
  sourceFrontendExists: boolean
  sourceBinaryPath: string
  sourceBinaryExists: boolean
  preferSourceBuild: boolean
  gitAvailable: boolean
  goAvailable: boolean
  pnpmAvailable: boolean
  dockerAvailable: boolean
  dockerComposeAvailable: boolean
  dependencyMode: Sub2ApiRuntimeState['dependencyMode']
  dependencyStatus: Sub2ApiRuntimeState['dependencyStatus']
  dependencyMessage: string
  dependencyComposePath: string
  dependencyProjectName: string
  dependencyPostgresReady: boolean
  dependencyRedisReady: boolean
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
const SUB2API_SOURCE_REPO_URL = 'https://github.com/Wei-Shaw/sub2api.git'
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

type Sub2ApiToolchainState = {
  gitAvailable: boolean
  goAvailable: boolean
  pnpmAvailable: boolean
}

type Sub2ApiDockerState = {
  dockerAvailable: boolean
  dockerComposeAvailable: boolean
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

function detectToolchain(): Sub2ApiToolchainState {
  const gitAvailable = spawnSync('git', ['--version'], { windowsHide: true, encoding: 'utf-8' }).status === 0
  const goAvailable = spawnSync('go', ['version'], { windowsHide: true, encoding: 'utf-8' }).status === 0
  const pnpmAvailable = spawnSync('corepack', ['pnpm', '-v'], { windowsHide: true, encoding: 'utf-8' }).status === 0

  return {
    gitAvailable,
    goAvailable,
    pnpmAvailable
  }
}

function detectDockerToolchain(): Sub2ApiDockerState {
  const dockerAvailable = spawnSync('docker', ['--version'], { windowsHide: true, encoding: 'utf-8' }).status === 0
  const dockerComposeAvailable = dockerAvailable && spawnSync('docker', ['compose', 'version'], { windowsHide: true, encoding: 'utf-8' }).status === 0

  return {
    dockerAvailable,
    dockerComposeAvailable
  }
}

function resolveDefaultSourceDir(getDataDir: () => string) {
  const documentsDir = normalizePath(app.getPath('documents'))
  if (process.platform === 'win32' && /^[D-Z]:\\/i.test(documentsDir)) {
    return join(documentsDir, 'OpenAgent-data', SUB2API_RUNTIME_DIR_NAME, 'source', 'sub2api')
  }

  return join(getDataDir(), SUB2API_RUNTIME_DIR_NAME, 'source', 'sub2api')
}

function resolveSourceBinaryPath(sourceDir: string) {
  const candidates = [
    join(sourceDir, 'backend', SUB2API_BINARY_NAME),
    join(sourceDir, SUB2API_BINARY_NAME),
    join(sourceDir, 'build', SUB2API_BINARY_NAME),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

function resolveDockerComposeDir(runtimeConfig: Sub2ApiDesktopRuntimeConfig, resolvedDataDir: string) {
  return normalizePath(runtimeConfig.dockerComposeDir) || join(resolvedDataDir, 'dependencies', 'docker')
}

function resolveDockerProjectName(runtimeConfig: Sub2ApiDesktopRuntimeConfig) {
  return runtimeConfig.dockerProjectName?.trim() || 'openagent-sub2api'
}

function normalizeComposePath(targetPath: string) {
  return targetPath.replace(/\\/g, '/')
}

function normalizeRuntimeConfig(saved?: Partial<Sub2ApiDesktopRuntimeConfig> | null): Sub2ApiDesktopRuntimeConfig {
  return {
    autoStart: Boolean(saved?.autoStart),
    host: normalizeHost(saved?.host),
    port: normalizePort(saved?.port),
    runMode: saved?.runMode === 'standard' ? 'standard' : 'simple',
    dependencyMode: saved?.dependencyMode === 'external' ? 'external' : 'docker',
    dockerProjectName: typeof saved?.dockerProjectName === 'string' && saved.dockerProjectName.trim() ? saved.dockerProjectName.trim() : 'openagent-sub2api',
    dockerComposeDir: normalizePath(saved?.dockerComposeDir),
    binaryPath: normalizePath(saved?.binaryPath),
    sourceDir: normalizePath(saved?.sourceDir),
    sourceRepoUrl: typeof saved?.sourceRepoUrl === 'string' && saved.sourceRepoUrl.trim() ? saved.sourceRepoUrl.trim() : SUB2API_SOURCE_REPO_URL,
    preferSourceBuild: typeof saved?.preferSourceBuild === 'boolean' ? saved.preferSourceBuild : true,
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
  if (context.preferSourceBuild && context.sourceDetected && !context.sourceBinaryExists) {
    const missingTools: string[] = []
    if (!context.goAvailable) {
      missingTools.push('Go')
    }
    if (!context.pnpmAvailable) {
      missingTools.push('pnpm')
    }

    const toolchainHint = missingTools.length > 0
      ? `当前缺少 ${missingTools.join(' / ')}，源码暂时无法构建。`
      : '源码工作树已找到，但还没有生成后端二进制。'

    return `当前已切到源码优先模式，但未找到可运行的源码构建产物。源码目录：${context.sourceDir}；预期二进制：${context.sourceBinaryPath}。${toolchainHint}`
  }

  return `未找到 Sub2API 可执行文件。当前解析路径为 ${context.resolvedBinaryPath}；请优先配置源码目录并构建产物，或在界面中手动指定 binaryPath。内置二进制期望路径为 ${context.bundledBinaryPath}。`
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

async function runCommand(command: string, args: string[], cwd: string, timeout = 15 * 60 * 1000) {
  return await new Promise<{ success: boolean; code: number; output: string }>(resolve => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        CI: '1'
      }
    })

    let output = ''
    const append = (chunk: string) => {
      output += chunk
      if (output.length > 24_000) {
        output = output.slice(-24_000)
      }
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      resolve({
        success: false,
        code: 124,
        output: `${output}\n命令执行超时：${command} ${args.join(' ')}`
      })
    }, timeout)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => append(String(chunk)))
    child.stderr?.on('data', chunk => append(String(chunk)))
    child.on('error', error => {
      clearTimeout(timer)
      resolve({
        success: false,
        code: 1,
        output: `${output}\n${error instanceof Error ? error.message : String(error)}`
      })
    })
    child.on('exit', code => {
      clearTimeout(timer)
      resolve({
        success: code === 0,
        code: typeof code === 'number' ? code : 1,
        output: output.trim()
      })
    })
  })
}

function buildDockerComposeFile(runtimeConfig: Sub2ApiDesktopRuntimeConfig, setupProfile: Sub2ApiDesktopSetupProfile, composeDir: string) {
  const postgresDataDir = normalizeComposePath(join(composeDir, 'postgres-data'))
  const redisDataDir = normalizeComposePath(join(composeDir, 'redis-data'))

  return [
    'services:',
    '  postgres:',
    '    image: postgres:16-alpine',
    '    restart: unless-stopped',
    '    environment:',
    `      POSTGRES_DB: "${setupProfile.database.dbname}"`,
    `      POSTGRES_USER: "${setupProfile.database.user}"`,
    `      POSTGRES_PASSWORD: "${setupProfile.database.password}"`,
    '    ports:',
    `      - "127.0.0.1:${setupProfile.database.port}:5432"`,
    '    volumes:',
    `      - "${postgresDataDir}:/var/lib/postgresql/data"`,
    '    healthcheck:',
    `      test: ["CMD-SHELL", "pg_isready -U ${setupProfile.database.user} -d ${setupProfile.database.dbname}"]`,
    '      interval: 5s',
    '      timeout: 3s',
    '      retries: 30',
    '',
    '  redis:',
    '    image: redis:7-alpine',
    '    restart: unless-stopped',
    '    command:',
    `      - redis-server`,
    '      - --appendonly',
    '      - yes',
    '      - --requirepass',
    `      - "${setupProfile.redis.password}"`,
    '    ports:',
    `      - "127.0.0.1:${setupProfile.redis.port}:6379"`,
    '    volumes:',
    `      - "${redisDataDir}:/data"`,
    '    healthcheck:',
    `      test: ["CMD-SHELL", "redis-cli -a ${setupProfile.redis.password} ping | grep PONG"]`,
    '      interval: 5s',
    '      timeout: 3s',
    '      retries: 30',
    ''
  ].join('\n')
}

async function inspectDockerDependencies(context: ResolvedRuntimeContext): Promise<{
  status: Sub2ApiRuntimeState['dependencyStatus']
  message: string
  postgresReady: boolean
  redisReady: boolean
}> {
  if (context.dependencyMode !== 'docker') {
    return {
      status: 'unknown' as const,
      message: '当前使用外部 PostgreSQL / Redis',
      postgresReady: false,
      redisReady: false
    }
  }

  if (!context.dockerAvailable || !context.dockerComposeAvailable) {
    return {
      status: 'unavailable' as const,
      message: '当前系统未检测到 Docker / Docker Compose，无法启动容器化 PostgreSQL / Redis',
      postgresReady: false,
      redisReady: false
    }
  }

  const composePath = context.dependencyComposePath
  if (!existsSync(composePath)) {
    return {
      status: 'stopped' as const,
      message: '尚未生成容器依赖编排文件',
      postgresReady: false,
      redisReady: false
    }
  }

  const result = await runCommand(
    'docker',
    ['compose', '-p', context.dependencyProjectName, '-f', composePath, 'ps', '--services', '--status', 'running'],
    dirname(composePath),
    60_000
  )

  if (!result.success) {
    return {
      status: 'stopped' as const,
      message: result.output || '当前容器依赖尚未启动',
      postgresReady: false,
      redisReady: false
    }
  }

  const lines = result.output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const postgresReady = lines.includes('postgres')
  const redisReady = lines.includes('redis')
  const status: Sub2ApiRuntimeState['dependencyStatus'] = postgresReady && redisReady ? 'ready' : (postgresReady || redisReady ? 'partial' : 'stopped')

  return {
    status,
    message: postgresReady && redisReady
      ? '容器化 PostgreSQL / Redis 已就绪'
      : postgresReady || redisReady
        ? '容器依赖部分启动，仍有服务未就绪'
        : '容器依赖尚未启动',
    postgresReady,
    redisReady
  }
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

    const sourceDir = desiredConfig.sourceDir || resolveDefaultSourceDir(options.getDataDir)
    const sourceRepoUrl = desiredConfig.sourceRepoUrl || SUB2API_SOURCE_REPO_URL
    const sourceBackendExists = existsSync(join(sourceDir, 'backend', 'go.mod'))
    const sourceFrontendExists = existsSync(join(sourceDir, 'frontend', 'package.json'))
    const sourceDetected = sourceBackendExists && sourceFrontendExists
    const sourceBinaryPath = resolveSourceBinaryPath(sourceDir)
    const sourceBinaryExists = existsSync(sourceBinaryPath)
    const toolchain = detectToolchain()
    const dockerToolchain = detectDockerToolchain()
    const bundledBinaryPath = join(dependencyRoot, 'bin', SUB2API_BINARY_NAME)
    const resolvedBinaryPath = desiredConfig.binaryPath
      || (desiredConfig.preferSourceBuild && sourceDetected ? sourceBinaryPath : '')
      || bundledBinaryPath
    const usingBundledBinary = !desiredConfig.binaryPath && (!desiredConfig.preferSourceBuild || !sourceDetected || resolvedBinaryPath === bundledBinaryPath)

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
      sourceDir,
      sourceRepoUrl,
      sourceDetected,
      sourceBackendExists,
      sourceFrontendExists,
      sourceBinaryPath,
      sourceBinaryExists,
      preferSourceBuild: desiredConfig.preferSourceBuild,
      gitAvailable: toolchain.gitAvailable,
      goAvailable: toolchain.goAvailable,
      pnpmAvailable: toolchain.pnpmAvailable,
      dockerAvailable: dockerToolchain.dockerAvailable,
      dockerComposeAvailable: dockerToolchain.dockerComposeAvailable,
      dependencyMode: desiredConfig.dependencyMode,
      dependencyStatus: 'unknown' as const,
      dependencyMessage: desiredConfig.dependencyMode === 'docker' ? '尚未检查容器化依赖' : '当前使用外部 PostgreSQL / Redis',
      dependencyComposePath: join(resolveDockerComposeDir(desiredConfig, resolvedDataDir), 'docker-compose.yml'),
      dependencyProjectName: resolveDockerProjectName(desiredConfig),
      dependencyPostgresReady: false,
      dependencyRedisReady: false,
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
      sourceDir: context.sourceDir,
      sourceRepoUrl: context.sourceRepoUrl,
      sourceDetected: context.sourceDetected,
      sourceBackendExists: context.sourceBackendExists,
      sourceFrontendExists: context.sourceFrontendExists,
      sourceBinaryPath: context.sourceBinaryPath,
      sourceBinaryExists: context.sourceBinaryExists,
      preferSourceBuild: context.preferSourceBuild,
      gitAvailable: context.gitAvailable,
      goAvailable: context.goAvailable,
      pnpmAvailable: context.pnpmAvailable,
      dockerAvailable: context.dockerAvailable,
      dockerComposeAvailable: context.dockerComposeAvailable,
      dependencyMode: context.dependencyMode,
      dependencyStatus: context.dependencyStatus,
      dependencyMessage: context.dependencyMessage,
      dependencyComposePath: context.dependencyComposePath,
      dependencyProjectName: context.dependencyProjectName,
      dependencyPostgresReady: context.dependencyPostgresReady,
      dependencyRedisReady: context.dependencyRedisReady,
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
      sourceDir: context.sourceDir,
      sourceRepoUrl: context.sourceRepoUrl,
      sourceDetected: context.sourceDetected,
      sourceBackendExists: context.sourceBackendExists,
      sourceFrontendExists: context.sourceFrontendExists,
      sourceBinaryPath: context.sourceBinaryPath,
      sourceBinaryExists: context.sourceBinaryExists,
      preferSourceBuild: context.preferSourceBuild,
      gitAvailable: context.gitAvailable,
      goAvailable: context.goAvailable,
      pnpmAvailable: context.pnpmAvailable,
      dockerAvailable: context.dockerAvailable,
      dockerComposeAvailable: context.dockerComposeAvailable,
      dependencyMode: context.dependencyMode,
      dependencyStatus: context.dependencyStatus,
      dependencyMessage: context.dependencyMessage,
      dependencyComposePath: context.dependencyComposePath,
      dependencyProjectName: context.dependencyProjectName,
      dependencyPostgresReady: context.dependencyPostgresReady,
      dependencyRedisReady: context.dependencyRedisReady,
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
    return new Promise<{ healthy: boolean; message: string; statusCode: number | null }>(resolve => {
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
              statusCode: res.statusCode || 200,
              message: body.trim().slice(0, 180) || '本地网关健康检查通过'
            })
            return
          }

          resolve({
            healthy: false,
            statusCode: res.statusCode || 500,
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
          statusCode: null,
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

    if (!result.healthy) {
      const setupStatus = await requestSetupJson<SetupStatusPayload>(buildSetupStatusEndpoint(context), 'GET')
      if (setupStatus.ok) {
        const setupMessage = setupStatus.data?.needs_setup
          ? '本地网关已响应，等待完成初始化'
          : '本地网关已响应，后台接口可达'

        return emitState({
          status: 'running',
          healthy: false,
          healthMessage: setupMessage
        }, context)
      }
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

  async function startDependencies(
    profilePayload?: Partial<Sub2ApiDesktopSetupProfile> | null | undefined,
    partial?: Partial<Sub2ApiDesktopRuntimeConfig>
  ): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    if (context.dependencyMode !== 'docker') {
      return {
        success: true,
        code: 0,
        message: '当前依赖模式不是 Docker，跳过容器依赖启动',
        details: '当前使用外部 PostgreSQL / Redis'
      }
    }

    if (!context.dockerAvailable || !context.dockerComposeAvailable) {
      return {
        success: false,
        code: 1,
        message: '当前系统未检测到 Docker / Docker Compose',
        details: '请先安装并启动 Docker Desktop，再使用容器化 PostgreSQL / Redis。'
      }
    }

    const profile = normalizeSetupProfile(profilePayload)
    const composePath = context.dependencyComposePath
    const composeDir = dirname(composePath)
    ensureDirectoryExists(composeDir)
    ensureDirectoryExists(join(composeDir, 'postgres-data'))
    ensureDirectoryExists(join(composeDir, 'redis-data'))
    writeFileSync(composePath, buildDockerComposeFile(context.config, profile, composeDir), 'utf-8')

    const upResult = await runCommand(
      'docker',
      ['compose', '-p', context.dependencyProjectName, '-f', composePath, 'up', '-d'],
      composeDir,
      10 * 60 * 1000
    )

    if (!upResult.success) {
      return {
        success: false,
        code: upResult.code,
        message: '容器化 PostgreSQL / Redis 启动失败',
        details: upResult.output || `docker compose -p ${context.dependencyProjectName} up -d`
      }
    }

    const dependencyState = await inspectDockerDependencies(resolveRuntimeContext(partial, false))
    return {
      success: dependencyState.status === 'ready',
      code: dependencyState.status === 'ready' ? 0 : 1,
      message: dependencyState.status === 'ready' ? '容器化 PostgreSQL / Redis 已启动' : '容器依赖已启动，但仍在等待健康检查',
      details: dependencyState.message
    }
  }

  async function stopDependencies(partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    if (context.dependencyMode !== 'docker') {
      return {
        success: true,
        code: 0,
        message: '当前依赖模式不是 Docker，跳过容器依赖停止',
        details: '当前使用外部 PostgreSQL / Redis'
      }
    }

    if (!context.dockerAvailable || !context.dockerComposeAvailable) {
      return {
        success: false,
        code: 1,
        message: '当前系统未检测到 Docker / Docker Compose',
        details: '请先安装并启动 Docker Desktop。'
      }
    }

    const composePath = context.dependencyComposePath
    if (!existsSync(composePath)) {
      return {
        success: true,
        code: 0,
        message: '当前没有需要停止的容器依赖',
        details: '尚未生成 docker-compose.yml'
      }
    }

    const downResult = await runCommand(
      'docker',
      ['compose', '-p', context.dependencyProjectName, '-f', composePath, 'down'],
      dirname(composePath),
      10 * 60 * 1000
    )

    if (!downResult.success) {
      return {
        success: false,
        code: downResult.code,
        message: '停止容器依赖失败',
        details: downResult.output || `docker compose -p ${context.dependencyProjectName} down`
      }
    }

    return {
      success: true,
      code: 0,
      message: '容器化 PostgreSQL / Redis 已停止',
      details: downResult.output || 'docker compose down 已执行'
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
    const dependencyState = await inspectDockerDependencies(context)
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
        lastError: nextErrorMessage,
        dependencyStatus: dependencyState.status,
        dependencyMessage: dependencyState.message,
        dependencyPostgresReady: dependencyState.postgresReady,
        dependencyRedisReady: dependencyState.redisReady
      }, context)
    }

    return emitState({
      dependencyStatus: dependencyState.status,
      dependencyMessage: dependencyState.message,
      dependencyPostgresReady: dependencyState.postgresReady,
      dependencyRedisReady: dependencyState.redisReady
    }, context)
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

  async function syncSource(partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    if (!context.gitAvailable) {
      return {
        success: false,
        code: 1,
        message: '当前系统缺少 Git，无法拉取或更新 Sub2API 源码',
        details: '请先安装 Git，或手动把源码仓库放到已配置的源码目录中。'
      }
    }

    const sourceDir = context.sourceDir
    const sourceParentDir = dirname(sourceDir)
    ensureDirectoryExists(sourceParentDir)

    const hasGitRepo = existsSync(join(sourceDir, '.git'))
    if (!existsSync(sourceDir) || !hasGitRepo) {
      const cloneResult = await runCommand('git', ['clone', '--depth', '1', context.sourceRepoUrl, sourceDir], sourceParentDir, 10 * 60 * 1000)
      if (!cloneResult.success) {
        return {
          success: false,
          code: cloneResult.code,
          message: '拉取 Sub2API 源码失败',
          details: cloneResult.output || `git clone ${context.sourceRepoUrl} ${sourceDir}`
        }
      }
    } else {
      const resetResult = await runCommand('git', ['-C', sourceDir, 'reset', '--hard', 'HEAD'], sourceDir, 2 * 60 * 1000)
      if (!resetResult.success) {
        return {
          success: false,
          code: resetResult.code,
          message: '重置本地 Sub2API 源码失败',
          details: resetResult.output || 'git reset --hard HEAD'
        }
      }
      const pullResult = await runCommand('git', ['-C', sourceDir, 'pull', '--ff-only'], sourceDir, 5 * 60 * 1000)
      if (!pullResult.success) {
        return {
          success: false,
          code: pullResult.code,
          message: '更新 Sub2API 源码失败',
          details: pullResult.output || 'git pull --ff-only'
        }
      }
    }

    emitState({}, resolveRuntimeContext({
      ...context.config,
      sourceDir,
      sourceRepoUrl: context.sourceRepoUrl
    }))
    return {
      success: true,
      code: 0,
      message: 'Sub2API 源码已同步',
      details: `源码目录：${sourceDir}`
    }
  }

  async function buildSource(partial?: Partial<Sub2ApiDesktopRuntimeConfig>): Promise<Sub2ApiSetupActionResult> {
    const context = resolveRuntimeContext(partial)
    if (!context.sourceDetected) {
      return {
        success: false,
        code: 1,
        message: '当前还没有可用的 Sub2API 源码工作树',
        details: `请先同步源码到 ${context.sourceDir}`
      }
    }

    if (!context.pnpmAvailable || !context.goAvailable) {
      const missing = [
        !context.pnpmAvailable ? 'pnpm' : '',
        !context.goAvailable ? 'Go' : ''
      ].filter(Boolean).join(' / ')

      return {
        success: false,
        code: 1,
        message: `源码构建前置条件不足：缺少 ${missing}`,
        details: `当前源码目录：${context.sourceDir}。前端需要 corepack pnpm，后端需要 Go 才能生成 ${context.sourceBinaryPath}。`
      }
    }

    const frontendDir = join(context.sourceDir, 'frontend')
    const backendDir = join(context.sourceDir, 'backend')
    ensureDirectoryExists(dirname(context.sourceBinaryPath))

    const installResult = await runCommand('corepack', ['pnpm', 'install', '--frozen-lockfile'], frontendDir, 10 * 60 * 1000)
    if (!installResult.success) {
      return {
        success: false,
        code: installResult.code,
        message: 'Sub2API 前端依赖安装失败',
        details: installResult.output || 'corepack pnpm install --frozen-lockfile'
      }
    }

    const frontendBuildResult = await runCommand('corepack', ['pnpm', 'build'], frontendDir, 10 * 60 * 1000)
    if (!frontendBuildResult.success) {
      return {
        success: false,
        code: frontendBuildResult.code,
        message: 'Sub2API 前端构建失败',
        details: frontendBuildResult.output || 'corepack pnpm build'
      }
    }

    const backendBuildResult = await runCommand('go', ['build', '-tags', 'embed', '-o', context.sourceBinaryPath, './cmd/server'], backendDir, 10 * 60 * 1000)
    if (!backendBuildResult.success) {
      return {
        success: false,
        code: backendBuildResult.code,
        message: 'Sub2API 后端构建失败',
        details: backendBuildResult.output || `go build -tags embed -o ${context.sourceBinaryPath} ./cmd/server`
      }
    }

    emitState({}, resolveRuntimeContext({
      ...context.config,
      sourceDir: context.sourceDir,
      sourceRepoUrl: context.sourceRepoUrl,
      preferSourceBuild: true
    }))
    return {
      success: true,
      code: 0,
      message: 'Sub2API 源码构建完成',
      details: `已生成源码构建产物：${context.sourceBinaryPath}`
    }
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
    startDependencies,
    stopDependencies,
    syncSource,
    buildSource,
    shutdown
  }
}
