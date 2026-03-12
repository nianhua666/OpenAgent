<template>
  <div class="sub2api-console-page">
    <section class="page-hero glass-panel">
      <div class="hero-copy">
        <span class="hero-tag">Sub2API Console</span>
        <h2 class="page-title">Sub2API 内嵌后台</h2>
        <p>把 setup、登录、API Key 和后台首页放到 OpenAgent 内部完成。桌面模式下可以直接在这里完成初始化、登录和账号池维护；外部模式也可以用这个容器作为统一入口。</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-secondary btn-sm" @click="openWorkbench">返回工作台</button>
        <button class="btn btn-secondary btn-sm" :disabled="!currentBaseUrl" @click="openExternalAdmin">打开原后台</button>
        <button v-if="desktopModeEnabled" class="btn btn-primary btn-sm" :disabled="syncingAccess" @click="ensureDesktopAccess">
          {{ syncingAccess ? '同步中...' : '同步本地专属 Key' }}
        </button>
      </div>
    </section>

    <section class="console-summary-grid">
      <article class="summary-card glass-panel">
        <span>当前接入</span>
        <strong>{{ providerLabel }}</strong>
        <small>{{ gatewayModeLabel }}</small>
      </article>
      <article class="summary-card glass-panel">
        <span>运行状态</span>
        <strong>{{ runtimeStatusLabel }}</strong>
        <small>{{ runtimeSummaryMessage }}</small>
      </article>
      <article class="summary-card glass-panel">
        <span>{{ desktopModeEnabled ? '本地地址' : '当前地址' }}</span>
        <strong>{{ currentBaseUrl || '未配置' }}</strong>
        <small>{{ desktopModeEnabled ? '当前 iframe 会直接访问这个本机地址。' : '当前 iframe 会直接访问外部网关地址。' }}</small>
      </article>
      <article class="summary-card glass-panel">
        <span>专属 Key</span>
        <strong>{{ apiKeyStatusLabel }}</strong>
        <small>{{ apiKeyHint }}</small>
      </article>
    </section>

    <section class="console-shell glass-panel">
      <div class="console-toolbar">
        <div class="console-tab-row">
          <button
            v-for="tab in consoleTabs"
            :key="tab.id"
            class="console-tab"
            :class="{ active: activeTabId === tab.id }"
            @click="activeTabId = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="console-actions">
          <button v-if="desktopModeEnabled" class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy" @click="startRuntime">启动</button>
          <button v-if="desktopModeEnabled" class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy || runtimeState.status !== 'running'" @click="restartRuntime">重启</button>
          <button v-if="desktopModeEnabled" class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy || !canStopRuntime" @click="stopRuntime">停止</button>
          <button class="btn btn-secondary btn-sm" :disabled="!currentIframeUrl" @click="refreshConsoleFrame">刷新内嵌页</button>
          <button class="btn btn-secondary btn-sm" :disabled="!currentIframeUrl" @click="copyCurrentUrl">复制当前地址</button>
        </div>
      </div>

      <div v-if="!currentBaseUrl" class="console-empty-state">
        <strong>当前还没有可用的 Sub2API 地址</strong>
        <p>请先在 Sub2API 工作台完成本地网关或外部网关配置，然后再打开内嵌后台。</p>
      </div>

      <div v-else-if="sub2ApiStore.desktopModeEnabled && !consoleReady" class="console-empty-state">
        <strong>{{ desktopConsoleStateTitle }}</strong>
        <p>{{ desktopConsoleStateMessage }}</p>
      </div>

      <iframe
        v-else
        :key="iframeKey"
        class="console-frame"
        :src="currentIframeUrl"
        referrerpolicy="no-referrer"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSub2ApiStore } from '@/stores/sub2api'
import { showToast } from '@/utils/toast'

type ConsoleTabId = 'dashboard' | 'setup' | 'login' | 'keys'

