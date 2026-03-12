import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AIProviderModel } from '@/types'
import { loadData, saveData } from '@/utils/db'
import {
  SUB2API_MODE_PRESETS,
  buildSub2ApiBaseUrl,
  createDefaultSub2ApiConfig,
  createEmptySub2ApiCheckRegistry,
  createEmptySub2ApiModelRegistry,
  fetchSub2ApiModels,
  normalizeSub2ApiCheckRegistry,
  normalizeSub2ApiConfig,
  normalizeSub2ApiGatewayRoot,
  normalizeSub2ApiModelRegistry,
  runSub2ApiCapabilityCheck,
  type Sub2ApiCheckItem,
  type Sub2ApiCheckRegistry,
  type Sub2ApiMode,
  type Sub2ApiModelRegistry,
  type Sub2ApiStoredConfig
} from '@/utils/sub2api'

const CONFIG_STORE_KEY = 'sub2api_config'
const MODELS_STORE_KEY = 'sub2api_models'
const CHECKS_STORE_KEY = 'sub2api_checks'

let electronSub2ApiSyncBound = false

export const useSub2ApiStore = defineStore('sub2api', () => {
  const config = ref<Sub2ApiStoredConfig>(createDefaultSub2ApiConfig())
  const modelRegistry = ref<Sub2ApiModelRegistry>(createEmptySub2ApiModelRegistry())
  const checkRegistry = ref<Sub2ApiCheckRegistry>(createEmptySub2ApiCheckRegistry())
  const loaded = ref(false)
  const loadingMode = ref<Sub2ApiMode | null>(null)
  const checkingMode = ref<Sub2ApiMode | null>(null)

  function applyConfigSnapshot(snapshot: Partial<Sub2ApiStoredConfig> | null | undefined) {
    config.value = normalizeSub2ApiConfig(snapshot)
  }

  function applyModelRegistrySnapshot(snapshot: Partial<Sub2ApiModelRegistry> | null | undefined) {
    modelRegistry.value = normalizeSub2ApiModelRegistry(snapshot)
  }

  function applyCheckRegistrySnapshot(snapshot: Partial<Sub2ApiCheckRegistry> | null | undefined) {
    checkRegistry.value = normalizeSub2ApiCheckRegistry(snapshot)
  }

  function bindElectronStoreSync() {
    if (electronSub2ApiSyncBound || !window.electronAPI?.onStoreChanged) {
      return
    }

    electronSub2ApiSyncBound = true
    window.electronAPI.onStoreChanged((key, data) => {
      if (key === CONFIG_STORE_KEY) {
        applyConfigSnapshot(data as Partial<Sub2ApiStoredConfig>)
        return
      }

      if (key === MODELS_STORE_KEY) {
        applyModelRegistrySnapshot(data as Partial<Sub2ApiModelRegistry>)
        return
      }

      if (key === CHECKS_STORE_KEY) {
        applyCheckRegistrySnapshot(data as Partial<Sub2ApiCheckRegistry>)
      }
    })
  }

  async function init() {
    applyConfigSnapshot(await loadData<Sub2ApiStoredConfig>(CONFIG_STORE_KEY, createDefaultSub2ApiConfig()))
    applyModelRegistrySnapshot(await loadData<Sub2ApiModelRegistry>(MODELS_STORE_KEY, createEmptySub2ApiModelRegistry()))
    applyCheckRegistrySnapshot(await loadData<Sub2ApiCheckRegistry>(CHECKS_STORE_KEY, createEmptySub2ApiCheckRegistry()))
    bindElectronStoreSync()
    loaded.value = true
  }

  async function updateConfig(partial: Partial<Sub2ApiStoredConfig>) {
    config.value = normalizeSub2ApiConfig({
      ...config.value,
      ...partial,
      preferredModels: {
        ...config.value.preferredModels,
        ...(partial.preferredModels ?? {})
      }
    })
    await saveData(CONFIG_STORE_KEY, config.value)
  }

  async function setActiveMode(mode: Sub2ApiMode) {
    await updateConfig({ activeMode: mode })
  }

  async function setGatewayRoot(value: string) {
    await updateConfig({ gatewayRoot: normalizeSub2ApiGatewayRoot(value) })
  }

  async function setApiKey(value: string) {
    await updateConfig({ apiKey: value.trim() })
  }

  async function setPreferredModel(mode: Sub2ApiMode, model: string) {
    await updateConfig({
      preferredModels: {
        ...config.value.preferredModels,
        [mode]: model.trim()
      }
    })
  }

  function getModelsForMode(mode: Sub2ApiMode): AIProviderModel[] {
    return modelRegistry.value[mode]?.models ?? []
  }

  function getChecksForMode(mode: Sub2ApiMode): Sub2ApiCheckItem[] {
    return checkRegistry.value[mode] ?? []
  }

  async function refreshModels(mode: Sub2ApiMode, signal?: AbortSignal) {
    loadingMode.value = mode

    try {
      const models = await fetchSub2ApiModels(config.value, mode, signal)
      modelRegistry.value = {
        ...modelRegistry.value,
        [mode]: {
          models,
          updatedAt: Date.now(),
          error: ''
        }
      }
      await saveData(MODELS_STORE_KEY, modelRegistry.value)

      if (!config.value.preferredModels[mode]?.trim() && models[0]) {
        await setPreferredModel(mode, models[0].name)
      }

      return models
    } catch (error) {
      modelRegistry.value = {
        ...modelRegistry.value,
        [mode]: {
          ...modelRegistry.value[mode],
          error: error instanceof Error ? error.message : '读取模型列表失败'
        }
      }
      await saveData(MODELS_STORE_KEY, modelRegistry.value)
      throw error
    } finally {
      if (loadingMode.value === mode) {
        loadingMode.value = null
      }
    }
  }

  async function refreshAllModels() {
    const modes = Object.keys(SUB2API_MODE_PRESETS) as Sub2ApiMode[]
    for (const mode of modes) {
      await refreshModels(mode)
    }
  }

  async function runChecks(mode: Sub2ApiMode, modelOverride?: string) {
    checkingMode.value = mode

    try {
      const items = await runSub2ApiCapabilityCheck(config.value, mode, modelOverride)
      checkRegistry.value = {
        ...checkRegistry.value,
        [mode]: items
      }
      await saveData(CHECKS_STORE_KEY, checkRegistry.value)
      return items
    } finally {
      if (checkingMode.value === mode) {
        checkingMode.value = null
      }
    }
  }

  function getExportData() {
    return {
      config: config.value,
      modelRegistry: modelRegistry.value,
      checkRegistry: checkRegistry.value
    }
  }

  async function importData(snapshot: Partial<{ config: Sub2ApiStoredConfig; modelRegistry: Sub2ApiModelRegistry; checkRegistry: Sub2ApiCheckRegistry }> | null | undefined) {
    if (!snapshot || typeof snapshot !== 'object') {
      return getExportData()
    }

    if (snapshot.config) {
      applyConfigSnapshot(snapshot.config)
    }

    if (snapshot.modelRegistry) {
      applyModelRegistrySnapshot(snapshot.modelRegistry)
    }

    if (snapshot.checkRegistry) {
      applyCheckRegistrySnapshot(snapshot.checkRegistry)
    }

    await Promise.all([
      saveData(CONFIG_STORE_KEY, config.value),
      saveData(MODELS_STORE_KEY, modelRegistry.value),
      saveData(CHECKS_STORE_KEY, checkRegistry.value)
    ])

    return getExportData()
  }

  const adminUrl = computed(() => normalizeSub2ApiGatewayRoot(config.value.gatewayRoot))
  const activePreset = computed(() => SUB2API_MODE_PRESETS[config.value.activeMode])
  const activeBaseUrl = computed(() => buildSub2ApiBaseUrl(config.value.gatewayRoot, config.value.activeMode))
  const configured = computed(() => Boolean(config.value.gatewayRoot.trim()) && Boolean(config.value.apiKey.trim()))

  return {
    config,
    modelRegistry,
    checkRegistry,
    loaded,
    loadingMode,
    checkingMode,
    adminUrl,
    activePreset,
    activeBaseUrl,
    configured,
    init,
    updateConfig,
    setActiveMode,
    setGatewayRoot,
    setApiKey,
    setPreferredModel,
    getModelsForMode,
    getChecksForMode,
    refreshModels,
    refreshAllModels,
    runChecks,
    getExportData,
    importData
  }
})