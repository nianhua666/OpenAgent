<template>
  <div class="records-page">
    <div class="page-header">
      <h2>操作记录</h2>
      <div class="header-actions">
        <select class="input" v-model="recordType" style="width:130px">
          <option value="all">全部</option>
          <option value="import">导入记录</option>
          <option value="export">导出记录</option>
        </select>
        <select class="input" v-model="selectedTypeId" style="width:150px">
          <option value="">全部类型</option>
          <option v-for="t in typeStore.typeList" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <select class="input" v-model="sortDir" style="width:130px">
          <option value="desc">最新在前</option>
          <option value="asc">最早在前</option>
        </select>
      </div>
    </div>

    <div class="records-list" v-if="sortedRecords.length">
      <div
        class="record-card glass-card"
        v-for="rec in sortedRecords"
        :key="rec.id"
      >
        <div class="record-icon" :class="rec.recordType">
          <svg width="18" height="18"><use :href="rec.recordType === 'import' ? '#icon-import' : '#icon-export'"/></svg>
        </div>
        <div class="record-info">
          <div class="record-main">
            <span class="badge" :class="rec.recordType === 'import' ? 'badge-primary' : 'badge-success'">
              {{ rec.recordType === 'import' ? '导入' : '导出' }}
            </span>
            <span class="record-type-name">{{ getTypeName(rec.typeId) }}</span>
            <span class="record-count">{{ rec.count }} 个账号</span>
          </div>
          <div class="record-detail">
            <span v-if="rec.recordType === 'import'">
              来源：{{ rec.label || '未标注' }} ｜ 成本：{{ formatMoney(rec.amount, currencySymbol) }}
            </span>
            <span v-else>
              去处：{{ rec.label || '未标注' }} ｜ 利润：{{ formatMoney(rec.amount, currencySymbol) }}
            </span>
          </div>
        </div>
        <div class="record-time">{{ formatTime(rec.time) }}</div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <svg width="64" height="64"><use href="#icon-records"/></svg>
      <div class="empty-title">暂无操作记录</div>
      <div class="empty-desc">导入或导出账号后，这里会显示操作历史</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useSettingsStore } from '@/stores/settings'
import { formatTime, formatMoney } from '@/utils/helpers'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'

const props = defineProps<{ searchQuery?: string }>()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()

const recordType = ref('all')
const selectedTypeId = ref('')
const sortDir = ref('desc')

const currencySymbol = computed(() => settingsStore.currencySymbol)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

interface RecordItem {
  id: string
  recordType: 'import' | 'export'
  typeId: string
  count: number
  label: string
  amount: number
  time: number
}

const allRecords = computed<RecordItem[]>(() => {
  const imports = accountStore.importBatches.map(b => ({
    id: b.id,
    recordType: 'import' as const,
    typeId: b.typeId,
    count: b.count,
    label: b.source,
    amount: b.totalCost,
    time: b.time
  }))

  const exports = accountStore.exportBatches.map(b => ({
    id: b.id,
    recordType: 'export' as const,
    typeId: b.typeId,
    count: b.count,
    label: b.destination,
    amount: b.totalProfit,
    time: b.time
  }))

  return [...imports, ...exports]
})

const filteredRecords = computed(() => {
  let list = allRecords.value
  if (recordType.value !== 'all') {
    list = list.filter(r => r.recordType === recordType.value)
  }
  if (selectedTypeId.value) {
    list = list.filter(r => r.typeId === selectedTypeId.value)
  }

  if (normalizedSearchQuery.value) {
    list = list.filter(record => matchesSearchQuery(
      normalizedSearchQuery.value,
      record.recordType === 'import' ? '导入' : '导出',
      getTypeName(record.typeId),
      record.label,
      record.count,
      record.amount,
      formatTime(record.time)
    ))
  }

  return list
})

const sortedRecords = computed(() => {
  const sorted = [...filteredRecords.value]
  sorted.sort((a, b) => sortDir.value === 'desc' ? b.time - a.time : a.time - b.time)
  return sorted
})

function getTypeName(typeId: string) {
  return typeStore.getType(typeId)?.name || '已删除类型'
}
</script>

<style lang="scss" scoped>
.records-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: $spacing-md;

  h2 { font-size: $font-xl; font-weight: 700; }
}

.header-actions {
  display: flex;
  gap: $spacing-sm;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.record-card {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md $spacing-lg;
}

.record-icon {
  width: 40px;
  height: 40px;
  border-radius: $border-radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.import {
    background: var(--primary-bg);
    color: var(--primary);
  }
  &.export {
    background: rgba(92,201,167,0.1);
    color: var(--success);
  }
}

.record-info {
  flex: 1;
  min-width: 0;
}

.record-main {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: 4px;
}

.record-type-name {
  font-weight: 600;
  font-size: $font-base;
  color: var(--text-primary);
}

.record-count {
  font-size: $font-sm;
  color: var(--text-muted);
}

.record-detail {
  font-size: $font-sm;
  color: var(--text-secondary);
}

.record-time {
  font-size: $font-sm;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
