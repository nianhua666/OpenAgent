import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, screen, shell } from 'electron'
import type { FileFilter, MenuItemConstructorOptions, OpenDialogOptions } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, normalize, parse, relative } from 'path'
import { registerAzureTTSHandlers } from './azureSpeech'
import { ensureLive2DDirs, listLive2DLibraryItems, migrateLive2DStorageData, registerLive2DHandlers, registerLive2DProtocol, setLive2DDebugLogger, setLive2DStorageDirResolver } from './live2d'
import { listEdgeNeuralVoices, registerEdgeTTSHandlers, synthesizeEdgeSpeech } from './edgeTts'
import { registerRuntimeAssetProtocol } from './runtimeAssets'
import { listNativeSystemVoices, registerSystemTTSHandlers, synthesizeNativeSystemSpeech } from './systemTts'
import { executeCommand, captureScreen, mouseClick, keyboardInput, listWindows, focusWindow } from './mcp'
import { callManagedMcpTool, inspectManagedMcpServer, installManagedMcpPackage } from './externalMcp'
import { createSub2ApiDesktopManager } from './sub2apiDesktop'
import type { AppSettings, IDETerminalEvent, IDETerminalInputRequest, IDETerminalResizeRequest, IDETerminalRunRequest, IDETerminalRunResult, IDETerminalSessionCreateRequest, IDETerminalSessionInfo, IDETerminalSessionMode, Live2DCursorPoint, Live2DMouthState, Sub2ApiDesktopManagedConfig, Sub2ApiDesktopRuntimeConfig, Sub2ApiDesktopSetupProfile, Sub2ApiSetupDatabaseConfig, Sub2ApiSetupRedisConfig, WindowBounds, WindowShapeRect } from '../src/types'
import {
  AZURE_TTS_ENGINE,
  DEFAULT_TTS_SAMPLE_TEXT,
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_EMOTION_INTENSITY,
  DEFAULT_TTS_EMOTION_STYLE,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_TTS_VOICE_ID,
  EDGE_TTS_ENGINE,
  EDGE_TTS_MODEL_ID,
  EDGE_TTS_VOICE_ID,
  SYSTEM_TTS_ENGINE,
  SYSTEM_TTS_MODEL_ID,
  clampTTSEmotionIntensity,
  getDefaultTTSVoiceId,
  getTTSVoiceOption,
  isAzureTTSVoiceId,
  isBuiltinTTSVoice,
  isEdgeTTSVoiceId,
  isSystemTTSVoiceId,
  normalizeTTSEmotionStyle,
  normalizeTTSEngine,
  normalizeTTSModelId
} from '../src/utils/ttsCatalog'

type NodePtyProcess = {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number; signal: number }) => void): void
  kill(signal?: string): void
}

type NodePtySpawn = (
  file: string,
  args: string[],
  options: {
    name?: string
    cwd: string
    env: NodeJS.ProcessEnv
    cols?: number
    rows?: number
  },
) => NodePtyProcess

let nodePtySpawnPromise: Promise<NodePtySpawn | null> | null = null
let nodePtyLoadError = ''

type RuntimeDataStorageMode = 'auto' | 'custom'
type WindowDragPoint = { x: number; y: number }

interface RuntimeDataStoragePreference {
  mode: RuntimeDataStorageMode
  customUserDataPath: string
}

interface RuntimeDataStorageInfo {
  mode: RuntimeDataStorageMode
  activeUserDataPath: string
  defaultUserDataPath: string
  recommendedUserDataPath: string
  customUserDataPath: string
  dataPath: string
  logsPath: string
  tempPath: string
  live2dDefaultStoragePath: string
  usingCustomStorage: boolean
  usingRecommendedStorage: boolean
  onSystemDrive: boolean
  systemDriveRoot: string
}

const DEFAULT_USER_DATA_DIR = app.getPath('userData')
const RUNTIME_DATA_PREFERENCE_FILE = join(app.getPath('appData'), 'OpenAgent.runtime-data.json')
const LEGACY_RUNTIME_DATA_PREFERENCE_FILE = join(app.getPath('appData'), 'ai账号工具.runtime-data.json')
const APP_EXTERNAL_DATA_DIR_NAME = 'OpenAgent-data'
const LEGACY_APP_EXTERNAL_DATA_DIR_NAME = 'ai账号工具-data'
const DEFAULT_RUNTIME_DATA_STORAGE_PREFERENCE: RuntimeDataStoragePreference = {
  mode: 'auto',
  customUserDataPath: ''
}
const SUB2API_CONFIG_STORE_KEY = 'sub2api_config'
const SUB2API_RUNTIME_STATE_STORE_KEY = 'sub2api_runtime_state'

const sub2ApiRuntimeManager = createSub2ApiDesktopManager({
  getDataDir: () => getDataDir(),
  onStateChange: (runtimeState) => {
    broadcastStoreChanged(SUB2API_RUNTIME_STATE_STORE_KEY, runtimeState)
  }
})

function normalizeDirectoryPath(targetPath: string | null | undefined) {
  const normalized = typeof targetPath === 'string' ? targetPath.trim() : ''
  return normalized ? normalize(normalized) : ''
}

function resolveDriveRoot(targetPath: string) {
  const root = parse(targetPath || '').root
  return root ? root.toUpperCase() : ''
}

function isDirectoryEmpty(targetPath: string) {
  if (!existsSync(targetPath)) {
    return true
  }

  try {
    return readdirSync(targetPath).length === 0
  } catch {
    return false
  }
}

function isSameDirectory(leftPath: string | null | undefined, rightPath: string | null | undefined) {
  const left = normalizeDirectoryPath(leftPath)
  const right = normalizeDirectoryPath(rightPath)
  return !!left && !!right && left.toLowerCase() === right.toLowerCase()
}

function isNestedDirectory(parentPath: string, childPath: string) {
  const normalizedParent = normalizeDirectoryPath(parentPath)
  const normalizedChild = normalizeDirectoryPath(childPath)
  if (!normalizedParent || !normalizedChild || isSameDirectory(normalizedParent, normalizedChild)) {
    return false
  }

  const rel = relative(normalizedParent, normalizedChild)
  return !!rel && !rel.startsWith('..') && !rel.includes(':')
}

function ensureDirectoryExists(targetPath: string) {
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true })
  }
}

function looksLikeUserDataRoot(targetPath: string) {
  return existsSync(join(targetPath, 'data'))
    || existsSync(join(targetPath, 'logs'))
    || existsSync(join(targetPath, 'temp'))
    || existsSync(join(targetPath, 'live2d-models'))
}

function resolveManualUserDataDir(candidatePath: string | null | undefined) {
  const normalized = normalizeDirectoryPath(candidatePath)
  if (!normalized) {
    return ''
  }

  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return join(normalized, APP_EXTERNAL_DATA_DIR_NAME)
  }

  if (
    normalized.toLowerCase().endsWith(APP_EXTERNAL_DATA_DIR_NAME.toLowerCase())
    || normalized.toLowerCase().endsWith(LEGACY_APP_EXTERNAL_DATA_DIR_NAME.toLowerCase())
    || looksLikeUserDataRoot(normalized)
  ) {
    return normalized
  }

  return join(normalized, APP_EXTERNAL_DATA_DIR_NAME)
}

function readRuntimeDataStoragePreference(): RuntimeDataStoragePreference {
  const preferenceFile = existsSync(RUNTIME_DATA_PREFERENCE_FILE)
    ? RUNTIME_DATA_PREFERENCE_FILE
    : existsSync(LEGACY_RUNTIME_DATA_PREFERENCE_FILE)
      ? LEGACY_RUNTIME_DATA_PREFERENCE_FILE
      : ''

  if (!preferenceFile) {
    return { ...DEFAULT_RUNTIME_DATA_STORAGE_PREFERENCE }
  }

  try {
    const raw = JSON.parse(readFileSync(preferenceFile, 'utf-8')) as Partial<RuntimeDataStoragePreference>
    return {
      mode: raw.mode === 'custom' ? 'custom' : 'auto',
      customUserDataPath: normalizeDirectoryPath(raw.customUserDataPath)
    }
  } catch {
    return { ...DEFAULT_RUNTIME_DATA_STORAGE_PREFERENCE }
  }
}

function writeRuntimeDataStoragePreference(preference: RuntimeDataStoragePreference) {
  writeFileSync(RUNTIME_DATA_PREFERENCE_FILE, JSON.stringify(preference, null, 2), 'utf-8')
}

function buildPreferredUserDataCandidates() {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return [DEFAULT_USER_DATA_DIR]
  }

  const candidates: string[] = []
  const systemDrive = resolveDriveRoot(process.env.WINDIR || DEFAULT_USER_DATA_DIR)
  const pushCandidate = (candidate: string | null | undefined) => {
    const normalized = candidate?.trim()
    if (!normalized || candidates.includes(normalized)) {
      return
    }

    candidates.push(normalized)
  }
  const pushManagedDataCandidates = (baseDir: string | null | undefined) => {
    const normalized = baseDir?.trim()
    if (!normalized) {
      return
    }

    const legacyPath = join(normalized, LEGACY_APP_EXTERNAL_DATA_DIR_NAME)
    if (existsSync(legacyPath)) {
      pushCandidate(legacyPath)
    }

    pushCandidate(join(normalized, APP_EXTERNAL_DATA_DIR_NAME))
  }

  const installDir = dirname(process.execPath)
  const installParentDir = dirname(installDir)
  if (resolveDriveRoot(installDir) && resolveDriveRoot(installDir) !== systemDrive) {
    pushManagedDataCandidates(installParentDir)
  }

  const documentsDir = app.getPath('documents')
  if (resolveDriveRoot(documentsDir) && resolveDriveRoot(documentsDir) !== systemDrive) {
    pushManagedDataCandidates(documentsDir)
  }

  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    const driveRoot = `${letter}:\\`
    if (driveRoot.toUpperCase() === systemDrive || !existsSync(driveRoot)) {
      continue
    }

    pushManagedDataCandidates(driveRoot)
  }

  pushCandidate(DEFAULT_USER_DATA_DIR)
  return candidates
}

function resolvePreferredUserDataDir() {
  for (const candidate of buildPreferredUserDataCandidates()) {
    try {
      mkdirSync(candidate, { recursive: true })
      return candidate
    } catch {
      // 当前候选目录不可写时继续尝试下一个。
    }
  }

  return DEFAULT_USER_DATA_DIR
}

function copyDirectoryContents(sourceDir: string, targetDir: string, overwrite = false) {
  if (!existsSync(sourceDir)) {
    return
  }

  ensureDirectoryExists(targetDir)
  for (const entry of readdirSync(sourceDir)) {
    cpSync(join(sourceDir, entry), join(targetDir, entry), {
      recursive: true,
      force: overwrite,
      errorOnExist: false
    })
  }
}

function migrateUserDataIfNeeded(sourceDir: string, targetDir: string) {
  if (!sourceDir || !targetDir || isSameDirectory(sourceDir, targetDir) || !existsSync(sourceDir)) {
    return
  }

  try {
    if (!existsSync(targetDir) || isDirectoryEmpty(targetDir)) {
      copyDirectoryContents(sourceDir, targetDir, false)
    }
  } catch {
    // 迁移失败时回退到新目录继续运行，避免阻塞启动。
  }
}

function resolveInitialUserDataDir(preference: RuntimeDataStoragePreference) {
  if (preference.mode === 'custom') {
    const customPath = resolveManualUserDataDir(preference.customUserDataPath)
    if (customPath) {
      try {
        ensureDirectoryExists(customPath)
        return customPath
      } catch {
        // 自定义路径不可用时回退自动策略。
      }
    }
  }

  return resolvePreferredUserDataDir()
}

function getActiveUserDataDir() {
  return normalizeDirectoryPath(app.getPath('userData')) || DEFAULT_USER_DATA_DIR
}

function getDataDir() {
  return join(getActiveUserDataDir(), 'data')
}

function getLogsDir() {
  return join(getActiveUserDataDir(), 'logs')
}

function getTempDir() {
  return join(getActiveUserDataDir(), 'temp')
}

