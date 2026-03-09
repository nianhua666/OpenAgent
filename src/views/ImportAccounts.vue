<template>
  <div class="import-page">
    <div class="page-header">
      <h2>导入账号</h2>
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
          @click="selectedTypeId = type.id"
        >
          <span class="type-dot" :style="{ background: type.color }"></span>
          {{ type.name }}
        </button>
        <router-link to="/types" class="btn btn-ghost btn-sm" v-if="!typeStore.typeList.length">
          <svg width="14" height="14"><use href="#icon-plus"/></svg>
          先创建类型
        </router-link>
      </div>
      <div v-if="normalizedSearchQuery && filteredTypeList.length === 0" class="search-empty-tip">
        未找到匹配的账号类型，请尝试更换关键词。
      </div>
    </div>

    <template v-if="selectedType">
      <!-- 格式提示 -->
      <div class="step-card glass-panel">
        <h3 class="step-title">2. 粘贴或输入账号数据</h3>
        <div class="format-hint">
          <span>格式：</span>
          <code>{{ formatHint }}</code>
          <span class="hint-sep">（字段分隔：<code>{{ selectedType.importSeparator || '无' }}</code>，账号分隔：<code>{{ selectedType.accountSeparator === '\n' ? '换行' : selectedType.accountSeparator }}</code>）</span>
        </div>
        <textarea
          class="input import-textarea"
          v-model="rawText"
          :placeholder="placeholder"
          rows="10"
        ></textarea>
        <div class="parse-info" v-if="rawText.trim()">
          解析到 <strong>{{ parsedAccounts.length }}</strong> 个账号
        </div>
        <div class="parse-error" v-if="invalidCount > 0">
          第 {{ invalidLineText }} 行缺少必填字段，修正后才能导入
        </div>
      </div>

      <!-- 来源与成本（可选） -->
      <div class="step-card glass-panel">
        <h3 class="step-title">3. 来源与成本（可选）</h3>
        <div class="import-meta-grid">
          <div class="form-group">
            <label>来源标注（可选）</label>
            <input class="input" v-model="source" placeholder="例如：某宝店铺A；不填也可直接导入" maxlength="100" />
          </div>
          <div class="form-group">
            <label>总成本（可选，{{ currencySymbol }}）</label>
            <input class="input" v-model="totalCost" type="number" min="0" step="0.01" placeholder="留空则按未记录处理" />
          </div>
        </div>
        <div class="cost-hint" v-if="parsedAccounts.length > 0 && totalCostNum > 0">
          单个账号成本：{{ formatMoney(totalCostNum / parsedAccounts.length, currencySymbol) }}
        </div>
      </div>

      <!-- 预览 -->
      <div class="step-card glass-panel" v-if="parsedAccounts.length">
        <h3 class="step-title">4. 数据预览（前10条）</h3>
        <div class="preview-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th v-for="f in selectedType.fields" :key="f.key">{{ f.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(acc, idx) in parsedAccounts.slice(0, 10)" :key="idx">
                <td>{{ idx + 1 }}</td>
                <td v-for="f in selectedType.fields" :key="f.key">
                  {{ acc[f.key] || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 提交 -->
      <div class="submit-bar">
        <button
          class="btn btn-primary btn-lg"
          :disabled="!canSubmit || importing"
          @click="doImport"
        >
          <svg width="18" height="18"><use href="#icon-import"/></svg>
          {{ importing ? '导入中...' : `导入 ${parsedAccounts.length} 个账号` }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useSettingsStore } from '@/stores/settings'
import { parseAccountsText, formatMoney, parseFloat2 } from '@/utils/helpers'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'

const props = defineProps<{ searchQuery?: string }>()
const route = useRoute()
const router = useRouter()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()

const selectedTypeId = ref((route.params.typeId as string) || '')
const rawText = ref('')
const source = ref('')
const totalCost = ref('')
const importing = ref(false)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const currencySymbol = computed(() => settingsStore.currencySymbol)
const selectedType = computed(() => selectedTypeId.value ? typeStore.getType(selectedTypeId.value) : undefined)
const totalCostNum = computed(() => parseFloat2(totalCost.value))

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
    type.accountSeparator
  ))
})

