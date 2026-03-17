<template>
  <section class="ide-explorer glass-panel">
    <div class="explorer-head">
      <div>
        <p class="explorer-eyebrow">Workspace</p>
        <h3>文件浏览</h3>
      </div>
      <div v-if="workspace" class="explorer-actions">
        <button class="explorer-action" title="新建文件" @click="beginCreate('file')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </button>
        <button class="explorer-action" title="新建目录" @click="beginCreate('directory')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 10h18"/><path d="M12 13v6"/><path d="M9 16h6"/>
          </svg>
        </button>
        <button class="explorer-action" :disabled="copyTargetCount === 0" :title="copyActionTitle" @click="handleCopy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="explorer-action" :disabled="pasteDisabled" :title="pasteActionTitle" @click="handlePaste">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 7h-3.18A3 3 0 0 0 13 5h-2a3 3 0 0 0-2.82 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 12h6"/><path d="M12 9v6"/>
          </svg>
        </button>
        <button class="explorer-action" :disabled="!renameTargetEntry" title="重命名" @click="beginRename">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
          </svg>
        </button>
        <button class="explorer-action is-danger" :disabled="deleteTargetCount === 0" :title="deleteActionTitle" @click="handleDelete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
        <button class="explorer-action" title="刷新结构" @click="$emit('refresh')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
          </svg>
        </button>
      </div>
    </div>

    <div v-if="!workspace" class="explorer-empty">
      <strong>尚未打开工作区</strong>
      <p>先选择一个项目目录，IDE 才能读取结构、编辑文件和挂载计划。</p>
      <button class="btn btn-primary btn-sm" @click="$emit('open-workspace')">打开工作区</button>
    </div>

    <template v-else>
      <div
        class="explorer-meta"
        :class="{ 'is-drop-target': rootDropActive }"
        @dragenter.prevent="handleRootDragOver"
        @dragover.prevent="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent="handleRootDrop"
      >
        <div class="explorer-meta-copy">
          <span>{{ workspace.name }}</span>
          <span>{{ fileCount }} 个文件</span>
        </div>
        <span class="explorer-meta-hint">{{ explorerHint }}</span>
      </div>

      <div v-if="hasSelection" class="selection-bar">
        <div class="selection-copy">
          <strong>批量操作</strong>
          <span>{{ selectionSummary }}</span>
        </div>
        <div class="selection-actions">
          <button class="selection-action" @click="handleCopy">复制</button>
          <button class="selection-action" :disabled="pasteDisabled" @click="handlePaste">粘贴</button>
          <button class="selection-action" :disabled="!canBatchRename" @click="beginBatchRename">批量重命名</button>
          <button class="selection-action" @click="clearSelection">清空</button>
          <button class="selection-action is-danger" @click="handleDelete">删除所选</button>
        </div>
      </div>

      <div v-if="panelMode" class="explorer-create-panel">
        <div class="create-panel-copy">
          <strong>{{ panelTitle }}</strong>
          <span>{{ panelSubtitle }}</span>
        </div>
        <div v-if="panelMode === 'batch-rename'" class="create-panel-form is-batch">
          <div class="batch-rename-grid">
            <label class="batch-field">
              <span>查找</span>
              <input
                ref="creationInputRef"
                v-model="batchRenameFind"
                class="create-input"
                placeholder="可留空，例如 copy"
                @keydown.enter.prevent="submitPanel"
                @keydown.esc.prevent="closePanel"
              />
            </label>
            <label class="batch-field">
              <span>替换为</span>
              <input
                v-model="batchRenameReplace"
                class="create-input"
                placeholder="可留空，例如 archive"
                @keydown.enter.prevent="submitPanel"
                @keydown.esc.prevent="closePanel"
              />
            </label>
            <label class="batch-field">
              <span>前缀</span>
              <input
                v-model="batchRenamePrefix"
                class="create-input"
                placeholder="例如 feat-"
                @keydown.enter.prevent="submitPanel"
                @keydown.esc.prevent="closePanel"
              />
            </label>
            <label class="batch-field">
              <span>后缀</span>
              <input
                v-model="batchRenameSuffix"
                class="create-input"
                placeholder="例如 -draft"
                @keydown.enter.prevent="submitPanel"
                @keydown.esc.prevent="closePanel"
              />
            </label>
          </div>
          <div v-if="batchRenamePreview.length > 0" class="batch-preview">
            <div
              v-for="item in batchRenamePreview.slice(0, 6)"
              :key="item.path"
              class="batch-preview-item"
              :class="{ 'is-error': Boolean(item.error), 'is-unchanged': !item.changed && !item.error }"
            >
              <span class="batch-preview-from">{{ item.name }}</span>
              <span class="batch-preview-arrow">→</span>
              <span class="batch-preview-to">{{ item.nextName }}</span>
              <span v-if="item.error" class="batch-preview-meta">{{ item.error }}</span>
            </div>
            <p v-if="batchRenamePreview.length > 6" class="batch-preview-more">其余 {{ batchRenamePreview.length - 6 }} 项将在应用时一并更新。</p>
          </div>
          <div class="create-actions">
            <button class="btn btn-primary btn-sm" :disabled="!batchRenameCanSubmit" @click="submitPanel">{{ panelConfirmLabel }}</button>
            <button class="btn btn-ghost btn-sm" @click="closePanel">取消</button>
          </div>
        </div>
        <div v-else class="create-panel-form">
          <input
            ref="creationInputRef"
            v-model.trim="panelDraftName"
            class="create-input"
            :placeholder="panelPlaceholder"
            @keydown.enter.prevent="submitPanel"
            @keydown.esc.prevent="closePanel"
          />
          <div class="create-actions">
            <button class="btn btn-primary btn-sm" @click="submitPanel">{{ panelConfirmLabel }}</button>
            <button class="btn btn-ghost btn-sm" @click="closePanel">取消</button>
          </div>
        </div>
      </div>

      <div v-if="visibleEntries.length === 0" class="explorer-empty is-inline">
        <p>当前结构为空，或扫描结果还未生成。</p>
      </div>

      <div v-else class="explorer-tree">
        <div
          v-for="entry in visibleEntries"
          :key="entry.path"
          class="tree-row"
          :class="{
            'is-directory': entry.type === 'directory',
            'is-active': entry.path === activePath,
            'is-focused': entry.path === focusedEntryPath,
            'is-selected': selectedEntryPaths.has(entry.path),
            'is-open': openPathSet.has(entry.path),
            'is-drop-target': dropTargetPath === entry.path,
            'is-dragging': draggingPaths.includes(entry.path),
          }"
          :style="{ paddingLeft: `${12 + entry.depth * 16}px` }"
          role="button"
          tabindex="0"
          draggable="true"
          @click="handleEntryClick(entry, $event)"
          @keydown="handleEntryKeydown(entry, $event)"
          @dragstart="handleDragStart(entry, $event)"
          @dragend="resetDragState"
          @dragenter.prevent="handleDirectoryDragOver(entry, $event)"
          @dragover.prevent="handleDirectoryDragOver(entry, $event)"
          @dragleave="handleDirectoryDragLeave(entry, $event)"
          @drop.prevent="handleDirectoryDrop(entry)"
        >
          <span class="tree-toggle">
            <svg v-if="entry.type === 'directory'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline :points="expandedDirectories.has(entry.path) ? '6 9 12 15 18 9' : '9 6 15 12 9 18'" />
            </svg>
            <span v-else class="file-dot"></span>
          </span>
          <span class="tree-name">{{ entry.name }}</span>
          <span v-if="selectedEntryPaths.has(entry.path)" class="tree-badge">{{ selectedOrderMap.get(entry.path) }}</span>
          <span v-else-if="openPathSet.has(entry.path) && entry.path !== activePath" class="tree-open-indicator"></span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { IDEWorkspace, ProjectFile } from '@/types'
