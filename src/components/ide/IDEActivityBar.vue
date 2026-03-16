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

    <div class="activity-divider"></div>

    <button class="activity-btn" :class="{ 'is-active': showLeftPane }" :disabled="!workspaceReady" title="资源面板" @click="$emit('toggle-left-pane')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>
      </svg>
    </button>
    <button class="activity-btn" :class="{ 'is-active': showBottomPane }" :disabled="!workspaceReady" title="终端面板" @click="$emit('toggle-bottom-pane')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>
      </svg>
    </button>
    <button class="activity-btn" :class="{ 'is-active': showRightPane }" :disabled="!workspaceReady" title="Inspector 面板" @click="$emit('toggle-right-pane')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>
      </svg>
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
  showLeftPane: boolean
  showBottomPane: boolean
  showRightPane: boolean
}>()

defineEmits<{
  (event: 'open-workspace'): void
  (event: 'refresh-workspace'): void
  (event: 'save-all'): void
  (event: 'toggle-left-pane'): void
  (event: 'toggle-bottom-pane'): void
  (event: 'toggle-right-pane'): void
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
  padding: 8px 6px;
  border-color: rgba(30, 41, 59, 0.22);
  background:
    linear-gradient(180deg, rgba(29, 37, 49, 0.98), rgba(22, 29, 40, 0.98));
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.04),
    0 12px 26px rgba(15, 23, 42, 0.12);
}

.activity-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid transparent;
  border-radius: $border-radius-md;
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast, transform $transition-fast, border-color $transition-fast;

  &:hover {
    background: rgba(148, 163, 184, 0.14);
    border-color: rgba(148, 163, 184, 0.2);
    color: #f8fafc;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.72;
    color: rgba(148, 163, 184, 0.42);
    cursor: not-allowed;
  }

  &.is-primary {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse);
  }

  &.is-active:not(.is-primary) {
    background: rgba(59, 130, 246, 0.18);
    border-color: rgba(96, 165, 250, 0.28);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    color: #dbeafe;
  }

  &.is-active:not(.is-primary)::after {
    content: '';
    position: absolute;
    left: -4px;
    top: 9px;
    width: 3px;
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--primary), var(--primary-dark));
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

.activity-divider {
  width: 22px;
  height: 1px;
  margin: 2px 0;
  background: rgba(148, 163, 184, 0.18);
}

.activity-spacer {
  flex: 1;
}
</style>
