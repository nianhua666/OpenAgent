<template>
  <div class="data-manage-page">
    <h2 class="page-title">数据管理</h2>

    <!-- 导出数据 -->
    <div class="section glass-panel" v-if="showExportSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-export"/></svg>
        导出数据
      </h3>
      <p class="section-desc">将数据导出为 JSON 文件，用于备份或迁移。</p>

      <div class="export-options">
        <button class="btn btn-primary" @click="exportAll">
          导出全部数据
        </button>
        <div class="type-export-list" v-if="filteredTypes.length">
          <div class="label-main">按类型导出：</div>
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
      </div>
    </div>

    <!-- 导入数据 -->
    <div class="section glass-panel" v-if="showImportSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-import"/></svg>
        导入数据
      </h3>
      <p class="section-desc">从 JSON 文件恢复数据。注意：导入会覆盖现有的同类型数据。</p>

      <div class="import-options">
        <button class="btn btn-primary" @click="importAll">
          导入全部数据
        </button>
        <button class="btn btn-secondary" @click="importByType">
          导入某类型数据
        </button>
      </div>
    </div>

    <!-- 数据统计 -->
    <div class="section glass-panel" v-if="showStatsSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-data"/></svg>
        数据统计
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
      <p v-if="normalizedSearchQuery && filteredTypes.length === 0" class="search-empty-desc">当前搜索词没有匹配到任何类型统计。</p>
    </div>

    <!-- 危险操作 -->
    <div class="section glass-panel danger-section" v-if="showDangerSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-trash"/></svg>
        危险操作
      </h3>
      <div class="danger-actions">
        <div class="danger-item">
          <div>
            <div class="label-main">清空所有数据</div>
            <div class="label-desc">删除所有账号数据、类型和记录，此操作不可撤销</div>
          </div>
          <button class="btn btn-danger btn-sm" @click="confirmClearAll">清空数据</button>
        </div>
      </div>
    </div>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配设置项</div>
      <div class="empty-desc">请尝试其他搜索关键词</div>
    </div>

    <!-- 清空确认 -->
    <div class="modal-mask" v-if="showClearConfirm" @click.self="showClearConfirm = false">
      <div class="modal-content" style="max-width:420px">
        <h3 style="margin-bottom:12px;color:var(--danger)">确认清空所有数据</h3>
        <p style="color:var(--text-secondary);margin-bottom:16px">
          此操作将永久删除所有账号类型、账号数据和操作记录。建议先导出备份。
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
import { ref, computed } from 'vue'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { exportJsonFile, importJsonFile } from '@/utils/db'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'
import { APP_NAME, APP_VERSION } from '@/utils/appMeta'
import dayjs from 'dayjs'

const props = defineProps<{ searchQuery?: string }>()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()

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

const showExportSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '导出数据',
  '备份',
  '迁移',
  filteredTypes.value
))

const showImportSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '导入数据',
  '恢复数据',
  'json'
))

const showStatsSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '数据统计',
  filteredTypes.value,
  '在库',
  '账号'
))

const showDangerSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '危险操作',
  '清空所有数据',
  '删除'
))

const hasVisibleSection = computed(() => showExportSection.value || showImportSection.value || showStatsSection.value || showDangerSection.value)

function replaceImportedTypes(importedTypes: any[]) {
  const importedTypeIds = new Set<string>(importedTypes.map(type => type.id))
  typeStore.types = [
    ...typeStore.types.filter(type => !importedTypeIds.has(type.id)),
    ...importedTypes
  ]
}

async function replaceDataByTypeIds(typeIds: Set<string>, data: any) {
  await accountStore.setAllData({
    accounts: [
      ...accountStore.accounts.filter(account => !typeIds.has(account.typeId)),
      ...((data.accounts || []).filter((account: any) => typeIds.has(account.typeId)))
    ],
    importBatches: [
      ...accountStore.importBatches.filter(batch => !typeIds.has(batch.typeId)),
      ...((data.importBatches || []).filter((batch: any) => typeIds.has(batch.typeId)))
    ],
    exportBatches: [
      ...accountStore.exportBatches.filter(batch => !typeIds.has(batch.typeId)),
      ...((data.exportBatches || []).filter((batch: any) => typeIds.has(batch.typeId)))
    ]
  })
}

