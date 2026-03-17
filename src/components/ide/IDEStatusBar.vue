<template>
  <footer class="ide-status-bar">
    <span class="status-pill status-pill-strong">{{ workspaceName || '未打开工作区' }}</span>
    <span v-if="language" class="status-pill">{{ language }}</span>
    <span v-if="framework" class="status-pill">{{ framework }}</span>
    <span class="status-pill">打开文件 {{ openFiles }}</span>
    <span class="status-pill" :class="{ 'is-warning': dirtyFiles > 0 }">待保存 {{ dirtyFiles }}</span>
    <span class="status-pill">计划 {{ planCount }}</span>
    <span class="status-pill">Ln {{ cursorLine }}, Col {{ cursorColumn }}</span>
    <span v-if="selectionLength > 0" class="status-pill is-selection">已选 {{ selectionLength }}</span>
    <span class="status-file" :title="activeFilePath">{{ activeFilePath || '未选择文件' }}</span>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  workspaceName: string
  language?: string
  framework?: string
  openFiles: number
  dirtyFiles: number
  planCount: number
  cursorLine: number
  cursorColumn: number
  selectionLength: number
  activeFilePath: string
}>()
</script>

<style lang="scss" scoped>
.ide-status-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background:
    linear-gradient(180deg, rgba(22, 30, 44, 0.98), rgba(17, 24, 39, 0.98)),
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.12), transparent 32%);
  color: #e2e8f0;
  font-size: $font-xs;
  font-weight: 600;
  overflow: hidden;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.status-pill-strong {
  background: rgba(59, 130, 246, 0.2);
  color: #f8fbff;
}

.status-pill.is-warning {
  background: rgba(245, 158, 11, 0.18);
  color: #fde68a;
}

.status-pill.is-selection {
  background: rgba(37, 99, 235, 0.18);
  color: #bfdbfe;
}

.status-file {
  margin-left: auto;
  min-width: 0;
  color: rgba(226, 232, 240, 0.82);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 960px) {
  .ide-status-bar {
    gap: $spacing-sm;
  }

  .status-file {
    width: 100%;
    margin-left: 0;
    order: 99;
  }
}
</style>
