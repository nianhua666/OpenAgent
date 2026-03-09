import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { basename, dirname, join, normalize, relative, sep } from 'path'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'live2d',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

type Live2DModelSource = 'preset' | 'bundled' | 'imported' | 'custom'

interface Live2DLibraryItem {
  id: string
  name: string
  source: Live2DModelSource
  runtimePath: string
  modelFile: string
  localPath?: string
  referenceUrl?: string
  remoteUrl?: string
  updatedAt?: number
}

interface Live2DRemoteModelRequest {
  id?: string
  name: string
  url: string
  fallbackUrls?: string[]
  source: 'preset' | 'custom'
  referenceUrl?: string
}

interface Live2DModelMeta {
  id: string
  name: string
  source: Live2DModelSource
  modelFile: string
  referenceUrl?: string
  remoteUrl?: string
  updatedAt: number
}

const LIVE2D_META_FILE = 'account-manager.live2d.json'
let live2DProtocolRegistered = false
let live2DHandlersRegistered = false
let live2DDebugLogger: ((message: string) => void) | null = null
let live2DStorageDirResolver: (() => string | null | undefined) | null = null
const live2DRemoteCacheTasks = new Map<string, Promise<Live2DLibraryItem>>()

function logLive2DDebug(message: string) {
  try {
    live2DDebugLogger?.(message)
  } catch {
    // 避免调试日志影响业务流程
  }
}

function getDefaultLive2DStorageDir() {
  return join(app.getPath('userData'), 'live2d-models')
}

export function resolveLive2DStorageDir(customPath?: string | null) {
  const normalizedPath = customPath?.trim()
  return normalizedPath ? normalize(normalizedPath) : getDefaultLive2DStorageDir()
}

function getLive2DStorageDir() {
  return resolveLive2DStorageDir(live2DStorageDirResolver?.())
}

function getLive2DPresetDir() {
  return join(getLive2DStorageDir(), 'presets')
}

function getLive2DImportedDir() {
  return join(getLive2DStorageDir(), 'imported')
}

function getLive2DRemoteDir() {
  return join(getLive2DStorageDir(), 'remote')
}

function getBundledLive2DDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'live2d-models')
    : join(process.cwd(), 'build', 'live2d-models')
}

function ensureDir(dirPath: string) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

function normalizeAssetPath(assetPath: string) {
  const normalized = assetPath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.includes('..')) {
    throw new Error('模型资源包含越界路径，请使用资源位于同一目录树内的模型包。')
  }
  return normalized
}

function isAllowedAssetPath(value: string) {
  if (!value || /^https?:\/\//i.test(value) || /^data:/i.test(value) || value.startsWith('/')) {
    return false
  }

  return /\.(?:moc|moc3|json|png|jpg|jpeg|webp|gif|bmp|tga|mtn|motion3\.json|exp3\.json|exp\.json|physics3\.json|physics\.json|pose3\.json|pose\.json|cdi3\.json|userdata3\.json|wav|mp3|ogg)$/i.test(value)
}

const LIVE2D_ASSET_VALUE_KEYS = new Set([
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

const LIVE2D_ASSET_ARRAY_KEYS = new Set(['textures'])

function shouldCollectAssetPath(key: string, value: string) {
  return (LIVE2D_ASSET_VALUE_KEYS.has(key) || LIVE2D_ASSET_ARRAY_KEYS.has(key)) && isAllowedAssetPath(value)
}

function collectAssetPaths(payload: unknown, bucket = new Set<string>(), parentKey = '') {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === 'string') {
        if (LIVE2D_ASSET_ARRAY_KEYS.has(parentKey) && isAllowedAssetPath(item)) {
          bucket.add(normalizeAssetPath(item))
        }
        continue
      }

      collectAssetPaths(item, bucket, parentKey)
    }
    return bucket
  }

  if (payload && typeof payload === 'object') {
    for (const [rawKey, value] of Object.entries(payload)) {
      const key = rawKey.trim().toLowerCase()
      if (typeof value === 'string' && shouldCollectAssetPath(key, value)) {
        bucket.add(normalizeAssetPath(value))
        continue
      }

      collectAssetPaths(value, bucket, key)
    }
  }

  return bucket
}

