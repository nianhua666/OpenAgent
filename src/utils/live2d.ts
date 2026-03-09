import type {
  AppSettings,
  Live2DLibraryItem,
  Live2DModelPreset,
  Live2DReferenceLink,
  Live2DRemoteModelRequest,
  Live2DModelSource,
  Live2DStoragePaths
} from '@/types'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export const SHIZUKU_OPEN_SOURCE_URL = 'https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json'
export const SHIZUKU_OPEN_SOURCE_FALLBACK_URLS = [
  'https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json'
]
export const SHIZUKU_OPEN_SOURCE_REPO = 'https://github.com/xiazeyu/live2d-widget-models'
export const SHIZUKU_BUNDLED_RUNTIME_PATH = 'live2d://bundle/shizuku/shizuku.model.json'

export const LIVE2D_REMOTE_MODEL_PRESETS: Live2DModelPreset[] = [
  {
    id: 'preset-shizuku',
    name: 'Shizuku',
    description: '默认风格角色，适合作为桌面常驻看板娘。',
    url: SHIZUKU_OPEN_SOURCE_URL,
    fallbackUrls: SHIZUKU_OPEN_SOURCE_FALLBACK_URLS,
    source: 'preset',
    referenceUrl: SHIZUKU_OPEN_SOURCE_REPO
  },
  {
    id: 'preset-epsilon2-1',
    name: 'Epsilon 2.1',
    description: '经典长发角色，适合验证远程下载与缓存链路。',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-epsilon2_1@1.0.5/assets/Epsilon2.1.model.json',
    fallbackUrls: ['https://unpkg.com/live2d-widget-model-epsilon2_1@1.0.5/assets/Epsilon2.1.model.json'],
    source: 'preset',
    referenceUrl: SHIZUKU_OPEN_SOURCE_REPO
  },
  {
    id: 'preset-haruto',
    name: 'Haruto',
    description: '稳定可下载的经典模型，适合验证非默认远程模型切换。',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json',
    fallbackUrls: ['https://unpkg.com/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json'],
    source: 'preset',
    referenceUrl: SHIZUKU_OPEN_SOURCE_REPO
  },
  {
    id: 'preset-hibiki',
    name: 'Hibiki',
    description: '适合快速验证远程模型列表与缓存切换。',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hibiki@1.0.5/assets/hibiki.model.json',
    fallbackUrls: ['https://unpkg.com/live2d-widget-model-hibiki@1.0.5/assets/hibiki.model.json'],
    source: 'preset',
    referenceUrl: SHIZUKU_OPEN_SOURCE_REPO
  },
  {
    id: 'preset-miku',
    name: 'Miku',
    description: '常见公开模型，作为额外远程预设提供。',
    url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-miku@1.0.5/assets/miku.model.json',
    fallbackUrls: ['https://unpkg.com/live2d-widget-model-miku@1.0.5/assets/miku.model.json'],
    source: 'preset',
    referenceUrl: SHIZUKU_OPEN_SOURCE_REPO
  }
]

export const DEFAULT_BUNDLED_LIVE2D_MODEL: Live2DLibraryItem = {
  id: 'bundled:shizuku',
  name: 'Shizuku',
  source: 'bundled',
  runtimePath: SHIZUKU_BUNDLED_RUNTIME_PATH,
  modelFile: 'shizuku.model.json',
  referenceUrl: SHIZUKU_OPEN_SOURCE_REPO,
  remoteUrl: SHIZUKU_OPEN_SOURCE_URL
}

export const DEFAULT_WEB_LIVE2D_MODEL: Live2DLibraryItem = {
  id: 'remote:shizuku',
  name: 'Shizuku',
  source: 'custom',
  runtimePath: SHIZUKU_OPEN_SOURCE_URL,
  modelFile: 'shizuku.model.json',
  referenceUrl: SHIZUKU_OPEN_SOURCE_REPO,
  remoteUrl: SHIZUKU_OPEN_SOURCE_URL
}

