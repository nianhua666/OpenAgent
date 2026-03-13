<template>
  <section class="ide-plan-panel glass-panel">
    <div class="panel-head">
      <div>
        <p class="panel-eyebrow">Plan</p>
        <h3>项目计划</h3>
      </div>
      <span class="panel-badge">{{ plans.length }}</span>
    </div>

    <div v-if="plans.length > 0" class="plan-select">
      <label for="plan-selector">当前计划</label>
      <select id="plan-selector" class="input" :value="selectedPlanId || selectedPlan?.id || ''" @change="handlePlanSelect">
        <option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.goal }}</option>
      </select>
    </div>

    <div v-if="selectedPlan" class="plan-actions">
      <button class="btn btn-ghost btn-sm" :disabled="replanning || syncingBaseline" type="button" @click="emit('sync-plan-baseline', selectedPlan.id)">
        {{ syncingBaseline ? '同步中...' : '同步基线' }}
      </button>
      <button class="btn btn-secondary btn-sm" :disabled="replanning || syncingBaseline" type="button" @click="emit('replan-plan', selectedPlan.id)">
        {{ replanning ? '动态重规划中...' : '动态重规划' }}
      </button>
    </div>

    <div v-if="selectedPlan" class="plan-body">
      <div
        v-if="selectedPlanDrift"
        class="plan-drift"
        :class="{
          'is-warning': selectedPlanDrift.changed,
          'is-stable': !selectedPlanDrift.changed,
        }"
      >
        <div class="plan-drift-head">
          <strong>{{ driftHeadline }}</strong>
          <span class="plan-drift-badge">{{ driftBadge }}</span>
        </div>
        <p>{{ driftDescription }}</p>
        <div class="plan-drift-meta">
          <span>{{ formatBaselineTime(selectedPlanDrift.baselineCreatedAt) }}</span>
          <span>本次检查 {{ formatCheckedTime(selectedPlanDrift.checkedAt) }}</span>
          <span>{{ selectedPlanDrift.totalFiles }} 个文件纳入扫描</span>
        </div>
        <div v-if="selectedPlanDrift.samplePaths.length > 0" class="plan-drift-paths">
          <span v-for="path in selectedPlanDrift.samplePaths" :key="path" class="plan-drift-path">{{ path }}</span>
        </div>
      </div>

      <div class="plan-summary">
        <strong>{{ selectedPlan.goal }}</strong>
        <p>{{ selectedPlan.overview || '暂无概述。' }}</p>
        <div class="plan-meta">
          <span>{{ statusLabel(selectedPlan.status) }}</span>
          <span>{{ selectedPlan.progress }}%</span>
          <span>{{ selectedPlan.techStack.join(' / ') || '未填写技术栈' }}</span>
        </div>
      </div>

      <div v-if="selectedPlan.phases.length" class="phase-list">
        <article v-for="phase in selectedPlan.phases" :key="phase.id" class="phase-card">
          <div class="phase-head">
            <strong>{{ phase.order }}. {{ phase.name }}</strong>
            <span>{{ phase.status }}</span>
          </div>
          <p v-if="phase.description" class="phase-description">{{ phase.description }}</p>
          <div v-if="phase.tasks.length" class="phase-task-list">
            <div v-for="task in phase.tasks" :key="task.id" class="phase-task" :class="`is-${task.status}`">
              <span>{{ task.title }}</span>
              <small>{{ task.status }}</small>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="plan-empty-inline">
        <p>当前计划还是草稿，阶段和任务尚未填充。</p>
        <p>后续可继续通过 IDE 工具或 Agent 工具推进细化。</p>
      </div>
    </div>

    <form class="plan-form" @submit.prevent="submitPlan">
      <div class="form-group">
        <label for="plan-goal">生成计划</label>
        <input id="plan-goal" v-model.trim="goal" class="input" type="text" placeholder="例如：完成 OpenAgent IDE 模式首版" />
      </div>
      <div class="form-group">
        <textarea v-model.trim="overview" class="input" rows="3" placeholder="描述本轮目标、范围和约束"></textarea>
      </div>
      <div class="form-group">
        <input v-model.trim="techStack" class="input" type="text" placeholder="技术栈，逗号分隔" />
      </div>
      <p class="plan-form-hint">提交后会基于工作区结构、脚本和技术栈自动生成阶段与任务，不只是一份空草稿。</p>
      <button class="btn btn-primary btn-sm" :disabled="!canCreatePlan" type="submit">生成项目计划</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProjectPlan, ProjectPlanDriftSummary } from '@/types'

const props = defineProps<{
  plans: ProjectPlan[]
  selectedPlanId: string
  replanning?: boolean
  syncingBaseline?: boolean
  selectedPlanDrift?: ProjectPlanDriftSummary | null
}>()

const emit = defineEmits<{
  (event: 'select-plan', planId: string): void
  (event: 'create-plan', payload: { goal: string; overview: string; techStack: string[] }): void
  (event: 'replan-plan', planId: string): void
  (event: 'sync-plan-baseline', planId: string): void
}>()

const goal = ref('')
const overview = ref('')
const techStack = ref('')