function getDefaultLive2DStorageDir() {
  return join(getActiveUserDataDir(), 'live2d-models')
}

let runtimeDataStoragePreference = readRuntimeDataStoragePreference()
const INITIAL_USER_DATA_DIR = resolveInitialUserDataDir(runtimeDataStoragePreference)
if (!isSameDirectory(INITIAL_USER_DATA_DIR, DEFAULT_USER_DATA_DIR)) {
  migrateUserDataIfNeeded(DEFAULT_USER_DATA_DIR, INITIAL_USER_DATA_DIR)
  app.setPath('userData', INITIAL_USER_DATA_DIR)
}

runtimeDataStoragePreference = runtimeDataStoragePreference.mode === 'custom' && isSameDirectory(resolveManualUserDataDir(runtimeDataStoragePreference.customUserDataPath), getActiveUserDataDir())
  ? { mode: 'custom', customUserDataPath: getActiveUserDataDir() }
  : { ...DEFAULT_RUNTIME_DATA_STORAGE_PREFERENCE }
writeRuntimeDataStoragePreference(runtimeDataStoragePreference)

function buildRuntimeDataStorageInfo(): RuntimeDataStorageInfo {
  const activeUserDataPath = getActiveUserDataDir()
  const recommendedUserDataPath = resolvePreferredUserDataDir()
  const customUserDataPath = runtimeDataStoragePreference.mode === 'custom'
    ? resolveManualUserDataDir(runtimeDataStoragePreference.customUserDataPath)
    : ''
  const systemDriveRoot = resolveDriveRoot(process.env.WINDIR || DEFAULT_USER_DATA_DIR)

  return {
    mode: runtimeDataStoragePreference.mode,
    activeUserDataPath,
    defaultUserDataPath: DEFAULT_USER_DATA_DIR,
    recommendedUserDataPath,
    customUserDataPath,
    dataPath: getDataDir(),
    logsPath: getLogsDir(),
    tempPath: getTempDir(),
    live2dDefaultStoragePath: getDefaultLive2DStorageDir(),
    usingCustomStorage: runtimeDataStoragePreference.mode === 'custom' && isSameDirectory(activeUserDataPath, customUserDataPath),
    usingRecommendedStorage: isSameDirectory(activeUserDataPath, recommendedUserDataPath),
    onSystemDrive: resolveDriveRoot(activeUserDataPath) === systemDriveRoot,
    systemDriveRoot
  }
}

function switchRuntimeDataStorage(nextMode: RuntimeDataStorageMode, candidatePath?: string) {
  const currentUserDataPath = getActiveUserDataDir()
  const targetUserDataPath = nextMode === 'custom'
    ? resolveManualUserDataDir(candidatePath)
    : resolvePreferredUserDataDir()

  if (!targetUserDataPath) {
    throw new Error(nextMode === 'custom' ? '请选择有效的运行数据目录' : '未找到可用的自动运行数据目录')
  }

  if (isNestedDirectory(currentUserDataPath, targetUserDataPath) || isNestedDirectory(targetUserDataPath, currentUserDataPath)) {
    throw new Error('新旧运行数据目录不能互为父子目录，避免迁移时递归拷贝导致数据异常')
  }

  ensureDirectoryExists(targetUserDataPath)

  if (!isSameDirectory(currentUserDataPath, targetUserDataPath)) {
    copyDirectoryContents(currentUserDataPath, targetUserDataPath, true)
    app.setPath('userData', targetUserDataPath)
  }

  runtimeDataStoragePreference = nextMode === 'custom'
    ? { mode: 'custom', customUserDataPath: targetUserDataPath }
    : { ...DEFAULT_RUNTIME_DATA_STORAGE_PREFERENCE }
  writeRuntimeDataStoragePreference(runtimeDataStoragePreference)

  ensureDataDir()
  if (!currentSettings.live2dStoragePath) {
    ensureLive2DDirs()
  }

  const info = buildRuntimeDataStorageInfo()
  broadcastStoreChanged('runtime_data_storage', info)
  return info
}

const MAIN_WINDOW_WIDTH = 1400
const MAIN_WINDOW_HEIGHT = 900
const MAIN_WINDOW_MIN_WIDTH = 1100
const MAIN_WINDOW_MIN_HEIGHT = 700
const AI_OVERLAY_WINDOW_WIDTH = 460
const AI_OVERLAY_WINDOW_HEIGHT = 640
const AI_OVERLAY_WINDOW_MIN_WIDTH = 400
const AI_OVERLAY_WINDOW_MIN_HEIGHT = 520
const LIVE2D_WINDOW_MIN_WIDTH = 320
const LIVE2D_WINDOW_MIN_HEIGHT = 400
const LIVE2D_CURSOR_BROADCAST_INTERVAL = 16
const LIVE2D_BUNDLED_MODEL = 'live2d://bundle/shizuku/shizuku.model.json'
const LIVE2D_DIAGNOSTIC_ARG = '--live2d-diagnose'
const TTS_DIAGNOSTIC_ARG = '--tts-diagnose'
const IS_LIVE2D_DIAGNOSTIC_MODE = process.argv.includes(LIVE2D_DIAGNOSTIC_ARG)
const IS_TTS_DIAGNOSTIC_MODE = process.argv.includes(TTS_DIAGNOSTIC_ARG)
const LIVE2D_IDLE_MOUTH_STATE: Live2DMouthState = {
  level: 0,
  speaking: false,
  timestamp: 0
}
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'sakura',
  sidebarCollapsed: false,
  live2dEnabled: true,
  live2dModel: LIVE2D_BUNDLED_MODEL,
  live2dModelName: 'Shizuku',
  live2dModelSource: 'bundled',
  live2dStoragePath: '',
  live2dPosition: { x: -1, y: -1 },
  live2dScale: 0.12,
  aiOverlayBounds: null,
  closeToTray: true,
  launchAtLogin: false,
  language: 'zh-CN',
  defaultPageSize: 20,
  autoSaveInterval: 30000,
  currencySymbol: '¥',
  windowsMcpEnabled: true,
  ttsEnabled: true,
  ttsEngine: DEFAULT_TTS_ENGINE,
  ttsAutoPlayLive2D: true,
  ttsShowMainReplyButton: false,
  ttsModelId: DEFAULT_TTS_MODEL_ID,
  ttsVoiceId: DEFAULT_TTS_VOICE_ID,
  ttsVoiceName: getTTSVoiceOption(DEFAULT_TTS_VOICE_ID, DEFAULT_TTS_MODEL_ID, DEFAULT_TTS_ENGINE)?.name || '小贝',
  ttsAzureKey: '',
  ttsAzureRegion: '',
  ttsEmotionStyle: DEFAULT_TTS_EMOTION_STYLE,
  ttsEmotionIntensity: DEFAULT_TTS_EMOTION_INTENSITY,
  ttsSpeed: 1,
  ttsVolume: 0.92
}

function normalizeWindowBounds(bounds: unknown): WindowBounds | null {
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) {
    return null
  }

  const candidate = bounds as Partial<WindowBounds>
  if (
    !Number.isFinite(candidate.x)
    || !Number.isFinite(candidate.y)
    || !Number.isFinite(candidate.width)
    || !Number.isFinite(candidate.height)
  ) {
    return null
  }

  return {
    x: Math.round(Number(candidate.x)),
    y: Math.round(Number(candidate.y)),
    width: Math.max(Math.round(Number(candidate.width)), AI_OVERLAY_WINDOW_MIN_WIDTH),
    height: Math.max(Math.round(Number(candidate.height)), AI_OVERLAY_WINDOW_MIN_HEIGHT)
  }
}

function appendLive2DDebugLog(scope: string, message: string) {
  try {
    const logDir = getLogsDir()
    ensureDirectoryExists(logDir)

    appendFileSync(join(logDir, 'live2d-debug.log'), `[${new Date().toISOString()}] [${scope}] ${message}\n`, 'utf-8')
  } catch {
    // 忽略日志写入失败，避免影响主流程
  }
}

function appendTTSDebugLog(scope: string, message: string) {
  try {
    const logDir = getLogsDir()
    ensureDirectoryExists(logDir)

    appendFileSync(join(logDir, 'tts-diagnose.log'), `[${new Date().toISOString()}] [${scope}] ${message}\n`, 'utf-8')
  } catch {
    // 忽略日志写入失败，避免影响主流程
  }
}

function attachWindowDiagnostics(win: BrowserWindow, scope: string) {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (/live2d|oml2d|pixi|cubism|model/i.test(message) || scope === 'overlay') {
      appendLive2DDebugLog(scope, `console[level=${level}] ${message} (${sourceId}:${line})`)
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    appendLive2DDebugLog(scope, `did-fail-load code=${errorCode} main=${isMainFrame} url=${validatedURL} desc=${errorDescription}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    appendLive2DDebugLog(scope, `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
}

let mainWindow: BrowserWindow | null = null
let aiOverlayWindow: BrowserWindow | null = null
let live2dWindow: BrowserWindow | null = null
let lastAIOverlayBounds: WindowBounds | null = null
let lastLive2DMouthState: Live2DMouthState = { ...LIVE2D_IDLE_MOUTH_STATE }
let tray: Tray | null = null
let isQuittingApp = false
let trayHintShown = false
let live2dMoveTimer: ReturnType<typeof setTimeout> | null = null
let live2dCursorTimer: ReturnType<typeof setInterval> | null = null
let aiOverlayBoundsPersistTimer: ReturnType<typeof setTimeout> | null = null
let lastLive2DCursorKey = ''
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS }
const activeWindowDrags = new Map<number, { startCursor: WindowDragPoint; startPosition: [number, number] }>()
const ideTerminalTrackedOwners = new Set<number>()
const ideTerminalOwnerSessions = new Map<number, Set<string>>()
const ideTerminalProcesses = new Map<string, {
  sessionId: string
  owner: Electron.WebContents
  command: string
  title: string
  cwd: string
  mode: IDETerminalSessionMode
  shell: string
  startedAt: number
  child?: ChildProcess
  pty?: NodePtyProcess
  cancelRequested: boolean
}>()

if (!IS_LIVE2D_DIAGNOSTIC_MODE && !app.requestSingleInstanceLock()) {
  app.quit()
}

function getWindowIconPath() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(process.cwd(), 'build', 'icon.png')

  return existsSync(iconPath) ? iconPath : undefined
}

function getSafeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function getNodePtySpawn() {
  if (!nodePtySpawnPromise) {
    nodePtySpawnPromise = import('node-pty')
      .then(module => module.spawn as NodePtySpawn)
      .catch(error => {
        nodePtyLoadError = error instanceof Error ? error.message : String(error)
        return null
      })
  }

  return await nodePtySpawnPromise
}

function assertValidIdeWorkingDirectory(cwd: string | null) {
  if (!cwd || !existsSync(cwd)) {
    throw new Error('终端工作目录无效或不存在')
  }

  const cwdStat = statSync(cwd)
  if (!cwdStat.isDirectory()) {
    throw new Error('终端工作目录不是有效文件夹')
  }

  return cwd
}

function buildIdeShellCommand(command: string) {
  if (process.platform === 'win32') {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
      shell: 'Command Prompt'
    }
  }

  return {
    file: process.env.SHELL || '/bin/sh',
    args: ['-lc', command],
    shell: process.env.SHELL || '/bin/sh'
  }
}

function buildIdeInteractiveShell() {
  if (process.platform === 'win32') {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/q'],
      shell: 'Command Prompt'
    }
  }

  const shellPath = process.env.SHELL || '/bin/sh'
  return {
    file: shellPath,
    args: ['-i'],
    shell: shellPath
  }
}

function trackIdeTerminalSession(ownerId: number, sessionId: string) {
  const sessionIds = ideTerminalOwnerSessions.get(ownerId) ?? new Set<string>()
  sessionIds.add(sessionId)
  ideTerminalOwnerSessions.set(ownerId, sessionIds)
}

function untrackIdeTerminalSession(ownerId: number, sessionId: string) {
  const sessionIds = ideTerminalOwnerSessions.get(ownerId)
  if (!sessionIds) {
    return
  }

  sessionIds.delete(sessionId)
  if (sessionIds.size === 0) {
    ideTerminalOwnerSessions.delete(ownerId)
  }
}

