<template>
  <div class="account-management-page">
    <section class="hero-panel glass-panel">
      <div class="hero-copy">
        <span class="hero-eyebrow">{{ APP_NAME }}</span>
        <h2>账号管理工作台</h2>
        <p>把账号类型、账号列表、批量导入导出与操作记录统一收口，成本和利润只作为可选业务元数据保留，不再占据主导航。</p>
      </div>

      <div class="hero-stat-grid">
        <article v-for="card in filteredSummaryCards" :key="card.label" class="hero-stat-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.description }}</small>
        </article>
      </div>
    </section>

    <section class="workflow-panel glass-panel" v-if="filteredQuickActions.length">
      <div class="section-head">
        <div>
          <h3>核心流程</h3>
          <p>从这里进入类型维护、批量导入导出和操作追踪。</p>
        </div>
      </div>

      <div class="workflow-grid">
        <router-link
          v-for="action in filteredQuickActions"
          :key="action.title"
          :to="action.to"
          class="workflow-card"
        >
          <div class="workflow-card-head">
            <div class="workflow-icon" :style="{ background: action.background }">
              <svg width="18" height="18"><use :href="action.icon"/></svg>
            </div>
            <span class="workflow-arrow">进入</span>
          </div>
          <strong>{{ action.title }}</strong>
          <p>{{ action.description }}</p>
        </router-link>
      </div>
    </section>

    <section class="type-panel glass-panel" v-if="filteredTypeCards.length">
      <div class="section-head">
        <div>
          <h3>账号类型总览</h3>
          <p>优先围绕类型组织账号结构，后续导入、导出和检索都会复用这里的字段规则。</p>
        </div>
        <router-link to="/types" class="btn btn-primary btn-sm">
          <svg width="16" height="16"><use href="#icon-plus"/></svg>
          管理类型
        </router-link>
      </div>

      <div class="type-grid">
        <article v-for="card in filteredTypeCards" :key="card.type.id" class="type-card glass-card">
          <div class="type-card-head">
            <div class="type-title-row">
              <span class="type-dot" :style="{ background: card.type.color }"></span>
              <div>
                <strong>{{ card.type.name }}</strong>
                <p>{{ card.type.fields.length }} 个字段，最近更新于 {{ card.updatedAt }}</p>
              </div>
            </div>
            <router-link :to="`/accounts/list/${card.type.id}`" class="btn btn-secondary btn-sm">查看账号</router-link>
          </div>

          <div class="type-card-metrics">
            <div>
              <span>账号总数</span>
              <strong>{{ card.total }}</strong>
            </div>
            <div>
              <span>在库数量</span>
              <strong>{{ card.inStock }}</strong>
            </div>
            <div>
              <span>已出库</span>
              <strong>{{ card.exported }}</strong>
            </div>
          </div>

          <div class="type-field-list">
            <span v-for="field in card.type.fields" :key="field.key" class="field-chip">
              {{ field.name }}
              <small v-if="field.required">必填</small>
            </span>
          </div>

          <div class="type-card-actions">
            <router-link :to="`/import/${card.type.id}`" class="btn btn-secondary btn-sm">导入</router-link>
            <router-link :to="`/export/${card.type.id}`" class="btn btn-secondary btn-sm">导出</router-link>
          </div>
        </article>
      </div>
    </section>

    <section v-else-if="!normalizedSearchQuery" class="empty-state glass-panel account-empty">
      <svg width="64" height="64"><use href="#icon-types"/></svg>
      <div class="empty-title">先创建账号类型，再开始管理账号</div>
      <div class="empty-desc">类型字段会决定导入格式、导出结构和账号列表展示，是整个账号管理流程的基础。</div>
      <router-link to="/types" class="btn btn-primary">
        <svg width="16" height="16"><use href="#icon-plus"/></svg>
        创建第一个类型
      </router-link>
    </section>

    <section class="meta-note glass-panel" v-if="showMetaNote">
      <strong>可选业务元数据</strong>
      <p>来源、去处、总成本和总利润依然可以在导入导出时填写，但现在只作为可选记录项，不再驱动单独的统计页和账单导航。</p>
    </section>

    <div v-if="showSearchEmpty" class="empty-state glass-panel account-empty">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配的账号管理内容</div>
      <div class="empty-desc">请尝试更换搜索词，或进入具体类型页继续筛选。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useAccountStore } from '@/stores/account'
import { useAccountTypeStore } from '@/stores/accountType'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { APP_NAME } from '@/utils/appMeta'

const props = defineProps<{ searchQuery?: string }>()

const accountStore = useAccountStore()
const typeStore = useAccountTypeStore()
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const recentOperationCount = computed(() => {
  const threshold = dayjs().subtract(7, 'day').valueOf()
  const recentImports = accountStore.importBatches.filter(batch => batch.time >= threshold).length
  const recentExports = accountStore.exportBatches.filter(batch => batch.time >= threshold).length
  return recentImports + recentExports
})

const summaryCards = computed(() => [
  {
    label: '账号类型',
    value: typeStore.typeList.length,
    description: '字段模板与导入导出规则都从这里开始。'
  },
  {
    label: '账号总数',
    value: accountStore.accounts.length,
    description: '当前已收录的全部账号条目。'
  },
  {
    label: '在库账号',
    value: accountStore.accounts.filter(account => account.status === 'in_stock').length,
    description: '仍可继续筛选、导出或补充备注的账号。'
  },
  {
    label: '近 7 天操作',
    value: recentOperationCount.value,
    description: '最近一周导入与导出批次总数。'
  }
])

