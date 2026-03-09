<template>
  <div class="account-list">
    <div class="page-header">
      <div class="header-left">
        <span class="type-dot" :style="{ background: currentType?.color }"></span>
        <h2>{{ currentType?.name || '账号列表' }}</h2>
        <span class="badge badge-primary">{{ filteredAccounts.length }} 条</span>
      </div>
      <div class="header-actions">
        <select class="input" v-model="statusFilter" style="width:130px">
          <option value="all">全部状态</option>
          <option value="in_stock">在库</option>
          <option value="exported">已出库</option>
        </select>
        <select class="input" v-model="sortOrder" style="width:160px">
          <option value="import_desc">导入时间(新→旧)</option>
          <option value="import_asc">导入时间(旧→新)</option>
          <option value="export_desc">导出时间(新→旧)</option>
          <option value="export_asc">导出时间(旧→新)</option>
          <option value="cost_desc">成本(可选，高→低)</option>
          <option value="cost_asc">成本(可选，低→高)</option>
        </select>
        <router-link :to="`/import/${typeId}`" class="btn btn-primary btn-sm">
          <svg width="14" height="14"><use href="#icon-import"/></svg>
          导入
        </router-link>
        <router-link :to="`/export/${typeId}`" class="btn btn-success btn-sm">
          <svg width="14" height="14"><use href="#icon-export"/></svg>
          导出
        </router-link>
      </div>
    </div>

    <!-- 搜索 -->
    <div class="search-bar glass-card">
      <svg width="16" height="16"><use href="#icon-search"/></svg>
      <input class="search-input" v-model="searchText" placeholder="模糊搜索账号数据、备注、来源..." />
      <button class="btn btn-ghost btn-sm" v-if="searchText" @click="searchText = ''">
        <svg width="14" height="14"><use href="#icon-close"/></svg>
      </button>
    </div>

    <!-- 表格 -->
    <div class="table-wrap glass-panel" v-if="paginatedAccounts.length">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40px">
              <input type="checkbox" :checked="isAllChecked" @change="toggleAll" />
            </th>
            <th v-for="field in currentType?.fields" :key="field.key">{{ field.name }}</th>
            <th>状态</th>
            <th>来源</th>
            <th>成本(可选)</th>
            <th>备注</th>
            <th>导入时间</th>
            <th style="width:100px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="acc in paginatedAccounts" :key="acc.id">
            <td>
              <input type="checkbox" :checked="selectedIds.has(acc.id)" @change="toggleSelect(acc.id)" />
            </td>
            <td v-for="field in currentType?.fields" :key="field.key">
              <span class="cell-text">{{ acc.data[field.key] || '-' }}</span>
            </td>
            <td>
              <span class="badge" :class="acc.status === 'in_stock' ? 'badge-success' : 'badge-warning'">
                {{ acc.status === 'in_stock' ? '在库' : '已出库' }}
              </span>
            </td>
            <td><span class="cell-text text-muted">{{ acc.source || '-' }}</span></td>
            <td>{{ formatMoney(acc.cost, currencySymbol) }}</td>
            <td>
              <div class="note-cell" @click="openNoteEditor(acc)">
                {{ acc.notes || '点击添加' }}
                <svg width="12" height="12"><use href="#icon-edit"/></svg>
              </div>
            </td>
            <td><span class="text-muted">{{ formatTime(acc.importTime) }}</span></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-ghost btn-sm" @click="copyAccountData(acc)" title="复制">
                  <svg width="14" height="14"><use href="#icon-copy"/></svg>
                </button>
                <button class="btn btn-ghost btn-sm" @click="confirmDeleteOne(acc.id)" title="删除">
                  <svg width="14" height="14"><use href="#icon-trash"/></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="empty-state" v-else-if="!searchText">
      <svg width="64" height="64"><use href="#icon-box"/></svg>
      <div class="empty-title">暂无账号数据</div>
      <div class="empty-desc">点击「导入」按钮添加账号</div>
    </div>

    <div class="empty-state" v-else>
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配数据</div>
      <div class="empty-desc">请尝试其他搜索关键词</div>
    </div>

    <!-- 分页 -->
    <div class="table-footer" v-if="totalPages > 1">
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页，共 {{ filteredAccounts.length }} 条</span>
      <div class="pagination">
        <button class="page-btn" :disabled="currentPage <= 1" @click="currentPage--">&lt;</button>
        <button
          v-for="p in visiblePages"
          :key="p"
          class="page-btn"
          :class="{ active: p === currentPage }"
          @click="currentPage = p"
        >{{ p }}</button>
        <button class="page-btn" :disabled="currentPage >= totalPages" @click="currentPage++">&gt;</button>
      </div>
    </div>

    <!-- 备注编辑弹窗 -->
    <div class="modal-mask" v-if="noteEditing" @click.self="noteEditing = null">
      <div class="modal-content" style="max-width:440px">
        <h3 style="margin-bottom:12px">编辑备注</h3>
        <textarea class="input" v-model="noteText" rows="4" placeholder="输入备注内容..."></textarea>
        <div class="modal-footer" style="margin-top:16px">
          <button class="btn btn-secondary" @click="noteEditing = null">取消</button>
          <button class="btn btn-primary" @click="saveNote">保存</button>
        </div>
      </div>
    </div>

    <!-- 批量删除确认 -->
    <div class="batch-bar glass-card" v-if="selectedIds.size > 0">
      <span>已选择 {{ selectedIds.size }} 个账号</span>
      <button class="btn btn-danger btn-sm" @click="batchDelete">批量删除</button>
      <button class="btn btn-ghost btn-sm" @click="selectedIds.clear()">取消选择</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useSettingsStore } from '@/stores/settings'