function ensureIdeTerminalOwnerCleanup(owner: Electron.WebContents) {
  if (ideTerminalTrackedOwners.has(owner.id)) {
    return
  }

  ideTerminalTrackedOwners.add(owner.id)
  owner.once('destroyed', () => {
    stopIdeTerminalSessionsByOwner(owner.id)
    ideTerminalTrackedOwners.delete(owner.id)
  })
}

function emitIdeTerminalEvent(entry: {
  owner: Electron.WebContents
  sessionId: string
  command: string
  title: string
  cwd: string
  mode: IDETerminalSessionMode
  shell: string
}, payload: Omit<IDETerminalEvent, 'sessionId' | 'command' | 'cwd'>) {
  if (entry.owner.isDestroyed()) {
    return
  }

  const nextPayload: IDETerminalEvent = {
    sessionId: entry.sessionId,
    command: entry.command,
    cwd: entry.cwd,
    title: entry.title,
    mode: entry.mode,
    shell: entry.shell,
    ...payload
  }

  entry.owner.send('ide:terminal:event', nextPayload)
}

function cleanupIdeTerminalSession(sessionId: string) {
  const entry = ideTerminalProcesses.get(sessionId)
  if (!entry) {
    return
  }

  ideTerminalProcesses.delete(sessionId)
  untrackIdeTerminalSession(entry.owner.id, sessionId)
}

function stopIdeTerminalSession(sessionId: string) {
  const entry = ideTerminalProcesses.get(sessionId)
  if (!entry) {
    return false
  }

  entry.cancelRequested = true

  if (entry.pty) {
    try {
      entry.pty.kill()
      return true
    } catch {
      return false
    }
  }

  if (!entry.child) {
    return false
  }

  if (entry.child.exitCode !== null || entry.child.killed) {
    return true
  }

  if (process.platform === 'win32') {
    const pid = entry.child.pid
    if (typeof pid === 'number' && pid > 0) {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore'
      })
      killer.unref()
      return true
    }
  }

  try {
    entry.child.kill('SIGTERM')
    return true
  } catch {
    return false
  }
}

function interruptIdeTerminalSession(sessionId: string) {
  const entry = ideTerminalProcesses.get(sessionId)
  if (!entry || entry.mode !== 'shell') {
    return false
  }

  if (entry.pty) {
    try {
      entry.pty.write('\u0003')
      return true
    } catch {
      return false
    }
  }

  if (!entry.child?.stdin || entry.child.stdin.destroyed) {
    return false
  }

  try {
    entry.child.stdin.write('\u0003')
    return true
  } catch {
    return false
  }
}

function resizeIdeTerminalSession(sessionId: string, cols: number, rows: number) {
  const entry = ideTerminalProcesses.get(sessionId)
  if (!entry || entry.mode !== 'shell' || !entry.pty) {
    return false
  }

  try {
    entry.pty.resize(cols, rows)
    return true
  } catch {
    return false
  }
}

function stopIdeTerminalSessionsByOwner(ownerId: number) {
  const sessionIds = ideTerminalOwnerSessions.get(ownerId)
  if (!sessionIds || sessionIds.size === 0) {
    return false
  }

  let stopped = false
  for (const sessionId of [...sessionIds]) {
    stopped = stopIdeTerminalSession(sessionId) || stopped
  }
  return stopped
}

function registerIdeTerminalProcess(entry: {
  sessionId: string
  owner: Electron.WebContents
  command: string
  title: string
  cwd: string
  mode: IDETerminalSessionMode
  shell: string
  startedAt: number
  child?: ChildProcess
  pty?: NodePtyProcess
  cancelRequested: boolean
}) {
  ideTerminalProcesses.set(entry.sessionId, entry)
  trackIdeTerminalSession(entry.owner.id, entry.sessionId)

  let finalized = false
  const finalize = (payload: Omit<IDETerminalEvent, 'sessionId' | 'command' | 'cwd'>) => {
    if (finalized) {
      return
    }

    finalized = true
    emitIdeTerminalEvent(entry, payload)
    cleanupIdeTerminalSession(entry.sessionId)
  }

  emitIdeTerminalEvent(entry, {
    type: 'start',
    timestamp: entry.startedAt,
    status: 'running'
  })

  if (entry.pty) {
    entry.pty.onData((chunk: string) => {
      if (!chunk) {
        return
      }

      emitIdeTerminalEvent(entry, {
        type: 'data',
        timestamp: Date.now(),
        stream: 'stdout',
        chunk
      })
    })

    entry.pty.onExit(({ exitCode, signal }) => {
      finalize({
        type: 'exit',
        timestamp: Date.now(),
        status: entry.cancelRequested ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed',
        exitCode,
        signal: typeof signal === 'number' && signal > 0 ? String(signal) : null
      })
    })

    return
  }

  if (!entry.child?.stdout || !entry.child.stderr) {
    throw new Error('终端输出管道初始化失败')
  }

  entry.child.stdout.setEncoding('utf8')
  entry.child.stderr.setEncoding('utf8')

  entry.child.stdout.on('data', (chunk: string) => {
    if (!chunk) {
      return
    }

    emitIdeTerminalEvent(entry, {
      type: 'data',
      timestamp: Date.now(),
      stream: 'stdout',
      chunk
    })
  })

  entry.child.stderr.on('data', (chunk: string) => {
    if (!chunk) {
      return
    }

    emitIdeTerminalEvent(entry, {
      type: 'data',
      timestamp: Date.now(),
      stream: 'stderr',
      chunk
    })
  })

  entry.child.on('error', error => {
    finalize({
      type: 'error',
      timestamp: Date.now(),
      status: entry.cancelRequested ? 'cancelled' : 'failed',
      error: error.message
    })
  })

  entry.child.on('close', (exitCode, signal) => {
    finalize({
      type: 'exit',
      timestamp: Date.now(),
      status: entry.cancelRequested ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed',
      exitCode,
      signal: signal ?? null
    })
  })
}

function createIdeTerminalEntry(
  owner: Electron.WebContents,
  runtime: { child?: ChildProcess; pty?: NodePtyProcess },
  payload: {
    command: string
    title: string
    cwd: string
    mode: IDETerminalSessionMode
    shell: string
  },
) {
  const entry = {
    sessionId: randomUUID(),
    owner,
    command: payload.command,
    title: payload.title,
    cwd: payload.cwd,
    mode: payload.mode,
    shell: payload.shell,
    startedAt: Date.now(),
    child: runtime.child,
    pty: runtime.pty,
    cancelRequested: false
  }

  registerIdeTerminalProcess(entry)
  return entry
}

function getDataFilePath(key: string) {
  return join(getDataDir(), `${getSafeKey(key)}.json`)
}

function readJsonFile<T>(key: string) {
  const filePath = getDataFilePath(key)
  if (!existsSync(filePath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function ensureDataDir() {
  ensureDirectoryExists(getDataDir())
}

function normalizeSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  const isLegacyDesktopSettings = typeof saved?.closeToTray === 'undefined' && typeof saved?.launchAtLogin === 'undefined'

  if (typeof merged.live2dStoragePath !== 'string') {
    merged.live2dStoragePath = ''
  }

  merged.ttsEnabled = typeof merged.ttsEnabled === 'boolean' ? merged.ttsEnabled : DEFAULT_SETTINGS.ttsEnabled
  merged.ttsEngine = normalizeTTSEngine(merged.ttsEngine)
  merged.ttsAutoPlayLive2D = typeof merged.ttsAutoPlayLive2D === 'boolean' ? merged.ttsAutoPlayLive2D : DEFAULT_SETTINGS.ttsAutoPlayLive2D
  merged.ttsShowMainReplyButton = typeof merged.ttsShowMainReplyButton === 'boolean' ? merged.ttsShowMainReplyButton : DEFAULT_SETTINGS.ttsShowMainReplyButton
  merged.ttsAzureKey = typeof merged.ttsAzureKey === 'string' ? merged.ttsAzureKey.trim() : ''
  merged.ttsAzureRegion = typeof merged.ttsAzureRegion === 'string' ? merged.ttsAzureRegion.trim().toLowerCase() : ''
  merged.ttsModelId = normalizeTTSModelId(merged.ttsModelId, merged.ttsEngine)
  merged.ttsEmotionStyle = normalizeTTSEmotionStyle(merged.ttsEmotionStyle)
  merged.ttsEmotionIntensity = clampTTSEmotionIntensity(merged.ttsEmotionIntensity)

  if (!merged.ttsVoiceId) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === SYSTEM_TTS_ENGINE && (isBuiltinTTSVoice(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId) || isAzureTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === AZURE_TTS_ENGINE && (isBuiltinTTSVoice(merged.ttsVoiceId) || isSystemTTSVoiceId(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === EDGE_TTS_ENGINE && (isBuiltinTTSVoice(merged.ttsVoiceId) || isSystemTTSVoiceId(merged.ttsVoiceId) || isAzureTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === DEFAULT_TTS_ENGINE && (isSystemTTSVoiceId(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId) || isAzureTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = DEFAULT_TTS_VOICE_ID
  }

  const resolvedVoice = getTTSVoiceOption(merged.ttsVoiceId, merged.ttsModelId, merged.ttsEngine)
  merged.ttsVoiceId = resolvedVoice?.id || getDefaultTTSVoiceId(merged.ttsEngine)
  merged.ttsVoiceName = resolvedVoice?.name || DEFAULT_SETTINGS.ttsVoiceName
  merged.ttsSpeed = Number.isFinite(merged.ttsSpeed) ? Math.min(Math.max(Number(merged.ttsSpeed), 0.7), 1.35) : DEFAULT_SETTINGS.ttsSpeed
  merged.ttsVolume = Number.isFinite(merged.ttsVolume) ? Math.min(Math.max(Number(merged.ttsVolume), 0), 1) : DEFAULT_SETTINGS.ttsVolume
  merged.live2dScale = Number.isFinite(merged.live2dScale) ? Math.min(Math.max(Number(merged.live2dScale), 0.05), 0.45) : DEFAULT_SETTINGS.live2dScale
  merged.aiOverlayBounds = normalizeWindowBounds(merged.aiOverlayBounds)

  if (isLegacyDesktopSettings && merged.live2dPosition.x === 0 && merged.live2dPosition.y === 0) {
    merged.live2dPosition = { x: -1, y: -1 }
  }

  if (!merged.live2dModel) {
    merged.live2dModel = DEFAULT_SETTINGS.live2dModel
    merged.live2dModelName = DEFAULT_SETTINGS.live2dModelName
    merged.live2dModelSource = DEFAULT_SETTINGS.live2dModelSource
  }

  return merged
}

function loadSettingsFromDisk() {
  const filePath = getDataFilePath('settings')
  if (!existsSync(filePath)) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function writeJsonFile(key: string, data: unknown) {
  ensureDataDir()
  writeFileSync(getDataFilePath(key), JSON.stringify(data, null, 2), 'utf-8')
}

function loadPersistedSub2ApiRuntimePreference() {
  const saved = readJsonFile<{
    gatewayMode?: string
    desktopRuntime?: Partial<Sub2ApiDesktopRuntimeConfig>
    desktopManaged?: Partial<Sub2ApiDesktopManagedConfig>
  }>(SUB2API_CONFIG_STORE_KEY)
  return {
    gatewayMode: saved?.gatewayMode === 'desktop' ? 'desktop' : 'external',
    desktopRuntime: saved?.desktopRuntime && typeof saved.desktopRuntime === 'object' ? saved.desktopRuntime : undefined,
    desktopManaged: saved?.desktopManaged && typeof saved.desktopManaged === 'object' ? saved.desktopManaged : undefined
  }
}

function sanitizeSub2ApiRuntimePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  return payload as Partial<Sub2ApiDesktopRuntimeConfig>
}

function sanitizeSub2ApiSetupDatabasePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  return payload as Partial<Sub2ApiSetupDatabaseConfig>
}

function sanitizeSub2ApiSetupRedisPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  return payload as Partial<Sub2ApiSetupRedisConfig>
}

function sanitizeSub2ApiSetupProfilePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  return payload as Partial<Sub2ApiDesktopSetupProfile>
}

function sanitizeSub2ApiManagedPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  return payload as Partial<Sub2ApiDesktopManagedConfig>
}

function sanitizeDialogFilters(filters: unknown) {
  if (!Array.isArray(filters)) {
    return undefined
  }

  const sanitizedFilters = filters
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const candidate = item as Partial<FileFilter>
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const extensions = Array.isArray(candidate.extensions)
        ? candidate.extensions.map(ext => String(ext).replace(/^\./, '').trim()).filter(Boolean)
        : []

      if (!name || extensions.length === 0) {
        return null
      }

      return { name, extensions } satisfies FileFilter
    })
    .filter((item): item is FileFilter => Boolean(item))

  return sanitizedFilters.length > 0 ? sanitizedFilters : undefined
}

