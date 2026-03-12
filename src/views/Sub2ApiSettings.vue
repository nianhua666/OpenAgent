<template>
  <div class="sub2api-page">
    <section v-if="showHeroSection" class="page-hero glass-panel">
      <div class="hero-copy">
        <span class="hero-tag">Sub2API</span>
        <h2 class="page-title">Sub2API 工作台</h2>
        <p>把 Sub2API 作为 OpenAgent 的内嵌网关中心使用。这里统一管理网关根地址、API Key、路由模式、模型目录、Codex 配置模板，以及同步到 AI 助手的入口。</p>
      </div>
      <div class="hero-metrics">
        <div class="hero-metric">
          <span>当前路由</span>
          <strong>{{ activePreset.title }}</strong>
        </div>
        <div class="hero-metric">
          <span>已缓存模型</span>
          <strong>{{ activeModels.length }}</strong>
        </div>
        <div class="hero-metric">
          <span>AI 绑定</span>
          <strong>{{ currentAiModeLabel }}</strong>
        </div>
      </div>
    </section>

    <section v-if="showConfigSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-gateway"/></svg>
            内嵌网关配置
          </h3>
          <p class="section-desc">这里保存 OpenAgent 内置的 Sub2API 主配置。保存后可以在 AI 设置里直接切换到任一路由，也可以从本页一键同步到当前 AI 助手。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" @click="openAISettingsPage">打开 AI 设置</button>
          <button class="btn btn-primary btn-sm" :disabled="!sub2ApiStore.configured" @click="applyToAI()">同步到 AI 助手</button>
        </div>
      </div>

      <div class="config-grid">
        <label class="config-field">
          <span>网关根地址</span>
          <input
            class="setting-input"
            :value="gatewayRoot"
            :placeholder="SUB2API_GATEWAY_PLACEHOLDER"
            @input="gatewayRoot = normalizeSub2ApiGatewayRoot(($event.target as HTMLInputElement).value)"
          />
          <small>只填根地址，不要带 /v1、/messages、/responses 或 /antigravity/v1。</small>
        </label>

        <label class="config-field">
          <span>Sub2API API Key</span>
          <div class="input-wrap">
            <input
              :type="showApiKey ? 'text' : 'password'"
              class="setting-input"
              :value="apiKey"
              placeholder="sk-your-sub2api-key"
              @input="apiKey = ($event.target as HTMLInputElement).value"
            />
            <button class="toggle-visibility-btn" :title="showApiKey ? '隐藏' : '显示'" @click="showApiKey = !showApiKey">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="showApiKey" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle v-if="showApiKey" cx="12" cy="12" r="3"/>
                <path v-if="!showApiKey" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line v-if="!showApiKey" x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <small>用于 OpenAgent 内嵌 Sub2API 路由与模型列表读取。同步到 AI 助手时会一并写入当前 AI 配置。</small>
        </label>
      </div>

      <div class="route-grid">
        <button
          v-for="mode in modeOptions"
          :key="mode.value"
          class="route-card"
          :class="{ active: activeMode === mode.value }"
          @click="setActiveMode(mode.value)"
        >
          <span class="provider-card-tag">{{ mode.tag }}</span>
          <strong>{{ mode.title }}</strong>
          <small>{{ mode.description }}</small>
          <span class="route-pill">{{ (gatewayRoot || SUB2API_GATEWAY_PLACEHOLDER) + mode.routeSuffix }}</span>
        </button>
      </div>

      <div class="route-strip">
        <span class="route-chip">当前模板：{{ activePreset.title }}</span>
        <span class="route-chip">实际 Base URL：{{ activeBaseUrl || '未配置' }}</span>
        <span class="route-chip is-accent">AI 当前绑定：{{ currentAiModeLabel }}</span>
      </div>
    </section>

    <section v-if="showModelsSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-ai"/></svg>
            模型目录
          </h3>
          <p class="section-desc">按当前路由读取并缓存模型目录。选中的默认模型会在同步到 AI 助手时自动带上，也会被 AI 设置页直接复用。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.configured || sub2ApiStore.loadingMode === activeMode" @click="refreshActiveModels">
            {{ sub2ApiStore.loadingMode === activeMode ? '读取中...' : '刷新当前路由模型' }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="!activeModels.length" @click="applyToAI(activeMode)">用当前默认模型同步到 AI</button>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-chip">默认模型：{{ preferredModel }}</span>
        <span class="status-chip">目录状态：{{ modelStatusLabel }}</span>
        <span class="status-chip" v-if="activeCatalog.updatedAt">最近同步：{{ formatTimestamp(activeCatalog.updatedAt) }}</span>
      </div>

      <div v-if="activeCatalog.error" class="inline-error">{{ activeCatalog.error }}</div>

      <div v-if="filteredActiveModels.length" class="model-grid">
        <button
          v-for="model in filteredActiveModels"
          :key="model.id"
          class="model-card"
          :class="{ active: preferredModel === model.name }"
          @click="setPreferredModel(model.name)"
        >
          <div class="model-card-head">
            <strong>{{ model.label }}</strong>
            <span>{{ model.provider || activePreset.title }}</span>
          </div>
          <p>{{ model.description || '未提供附加说明' }}</p>
          <div class="model-tags">
            <span v-for="label in getModelCapabilityLabels(model.capabilities)" :key="`${model.id}-${label}`" class="model-tag">{{ label }}</span>
            <span v-if="getModelCapabilityLabels(model.capabilities).length === 0" class="model-tag is-muted">能力待确认</span>
          </div>
          <div class="model-tags" v-if="getModelLimitLabels(model.limits).length">
            <span v-for="label in getModelLimitLabels(model.limits)" :key="`${model.id}-${label}`" class="model-tag is-limit">{{ label }}</span>
          </div>
        </button>
      </div>
      <div v-else class="empty-state compact">
        <svg width="48" height="48"><use href="#icon-search"/></svg>
        <div class="empty-title">当前路由还没有可用模型目录</div>
        <div class="empty-desc">先确认网关根地址和 API Key，再刷新当前路由模型。</div>
      </div>
    </section>

    <section v-if="showChecksSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-refresh"/></svg>
            核心能力检查
          </h3>
          <p class="section-desc">最小化验证模型列表、聊天路径与 Responses / Codex 路径，确认当前内嵌 Sub2API 配置确实可用。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.adminUrl" @click="openSub2ApiAdmin">打开后台</button>
          <button class="btn btn-primary btn-sm" :disabled="!sub2ApiStore.configured || sub2ApiStore.checkingMode === activeMode" @click="runChecksForActiveMode">
            {{ sub2ApiStore.checkingMode === activeMode ? '检查中...' : '检查当前路由' }}
          </button>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-chip">{{ checksSummary }}</span>
      </div>

      <div v-if="activeChecks.length" class="check-list">
        <div v-for="item in activeChecks" :key="item.id" class="check-item" :class="`is-${item.state}`">
          <div class="check-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.endpoint }}</small>
          </div>
          <span>{{ item.message }}</span>
        </div>
      </div>
    </section>

    <section v-if="showCodexSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-copy"/></svg>
            Codex CLI 模板
          </h3>
          <p class="section-desc">当服务端分组已经绑定 OpenAI OAuth / Codex 登录账号时，这里直接给出可复用的 CLI 配置模板。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" @click="copyText(codexConfigToml, 'config.toml')">复制 config.toml</button>
          <button class="btn btn-secondary btn-sm" @click="copyText(codexAuthJson, 'auth.json')">复制 auth.json</button>
        </div>
      </div>

      <div class="config-preview-grid">
        <div class="config-preview-block">
          <span class="config-preview-label">%userprofile%/.codex/config.toml</span>
          <textarea class="setting-textarea config-preview-textarea" :value="codexConfigToml" rows="12" readonly />
        </div>
        <div class="config-preview-block">
          <span class="config-preview-label">%userprofile%/.codex/auth.json</span>
          <textarea class="setting-textarea setting-textarea-sm config-preview-textarea" :value="codexAuthJson" rows="4" readonly />
        </div>
      </div>
    </section>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state glass-panel">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配的 Sub2API 设置项</div>
      <div class="empty-desc">请尝试搜索路由、模型、Codex、Responses 或网关等关键词。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { useSub2ApiStore } from '@/stores/sub2api'
import { getModelCapabilityLabels, getModelLimitLabels } from '@/utils/ai'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'
import {
  SUB2API_GATEWAY_PLACEHOLDER,
  SUB2API_MODE_PRESETS,
  buildSub2ApiAiPatch,
  createSub2ApiCodexAuthJson,
  createSub2ApiCodexConfigToml,
  getSub2ApiPreferredModel,
  normalizeSub2ApiGatewayRoot,
  resolveSub2ApiMode,
  type Sub2ApiMode
} from '@/utils/sub2api'

const props = defineProps<{ searchQuery?: string }>()

const router = useRouter()
const aiStore = useAIStore()
const sub2ApiStore = useSub2ApiStore()
const showApiKey = ref(false)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const modeOptions = Object.values(SUB2API_MODE_PRESETS)
const activeMode = computed(() => sub2ApiStore.config.activeMode)
const activePreset = computed(() => SUB2API_MODE_PRESETS[activeMode.value])
const gatewayRoot = computed({
  get: () => sub2ApiStore.config.gatewayRoot,
  set: (value: string) => {
    void sub2ApiStore.setGatewayRoot(value)
  }
})
const apiKey = computed({
  get: () => sub2ApiStore.config.apiKey,
  set: (value: string) => {
    void sub2ApiStore.setApiKey(value)
  }
})
const activeBaseUrl = computed(() => sub2ApiStore.activeBaseUrl)
const activeCatalog = computed(() => sub2ApiStore.modelRegistry[activeMode.value])
const activeModels = computed(() => sub2ApiStore.getModelsForMode(activeMode.value))
const activeChecks = computed(() => sub2ApiStore.getChecksForMode(activeMode.value))
const preferredModel = computed(() => getSub2ApiPreferredModel(sub2ApiStore.config, activeMode.value))
const currentAiMode = computed(() => resolveSub2ApiMode(aiStore.config.connectionTemplate))
const currentAiModeLabel = computed(() => currentAiMode.value ? SUB2API_MODE_PRESETS[currentAiMode.value].title : '未绑定 Sub2API')
const modelStatusLabel = computed(() => {
  if (sub2ApiStore.loadingMode === activeMode.value) {
    return '模型目录同步中'
  }

  if (activeCatalog.value.error) {
    return '上次同步失败'
  }

  if (activeModels.value.length > 0) {
    return `已缓存 ${activeModels.value.length} 个模型`
  }

  return '尚未读取模型目录'
})
const checksSummary = computed(() => {
  if (sub2ApiStore.checkingMode === activeMode.value) {
    return '检查中，会验证模型列表、当前路由和 Responses / Codex 能力。'
  }

  if (activeChecks.value.length === 0) {
    return '尚未执行检查。建议在调整 API Key、网关地址或路由后主动检查一次。'
  }

  const successCount = activeChecks.value.filter(item => item.state === 'success').length
  const failureCount = activeChecks.value.filter(item => item.state === 'error').length
  return `已完成 ${activeChecks.value.length} 项检查：成功 ${successCount} 项，失败 ${failureCount} 项。`
})
const codexConfigToml = computed(() => createSub2ApiCodexConfigToml(sub2ApiStore.config, getSub2ApiPreferredModel(sub2ApiStore.config, 'openai')))
const codexAuthJson = computed(() => createSub2ApiCodexAuthJson(sub2ApiStore.config.apiKey || aiStore.config.apiKey))
const filteredActiveModels = computed(() => activeModels.value.filter(model => matchesSearchQuery(
  normalizedSearchQuery.value,
  model.id,
  model.name,
  model.label,
  model.description,
  model.provider,
  getModelCapabilityLabels(model.capabilities),
  getModelLimitLabels(model.limits)
)))

const showHeroSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'Sub2API',
  '工作台',
  '网关',
  'Codex',
  'Responses',
  activePreset.value.title,
  currentAiModeLabel.value
))
const showConfigSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '网关',
  'API Key',
  '路由',
  'Claude',
  'OpenAI',
  'Antigravity',
  sub2ApiStore.config,
  activeBaseUrl.value
))
const showModelsSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '模型',
  '目录',
  preferredModel.value,
  activeModels.value
))
const showChecksSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '检查',
  'Responses',
  'Codex',
  '能力',
  activeChecks.value
))
const showCodexSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'Codex',
  'config.toml',
  'auth.json',
  codexConfigToml.value,
  codexAuthJson.value
))
const hasVisibleSection = computed(() => [
  showHeroSection.value,
  showConfigSection.value,
  showModelsSection.value,
  showChecksSection.value,
  showCodexSection.value
].some(Boolean))

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function setActiveMode(mode: Sub2ApiMode) {
  await sub2ApiStore.setActiveMode(mode)
}

