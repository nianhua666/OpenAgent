import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, screen, shell } from 'electron'
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, normalize, parse, relative } from 'path'
import { ensureLive2DDirs, listLive2DLibraryItems, migrateLive2DStorageData, registerLive2DHandlers, registerLive2DProtocol, setLive2DDebugLogger, setLive2DStorageDirResolver } from './live2d'
import { executeCommand, captureScreen, mouseClick, keyboardInput, listWindows, focusWindow } from './mcp'
import { callManagedMcpTool, inspectManagedMcpServer, installManagedMcpPackage } from './externalMcp'
import { DEFAULT_TTS_ENGINE, DEFAULT_TTS_MODEL_ID, DEFAULT_TTS_VOICE_ID, getTTSVoiceOption } from '../src/utils/ttsCatalog'

type Live2DModelSource = 'preset' | 'bundled' | 'imported' | 'custom'
type RuntimeDataStorageMode = 'auto' | 'custom'
type WindowDragPoint = { x: number; y: number }
type Live2DCursorPoint = {
  screenX: number
  screenY: number
  localX: number
  localY: number
  insideWindow: boolean
}

interface AppSettings {
  theme: 'sakura' | 'ocean' | 'twilight' | 'jade' | 'dark'
  sidebarCollapsed: boolean
  live2dEnabled: boolean
  live2dModel: string
  live2dModelName: string
  live2dModelSource: Live2DModelSource
  live2dStoragePath: string
  live2dPosition: { x: number; y: number }
  live2dScale: number
  closeToTray: boolean
  launchAtLogin: boolean
  language: string
  defaultPageSize: number
  autoSaveInterval: number
  currencySymbol: string
  windowsMcpEnabled: boolean
  ttsEnabled: boolean
  ttsEngine: typeof DEFAULT_TTS_ENGINE
  ttsAutoPlayLive2D: boolean
  ttsShowMainReplyButton: boolean
  ttsModelId: string
  ttsVoiceId: string
  ttsVoiceName: string
  ttsSpeed: number
  ttsVolume: number
}

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
const LIVE2D_WINDOW_MIN_WIDTH = 300
const LIVE2D_WINDOW_MIN_HEIGHT = 360
const LIVE2D_CURSOR_BROADCAST_INTERVAL = 16
const LIVE2D_BUNDLED_MODEL = 'live2d://bundle/shizuku/shizuku.model.json'
const LIVE2D_DIAGNOSTIC_ARG = '--live2d-diagnose'
const IS_LIVE2D_DIAGNOSTIC_MODE = process.argv.includes(LIVE2D_DIAGNOSTIC_ARG)
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
  ttsVoiceName: getTTSVoiceOption(DEFAULT_TTS_VOICE_ID, DEFAULT_TTS_MODEL_ID)?.name || '小贝',
  ttsSpeed: 1,
  ttsVolume: 0.92
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
let live2dWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuittingApp = false
let trayHintShown = false
let live2dMoveTimer: ReturnType<typeof setTimeout> | null = null
let live2dCursorTimer: ReturnType<typeof setInterval> | null = null
let lastLive2DCursorKey = ''
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS }
const activeWindowDrags = new Map<number, { startCursor: WindowDragPoint; startPosition: [number, number] }>()

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

function getDataFilePath(key: string) {
  return join(getDataDir(), `${getSafeKey(key)}.json`)
}

function ensureDataDir() {
  ensureDirectoryExists(getDataDir())
}