const consoleTabs: Array<{ id: ConsoleTabId; label: string; path: string }> = [
  { id: 'dashboard', label: '后台首页', path: '/dashboard' },
  { id: 'setup', label: '初始化向导', path: '/setup' },
  { id: 'login', label: '登录', path: '/login' },
  { id: 'keys', label: 'API Key', path: '/keys' }
]

const router = useRouter()
const sub2ApiStore = useSub2ApiStore()
const activeTabId = ref<ConsoleTabId>('dashboard')
const iframeKey = ref(0)
const syncingAccess = ref(false)

const desktopModeEnabled = computed(() => sub2ApiStore.desktopModeEnabled)
const runtimeState = computed(() => sub2ApiStore.runtimeState)
const currentBaseUrl = computed(() => sub2ApiStore.adminUrl || sub2ApiStore.effectiveGatewayRoot)
const currentTab = computed(() => consoleTabs.find(tab => tab.id === activeTabId.value) ?? consoleTabs[0])
const currentIframeUrl = computed(() => currentBaseUrl.value ? `${currentBaseUrl.value}${currentTab.value.path}` : '')
const canStopRuntime = computed(() => runtimeState.value.status === 'running' || runtimeState.value.status === 'starting')
const providerLabel = computed(() => desktopModeEnabled.value ? '内嵌桌面运行时' : '外部网关')
const gatewayModeLabel = computed(() => desktopModeEnabled.value ? '桌面网关' : '外部网关')
const consoleReady = computed(() => {
  if (!currentBaseUrl.value) {
    return false
  }

  if (!desktopModeEnabled.value) {
    return true
  }

  return runtimeState.value.status === 'running'
})
const desktopConsoleStateTitle = computed(() => {
  switch (runtimeState.value.status) {
    case 'missing-binary':
      return '当前缺少内嵌 Sub2API 二进制'
    case 'starting':
      return '本地网关启动中'
    case 'error':
      return '本地网关启动异常'
    case 'unavailable':
      return '本地网关不可用'
    default:
      return '请先启动本地网关'
  }
})
const desktopConsoleStateMessage = computed(() => {
  if (runtimeState.value.status === 'starting') {
    return '本地网关正在启动，请稍后刷新内嵌页。'
  }

  return runtimeState.value.healthMessage || '当前本地网关还没有准备好，请先回到工作台完成启动或初始化。'
})
const runtimeStatusLabel = computed(() => {
  if (!desktopModeEnabled.value) {
    return '由远端服务决定'
  }

  switch (runtimeState.value.status) {
    case 'running':
      return runtimeState.value.healthy ? '运行中' : '已启动，等待健康检查'
    case 'starting':
      return '启动中'
    case 'stopping':
      return '停止中'
    case 'error':
      return '异常'
    case 'missing-binary':
      return '缺少二进制'
    case 'unavailable':
      return '本地网关不可用'
    default:
      return '未启动'
  }
})
const runtimeSummaryMessage = computed(() => {
  if (!desktopModeEnabled.value) {
    return currentBaseUrl.value
      ? '当前为外部网关模式，内嵌页会直接访问远端后台。'
      : '请先在工作台填写外部网关地址。'
  }

  return runtimeState.value.healthMessage || '等待启动'
})
const apiKeyStatusLabel = computed(() => {
  if (!desktopModeEnabled.value) {
    return sub2ApiStore.config.apiKey.trim() ? '已填写' : '未填写'
  }

  if (sub2ApiStore.config.apiKey.trim()) {
    return '已同步'
  }

  return runtimeState.value.managedApiKeyDetected ? '已识别待同步' : '未同步'
})
const apiKeyHint = computed(() => {
  if (!desktopModeEnabled.value) {
    return '当前为外部网关模式，请填写外部网关可用的 API Key。'
  }

  if (sub2ApiStore.config.apiKey.trim()) {
    return '当前 OpenAgent 已保存可直接用于 AI 设置的专属 API Key。'
  }

  if (runtimeState.value.managedApiKeyDetected) {
    return '本地后台已经存在 OpenAgent 专属 Key，点击上方按钮可重新同步到工作台。'
  }

  return '初始化完成后，OpenAgent 会尝试自动登录后台并创建或复用专属 API Key。'
})