async function setPreferredModel(modelName: string) {
  await sub2ApiStore.setPreferredModel(activeMode.value, modelName)
  showToast('success', `已将 ${modelName} 设为 ${activePreset.value.title} 默认模型`)
}

async function applyToAI(mode = activeMode.value) {
  if (!sub2ApiStore.configured) {
    showToast('error', '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  await aiStore.updateConfig(buildSub2ApiAiPatch(sub2ApiStore.config, mode))
  showToast('success', `已把 ${SUB2API_MODE_PRESETS[mode].title} 同步到 AI 助手`)
}

async function refreshActiveModels() {
  if (!sub2ApiStore.configured) {
    showToast('error', '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  try {
    const models = await sub2ApiStore.refreshModels(activeMode.value)
    if (models.length > 0) {
      showToast('success', `已读取 ${models.length} 个模型`)
      return
    }

    showToast('info', '接口可访问，但当前路由没有返回模型目录')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '读取模型目录失败')
  }
}

async function runChecksForActiveMode() {
  if (!sub2ApiStore.configured) {
    showToast('error', '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  try {
    const items = await sub2ApiStore.runChecks(activeMode.value)
    const hasError = items.some(item => item.state === 'error')
    showToast(hasError ? 'error' : 'success', hasError ? 'Sub2API 核心能力检查完成，存在失败项' : 'Sub2API 核心能力检查通过')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Sub2API 核心能力检查失败')
  }
}

function openSub2ApiAdmin() {
  if (!sub2ApiStore.adminUrl) {
    showToast('error', '请先填写 Sub2API 网关根地址')
    return
  }

  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(sub2ApiStore.adminUrl)
    return
  }

  window.open(sub2ApiStore.adminUrl, '_blank', 'noopener,noreferrer')
}

function openAISettingsPage() {
  void router.push('/ai-settings')
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('success', `${label} 已复制`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `${label} 复制失败`)
  }
}
</script>

<style lang="scss" scoped>
.sub2api-page {
  display: grid;
  gap: 18px;
}

.page-hero,
.section {
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
    max-width: 720px;
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

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: min(100%, 420px);
}

.hero-metric {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: rgba(255, 255, 255, 0.62);

  span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  strong {
    color: var(--text-primary);
    font-size: 15px;
  }
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
}

.section-desc {
  margin: 8px 0 0;
  color: var(--text-secondary);
  line-height: 1.8;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.config-field {
  display: grid;
  gap: 8px;

  span {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.setting-input,
.setting-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus {
    outline: none;
    border-color: rgba(18, 85, 92, 0.35);
    box-shadow: 0 0 0 3px rgba(18, 85, 92, 0.1);
  }
}

.setting-input {
  min-height: 42px;
  padding: 0 14px;
}

.setting-textarea {
  min-height: 140px;
  padding: 12px 14px;
  resize: vertical;
}

.setting-textarea-sm {
  min-height: 96px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.toggle-visibility-btn {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    background: rgba(18, 85, 92, 0.08);
    color: var(--text-primary);
  }
}

.input-wrap .setting-input {
  padding-right: 42px;
}

.route-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.route-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.14);
  background: rgba(255, 255, 255, 0.62);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.28);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: linear-gradient(135deg, rgba(255, 249, 234, 0.85), rgba(222, 243, 236, 0.82));
  }
}