function resolveImageMimeType(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    default:
      return ''
  }
}

function getRendererEntryUrl(hashPath = '') {
  const url = new URL('openagent://app/index.html')
  url.hash = hashPath ? `#${hashPath}` : ''
  return url.toString()
}

async function loadRendererRoute(win: BrowserWindow, hashPath = '') {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    url.hash = hashPath ? `#${hashPath}` : ''
    await win.loadURL(url.toString())
    return
  }

  await win.loadURL(getRendererEntryUrl(hashPath))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function sanitizeDragPoint(payload: unknown): WindowDragPoint | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const point = payload as Partial<WindowDragPoint>
  if (typeof point.x !== 'number' || typeof point.y !== 'number') {
    return null
  }

  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  }
}

function getLive2DWindowSize(scale: number) {
  const normalizedScale = clamp(scale || DEFAULT_SETTINGS.live2dScale, 0.08, 0.45)
  return {
    width: Math.round(clamp(240 + normalizedScale * 1200, LIVE2D_WINDOW_MIN_WIDTH, 720)),
    height: Math.round(clamp(320 + normalizedScale * 1500, LIVE2D_WINDOW_MIN_HEIGHT, 860))
  }
}

function resolveLive2DWindowBounds() {
  const { width, height } = getLive2DWindowSize(currentSettings.live2dScale)
  const hasSavedPosition = currentSettings.live2dPosition.x >= 0 && currentSettings.live2dPosition.y >= 0
  const targetDisplay = hasSavedPosition
    ? screen.getDisplayNearestPoint({ x: currentSettings.live2dPosition.x, y: currentSettings.live2dPosition.y })
    : screen.getPrimaryDisplay()
  const { workArea } = targetDisplay
  const defaultX = workArea.x + workArea.width - width - 24
  const defaultY = workArea.y + workArea.height - height - 28

  return {
    x: hasSavedPosition ? clamp(currentSettings.live2dPosition.x, workArea.x, workArea.x + workArea.width - width) : defaultX,
    y: hasSavedPosition ? clamp(currentSettings.live2dPosition.y, workArea.y, workArea.y + workArea.height - height) : defaultY,
    width,
    height
  }
}

function broadcastSettingsChanged() {
  for (const win of [mainWindow, aiOverlayWindow, live2dWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:changed', currentSettings)
    }
  }
}

function broadcastStoreChanged(key: string, data: unknown) {
  for (const win of [mainWindow, aiOverlayWindow, live2dWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('store:changed', key, data)
    }
  }
}

function broadcastLive2DMouthState(payload: Live2DMouthState) {
  lastLive2DMouthState = payload

  if (!live2dWindow || live2dWindow.isDestroyed() || live2dWindow.webContents.isDestroyed()) {
    return
  }

  live2dWindow.webContents.send('live2d:mouthState', payload)
}

function applyLaunchAtLoginSetting() {
  if (!app.isPackaged) {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: currentSettings.launchAtLogin,
    path: process.execPath
  })
}

function refreshTrayMenu() {
  if (!tray) {
    return
  }

  const aiOverlayVisible = !!aiOverlayWindow && !aiOverlayWindow.isDestroyed() && aiOverlayWindow.isVisible()

  const models = listLive2DLibraryItems()
  const modelItems: MenuItemConstructorOptions[] = models.length > 0
    ? models.map(model => ({
      label: model.name,
      type: 'radio',
      checked: currentSettings.live2dModel === model.runtimePath,
      click: () => {
        updateSettings({
          live2dEnabled: true,
          live2dModel: model.runtimePath,
          live2dModelName: model.name,
          live2dModelSource: model.source
        })
      }
    }))
    : [{ label: '暂无可用模型', enabled: false }]

  if (/^https?:\/\//i.test(currentSettings.live2dModel)) {
    modelItems.unshift({
      label: `当前远程模型：${currentSettings.live2dModelName}`,
      type: 'radio',
      checked: true,
      enabled: false
    })
    modelItems.push({ type: 'separator' })
  }

  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? '隐藏主窗口' : '打开主窗口',
      click: () => toggleMainWindow()
    },
    {
      label: currentSettings.live2dEnabled ? '隐藏 Live2D 悬浮窗' : '显示 Live2D 悬浮窗',
      click: () => updateSettings({ live2dEnabled: !currentSettings.live2dEnabled })
    },
    {
      label: aiOverlayVisible ? '隐藏 AI 对话悬浮窗' : '显示 AI 对话悬浮窗',
      click: () => toggleAIOverlayWindow()
    },
    { type: 'separator' },
    {
      label: '选择 Live2D 模型',
      submenu: modelItems
    },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: currentSettings.launchAtLogin,
      click: menuItem => updateSettings({ launchAtLogin: menuItem.checked })
    },
    {
      label: '关闭主窗口时驻留托盘',
      type: 'checkbox',
      checked: currentSettings.closeToTray,
      click: menuItem => updateSettings({ closeToTray: menuItem.checked })
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        isQuittingApp = true
        app.quit()
      }
    }
  ])

  tray.setToolTip(currentSettings.live2dEnabled ? `OpenAgent · Live2D：${currentSettings.live2dModelName}` : 'OpenAgent')
  tray.setContextMenu(menu)
}

function showTrayHintOnce() {
  if (trayHintShown || !tray || process.platform !== 'win32') {
    return
  }

  trayHintShown = true
  tray.displayBalloon({
    title: 'OpenAgent 已转入后台',
    content: '左键托盘图标可打开主窗口，右键可控制 Live2D、模型和开机自启动。',
    iconType: 'info'
  })
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: '#fbf2f6',
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    icon: getWindowIconPath()
  })
  attachWindowDiagnostics(win, 'main')

  win.once('ready-to-show', () => {
    win.show()
  })
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  win.on('show', refreshTrayMenu)
  win.on('hide', refreshTrayMenu)
  win.on('close', (event) => {
    if (!isQuittingApp && currentSettings.closeToTray) {
      event.preventDefault()
      hideMainWindow()
      showTrayHintOnce()
    }
  })
  win.on('closed', () => {
    mainWindow = null
    refreshTrayMenu()
  })

  void loadRendererRoute(win)
  return win
}

function createLive2DWindow() {
  const bounds = resolveLive2DWindowBounds()
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    roundedCorners: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    icon: getWindowIconPath()
  })
  attachWindowDiagnostics(win, 'overlay')
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('live2d:mouthState', lastLive2DMouthState)
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.once('ready-to-show', () => {
    if (currentSettings.live2dEnabled) {
      win.showInactive()
      broadcastLive2DMouthState(lastLive2DMouthState)
      syncLive2DCursorBroadcast()
    }
  })
  win.on('show', () => {
    refreshTrayMenu()
    broadcastLive2DMouthState(lastLive2DMouthState)
    syncLive2DCursorBroadcast()
  })
  win.on('hide', () => {
    refreshTrayMenu()
    syncLive2DCursorBroadcast()
  })
  win.on('move', () => {
    pushLive2DCursorPoint(true)
    if (live2dMoveTimer) {
      clearTimeout(live2dMoveTimer)
    }

    live2dMoveTimer = setTimeout(() => {
      if (!live2dWindow || live2dWindow.isDestroyed()) {
        return
      }

      const [x, y] = live2dWindow.getPosition()
      if (x !== currentSettings.live2dPosition.x || y !== currentSettings.live2dPosition.y) {
        updateSettings({ live2dPosition: { x, y } })
      }
    }, 160)
  })
  win.on('close', (event) => {
    if (!isQuittingApp) {
      event.preventDefault()
      if (currentSettings.live2dEnabled) {
        updateSettings({ live2dEnabled: false })
      } else {
        win.hide()
      }
    }
  })
  win.on('closed', () => {
    live2dWindow = null
    stopLive2DCursorBroadcast()
    refreshTrayMenu()
  })

  void loadRendererRoute(win, '/live2d-overlay')
  return win
}

function resolveAIOverlayWindowBounds() {
  const preferredBounds = lastAIOverlayBounds ?? currentSettings.aiOverlayBounds
  const targetDisplay = preferredBounds
    ? screen.getDisplayMatching(preferredBounds)
    : live2dWindow && !live2dWindow.isDestroyed()
      ? screen.getDisplayMatching(live2dWindow.getBounds())
      : mainWindow && !mainWindow.isDestroyed()
        ? screen.getDisplayMatching(mainWindow.getBounds())
        : screen.getPrimaryDisplay()
  const { workArea } = targetDisplay

  if (preferredBounds) {
    const width = clamp(preferredBounds.width, AI_OVERLAY_WINDOW_MIN_WIDTH, Math.max(AI_OVERLAY_WINDOW_MIN_WIDTH, workArea.width - 20))
    const height = clamp(preferredBounds.height, AI_OVERLAY_WINDOW_MIN_HEIGHT, Math.max(AI_OVERLAY_WINDOW_MIN_HEIGHT, workArea.height - 20))

    return {
      x: clamp(preferredBounds.x, workArea.x + 12, workArea.x + workArea.width - width - 12),
      y: clamp(preferredBounds.y, workArea.y + 12, workArea.y + workArea.height - height - 12),
      width,
      height
    }
  }

  const width = Math.min(AI_OVERLAY_WINDOW_WIDTH, Math.max(workArea.width - 48, AI_OVERLAY_WINDOW_MIN_WIDTH))
  const height = Math.min(AI_OVERLAY_WINDOW_HEIGHT, Math.max(workArea.height - 48, AI_OVERLAY_WINDOW_MIN_HEIGHT))

  if (live2dWindow && !live2dWindow.isDestroyed()) {
    const liveBounds = live2dWindow.getBounds()
    const nextX = clamp(liveBounds.x - width - 24, workArea.x + 24, workArea.x + workArea.width - width - 24)
    const nextY = clamp(liveBounds.y + 28, workArea.y + 24, workArea.y + workArea.height - height - 24)
    return {
      x: nextX,
      y: nextY,
      width,
      height
    }
  }

  return {
    x: clamp(workArea.x + workArea.width - width - 36, workArea.x + 24, workArea.x + workArea.width - width - 24),
    y: clamp(workArea.y + Math.round((workArea.height - height) / 2), workArea.y + 24, workArea.y + workArea.height - height - 24),
    width,
    height
  }
}

function persistAIOverlayBounds(bounds: WindowBounds | null) {
  const normalizedBounds = normalizeWindowBounds(bounds)
  lastAIOverlayBounds = normalizedBounds

  const currentBounds = currentSettings.aiOverlayBounds
  if (
    normalizedBounds?.x === currentBounds?.x
    && normalizedBounds?.y === currentBounds?.y
    && normalizedBounds?.width === currentBounds?.width
    && normalizedBounds?.height === currentBounds?.height
  ) {
    return
  }

  updateSettings({ aiOverlayBounds: normalizedBounds })
}

function schedulePersistAIOverlayBounds(bounds: WindowBounds | null) {
  lastAIOverlayBounds = normalizeWindowBounds(bounds)

  if (aiOverlayBoundsPersistTimer) {
    clearTimeout(aiOverlayBoundsPersistTimer)
  }

  aiOverlayBoundsPersistTimer = setTimeout(() => {
    aiOverlayBoundsPersistTimer = null
    persistAIOverlayBounds(lastAIOverlayBounds)
  }, 180)
}

