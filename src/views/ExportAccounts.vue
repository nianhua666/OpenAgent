<template>
  <div class="export-page">
    <div class="page-header">
      <h2>导出账号</h2>
    </div>

    <!-- 选择类型 -->
    <div class="step-card glass-panel">
      <h3 class="step-title">1. 选择账号类型</h3>
      <div class="type-selector">
        <button
          v-for="type in filteredTypeList"
          :key="type.id"
          class="type-tab"
          :class="{ active: selectedTypeId === type.id }"
          @click="selectType(type.id)"
        >
          <span class="type-dot" :style="{ background: type.color }"></span>
          {{ type.name }}
          <span class="tab-count">({{ getInStockCount(type.id) }})</span>
        </button>
      </div>
    </div>

    <template v-if="selectedType && filteredInStockAccounts.length">
      <!-- 选择账号 -->
      <div class="step-card glass-panel">
        <h3 class="step-title">2. 选择要导出的账号</h3>
        <div class="select-actions">
          <button class="btn btn-secondary btn-sm" @click="selectAll">
            全部选择 ({{ filteredInStockAccounts.length }})
          </button>
          <button class="btn btn-secondary btn-sm" @click="deselectAll">
            取消全选
          </button>
          <span class="select-info">已选择 {{ selectedIds.size }} 个</span>
        </div>

        <div class="account-check-list">
          <label
            class="account-check-item glass-card"
            v-for="acc in filteredInStockAccounts"
            :key="acc.id"
          >
            <input type="checkbox" :checked="selectedIds.has(acc.id)" @change="toggleSelect(acc.id)" />
            <div class="acc-data">
              <span v-for="f in selectedType.fields" :key="f.key" class="acc-field">
                {{ acc.data[f.key] || '-' }}
              </span>
            </div>
            <span class="acc-source">{{ acc.source || '' }}</span>
          </label>
        </div>
      </div>

      <!-- 去处与利润（可选） -->
      <div class="step-card glass-panel">
        <h3 class="step-title">3. 去处与利润（可选）</h3>
        <div class="meta-grid">
          <div class="form-group">
            <label>去处标注（可选）</label>
            <input class="input" v-model="destination" placeholder="例如：客户A；不填也可直接导出" maxlength="100" />
          </div>
          <div class="form-group">
            <label>总利润（可选，{{ currencySymbol }}）</label>
            <input class="input" v-model="totalProfit" type="number" min="0" step="0.01" placeholder="留空则按未记录处理" />
          </div>
        </div>
        <div class="profit-hint" v-if="selectedIds.size > 0 && totalProfitNum > 0">
          单个账号利润：{{ formatMoney(totalProfitNum / selectedIds.size, currencySymbol) }}
        </div>
      </div>

      <!-- 导出预览 -->
      <div class="step-card glass-panel" v-if="selectedIds.size > 0">
        <h3 class="step-title">4. 导出预览</h3>
        <textarea class="input export-preview" readonly :value="exportText" rows="6"></textarea>
        <div class="preview-actions">
          <button class="btn btn-secondary btn-sm" @click="copyExportText">
            <svg width="14" height="14"><use href="#icon-copy"/></svg>
            复制内容
          </button>
        </div>
      </div>

      <!-- 提交 -->
      <div class="submit-bar">
        <button
          class="btn btn-primary btn-lg"
          :disabled="selectedIds.size === 0 || exporting"
          @click="doExport"
        >
          <svg width="18" height="18"><use href="#icon-export"/></svg>
          {{ exporting ? '导出中...' : `导出 ${selectedIds.size} 个账号` }}
        </button>
      </div>
    </template>

    <div class="empty-state" v-else-if="selectedType">
      <svg width="64" height="64"><use href="#icon-box"/></svg>
      <div class="empty-title">{{ normalizedSearchQuery ? '未找到匹配账号' : '该类型没有在库账号' }}</div>
      <div class="empty-desc">{{ normalizedSearchQuery ? '请尝试其他搜索关键词' : '先导入一些账号再来导出' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useSettingsStore } from '@/stores/settings'
import { formatMoney, formatAccountsText, parseFloat2 } from '@/utils/helpers'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'

const props = defineProps<{ searchQuery?: string }>()
const route = useRoute()
const router = useRouter()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()

const selectedTypeId = ref((route.params.typeId as string) || '')
const selectedIds = ref(new Set<string>())
const destination = ref('')
const totalProfit = ref('')
const exporting = ref(false)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const currencySymbol = computed(() => settingsStore.currencySymbol)
const selectedType = computed(() => selectedTypeId.value ? typeStore.getType(selectedTypeId.value) : undefined)
const totalProfitNum = computed(() => parseFloat2(totalProfit.value))

const inStockAccounts = computed(() =>
  selectedTypeId.value ? accountStore.getInStockByType(selectedTypeId.value) : []
)

const filteredTypeList = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return typeStore.typeList
  }

  return typeStore.typeList.filter(type => type.id === selectedTypeId.value || matchesSearchQuery(
    query,
    type.name,
    type.fields,
    type.importSeparator,
    type.exportSeparator
  ))
})

