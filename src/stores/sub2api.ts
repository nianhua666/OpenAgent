import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AIProviderModel, Sub2ApiDesktopAccessResult, Sub2ApiSetupActionResult } from '@/types'
import { loadData, saveData } from '@/utils/db'
import {
  SUB2API_MODE_PRESETS,
  buildSub2ApiSetupFormIssues,
  buildSub2ApiBaseUrl,
  createDefaultSub2ApiConfig,
  createDefaultSub2ApiRuntimeState,
  createEmptySub2ApiSetupDiagnostics,
  createEmptySub2ApiCheckRegistry,
  createEmptySub2ApiModelRegistry,
  fetchSub2ApiModels,
  normalizeSub2ApiCheckRegistry,
  normalizeSub2ApiConfig,
  normalizeSub2ApiDesktopManagedConfig,
  normalizeSub2ApiDesktopRuntimeConfig,
  normalizeSub2ApiDesktopSetupProfile,
  normalizeSub2ApiGatewayRoot,
  normalizeSub2ApiModelRegistry,
  normalizeSub2ApiRuntimeState,
  normalizeSub2ApiSetupDiagnostics,
  resolveSub2ApiGatewayRoot,
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
const RUNTIME_STATE_STORE_KEY = 'sub2api_runtime_state'

type Sub2ApiDesktopSetupPatch = {
  database?: Partial<Sub2ApiStoredConfig['desktopSetup']['database']>
  redis?: Partial<Sub2ApiStoredConfig['desktopSetup']['redis']>
  admin?: Partial<Sub2ApiStoredConfig['desktopSetup']['admin']>
  timezone?: Sub2ApiStoredConfig['desktopSetup']['timezone']
}

type Sub2ApiDesktopManagedPatch = Partial<Sub2ApiStoredConfig['desktopManaged']>

type Sub2ApiSetupDependencyState = {
  checkedAt: number
  success: boolean | null
  message: string
  details: string
}

type Sub2ApiSetupDependencyRegistry = {
  database: Sub2ApiSetupDependencyState
  redis: Sub2ApiSetupDependencyState
}

let electronSub2ApiSyncBound = false

function createEmptySetupDependencyState(label: string): Sub2ApiSetupDependencyState {
  return {
    checkedAt: 0,
    success: null,
    message: `${label} 未测试`,
    details: ''
  }
}

function createEmptySetupDependencyRegistry(): Sub2ApiSetupDependencyRegistry {
  return {
    database: createEmptySetupDependencyState('PostgreSQL'),
    redis: createEmptySetupDependencyState('Redis')
  }
}

function cloneSerializable<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}