import { showToast } from '@/utils/toast'

interface ExplorerEntry extends ProjectFile {
  name: string
  depth: number
  parentPath: string | null
  hasChildren: boolean
}

type ExplorerEntryType = 'file' | 'directory'

const props = defineProps<{
  workspace: IDEWorkspace | null
  activePath: string
  openPaths: string[]
  clipboardCount: number
}>()

const emit = defineEmits<{
  (event: 'open-file', path: string): void
  (event: 'create-file', path: string): void
  (event: 'create-directory', path: string): void
  (event: 'copy-entries', payload: { entries: Array<{ path: string; entryType: ExplorerEntryType }> }): void
  (event: 'paste-entries', payload: { targetDirectory: string }): void
  (event: 'rename-entry', payload: { from: string; to: string; entryType: ExplorerEntryType }): void
  (event: 'rename-entries', payload: { entries: Array<{ from: string; to: string; entryType: ExplorerEntryType }> }): void
  (event: 'delete-entry', payload: { path: string; entryType: ExplorerEntryType }): void
  (event: 'delete-entries', payload: { entries: Array<{ path: string; entryType: ExplorerEntryType }> }): void
  (event: 'move-entries', payload: { sources: string[]; targetDirectory: string }): void
  (event: 'refresh'): void
  (event: 'open-workspace'): void
}>()

