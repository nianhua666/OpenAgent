<template>
  <section class="sub2api-bridge" :class="[`is-${runtimePresentation.tone}`, { 'is-compact': compact }]">
    <div class="bridge-head">
      <div class="bridge-copy">
        <span class="bridge-tag">Sub2API</span>
        <strong>{{ bridgeTitle }}</strong>
        <p>{{ bridgeSummary }}</p>
      </div>
      <div class="bridge-status">
        <span class="bridge-status-chip" :class="`is-${runtimePresentation.tone}`">{{ runtimePresentation.label }}</span>
        <span class="bridge-status-chip" :class="{ 'is-accent': usingSub2ApiTemplate }">{{ selectedPreset.title }}</span>
      </div>
    </div>

    <div class="bridge-meta-row">
      <span class="bridge-meta-chip">网关 {{ effectiveGatewayRoot || '未配置' }}</span>
      <span class="bridge-meta-chip">路由 {{ selectedPreset.tag }}</span>
      <span class="bridge-meta-chip">默认模型 {{ selectedPreferredModel }}</span>
      <span v-if="modelCatalogUpdatedAtLabel" class="bridge-meta-chip">模型缓存 {{ modelCatalogUpdatedAtLabel }}</span>
    </div>

    <div class="bridge-mode-row">
      <button
        v-for="preset in modeOptions"
        :key="preset.value"
        class="bridge-mode-chip"
        :class="{ active: preset.value === selectedMode }"
        @click="selectedMode = preset.value"
      >
        {{ preset.title }}
      </button>
    </div>

    <p class="bridge-runtime-detail">{{ runtimeDetail }}</p>
    <p v-if="inlineStatusMessage" class="bridge-inline-status">{{ inlineStatusMessage }}</p>

    <div v-if="quickModels.length" class="bridge-model-row">
      <button
        v-for="model in quickModels"
        :key="model.id"
        class="bridge-model-chip"
        :class="{ active: aiConfig.model === model.name }"
        @click="applyQuickModel(model.name)"
      >
        {{ model.label }}
      </button>
    </div>

    <div class="bridge-actions">
      <button class="btn btn-primary btn-sm" :disabled="syncingBinding" @click="syncBindingToAgent()">
        {{ syncingBinding ? '同步中...' : primaryActionLabel }}
      </button>
      <button class="btn btn-secondary btn-sm" :disabled="refreshingModels" @click="refreshModelsFromSub2Api()">
        {{ refreshingModels ? '读取中...' : '读取模型' }}
      </button>
      <button
        v-if="showRepairAction"
        class="btn btn-secondary btn-sm"
        :disabled="repairingDesktopAccess"
        @click="repairDesktopAccess()"
      >
        {{ repairingDesktopAccess ? '处理中...' : repairActionLabel }}
      </button>
      <button class="btn btn-secondary btn-sm" :disabled="checkingCapabilities" @click="runQuickCapabilityCheck()">
        {{ checkingCapabilities ? '检查中...' : '快速体检' }}
      </button>
      <button class="btn btn-secondary btn-sm" @click="openWorkbench">
        {{ compact ? '更多' : '打开工作台' }}
      </button>
    </div>

    <div v-if="checkSummary" class="bridge-check-row">
      <span class="bridge-check-label">最近检查</span>
      <span>{{ checkSummary }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { useSub2ApiStore } from '@/stores/sub2api'
import {
  SUB2API_MODE_PRESETS,
  buildSub2ApiAiPatch,
  buildSub2ApiBaseUrl,
  getSub2ApiPreferredModel,
  getSub2ApiRuntimePresentation,
  hasSub2ApiSignal,
  normalizeSub2ApiGatewayRoot,
  resolveSub2ApiMode,
  type Sub2ApiMode
} from '@/utils/sub2api'
import { showToast } from '@/utils/toast'

const props = withDefaults(defineProps<{
  compact?: boolean
  settingsMode?: 'route' | 'emit'
}>(), {
  compact: false,
  settingsMode: 'route'
})

const emit = defineEmits<{
  'open-settings': []
}>()

const router = useRouter()
const aiStore = useAIStore()
const sub2ApiStore = useSub2ApiStore()
const selectedMode = ref<Sub2ApiMode>('openai')
const syncingBinding = ref(false)
const refreshingModels = ref(false)
const checkingCapabilities = ref(false)
const repairingDesktopAccess = ref(false)
const inlineStatusMessage = ref('')

const aiConfig = computed(() => aiStore.config)
const activeAiMode = computed(() => resolveSub2ApiMode(aiConfig.value.connectionTemplate))
const usingSub2ApiTemplate = computed(() => activeAiMode.value !== null)
const modeOptions = Object.values(SUB2API_MODE_PRESETS)
const effectiveMode = computed(() => activeAiMode.value || selectedMode.value || sub2ApiStore.config.activeMode)
const selectedPreset = computed(() => SUB2API_MODE_PRESETS[effectiveMode.value])
const runtimePresentation = computed(() => getSub2ApiRuntimePresentation(sub2ApiStore.runtimeState, sub2ApiStore.config.gatewayMode))
const effectiveGatewayRoot = computed(() => sub2ApiStore.effectiveGatewayRoot || '')
const selectedPreferredModel = computed(() => getSub2ApiPreferredModel(sub2ApiStore.config, effectiveMode.value))
const currentBaseUrl = computed(() => buildSub2ApiBaseUrl(effectiveGatewayRoot.value, effectiveMode.value))
const quickModels = computed(() => sub2ApiStore.getModelsForMode(effectiveMode.value).slice(0, props.compact ? 4 : 6))
const checkItems = computed(() => sub2ApiStore.getChecksForMode(effectiveMode.value))
const modelCatalogUpdatedAtLabel = computed(() => {
  const updatedAt = sub2ApiStore.modelRegistry[effectiveMode.value]?.updatedAt || 0
  if (!updatedAt) {
    return ''
  }

  return new Date(updatedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})
const checkSummary = computed(() => {
  if (checkItems.value.length === 0) {
    return ''
  }

  const successCount = checkItems.value.filter(item => item.state === 'success').length
  const errorCount = checkItems.value.filter(item => item.state === 'error').length
  const pendingCount = checkItems.value.filter(item => item.state === 'pending').length
  const lastFailure = checkItems.value.find(item => item.state === 'error')
  if (lastFailure) {
    return `失败 ${errorCount} 项，最近问题：${lastFailure.label}，${lastFailure.message}`
  }

  return `成功 ${successCount} 项${pendingCount > 0 ? `，待确认 ${pendingCount} 项` : ''}`
})
const bridgeTitle = computed(() => {
  if (usingSub2ApiTemplate.value) {
    return `当前 Agent 已接入 ${selectedPreset.value.title}`
  }

  if (hasSub2ApiSignal(sub2ApiStore.config, sub2ApiStore.runtimeState)) {
    return 'Sub2API 已准备，可一键接管 Agent'
  }

  return '在 Agent 内直接接入 Sub2API'
})
const bridgeSummary = computed(() => {
  if (usingSub2ApiTemplate.value) {
    return `当前会话会直接走 ${selectedPreset.value.title}，主请求地址为 ${aiConfig.value.baseUrl || currentBaseUrl.value || '未生成'}。`
  }

  if (hasSub2ApiSignal(sub2ApiStore.config, sub2ApiStore.runtimeState)) {
    return '账号池、模型路由、本地网关与 API Key 都可以在这里直接复用，不必先切到独立工作台。'
  }

  return '如果你准备用账号池驱动 Claude、Responses、Gemini 或 Antigravity 路由，可以直接在这里完成接管、模型读取和快速体检。'
})
const runtimeDetail = computed(() => {
  if (sub2ApiStore.config.gatewayMode === 'desktop' && sub2ApiStore.runtimeState.managedApiKeyDetected && !sub2ApiStore.config.apiKey.trim()) {
    return '本地专属 API Key 已检测到，但尚未同步到当前 Agent。点击下方“同步本地 Key”即可直接接管。'
  }

  if (!effectiveGatewayRoot.value) {
    return runtimePresentation.value.detail
  }

  return `${runtimePresentation.value.detail} 当前网关根地址：${effectiveGatewayRoot.value}。`
})
const primaryActionLabel = computed(() => usingSub2ApiTemplate.value && activeAiMode.value === effectiveMode.value ? '重新同步 Agent' : `切到 ${selectedPreset.value.title}`)
const showRepairAction = computed(() => sub2ApiStore.desktopModeEnabled)
const repairActionLabel = computed(() => {
  if (sub2ApiStore.runtimeState.status !== 'running') {
    return '启动本地网关'
  }

  return sub2ApiStore.config.apiKey.trim() ? '同步本地 Key' : '同步本地专属 Key'
})

watch(
  () => [activeAiMode.value, sub2ApiStore.config.activeMode] as const,
  ([nextActiveMode, fallbackMode]) => {
    selectedMode.value = nextActiveMode || fallbackMode
  },
  { immediate: true }
)

function updateInlineStatus(message: string) {
  inlineStatusMessage.value = message
}

async function ensureSub2ApiLoaded() {
  if (!sub2ApiStore.loaded) {
    await sub2ApiStore.init()
    return
  }

  await sub2ApiStore.refreshRuntimeState().catch(() => undefined)
}

async function syncStoreContext(mode: Sub2ApiMode, modelOverride?: string) {
  const partial: Parameters<typeof sub2ApiStore.updateConfig>[0] = {
    activeMode: mode
  }

  const nextApiKey = aiConfig.value.apiKey.trim() || sub2ApiStore.config.apiKey.trim()
  if (nextApiKey && nextApiKey !== sub2ApiStore.config.apiKey) {
    partial.apiKey = nextApiKey
  }

  const preferredModel = modelOverride?.trim() || aiConfig.value.model.trim() || sub2ApiStore.config.preferredModels[mode]
  if (preferredModel) {
    partial.preferredModels = {
      ...sub2ApiStore.config.preferredModels,
      [mode]: preferredModel
    }
  }

  if (!sub2ApiStore.desktopModeEnabled) {
    const normalizedRoot = normalizeSub2ApiGatewayRoot(
      sub2ApiStore.config.gatewayRoot
      || (activeAiMode.value ? aiConfig.value.baseUrl : '')
    )
    if (normalizedRoot && normalizedRoot !== sub2ApiStore.config.gatewayRoot) {
      partial.gatewayRoot = normalizedRoot
    }
  }

  await sub2ApiStore.updateConfig(partial)
}

async function ensureDesktopAccess() {
  if (!sub2ApiStore.desktopModeEnabled) {
    return
  }

  if (sub2ApiStore.runtimeState.status !== 'running' && !sub2ApiStore.runtimeBusy) {
    await sub2ApiStore.startDesktopRuntime()
  }

  if (!sub2ApiStore.config.apiKey.trim() || sub2ApiStore.runtimeState.managedApiKeyDetected) {
    try {
      const access = await sub2ApiStore.ensureDesktopAccess()
      if (access.apiKey && access.apiKey !== aiConfig.value.apiKey.trim()) {
        await aiStore.updateConfig({ apiKey: access.apiKey })
      }
      updateInlineStatus(access.message)
    } catch (error) {
      if (!sub2ApiStore.config.apiKey.trim()) {
        throw error
      }

      updateInlineStatus(error instanceof Error ? error.message : '本地专属 Key 同步失败，已继续使用现有 API Key。')
    }
  }
}

async function syncBindingToAgent(modelOverride?: string) {
  syncingBinding.value = true

  try {
    await ensureSub2ApiLoaded()
    await ensureDesktopAccess()
    await syncStoreContext(effectiveMode.value, modelOverride)

    const patch = buildSub2ApiAiPatch(sub2ApiStore.config, effectiveMode.value, sub2ApiStore.runtimeState)
    const shouldKeepCurrentModel = Boolean(
      aiConfig.value.model.trim()
      && activeAiMode.value === effectiveMode.value
      && !modelOverride
    )

    await aiStore.updateConfig({
      ...patch,
      ...(shouldKeepCurrentModel ? { model: aiConfig.value.model.trim() } : {}),
      ...(modelOverride?.trim() ? { model: modelOverride.trim() } : {})
    })

    updateInlineStatus(`已把 ${selectedPreset.value.title} 同步到当前 Agent。`)
    showToast('success', `已切换到 ${selectedPreset.value.title}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sub2API 接管 Agent 失败'
    updateInlineStatus(message)
    showToast('error', message)
  } finally {
    syncingBinding.value = false
  }
}

async function refreshModelsFromSub2Api() {
  refreshingModels.value = true

  try {
    await ensureSub2ApiLoaded()
    await ensureDesktopAccess()
    await syncStoreContext(effectiveMode.value)
    const models = await sub2ApiStore.refreshModels(effectiveMode.value)
    if (models.length === 0) {
      updateInlineStatus('模型目录已读取，但当前路由还没有返回可用模型。')
      showToast('warning', '当前路由未返回模型列表')
      return
    }

    updateInlineStatus(`已读取 ${models.length} 个可用模型。`)
    showToast('success', `已读取 ${models.length} 个可用模型`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取模型失败'
    updateInlineStatus(message)
    showToast('error', message)
  } finally {
    refreshingModels.value = false
  }
}

async function repairDesktopAccess() {
  repairingDesktopAccess.value = true

  try {
    await ensureSub2ApiLoaded()
    await ensureDesktopAccess()
    updateInlineStatus(runtimePresentation.value.detail)
    showToast('success', sub2ApiStore.runtimeState.status === 'running' ? '本地网关已就绪' : 'Sub2API 本地接入已修复')
  } catch (error) {
    const message = error instanceof Error ? error.message : '本地网关修复失败'
    updateInlineStatus(message)
    showToast('error', message)
  } finally {
    repairingDesktopAccess.value = false
  }
}

async function runQuickCapabilityCheck() {
  checkingCapabilities.value = true

  try {
    await ensureSub2ApiLoaded()
    await ensureDesktopAccess()
    await syncStoreContext(effectiveMode.value)
    const checks = await sub2ApiStore.runChecks(effectiveMode.value, aiConfig.value.model.trim() || selectedPreferredModel.value)
    const hasFailure = checks.some(item => item.state === 'error')
    updateInlineStatus(hasFailure ? '快速体检已完成，存在失败项。' : '快速体检通过，可以继续在 Agent 内直接工作。')
    showToast(hasFailure ? 'error' : 'success', hasFailure ? '存在失败项，请查看最近检查摘要' : 'Sub2API 快速体检通过')
  } catch (error) {
    const message = error instanceof Error ? error.message : '快速体检失败'
    updateInlineStatus(message)
    showToast('error', message)
  } finally {
    checkingCapabilities.value = false
  }
}

async function applyQuickModel(modelName: string) {
  const nextModel = modelName.trim()
  if (!nextModel) {
    return
  }

  if (!usingSub2ApiTemplate.value || activeAiMode.value !== effectiveMode.value) {
    await syncBindingToAgent(nextModel)
    return
  }

  try {
    await sub2ApiStore.setPreferredModel(effectiveMode.value, nextModel)
    await aiStore.updateConfig({ model: nextModel })
    updateInlineStatus(`已切到模型 ${nextModel}。`)
    showToast('success', `已切到模型 ${nextModel}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '切换模型失败'
    updateInlineStatus(message)
    showToast('error', message)
  }
}

function openWorkbench() {
  if (props.settingsMode === 'emit') {
    emit('open-settings')
    return
  }

  void router.push('/sub2api')
}

onMounted(() => {
  void ensureSub2ApiLoaded()
})
</script>

<style lang="scss" scoped>
.sub2api-bridge {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.14);
  background:
    radial-gradient(circle at top left, rgba(255, 241, 210, 0.58), transparent 42%),
    linear-gradient(135deg, rgba(221, 243, 236, 0.74), rgba(228, 236, 255, 0.72));

  &.is-warning {
    border-color: rgba(217, 119, 6, 0.22);
  }

  &.is-danger {
    border-color: rgba(180, 35, 24, 0.2);
    background:
      radial-gradient(circle at top left, rgba(255, 231, 231, 0.7), transparent 42%),
      linear-gradient(135deg, rgba(255, 245, 245, 0.86), rgba(255, 236, 242, 0.82));
  }

  &.is-success {
    border-color: rgba(18, 120, 96, 0.18);
  }

  &.is-compact {
    gap: 10px;
    padding: 12px;
    border-radius: 16px;
  }
}

.bridge-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.bridge-copy {
  display: grid;
  gap: 6px;
  min-width: 0;

  strong {
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.4;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }
}

.bridge-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(18, 85, 92, 0.12);
  color: #12555c;
  font-size: 11px;
  font-weight: 700;
}

.bridge-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.bridge-status-chip,
.bridge-meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(18, 85, 92, 0.08);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
}