function flushPersistAIOverlayBounds(bounds: WindowBounds | null) {
  if (aiOverlayBoundsPersistTimer) {
    clearTimeout(aiOverlayBoundsPersistTimer)
    aiOverlayBoundsPersistTimer = null
  }

  persistAIOverlayBounds(bounds)
}

function createAIOverlayWindow() {
  const bounds = resolveAIOverlayWindowBounds()
  lastAIOverlayBounds = bounds
  const win = new BrowserWindow({
    ...bounds,
    minWidth: AI_OVERLAY_WINDOW_MIN_WIDTH,
    minHeight: AI_OVERLAY_WINDOW_MIN_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: '#fff7fa',
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    icon: getWindowIconPath()
  })
  attachWindowDiagnostics(win, 'ai-overlay')

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const syncAIOverlayBounds = () => {
    if (!win.isDestroyed()) {
      lastAIOverlayBounds = normalizeWindowBounds(win.getBounds())
    }
  }
  win.once('ready-to-show', () => {
    syncAIOverlayBounds()
    flushPersistAIOverlayBounds(lastAIOverlayBounds)
    win.show()
    win.focus()
  })
  win.on('move', () => {
    syncAIOverlayBounds()
    schedulePersistAIOverlayBounds(lastAIOverlayBounds)
  })
  win.on('resize', () => {
    syncAIOverlayBounds()
    schedulePersistAIOverlayBounds(lastAIOverlayBounds)
  })
  win.on('show', refreshTrayMenu)
  win.on('hide', () => {
    flushPersistAIOverlayBounds(lastAIOverlayBounds)
    refreshTrayMenu()
  })
  win.on('close', () => {
    syncAIOverlayBounds()
    flushPersistAIOverlayBounds(lastAIOverlayBounds)
  })
  win.on('closed', () => {
    aiOverlayWindow = null
    refreshTrayMenu()
  })

  void loadRendererRoute(win, '/ai-overlay')
  return win
}

function ensureMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  }

  return mainWindow
}

function ensureLive2DWindow() {
  if (!live2dWindow || live2dWindow.isDestroyed()) {
    live2dWindow = createLive2DWindow()
  }

  return live2dWindow
}

function ensureAIOverlayWindow() {
  if (!aiOverlayWindow || aiOverlayWindow.isDestroyed()) {
    aiOverlayWindow = createAIOverlayWindow()
  }

  return aiOverlayWindow
}

function showMainWindow() {
  const win = ensureMainWindow()
  if (win.isMinimized()) {
    win.restore()
  }
  if (!win.isVisible()) {
    win.show()
  }
  win.focus()
  refreshTrayMenu()
}

async function navigateMainWindow(hashPath = '') {
  const win = ensureMainWindow()
  if (hashPath) {
    await loadRendererRoute(win, hashPath)
  }

  if (win.isMinimized()) {
    win.restore()
  }
  if (!win.isVisible()) {
    win.show()
  }
  win.focus()
  refreshTrayMenu()
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
  refreshTrayMenu()
}

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    hideMainWindow()
    return
  }

  showMainWindow()
}

function showAIOverlayWindow() {
  const shouldCreateWindow = !aiOverlayWindow || aiOverlayWindow.isDestroyed()
  const win = ensureAIOverlayWindow()
  if (shouldCreateWindow) {
    lastAIOverlayBounds = win.getBounds()
  }
  if (win.isMinimized()) {
    win.restore()
  }
  if (!win.isVisible()) {
    if (win.webContents.isLoading()) {
      win.once('ready-to-show', () => {
        win.show()
        win.focus()
      })
    } else {
      win.show()
      win.focus()
    }
  } else {
    win.focus()
  }
  refreshTrayMenu()
}

function hideAIOverlayWindow() {
  if (aiOverlayWindow && !aiOverlayWindow.isDestroyed()) {
    aiOverlayWindow.hide()
  }

  refreshTrayMenu()
}

function closeAIOverlayWindow() {
  if (aiOverlayWindow && !aiOverlayWindow.isDestroyed()) {
    aiOverlayWindow.close()
  }

  refreshTrayMenu()
}

function toggleAIOverlayWindow() {
  if (aiOverlayWindow && !aiOverlayWindow.isDestroyed() && aiOverlayWindow.isVisible()) {
    hideAIOverlayWindow()
    return
  }

  showAIOverlayWindow()
}

function syncLive2DWindowVisibility() {
  const bounds = resolveLive2DWindowBounds()

  if (currentSettings.live2dEnabled) {
    const win = ensureLive2DWindow()
    win.setBounds(bounds, false)
    pushLive2DCursorPoint(true)
    win.setAlwaysOnTop(true, 'screen-saver')
    if (!win.isVisible()) {
      if (win.webContents.isLoading()) {
        win.once('ready-to-show', () => win.showInactive())
      } else {
        win.showInactive()
      }
    }
    syncLive2DCursorBroadcast()
    return
  }

  if (live2dWindow && !live2dWindow.isDestroyed()) {
    live2dWindow.hide()
  }

  syncLive2DCursorBroadcast()
}

function showLive2DWindow() {
  updateSettings({ live2dEnabled: true })
}

function hideLive2DWindow() {
  updateSettings({ live2dEnabled: false })
}

function toggleLive2DWindow() {
  updateSettings({ live2dEnabled: !currentSettings.live2dEnabled })
}

function updateSettings(partial: Partial<AppSettings>) {
  const previousSettings = currentSettings
  currentSettings = normalizeSettings({ ...currentSettings, ...partial })

  if (previousSettings.live2dStoragePath !== currentSettings.live2dStoragePath) {
    try {
      const targetDir = migrateLive2DStorageData(previousSettings.live2dStoragePath, currentSettings.live2dStoragePath)
      appendLive2DDebugLog('protocol', `storage-path-changed target=${targetDir}`)
    } catch (error) {
      appendLive2DDebugLog('protocol', `storage-path-change-failed ${(error as Error)?.message ?? String(error)}`)
    }

    ensureLive2DDirs()
  }

  writeJsonFile('settings', currentSettings)
  applyLaunchAtLoginSetting()
  syncLive2DWindowVisibility()
  broadcastSettingsChanged()
  refreshTrayMenu()
}

function sanitizeLive2DMouthState(payload: unknown): Live2DMouthState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  const candidate = payload as Partial<Live2DMouthState>
  if (!Number.isFinite(candidate.level)) {
    return null
  }

  return {
    level: clamp(Number(candidate.level), 0, 1),
    speaking: typeof candidate.speaking === 'boolean' ? candidate.speaking : Number(candidate.level) > 0.01,
    timestamp: Number.isFinite(candidate.timestamp) ? Math.round(Number(candidate.timestamp)) : Date.now()
  }
}

function startWindowDrag(senderWindow: BrowserWindow | null, point: WindowDragPoint | null) {
  if (!senderWindow || !point || senderWindow.isDestroyed()) {
    return
  }

  if (senderWindow === mainWindow && senderWindow.isMaximized()) {
    return
  }

  activeWindowDrags.set(senderWindow.webContents.id, {
    startCursor: point,
    startPosition: (() => {
      const [x, y] = senderWindow.getPosition()
      return [x, y] as [number, number]
    })()
  })
}

function updateWindowDragPosition(senderWindow: BrowserWindow | null, point: WindowDragPoint | null) {
  if (!senderWindow || !point || senderWindow.isDestroyed()) {
    return
  }

  const dragState = activeWindowDrags.get(senderWindow.webContents.id)
  if (!dragState) {
    return
  }

  const [baseX, baseY] = dragState.startPosition
  const nextX = baseX + (point.x - dragState.startCursor.x)
  const nextY = baseY + (point.y - dragState.startCursor.y)
  senderWindow.setPosition(Math.round(nextX), Math.round(nextY), false)
}

function endWindowDrag(senderWindow: BrowserWindow | null) {
  if (!senderWindow) {
    return
  }

  activeWindowDrags.delete(senderWindow.webContents.id)
}

function setOverlayIgnoreMouseEvents(senderWindow: BrowserWindow | null, ignore: boolean) {
  if (!senderWindow || senderWindow.isDestroyed() || senderWindow !== live2dWindow) {
    return
  }

  senderWindow.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined)
}

function getFullWindowShapeRect(senderWindow: BrowserWindow): WindowShapeRect[] {
  const bounds = senderWindow.getBounds()
  return [{ x: 0, y: 0, width: Math.max(bounds.width, 1), height: Math.max(bounds.height, 1) }]
}

function sanitizeWindowShapeRect(senderWindow: BrowserWindow, payload: unknown): WindowShapeRect | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const rect = payload as Partial<WindowShapeRect>
  if (
    typeof rect.x !== 'number'
    || typeof rect.y !== 'number'
    || typeof rect.width !== 'number'
    || typeof rect.height !== 'number'
  ) {
    return null
  }

  const bounds = senderWindow.getBounds()
  const left = clamp(Math.round(rect.x), 0, Math.max(bounds.width - 1, 0))
  const top = clamp(Math.round(rect.y), 0, Math.max(bounds.height - 1, 0))
  const right = clamp(Math.round(rect.x + rect.width), 0, bounds.width)
  const bottom = clamp(Math.round(rect.y + rect.height), 0, bounds.height)

  if (right <= left || bottom <= top) {
    return null
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }
}

function setOverlayWindowShape(senderWindow: BrowserWindow | null, rectPayload: unknown) {
  if (!senderWindow || senderWindow.isDestroyed() || senderWindow !== live2dWindow || typeof senderWindow.setShape !== 'function') {
    return
  }

  const shapeRects = Array.isArray(rectPayload)
    ? rectPayload
      .map(item => sanitizeWindowShapeRect(senderWindow, item))
      .filter((item): item is WindowShapeRect => Boolean(item))
    : []

  senderWindow.setShape(shapeRects.length > 0 ? shapeRects : getFullWindowShapeRect(senderWindow))
}

// Live2D 模型视线仍然需要全局光标，主进程持续广播可避免异形窗口区域造成的事件缺口。
function getLive2DCursorPointPayload(win: BrowserWindow): Live2DCursorPoint {
  const bounds = win.getBounds()
  const cursorPoint = screen.getCursorScreenPoint()
  const localX = cursorPoint.x - bounds.x
  const localY = cursorPoint.y - bounds.y

  return {
    screenX: cursorPoint.x,
    screenY: cursorPoint.y,
    localX,
    localY,
    insideWindow: localX >= 0 && localX <= bounds.width && localY >= 0 && localY <= bounds.height
  }
}

function pushLive2DCursorPoint(force = false) {
  if (!live2dWindow || live2dWindow.isDestroyed() || live2dWindow.webContents.isDestroyed()) {
    return
  }

  const payload = getLive2DCursorPointPayload(live2dWindow)
  const nextKey = `${payload.screenX}:${payload.screenY}:${payload.localX}:${payload.localY}:${payload.insideWindow}`
  if (!force && nextKey === lastLive2DCursorKey) {
    return
  }

  lastLive2DCursorKey = nextKey
  live2dWindow.webContents.send('live2d:cursorPoint', payload)
}

function stopLive2DCursorBroadcast() {
  if (live2dCursorTimer !== null) {
    clearInterval(live2dCursorTimer)
    live2dCursorTimer = null
  }

  lastLive2DCursorKey = ''
}

// 只有悬浮窗启用时才维持广播，避免无意义 IPC 抖动。
function syncLive2DCursorBroadcast() {
  const shouldBroadcast = !!live2dWindow
    && !live2dWindow.isDestroyed()
    && !live2dWindow.webContents.isDestroyed()
    && currentSettings.live2dEnabled

  if (!shouldBroadcast) {
    stopLive2DCursorBroadcast()
    return
  }

  if (live2dCursorTimer !== null) {
    pushLive2DCursorPoint()
    return
  }

  pushLive2DCursorPoint(true)
  live2dCursorTimer = setInterval(() => {
    pushLive2DCursorPoint()
  }, LIVE2D_CURSOR_BROADCAST_INTERVAL)
}