const expandedDirectories = ref<Set<string>>(new Set())
const focusedEntryPath = ref('')
const selectedEntryPaths = ref<Set<string>>(new Set())
const lastSelectedPath = ref('')
const panelMode = ref<'file' | 'directory' | 'rename' | 'batch-rename' | ''>('')
const panelDraftName = ref('')
const batchRenameFind = ref('')
const batchRenameReplace = ref('')
const batchRenamePrefix = ref('')
const batchRenameSuffix = ref('')
const creationInputRef = ref<HTMLInputElement | null>(null)
const draggingPaths = ref<string[]>([])
const dropTargetPath = ref('')
const rootDropActive = ref(false)

const openPathSet = computed(() => new Set(props.openPaths))
const fileCount = computed(() => props.workspace?.structure?.totalFiles || 0)
const focusedEntry = computed(() => allEntries.value.find(entry => entry.path === focusedEntryPath.value) ?? null)
const selectedEntries = computed(() => {
  const entryMap = new Map(allEntries.value.map(entry => [entry.path, entry]))
  return Array.from(selectedEntryPaths.value)
    .map(path => entryMap.get(path))
    .filter((entry): entry is ExplorerEntry => Boolean(entry))
})
const normalizedSelectedPaths = computed(() => normalizeTopLevelPaths(Array.from(selectedEntryPaths.value)))
const normalizedSelectedEntries = computed(() => {
  const entryMap = new Map(allEntries.value.map(entry => [entry.path, entry]))
  return normalizedSelectedPaths.value
    .map(path => entryMap.get(path))
    .filter((entry): entry is ExplorerEntry => Boolean(entry))
})
const renameTargetEntry = computed(() => {
  if (selectedEntryPaths.value.size === 1) {
    return selectedEntries.value[0] ?? null
  }

  if (selectedEntryPaths.value.size > 1) {
    return null
  }

  return focusedEntry.value
})
const deleteEntries = computed(() => {
  if (selectedEntryPaths.value.size > 0) {
    return normalizedSelectedEntries.value
  }

  return focusedEntry.value ? [focusedEntry.value] : []
})
const copyEntries = computed(() => {
  if (selectedEntryPaths.value.size > 0) {
    return normalizedSelectedEntries.value
  }

  return focusedEntry.value ? [focusedEntry.value] : []
})
const deleteTargetCount = computed(() => deleteEntries.value.length)
const copyTargetCount = computed(() => copyEntries.value.length)
const deleteActionTitle = computed(() => deleteTargetCount.value > 1 ? `删除 ${deleteTargetCount.value} 项` : '删除')
const copyActionTitle = computed(() => copyTargetCount.value > 1 ? `复制 ${copyTargetCount.value} 项` : '复制')
const hasSelection = computed(() => selectedEntryPaths.value.size > 0)
const collapsedSelectionCount = computed(() => normalizedSelectedPaths.value.length)
const canBatchRename = computed(() => normalizedSelectedEntries.value.length > 1)
const selectedOrderMap = computed(() => {
  const orderMap = new Map<string, number>()
  Array.from(selectedEntryPaths.value).forEach((path, index) => {
    orderMap.set(path, index + 1)
  })
  return orderMap
})
const selectionSummary = computed(() => {
  const rawCount = selectedEntryPaths.value.size
  const collapsedCount = collapsedSelectionCount.value
  if (rawCount === 0) {
    return '未选择条目'
  }

  if (rawCount === collapsedCount) {
    return `已选择 ${rawCount} 项，可批量删除、复制或拖到目录中移动`
  }

  return `已选择 ${rawCount} 项，批量操作会折叠为 ${collapsedCount} 个顶层条目`
})
const targetDirectoryPath = computed(() => {
  if (!props.workspace) {
    return ''
  }

  const targetEntry = focusedEntry.value
  if (!targetEntry) {
    return ''
  }

  if (targetEntry.type === 'directory') {
    return targetEntry.path
  }

  return targetEntry.parentPath || ''
})
const targetDirectoryLabel = computed(() => {
  if (!props.workspace) {
    return '未打开工作区'
  }

  return targetDirectoryPath.value || `${props.workspace.name}（根目录）`
})
const pasteDisabled = computed(() => props.clipboardCount <= 0)
const pasteActionTitle = computed(() => {
  if (props.clipboardCount <= 0) {
    return '剪贴板为空'
  }

  return `粘贴到 ${targetDirectoryLabel.value}`
})
const explorerHint = computed(() => {
  if (rootDropActive.value) {
    return '释放到根目录'
  }

  if (hasSelection.value) {
    if (props.clipboardCount > 0) {
      return `${selectionSummary.value}，剪贴板 ${props.clipboardCount} 项，可粘贴到 ${targetDirectoryLabel.value}`
    }
    return selectionSummary.value
  }

  if (props.clipboardCount > 0) {
    return `剪贴板 ${props.clipboardCount} 项，可粘贴到 ${targetDirectoryLabel.value}`
  }

  return 'Ctrl/Cmd 多选，Shift 连续选择，拖到目录中移动'
})
const batchRenamePreview = computed(() => {
  const movedPaths = new Set<string>()
  const existingPaths = new Set(allEntries.value.map(entry => entry.path))
  const preview = normalizedSelectedEntries.value.map(entry => {
    const { stem, extension } = splitEntryName(entry.name, entry.type)
    const replacedStem = batchRenameFind.value ? stem.split(batchRenameFind.value).join(batchRenameReplace.value) : stem
    const nextStem = `${batchRenamePrefix.value}${replacedStem}${batchRenameSuffix.value}`
    const nextName = `${nextStem}${extension}`
    const nextPath = entry.parentPath ? `${entry.parentPath}/${nextName}` : nextName
    const nameError = validateEntryName(nextName)
    const changed = nextPath !== entry.path
    if (changed) {
      movedPaths.add(entry.path)
    }

    return {
      path: entry.path,
      name: entry.name,
      entryType: entry.type,
      nextName,
      nextPath,
      changed,
      error: nameError,
    }
  })

  const targetPathCounts = new Map<string, number>()
  preview.forEach(item => {
    if (item.changed && !item.error) {
      targetPathCounts.set(item.nextPath, (targetPathCounts.get(item.nextPath) || 0) + 1)
    }
  })

  return preview.map(item => {
    if (item.error || !item.changed) {
      return item
    }

    if ((targetPathCounts.get(item.nextPath) || 0) > 1) {
      return { ...item, error: '目标名称重复' }
    }

    if (existingPaths.has(item.nextPath) && !movedPaths.has(item.nextPath)) {
      return { ...item, error: '目标路径已存在' }
    }

    return item
  })
})
const batchRenameChangedCount = computed(() => batchRenamePreview.value.filter(item => item.changed).length)
const batchRenameHasErrors = computed(() => batchRenamePreview.value.some(item => Boolean(item.error)))
const batchRenameCanSubmit = computed(() => batchRenameChangedCount.value > 0 && !batchRenameHasErrors.value)
const panelTitle = computed(() => {
  if (panelMode.value === 'batch-rename') {
    return '批量重命名'
  }

  if (panelMode.value === 'rename') {
    return renameTargetEntry.value?.type === 'directory' ? '重命名目录' : '重命名文件'
  }

  return panelMode.value === 'directory' ? '新建目录' : '新建文件'
})
const panelSubtitle = computed(() => {
  if (panelMode.value === 'batch-rename') {
    return `已选择 ${normalizedSelectedEntries.value.length} 个条目，仅修改文件名本体并自动保留文件扩展名。`
  }

  if (panelMode.value === 'rename') {
    return renameTargetEntry.value ? `当前目标：${renameTargetEntry.value.path}` : '请选择要重命名的条目'
  }

  return `目标位置：${targetDirectoryLabel.value}`
})
const panelPlaceholder = computed(() => {
  if (panelMode.value === 'rename') {
    return renameTargetEntry.value?.type === 'directory' ? '输入新的目录名称' : '输入新的文件名称'
  }

  return panelMode.value === 'directory'
    ? '例如 components 或 docs'
    : '例如 index.ts 或 README.md'
})
const panelConfirmLabel = computed(() => {
  if (panelMode.value === 'batch-rename') {
    return '应用批量重命名'
  }

  if (panelMode.value === 'rename') {
    return '确认重命名'
  }

  return panelMode.value === 'directory' ? '创建目录' : '创建文件'
})

