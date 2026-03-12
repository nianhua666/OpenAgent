<template>
  <div class="data-manage-page">
    <section class="page-hero glass-panel" v-if="showHeroSection">
      <div>
        <h2 class="page-title">数据管理</h2>
        <p class="page-desc">备份与恢复已经按账号域、AI 配置域、AI 记忆域拆分，导入时只覆盖当前所选数据域。</p>
      </div>
      <div class="hero-metrics">
        <div class="hero-metric">
          <span>账号</span>
          <strong>{{ accountStore.accounts.length }}</strong>
        </div>
        <div class="hero-metric">
          <span>AI 记忆</span>
          <strong>{{ aiMemoryCount }}</strong>
        </div>
        <div class="hero-metric">
          <span>会话</span>
          <strong>{{ aiSessionCount }}</strong>
        </div>
      </div>
    </section>

    <section class="section glass-panel" v-if="showAccountSection">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-data"/></svg>
            账号管理数据
          </h3>
          <p class="section-desc">包含账号类型、账号数据、导入批次与导出批次。导入时不会影响 AI 配置和 AI 记忆。</p>
        </div>
        <div class="domain-summary">
          <div class="summary-chip">
            <span>类型</span>
            <strong>{{ typeStore.typeList.length }}</strong>
          </div>
          <div class="summary-chip">
            <span>账号</span>
            <strong>{{ accountStore.accounts.length }}</strong>
          </div>
          <div class="summary-chip">
            <span>在库</span>
            <strong>{{ inStockCount }}</strong>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <button class="btn btn-primary" @click="exportAccountDomain">
          导出账号管理数据
        </button>
        <button class="btn btn-secondary" @click="importAccountDomain">
          导入账号管理数据
        </button>
      </div>

      <div class="aux-actions">
        <router-link class="link-chip" to="/import">进入账号导入页</router-link>
        <router-link class="link-chip" to="/export">进入账号导出页</router-link>
        <button class="btn btn-secondary btn-sm" @click="importByType">导入单类型备份</button>
      </div>

      <div class="type-export-list" v-if="filteredTypes.length">
        <div class="label-main">单独导出某个类型备份：</div>
        <div class="type-btns">
          <button
            v-for="type in filteredTypes"
            :key="type.id"
            class="btn btn-secondary btn-sm"
            @click="exportByType(type.id, type.name)"
          >
            <span class="type-dot" :style="{ background: type.color }"></span>
            {{ type.name }}
          </button>
        </div>
      </div>

      <div class="inline-note">
        新版完整备份会标记为整域恢复；旧版备份和单类型备份会自动退化为按类型覆盖，避免误清空其他账号数据。
      </div>
    </section>

    <section class="section glass-panel" v-if="showAIConfigSection">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-settings"/></svg>
            AI 配置
          </h3>
          <p class="section-desc">包含模型配置、AI 偏好、托管 MCP/Skills、TTS 与 Windows MCP 相关开关。导出文件会包含密钥与凭证，请妥善保管。</p>
        </div>
        <div class="domain-summary">
          <div class="summary-chip wide">
            <span>当前模型</span>
            <strong>{{ currentModelLabel }}</strong>
          </div>
          <div class="summary-chip">
            <span>TTS</span>
            <strong>{{ currentTTSEngineLabel }}</strong>
          </div>
          <div class="summary-chip">
            <span>MCP/技能</span>
            <strong>{{ enabledManagedCount }}</strong>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <button class="btn btn-primary" @click="exportAIConfigDomain">
          导出 AI 配置
        </button>
        <button class="btn btn-secondary" @click="importAIConfigDomain">
          导入 AI 配置
        </button>
      </div>

      <div class="inline-note">
        仅覆盖 AI 配置相关内容，不清空对话记录和长期记忆。
      </div>
    </section>

    <section class="section glass-panel" v-if="showAIMemorySection">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-ai"/></svg>
            AI 记忆
          </h3>
          <p class="section-desc">包含主窗口与 Live2D 会话、长期记忆、任务面板以及当前活动会话指针。导入后会整体替换当前 AI 记忆域。</p>
        </div>
        <div class="domain-summary">
          <div class="summary-chip">
            <span>主会话</span>
            <strong>{{ mainSessionCount }}</strong>
          </div>
          <div class="summary-chip">
            <span>Live2D</span>
            <strong>{{ live2dSessionCount }}</strong>
          </div>
          <div class="summary-chip">
            <span>任务</span>
            <strong>{{ aiStore.tasks.length }}</strong>
          </div>
          <div class="summary-chip">
            <span>长期记忆</span>
            <strong>{{ aiMemoryCount }}</strong>
          </div>
        </div>
      </div>

      <div class="action-grid">
        <button class="btn btn-primary" @click="exportAIMemoryDomain">
          导出 AI 记忆
        </button>
        <button class="btn btn-secondary" @click="importAIMemoryDomain">
          导入 AI 记忆
        </button>
      </div>

      <div class="inline-note">
        导入后的运行中任务会自动转为已阻塞，避免出现无运行时上下文的脏状态。
      </div>
    </section>

    <section class="section glass-panel" v-if="showStatsSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-data"/></svg>
        账号数据统计
      </h3>
      <div class="stat-table">
        <div class="stat-row" v-for="type in filteredTypes" :key="type.id">
          <span class="type-dot" :style="{ background: type.color }"></span>
          <span class="stat-name">{{ type.name }}</span>
          <span class="stat-val">{{ accountStore.getByType(type.id).length }} 个账号</span>
          <span class="stat-val">{{ accountStore.getInStockByType(type.id).length }} 在库</span>
        </div>
        <div class="stat-row total">
          <span class="stat-name">总计</span>
          <span class="stat-val">{{ accountStore.accounts.length }} 个账号</span>
          <span class="stat-val">{{ typeStore.typeList.length }} 个类型</span>
        </div>
      </div>
      <p v-if="normalizedSearchQuery && filteredTypes.length === 0" class="search-empty-desc">当前搜索词没有匹配到任何账号类型统计。</p>
    </section>

    <section class="section glass-panel danger-section" v-if="showDangerSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-trash"/></svg>
        危险操作
      </h3>
      <div class="danger-actions">
        <div class="danger-item">
          <div>
            <div class="label-main">清空账号管理数据</div>
            <div class="label-desc">删除所有账号类型、账号与导入导出记录，不影响 AI 配置和 AI 记忆。</div>
          </div>
          <button class="btn btn-danger btn-sm" @click="confirmClearAll">清空账号域</button>
        </div>
      </div>
    </section>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配设置项</div>
      <div class="empty-desc">请尝试其他搜索关键词</div>
    </div>

    <div class="modal-mask" v-if="showClearConfirm" @click.self="showClearConfirm = false">
      <div class="modal-content" style="max-width:420px">
        <h3 style="margin-bottom:12px;color:var(--danger)">确认清空账号管理数据</h3>
        <p style="color:var(--text-secondary);margin-bottom:16px">
          此操作将永久删除所有账号类型、账号数据与导入导出记录。建议先导出账号管理备份。
        </p>
        <p style="margin-bottom:16px">
          请输入 <code style="color:var(--danger);font-weight:700">CONFIRM</code> 以确认：
        </p>
        <input class="input" v-model="clearConfirmText" placeholder="输入 CONFIRM" />
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button class="btn btn-secondary" @click="showClearConfirm = false">取消</button>
          <button class="btn btn-danger" :disabled="clearConfirmText !== 'CONFIRM'" @click="doClearAll">确认清空</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useAIStore } from '@/stores/ai'
