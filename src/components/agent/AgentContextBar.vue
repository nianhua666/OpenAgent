<template>
  <footer class="agent-context-bar glass-panel">
    <div class="context-copy">
      <span class="context-label">上下文负载</span>
      <strong>{{ metrics ? `${formatNumber(metrics.estimatedInputTokens)} / ${formatNumber(metrics.selectedContextTokens)}` : '等待会话' }}</strong>
      <span v-if="metrics" class="context-sub">模型上限 {{ formatNumber(metrics.modelMaxContextTokens) }} · 输出上限 {{ formatNumber(metrics.maxOutputTokens) }}</span>
    </div>

    <div class="usage-track" v-if="metrics">
      <span class="usage-value" :style="{ width: `${usagePercent}%` }"></span>
    </div>

    <div class="context-stats">
      <span class="stat-pill">角色 {{ agentCount }}</span>
      <span class="stat-pill running">{{ currentAgentName || '未选择角色' }}</span>
      <span class="stat-pill" :class="{ running: memoryEnabled }">{{ memoryEnabled ? '长期记忆开启' : '长期记忆关闭' }}</span>
      <span class="stat-pill" v-if="metrics?.compressionCount">压缩 {{ metrics.compressionCount }} 次</span>
      <span class="stat-pill" v-else>未压缩</span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AIContextMetrics } from '@/types'

const props = defineProps<{
  metrics: AIContextMetrics | null
  agentCount: number
  currentAgentName: string
  memoryEnabled: boolean
}>()

const usagePercent = computed(() => {
  if (!props.metrics) {
    return 0
  }

  const ratio = props.metrics.usageRatio > 1 ? props.metrics.usageRatio : props.metrics.usageRatio * 100
  return Math.max(0, Math.min(100, Math.round(ratio)))
})

function formatNumber(value: number) {
  return value.toLocaleString()
}
</script>

<style scoped>
.agent-context-bar {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(220px, 1.3fr) minmax(160px, 1fr) auto;
  padding: 10px 12px;
}

.context-copy {
  display: grid;
  gap: 3px;
}

.context-label,
.context-sub {
  color: var(--text-muted);
  font-size: 11px;
}

.usage-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.usage-value {
  background: linear-gradient(90deg, #ffb703, #ffd166);
  border-radius: inherit;
  display: block;
  height: 100%;
}

.context-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.stat-pill {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 5px 8px;
}

.stat-pill.running {
  background: rgba(69, 183, 255, 0.16);
  color: #8dd9ff;
}

@media (max-width: 960px) {
  .agent-context-bar {
    grid-template-columns: 1fr;
  }

  .context-stats {
    justify-content: flex-start;
  }
}
</style>
