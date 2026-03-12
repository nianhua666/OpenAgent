<template>
  <section class="ide-dev-log glass-panel">
    <div class="log-head">
      <div>
        <p class="log-eyebrow">Dev Log</p>
        <h3>开发日志</h3>
      </div>
      <span class="log-badge">{{ entries.length }}</span>
    </div>

    <div v-if="!plan" class="log-empty">
      <p>当前没有选中的项目计划。</p>
      <p>创建或选择一个计划后，这里会展示该计划的开发日志。</p>
    </div>

    <div v-else-if="entries.length === 0" class="log-empty">
      <p>该计划还没有日志记录。</p>
      <p>后续通过 IDE 工具推进任务时，日志会逐步沉淀到这里。</p>
    </div>

    <div v-else class="log-list">
      <article v-for="entry in entries" :key="entry.id" class="log-item">
        <div class="log-item-head">
          <strong>{{ entry.title }}</strong>
          <span>{{ formatTime(entry.timestamp) }}</span>
        </div>
        <div class="log-type">{{ entry.type }}</div>
        <p class="log-content">{{ entry.content }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectPlan } from '@/types'

const props = defineProps<{
  plan: ProjectPlan | null
}>()

const entries = computed(() => {
  return [...(props.plan?.devLog || [])].sort((left, right) => right.timestamp - left.timestamp)
})

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style lang="scss" scoped>
.ide-dev-log {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: $spacing-md;
}

.log-head,
.log-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
}

.log-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.log-badge {
  min-width: 24px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--primary-bg);
  color: var(--primary);
  font-size: $font-xs;
  font-weight: 700;
  text-align: center;
}

.log-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-sm;
  min-height: 0;
  overflow: auto;
  margin-top: $spacing-md;
}

.log-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: $spacing-sm;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.5);
}

.log-item-head span,
.log-type {
  color: var(--text-muted);
  font-size: $font-xs;
}

.log-content,
.log-empty {
  color: var(--text-secondary);
  line-height: 1.6;
}

.log-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: $spacing-sm;
}
</style>