import { useAIResourcesStore } from '@/stores/aiResources'
import { useSettingsStore } from '@/stores/settings'
import { useSub2ApiStore } from '@/stores/sub2api'
import { exportJsonFile, importJsonFile } from '@/utils/db'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'
import { APP_NAME, APP_VERSION } from '@/utils/appMeta'
import { TTS_ENGINE_OPTIONS } from '@/utils/ttsCatalog'

const props = defineProps<{ searchQuery?: string }>()

const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const aiStore = useAIStore()
const aiResourcesStore = useAIResourcesStore()
const settingsStore = useSettingsStore()
const sub2ApiStore = useSub2ApiStore()

const showClearConfirm = ref(false)
const clearConfirmText = ref('')
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const filteredTypes = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return typeStore.typeList
  }

  return typeStore.typeList.filter(type => matchesSearchQuery(
    query,
    type.name,
    type.fields,
    type.importSeparator,
    type.exportSeparator,
    type.accountSeparator,
    type.exportAccountSeparator
  ))
})

const inStockCount = computed(() => accountStore.accounts.filter(account => account.status === 'in_stock').length)
const mainSessionCount = computed(() => aiStore.getSessions('main').length)
const live2dSessionCount = computed(() => aiStore.getSessions('live2d').length)
const aiSessionCount = computed(() => mainSessionCount.value + live2dSessionCount.value)
const aiMemoryCount = computed(() => aiStore.getMemories('main').length + aiStore.getMemories('live2d').length)
const currentModelLabel = computed(() => aiStore.config.model || '未设置')
const currentTTSEngineLabel = computed(() => TTS_ENGINE_OPTIONS.find(option => option.value === settingsStore.settings.ttsEngine)?.label || settingsStore.settings.ttsEngine)
const enabledManagedCount = computed(() => aiResourcesStore.enabledManagedMcpServers.length + aiResourcesStore.enabledSkills.length)

const showHeroSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '数据管理',
  '账号域',
  'AI 配置域',
  'AI 记忆域',
  APP_NAME
))

const showAccountSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '账号管理数据',
  '账号备份',
  '账号导入导出',
  '账号类型',
  filteredTypes.value,
  'json',
  '批次记录'
))

const showAIConfigSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'AI 配置',
  '模型配置',
  'API Key',
  'Sub2API',
  '托管 MCP',
  'Skills',
  'TTS',
  'Windows MCP',
  aiStore.config,
  sub2ApiStore.config,
  aiResourcesStore.registry
))

const showAIMemorySection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'AI 记忆',
  '长期记忆',
  '会话',
  '任务面板',
  'Live2D 会话',
  aiStore.sessions,
  aiStore.tasks,
  aiStore.getMemories('main'),
  aiStore.getMemories('live2d')
))

const showStatsSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '账号数据统计',
  filteredTypes.value,
  '在库',
  '账号'
))

const showDangerSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '危险操作',
  '清空账号管理数据',
  '删除账号',
  '重置账号'
))

const hasVisibleSection = computed(() => [
  showHeroSection.value,
  showAccountSection.value,
  showAIConfigSection.value,
  showAIMemorySection.value,
  showStatsSection.value,
  showDangerSection.value
].some(Boolean))

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAccountDomainData(value: unknown) {
  return isRecord(value) && Array.isArray(value.accountTypes) && Array.isArray(value.accounts)
}

function isAIConfigDomainData(value: unknown) {
  return isRecord(value) && isRecord(value.aiConfig)
}

function isAIMemoryDomainData(value: unknown) {
  return isRecord(value)
    && Array.isArray(value.sessions)
    && Array.isArray(value.memories)
    && Array.isArray(value.tasks)
    && isRecord(value.activeSessionIds)
}

function buildExportMeta(kind: 'account-domain' | 'ai-config' | 'ai-memory') {
  return {
    kind,
    app: APP_NAME,
    version: APP_VERSION,
    exportTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
  }
}

async function replaceDataByTypeIds(typeIds: Set<string>, data: Record<string, any>) {
  await accountStore.setAllData({
    accounts: [
      ...accountStore.accounts.filter(account => !typeIds.has(account.typeId)),
      ...((data.accounts || []).filter((account: Record<string, any>) => typeIds.has(account.typeId)))
    ],
    importBatches: [
      ...accountStore.importBatches.filter(batch => !typeIds.has(batch.typeId)),
      ...((data.importBatches || []).filter((batch: Record<string, any>) => typeIds.has(batch.typeId)))
    ],
    exportBatches: [
      ...accountStore.exportBatches.filter(batch => !typeIds.has(batch.typeId)),
      ...((data.exportBatches || []).filter((batch: Record<string, any>) => typeIds.has(batch.typeId)))
    ]
  })
}