export const LEGACY_DEFAULT_LIVE2D_URLS = [
  'https://model.oml2d.com/shizuku/shizuku.model.json',
  'https://registry.npmmirror.com/live2d-widget-model-shizuku/1.0.5/files/assets/shizuku.model.json',
  SHIZUKU_OPEN_SOURCE_URL,
  ''
]

export const LIVE2D_REFERENCE_LINKS: Live2DReferenceLink[] = [
  {
    name: 'Shizuku 开源包仓库',
    url: SHIZUKU_OPEN_SOURCE_REPO,
    description: '默认内置的 Shizuku 就来自这个公开仓库对应的 npm 包。'
  },
  {
    name: 'Shizuku CDN 资源地址',
    url: SHIZUKU_OPEN_SOURCE_URL,
    description: '用于直接使用或缓存默认远程模型的可用 CDN 入口。'
  },
  {
    name: 'Live2D 免费素材许可',
    url: 'https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html',
    description: '导入或分发其他 Live2D 模型前，先核对许可范围。'
  }
]

export function getDefaultLive2DModel() {
  return isElectron ? DEFAULT_BUNDLED_LIVE2D_MODEL : DEFAULT_WEB_LIVE2D_MODEL
}

export function createDefaultSettingsModel(): Pick<AppSettings, 'live2dModel' | 'live2dModelName' | 'live2dModelSource'> {
  const model = getDefaultLive2DModel()
  return {
    live2dModel: model.runtimePath,
    live2dModelName: model.name,
    live2dModelSource: model.source as Live2DModelSource
  }
}

export function normalizeLive2DModelUrl(url: string) {
  return url.trim()
}

export function isLive2DProtocolUrl(url: string) {
  return /^live2d:\/\//i.test(normalizeLive2DModelUrl(url))
}

export function isRemoteLive2DModelUrl(url: string) {
  return /^https?:\/\//i.test(normalizeLive2DModelUrl(url))
}

export function guessLive2DModelName(url: string) {
  const normalized = normalizeLive2DModelUrl(url)
  if (!normalized) {
    return 'Live2D 模型'
  }

  try {
    const parsedUrl = new URL(normalized)
    const fileName = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '')
    return fileName.replace(/\.(model3?|json)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Live2D 模型'
  } catch {
    return normalized.replace(/\.(model3?|json)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Live2D 模型'
  }
}

export async function listLocalLive2DModels(): Promise<Live2DLibraryItem[]> {
  if (!isElectron || typeof window.electronAPI.listLive2DModels !== 'function') {
    return []
  }

  return window.electronAPI.listLive2DModels()
}

export async function cacheLive2DRemoteModel(payload: Live2DRemoteModelRequest): Promise<Live2DLibraryItem | null> {
  if (!isElectron || typeof window.electronAPI.cacheLive2DRemoteModel !== 'function') {
    return null
  }

  return window.electronAPI.cacheLive2DRemoteModel(payload)
}

export async function deleteLocalLive2DModel(runtimePath: string): Promise<boolean> {
  if (!isElectron || typeof window.electronAPI.deleteLive2DModel !== 'function') {
    return false
  }

  return window.electronAPI.deleteLive2DModel(runtimePath)
}

export async function importLocalLive2DModel(): Promise<Live2DLibraryItem | null> {
  if (!isElectron || typeof window.electronAPI.importLive2DModel !== 'function') {
    return null
  }

  return window.electronAPI.importLive2DModel()
}

export async function getLive2DStoragePaths(): Promise<Live2DStoragePaths | null> {
  if (!isElectron || typeof window.electronAPI.getLive2DPaths !== 'function') {
    return null
  }

  return window.electronAPI.getLive2DPaths()
}

export async function resolveLive2DModelPath(runtimePath: string): Promise<string> {
  const normalizedRuntimePath = normalizeLive2DModelUrl(runtimePath)
  return normalizedRuntimePath
}

export async function chooseDirectory(title: string, defaultPath?: string): Promise<string | null> {
  if (!isElectron || typeof window.electronAPI.chooseDirectory !== 'function') {
    return null
  }

  return window.electronAPI.chooseDirectory(title, defaultPath)
}