const allEntries = computed<ExplorerEntry[]>(() => {
  const files = props.workspace?.structure?.files || []
  const allPaths = files.map(file => normalizeWorkspaceRelativePath(file.path))

  return files
    .map(file => {
      const normalizedPath = normalizeWorkspaceRelativePath(file.path)
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
    focusedEntryPath.value = ''
    clearSelection()
    resetDragState()
    closePanel()
  },
  { immediate: true },
)

watch(
  () => props.activePath,
  nextPath => {
    if (nextPath) {
      focusedEntryPath.value = nextPath
      lastSelectedPath.value = nextPath
    }
  },
  { immediate: true },
)

watch(canBatchRename, nextCanBatchRename => {
  if (!nextCanBatchRename && panelMode.value === 'batch-rename') {
    closePanel()
  }
})

watch(panelMode, async nextMode => {
  if (!nextMode) {
    panelDraftName.value = ''
    batchRenameFind.value = ''
    batchRenameReplace.value = ''
    batchRenamePrefix.value = ''
    batchRenameSuffix.value = ''
    return
  }

  await nextTick()
  creationInputRef.value?.focus()
  creationInputRef.value?.select()
})

function normalizeWorkspaceRelativePath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

function normalizeTopLevelPaths(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.map(normalizeWorkspaceRelativePath).filter(Boolean)))
    .sort((left, right) => left.length - right.length || left.localeCompare(right, 'zh-CN', { numeric: true }))

  return uniquePaths.filter(path => !uniquePaths.some(other => other !== path && path.startsWith(`${other}/`)))
}