function createTray() {
  if (tray) {
    return tray
  }

  const iconPath = getWindowIconPath()
  const trayIcon = iconPath
    ? nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    : nativeImage.createEmpty()

  tray = new Tray(trayIcon)
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
  tray.on('right-click', () => {
    refreshTrayMenu()
    tray?.popUpContextMenu()
  })
  refreshTrayMenu()
  return tray
}

function getOwnerWindow() {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? live2dWindow
}

function isLive2DDiagnosticMode() {
  return IS_LIVE2D_DIAGNOSTIC_MODE
}

function isTTSDiagnosticMode() {
  return IS_TTS_DIAGNOSTIC_MODE
}

function formatDiagnosticValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeDiagnosticAssetPath(assetPath: string) {
  return assetPath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function isAllowedDiagnosticAssetPath(value: unknown) {
  return typeof value === 'string'
    && !/^https?:\/\//i.test(value)
    && !/^data:/i.test(value)
    && !value.startsWith('/')
    && /\.(?:moc|moc3|json|png|jpg|jpeg|webp|gif|bmp|tga|mtn|motion3\.json|exp3\.json|exp\.json|physics3\.json|physics\.json|pose3\.json|pose\.json|cdi3\.json|userdata3\.json|wav|mp3|ogg)$/i.test(value)
}

const DIAGNOSTIC_ASSET_VALUE_KEYS = new Set([
  'model',
  'moc',
  'moc3',
  'file',
  'physics',
  'physics3',
  'pose',
  'pose3',
  'displayinfo',
  'displayinfo3',
  'userdata',
  'userdata3',
  'sound'
])

const DIAGNOSTIC_ASSET_ARRAY_KEYS = new Set(['textures'])

function shouldCollectDiagnosticAssetPath(key: string, value: unknown) {
  return typeof value === 'string'
    && (DIAGNOSTIC_ASSET_VALUE_KEYS.has(key) || DIAGNOSTIC_ASSET_ARRAY_KEYS.has(key))
    && isAllowedDiagnosticAssetPath(value)
}

function collectDiagnosticAssetPaths(payload: unknown, bucket = new Set<string>(), parentKey = '') {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === 'string') {
        if (DIAGNOSTIC_ASSET_ARRAY_KEYS.has(parentKey) && isAllowedDiagnosticAssetPath(item)) {
          bucket.add(normalizeDiagnosticAssetPath(item))
        }
        continue
      }

      collectDiagnosticAssetPaths(item, bucket, parentKey)
    }
    return bucket
  }

  if (payload && typeof payload === 'object') {
    for (const [rawKey, value] of Object.entries(payload)) {
      const key = rawKey.trim().toLowerCase()
      if (shouldCollectDiagnosticAssetPath(key, value)) {
        bucket.add(normalizeDiagnosticAssetPath(value))
        continue
      }

      collectDiagnosticAssetPaths(value, bucket, key)
    }
  }

  return bucket
}

async function inspectDiagnosticAsset(targetUrl: string, assetPath: string) {
  const assetUrl = new URL(assetPath, targetUrl).toString()

  try {
    const response = await net.fetch(assetUrl)
    return {
      assetPath,
      assetUrl,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || ''
    }
  } catch (error) {
    return {
      assetPath,
      assetUrl,
      ok: false,
      error: (error as Error)?.message ?? String(error)
    }
  }
}

async function inspectDiagnosticModel(target: { label: string; url: string }) {
  try {
    const response = await net.fetch(target.url)
    const text = await response.text()
    if (!response.ok) {
      return {
        label: target.label,
        url: target.url,
        ok: false,
        status: response.status,
        statusText: response.statusText,
        textPreview: text.slice(0, 200)
      }
    }

    let parsedModel: unknown
    try {
      parsedModel = JSON.parse(text)
    } catch (error) {
      return {
        label: target.label,
        url: target.url,
        ok: false,
        error: '模型 JSON 解析失败',
        detail: (error as Error)?.message ?? String(error),
        textPreview: text.slice(0, 200)
      }
    }

    const allAssetPaths = Array.from(collectDiagnosticAssetPaths(parsedModel))
    const sampledAssets = await Promise.all(allAssetPaths.slice(0, 10).map(assetPath => inspectDiagnosticAsset(target.url, assetPath)))

    return {
      label: target.label,
      url: target.url,
      ok: true,
      textLength: text.length,
      assetCount: allAssetPaths.length,
      sampledAssets
    }
  } catch (error) {
    return {
      label: target.label,
      url: target.url,
      ok: false,
      error: (error as Error)?.message ?? String(error)
    }
  }
}

async function runLive2DDiagnostics() {
  appendLive2DDebugLog('diagnose', `start packaged=${app.isPackaged} exec=${process.execPath}`)
  appendLive2DDebugLog('diagnose', `argv=${process.argv.join(' | ')}`)
  appendLive2DDebugLog('diagnose', `currentModel=${currentSettings.live2dModel} source=${currentSettings.live2dModelSource} name=${currentSettings.live2dModelName}`)

  const targets = [
    { label: 'bundled-default', url: LIVE2D_BUNDLED_MODEL },
    { label: 'current-model', url: currentSettings.live2dModel }
  ].filter((target, index, list) => target.url && list.findIndex(item => item.url === target.url) === index)

  try {
    const result = {
      env: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
      },
      targets: [] as Array<{ ok: boolean; sampledAssets?: Array<{ ok: boolean }> }>
    }

    appendLive2DDebugLog('diagnose', `env=${formatDiagnosticValue(result.env)}`)
    for (const target of targets) {
      result.targets.push(await inspectDiagnosticModel(target))
    }

    for (const target of result.targets) {
      appendLive2DDebugLog('diagnose', formatDiagnosticValue(target))
    }

    const allTargetsPassed = result.targets.every(target => {
      if (!target.ok) {
        return false
      }

      return (target.sampledAssets ?? []).every(asset => asset.ok)
    })
    appendLive2DDebugLog('diagnose', `completed success=${allTargetsPassed}`)
    return allTargetsPassed
  } catch (error) {
    appendLive2DDebugLog('diagnose', `failed ${(error as Error)?.message ?? String(error)}`)
    return false
  }
}

async function inspectTTSDiagnosticAsset(target: { label: string; url: string }) {
  try {
    const response = await net.fetch(target.url)
    const buffer = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0)

    return {
      label: target.label,
      url: target.url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || '',
      size: buffer.byteLength
    }
  } catch (error) {
    return {
      label: target.label,
      url: target.url,
      ok: false,
      error: (error as Error)?.message ?? String(error)
    }
  }
}

async function runTTSDiagnostics() {
  appendTTSDebugLog('diagnose', `start packaged=${app.isPackaged} exec=${process.execPath}`)
  appendTTSDebugLog('diagnose', `argv=${process.argv.join(' | ')}`)

  const assetTargets = [
    { label: 'runtime-espeak', url: 'openagent://app/assets/espeak-ng.wasm' },
    { label: 'runtime-ort-loader', url: 'openagent://app/assets/ort.bundle.min.mjs' },
    { label: 'runtime-ort-jsep-wasm', url: 'openagent://app/assets/ort-wasm-simd-threaded.jsep.wasm' },
    { label: 'kokoro-config', url: `openagent://app/models/${DEFAULT_TTS_MODEL_ID}/config.json` },
    { label: 'kokoro-tokenizer', url: `openagent://app/models/${DEFAULT_TTS_MODEL_ID}/tokenizer.json` },
    { label: 'kokoro-model', url: `openagent://app/models/${DEFAULT_TTS_MODEL_ID}/onnx/model_quantized.onnx` },
    { label: 'kokoro-voice-default', url: `openagent://app/voices/${DEFAULT_TTS_VOICE_ID}.bin` }
  ]

  try {
    const env = {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform
    }
    appendTTSDebugLog('diagnose', `env=${formatDiagnosticValue(env)}`)

    const assetResults = [] as Array<{ ok: boolean }>
    for (const target of assetTargets) {
      const result = await inspectTTSDiagnosticAsset(target)
      assetResults.push(result)
      appendTTSDebugLog('diagnose', formatDiagnosticValue(result))
    }

    const nativeVoices = await listNativeSystemVoices()
    const preferredVoice = nativeVoices.find(voice => /zh-cn/i.test(voice.locale || ''))
      || nativeVoices.find(voice => /zh/i.test(voice.locale || ''))
      || nativeVoices[0]
    const edgeVoices = await listEdgeNeuralVoices()

    const systemVoiceSummary = {
      count: nativeVoices.length,
      hasChineseVoice: nativeVoices.some(voice => /zh/i.test(voice.locale || '')),
      preview: nativeVoices.slice(0, 5)
    }
    appendTTSDebugLog('diagnose', `systemVoices=${formatDiagnosticValue(systemVoiceSummary)}`)

    const edgeVoiceSummary = {
      count: edgeVoices.length,
      hasChineseVoice: edgeVoices.some(voice => /zh/i.test(voice.Locale || '')),
      preview: edgeVoices.slice(0, 5)
    }
    appendTTSDebugLog('diagnose', `edgeVoices=${formatDiagnosticValue(edgeVoiceSummary)}`)

    const synthesis = await synthesizeNativeSystemSpeech({
      text: DEFAULT_TTS_SAMPLE_TEXT,
      engine: SYSTEM_TTS_ENGINE,
      modelId: SYSTEM_TTS_MODEL_ID,
      voiceId: preferredVoice?.id || '',
      speed: 1
    })

    const synthesisSummary = {
      success: synthesis.success,
      voiceId: synthesis.voiceId,
      voiceName: synthesis.voiceName,
      sampleRate: synthesis.sampleRate,
      durationMs: synthesis.durationMs,
      audioBytes: synthesis.audioBase64 ? Buffer.byteLength(synthesis.audioBase64, 'base64') : 0,
      error: synthesis.error
    }
    appendTTSDebugLog('diagnose', `synthesis=${formatDiagnosticValue(synthesisSummary)}`)

    const edgeSynthesis = await synthesizeEdgeSpeech({
      text: DEFAULT_TTS_SAMPLE_TEXT,
      engine: EDGE_TTS_ENGINE,
      modelId: EDGE_TTS_MODEL_ID,
      voiceId: EDGE_TTS_VOICE_ID,
      emotionStyle: 'assistant',
      emotionIntensity: 1.1,
      speed: 1
    })

    const edgeSynthesisSummary = {
      success: edgeSynthesis.success,
      voiceId: edgeSynthesis.voiceId,
      voiceName: edgeSynthesis.voiceName,
      sampleRate: edgeSynthesis.sampleRate,
      audioBytes: edgeSynthesis.audioBase64 ? Buffer.byteLength(edgeSynthesis.audioBase64, 'base64') : 0,
      error: edgeSynthesis.error
    }
    appendTTSDebugLog('diagnose', `edgeSynthesis=${formatDiagnosticValue(edgeSynthesisSummary)}`)

    const assetCheckPassed = assetResults.every(result => result.ok)
    const synthesisCheckPassed = synthesis.success && Boolean(synthesis.audioBase64)
    const edgeCheckPassed = edgeVoices.length > 0 && edgeSynthesis.success && Boolean(edgeSynthesis.audioBase64)
    const allChecksPassed = assetCheckPassed && nativeVoices.length > 0 && synthesisCheckPassed && edgeCheckPassed

    appendTTSDebugLog('diagnose', `completed success=${allChecksPassed}`)
    return allChecksPassed
  } catch (error) {
    appendTTSDebugLog('diagnose', `failed ${(error as Error)?.message ?? String(error)}`)
    return false
  }
}

app.on('second-instance', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  isQuittingApp = true
  stopLive2DCursorBroadcast()
  for (const sessionId of [...ideTerminalProcesses.keys()]) {
    stopIdeTerminalSession(sessionId)
  }
  void sub2ApiRuntimeManager.shutdown()
})

