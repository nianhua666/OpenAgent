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
      <button
        v-for="action in planStatusActions"
        :key="action.status"
        class="btn btn-ghost btn-sm"
        :disabled="replanning || syncingBaseline || updatingPlanStatus"
        type="button"
        @click="emit('update-plan-status', { planId: selectedPlan.id, status: action.status })"
      >
        {{ action.label }}
      </button>
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

      <div class="autonomy-panel" :class="autonomyPanelClass">
        <div class="autonomy-head">
          <strong>自治调度器</strong>
          <div class="autonomy-head-actions">
            <button class="btn btn-ghost btn-sm" :disabled="syncingAutonomy" type="button" @click="emit('sync-autonomy-run', selectedPlan.id)">
              {{ syncingAutonomy ? '同步中..' : '同步状态' }}
            </button>
            <button
              v-if="selectedPlan.status === 'approved' || selectedPlan.status === 'paused'"
              class="btn btn-secondary btn-sm"
              :disabled="syncingAutonomy || updatingPlanStatus"
              type="button"
              @click="emit('resume-autonomy-run', selectedPlan.id)"
            >
              {{ selectedPlan.status === 'paused' ? '恢复自治' : '启动自治' }}
            </button>
            <button
              v-else-if="selectedPlan.status === 'in-progress'"
              class="btn btn-ghost btn-sm"
              :disabled="syncingAutonomy || updatingPlanStatus"
              type="button"
              @click="emit('pause-autonomy-run', selectedPlan.id)"
            >
              暂停自治
            </button>
            <span class="autonomy-badge">{{ autonomyRun ? autonomyStatusLabel(autonomyRun.status) : '待生成' }}</span>
          </div>
        </div>
        <p class="autonomy-summary">
          {{ autonomyRun?.summary || '当前计划尚未生成自治调度状态机。点击“同步状态”后会输出 RUN.md，并整理权限画像、任务领取状态和最近心跳。' }}
        </p>
        <div class="autonomy-meta">
          <span>建议并行 {{ autonomyRun?.maxParallelTasks || 1 }} 个任务</span>
          <span>子代理批次上限 {{ autonomyRun?.subAgentBatchLimit || 1 }}</span>
          <span>{{ autonomyRun?.lastHeartbeat ? `最近心跳 ${formatCheckedTime(autonomyRun.lastHeartbeat.timestamp)}` : '尚未生成心跳' }}</span>
        </div>
        <div v-if="autonomyRun?.cadence" class="autonomy-cadence">
          <div class="autonomy-cadence-head">
            <span class="autonomy-badge">{{ autonomyLoopStageLabel(autonomyRun.cadence.loopStage) }}</span>
            <strong>{{ autonomyRun.cadence.focusSummary }}</strong>
          </div>
          <div v-if="autonomyRun.cadence.verificationChecklist.length > 0" class="execution-chip-row">
            <span v-for="item in autonomyRun.cadence.verificationChecklist" :key="item" class="execution-chip">{{ item }}</span>
          </div>
        </div>
        <div class="execution-chip-row">
          <span class="execution-chip">允许 {{ permissionStats.allow }}</span>
          <span class="execution-chip">谨慎使用 {{ permissionStats.ask }}</span>
          <span class="execution-chip">禁止 {{ permissionStats.deny }}</span>
        </div>
        <p v-if="autonomyRun?.nextAction" class="autonomy-next">
          下一动作：{{ autonomyRun.nextAction }}
        </p>
        <div v-if="visibleAutonomyClaims.length > 0" class="autonomy-claim-list">
          <article v-for="claim in visibleAutonomyClaims" :key="claim.taskId" class="autonomy-claim-card">
            <div class="autonomy-claim-head">
              <strong>{{ claim.taskTitle }}</strong>
              <span>{{ claim.agentName }}</span>
            </div>
            <p>{{ autonomyClaimStatusLabel(claim.status) }} · {{ claim.agentRole }}</p>
            <p v-if="claim.reason" class="autonomy-claim-reason">{{ claim.reason }}</p>
          </article>
        </div>
      </div>

      <div v-if="executionPacket" class="execution-panel">
        <div class="execution-head">
          <strong>执行编排</strong>
          <div class="execution-head-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click="copyPrompt(executionPacket.supervisorPrompt, '主代理监督提示词')">
              复制主代理提示词
            </button>
            <span class="execution-badge">{{ executionPacket.readyTaskCount }} 个 ready task</span>
          </div>
        </div>
        <p class="execution-summary">
          {{ executionSummary }}
        </p>
        <details class="execution-details">
          <summary>查看主代理监督提示词</summary>
          <pre>{{ executionPacket.supervisorPrompt }}</pre>
        </details>

        <div v-if="executionPacket.readyTasks.length > 0" class="execution-task-list">
          <article v-for="task in executionPacket.readyTasks" :key="task.taskId" class="execution-task-card">
            <div class="execution-task-head">
              <strong>{{ task.phaseName }} / {{ task.taskTitle }}</strong>
              <div class="execution-task-actions">
                <span>{{ task.recommendedAgentName }}</span>
                <button class="btn btn-ghost btn-sm" type="button" @click="copyPrompt(task.executionPrompt, `${task.taskTitle} 子代理提示词`)">
                  复制提示词
                </button>
              </div>
            </div>
            <p class="execution-task-role">{{ task.recommendedRole }}</p>
            <div v-if="task.files.length > 0" class="execution-chip-row">
              <span v-for="file in task.files" :key="file" class="execution-chip">{{ file }}</span>
            </div>
            <details class="execution-details">
              <summary>查看子代理提示词</summary>
              <pre>{{ task.executionPrompt }}</pre>
            </details>
          </article>
        </div>

        <div v-if="executionPacket.blockedTasks.length > 0" class="execution-blockers">
          <strong>当前阻塞</strong>
          <div v-for="task in executionPacket.blockedTasks" :key="task.taskId" class="execution-blocker-item">
            <span>{{ task.phaseName }} / {{ task.taskTitle }}</span>
            <small>等待 {{ task.dependencyTitles.join('、') || '前置任务' }}</small>
          </div>
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
import type { AutonomyRun, PlanStatus, ProjectPlan, ProjectPlanDriftSummary, ProjectPlanExecutionPacket } from '@/types'
import { showToast } from '@/utils/toast'