function splitEntryName(name: string, entryType: ExplorerEntryType) {
  if (entryType === 'directory') {
    return { stem: name, extension: '' }
  }

  const lastDotIndex = name.lastIndexOf('.')
  if (lastDotIndex <= 0) {
    return { stem: name, extension: '' }
  }

  return {
    stem: name.slice(0, lastDotIndex),
    extension: name.slice(lastDotIndex),
  }
}

function validateEntryName(name: string) {
  if (!name || !name.trim()) {
    return '名称不能为空'
  }

  if (name === '.' || name === '..') {
    return '名称不能为 . 或 ..'
  }

  if (/[\\/]/.test(name) || /[<>:"|?*]/.test(name)) {
    return '名称包含非法字符'
  }

  if (/[. ]$/.test(name)) {
    return '名称不能以空格或点结尾'
  }

  return ''
}

function getPathName(path: string) {
  const segments = normalizeWorkspaceRelativePath(path).split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function buildTargetPath(targetDirectory: string, sourcePath: string) {
  const sourceName = getPathName(sourcePath)
  return targetDirectory ? `${targetDirectory}/${sourceName}` : sourceName
}

function isMoveIntoSelfOrDescendant(sourcePath: string, targetDirectory: string) {
  return targetDirectory === sourcePath || targetDirectory.startsWith(`${sourcePath}/`)
}

function clearSelection() {
  if (selectedEntryPaths.value.size === 0) {
    return
  }

  selectedEntryPaths.value = new Set()
}

function setSelection(paths: string[]) {
  selectedEntryPaths.value = new Set(paths.map(normalizeWorkspaceRelativePath).filter(Boolean))
}

function toggleDirectory(path: string) {
  if (expandedDirectories.value.has(path)) {
    expandedDirectories.value.delete(path)
  } else {
    expandedDirectories.value.add(path)
  }
  expandedDirectories.value = new Set(expandedDirectories.value)
}

function applyRangeSelection(targetPath: string) {
  const anchorPath = lastSelectedPath.value || focusedEntryPath.value
  if (!anchorPath) {
    setSelection([targetPath])
    lastSelectedPath.value = targetPath
    return
  }

  const visiblePaths = visibleEntries.value.map(entry => entry.path)
  const startIndex = visiblePaths.indexOf(anchorPath)
  const endIndex = visiblePaths.indexOf(targetPath)
  if (startIndex === -1 || endIndex === -1) {
    setSelection([targetPath])
    lastSelectedPath.value = targetPath
    return
  }

  const [fromIndex, toIndex] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
  setSelection(visiblePaths.slice(fromIndex, toIndex + 1))
  lastSelectedPath.value = targetPath
}

function handleEntryClick(entry: ExplorerEntry, event: MouseEvent) {
  focusedEntryPath.value = entry.path

  if (event.shiftKey) {
    applyRangeSelection(entry.path)
    return
  }

  if (event.metaKey || event.ctrlKey) {
    const nextSelection = new Set(selectedEntryPaths.value)
    if (nextSelection.has(entry.path)) {
      nextSelection.delete(entry.path)
    } else {
      nextSelection.add(entry.path)
    }
    selectedEntryPaths.value = nextSelection
    lastSelectedPath.value = entry.path
    return
  }

  clearSelection()
  lastSelectedPath.value = entry.path

  if (entry.type === 'directory') {
    toggleDirectory(entry.path)
    return
  }

  emit('open-file', entry.path)
}

function handleEntryOpen(entry: ExplorerEntry) {
  focusedEntryPath.value = entry.path
  lastSelectedPath.value = entry.path
  clearSelection()

  if (entry.type === 'directory') {
    toggleDirectory(entry.path)
    return
  }

  emit('open-file', entry.path)
}

function handleEntryKeydown(entry: ExplorerEntry, event: KeyboardEvent) {
  const lowerKey = event.key.toLowerCase()

  if ((event.metaKey || event.ctrlKey) && lowerKey === 'c') {
    event.preventDefault()
    focusedEntryPath.value = entry.path
    lastSelectedPath.value = entry.path
    handleCopy()
    return
  }

  if ((event.metaKey || event.ctrlKey) && lowerKey === 'v') {
    event.preventDefault()
    focusedEntryPath.value = entry.path
    lastSelectedPath.value = entry.path
    handlePaste()
    return
  }

  if (event.key === 'Delete') {
    event.preventDefault()
    handleDelete()
    return
  }

  if (event.key === 'F2') {
    event.preventDefault()
    focusedEntryPath.value = entry.path
    lastSelectedPath.value = entry.path
    beginRename()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    clearSelection()
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleEntryOpen(entry)
  }
}

function beginCreate(mode: 'file' | 'directory') {
  if (!props.workspace) {
    return
  }

  panelMode.value = mode

  if (!focusedEntryPath.value) {
    const firstDirectory = allEntries.value.find(entry => entry.type === 'directory' && entry.depth === 0)
    if (firstDirectory) {
      focusedEntryPath.value = firstDirectory.path
      lastSelectedPath.value = firstDirectory.path
    }
  }
}

function beginRename() {
  if (!renameTargetEntry.value) {
    return
  }

  panelMode.value = 'rename'
  panelDraftName.value = renameTargetEntry.value.name
}

function beginBatchRename() {
  if (!canBatchRename.value) {
    return
  }

  panelMode.value = 'batch-rename'
}

function closePanel() {
  panelMode.value = ''
  panelDraftName.value = ''
}

function submitPanel() {
  if (!props.workspace || !panelMode.value) {
    return
  }

  if (panelMode.value === 'batch-rename') {
    if (!batchRenameCanSubmit.value) {
      showToast('warning', batchRenameHasErrors.value ? '请先处理批量重命名中的冲突项' : '当前没有可应用的批量重命名变更')
      return
    }

    emit('rename-entries', {
      entries: batchRenamePreview.value
        .filter(item => item.changed && !item.error)
        .map(item => ({
          from: item.path,
          to: item.nextPath,
          entryType: item.entryType,
        })),
    })
    clearSelection()
    closePanel()
    return
  }

  const normalizedName = panelDraftName.value.trim()
  if (!normalizedName) {
    showToast('warning', '请输入文件或目录名称')
    return
  }

  // 资源管理器侧先拦截非法路径片段，避免把目录穿透与系统保留字符带到 IPC。
  if (
    normalizedName === '.'
    || normalizedName === '..'
    || /[\\/]/.test(normalizedName)
    || /[<>:"|?*]/.test(normalizedName)
  ) {
    showToast('error', '名称不能包含路径分隔符、保留字符或仅为 . / ..')
    return
  }

  if (panelMode.value === 'rename') {
    const targetEntry = renameTargetEntry.value
    if (!targetEntry) {
      return
    }

    if (normalizedName === targetEntry.name) {
      closePanel()
      return
    }

    const nextPath = targetEntry.parentPath
      ? `${targetEntry.parentPath}/${normalizedName}`
      : normalizedName

    if (targetEntry.type === 'directory') {
      remapExpandedDirectories(targetEntry.path, nextPath)
    }

    emit('rename-entry', {
      from: targetEntry.path,
      to: nextPath,
      entryType: targetEntry.type,
    })
    focusedEntryPath.value = nextPath
    closePanel()
    return
  }

  const targetPath = targetDirectoryPath.value
    ? `${targetDirectoryPath.value}/${normalizedName}`
    : normalizedName

  if (panelMode.value === 'file') {
    emit('create-file', targetPath)
  } else {
    if (targetDirectoryPath.value) {
      expandedDirectories.value.add(targetDirectoryPath.value)
    }
    expandedDirectories.value.add(targetPath)
    expandedDirectories.value = new Set(expandedDirectories.value)
    emit('create-directory', targetPath)
  }

  focusedEntryPath.value = targetPath
  lastSelectedPath.value = targetPath
  closePanel()
}

function handleDelete() {
  if (deleteEntries.value.length === 0) {
    return
  }

  const confirmed = deleteEntries.value.length === 1
    ? window.confirm(
      deleteEntries.value[0].type === 'directory'
        ? `确认删除目录“${deleteEntries.value[0].path}”及其全部内容？`
        : `确认删除文件“${deleteEntries.value[0].path}”？`,
    )
    : window.confirm(`确认删除所选 ${deleteEntries.value.length} 个顶层条目？目录下的全部内容也会一并删除。`)
  if (!confirmed) {
    return
  }

  if (deleteEntries.value.length === 1) {
    emit('delete-entry', {
      path: deleteEntries.value[0].path,
      entryType: deleteEntries.value[0].type,
    })
  } else {
    emit('delete-entries', {
      entries: deleteEntries.value.map(entry => ({
        path: entry.path,
        entryType: entry.type,
      })),
    })
  }

  clearSelection()
  closePanel()
}

function handleCopy() {
  if (copyEntries.value.length === 0) {
    showToast('warning', '当前没有可复制的条目')
    return
  }

  emit('copy-entries', {
    entries: copyEntries.value.map(entry => ({
      path: entry.path,
      entryType: entry.type,
    })),
  })
}

function handlePaste() {
  if (pasteDisabled.value) {
    showToast('warning', '剪贴板当前为空')
    return
  }

  emit('paste-entries', {
    targetDirectory: targetDirectoryPath.value,
  })
}

function resolveDragPaths(entry: ExplorerEntry) {
  if (selectedEntryPaths.value.has(entry.path) && selectedEntryPaths.value.size > 0) {
    return normalizeTopLevelPaths(Array.from(selectedEntryPaths.value))
  }

  return [entry.path]
}

function canDropToDirectory(targetDirectory: string) {
  if (draggingPaths.value.length === 0) {
    return false
  }

  return draggingPaths.value.some(sourcePath => {
    if (isMoveIntoSelfOrDescendant(sourcePath, targetDirectory)) {
      return false
    }

    return buildTargetPath(targetDirectory, sourcePath) !== sourcePath
  })
}

function handleDragStart(entry: ExplorerEntry, event: DragEvent) {
  focusedEntryPath.value = entry.path
  lastSelectedPath.value = entry.path

  if (!selectedEntryPaths.value.has(entry.path) && selectedEntryPaths.value.size > 0) {
    clearSelection()
  }

  draggingPaths.value = resolveDragPaths(entry)
  dropTargetPath.value = ''
  rootDropActive.value = false

  if (!event.dataTransfer) {
    return
  }

  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', draggingPaths.value.join('\n'))
}

function resetDragState() {
  draggingPaths.value = []
  dropTargetPath.value = ''
  rootDropActive.value = false
}

function handleDirectoryDragOver(entry: ExplorerEntry, event: DragEvent) {
  if (entry.type !== 'directory') {
    return
  }

  if (!canDropToDirectory(entry.path)) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    if (dropTargetPath.value === entry.path) {
      dropTargetPath.value = ''
    }
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  rootDropActive.value = false
  dropTargetPath.value = entry.path
}

function handleDirectoryDragLeave(entry: ExplorerEntry, event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const nextTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(nextTarget)) {
    return
  }

  if (dropTargetPath.value === entry.path) {
    dropTargetPath.value = ''
  }
}

function handleDirectoryDrop(entry: ExplorerEntry) {
  if (entry.type !== 'directory' || !canDropToDirectory(entry.path)) {
    resetDragState()
    return
  }

  expandedDirectories.value.add(entry.path)
  expandedDirectories.value = new Set(expandedDirectories.value)
  emit('move-entries', {
    sources: [...draggingPaths.value],
    targetDirectory: entry.path,
  })
  resetDragState()
}

function handleRootDragOver(event: DragEvent) {
  if (!canDropToDirectory('')) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    rootDropActive.value = false
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dropTargetPath.value = ''
  rootDropActive.value = true
}

function handleRootDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const nextTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(nextTarget)) {
    return
  }

  rootDropActive.value = false
}