.bridge-status-chip {
  &.is-success {
    color: #187d59;
    background: rgba(228, 248, 239, 0.92);
  }

  &.is-info {
    color: #2d4f99;
    background: rgba(233, 241, 255, 0.92);
  }

  &.is-warning {
    color: #9a3412;
    background: rgba(255, 244, 229, 0.94);
  }

  &.is-danger {
    color: #b42318;
    background: rgba(254, 243, 242, 0.94);
  }

  &.is-accent {
    color: #12555c;
    background: rgba(221, 243, 236, 0.92);
  }
}

.bridge-meta-row,
.bridge-mode-row,
.bridge-model-row,
.bridge-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bridge-meta-chip {
  max-width: 100%;
  word-break: break-all;
}

.bridge-mode-chip,
.bridge-model-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(18, 85, 92, 0.14);
  background: rgba(255, 255, 255, 0.84);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.28);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: rgba(221, 243, 236, 0.9);
    color: #12555c;
  }
}

.bridge-runtime-detail,
.bridge-inline-status,
.bridge-check-row {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.bridge-inline-status {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: rgba(255, 255, 255, 0.62);
}

.bridge-check-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-top: 2px;
}

.bridge-check-label {
  flex-shrink: 0;
  color: var(--text-muted);
  font-weight: 700;
}

@media (max-width: 720px) {
  .bridge-head {
    flex-direction: column;
  }

  .bridge-status {
    justify-content: flex-start;
  }

  .bridge-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
