import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppSettings, Live2DLibraryItem, Live2DModelSource, Live2DRemoteModelRequest } from '@/types'
import { loadData, saveData } from '@/utils/db'
import {
  cacheLive2DRemoteModel,
  createDefaultSettingsModel,
  guessLive2DModelName,
  getDefaultLive2DModel,
  isLive2DProtocolUrl,
  isRemoteLive2DModelUrl,
  LIVE2D_REMOTE_MODEL_PRESETS,
  LEGACY_DEFAULT_LIVE2D_URLS
} from '@/utils/live2d'
import {
  AZURE_TTS_ENGINE,
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_EMOTION_INTENSITY,
  DEFAULT_TTS_EMOTION_STYLE,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_TTS_VOICE_ID,
  EDGE_TTS_ENGINE,
  getDefaultTTSVoiceId,
  getTTSVoiceOption,
  clampTTSEmotionIntensity,
  isBuiltinTTSVoice,
  isAzureTTSVoiceId,
  isEdgeTTSVoiceId,
  isSystemTTSVoiceId,
  normalizeTTSEmotionStyle,
  normalizeTTSEngine,
  normalizeTTSModelId
} from '@/utils/ttsCatalog'

const DEFAULT_MODEL = createDefaultSettingsModel()
let electronSettingsSyncBound = false

function applyTheme(theme: AppSettings['theme']) {
  document.documentElement.setAttribute('data-theme', theme)
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'sakura',
  sidebarCollapsed: false,
  live2dEnabled: true,
  live2dModel: DEFAULT_MODEL.live2dModel,
  live2dModelName: DEFAULT_MODEL.live2dModelName,
  live2dModelSource: DEFAULT_MODEL.live2dModelSource,
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
  ttsAzureKey: '',
  ttsAzureRegion: '',
  ttsEmotionStyle: DEFAULT_TTS_EMOTION_STYLE,
  ttsEmotionIntensity: DEFAULT_TTS_EMOTION_INTENSITY,
  ttsSpeed: 1,
  ttsVolume: 0.92
}

type AISettingsSnapshot = Pick<AppSettings,
  'windowsMcpEnabled'
  | 'ttsEnabled'
  | 'ttsEngine'
  | 'ttsAutoPlayLive2D'
  | 'ttsShowMainReplyButton'
  | 'ttsModelId'
  | 'ttsVoiceId'
  | 'ttsVoiceName'
  | 'ttsAzureKey'
  | 'ttsAzureRegion'
  | 'ttsEmotionStyle'
  | 'ttsEmotionIntensity'
  | 'ttsSpeed'
  | 'ttsVolume'
>

function inferLocalModelSource(modelPath: string): Live2DModelSource {
  try {
    const parsedUrl = new URL(modelPath)
    if (parsedUrl.protocol !== 'live2d:') {
      return 'custom'
    }

    if (parsedUrl.hostname === 'bundle') {
      return 'bundled'
    }

    if (parsedUrl.pathname.includes('/presets/')) {
      return 'preset'
    }

    if (parsedUrl.pathname.includes('/remote/')) {
      return 'custom'
    }
  } catch {
    return 'custom'
  }

  return 'imported'
}

