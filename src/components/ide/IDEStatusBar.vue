<template>
  <footer class="ide-status-bar">
    <span>{{ workspaceName || '未打开工作区' }}</span>
    <span v-if="language">{{ language }}</span>
    <span v-if="framework">{{ framework }}</span>
    <span>打开文件 {{ openFiles }}</span>
    <span>待保存 {{ dirtyFiles }}</span>
    <span>计划 {{ planCount }}</span>
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
  activeFilePath: string
}>()
</script>

<style lang="scss" scoped>
.ide-status-bar {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 8px 14px;
  border-radius: $border-radius-md;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: var(--text-inverse);
  font-size: $font-xs;
  font-weight: 600;
  overflow: hidden;

  span {
    white-space: nowrap;
  }
}

.status-file {
  margin-left: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
