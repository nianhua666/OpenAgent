<template>
  <section class="agent-task-board glass-panel">
    <div class="board-head">
      <div>
        <p class="eyebrow">Execution</p>
        <h3>任务推进板</h3>
      </div>
      <span class="board-badge" v-if="task">{{ taskStatusLabel(task.status) }}</span>
      <span class="board-badge" v-else-if="plan">计划 {{ plan.progress }}%</span>
    </div>

    <div v-if="task" class="task-block">
      <h4>{{ task.goal }}</h4>
      <p class="task-summary">{{ task.summary || '当前任务正在推进，等待更多结果回填。' }}</p>
      <div class="progress-row">
        <span>自动循环</span>
        <strong>{{ task.iterationCount }}/{{ task.maxIterations > 0 ? task.maxIterations : '无限' }}</strong>
      </div>
      <div class="task-steps" v-if="task.steps.length">
        <div v-for="step in task.steps" :key="step.id" class="task-step" :class="`is-${step.status}`">
          <strong>{{ step.title }}</strong>
          <span v-if="step.note">{{ step.note }}</span>
        </div>
      </div>
    </div>

    <div v-if="plan" class="plan-block">
      <div class="progress-row">
        <span>项目计划</span>
        <strong>{{ plan.progress }}%</strong>
      </div>
      <div class="plan-progress-track">
        <span class="plan-progress-value" :style="{ width: `${plan.progress}%` }"></span>
      </div>
      <p class="plan-overview">{{ plan.overview }}</p>
      <div class="plan-next-task" v-if="nextTask">
        <span class="meta-label">下一可执行任务</span>
        <strong>{{ nextTask.title }}</strong>
        <p>{{ nextTask.description }}</p>
      </div>
      <div class="phase-list">
        <div v-for="phase in plan.phases.slice(0, 4)" :key="phase.id" class="phase-item">
          <div class="phase-item-head">
            <strong>{{ phase.order }}. {{ phase.name }}</strong>
            <span>{{ phase.status }}</span>
          </div>
          <p>{{ phase.description }}</p>
        </div>
      </div>
    </div>

    <div v-if="!task && !plan" class="empty-state">
      <p>当前还没有活跃任务。新会话发送后，主代理会自动生成执行计划。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AIAgentTask, ProjectPlan } from '@/types'
import { getNextExecutableTask } from '@/utils/aiPlanEngine'

const props = defineProps<{
  task: AIAgentTask | null
  plan: ProjectPlan | null
}>()

const nextTask = computed(() => (props.plan ? getNextExecutableTask(props.plan) : null))

function taskStatusLabel(status: AIAgentTask['status']) {
  const labels: Record<AIAgentTask['status'], string> = {
    planning: '规划中',
    running: '执行中',
    completed: '已完成',
    blocked: '已阻塞',
  }
  return labels[status]
}
</script>

<style scoped>
.agent-task-board {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.board-head,
.progress-row,
.phase-item-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.eyebrow,
.meta-label {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.14em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

h3,
h4,
p {
  margin: 0;
}

h3 {
  font-size: 20px;
}

h4 {
  font-size: 18px;
}

.board-badge {
  background: rgba(255, 166, 43, 0.14);
  border-radius: 999px;
  color: #ffd08a;
  font-size: 12px;
  padding: 6px 10px;
}

.task-summary,
.plan-overview,
.plan-next-task p,
.phase-item p,
.empty-state p {
  color: var(--text-secondary);
  line-height: 1.7;
}

.task-block,
.plan-block,
.task-steps,
.phase-list {
  display: grid;
  gap: 12px;
}

.task-step,
.phase-item,
.plan-next-task {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: grid;
  gap: 6px;
  padding: 12px 14px;
}

.task-step.is-completed {
  border-color: rgba(61, 214, 140, 0.32);
}

.task-step.is-in_progress,
.task-step.is-pending {
  border-color: rgba(255, 196, 0, 0.2);
}

.task-step.is-blocked {
  border-color: rgba(255, 95, 95, 0.24);
}

.plan-progress-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.plan-progress-value {
  background: linear-gradient(90deg, #ffb703, #ffd166);
  border-radius: inherit;
  display: block;
  height: 100%;
}
</style>