const formatHint = computed(() => {
  if (!selectedType.value) return ''
  const sep = selectedType.value.importSeparator || ''
  return selectedType.value.fields.map(f => `[${f.name}]`).join(sep)
})

const placeholder = computed(() => {
  if (!selectedType.value) return ''
  const sep = selectedType.value.importSeparator || ''
  const example = selectedType.value.fields.map(f => f.name + '值').join(sep)
  const accSep = selectedType.value.accountSeparator === '\n' ? '\n' : selectedType.value.accountSeparator
  return `每行一个账号，例如：\n${example}${accSep}${example}`
})

const parsedAccounts = computed(() => {
  if (!selectedType.value || !rawText.value.trim()) return []
  return parseAccountsText(
    rawText.value,
    selectedType.value.accountSeparator,
    selectedType.value.importSeparator,
    selectedType.value.fields.map(f => f.key)
  )
})

const invalidIndexes = computed(() => {
  if (!selectedType.value) return [] as number[]
  const requiredKeys = selectedType.value.fields
    .filter(field => field.required)
    .map(field => field.key)

  return parsedAccounts.value.reduce<number[]>((indexes, account, index) => {
    const hasMissingRequiredField = requiredKeys.some(key => !account[key]?.trim())
    if (hasMissingRequiredField) {
      indexes.push(index + 1)
    }
    return indexes
  }, [])
})

const invalidCount = computed(() => invalidIndexes.value.length)
const invalidLineText = computed(() => invalidIndexes.value.slice(0, 5).join('、'))

const canSubmit = computed(() => parsedAccounts.value.length > 0 && invalidCount.value === 0)

// 路由参数变化时同步
watch(() => route.params.typeId, (id) => {
  if (id) selectedTypeId.value = id as string
})

async function doImport() {
  if (!selectedType.value || !canSubmit.value || importing.value) return
  if (invalidCount.value > 0) {
    showToast('error', `第 ${invalidLineText.value} 行缺少必填字段`)
    return
  }
  importing.value = true
  try {
    const batch = await accountStore.importAccounts(
      selectedTypeId.value,
      parsedAccounts.value,
      source.value.trim(),
      totalCostNum.value
    )
    showToast('success', `成功导入 ${batch.count} 个账号`)
    rawText.value = ''
    source.value = ''
    totalCost.value = ''
    router.push(`/accounts/list/${selectedTypeId.value}`)
  } catch (err) {
    showToast('error', '导入失败，请检查数据格式')
  } finally {
    importing.value = false
  }
}
</script>

<style lang="scss" scoped>
.import-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  max-width: 900px;
}

.page-header h2 {
  font-size: $font-xl;
  font-weight: 700;
}

.step-card {
  padding: $spacing-lg;
}

.step-title {
  font-size: $font-md;
  font-weight: 600;
  margin-bottom: $spacing-md;
  color: var(--text-primary);
}

.type-selector {
  display: flex;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.type-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: $font-sm;
  font-weight: 500;
  transition: all $transition-fast;

  &:hover { border-color: var(--primary); color: var(--primary); }
  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse);
    border-color: transparent;
  }

  .type-dot { width: 8px; height: 8px; border-radius: 50%; }
}

.search-empty-tip {
  margin-top: $spacing-sm;
  color: var(--text-muted);
  font-size: $font-sm;
}

.format-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: $spacing-md;
  font-size: $font-sm;
  color: var(--text-secondary);
  flex-wrap: wrap;

  code {
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--primary-bg);
    color: var(--primary);
    font-size: $font-sm;
  }

  .hint-sep {
    color: var(--text-muted);
  }
}

.import-textarea {
  font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.6;
  min-height: 200px;
}

.parse-info {
  margin-top: $spacing-sm;
  font-size: $font-sm;
  color: var(--success);
}

.parse-error {
  margin-top: $spacing-sm;
  font-size: $font-sm;
  color: var(--danger);
}

.import-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md;
}

.cost-hint {
  margin-top: $spacing-sm;
  font-size: $font-sm;
  color: var(--text-muted);
}

.preview-table-wrap {
  max-height: 350px;
  overflow: auto;
  border-radius: $border-radius-sm;
}

.submit-bar {
  display: flex;
  justify-content: center;
}
</style>