app.whenReady().then(() => {
  ensureDataDir()
  currentSettings = loadSettingsFromDisk()
  setLive2DStorageDirResolver(() => currentSettings.live2dStoragePath)
  ensureLive2DDirs()
  setLive2DDebugLogger(message => appendLive2DDebugLog('protocol', message))
  registerLive2DProtocol()
  registerRuntimeAssetProtocol()
  registerAzureTTSHandlers(() => currentSettings)
  registerEdgeTTSHandlers()
  registerSystemTTSHandlers()

  if (isLive2DDiagnosticMode()) {
    void runLive2DDiagnostics().then(success => {
      app.exit(success ? 0 : 1)
    })
    return
  }

  if (isTTSDiagnosticMode()) {
    void runTTSDiagnostics().then(success => {
      app.exit(success ? 0 : 1)
    })
    return
  }

  createTray()
  mainWindow = createMainWindow()
  registerLive2DHandlers(() => mainWindow)
  applyLaunchAtLoginSetting()
  syncLive2DWindowVisibility()

  const persistedSub2ApiPreference = loadPersistedSub2ApiRuntimePreference()
  void sub2ApiRuntimeManager.getRuntimeState(persistedSub2ApiPreference.desktopRuntime, persistedSub2ApiPreference.desktopManaged)
  if (persistedSub2ApiPreference.gatewayMode === 'desktop' && persistedSub2ApiPreference.desktopRuntime?.autoStart) {
    void sub2ApiRuntimeManager.startRuntime(persistedSub2ApiPreference.desktopRuntime, persistedSub2ApiPreference.desktopManaged)
  }

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) {
      return
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:startDrag', (event, payload: unknown) => {
    startWindowDrag(BrowserWindow.fromWebContents(event.sender), sanitizeDragPoint(payload))
  })
  ipcMain.on('window:updateDrag', (event, payload: unknown) => {
    updateWindowDragPosition(BrowserWindow.fromWebContents(event.sender), sanitizeDragPoint(payload))
  })
  ipcMain.on('window:endDrag', (event) => {
    endWindowDrag(BrowserWindow.fromWebContents(event.sender))
  })
  ipcMain.on('window:setShapeRects', (event, rects: unknown) => {
    setOverlayWindowShape(BrowserWindow.fromWebContents(event.sender), rects)
  })
  ipcMain.on('window:setIgnoreMouseEvents', (event, ignore: boolean) => {
    setOverlayIgnoreMouseEvents(BrowserWindow.fromWebContents(event.sender), Boolean(ignore))
  })
  ipcMain.on('window:close', () => {
    if (mainWindow) {
      if (currentSettings.closeToTray) {
        hideMainWindow()
        showTrayHintOnce()
      } else {
        mainWindow.close()
      }
    }
  })
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.on('app:showMainWindow', showMainWindow)
  ipcMain.on('app:navigateMainWindow', (_event, hashPath: unknown) => {
    void navigateMainWindow(typeof hashPath === 'string' ? hashPath : '')
  })
  ipcMain.on('app:hideMainWindow', hideMainWindow)
  ipcMain.on('app:toggleMainWindow', toggleMainWindow)
  ipcMain.on('app:showAIOverlayWindow', showAIOverlayWindow)
  ipcMain.on('app:hideAIOverlayWindow', hideAIOverlayWindow)
  ipcMain.on('app:closeAIOverlayWindow', closeAIOverlayWindow)
  ipcMain.on('app:toggleAIOverlayWindow', toggleAIOverlayWindow)
  ipcMain.on('app:showLive2DWindow', showLive2DWindow)
  ipcMain.on('app:hideLive2DWindow', hideLive2DWindow)
  ipcMain.on('app:toggleLive2DWindow', toggleLive2DWindow)
  ipcMain.on('live2d:mouthState', (_event, payload: unknown) => {
    const nextState = sanitizeLive2DMouthState(payload)
    if (!nextState) {
      return
    }

    broadcastLive2DMouthState(nextState)
  })

  ipcMain.handle('store:get', (_event, key: string) => {
    const filePath = getDataFilePath(key)
    if (!existsSync(filePath)) {
      return null
    }

    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  })

  ipcMain.handle('store:set', (_event, key: string, data: unknown) => {
    const safeKey = getSafeKey(key)
    if (safeKey === 'settings') {
      updateSettings(data as Partial<AppSettings>)
      return true
    }

    writeJsonFile(safeKey, data)
    broadcastStoreChanged(safeKey, data)
    return true
  })

  ipcMain.handle('dialog:exportJson', async (_event, defaultName: string, data: unknown) => {
    const ownerWindow = getOwnerWindow() ?? undefined
    const dialogOptions = {
      title: '导出数据',
      defaultPath: defaultName,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    }
    const result = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return true
    }
    return false
  })

  ipcMain.handle('dialog:importJson', async () => {
    const ownerWindow = getOwnerWindow() ?? undefined
    const dialogOptions: OpenDialogOptions = {
      title: '导入数据',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile']
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (!result.canceled && result.filePaths.length > 0) {
      const raw = readFileSync(result.filePaths[0], 'utf-8')
      return JSON.parse(raw)
    }
    return null
  })

  ipcMain.handle('dialog:chooseDirectory', async (_event, title: string, defaultPath?: string) => {
    const ownerWindow = getOwnerWindow() ?? undefined
    const dialogOptions: OpenDialogOptions = {
      title,
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('dialog:chooseFile', async (_event, payload?: { title?: string; defaultPath?: string; filters?: FileFilter[] }) => {
    const ownerWindow = getOwnerWindow() ?? undefined
    const dialogOptions: OpenDialogOptions = {
      title: typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : '选择文件',
      defaultPath: typeof payload?.defaultPath === 'string' && payload.defaultPath.trim() ? payload.defaultPath.trim() : undefined,
      filters: sanitizeDialogFilters(payload?.filters),
      properties: ['openFile']
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('file:readImageAsDataUrl', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return null
    }

    const normalizedPath = filePath.trim()
    if (!existsSync(normalizedPath)) {
      return null
    }

    const mimeType = resolveImageMimeType(normalizedPath)
    if (!mimeType) {
      return null
    }

    const fileStat = statSync(normalizedPath)
    if (!fileStat.isFile() || fileStat.size > 8 * 1024 * 1024) {
      return null
    }

    const buffer = readFileSync(normalizedPath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  ipcMain.on('shell:openExternal', (_event, url: string) => {
    if (/^(https?:\/\/|mailto:)/i.test(url)) {
      void shell.openExternal(url)
    }
  })

  ipcMain.handle('shell:openPath', async (_event, targetPath: unknown) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      return false
    }

    const normalizedPath = normalize(targetPath.trim())
    if (!existsSync(normalizedPath)) {
      return false
    }

    const result = await shell.openPath(normalizedPath)
    return result === ''
  })

  // IDE 文件系统操作（路径遍历防护：规范化后拒绝 '..' 段）
  function sanitizeIdePath(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw.trim()) return null
    const p = normalize(raw.trim())
    if (p.includes('..')) return null
    return p
  }

  ipcMain.handle('ide:readFile', (_event, filePath: unknown, encoding: unknown) => {
    const p = sanitizeIdePath(filePath)
    if (!p || !existsSync(p)) return null
    try {
      const fileStat = statSync(p)
      if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) return null
      return readFileSync(p, (typeof encoding === 'string' ? encoding : 'utf-8') as BufferEncoding)
    } catch {
      return null
    }
  })

  ipcMain.handle('ide:writeFile', (_event, filePath: unknown, content: unknown, encoding: unknown) => {
    const p = sanitizeIdePath(filePath)
    if (!p || typeof content !== 'string') return false
    // 写入大小限制 50MB
    if (content.length > 50 * 1024 * 1024) return false
    try {
      ensureDirectoryExists(dirname(p))
      writeFileSync(p, content, (typeof encoding === 'string' ? encoding : 'utf-8') as BufferEncoding)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ide:createDirectory', (_event, dirPath: unknown) => {
    const p = sanitizeIdePath(dirPath)
    if (!p) return false
    try {
      ensureDirectoryExists(p)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ide:listDirectory', (_event, dirPath: unknown) => {
    const p = sanitizeIdePath(dirPath)
    if (!p || !existsSync(p)) return null
    try {
      const entries = readdirSync(p, { withFileTypes: true })
      return entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
    } catch {
      return null
    }
  })

  ipcMain.handle('ide:fileExists', (_event, filePath: unknown) => {
    const p = sanitizeIdePath(filePath)
    if (!p) return false
    return existsSync(p)
  })

  ipcMain.handle('ide:fileStat', (_event, filePath: unknown) => {
    const p = sanitizeIdePath(filePath)
    if (!p || !existsSync(p)) return null
    try {
      const stat = statSync(p)
      return { size: stat.size, isFile: stat.isFile(), isDirectory: stat.isDirectory(), modifiedAt: stat.mtimeMs }
    } catch {
      return null
    }
  })

  ipcMain.handle('ide:renameEntry', (_event, fromPath: unknown, toPath: unknown) => {
    const from = sanitizeIdePath(fromPath)
    const to = sanitizeIdePath(toPath)
    if (!from || !to || !existsSync(from) || existsSync(to) || from === to) {
      return false
    }

    try {
      ensureDirectoryExists(dirname(to))
      renameSync(from, to)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ide:copyEntry', (_event, fromPath: unknown, toPath: unknown) => {
    const from = sanitizeIdePath(fromPath)
    const to = sanitizeIdePath(toPath)
    if (!from || !to || !existsSync(from) || existsSync(to) || from === to) {
      return false
    }

    try {
      const sourceStat = statSync(from)
      if (sourceStat.isDirectory() && isNestedDirectory(from, to)) {
        return false
      }

      ensureDirectoryExists(dirname(to))
      cpSync(from, to, {
        recursive: sourceStat.isDirectory(),
        force: false,
        errorOnExist: true,
      })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ide:deleteEntry', (_event, entryPath: unknown) => {
    const p = sanitizeIdePath(entryPath)
    if (!p || !existsSync(p)) {
      return false
    }

    try {
      const targetStat = statSync(p)
      if (targetStat.isDirectory()) {
        rmSync(p, { recursive: true, force: false })
      } else {
        rmSync(p, { force: false })
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('ide:createTerminalSession', async (event, payload?: Partial<IDETerminalSessionCreateRequest>) => {
    ensureIdeTerminalOwnerCleanup(event.sender)

    const cwd = assertValidIdeWorkingDirectory(sanitizeIdePath(payload?.cwd))
    const launch = buildIdeInteractiveShell()
    const env = {
      ...process.env,
      FORCE_COLOR: '0',
      npm_config_color: 'false'
    }
    const ptySpawn = await getNodePtySpawn()
    const ownerSessions = ideTerminalOwnerSessions.get(event.sender.id)
    const ownerSessionCount = ownerSessions instanceof Set ? ownerSessions.size : 0
    const normalizedTitle = typeof payload?.title === 'string' && payload.title.trim()
      ? payload.title.trim().slice(0, 80)
      : `Terminal ${ownerSessionCount + 1}`

    let entry: ReturnType<typeof createIdeTerminalEntry>
    let shellLabel = launch.shell

    if (ptySpawn) {
      const pty = ptySpawn(launch.file, launch.args, {
        name: process.platform === 'win32' ? 'xterm-color' : 'xterm-256color',
        cwd,
        env,
        cols: 120,
        rows: 30
      })
      shellLabel = `${launch.shell} · PTY`
      entry = createIdeTerminalEntry(event.sender, { pty }, {
        command: normalizedTitle,
        title: normalizedTitle,
        cwd,
        mode: 'shell',
        shell: shellLabel
      })
    } else {
      const child = spawn(launch.file, launch.args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      if (!child.stdin || !child.stdout || !child.stderr) {
        throw new Error(nodePtyLoadError ? `交互式终端初始化失败：${nodePtyLoadError}` : '交互式终端初始化失败')
      }

      child.stdin.setDefaultEncoding('utf8')
      shellLabel = `${launch.shell} · Pipe`
      entry = createIdeTerminalEntry(event.sender, { child }, {
        command: normalizedTitle,
        title: normalizedTitle,
        cwd,
        mode: 'shell',
        shell: shellLabel
      })
    }

    const result: IDETerminalSessionInfo = {
      sessionId: entry.sessionId,
      cwd: entry.cwd,
      title: entry.title,
      mode: entry.mode,
      shell: entry.shell,
      startedAt: entry.startedAt
    }

    return result
  })

  ipcMain.handle('ide:writeTerminalInput', (event, payload?: Partial<IDETerminalInputRequest>) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    const input = typeof payload?.input === 'string' ? payload.input : ''
    if (!sessionId || !input || Buffer.byteLength(input, 'utf-8') > 8192) {
      return false
    }

    const entry = ideTerminalProcesses.get(sessionId)
    if (!entry || entry.owner.id !== event.sender.id || entry.mode !== 'shell') {
      return false
    }

    if (entry.pty) {
      entry.pty.write(input)
      return true
    }

    if (!entry.child?.stdin || entry.child.stdin.destroyed) {
      return false
    }

    entry.child.stdin.write(input)
    return true
  })

  ipcMain.handle('ide:resizeTerminalSession', (event, payload?: Partial<IDETerminalResizeRequest>) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    const rawCols = typeof payload?.cols === 'number' && Number.isFinite(payload.cols) ? payload.cols : 0
    const rawRows = typeof payload?.rows === 'number' && Number.isFinite(payload.rows) ? payload.rows : 0
    const cols = Math.max(20, Math.min(400, Math.floor(rawCols)))
    const rows = Math.max(8, Math.min(200, Math.floor(rawRows)))
    if (!sessionId || !cols || !rows) {
      return false
    }

    const entry = ideTerminalProcesses.get(sessionId)
    if (!entry || entry.owner.id !== event.sender.id || entry.mode !== 'shell') {
      return false
    }

    return resizeIdeTerminalSession(sessionId, cols, rows)
  })

  ipcMain.handle('ide:closeTerminalSession', (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return false
    }

    const entry = ideTerminalProcesses.get(sessionId)
    if (!entry || entry.owner.id !== event.sender.id || entry.mode !== 'shell') {
      return false
    }

    return stopIdeTerminalSession(sessionId)
  })

  ipcMain.handle('ide:interruptTerminalSession', (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return false
    }

    const entry = ideTerminalProcesses.get(sessionId)
    if (!entry || entry.owner.id !== event.sender.id || entry.mode !== 'shell') {
      return false
    }

    return interruptIdeTerminalSession(sessionId)
  })

  ipcMain.handle('ide:runCommand', (event, payload?: Partial<IDETerminalRunRequest>) => {
    ensureIdeTerminalOwnerCleanup(event.sender)

    const command = typeof payload?.command === 'string' ? payload.command.trim() : ''
    const cwd = sanitizeIdePath(payload?.cwd)

    if (!command || Buffer.byteLength(command, 'utf-8') > 4096) {
      throw new Error('终端命令不能为空，且长度不能超过 4096 字节')
    }

    if (!cwd || !existsSync(cwd)) {
      throw new Error('终端工作目录无效或不存在')
    }

    const cwdStat = statSync(cwd)
    if (!cwdStat.isDirectory()) {
      throw new Error('终端工作目录不是有效文件夹')
    }

    const launch = buildIdeShellCommand(command)
    const child = spawn(launch.file, launch.args, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        npm_config_color: 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    if (!child.stdout || !child.stderr) {
      throw new Error('终端命令输出管道初始化失败')
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    const startedAt = Date.now()
    const sessionId = randomUUID()
    const entry = {
      sessionId,
      owner: event.sender,
      command,
      title: command,
      cwd,
      mode: 'command' as const,
      shell: launch.shell,
      startedAt,
      child,
      cancelRequested: false
    }

    ideTerminalProcesses.set(sessionId, entry)
    trackIdeTerminalSession(event.sender.id, sessionId)

    let finalized = false
    const finalize = (payload: Omit<IDETerminalEvent, 'sessionId' | 'command' | 'cwd'>) => {
      if (finalized) {
        return
      }

      finalized = true
      emitIdeTerminalEvent(entry, payload)
      cleanupIdeTerminalSession(sessionId)
    }

    emitIdeTerminalEvent(entry, {
      type: 'start',
      timestamp: startedAt,
      status: 'running'
    })

    child.stdout.on('data', (chunk: string) => {
      if (!chunk) {
        return
      }

      emitIdeTerminalEvent(entry, {
        type: 'data',
        timestamp: Date.now(),
        stream: 'stdout',
        chunk
      })
    })

    child.stderr.on('data', (chunk: string) => {
      if (!chunk) {
        return
      }

      emitIdeTerminalEvent(entry, {
        type: 'data',
        timestamp: Date.now(),
        stream: 'stderr',
        chunk
      })
    })

    child.on('error', error => {
      finalize({
        type: 'error',
        timestamp: Date.now(),
        status: entry.cancelRequested ? 'cancelled' : 'failed',
        error: error.message
      })
    })

    child.on('close', (exitCode, signal) => {
      finalize({
        type: 'exit',
        timestamp: Date.now(),
        status: entry.cancelRequested ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed',
        exitCode,
        signal: signal ?? null
      })
    })

    const result: IDETerminalRunResult = {
      sessionId,
      command,
      cwd,
      startedAt
    }

    return result
  })

  ipcMain.handle('ide:cancelCommand', (event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return false
    }

    const entry = ideTerminalProcesses.get(sessionId)
    if (!entry || entry.owner.id !== event.sender.id) {
      return false
    }

    return stopIdeTerminalSession(sessionId)
  })

  ipcMain.handle('app:getDataPath', () => getDataDir())
  ipcMain.handle('app:getRuntimeDataStorageInfo', () => buildRuntimeDataStorageInfo())
  ipcMain.handle('app:switchRuntimeDataStorage', (_event, payload?: { mode?: RuntimeDataStorageMode; targetPath?: string }) => {
    const nextMode = payload?.mode === 'custom' ? 'custom' : 'auto'
    return switchRuntimeDataStorage(nextMode, payload?.targetPath)
  })
  ipcMain.handle('sub2api:getRuntimeState', (_event, payload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>) => {
    return sub2ApiRuntimeManager.getRuntimeState(sanitizeSub2ApiRuntimePayload(payload), sanitizeSub2ApiManagedPayload(managedPayload))
  })
  ipcMain.handle('sub2api:startRuntime', (_event, payload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>) => {
    return sub2ApiRuntimeManager.startRuntime(sanitizeSub2ApiRuntimePayload(payload), sanitizeSub2ApiManagedPayload(managedPayload))
  })
  ipcMain.handle('sub2api:stopRuntime', () => {
    return sub2ApiRuntimeManager.stopRuntime()
  })
  ipcMain.handle('sub2api:restartRuntime', (_event, payload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>) => {
    return sub2ApiRuntimeManager.restartRuntime(sanitizeSub2ApiRuntimePayload(payload), sanitizeSub2ApiManagedPayload(managedPayload))
  })
  ipcMain.handle('sub2api:inspectSetup', (_event, payload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>) => {
    return sub2ApiRuntimeManager.inspectSetup(sanitizeSub2ApiRuntimePayload(payload), sanitizeSub2ApiManagedPayload(managedPayload))
  })
  ipcMain.handle('sub2api:testSetupDatabase', (_event, payload?: Partial<Sub2ApiSetupDatabaseConfig>, runtimePayload?: Partial<Sub2ApiDesktopRuntimeConfig>) => {
    const sanitizedPayload = sanitizeSub2ApiSetupDatabasePayload(payload)
    if (!sanitizedPayload) {
      throw new Error('PostgreSQL 测试参数无效')
    }

    return sub2ApiRuntimeManager.testSetupDatabase(sanitizedPayload, sanitizeSub2ApiRuntimePayload(runtimePayload))
  })
  ipcMain.handle('sub2api:testSetupRedis', (_event, payload?: Partial<Sub2ApiSetupRedisConfig>, runtimePayload?: Partial<Sub2ApiDesktopRuntimeConfig>) => {
    const sanitizedPayload = sanitizeSub2ApiSetupRedisPayload(payload)
    if (!sanitizedPayload) {
      throw new Error('Redis 测试参数无效')
    }

    return sub2ApiRuntimeManager.testSetupRedis(sanitizedPayload, sanitizeSub2ApiRuntimePayload(runtimePayload))
  })
  ipcMain.handle('sub2api:installSetup', (_event, payload?: Partial<Sub2ApiDesktopSetupProfile>, runtimePayload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>) => {
    const sanitizedPayload = sanitizeSub2ApiSetupProfilePayload(payload)
    if (!sanitizedPayload) {
      throw new Error('Sub2API 初始化参数无效')
    }

    return sub2ApiRuntimeManager.installSetup(sanitizedPayload, sanitizeSub2ApiRuntimePayload(runtimePayload), sanitizeSub2ApiManagedPayload(managedPayload))
  })
  ipcMain.handle('sub2api:ensureDesktopAccess', (_event, runtimePayload?: Partial<Sub2ApiDesktopRuntimeConfig>, managedPayload?: Partial<Sub2ApiDesktopManagedConfig>, currentApiKey?: string) => {
    return sub2ApiRuntimeManager.ensureDesktopAccess(
      sanitizeSub2ApiRuntimePayload(runtimePayload),
      sanitizeSub2ApiManagedPayload(managedPayload),
      typeof currentApiKey === 'string' ? currentApiKey : undefined
    )
  })

  // ==================== MCP 工具 IPC 处理 ====================
  ipcMain.handle('mcp:executeCommand', async (_event, command: string) => {
    if (typeof command !== 'string' || command.length > 5000) {
      return { success: false, output: '', error: '命令无效或过长' }
    }
    return executeCommand(command)
  })

  ipcMain.handle('mcp:captureScreen', async (_event, payload?: { region?: 'full' | 'active' | 'window'; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => {
    return captureScreen(payload)
  })

  ipcMain.handle('mcp:mouseClick', async (_event, x: number, y: number, button: string, clickType: string) => {
    if (typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, output: '', error: '坐标无效' }
    }
    return mouseClick(x, y, button, clickType)
  })

  ipcMain.handle('mcp:keyboardInput', async (_event, payload?: { text?: string; keys?: string; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => {
    return keyboardInput(payload)
  })

  ipcMain.handle('mcp:listWindows', async () => {
    return listWindows()
  })

  ipcMain.handle('mcp:focusWindow', async (_event, payload?: { id?: number; windowHandle?: string; title?: string; processName?: string }) => {
    return focusWindow(payload)
  })

  ipcMain.handle('mcp:inspectManagedServer', async (_event, payload?: { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string }) => {
    return inspectManagedMcpServer({
      command: typeof payload?.command === 'string' ? payload.command : '',
      args: Array.isArray(payload?.args) ? payload?.args : [],
      env: payload?.env,
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : undefined
    })
  })

  ipcMain.handle('mcp:callManagedTool', async (_event, payload?: { command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; toolName?: string; arguments?: Record<string, unknown> }) => {
    return callManagedMcpTool({
      command: typeof payload?.command === 'string' ? payload.command : '',
      args: Array.isArray(payload?.args) ? payload?.args : [],
      env: payload?.env,
      cwd: typeof payload?.cwd === 'string' ? payload.cwd : undefined,
      toolName: typeof payload?.toolName === 'string' ? payload.toolName : '',
      arguments: payload?.arguments && typeof payload.arguments === 'object' && !Array.isArray(payload.arguments) ? payload.arguments : {}
    })
  })

  ipcMain.handle('mcp:installManagedPackage', async (_event, payload?: { serverId?: string; packageName?: string; entryCommand?: string; args?: string[] }) => {
    return installManagedMcpPackage({
      serverId: typeof payload?.serverId === 'string' ? payload.serverId : '',
      packageName: typeof payload?.packageName === 'string' ? payload.packageName : '',
      entryCommand: typeof payload?.entryCommand === 'string' ? payload.entryCommand : undefined,
      args: Array.isArray(payload?.args) ? payload.args : []
    })
  })

  app.on('activate', () => {
    showMainWindow()
    if (currentSettings.live2dEnabled) {
      syncLive2DWindowVisibility()
    }
  })
})

app.on('window-all-closed', () => {
  if (isQuittingApp) {
    return
  }

  if (!currentSettings.closeToTray && !currentSettings.live2dEnabled && process.platform !== 'darwin') {
    app.quit()
  }
})