function handleRootDrop() {
  if (!canDropToDirectory('')) {
    resetDragState()
    return
  }

  emit('move-entries', {
    sources: [...draggingPaths.value],
    targetDirectory: '',
  })
  resetDragState()
}

function remapExpandedDirectories(fromPath: string, toPath: string) {
  const nextExpanded = new Set<string>()
  for (const path of expandedDirectories.value) {
    if (path === fromPath || path.startsWith(`${fromPath}/`)) {
      nextExpanded.add(path.replace(fromPath, toPath))
    } else {
      nextExpanded.add(path)
    }
  }
  expandedDirectories.value = nextExpanded
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
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.78), rgba(241, 245, 249, 0.42));
}

.explorer-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.explorer-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.explorer-action,
.selection-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast, border-color $transition-fast;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.explorer-action {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);

  &:hover {
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-primary);
  }

  &.is-danger:hover:not(:disabled) {
    background: rgba(201, 53, 44, 0.1);
    color: var(--danger);
  }
}

.explorer-meta,
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.explorer-meta {
  color: var(--text-muted);
  font-size: $font-xs;
  transition: background $transition-fast, border-color $transition-fast;

  &.is-drop-target {
    background: rgba(58, 96, 255, 0.08);
    border-color: rgba(58, 96, 255, 0.2);
    color: var(--primary);
  }
}

