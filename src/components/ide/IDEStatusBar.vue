<template>
  <footer class="ide-status-bar">
    <span class="status-pill status-pill-strong">{{ workspaceName || '未打开工作区' }}</span>
    <span v-if="language" class="status-pill">{{ language }}</span>
    <span v-if="framework" class="status-pill">{{ framework }}</span>
    <span class="status-pill">打开文件 {{ openFiles }}</span>
    <span class="status-pill">待保存 {{ dirtyFiles }}</span>
    <span class="status-pill">计划 {{ planCount }}</span>
    <span class="status-pill">Ln {{ cursorLine }}, Col {{ cursorColumn }}</span>
    <span v-if="selectionLength > 0" class="status-pill">已选 {{ selectionLength }}</span>
    <span class="status-file">{{ activeFilePath || '未选择文件' }}</span>
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
  gap: $spacing-md;
  padding: 8px 14px;
  border-radius: $border-radius-md;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: var(--text-inverse);
  font-size: $font-xs;
  font-weight: 600;
  overflow: hidden;

}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.status-pill-strong {
  background: rgba(255, 255, 255, 0.2);
}

.status-file {
  margin-left: auto;
  min-width: 0;
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
