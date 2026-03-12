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

    <div v-if="selectedPlan" class="plan-body">
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
        <p>当前计划还是草案，阶段和任务尚未填充。</p>
        <p>后续可继续通过 IDE 工具或 Agent 工具推进细化。</p>
      </div>
    </div>

    <form class="plan-form" @submit.prevent="submitPlan">
      <div class="form-group">
        <label for="plan-goal">创建草案</label>
        <input id="plan-goal" v-model.trim="goal" class="input" type="text" placeholder="例如：完成 OpenAgent IDE 模式首版" />
      </div>
      <div class="form-group">
        <textarea v-model.trim="overview" class="input" rows="3" placeholder="描述本轮目标、范围和约束"></textarea>
      </div>
      <div class="form-group">
        <input v-model.trim="techStack" class="input" type="text" placeholder="技术栈，逗号分隔" />
      </div>
      <button class="btn btn-primary btn-sm" :disabled="!canCreatePlan" type="submit">创建计划草案</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProjectPlan } from '@/types'

const props = defineProps<{
  plans: ProjectPlan[]
  selectedPlanId: string
}>()

const emit = defineEmits<{
  (event: 'select-plan', planId: string): void
  (event: 'create-plan', payload: { goal: string; overview: string; techStack: string[] }): void
}>()

const goal = ref('')
const overview = ref('')
const techStack = ref('')

const selectedPlan = computed(() => props.plans.find(plan => plan.id === props.selectedPlanId) ?? props.plans[0] ?? null)
const canCreatePlan = computed(() => goal.value.length > 0 && overview.value.length > 0 && techStack.value.length > 0)

function statusLabel(status: string) {
  const map: Record<string, string> = {
    drafting: '草案中',
    approved: '已批准',
    'in-progress': '进行中',
    completed: '已完成',
    paused: '已暂停',
  }

  return map[status] || status
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

.plan-body {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
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
</style>