.explorer-meta-copy,
.selection-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.explorer-meta-hint,
.selection-copy span {
  color: var(--text-muted);
}

.selection-bar {
  background: rgba(241, 245, 249, 0.72);
}

.selection-copy {
  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    font-size: $font-xs;
  }
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.selection-action {
  min-height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  font-size: $font-xs;
  font-weight: 700;

  &:hover {
    background: var(--primary-bg);
    color: var(--primary);
  }

  &.is-danger:hover:not(:disabled) {
    background: rgba(201, 53, 44, 0.1);
    color: var(--danger);
  }
}

.explorer-create-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(255, 255, 255, 0.4);
}

.create-panel-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    color: var(--text-muted);
    font-size: $font-xs;
  }
}

.create-panel-form,
.create-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.create-panel-form {
  flex-wrap: wrap;

  &.is-batch {
    align-items: stretch;
    flex-direction: column;
  }
}

.create-input {
  flex: 1;
  min-width: 180px;
  min-height: 38px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  font-size: $font-sm;

  &:focus {
    border-color: var(--border-active);
    outline: none;
    box-shadow: 0 0 0 3px rgba(58, 96, 255, 0.12);
  }
}

.batch-rename-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $spacing-sm;
}

.batch-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  span {
    color: var(--text-muted);
    font-size: $font-xs;
    font-weight: 700;
  }
}