function normalizeSettings(saved: Partial<AppSettings>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...saved }
  const defaultModel = getDefaultLive2DModel()
  const isLegacyDesktopSettings = typeof saved.closeToTray === 'undefined' && typeof saved.launchAtLogin === 'undefined'

  if (typeof merged.live2dStoragePath !== 'string') {
    merged.live2dStoragePath = ''
  }

  if (typeof merged.ttsEnabled !== 'boolean') {
    merged.ttsEnabled = DEFAULT_SETTINGS.ttsEnabled
  }

  merged.ttsEngine = normalizeTTSEngine(merged.ttsEngine)

  if (typeof merged.ttsAutoPlayLive2D !== 'boolean') {
    merged.ttsAutoPlayLive2D = DEFAULT_SETTINGS.ttsAutoPlayLive2D
  }

  if (typeof merged.ttsShowMainReplyButton !== 'boolean') {
    merged.ttsShowMainReplyButton = DEFAULT_SETTINGS.ttsShowMainReplyButton
  }

  merged.ttsAzureKey = typeof merged.ttsAzureKey === 'string' ? merged.ttsAzureKey.trim() : ''
  merged.ttsAzureRegion = typeof merged.ttsAzureRegion === 'string' ? merged.ttsAzureRegion.trim().toLowerCase() : ''
  merged.ttsModelId = normalizeTTSModelId(merged.ttsModelId, merged.ttsEngine)
  merged.ttsEmotionStyle = normalizeTTSEmotionStyle(merged.ttsEmotionStyle)
  merged.ttsEmotionIntensity = clampTTSEmotionIntensity(merged.ttsEmotionIntensity)

  if (!merged.ttsVoiceId) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === 'system-speech' && (isBuiltinTTSVoice(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === 'system-speech' && isAzureTTSVoiceId(merged.ttsVoiceId)) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === AZURE_TTS_ENGINE && (isBuiltinTTSVoice(merged.ttsVoiceId) || isSystemTTSVoiceId(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === EDGE_TTS_ENGINE && (isBuiltinTTSVoice(merged.ttsVoiceId) || isSystemTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === EDGE_TTS_ENGINE && isAzureTTSVoiceId(merged.ttsVoiceId)) {
    merged.ttsVoiceId = getDefaultTTSVoiceId(merged.ttsEngine)
  }

  if (merged.ttsEngine === DEFAULT_TTS_ENGINE && (isSystemTTSVoiceId(merged.ttsVoiceId) || isEdgeTTSVoiceId(merged.ttsVoiceId) || isAzureTTSVoiceId(merged.ttsVoiceId))) {
    merged.ttsVoiceId = DEFAULT_TTS_VOICE_ID
  }

  const resolvedVoice = getTTSVoiceOption(merged.ttsVoiceId, merged.ttsModelId, merged.ttsEngine)
  merged.ttsVoiceId = resolvedVoice?.id || getDefaultTTSVoiceId(merged.ttsEngine)
  merged.ttsVoiceName = resolvedVoice?.name || DEFAULT_SETTINGS.ttsVoiceName

  merged.ttsSpeed = Number.isFinite(merged.ttsSpeed)
    ? Math.min(Math.max(Number(merged.ttsSpeed), 0.7), 1.35)
    : DEFAULT_SETTINGS.ttsSpeed

  merged.ttsVolume = Number.isFinite(merged.ttsVolume)
    ? Math.min(Math.max(Number(merged.ttsVolume), 0), 1)
    : DEFAULT_SETTINGS.ttsVolume

  if (isLegacyDesktopSettings && merged.live2dPosition.x === 0 && merged.live2dPosition.y === 0) {
    merged.live2dPosition = { x: -1, y: -1 }
  }

  if (LEGACY_DEFAULT_LIVE2D_URLS.includes(merged.live2dModel)) {
    merged.live2dModel = defaultModel.runtimePath
    merged.live2dModelName = defaultModel.name
    merged.live2dModelSource = defaultModel.source
  }

  if (!merged.live2dModelName) {
    merged.live2dModelName = guessLive2DModelName(merged.live2dModel)
  }

  if (!merged.live2dModelSource) {
    if (isLive2DProtocolUrl(merged.live2dModel)) {
      merged.live2dModelSource = inferLocalModelSource(merged.live2dModel)
    } else if (isRemoteLive2DModelUrl(merged.live2dModel)) {
      merged.live2dModelSource = 'custom'
    }
  }

  return merged
}

function buildRemoteCachePayload(modelPath: string, modelName: string, modelSource: Live2DModelSource): Live2DRemoteModelRequest {
  const matchedPreset = LIVE2D_REMOTE_MODEL_PRESETS.find(preset => [preset.url, ...(preset.fallbackUrls ?? [])].includes(modelPath))
  if (matchedPreset) {
    return {
      id: matchedPreset.id,
      name: matchedPreset.name,
      url: modelPath,
      fallbackUrls: [matchedPreset.url, ...(matchedPreset.fallbackUrls ?? [])].filter(url => url !== modelPath),
      source: 'preset',
      referenceUrl: matchedPreset.referenceUrl
    }
  }

  const nextName = modelName.trim() || guessLive2DModelName(modelPath)
  return {
    id: `custom-${nextName}`,
    name: nextName,
    url: modelPath,
    fallbackUrls: [],
    source: modelSource === 'preset' ? 'preset' : 'custom',
    referenceUrl: modelPath
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)

  function applySettingsSnapshot(snapshot: Partial<AppSettings>) {
    settings.value = normalizeSettings(snapshot)
    applyTheme(settings.value.theme)
  }

  function bindElectronSettingsSync() {
    if (electronSettingsSyncBound || !window.electronAPI?.onSettingsChanged) {
      return
    }

    electronSettingsSyncBound = true
    window.electronAPI.onSettingsChanged((nextSettings) => {
      applySettingsSnapshot(nextSettings)
    })
  }

  // 桌面版统一先缓存远程模型，再把活动模型切到本地路径，避免打包态二级资源链不稳定。
  async function cacheRemoteSelectionIfNeeded(partial: Partial<AppSettings>) {
    const nextModel = partial.live2dModel?.trim()
    if (!nextModel || !window.electronAPI?.cacheLive2DRemoteModel || !isRemoteLive2DModelUrl(nextModel)) {
      return partial
    }

    const nextName = partial.live2dModelName ?? settings.value.live2dModelName
    const nextSource = partial.live2dModelSource ?? settings.value.live2dModelSource
    const cachedModel = await cacheLive2DRemoteModel(buildRemoteCachePayload(nextModel, nextName, nextSource))
    if (!cachedModel) {
      throw new Error('远程 Live2D 模型缓存失败')
    }

    return {
      ...partial,
      live2dModel: cachedModel.runtimePath,
      live2dModelName: cachedModel.name,
      live2dModelSource: cachedModel.source
    }
  }

  async function ensureDesktopLive2DModelReady() {
    if (!window.electronAPI?.cacheLive2DRemoteModel || !isRemoteLive2DModelUrl(settings.value.live2dModel)) {
      return
    }

    try {
      const normalizedPartial = await cacheRemoteSelectionIfNeeded({
        live2dModel: settings.value.live2dModel,
        live2dModelName: settings.value.live2dModelName,
        live2dModelSource: settings.value.live2dModelSource
      })

      Object.assign(settings.value, normalizedPartial)
      await saveData('settings', settings.value)
    } catch (error) {
      const defaultModel = getDefaultLive2DModel()
      Object.assign(settings.value, {
        live2dModel: defaultModel.runtimePath,
        live2dModelName: defaultModel.name,
        live2dModelSource: defaultModel.source
      })
      await saveData('settings', settings.value)
      console.warn('[Settings] 远程 Live2D 模型缓存失败，已回退到默认内置模型。', error)
    }
  }

  async function init() {
    const saved = await loadData<AppSettings>('settings', DEFAULT_SETTINGS)
    const normalizedSettings = normalizeSettings(saved)
    settings.value = normalizedSettings
    applyTheme(settings.value.theme)
    bindElectronSettingsSync()
    if (JSON.stringify(saved) !== JSON.stringify(normalizedSettings)) {
      await saveData('settings', normalizedSettings)
    }
    await ensureDesktopLive2DModelReady()
    loaded.value = true
  }

  async function update(partial: Partial<AppSettings>) {
    const normalizedPartial = await cacheRemoteSelectionIfNeeded(partial)
    const nextSettings = normalizeSettings({
      ...settings.value,
      ...normalizedPartial
    })
    settings.value = nextSettings
    if (normalizedPartial.theme) {
      applyTheme(nextSettings.theme)
    }
    await saveData('settings', settings.value)
  }

  async function setLive2DModel(model: Pick<Live2DLibraryItem, 'runtimePath' | 'name' | 'source'>) {
    await update({
      live2dModel: model.runtimePath,
      live2dModelName: model.name,
      live2dModelSource: model.source
    })
  }

  async function restoreDefaultLive2DModel() {
    const defaultModel = getDefaultLive2DModel()
    await update({
      live2dModel: defaultModel.runtimePath,
      live2dModelName: defaultModel.name,
      live2dModelSource: defaultModel.source
    })
  }

  function getAISettingsExportData(): AISettingsSnapshot {
    return {
      windowsMcpEnabled: settings.value.windowsMcpEnabled,
      ttsEnabled: settings.value.ttsEnabled,
      ttsEngine: settings.value.ttsEngine,
      ttsAutoPlayLive2D: settings.value.ttsAutoPlayLive2D,
      ttsShowMainReplyButton: settings.value.ttsShowMainReplyButton,
      ttsModelId: settings.value.ttsModelId,
      ttsVoiceId: settings.value.ttsVoiceId,
      ttsVoiceName: settings.value.ttsVoiceName,
      ttsAzureKey: settings.value.ttsAzureKey,
      ttsAzureRegion: settings.value.ttsAzureRegion,
      ttsEmotionStyle: settings.value.ttsEmotionStyle,
      ttsEmotionIntensity: settings.value.ttsEmotionIntensity,
      ttsSpeed: settings.value.ttsSpeed,
      ttsVolume: settings.value.ttsVolume
    }
  }

  async function importAISettingsData(snapshot: Partial<AISettingsSnapshot> | null | undefined) {
    if (!snapshot || typeof snapshot !== 'object') {
      return getAISettingsExportData()
    }

    const nextPartial = {} as Partial<AppSettings>
    if (typeof snapshot.windowsMcpEnabled === 'boolean') {
      nextPartial.windowsMcpEnabled = snapshot.windowsMcpEnabled
    }
    if (typeof snapshot.ttsEnabled === 'boolean') {
      nextPartial.ttsEnabled = snapshot.ttsEnabled
    }
    if (typeof snapshot.ttsEngine !== 'undefined') {
      nextPartial.ttsEngine = snapshot.ttsEngine
    }
    if (typeof snapshot.ttsAutoPlayLive2D === 'boolean') {
      nextPartial.ttsAutoPlayLive2D = snapshot.ttsAutoPlayLive2D
    }
    if (typeof snapshot.ttsShowMainReplyButton === 'boolean') {
      nextPartial.ttsShowMainReplyButton = snapshot.ttsShowMainReplyButton
    }
    if (typeof snapshot.ttsModelId === 'string') {
      nextPartial.ttsModelId = snapshot.ttsModelId
    }
    if (typeof snapshot.ttsVoiceId === 'string') {
      nextPartial.ttsVoiceId = snapshot.ttsVoiceId
    }
    if (typeof snapshot.ttsVoiceName === 'string') {
      nextPartial.ttsVoiceName = snapshot.ttsVoiceName
    }
    if (typeof snapshot.ttsAzureKey === 'string') {
      nextPartial.ttsAzureKey = snapshot.ttsAzureKey
    }
    if (typeof snapshot.ttsAzureRegion === 'string') {
      nextPartial.ttsAzureRegion = snapshot.ttsAzureRegion
    }
    if (typeof snapshot.ttsEmotionStyle !== 'undefined') {
      nextPartial.ttsEmotionStyle = snapshot.ttsEmotionStyle
    }
    if (typeof snapshot.ttsEmotionIntensity === 'number') {
      nextPartial.ttsEmotionIntensity = snapshot.ttsEmotionIntensity
    }
    if (typeof snapshot.ttsSpeed === 'number') {
      nextPartial.ttsSpeed = snapshot.ttsSpeed
    }
    if (typeof snapshot.ttsVolume === 'number') {
      nextPartial.ttsVolume = snapshot.ttsVolume
    }

    if (Object.keys(nextPartial).length === 0) {
      return getAISettingsExportData()
    }

    await update(nextPartial)
    return getAISettingsExportData()
  }

  const theme = computed(() => settings.value.theme)
  const sidebarCollapsed = computed(() => settings.value.sidebarCollapsed)
  const live2dEnabled = computed(() => settings.value.live2dEnabled)
  const currencySymbol = computed(() => settings.value.currencySymbol)

  return {
    settings,
    loaded,
    theme,
    sidebarCollapsed,
    live2dEnabled,
    currencySymbol,
    init,
    update,
    setLive2DModel,
    restoreDefaultLive2DModel,
    getAISettingsExportData,
    importAISettingsData
  }
})