.provider-card-tag,
.route-pill,
.route-chip,
.status-chip,
.model-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.provider-card-tag,
.route-pill {
  background: rgba(18, 85, 92, 0.08);
  color: #12555c;
}

.route-pill {
  max-width: 100%;
  word-break: break-all;
}

.route-strip,
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.route-chip,
.status-chip {
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-secondary);
  border: 1px solid rgba(18, 85, 92, 0.08);

  &.is-accent {
    color: #12555c;
    background: rgba(221, 243, 236, 0.88);
  }
}

.inline-error {
  margin-top: 12px;
  color: #b42318;
  font-size: 12px;
  line-height: 1.7;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.model-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.12);
  background: rgba(255, 255, 255, 0.62);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.24);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: linear-gradient(135deg, rgba(255, 250, 240, 0.88), rgba(226, 246, 240, 0.88));
  }
}

.model-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
  }
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.model-tag {
  background: rgba(93, 135, 255, 0.1);
  color: #2d4f99;

  &.is-muted {
    background: rgba(180, 180, 180, 0.14);
    color: var(--text-secondary);
  }

  &.is-limit {
    background: rgba(255, 174, 113, 0.16);
    color: #9a3412;
  }
}

.check-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: rgba(255, 255, 255, 0.78);

  span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
    text-align: right;
  }

  &.is-success {
    border-color: rgba(18, 120, 96, 0.18);
    background: rgba(228, 248, 239, 0.88);
  }

  &.is-error {
    border-color: rgba(180, 35, 24, 0.16);
    background: rgba(254, 243, 242, 0.92);
  }

  &.is-pending {
    border-color: rgba(18, 85, 92, 0.14);
    background: rgba(243, 248, 251, 0.92);
  }
}

.check-copy {
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: 13px;
  }

  small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.6;
    word-break: break-all;
  }
}

.config-preview-grid {
  display: grid;
  gap: 12px;
}

.config-preview-block {
  display: grid;
  gap: 6px;
}

.config-preview-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.config-preview-textarea {
  font-family: 'Consolas', 'Cascadia Mono', 'SFMono-Regular', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;
}

.empty-state.compact {
  padding: 28px 18px;
}

.empty-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.empty-desc {
  color: var(--text-secondary);
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .hero-metrics,
  .config-grid,
  .route-grid,
  .model-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-hero,
  .section-head,
  .check-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>