.batch-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.72);
}

.batch-preview-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--text-secondary);
  font-size: $font-xs;

  &.is-error {
    color: var(--danger);
  }

  &.is-unchanged {
    opacity: 0.65;
  }
}

.batch-preview-from,
.batch-preview-to {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-preview-arrow {
  color: var(--text-muted);
}

.batch-preview-meta {
  grid-column: 1 / -1;
  color: inherit;
}

.batch-preview-more {
  color: var(--text-muted);
  font-size: 11px;
}

.explorer-tree {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
  min-height: 26px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: background $transition-fast, color $transition-fast, transform $transition-fast;

  &:hover {
    background: rgba(59, 130, 246, 0.08);
    color: var(--text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1px rgba(58, 96, 255, 0.24);
  }

  &.is-focused:not(.is-active):not(.is-selected) {
    background: rgba(58, 96, 255, 0.06);
    color: var(--text-primary);
  }

  &.is-selected:not(.is-active) {
    background: rgba(58, 96, 255, 0.09);
    color: var(--text-primary);
  }

  &.is-active {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(219, 234, 254, 0.94));
    color: var(--primary);
  }

  &.is-open:not(.is-active) .tree-name {
    color: var(--text-primary);
  }

  &.is-drop-target {
    background: rgba(58, 96, 255, 0.16);
    color: var(--primary);
  }

  &.is-dragging {
    opacity: 0.58;
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
  font-size: 12px;
}

.tree-badge,
.file-dot,
.tree-open-indicator {
  border-radius: 999px;
}

.tree-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  background: rgba(58, 96, 255, 0.12);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.file-dot,
.tree-open-indicator {
  width: 6px;
  height: 6px;
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

@media (max-width: 960px) {
  .create-panel-form,
  .selection-bar,
  .explorer-meta {
    align-items: stretch;
    flex-direction: column;
  }

  .create-actions,
  .selection-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .explorer-meta-hint {
    text-align: left;
  }

  .batch-rename-grid {
    grid-template-columns: 1fr;
  }
}
</style>