async function importAccountDataByType(data: Record<string, any>) {
  const importedTypeIds = new Set<string>(data.accountTypes.map((type: Record<string, any>) => String(type.id)))
  const preservedTypes = typeStore.types.filter(type => !importedTypeIds.has(type.id))
  await typeStore.setAllTypes([...preservedTypes, ...data.accountTypes])
  await replaceDataByTypeIds(importedTypeIds, data)
}

async function exportAccountDomain() {
  const data = {
    ...buildExportMeta('account-domain'),
    accountScope: 'all',
    accountTypes: typeStore.types,
    ...accountStore.getAllData()
  }

  const ok = await exportJsonFile(`${APP_NAME}-账号管理数据-${dayjs().format('YYYYMMDD-HHmmss')}.json`, data)
  if (ok) {
    showToast('success', '账号管理数据导出成功')
  }
}

async function importAccountDomain() {
  const data = await importJsonFile()
  if (!data) {
    return
  }

  if (!isAccountDomainData(data)) {
    showToast('error', '无效的账号管理数据文件')
    return
  }

  if (data.accountScope === 'all') {
    await typeStore.setAllTypes(data.accountTypes)
    await accountStore.setAllData({
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      importBatches: Array.isArray(data.importBatches) ? data.importBatches : [],
      exportBatches: Array.isArray(data.exportBatches) ? data.exportBatches : []
    })
    showToast('success', '账号管理数据导入成功')
    return
  }

  await importAccountDataByType(data)
  showToast('success', '已按类型覆盖导入账号数据')
}

async function exportByType(typeId: string, typeName: string) {
  const type = typeStore.getType(typeId)
  if (!type) {
    return
  }

  const data = {
    ...buildExportMeta('account-domain'),
    accountScope: 'type',
    accountTypes: [type],
    accounts: accountStore.getByType(typeId),
    importBatches: accountStore.getImportBatchesByType(typeId),
    exportBatches: accountStore.getExportBatchesByType(typeId)
  }

  const ok = await exportJsonFile(`${APP_NAME}-${typeName}-${dayjs().format('YYYYMMDD-HHmmss')}.json`, data)
  if (ok) {
    showToast('success', `「${typeName}」数据导出成功`)
  }
}

async function exportAIConfigDomain() {
  const data = {
    ...buildExportMeta('ai-config'),
    aiConfig: aiStore.getConfigExportData(),
    sub2Api: sub2ApiStore.getExportData(),
    aiSettings: settingsStore.getAISettingsExportData(),
    aiResources: aiResourcesStore.getRegistryExportData()
  }

  const ok = await exportJsonFile(`${APP_NAME}-AI配置-${dayjs().format('YYYYMMDD-HHmmss')}.json`, data)
  if (ok) {
    showToast('success', 'AI 配置导出成功')
  }
}

async function importAIConfigDomain() {
  const data = await importJsonFile()
  if (!data) {
    return
  }

  if (!isAIConfigDomainData(data)) {
    showToast('error', '无效的 AI 配置文件')
    return
  }

  await aiStore.importConfigData(data.aiConfig)
  if (isRecord(data.sub2Api)) {
    await sub2ApiStore.importData(data.sub2Api)
  }
  await settingsStore.importAISettingsData(isRecord(data.aiSettings) ? data.aiSettings : null)

  if (isRecord(data.aiResources)) {
    await aiResourcesStore.importRegistryData(data.aiResources)
  }

  showToast('success', 'AI 配置导入成功')
}

async function exportAIMemoryDomain() {
  const data = {
    ...buildExportMeta('ai-memory'),
    ...aiStore.getMemoryExportData()
  }

  const ok = await exportJsonFile(`${APP_NAME}-AI记忆-${dayjs().format('YYYYMMDD-HHmmss')}.json`, data)
  if (ok) {
    showToast('success', 'AI 记忆导出成功')
  }
}

async function importAIMemoryDomain() {
  const data = await importJsonFile()
  if (!data) {
    return
  }

  if (!isAIMemoryDomainData(data)) {
    showToast('error', '无效的 AI 记忆文件')
    return
  }

  await aiStore.importMemoryData({
    sessions: data.sessions,
    memories: data.memories,
    tasks: data.tasks,
    activeSessionIds: data.activeSessionIds
  })

  showToast('success', 'AI 记忆导入成功')
}