const filteredInStockAccounts = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return inStockAccounts.value
  }

  return inStockAccounts.value.filter(account => matchesSearchQuery(
    query,
    account.data,
    account.source,
    selectedType.value?.name,
    selectedType.value?.fields
  ))
})

watch(filteredInStockAccounts, (accounts) => {
  const visibleIds = new Set(accounts.map(account => account.id))
  selectedIds.value.forEach(id => {
    if (!visibleIds.has(id)) {
      selectedIds.value.delete(id)
    }
  })
}, { immediate: true })

function getInStockCount(typeId: string) {
  return accountStore.getInStockByType(typeId).length
}

function selectType(id: string) {
  selectedTypeId.value = id
  selectedIds.value.clear()
}

function selectAll() {
  filteredInStockAccounts.value.forEach(a => selectedIds.value.add(a.id))
}

function deselectAll() {
  selectedIds.value.clear()
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

// 导出文本预览
const exportText = computed(() => {
  if (!selectedType.value || selectedIds.value.size === 0) return ''
  const accounts = filteredInStockAccounts.value
    .filter(a => selectedIds.value.has(a.id))
    .map(a => a.data)
  return formatAccountsText(
    accounts,
    selectedType.value.fields.map(f => f.key),
    selectedType.value.exportSeparator,
    selectedType.value.exportAccountSeparator
  )
})

function copyExportText() {
  navigator.clipboard.writeText(exportText.value)
  showToast('success', '已复制到剪贴板')
}

async function doExport() {
  if (!selectedType.value || selectedIds.value.size === 0 || exporting.value) return
  exporting.value = true
  try {
    const batch = await accountStore.exportAccounts(
      selectedTypeId.value,
      [...selectedIds.value],
      destination.value.trim(),
      totalProfitNum.value
    )
    showToast('success', `成功导出 ${batch.count} 个账号`)
    selectedIds.value.clear()
    destination.value = ''
    totalProfit.value = ''
    router.push(`/accounts/list/${selectedTypeId.value}`)
  } catch {
    showToast('error', '导出失败')
  } finally {
    exporting.value = false
  }
}

watch(() => route.params.typeId, (id) => {
  if (id) selectType(id as string)
})
</script>

<style lang="scss" scoped>
.export-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  max-width: 900px;
}

.page-header h2 { font-size: $font-xl; font-weight: 700; }

.step-card { padding: $spacing-lg; }
.step-title { font-size: $font-md; font-weight: 600; margin-bottom: $spacing-md; }

.type-selector { display: flex; gap: $spacing-sm; flex-wrap: wrap; }
.type-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border: 1px solid var(--border); border-radius: 24px;
  background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  font-size: $font-sm; font-weight: 500; transition: all $transition-fast;
  &:hover { border-color: var(--primary); }
  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse); border-color: transparent;
  }
  .type-dot { width: 8px; height: 8px; border-radius: 50%; }
  .tab-count { opacity: 0.7; font-size: $font-xs; }
}

.select-actions {
  display: flex; align-items: center; gap: $spacing-sm; margin-bottom: $spacing-md;
  .select-info { font-size: $font-sm; color: var(--primary); font-weight: 500; margin-left: auto; }
}

.account-check-list {
  display: flex; flex-direction: column; gap: $spacing-xs;
  max-height: 400px; overflow-y: auto;
}

.account-check-item {
  display: flex; align-items: center; gap: $spacing-sm;
  padding: $spacing-sm $spacing-md; cursor: pointer;
  input[type="checkbox"] { accent-color: var(--primary); }
}

.acc-data {
  flex: 1; display: flex; gap: $spacing-sm; flex-wrap: wrap;
  .acc-field {
    font-size: $font-sm; color: var(--text-primary);
    &:not(:last-child)::after { content: '|'; margin-left: $spacing-sm; color: var(--text-muted); }
  }
}
.acc-source { font-size: $font-xs; color: var(--text-muted); }

.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: $spacing-md; }
.profit-hint { margin-top: $spacing-sm; font-size: $font-sm; color: var(--text-muted); }

.export-preview {
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.6;
  background: var(--bg-input);
}

.preview-actions { margin-top: $spacing-sm; display: flex; justify-content: flex-end; }
.submit-bar { display: flex; justify-content: center; }
</style>