function normalizeSettings(saved: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  const isLegacyDesktopSettings = typeof saved?.closeToTray === 'undefined' && typeof saved?.launchAtLogin === 'undefined'
  const resolvedVoice = getTTSVoiceOption(merged.ttsVoiceId, merged.ttsModelId)

  if (typeof merged.live2dStoragePath !== 'string') {
    merged.live2dStoragePath = ''
  }

  if (merged.ttsEngine !== DEFAULT_TTS_ENGINE) {
    merged.ttsEngine = DEFAULT_TTS_ENGINE
  }

  merged.ttsEnabled = typeof merged.ttsEnabled === 'boolean' ? merged.ttsEnabled : DEFAULT_SETTINGS.ttsEnabled
  merged.ttsAutoPlayLive2D = typeof merged.ttsAutoPlayLive2D === 'boolean' ? merged.ttsAutoPlayLive2D : DEFAULT_SETTINGS.ttsAutoPlayLive2D
  merged.ttsShowMainReplyButton = typeof merged.ttsShowMainReplyButton === 'boolean' ? merged.ttsShowMainReplyButton : DEFAULT_SETTINGS.ttsShowMainReplyButton
  merged.ttsModelId = merged.ttsModelId?.trim() || DEFAULT_TTS_MODEL_ID
  merged.ttsVoiceId = merged.ttsVoiceId?.trim() || DEFAULT_TTS_VOICE_ID
  merged.ttsVoiceName = merged.ttsVoiceName?.trim() || resolvedVoice?.name || DEFAULT_SETTINGS.ttsVoiceName
  merged.ttsSpeed = Number.isFinite(merged.ttsSpeed) ? Math.min(Math.max(Number(merged.ttsSpeed), 0.7), 1.35) : DEFAULT_SETTINGS.ttsSpeed
  merged.ttsVolume = Number.isFinite(merged.ttsVolume) ? Math.min(Math.max(Number(merged.ttsVolume), 0), 1) : DEFAULT_SETTINGS.ttsVolume

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

function getRendererEntryPath() {
  return join(__dirname, '../dist/index.html')
}

async function loadRendererRoute(win: BrowserWindow, hashPath = '') {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    url.hash = hashPath ? `#${hashPath}` : ''
    await win.loadURL(url.toString())
    return
  }

  if (hashPath) {
    await win.loadFile(getRendererEntryPath(), { hash: hashPath })
    return
  }

  await win.loadFile(getRendererEntryPath())
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
  const normalizedScale = clamp(scale || DEFAULT_SETTINGS.live2dScale, 0.08, 0.3)
  return {
    width: Math.round(clamp(260 + normalizedScale * 880, LIVE2D_WINDOW_MIN_WIDTH, 520)),
    height: Math.round(clamp(300 + normalizedScale * 1040, LIVE2D_WINDOW_MIN_HEIGHT, 620))
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
  for (const win of [mainWindow, live2dWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:changed', currentSettings)
    }
  }
}

function broadcastStoreChanged(key: string, data: unknown) {
  for (const win of [mainWindow, live2dWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('store:changed', key, data)
    }
  }
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

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.once('ready-to-show', () => {
    if (currentSettings.live2dEnabled) {
      win.showInactive()
      syncLive2DCursorBroadcast()
    }
  })
  win.on('show', () => {
    refreshTrayMenu()
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

// 透明悬浮窗在穿透状态下拿不到窗口外鼠标移动，只能由主进程采样全局光标后再回推给渲染层。
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

app.on('second-instance', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  isQuittingApp = true
  stopLive2DCursorBroadcast()
})

app.whenReady().then(() => {
  ensureDataDir()
  currentSettings = loadSettingsFromDisk()
  setLive2DStorageDirResolver(() => currentSettings.live2dStoragePath)
  ensureLive2DDirs()
  setLive2DDebugLogger(message => appendLive2DDebugLog('protocol', message))
  registerLive2DProtocol()

  if (isLive2DDiagnosticMode()) {
    void runLive2DDiagnostics().then(success => {
      app.exit(success ? 0 : 1)
    })
    return
  }

  createTray()
  mainWindow = createMainWindow()
  registerLive2DHandlers(() => mainWindow)
  applyLaunchAtLoginSetting()
  syncLive2DWindowVisibility()

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
  ipcMain.on('app:showLive2DWindow', showLive2DWindow)
  ipcMain.on('app:hideLive2DWindow', hideLive2DWindow)
  ipcMain.on('app:toggleLive2DWindow', toggleLive2DWindow)

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

  ipcMain.handle('app:getDataPath', () => getDataDir())
  ipcMain.handle('app:getRuntimeDataStorageInfo', () => buildRuntimeDataStorageInfo())
  ipcMain.handle('app:switchRuntimeDataStorage', (_event, payload?: { mode?: RuntimeDataStorageMode; targetPath?: string }) => {
    const nextMode = payload?.mode === 'custom' ? 'custom' : 'auto'
    return switchRuntimeDataStorage(nextMode, payload?.targetPath)
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
