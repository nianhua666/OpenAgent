<template>
  <aside class="ide-activity-bar glass-panel">
    <button class="activity-btn is-primary" :title="workspaceReady ? '切换工作区' : '打开工作区'" @click="$emit('open-workspace')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
      </svg>
    </button>
    <button class="activity-btn" :disabled="!workspaceReady" title="刷新工作区" @click="$emit('refresh-workspace')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
      </svg>
    </button>
    <button class="activity-btn" :disabled="dirtyCount === 0" :title="dirtyCount > 0 ? `保存全部 (${dirtyCount})` : '没有待保存文件'" @click="$emit('save-all')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
      </svg>
      <span v-if="dirtyCount > 0" class="activity-badge">{{ dirtyCount }}</span>
    </button>

    <div class="activity-spacer"></div>

    <button class="activity-btn" title="返回 Agent" @click="$emit('open-agent')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M6 10v1a6 6 0 0 0 12 0v-1"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
      </svg>
    </button>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  workspaceReady: boolean
  dirtyCount: number
}>()

defineEmits<{
  (event: 'open-workspace'): void
  (event: 'refresh-workspace'): void
  (event: 'save-all'): void
  (event: 'open-agent'): void
}>()
</script>

<style lang="scss" scoped>
.ide-activity-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-sm;
  width: 64px;
  min-width: 64px;
  padding: $spacing-sm;
}

.activity-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: $border-radius-md;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast, transform $transition-fast;

  &:hover {
    background: var(--primary-bg);
    color: var(--primary);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.is-primary {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse);
  }
}

.activity-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger);
  color: var(--text-inverse);
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
}

.activity-spacer {
  flex: 1;
}
</style>