const props = defineProps<{
  plans: ProjectPlan[]
  selectedPlanId: string
  replanning?: boolean
  syncingBaseline?: boolean
  syncingAutonomy?: boolean
  updatingPlanStatus?: boolean
  selectedPlanDrift?: ProjectPlanDriftSummary | null
  executionPacket?: ProjectPlanExecutionPacket | null
  autonomyRun?: AutonomyRun | null
}>()

const emit = defineEmits<{
  (event: 'select-plan', planId: string): void
  (event: 'create-plan', payload: { goal: string; overview: string; techStack: string[] }): void
  (event: 'replan-plan', planId: string): void
  (event: 'sync-plan-baseline', planId: string): void
  (event: 'update-plan-status', payload: { planId: string; status: PlanStatus }): void
  (event: 'sync-autonomy-run', planId: string): void
  (event: 'resume-autonomy-run', planId: string): void
  (event: 'pause-autonomy-run', planId: string): void
}>()

const goal = ref('')
const overview = ref('')
const techStack = ref('')

const selectedPlan = computed(() => props.plans.find(plan => plan.id === props.selectedPlanId) ?? props.plans[0] ?? null)
const canCreatePlan = computed(() => goal.value.length > 0 && overview.value.length > 0 && techStack.value.length > 0)
const replanning = computed(() => props.replanning === true)
const syncingBaseline = computed(() => props.syncingBaseline === true)
const syncingAutonomy = computed(() => props.syncingAutonomy === true)
const updatingPlanStatus = computed(() => props.updatingPlanStatus === true)
const selectedPlanDrift = computed(() => props.selectedPlanDrift ?? null)
const executionPacket = computed(() => props.executionPacket ?? null)
const autonomyRun = computed(() => props.autonomyRun ?? null)
const autonomyPanelClass = computed(() => autonomyRun.value ? `is-${autonomyRun.value.status}` : 'is-empty')
const permissionStats = computed(() => {
  const stats = { allow: 0, ask: 0, deny: 0 }
  for (const rule of autonomyRun.value?.permissions || []) {
    if (rule.mode === 'allow') stats.allow += 1
    else if (rule.mode === 'ask') stats.ask += 1
    else stats.deny += 1
  }
  return stats
})
const visibleAutonomyClaims = computed(() => (autonomyRun.value?.claims || []).slice(0, 4))
const planStatusActions = computed<Array<{ status: PlanStatus; label: string }>>(() => {
  if (!selectedPlan.value) {
    return []
  }

  if (selectedPlan.value.status === 'drafting') {
    return [{ status: 'approved', label: '确认计划' }]
  }

  if (selectedPlan.value.status === 'approved') {
    return [{ status: 'in-progress', label: '开始执行' }]
  }

  if (selectedPlan.value.status === 'in-progress') {
    return [
      { status: 'paused', label: '暂停执行' },
      ...(selectedPlan.value.progress >= 100 ? [{ status: 'completed' as PlanStatus, label: '标记完成' }] : []),
    ]
  }

  if (selectedPlan.value.status === 'paused') {
    return [{ status: 'in-progress', label: '恢复执行' }]
  }

  return []
})
const executionSummary = computed(() => {
  if (!executionPacket.value) {
    return ''
  }

  if (executionPacket.value.readyTaskCount === 0) {
    return executionPacket.value.blockedTaskCount > 0
      ? '当前没有可立即执行的任务，主代理应优先处理依赖阻塞、基线同步或动态重规划。'
      : '当前没有 ready task，可先复核计划状态、最近变更与是否需要继续拆分任务。'
  }

  const nextTaskLabel = executionPacket.value.nextTaskTitle ? `下一优先任务是「${executionPacket.value.nextTaskTitle}」` : '下一优先任务已生成'
  return `${nextTaskLabel}。当前可立即执行 ${executionPacket.value.readyTaskCount} 个任务，主代理可根据共享文件与状态耦合度决定串行或并行派发。`
})
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