async function importByType() {
  const data = await importJsonFile()
  if (!data) {
    return
  }

  if (!isAccountDomainData(data) || data.accountTypes.length === 0) {
    showToast('error', '无效的类型备份文件')
    return
  }

  await importAccountDataByType(data)
  showToast('success', '类型数据导入成功')
}

function confirmClearAll() {
  clearConfirmText.value = ''
  showClearConfirm.value = true
}

async function doClearAll() {
  if (clearConfirmText.value !== 'CONFIRM') {
    return
  }

  await typeStore.setAllTypes([])
  await accountStore.setAllData({
    accounts: [],
    importBatches: [],
    exportBatches: []
  })

  showToast('success', '账号管理数据已清空')
  showClearConfirm.value = false
}
</script>

<style lang="scss" scoped>
.data-manage-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  max-width: 980px;
}

.page-hero,
.section {
  padding: $spacing-lg;
}

.page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-lg;
}

.page-title {
  font-size: $font-xl;
  font-weight: 700;
}

.page-desc {
  margin-top: $spacing-xs;
  color: var(--text-secondary);
  max-width: 620px;
  line-height: 1.7;
}

.hero-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.hero-metric,
.summary-chip {
  min-width: 92px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.54);
}

.hero-metric span,
.summary-chip span {
  display: block;
  color: var(--text-muted);
  font-size: $font-xs;
}

.hero-metric strong,
.summary-chip strong {
  display: block;
  margin-top: 4px;
  color: var(--text-primary);
  font-size: $font-md;
  font-weight: 700;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-lg;
  margin-bottom: $spacing-lg;
}

.section-title {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-md;
  font-weight: 600;
  margin-bottom: $spacing-sm;

  svg {
    color: var(--primary);
  }
}

.section-desc {
  font-size: $font-sm;
  color: var(--text-muted);
  max-width: 620px;
  line-height: 1.7;
}

.domain-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.summary-chip.wide {
  min-width: 180px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: $spacing-md;
}

.aux-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
  margin-top: $spacing-md;
}

.link-chip {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.42);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all $transition-fast;

  &:hover {
    color: var(--primary);
    border-color: rgba(255, 184, 208, 0.52);
    transform: translateY(-1px);
  }
}

.inline-note {
  margin-top: $spacing-md;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.44);
  color: var(--text-secondary);
  font-size: $font-sm;
  line-height: 1.7;
}

.type-export-list {
  margin-top: $spacing-lg;

  .label-main {
    font-size: $font-sm;
    font-weight: 500;
    margin-bottom: $spacing-sm;
  }
}

.type-btns {
  display: flex;
  gap: $spacing-sm;
  flex-wrap: wrap;

  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
}

.stat-table {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm 0;
  border-bottom: 1px solid var(--border);

  &:last-child {
    border-bottom: none;
  }

  &.total {
    font-weight: 600;
  }

  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .stat-name {
    flex: 1;
    font-size: $font-sm;
  }

  .stat-val {
    min-width: 90px;
    font-size: $font-sm;
    color: var(--text-secondary);
    text-align: right;
  }
}

.search-empty-desc {
  margin-top: $spacing-sm;
  color: var(--text-muted);
  font-size: $font-sm;
}

.danger-section {
  border: 1px solid rgba(232, 93, 117, 0.2);

  .section-title svg {
    color: var(--danger);
  }
}

.danger-actions {
  padding: $spacing-sm 0;
}

.danger-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;

  .label-main {
    font-size: $font-base;
    font-weight: 500;
  }

  .label-desc {
    margin-top: 2px;
    font-size: $font-xs;
    color: var(--text-muted);
  }
}

@media (max-width: 960px) {
  .page-hero,
  .section-head,
  .danger-item {
    flex-direction: column;
  }

  .hero-metrics,
  .domain-summary {
    justify-content: flex-start;
  }

  .danger-item {
    align-items: flex-start;
  }
}
</style>