function buildLive2DUrl(scope: 'storage' | 'bundle', relativePath: string) {
  const normalized = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')

  return `live2d://${scope}/${normalized}`
}

export function resolveLive2DRenderUrl(runtimePath: string) {
  const normalizedRuntimePath = runtimePath.trim()
  if (!normalizedRuntimePath) {
    return normalizedRuntimePath
  }

  if (/^(https?:\/\/|file:\/\/)/i.test(normalizedRuntimePath)) {
    return normalizedRuntimePath
  }

  if (!/^live2d:\/\//i.test(normalizedRuntimePath)) {
    return normalizedRuntimePath
  }

  const parsedUrl = new URL(normalizedRuntimePath)
  const baseDir = parsedUrl.hostname === 'bundle' ? getBundledLive2DDir() : getLive2DStorageDir()
  const relativePath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '')
  const targetPath = normalize(join(baseDir, relativePath))

  if (!isInsideRoot(baseDir, targetPath)) {
    throw new Error('Live2D 模型路径越界，无法解析。')
  }

  if (!existsSync(targetPath)) {
    throw new Error(`Live2D 模型文件不存在：${targetPath}`)
  }

  return pathToFileURL(targetPath).toString()
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const normalizedRoot = normalize(rootPath)
  const normalizedTarget = normalize(targetPath)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
}