const quickActions = [
  {
    title: '账号类型',
    description: '创建字段结构、调整分隔符规则，并统一维护类型模板。',
    to: '/types',
    icon: '#icon-types',
    background: 'rgba(110, 193, 228, 0.14)'
  },
  {
    title: '批量导入',
    description: '按类型规则粘贴原始账号文本，快速完成批量入库。',
    to: '/import',
    icon: '#icon-import',
    background: 'rgba(232, 120, 154, 0.14)'
  },
  {
    title: '批量导出',
    description: '从在库账号中批量选择目标，导出文本并记录去向。',
    to: '/export',
    icon: '#icon-export',
    background: 'rgba(92, 201, 167, 0.14)'
  },
  {
    title: '操作记录',
    description: '统一查看导入导出批次，回溯来源、去处和时间线。',
    to: '/records',
    icon: '#icon-records',
    background: 'rgba(245, 183, 78, 0.14)'
  }
]

const typeCards = computed(() => typeStore.typeList.map(type => {
  const accounts = accountStore.getByType(type.id)
  const inStock = accountStore.getInStockByType(type.id).length

  return {
    type,
    total: accounts.length,
    inStock,
    exported: accounts.length - inStock,
    updatedAt: dayjs(type.updatedAt || type.createdAt).format('YYYY-MM-DD HH:mm')
  }
}))

const filteredSummaryCards = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return summaryCards.value
  }

  return summaryCards.value.filter(card => matchesSearchQuery(query, card.label, card.value, card.description))
})

const filteredQuickActions = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return quickActions
  }

  return quickActions.filter(action => matchesSearchQuery(query, action.title, action.description, action.to))
})

const filteredTypeCards = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return typeCards.value
  }

  return typeCards.value.filter(card => matchesSearchQuery(
    query,
    card.type.name,
    card.type.fields,
    card.total,
    card.inStock,
    card.exported,
    card.updatedAt
  ))
})

const showMetaNote = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '可选业务元数据',
  '来源',
  '去处',
  '成本',
  '利润'
))

const showSearchEmpty = computed(() => Boolean(normalizedSearchQuery.value)
  && filteredSummaryCards.value.length === 0
  && filteredQuickActions.value.length === 0
  && filteredTypeCards.value.length === 0
  && !showMetaNote.value)
</script>

<style lang="scss" scoped>
.account-management-page {
  display: grid;
  gap: $spacing-lg;
}

.hero-panel,
.workflow-panel,
.type-panel,
.meta-note {
  padding: 22px;
}

.hero-panel {
  display: grid;
  gap: 20px;
  background:
    radial-gradient(circle at top right, rgba(232, 120, 154, 0.16), transparent 28%),
    radial-gradient(circle at bottom left, rgba(110, 193, 228, 0.18), transparent 32%),
    rgba(255, 255, 255, 0.66);
}

.hero-copy {
  display: grid;
  gap: 10px;

  h2 {
    margin: 0;
    font-size: 30px;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    max-width: 760px;
    color: var(--text-secondary);
    line-height: 1.8;
  }
}

.hero-eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.12);
  color: #2d4f99;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-stat-grid,
.workflow-grid,
.type-grid {
  display: grid;
  gap: 14px;
}

.hero-stat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.hero-stat-card,
.workflow-card,
.type-card {
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.72);
}

.hero-stat-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;

  span,
  small {
    color: var(--text-secondary);
  }

  strong {
    font-size: 28px;
    color: var(--text-primary);
    line-height: 1;
  }
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    font-size: 20px;
    color: var(--text-primary);
  }

  p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.workflow-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.workflow-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 20px;
  color: inherit;
  text-decoration: none;
  transition: transform $transition-fast, box-shadow $transition-fast, border-color $transition-fast;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 32px rgba(25, 38, 74, 0.08);
    border-color: rgba(93, 135, 255, 0.18);
  }

  strong {
    color: var(--text-primary);
    font-size: 16px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.workflow-card-head,
.type-card-head,
.type-card-actions,
.type-title-row {
  display: flex;
  align-items: center;
}

.workflow-card-head,
.type-card-head {
  justify-content: space-between;
  gap: 12px;
}

.workflow-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}

.workflow-arrow {
  color: var(--text-muted);
  font-size: 13px;
}

.type-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.type-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 20px;
}

.type-title-row {
  gap: 12px;

  p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.type-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  flex-shrink: 0;
}

.type-card-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  div {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 16px;
    background: rgba(247, 248, 252, 0.86);
  }

  span {
    color: var(--text-muted);
    font-size: 12px;
  }

  strong {
    color: var(--text-primary);
    font-size: 20px;
  }
}

.type-field-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.1);
  color: #28488d;
  font-size: 12px;
  font-weight: 600;

  small {
    color: rgba(40, 72, 141, 0.82);
    font-size: 11px;
  }
}

.type-card-actions {
  gap: 10px;
}

.meta-note {
  display: grid;
  gap: 10px;

  strong {
    color: var(--text-primary);
    font-size: 16px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
  }
}

.account-empty {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 44px 24px;
  text-align: center;
}

@media (max-width: 1200px) {
  .hero-stat-grid,
  .workflow-grid,
  .type-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .hero-panel,
  .workflow-panel,
  .type-panel,
  .meta-note {
    padding: 18px;
  }

  .hero-stat-grid,
  .workflow-grid,
  .type-grid,
  .type-card-metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-head,
  .type-card-head {
    flex-direction: column;
    align-items: stretch;
  }

  .type-card-actions {
    flex-wrap: wrap;
  }
}
</style>