function openWorkbench() {
  void router.push('/sub2api')
}

function openExternalAdmin() {
  if (!currentBaseUrl.value) {
    showToast('error', '当前还没有可用的后台地址')
    return
  }

  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(currentBaseUrl.value)
    return
  }

  window.open(currentBaseUrl.value, '_blank', 'noopener,noreferrer')
}

async function startRuntime() {
  if (!desktopModeEnabled.value) {
    showToast('error', '外部网关模式不支持在这里启动本地运行时')
    return
  }

  try {
    await sub2ApiStore.startDesktopRuntime()
    showToast('success', runtimeState.value.healthMessage || '本地网关已启动')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关启动失败')
  }
}

async function stopRuntime() {
  if (!desktopModeEnabled.value) {
    showToast('error', '外部网关模式不支持在这里停止本地运行时')
    return
  }

  try {
    await sub2ApiStore.stopDesktopRuntime()
    showToast('success', '本地网关已停止')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关停止失败')
  }
}

async function restartRuntime() {
  if (!desktopModeEnabled.value) {
    showToast('error', '外部网关模式不支持在这里重启本地运行时')
    return
  }

  try {
    await sub2ApiStore.restartDesktopRuntime()
    showToast('success', runtimeState.value.healthMessage || '本地网关已重启')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关重启失败')
  }
}

async function ensureDesktopAccess() {
  if (!desktopModeEnabled.value) {
    showToast('error', '当前是外部网关模式，本页不会同步本地专属 Key')
    return
  }

  syncingAccess.value = true

  try {
    if (runtimeState.value.status !== 'running' && !sub2ApiStore.runtimeBusy) {
      await sub2ApiStore.startDesktopRuntime()
    }

    const access = await sub2ApiStore.ensureDesktopAccess()
    showToast('success', access.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '同步本地专属 Key 失败')
  } finally {
    syncingAccess.value = false
  }
}

function refreshConsoleFrame() {
  iframeKey.value += 1
}

async function copyCurrentUrl() {
  if (!currentIframeUrl.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(currentIframeUrl.value)
    showToast('success', '当前后台地址已复制')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '复制后台地址失败')
  }
}
</script>

<style lang="scss" scoped>
.sub2api-console-page {
  display: grid;
  gap: 18px;
}

.page-hero,
.console-shell,
.summary-card {
  padding: 20px;
}

.page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.hero-copy {
  display: grid;
  gap: 10px;

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
    max-width: 760px;
  }
}

.hero-tag {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(18, 85, 92, 0.12);
  color: #12555c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.console-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summary-card {
  display: grid;
  gap: 6px;

  span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  strong {
    color: var(--text-primary);
    font-size: 16px;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.console-shell {
  display: grid;
  gap: 16px;
}

.console-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.console-tab-row,
.console-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.console-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border: 1px solid rgba(18, 85, 92, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color $transition-fast, transform $transition-fast, box-shadow $transition-fast;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.24);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: linear-gradient(135deg, rgba(255, 249, 234, 0.88), rgba(222, 243, 236, 0.84));
    color: #12555c;
    font-weight: 700;
  }
}

.console-empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 360px;
  padding: 24px;
  border-radius: 20px;
  border: 1px dashed rgba(18, 85, 92, 0.18);
  background: rgba(255, 255, 255, 0.42);
  text-align: center;

  strong {
    color: var(--text-primary);
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
    max-width: 620px;
  }
}

.console-frame {
  width: 100%;
  min-height: 820px;
  border: none;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.7);
}

@media (max-width: 1100px) {
  .console-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .page-hero,
  .console-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .console-summary-grid {
    grid-template-columns: 1fr;
  }

  .console-frame {
    min-height: 680px;
  }
}
</style>