async function exportAll() {
  const data = {
    version: APP_VERSION,
    exportTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    accountTypes: typeStore.types,
    ...accountStore.getAllData()
  }
  const name = `${APP_NAME}-全部数据-${dayjs().format('YYYYMMDD')}.json`
  const ok = await exportJsonFile(name, data)
  if (ok) showToast('success', '数据导出成功')
}

async function exportByType(typeId: string, typeName: string) {
  const type = typeStore.getType(typeId)
  if (!type) return
  const accounts = accountStore.getByType(typeId)
  const importBatches = accountStore.getImportBatchesByType(typeId)
  const exportBatches = accountStore.getExportBatchesByType(typeId)

  const data = {
    version: APP_VERSION,
    exportTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    accountTypes: [type],
    accounts,
    importBatches,
    exportBatches
  }

  const name = `${APP_NAME}-${typeName}-${dayjs().format('YYYYMMDD')}.json`
  const ok = await exportJsonFile(name, data)
  if (ok) showToast('success', `「${typeName}」数据导出成功`)
}

async function importAll() {
  const data = await importJsonFile()
  if (!data) return

  if (!data.accountTypes || !data.accounts) {
    showToast('error', '无效的数据文件')
    return
  }

  const importedTypeIds = new Set<string>(data.accountTypes.map((type: any) => type.id))
  replaceImportedTypes(data.accountTypes)
  await typeStore.save()

  // 按类型覆盖，和界面文案保持一致
  await replaceDataByTypeIds(importedTypeIds, data)

  showToast('success', '数据导入成功')
}

async function importByType() {
  const data = await importJsonFile()
  if (!data) return

  if (!data.accountTypes?.length || !data.accounts) {
    showToast('error', '无效的数据文件')
    return
  }

  replaceImportedTypes(data.accountTypes)
  await typeStore.save()

  const typeIds = new Set<string>(data.accountTypes.map((t: any) => t.id))
  await replaceDataByTypeIds(typeIds, data)

  showToast('success', '类型数据导入成功')
}

function confirmClearAll() {
  clearConfirmText.value = ''
  showClearConfirm.value = true
}

async function doClearAll() {
  if (clearConfirmText.value !== 'CONFIRM') return

  typeStore.types = []
  await typeStore.save()

  await accountStore.setAllData({
    accounts: [],
    importBatches: [],
    exportBatches: []
  })

  showToast('success', '所有数据已清空')
  showClearConfirm.value = false
}
</script>

<style lang="scss" scoped>
.data-manage-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  max-width: 780px;
}

.page-title { font-size: $font-xl; font-weight: 700; }

.section { padding: $spacing-lg; }

.section-title {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-md;
  font-weight: 600;
  margin-bottom: $spacing-sm;
  svg { color: var(--primary); }
}

.search-empty-desc {
  margin-top: $spacing-sm;
  color: var(--text-muted);
  font-size: $font-sm;
}

.section-desc {
  font-size: $font-sm;
  color: var(--text-muted);
  margin-bottom: $spacing-lg;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.type-export-list {
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

.import-options {
  display: flex;
  gap: $spacing-md;
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

  &:last-child { border-bottom: none; }
  &.total { font-weight: 600; }

  .type-dot { width: 8px; height: 8px; border-radius: 50%; }
  .stat-name { flex: 1; font-size: $font-sm; }
  .stat-val { font-size: $font-sm; color: var(--text-secondary); min-width: 80px; }
}

.danger-section {
  border: 1px solid rgba(232, 93, 117, 0.2);

  .section-title svg { color: var(--danger); }
}

.danger-actions { padding: $spacing-sm 0; }

.danger-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;

  .label-main { font-size: $font-base; font-weight: 500; }
  .label-desc { font-size: $font-xs; color: var(--text-muted); margin-top: 2px; }
}
</style>