export const useSub2ApiStore = defineStore('sub2api', () => {
  const config = ref<Sub2ApiStoredConfig>(createDefaultSub2ApiConfig())
  const modelRegistry = ref<Sub2ApiModelRegistry>(createEmptySub2ApiModelRegistry())
  const checkRegistry = ref<Sub2ApiCheckRegistry>(createEmptySub2ApiCheckRegistry())
  const runtimeState = ref(createDefaultSub2ApiRuntimeState())
  const setupDiagnostics = ref(createEmptySub2ApiSetupDiagnostics())
  const setupDependencies = ref<Sub2ApiSetupDependencyRegistry>(createEmptySetupDependencyRegistry())
  const loaded = ref(false)
  const loadingMode = ref<Sub2ApiMode | null>(null)
  const checkingMode = ref<Sub2ApiMode | null>(null)
  const runtimeAction = ref<'start' | 'stop' | 'restart' | null>(null)
  const setupAction = ref<'inspect' | 'test-db' | 'test-redis' | 'install' | null>(null)

  function applyConfigSnapshot(snapshot: Partial<Sub2ApiStoredConfig> | null | undefined) {
    config.value = normalizeSub2ApiConfig(snapshot)
  }

  function applyModelRegistrySnapshot(snapshot: Partial<Sub2ApiModelRegistry> | null | undefined) {
    modelRegistry.value = normalizeSub2ApiModelRegistry(snapshot)
  }

  function applyCheckRegistrySnapshot(snapshot: Partial<Sub2ApiCheckRegistry> | null | undefined) {
    checkRegistry.value = normalizeSub2ApiCheckRegistry(snapshot)
  }

  function applyRuntimeStateSnapshot(snapshot: Partial<typeof runtimeState.value> | null | undefined) {
    runtimeState.value = normalizeSub2ApiRuntimeState(snapshot)
  }

  function applySetupDiagnosticsSnapshot(snapshot: Partial<typeof setupDiagnostics.value> | null | undefined) {
    setupDiagnostics.value = normalizeSub2ApiSetupDiagnostics(snapshot)
  }

  function resetSetupDependency(key: keyof Sub2ApiSetupDependencyRegistry) {
    setupDependencies.value = {
      ...setupDependencies.value,
      [key]: createEmptySetupDependencyState(key === 'database' ? 'PostgreSQL' : 'Redis')
    }
  }

  function applySetupDependencyResult(key: keyof Sub2ApiSetupDependencyRegistry, result: Sub2ApiSetupActionResult) {
    setupDependencies.value = {
      ...setupDependencies.value,
      [key]: {
        checkedAt: Date.now(),
        success: result.success,
        message: result.message,
        details: result.details
      }
    }
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
        return
      }

      if (key === RUNTIME_STATE_STORE_KEY) {
        applyRuntimeStateSnapshot(data as Partial<typeof runtimeState.value>)
      }
    })
  }

  function toRuntimePayload(runtimeConfig?: Partial<Sub2ApiStoredConfig['desktopRuntime']>) {
    return cloneSerializable(normalizeSub2ApiDesktopRuntimeConfig(runtimeConfig ?? config.value.desktopRuntime))
  }

  function toManagedPayload(managedConfig?: Partial<Sub2ApiStoredConfig['desktopManaged']>) {
    return cloneSerializable(normalizeSub2ApiDesktopManagedConfig(managedConfig ?? config.value.desktopManaged))
  }

  function toSetupProfilePayload() {
    return cloneSerializable(normalizeSub2ApiDesktopSetupProfile(config.value.desktopSetup))
  }

  function toSetupDatabasePayload() {
    return cloneSerializable(normalizeSub2ApiDesktopSetupProfile(config.value.desktopSetup).database)
  }

  function toSetupRedisPayload() {
    return cloneSerializable(normalizeSub2ApiDesktopSetupProfile(config.value.desktopSetup).redis)
  }

  async function refreshRuntimeState(runtimeConfig?: Partial<Sub2ApiStoredConfig['desktopRuntime']>) {
    if (window.electronAPI?.sub2ApiGetRuntimeState) {
      applyRuntimeStateSnapshot(await window.electronAPI.sub2ApiGetRuntimeState(toRuntimePayload(runtimeConfig), toManagedPayload()))
      return runtimeState.value
    }

    applyRuntimeStateSnapshot({
      ...runtimeState.value,
      mode: config.value.gatewayMode,
      host: config.value.desktopRuntime.host,
      port: config.value.desktopRuntime.port,
      baseUrl: resolveSub2ApiGatewayRoot(config.value),
      adminUrl: resolveSub2ApiGatewayRoot(config.value),
      healthEndpoint: `${resolveSub2ApiGatewayRoot(config.value)}/health`
    })
    return runtimeState.value
  }

  async function init() {
    applyConfigSnapshot(await loadData<Sub2ApiStoredConfig>(CONFIG_STORE_KEY, createDefaultSub2ApiConfig()))
    applyModelRegistrySnapshot(await loadData<Sub2ApiModelRegistry>(MODELS_STORE_KEY, createEmptySub2ApiModelRegistry()))
    applyCheckRegistrySnapshot(await loadData<Sub2ApiCheckRegistry>(CHECKS_STORE_KEY, createEmptySub2ApiCheckRegistry()))
    await refreshRuntimeState()
    if (config.value.gatewayMode === 'desktop' && runtimeState.value.status === 'running' && !config.value.apiKey.trim()) {
      void ensureDesktopAccess().catch(() => undefined)
    }
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
      },
      desktopRuntime: {
        ...config.value.desktopRuntime,
        ...(partial.desktopRuntime ?? {})
      },
      desktopManaged: {
        ...config.value.desktopManaged,
        ...(partial.desktopManaged ?? {})
      },
      desktopSetup: {
        ...config.value.desktopSetup,
        ...(partial.desktopSetup ?? {}),
        database: {
          ...config.value.desktopSetup.database,
          ...(partial.desktopSetup?.database ?? {})
        },
        redis: {
          ...config.value.desktopSetup.redis,
          ...(partial.desktopSetup?.redis ?? {})
        },
        admin: {
          ...config.value.desktopSetup.admin,
          ...(partial.desktopSetup?.admin ?? {})
        }
      }
    })
    await saveData(CONFIG_STORE_KEY, config.value)

    if (partial.desktopRuntime || partial.desktopManaged || typeof partial.gatewayMode !== 'undefined') {
      void refreshRuntimeState(config.value.desktopRuntime)
    }
  }

  async function setGatewayMode(mode: Sub2ApiStoredConfig['gatewayMode']) {
    await updateConfig({ gatewayMode: mode })
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

  async function setDesktopRuntime(partial: Partial<Sub2ApiStoredConfig['desktopRuntime']>) {
    await updateConfig({
      desktopRuntime: normalizeSub2ApiDesktopRuntimeConfig({
        ...config.value.desktopRuntime,
        ...partial
      })
    })
  }

  async function setDesktopManaged(partial: Sub2ApiDesktopManagedPatch) {
    await updateConfig({
      desktopManaged: normalizeSub2ApiDesktopManagedConfig({
        ...config.value.desktopManaged,
        ...partial
      })
    })
  }

  async function setDesktopSetup(partial: Sub2ApiDesktopSetupPatch) {
    await updateConfig({
      desktopSetup: normalizeSub2ApiDesktopSetupProfile({
        ...config.value.desktopSetup,
        ...partial,
        database: {
          ...config.value.desktopSetup.database,
          ...(partial.database ?? {})
        },
        redis: {
          ...config.value.desktopSetup.redis,
          ...(partial.redis ?? {})
        },
        admin: {
          ...config.value.desktopSetup.admin,
          ...(partial.admin ?? {})
        }
      })
    })

    if (partial.database) {
      resetSetupDependency('database')
    }

    if (partial.redis) {
      resetSetupDependency('redis')
    }
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
      const models = await fetchSub2ApiModels(config.value, mode, signal, runtimeState.value)
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
      const items = await runSub2ApiCapabilityCheck(config.value, mode, modelOverride, runtimeState.value)
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
    return cloneSerializable({
      config: config.value,
      modelRegistry: modelRegistry.value,
      checkRegistry: checkRegistry.value
    })
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

    await refreshRuntimeState(config.value.desktopRuntime)

    return getExportData()
  }

  async function startDesktopRuntime(partial?: Partial<Sub2ApiStoredConfig['desktopRuntime']>) {
    runtimeAction.value = 'start'

    try {
      const nextRuntime = normalizeSub2ApiDesktopRuntimeConfig({
        ...config.value.desktopRuntime,
        ...(partial ?? {})
      })

      await updateConfig({
        gatewayMode: 'desktop',
        desktopRuntime: nextRuntime
      })

      if (!window.electronAPI?.sub2ApiStartRuntime) {
        throw new Error('桌面运行时仅在 Electron 桌面环境中可用')
      }

      applyRuntimeStateSnapshot(await window.electronAPI.sub2ApiStartRuntime(toRuntimePayload(nextRuntime), toManagedPayload()))
      return runtimeState.value
    } finally {
      runtimeAction.value = null
    }
  }

  async function stopDesktopRuntime() {
    runtimeAction.value = 'stop'

    try {
      if (!window.electronAPI?.sub2ApiStopRuntime) {
        return refreshRuntimeState()
      }

      applyRuntimeStateSnapshot(await window.electronAPI.sub2ApiStopRuntime())
      return runtimeState.value
    } finally {
      runtimeAction.value = null
    }
  }

  async function restartDesktopRuntime(partial?: Partial<Sub2ApiStoredConfig['desktopRuntime']>) {
    runtimeAction.value = 'restart'

    try {
      const nextRuntime = normalizeSub2ApiDesktopRuntimeConfig({
        ...config.value.desktopRuntime,
        ...(partial ?? {})
      })

      await updateConfig({
        gatewayMode: 'desktop',
        desktopRuntime: nextRuntime
      })

      if (!window.electronAPI?.sub2ApiRestartRuntime) {
        throw new Error('桌面运行时仅在 Electron 桌面环境中可用')
      }

      applyRuntimeStateSnapshot(await window.electronAPI.sub2ApiRestartRuntime(toRuntimePayload(nextRuntime), toManagedPayload()))
      return runtimeState.value
    } finally {
      runtimeAction.value = null
    }
  }

  async function chooseBinary(defaultPath?: string) {
    if (!window.electronAPI?.sub2ApiChooseBinary) {
      return null
    }

    return window.electronAPI.sub2ApiChooseBinary(defaultPath || config.value.desktopRuntime.binaryPath || runtimeState.value.resolvedBinaryPath)
  }

  async function syncDesktopSource() {
    if (!window.electronAPI?.sub2ApiSyncSource) {
      throw new Error('源码同步仅在 Electron 桌面环境中可用')
    }

    const result = await window.electronAPI.sub2ApiSyncSource(toRuntimePayload(), toManagedPayload())
    await refreshRuntimeState(config.value.desktopRuntime)
    return result
  }

  async function buildDesktopSource() {
    if (!window.electronAPI?.sub2ApiBuildSource) {
      throw new Error('源码构建仅在 Electron 桌面环境中可用')
    }

    const result = await window.electronAPI.sub2ApiBuildSource(toRuntimePayload(), toManagedPayload())
    await refreshRuntimeState(config.value.desktopRuntime)
    return result
  }

  async function ensureDesktopSetupRuntime() {
    if (!window.electronAPI?.sub2ApiInspectSetup) {
      throw new Error('桌面初始化向导仅在 Electron 桌面环境中可用')
    }

    if (runtimeState.value.status !== 'running') {
      await startDesktopRuntime()
    }
  }

  async function inspectDesktopSetup() {
    setupAction.value = 'inspect'

    try {
      if (!window.electronAPI?.sub2ApiInspectSetup) {
        throw new Error('桌面初始化向导仅在 Electron 桌面环境中可用')
      }

      applyRuntimeStateSnapshot(await refreshRuntimeState(config.value.desktopRuntime))
      applySetupDiagnosticsSnapshot(await window.electronAPI.sub2ApiInspectSetup(toRuntimePayload(), toManagedPayload()))
      return setupDiagnostics.value
    } finally {
      setupAction.value = null
    }
  }

  async function runSetupDatabaseCheck() {
    if (!window.electronAPI?.sub2ApiTestSetupDatabase) {
      throw new Error('桌面初始化向导仅在 Electron 桌面环境中可用')
    }

    const result = await window.electronAPI.sub2ApiTestSetupDatabase(toSetupDatabasePayload(), toRuntimePayload())
    applySetupDependencyResult('database', result)
    return result
  }

  async function runSetupRedisCheck() {
    if (!window.electronAPI?.sub2ApiTestSetupRedis) {
      throw new Error('桌面初始化向导仅在 Electron 桌面环境中可用')
    }

    const result = await window.electronAPI.sub2ApiTestSetupRedis(toSetupRedisPayload(), toRuntimePayload())
    applySetupDependencyResult('redis', result)
    return result
  }

  async function testDesktopSetupDatabase() {
    setupAction.value = 'test-db'

    try {
      await ensureDesktopSetupRuntime()
      const result = await runSetupDatabaseCheck()
      await inspectDesktopSetup().catch(() => setupDiagnostics.value)
      return result
    } finally {
      setupAction.value = null
    }
  }

  async function testDesktopSetupRedis() {
    setupAction.value = 'test-redis'

    try {
      await ensureDesktopSetupRuntime()
      const result = await runSetupRedisCheck()
      await inspectDesktopSetup().catch(() => setupDiagnostics.value)
      return result
    } finally {
      setupAction.value = null
    }
  }

  async function installDesktopSetup(): Promise<Sub2ApiSetupActionResult> {
    setupAction.value = 'install'

    try {
      const blockingIssue = buildSub2ApiSetupFormIssues(config.value.desktopSetup).find(item => item.level === 'error')
      if (blockingIssue) {
        throw new Error(blockingIssue.message)
      }

      await ensureDesktopSetupRuntime()
      const databaseResult = await runSetupDatabaseCheck()
      const redisResult = await runSetupRedisCheck()
      const dependencyFailures = [
        !databaseResult.success ? `PostgreSQL：${databaseResult.details || databaseResult.message}` : '',
        !redisResult.success ? `Redis：${redisResult.details || redisResult.message}` : ''
      ].filter(Boolean)

      if (dependencyFailures.length > 0) {
        await inspectDesktopSetup().catch(() => setupDiagnostics.value)
        throw new Error(`初始化前置依赖未通过：${dependencyFailures.join('；')}`)
      }

      const result = await window.electronAPI.sub2ApiInstallSetup(toSetupProfilePayload(), toRuntimePayload(), toManagedPayload())
      await refreshRuntimeState(config.value.desktopRuntime)
      await inspectDesktopSetup().catch(() => setupDiagnostics.value)
      return result
    } finally {
      setupAction.value = null
    }
  }

  async function ensureDesktopAccess(): Promise<Sub2ApiDesktopAccessResult> {
    if (!window.electronAPI?.sub2ApiEnsureDesktopAccess) {
      throw new Error('本地 Sub2API 自动识别仅在 Electron 桌面环境中可用')
    }

    const result = await window.electronAPI.sub2ApiEnsureDesktopAccess(
      toRuntimePayload(),
      toManagedPayload(),
      config.value.apiKey.trim() || undefined
    )

    applyRuntimeStateSnapshot(result.runtimeState)

    if (!result.success) {
      throw new Error(result.message || '当前还没有可复用的本地 Sub2API API Key')
    }

    await updateConfig({
      gatewayMode: 'desktop',
      apiKey: result.apiKey || config.value.apiKey,
      desktopManaged: {
        ...config.value.desktopManaged,
        adminEmail: result.adminEmail || config.value.desktopManaged.adminEmail,
        apiKeyName: result.apiKeyName || config.value.desktopManaged.apiKeyName
      }
    })

    return result
  }

  const gatewayMode = computed(() => config.value.gatewayMode)
  const desktopModeEnabled = computed(() => config.value.gatewayMode === 'desktop')
  const adminUrl = computed(() => normalizeSub2ApiGatewayRoot(resolveSub2ApiGatewayRoot(config.value, runtimeState.value)))
  const activePreset = computed(() => SUB2API_MODE_PRESETS[config.value.activeMode])
  const activeBaseUrl = computed(() => buildSub2ApiBaseUrl(resolveSub2ApiGatewayRoot(config.value, runtimeState.value), config.value.activeMode))
  const configured = computed(() => Boolean(resolveSub2ApiGatewayRoot(config.value, runtimeState.value).trim()) && Boolean(config.value.apiKey.trim()))
  const effectiveGatewayRoot = computed(() => resolveSub2ApiGatewayRoot(config.value, runtimeState.value))
  const runtimeBusy = computed(() => runtimeAction.value !== null || runtimeState.value.status === 'starting' || runtimeState.value.status === 'stopping')
  const runtimeHealthy = computed(() => runtimeState.value.status === 'running' && runtimeState.value.healthy)
  const setupBusy = computed(() => setupAction.value !== null)
  const setupStatus = computed(() => setupDiagnostics.value.status)
  const setupNeedsInstall = computed(() => setupDiagnostics.value.status.needsSetup === true)
  const setupFormIssues = computed(() => buildSub2ApiSetupFormIssues(config.value.desktopSetup))
  const setupBlockingIssue = computed(() => setupFormIssues.value.find(item => item.level === 'error') ?? null)
  const setupDependencyBlockingIssue = computed(() => {
    if (setupDependencies.value.database.success === false) {
      return `PostgreSQL 未通过：${setupDependencies.value.database.details || setupDependencies.value.database.message}`
    }

    if (setupDependencies.value.redis.success === false) {
      return `Redis 未通过：${setupDependencies.value.redis.details || setupDependencies.value.redis.message}`
    }

    return ''
  })

  return {
    config,
    modelRegistry,
    checkRegistry,
    runtimeState,
    setupDiagnostics,
    setupDependencies,
    loaded,
    loadingMode,
    checkingMode,
    runtimeAction,
    setupAction,
    gatewayMode,
    desktopModeEnabled,
    adminUrl,
    activePreset,
    activeBaseUrl,
    configured,
    effectiveGatewayRoot,
    runtimeBusy,
    runtimeHealthy,
    setupBusy,
    setupStatus,
    setupNeedsInstall,
    setupFormIssues,
    setupBlockingIssue,
    setupDependencyBlockingIssue,
    init,
    updateConfig,
    setGatewayMode,
    setActiveMode,
    setGatewayRoot,
    setApiKey,
    setDesktopRuntime,
    setDesktopManaged,
    setDesktopSetup,
    setPreferredModel,
    getModelsForMode,
    getChecksForMode,
    refreshRuntimeState,
    startDesktopRuntime,
    stopDesktopRuntime,
    restartDesktopRuntime,
    chooseBinary,
    syncDesktopSource,
    buildDesktopSource,
    inspectDesktopSetup,
    testDesktopSetupDatabase,
    testDesktopSetupRedis,
    installDesktopSetup,
    ensureDesktopAccess,
    refreshModels,
    refreshAllModels,
    runChecks,
    getExportData,
    importData
  }
})