function prettifyModelName(rawName: string) {
  return rawName
    .replace(/\.(model3?|json)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Live2D 模型'
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'live2d-model'
}

function readMeta(folderPath: string) {
  const metaPath = join(folderPath, LIVE2D_META_FILE)
  if (!existsSync(metaPath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as Live2DModelMeta
  } catch {
    return null
  }
}

function writeMeta(folderPath: string, meta: Live2DModelMeta) {
  writeFileSync(join(folderPath, LIVE2D_META_FILE), JSON.stringify(meta, null, 2), 'utf-8')
}

function findNearestMetaRoot(scopeRoot: string, modelPath: string) {
  let currentDir = dirname(modelPath)

  while (isInsideRoot(scopeRoot, currentDir)) {
    if (existsSync(join(currentDir, LIVE2D_META_FILE))) {
      return currentDir
    }

    if (normalize(currentDir) === normalize(scopeRoot)) {
      break
    }

    currentDir = dirname(currentDir)
  }

  return dirname(modelPath)
}

function inferSource(scope: 'storage' | 'bundle', relativePath: string) {
  if (scope === 'bundle') {
    return 'bundled'
  }
  if (relativePath.startsWith('presets/')) {
    return 'preset'
  }
  if (relativePath.startsWith('remote/')) {
    return 'custom'
  }
  return 'imported'
}

function buildModelItem(scope: 'storage' | 'bundle', scopeRoot: string, modelPath: string): Live2DLibraryItem {
  const metaRoot = findNearestMetaRoot(scopeRoot, modelPath)
  const meta = readMeta(metaRoot)
  const relativeModelPath = relative(scopeRoot, modelPath).split(sep).join('/')
  const source = meta?.source ?? inferSource(scope, relativeModelPath)
  const defaultId = `${source}:${relativeModelPath}`
  const defaultName = prettifyModelName(metaRoot === dirname(modelPath) ? basename(modelPath) : basename(metaRoot))

  return {
    id: meta?.id ?? defaultId,
    name: meta?.name ?? defaultName,
    source,
    runtimePath: buildLive2DUrl(scope, relativeModelPath),
    modelFile: basename(modelPath),
    localPath: modelPath,
    referenceUrl: meta?.referenceUrl,
    remoteUrl: meta?.remoteUrl,
    updatedAt: meta?.updatedAt ?? Math.round(statSync(modelPath).mtimeMs)
  }
}

function findModelFiles(rootPath: string, bucket: string[] = []) {
  if (!existsSync(rootPath)) {
    return bucket
  }

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = join(rootPath, entry.name)

    if (entry.isDirectory()) {
      findModelFiles(fullPath, bucket)
      continue
    }

    if (/\.model3?\.json$/i.test(entry.name)) {
      bucket.push(fullPath)
    }
  }

  return bucket
}

function listModels() {
  const storageRoot = getLive2DStorageDir()
  const bundledRoot = getBundledLive2DDir()

  const bundledModels = findModelFiles(bundledRoot).map(modelPath => buildModelItem('bundle', bundledRoot, modelPath))
  const storageModels = findModelFiles(storageRoot).map(modelPath => buildModelItem('storage', storageRoot, modelPath))

  const sourceOrder: Record<Live2DModelSource, number> = {
    bundled: 0,
    imported: 1,
    preset: 2,
    custom: 3
  }

  return [...bundledModels, ...storageModels].sort((left, right) => {
    const sourceDelta = sourceOrder[left.source] - sourceOrder[right.source]
    if (sourceDelta !== 0) {
      return sourceDelta
    }

    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

export function listLive2DLibraryItems() {
  return listModels()
}

export function setLive2DDebugLogger(logger: ((message: string) => void) | null) {
  live2DDebugLogger = logger
}

export function setLive2DStorageDirResolver(resolver: (() => string | null | undefined) | null) {
  live2DStorageDirResolver = resolver
}

export function migrateLive2DStorageData(previousCustomPath?: string | null, nextCustomPath?: string | null) {
  const previousDir = resolveLive2DStorageDir(previousCustomPath)
  const nextDir = resolveLive2DStorageDir(nextCustomPath)

  if (normalize(previousDir) === normalize(nextDir)) {
    ensureDir(nextDir)
    return nextDir
  }

  ensureDir(nextDir)

  if (!existsSync(previousDir)) {
    return nextDir
  }

  for (const entry of readdirSync(previousDir, { withFileTypes: true })) {
    const fromPath = join(previousDir, entry.name)
    const toPath = join(nextDir, entry.name)
    cpSync(fromPath, toPath, { recursive: true, force: true })
  }

  return nextDir
}

async function fetchWithTimeout(fileUrl: string) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    return await net.fetch(fileUrl, { signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('下载 Live2D 模型超时，请检查网络后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function uniqueUrls(urls: string[]) {
  return Array.from(new Set(urls.filter(Boolean)))
}

async function fetchFirstAvailable(fileUrls: string[]) {
  let lastError: unknown = null

  for (const fileUrl of uniqueUrls(fileUrls)) {
    try {
      logLive2DDebug(`download attempt ${fileUrl}`)
      const response = await fetchWithTimeout(fileUrl)
      if (response.ok) {
        logLive2DDebug(`download success ${fileUrl} status=${response.status}`)
        return { response, url: fileUrl }
      }

      logLive2DDebug(`download failed ${fileUrl} status=${response.status} ${response.statusText}`)
      lastError = new Error(`下载资源失败：${response.status} ${response.statusText}`)
    } catch (error) {
      logLive2DDebug(`download error ${fileUrl} ${(error as Error)?.message ?? String(error)}`)
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('下载资源失败')
}

async function downloadBinaryFile(fileUrls: string[], filePath: string) {
  const { response } = await fetchFirstAvailable(fileUrls)
  const buffer = Buffer.from(await response.arrayBuffer())
  ensureDir(dirname(filePath))
  writeFileSync(filePath, buffer)
}

async function cacheRemoteModel(payload: Live2DRemoteModelRequest) {
  const taskKey = `${payload.source}:${payload.id ?? payload.name}:${payload.url}`
  const inFlightTask = live2DRemoteCacheTasks.get(taskKey)
  if (inFlightTask) {
    logLive2DDebug(`reuse inflight remote cache task key=${taskKey}`)
    return inFlightTask
  }

  const task = (async () => {
    if (!/^https?:\/\//i.test(payload.url)) {
      throw new Error('远程模型地址只支持 http 或 https 协议。')
    }

    const modelUrls = uniqueUrls([payload.url, ...(payload.fallbackUrls ?? [])])
    logLive2DDebug(`cache remote model name=${payload.name} source=${payload.source} urls=${modelUrls.join(', ')}`)
    const remoteUrl = new URL(modelUrls[0])
    const modelFileName = basename(remoteUrl.pathname)
    if (!/\.model3?\.json$/i.test(modelFileName)) {
      throw new Error('请输入 model.json 或 model3.json 的完整地址。')
    }

    const targetParentDir = payload.source === 'preset' ? getLive2DPresetDir() : getLive2DRemoteDir()
    const targetFolderName = slugify(payload.id ?? payload.name ?? modelFileName)
    const targetDir = join(targetParentDir, targetFolderName)
    const targetModelPath = join(targetDir, modelFileName)

    ensureDir(targetParentDir)
    const existingMeta = readMeta(targetDir)
    if (
      existsSync(targetModelPath)
      && existingMeta?.id === (payload.id ?? targetFolderName)
      && existingMeta.remoteUrl === payload.url
    ) {
      logLive2DDebug(`reuse cached remote model path=${targetModelPath}`)
      return buildModelItem('storage', getLive2DStorageDir(), targetModelPath)
    }

    rmSync(targetDir, { recursive: true, force: true })
    ensureDir(targetDir)

    const { response: modelResponse, url: activeModelUrl } = await fetchFirstAvailable(modelUrls)
    const modelText = await modelResponse.text()
    let parsedModel: unknown

    try {
      parsedModel = JSON.parse(modelText)
    } catch {
      throw new Error('模型配置文件不是合法的 JSON。')
    }

    const assetPaths = Array.from(collectAssetPaths(parsedModel))
    writeFileSync(targetModelPath, modelText, 'utf-8')
    logLive2DDebug(`model json saved path=${targetModelPath} assetCount=${assetPaths.length} activeUrl=${activeModelUrl}`)

    for (const assetPath of assetPaths) {
      const assetUrls = modelUrls.map(modelUrl => new URL(assetPath, modelUrl).toString())
      const localAssetPath = join(targetDir, assetPath.replace(/\//g, sep))
      await downloadBinaryFile(assetUrls, localAssetPath)
    }

    writeMeta(targetDir, {
      id: payload.id ?? targetFolderName,
      name: payload.name,
      source: payload.source,
      modelFile: modelFileName,
      referenceUrl: payload.referenceUrl,
      remoteUrl: activeModelUrl,
      updatedAt: Date.now()
    })
    logLive2DDebug(`cache remote model completed path=${targetModelPath}`)

    return buildModelItem('storage', getLive2DStorageDir(), targetModelPath)
  })()

  live2DRemoteCacheTasks.set(taskKey, task)

  try {
    return await task
  } finally {
    live2DRemoteCacheTasks.delete(taskKey)
  }
}

function validateImportedModel(modelFilePath: string) {
  const fileName = basename(modelFilePath)
  if (!/\.model3?\.json$/i.test(fileName)) {
    throw new Error('请选择 model.json 或 model3.json 文件。')
  }

  let parsedModel: unknown
  try {
    parsedModel = JSON.parse(readFileSync(modelFilePath, 'utf-8'))
  } catch {
    throw new Error('选中的模型配置无法解析为 JSON。')
  }

  collectAssetPaths(parsedModel)
}

function importLocalModel(modelFilePath: string) {
  validateImportedModel(modelFilePath)

  const sourceDir = dirname(modelFilePath)
  const modelFileName = basename(modelFilePath)
  const targetId = `${slugify(basename(sourceDir))}-${Date.now()}`
  const targetDir = join(getLive2DImportedDir(), targetId)

  ensureDir(getLive2DImportedDir())
  cpSync(sourceDir, targetDir, { recursive: true, force: true })

  writeMeta(targetDir, {
    id: targetId,
    name: prettifyModelName(basename(sourceDir)),
    source: 'imported',
    modelFile: modelFileName,
    updatedAt: Date.now()
  })

  return buildModelItem('storage', getLive2DStorageDir(), join(targetDir, modelFileName))
}

function resolveLocalRuntimePath(runtimePath: string) {
  const parsedUrl = new URL(runtimePath)
  if (parsedUrl.protocol !== 'live2d:') {
    throw new Error('仅支持删除本地 Live2D 模型。')
  }

  if (parsedUrl.hostname === 'bundle') {
    throw new Error('内置模型不能删除。')
  }

  if (parsedUrl.hostname !== 'storage') {
    throw new Error('未知的 Live2D 本地模型类型。')
  }

  const baseDir = getLive2DStorageDir()
  const relativePath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '')
  const targetPath = normalize(join(baseDir, relativePath))

  if (!isInsideRoot(baseDir, targetPath)) {
    throw new Error('模型路径越界，无法删除。')
  }

  return { baseDir, targetPath }
}

function deleteLocalModel(runtimePath: string) {
  const { baseDir, targetPath } = resolveLocalRuntimePath(runtimePath)

  if (!existsSync(targetPath)) {
    return false
  }

  const metaRoot = findNearestMetaRoot(baseDir, targetPath)
  const removableRoot = normalize(metaRoot) === normalize(baseDir) ? targetPath : metaRoot
  rmSync(removableRoot, { recursive: true, force: true })
  return true
}

export function ensureLive2DDirs() {
  ensureDir(getLive2DStorageDir())
  ensureDir(getLive2DPresetDir())
  ensureDir(getLive2DImportedDir())
  ensureDir(getLive2DRemoteDir())
}

export function registerLive2DProtocol() {
  if (live2DProtocolRegistered) {
    return
  }

  live2DProtocolRegistered = true
  protocol.handle('live2d', request => {
    const parsedUrl = new URL(request.url)
    const baseDir = parsedUrl.hostname === 'bundle' ? getBundledLive2DDir() : getLive2DStorageDir()
    const relativePath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '')
    const targetPath = normalize(join(baseDir, relativePath))
    logLive2DDebug(`protocol request url=${request.url} target=${targetPath}`)

    if (!isInsideRoot(baseDir, targetPath)) {
      logLive2DDebug(`protocol forbidden url=${request.url}`)
      return new Response('Forbidden', { status: 403 })
    }

    if (!existsSync(targetPath)) {
      logLive2DDebug(`protocol missing url=${request.url}`)
      return new Response('Not Found', { status: 404 })
    }

    logLive2DDebug(`protocol serve url=${request.url}`)
    return net.fetch(pathToFileURL(targetPath).toString())
  })
}

export function registerLive2DHandlers(getWindow: () => BrowserWindow | null) {
  if (live2DHandlersRegistered) {
    return
  }

  live2DHandlersRegistered = true

  ipcMain.handle('live2d:listModels', () => listModels())
  ipcMain.handle('live2d:resolvePath', (_event, runtimePath: string) => resolveLive2DRenderUrl(runtimePath))
  ipcMain.handle('live2d:getPaths', () => ({
    storagePath: getLive2DStorageDir(),
    bundledPath: getBundledLive2DDir(),
    usingCustomStorage: normalize(getLive2DStorageDir()) !== normalize(getDefaultLive2DStorageDir())
  }))
  ipcMain.handle('live2d:cacheRemoteModel', (_event, payload: Live2DRemoteModelRequest) => cacheRemoteModel(payload))
  ipcMain.handle('live2d:deleteModel', (_event, runtimePath: string) => deleteLocalModel(runtimePath))
  ipcMain.handle('live2d:importModel', async () => {
    const ownerWindow = getWindow() ?? BrowserWindow.getFocusedWindow() ?? undefined
    const dialogOptions: OpenDialogOptions = {
      title: '导入 Live2D 模型',
      filters: [{ name: 'Live2D 模型', extensions: ['json'] }],
      properties: ['openFile']
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return importLocalModel(result.filePaths[0])
  })
}