const selectedPlan = computed(() => props.plans.find(plan => plan.id === props.selectedPlanId) ?? props.plans[0] ?? null)
const canCreatePlan = computed(() => goal.value.length > 0 && overview.value.length > 0 && techStack.value.length > 0)
const replanning = computed(() => props.replanning === true)
const syncingBaseline = computed(() => props.syncingBaseline === true)
const selectedPlanDrift = computed(() => props.selectedPlanDrift ?? null)
const driftHeadline = computed(() => {
  if (!selectedPlanDrift.value) {
    return ''
  }

  if (selectedPlanDrift.value.diff.baselineMissing) {
    return '当前计划还没有工作区基线'
  }

  if (selectedPlanDrift.value.changed) {
    return '当前计划与工作区状态存在漂移'
  }

  return '当前计划与工作区基线一致'
})
const driftBadge = computed(() => {
  if (!selectedPlanDrift.value) {
    return ''
  }

  if (selectedPlanDrift.value.diff.baselineMissing) {
    return '待同步'
  }

  return selectedPlanDrift.value.changed ? `${selectedPlanDrift.value.totalChanges} 处变化` : '已对齐'
})
const driftDescription = computed(() => {
  if (!selectedPlanDrift.value) {
    return ''
  }

  if (selectedPlanDrift.value.diff.baselineMissing) {
    return '建议先同步一次基线，后续动态重规划才能基于真实代码差异判断变化范围。'
  }

  if (!selectedPlanDrift.value.changed) {
    return '当前计划记录的基线和工作区状态一致，适合继续执行现有阶段与任务。'
  }

  const parts = [
    selectedPlanDrift.value.diff.added.length > 0 ? `新增 ${selectedPlanDrift.value.diff.added.length}` : '',
    selectedPlanDrift.value.diff.modified.length > 0 ? `修改 ${selectedPlanDrift.value.diff.modified.length}` : '',
    selectedPlanDrift.value.diff.removed.length > 0 ? `删除 ${selectedPlanDrift.value.diff.removed.length}` : '',
  ].filter(Boolean)

  return `检测到 ${parts.join('，')}。如果这些变化改变了执行路径，建议触发动态重规划；如果只是你确认过的基线更新，可以直接同步基线。`
})

function statusLabel(status: string) {
  const map: Record<string, string> = {
    drafting: '草稿中',
    approved: '已批准',
    'in-progress': '进行中',
    completed: '已完成',
    paused: '已暂停',
  }

  return map[status] || status
}

function formatBaselineTime(timestamp: number | null) {
  if (!timestamp) {
    return '尚未记录基线'
  }

  return `上次基线 ${new Date(timestamp).toLocaleString('zh-CN', { hour12: false })}`
}

function formatCheckedTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function handlePlanSelect(event: Event) {
  const target = event.target as HTMLSelectElement | null
  if (target?.value) {
    emit('select-plan', target.value)
  }
}

function submitPlan() {
  if (!canCreatePlan.value) {
    return
  }

  emit('create-plan', {
    goal: goal.value,
    overview: overview.value,
    techStack: techStack.value.split(/[,，]/).map(item => item.trim()).filter(Boolean),
  })

  goal.value = ''
  overview.value = ''
  techStack.value = ''
}
</script>

<style lang="scss" scoped>
.ide-plan-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  min-height: 0;
  padding: $spacing-md;
}

.panel-head,
.phase-head,
.plan-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

.panel-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.panel-badge {
  min-width: 24px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--primary-bg);
  color: var(--primary);
  font-size: $font-xs;
  font-weight: 700;
  text-align: center;
}

.plan-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.plan-body {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.plan-drift {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border: 1px solid transparent;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.6);

  &.is-warning {
    border-color: rgba(211, 123, 35, 0.2);
    background: rgba(211, 123, 35, 0.08);
  }

  &.is-stable {
    border-color: rgba(29, 148, 92, 0.18);
    background: rgba(29, 148, 92, 0.08);
  }

  p {
    color: var(--text-secondary);
    line-height: 1.6;
  }
}

.plan-drift-head,
.plan-drift-meta,
.plan-drift-paths {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.plan-drift-head {
  justify-content: space-between;
}

.plan-drift-badge,
.plan-drift-path {
  border-radius: 999px;
  font-size: $font-xs;
}

.plan-drift-badge {
  min-height: 24px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-primary);
  font-weight: 700;
  line-height: 24px;
}

.plan-drift-meta {
  color: var(--text-muted);
  font-size: $font-xs;
}

.plan-drift-path {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-secondary);
}

.plan-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.55);

  p {
    color: var(--text-secondary);
    line-height: 1.6;
  }
}

.plan-meta {
  flex-wrap: wrap;
  justify-content: flex-start;
  color: var(--text-muted);
  font-size: $font-xs;
}

.phase-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  min-height: 0;
  overflow: auto;
}

.phase-card {
  padding: $spacing-sm;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.5);
}

.phase-description {
  margin-top: 6px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.phase-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: $spacing-sm;
}

.phase-task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: 6px 8px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.72);
  font-size: $font-sm;

  &.is-completed {
    color: var(--success);
  }

  &.is-failed {
    color: var(--danger);
  }

  &.is-in-progress {
    color: var(--primary);
  }
}

.plan-empty-inline,
.plan-form {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.plan-empty-inline {
  color: var(--text-secondary);
  line-height: 1.6;
}

.plan-form {
  padding-top: $spacing-sm;
  border-top: 1px solid var(--border);
}

.plan-form-hint {
  color: var(--text-muted);
  font-size: $font-xs;
  line-height: 1.6;
}
</style>
