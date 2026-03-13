<template>
  <article class="sub-agent-card" :class="`is-${agent.status}`">
    <div class="card-head">
      <div>
        <p class="card-role">{{ agent.role }}</p>
        <h4>{{ agent.name }}</h4>
      </div>
      <span class="status-tag" :class="`is-${agent.status}`">{{ statusLabel(agent.status) }}</span>
    </div>

    <p class="card-task">{{ agent.task }}</p>

    <div class="meta-grid">
      <div>
        <span class="meta-label">模型</span>
        <strong>{{ agent.model }}</strong>
      </div>
      <div v-if="agent.selectionMode">
        <span class="meta-label">选型方式</span>
        <strong>{{ selectionModeLabel(agent.selectionMode) }}</strong>
      </div>
      <div>
        <span class="meta-label">协议</span>
        <strong>{{ agent.protocol }}</strong>
      </div>
      <div>
        <span class="meta-label">创建</span>
        <strong>{{ formatTime(agent.createdAt) }}</strong>
      </div>
      <div v-if="agent.completedAt">
        <span class="meta-label">完成</span>
        <strong>{{ formatTime(agent.completedAt) }}</strong>
      </div>
    </div>

    <p v-if="agent.modelReason" class="model-reason">
      {{ agent.modelReason }}
    </p>

    <div v-if="agent.result" class="result-block">
      <p class="result-title">执行摘要</p>
      <p class="result-content">{{ agent.result.output || '无输出' }}</p>
      <div class="result-metrics">
        <span>输入 {{ agent.result.tokenUsage.input }}</span>
        <span>输出 {{ agent.result.tokenUsage.output }}</span>
        <span v-if="agent.result.artifacts.length">产物 {{ agent.result.artifacts.length }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import type { SubAgent, SubAgentStatus } from '@/types'

defineProps<{
  agent: SubAgent
}>()

function formatTime(timestamp: number) {
  return dayjs(timestamp).format('HH:mm:ss')
}

function statusLabel(status: SubAgentStatus) {
  const labels: Record<SubAgentStatus, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return labels[status]
}

function selectionModeLabel(mode: SubAgent['selectionMode']) {
  const labels: Record<NonNullable<SubAgent['selectionMode']>, string> = {
    manual: '主代理指定',
    router: '自动路由',
    fallback: '回退当前模型',
  }

  return mode ? labels[mode] : '未记录'
}
</script>

<style scoped>
.sub-agent-card {
  background:
    radial-gradient(circle at top right, rgba(255, 166, 43, 0.12), transparent 42%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: grid;
  gap: 14px;
  padding: 16px;
}

.card-head,
.result-metrics {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.card-role,
.meta-label,
.result-title {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0;
}

h4 {
  margin: 4px 0 0;
  font-size: 17px;
}

.status-tag,
.result-metrics span {
  border-radius: 999px;
  font-size: 11px;
  padding: 5px 9px;
}

.status-tag.is-pending {
  background: rgba(255, 255, 255, 0.08);
}

.status-tag.is-running {
  background: rgba(69, 183, 255, 0.16);
  color: #8dd9ff;
}

.status-tag.is-completed {
  background: rgba(61, 214, 140, 0.16);
  color: #87efba;
}

.status-tag.is-failed,
.status-tag.is-cancelled {
  background: rgba(255, 95, 95, 0.16);
  color: #ffb0b0;
}

.card-task,
.model-reason,
.result-content {
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0;
}

.meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.meta-grid strong,
.result-metrics span {
  display: block;
  margin-top: 4px;
}

.result-block {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.result-metrics {
  flex-wrap: wrap;
  justify-content: flex-start;
  margin-top: 12px;
}

.result-metrics span {
  background: rgba(255, 255, 255, 0.06);
  margin-top: 0;
}
</style>
