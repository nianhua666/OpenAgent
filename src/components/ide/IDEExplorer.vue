<template>
  <section class="ide-explorer glass-panel">
    <div class="explorer-head">
      <div>
        <p class="explorer-eyebrow">Workspace</p>
        <h3>文件浏览</h3>
      </div>
      <button v-if="workspace" class="refresh-btn" title="刷新结构" @click="$emit('refresh')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
        </svg>
      </button>
    </div>

    <div v-if="!workspace" class="explorer-empty">
      <strong>尚未打开工作区</strong>
      <p>先选择一个项目目录，IDE 才能读取结构、编辑文件和挂载计划。</p>
      <button class="btn btn-primary btn-sm" @click="$emit('open-workspace')">打开工作区</button>
    </div>

    <template v-else>
      <div class="explorer-meta">
        <span>{{ workspace.name }}</span>
        <span>{{ fileCount }} 个文件</span>
      </div>

      <div v-if="visibleEntries.length === 0" class="explorer-empty is-inline">
        <p>当前结构为空，或扫描结果还未生成。</p>
      </div>

      <div v-else class="explorer-tree">
        <button
          v-for="entry in visibleEntries"
          :key="entry.path"
          class="tree-row"
          :class="{
            'is-directory': entry.type === 'directory',
            'is-active': entry.path === activePath,
            'is-open': openPathSet.has(entry.path),
          }"
          :style="{ paddingLeft: `${12 + entry.depth * 16}px` }"
          @click="handleEntryClick(entry)"
        >
          <span class="tree-toggle">
            <svg v-if="entry.type === 'directory'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline :points="expandedDirectories.has(entry.path) ? '6 9 12 15 18 9' : '9 6 15 12 9 18'" />
            </svg>
            <span v-else class="file-dot"></span>
          </span>
          <span class="tree-name">{{ entry.name }}</span>
          <span v-if="openPathSet.has(entry.path) && entry.path !== activePath" class="tree-open-indicator"></span>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { IDEWorkspace, ProjectFile } from '@/types'

interface ExplorerEntry extends ProjectFile {
  name: string
  depth: number
  parentPath: string | null
  hasChildren: boolean
}

const props = defineProps<{
  workspace: IDEWorkspace | null
  activePath: string
  openPaths: string[]
}>()

const emit = defineEmits<{
  (event: 'open-file', path: string): void
  (event: 'refresh'): void
  (event: 'open-workspace'): void
}>()

const expandedDirectories = ref<Set<string>>(new Set())

const openPathSet = computed(() => new Set(props.openPaths))
const fileCount = computed(() => props.workspace?.structure?.totalFiles || 0)

const allEntries = computed<ExplorerEntry[]>(() => {
  const files = props.workspace?.structure?.files || []
  const allPaths = files.map(file => file.path.replace(/\\/g, '/'))

  return files
    .map(file => {
      const normalizedPath = file.path.replace(/\\/g, '/')
      const segments = normalizedPath.split('/').filter(Boolean)
      const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null

      return {
        ...file,
        path: normalizedPath,
        name: segments[segments.length - 1] || normalizedPath,
        depth: Math.max(segments.length - 1, 0),
        parentPath,
        hasChildren: file.type === 'directory'
          ? allPaths.some(path => path !== normalizedPath && path.startsWith(`${normalizedPath}/`))
          : false,
      }
    })
    .sort((left, right) => {
      if (left.parentPath === right.parentPath) {
        if (left.type !== right.type) {
          return left.type === 'directory' ? -1 : 1
        }
        return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
      }

      return left.path.localeCompare(right.path, 'zh-CN', { numeric: true })
    })
})

const visibleEntries = computed(() => {
  return allEntries.value.filter(entry => {
    if (!entry.parentPath) {
      return true
    }

    const ancestors = entry.parentPath.split('/').filter(Boolean)
    let current = ''
    for (const segment of ancestors) {
      current = current ? `${current}/${segment}` : segment
      if (!expandedDirectories.value.has(current)) {
        return false
      }
    }

    return true
  })
})

watch(
  () => props.workspace?.id,
  () => {
    const initialExpanded = new Set<string>()
    for (const entry of allEntries.value) {
      if (entry.type === 'directory' && entry.depth === 0) {
        initialExpanded.add(entry.path)
      }
    }
    expandedDirectories.value = initialExpanded
  },
  { immediate: true },
)

function handleEntryClick(entry: ExplorerEntry) {
  if (entry.type === 'directory') {
    if (expandedDirectories.value.has(entry.path)) {
      expandedDirectories.value.delete(entry.path)
    } else {
      expandedDirectories.value.add(entry.path)
    }
    expandedDirectories.value = new Set(expandedDirectories.value)
    return
  }

  emit('open-file', entry.path)
}
</script>

<style lang="scss" scoped>
.ide-explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.explorer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-md;
  border-bottom: 1px solid var(--border);
}

.explorer-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    background: var(--primary-bg);
    color: var(--primary);
  }
}

.explorer-meta {
  display: flex;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  color: var(--text-muted);
  font-size: $font-xs;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.explorer-tree {
  flex: 1;
  overflow: auto;
  padding: $spacing-sm 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
  min-height: 34px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: var(--primary-bg);
    color: var(--text-primary);
  }

  &.is-active {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), var(--primary-bg));
    color: var(--primary);
  }

  &.is-open:not(.is-active) .tree-name {
    color: var(--text-primary);
  }
}

.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: $font-sm;
}

.file-dot,
.tree-open-indicator {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.tree-open-indicator {
  margin-right: $spacing-sm;
  opacity: 0.55;
}

.explorer-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: $spacing-sm;
  padding: $spacing-lg;
  color: var(--text-secondary);

  p {
    line-height: 1.6;
  }

  &.is-inline {
    justify-content: flex-start;
  }
}
</style>