function autonomyStatusLabel(status: NonNullable<AutonomyRun['status']>) {
  const map: Record<AutonomyRun['status'], string> = {
    queued: '待命',
    running: '运行中',
    paused: '已暂停',
    blocked: '阻塞',
    completed: '已完成',
    failed: '失败',
  }

  return map[status] || status
}

function autonomyClaimStatusLabel(status: string) {
  const map: Record<string, string> = {
    ready: '待领取',
    deferred: '延后',
    claimed: '已领取',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    blocked: '阻塞',
  }

  return map[status] || status
}

function autonomyLoopStageLabel(stage: NonNullable<AutonomyRun['cadence']>['loopStage']) {
  if (stage === 'observe') return 'Observe'
  if (stage === 'plan') return 'Choose Lane'
  if (stage === 'execute') return 'Execute'
  if (stage === 'verify') return 'Verify'
  return 'Record'
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

async function copyPrompt(text: string, label: string) {
  if (!text.trim()) {
    showToast('error', `${label}为空`)
    return
  }

  if (!navigator.clipboard?.writeText) {
    showToast('error', '当前环境不支持剪贴板写入')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    showToast('success', `${label}已复制`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `${label}复制失败`)
  }
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
  flex-wrap: wrap;
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

.autonomy-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border: 1px solid rgba(14, 25, 42, 0.08);
  border-radius: $border-radius-sm;
  background: rgba(14, 25, 42, 0.04);

  &.is-running {
    border-color: rgba(var(--primary-rgb, 232 120 154), 0.18);
    background: rgba(var(--primary-rgb, 232 120 154), 0.08);
  }

  &.is-paused,
  &.is-queued {
    border-color: rgba(54, 109, 193, 0.16);
    background: rgba(54, 109, 193, 0.06);
  }

  &.is-blocked,
  &.is-failed {
    border-color: rgba(211, 123, 35, 0.22);
    background: rgba(211, 123, 35, 0.08);
  }

  &.is-completed {
    border-color: rgba(29, 148, 92, 0.2);
    background: rgba(29, 148, 92, 0.08);
  }
}

.autonomy-head,
.autonomy-claim-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

.autonomy-head-actions,
.autonomy-meta {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.autonomy-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--text-primary);
  font-size: $font-xs;
  font-weight: 700;
}

.autonomy-summary,
.autonomy-next,
.autonomy-claim-card p {
  color: var(--text-secondary);
  line-height: 1.6;
}

.autonomy-cadence {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.66);
}

.autonomy-cadence-head {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.autonomy-meta {
  color: var(--text-muted);
  font-size: $font-xs;
}

.autonomy-claim-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.autonomy-claim-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.72);
}

.autonomy-claim-reason {
  font-size: $font-xs;
}

.execution-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border: 1px solid rgba(var(--primary-rgb, 232 120 154), 0.12);
  border-radius: $border-radius-sm;
  background: rgba(var(--primary-rgb, 232 120 154), 0.06);
}

.execution-head,
.execution-task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

.execution-head-actions,
.execution-task-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.execution-badge,
.execution-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  color: var(--text-secondary);
  font-size: $font-xs;
  font-weight: 700;
}

.execution-summary,
.execution-task-role {
  color: var(--text-secondary);
  line-height: 1.6;
}

.execution-task-list,
.execution-blockers {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.execution-task-card,
.execution-blocker-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.72);
}

.execution-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.execution-details {
  summary {
    cursor: pointer;
    color: var(--primary);
    font-size: $font-xs;
    font-weight: 700;
  }

  pre {
    margin-top: $spacing-sm;
    padding: $spacing-sm;
    border-radius: $border-radius-sm;
    background: rgba(14, 25, 42, 0.06);
    color: var(--text-primary);
    font-family: 'Cascadia Code', 'Consolas', 'SFMono-Regular', monospace;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }
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