import { formatTime, formatMoney } from '@/utils/helpers'
import { showToast } from '@/utils/toast'
import Fuse from 'fuse.js'
import type { Account } from '@/types'

const props = defineProps<{ searchQuery?: string }>()
const route = useRoute()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()

const typeId = computed(() => route.params.typeId as string)
const currentType = computed(() => typeStore.getType(typeId.value))
const currencySymbol = computed(() => settingsStore.currencySymbol)

const statusFilter = ref('all')
const sortOrder = ref('import_desc')
const searchText = ref('')
const currentPage = ref(1)
const pageSize = computed(() => settingsStore.settings.defaultPageSize)
const selectedIds = ref(new Set<string>())
const noteEditing = ref<Account | null>(null)
const noteText = ref('')

// 搜索联动
watch(() => props.searchQuery, (q) => {
  if (q !== undefined) searchText.value = q
}, { immediate: true })

// 过滤与排序
const allAccounts = computed(() => accountStore.getByType(typeId.value))

const filteredAccounts = computed(() => {
  let list = allAccounts.value

  // 状态过滤
  if (statusFilter.value !== 'all') {
    list = list.filter(a => a.status === statusFilter.value)
  }

  // 模糊搜索
  if (searchText.value.trim()) {
    const fuse = new Fuse(list, {
      keys: [
        ...((currentType.value?.fields || []).map(f => `data.${f.key}`)),
        'notes', 'source'
      ],
      threshold: 0.4
    })
    list = fuse.search(searchText.value).map(r => r.item)
  }

  // 排序
  const sorted = [...list]
  switch (sortOrder.value) {
    case 'import_desc': sorted.sort((a, b) => b.importTime - a.importTime); break
    case 'import_asc': sorted.sort((a, b) => a.importTime - b.importTime); break
    case 'export_desc': sorted.sort((a, b) => (b.exportRecord?.exportTime || 0) - (a.exportRecord?.exportTime || 0)); break
    case 'export_asc': sorted.sort((a, b) => (a.exportRecord?.exportTime || 0) - (b.exportRecord?.exportTime || 0)); break
    case 'cost_desc': sorted.sort((a, b) => b.cost - a.cost); break
    case 'cost_asc': sorted.sort((a, b) => a.cost - b.cost); break
  }
  return sorted
})

// 分页
const totalPages = computed(() => Math.ceil(filteredAccounts.value.length / pageSize.value))
const paginatedAccounts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredAccounts.value.slice(start, start + pageSize.value)
})

const visiblePages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

watch(filteredAccounts, () => {
  if (currentPage.value > totalPages.value) {
    currentPage.value = Math.max(1, totalPages.value)
  }
})

// 全选
const isAllChecked = computed(() => {
  return paginatedAccounts.value.length > 0 &&
    paginatedAccounts.value.every(a => selectedIds.value.has(a.id))
})

function toggleAll() {
  if (isAllChecked.value) {
    paginatedAccounts.value.forEach(a => selectedIds.value.delete(a.id))
  } else {
    paginatedAccounts.value.forEach(a => selectedIds.value.add(a.id))
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

// 备注编辑
function openNoteEditor(acc: Account) {
  noteEditing.value = acc
  noteText.value = acc.notes || ''
}

async function saveNote() {
  if (noteEditing.value) {
    await accountStore.updateNote(noteEditing.value.id, noteText.value)
    showToast('success', '备注已更新')
    noteEditing.value = null
  }
}

// 复制账号数据
function copyAccountData(acc: Account) {
  if (!currentType.value) return
  const sep = currentType.value.exportSeparator || '-'
  const text = currentType.value.fields.map(f => acc.data[f.key] || '').join(sep)
  navigator.clipboard.writeText(text)
  showToast('success', '已复制到剪贴板')
}

// 删除
async function confirmDeleteOne(id: string) {
  await accountStore.deleteAccounts([id])
  selectedIds.value.delete(id)
  showToast('success', '账号已删除')
}

async function batchDelete() {
  if (selectedIds.value.size === 0) return
  await accountStore.deleteAccounts([...selectedIds.value])
  showToast('success', `已删除 ${selectedIds.value.size} 个账号`)
  selectedIds.value.clear()
}
</script>

<style lang="scss" scoped>
.account-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: $spacing-md;
}

.header-left {
  display: flex;
  align-items: center;
  gap: $spacing-sm;

  .type-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  h2 {
    font-size: $font-xl;
    font-weight: 700;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;

  svg { color: var(--text-muted); flex-shrink: 0; }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    color: var(--text-primary);
    font-size: $font-base;

    &::placeholder { color: var(--text-muted); }
  }
}

.table-wrap {
  overflow-x: auto;
  padding: 0;
}

.cell-text {
  max-width: 200px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: var(--text-muted);
  font-size: $font-sm;
}

.note-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: $font-sm;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  svg { opacity: 0; transition: opacity $transition-fast; }
  &:hover svg { opacity: 1; }
  &:hover { color: var(--primary); }
}

.row-actions {
  display: flex;
  gap: 2px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .page-info {
    font-size: $font-sm;
    color: var(--text-muted);
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.batch-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-lg;
  z-index: 50;
  animation: slideUp 0.3s ease;

  span {
    font-size: $font-sm;
    color: var(--text-primary);
    font-weight: 500;
  }
}
</style>
