<template>
  <div class="ide-view">
    <section class="ide-header glass-panel">
      <div class="header-copy">
        <p class="header-eyebrow">OpenAgent v3.0</p>
        <h1>IDE Mode</h1>
        <p>把工作区、文件编辑、项目计划和开发日志放到同一个界面里，并直接在工作区内运行真实 shell 命令。</p>
      </div>

      <div class="header-actions">
        <button class="mode-pill ghost" @click="openAgentView">Agent</button>
        <button class="mode-pill active">IDE</button>
        <button class="btn btn-secondary btn-sm" @click="openWorkspacePicker">{{ workspace ? '切换工作区' : '打开工作区' }}</button>
        <button class="btn btn-ghost btn-sm" :disabled="!workspace || refreshingWorkspace" @click="refreshWorkspaceState()">刷新结构</button>
      </div>
    </section>

    <section v-if="!workspace" class="ide-onboarding glass-panel">
      <div class="onboarding-copy">
        <strong>当前还没有绑定工作区</strong>
        <p>先选择一个项目目录。绑定后，IDE 模式会扫描项目结构、打开文件、同步计划和开发日志。</p>
      </div>
      <button class="btn btn-primary" @click="openWorkspacePicker">选择项目目录</button>
    </section>

    <template v-else>
      <div class="ide-shell">
        <IDEActivityBar
          :workspace-ready="Boolean(workspace)"
          :dirty-count="dirtyFileCount"
          @open-workspace="openWorkspacePicker"
          @refresh-workspace="refreshWorkspaceState"
          @save-all="saveAllTabs"
          @open-agent="openAgentView"
        />

        <IDEExplorer
          :workspace="workspace"
          :active-path="activeFilePath"
          :open-paths="openTabPaths"
          :clipboard-count="clipboardCount"
          @open-file="openFile"
          @create-file="handleCreateFile"
          @create-directory="handleCreateDirectory"
          @copy-entries="handleCopyEntries"
          @paste-entries="handlePasteEntries"
          @rename-entry="handleRenameEntry"
          @rename-entries="handleRenameEntries"
          @delete-entry="handleDeleteEntry"
          @delete-entries="handleDeleteEntries"
          @move-entries="handleMoveEntries"
          @refresh="refreshWorkspaceState"
          @open-workspace="openWorkspacePicker"
        />

        <div class="ide-center">
          <IDEEditor
            :tabs="editorTabs"
            :active-path="activeFilePath"
            :workspace-name="workspace.name"
            @select-tab="selectTab"
            @close-tab="closeTab"
            @update-content="updateActiveTabContent"
            @update-selection="updateActiveTabSelection"
            @save="saveActiveTab"
            @save-all="saveAllTabs"
          />

          <IDETerminal
            :workspace-path="workspace.rootPath"
            :active-file-path="activeFilePath"
            :dirty-count="dirtyFileCount"
            :scripts="terminalScripts"
          />
        </div>

        <div class="ide-sidebar">
          <IDEPlanPanel
            :plans="workspacePlans"
            :selected-plan-id="selectedPlanId"
            :replanning="replanningPlan"
            :syncing-baseline="syncingPlanBaseline"
            :updating-plan-status="updatingPlanStatus"
            :selected-plan-drift="selectedPlanDrift"
            :execution-packet="selectedPlanExecutionPacket"
            @select-plan="selectedPlanId = $event"
            @create-plan="createGeneratedPlanDraft"
            @update-plan-status="handleUpdatePlanStatus"
            @replan-plan="handleReplanPlan"
            @sync-plan-baseline="handleSyncPlanBaseline"
          />

          <IDEDevLog :plan="selectedPlan" />
        </div>
      </div>

      <IDEStatusBar
        :workspace-name="workspace.name"
        :language="workspace.language"
        :framework="workspace.framework"
        :open-files="editorTabs.length"
        :dirty-files="dirtyFileCount"
        :plan-count="workspacePlans.length"
        :cursor-line="editorCursorState.line"
        :cursor-column="editorCursorState.column"
        :selection-length="editorCursorState.selectionLength"
        :active-file-path="activeFilePath"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import IDEActivityBar from '@/components/ide/IDEActivityBar.vue'
import IDEDevLog from '@/components/ide/IDEDevLog.vue'
import IDEEditor from '@/components/ide/IDEEditor.vue'
import IDEExplorer from '@/components/ide/IDEExplorer.vue'
import IDEPlanPanel from '@/components/ide/IDEPlanPanel.vue'
import IDEStatusBar from '@/components/ide/IDEStatusBar.vue'
import IDETerminal from '@/components/ide/IDETerminal.vue'
import { useAIStore } from '@/stores/ai'
import type { IDEEditorSession, PlanStatus, ProjectPlanDriftSummary, ProjectPlanExecutionPacket } from '@/types'
import { copyWorkspaceEntry, createWorkspaceDirectory, createWorkspaceFile, deleteWorkspaceEntry, renameWorkspaceEntry, workspaceFileExists, openWorkspace, readWorkspaceFile, refreshWorkspaceStructure, writeWorkspaceFile } from '@/utils/aiIDEWorkspace'
import { buildPlanExecutionPacket, flushPlanToWorkspace, generateInitialPlanPhases, inspectPlanWorkspaceDrift, recordPlanWorkspaceSnapshot, replanProjectPlan, syncPlanWorkspaceBaseline } from '@/utils/aiPlanEngine'
import { showToast } from '@/utils/toast'

interface EditorTabState {
  path: string
  content: string
  savedContent: string
  language?: string
  loading: boolean
  error: string
  selectionStart: number
  selectionEnd: number
}

interface ExplorerEntryPayload {
  path: string
  entryType: 'file' | 'directory'
}

interface ExplorerDeleteEntriesPayload {
  entries: ExplorerEntryPayload[]
}

interface ExplorerCopyEntriesPayload {
  entries: ExplorerEntryPayload[]
}

interface ExplorerPasteEntriesPayload {
  targetDirectory: string
}

interface ExplorerRenameEntriesPayload {
  entries: Array<{ from: string; to: string; entryType: 'file' | 'directory' }>
}

interface ExplorerMoveEntriesPayload {
  sources: string[]
  targetDirectory: string
}

interface EditorSelectionPayload {
  selectionStart: number
  selectionEnd: number
}

type WorkspacePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

const aiStore = useAIStore()
const router = useRouter()

const editorTabs = ref<EditorTabState[]>([])
const activeFilePath = ref('')
const terminalScripts = ref<Array<{ name: string; command: string }>>([])
const explorerClipboardEntries = ref<ExplorerEntryPayload[]>([])
const selectedPlanId = ref('')
const refreshingWorkspace = ref(false)
const replanningPlan = ref(false)
const syncingPlanBaseline = ref(false)
const updatingPlanStatus = ref(false)
const selectedPlanDrift = ref<ProjectPlanDriftSummary | null>(null)
let selectedPlanDriftRequestId = 0
let selectedPlanDriftTimer: ReturnType<typeof setTimeout> | null = null
let syncingEditorSession = false

const workspace = computed(() => aiStore.ideWorkspace)
const workspacePlans = computed(() => {
  if (!workspace.value) {
    return []
  }

  return [...aiStore.projectPlans]
    .filter(plan => plan.workspaceId === workspace.value?.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)
})
const selectedPlan = computed(() => {
  return workspacePlans.value.find(plan => plan.id === selectedPlanId.value) ?? workspacePlans.value[0] ?? null
})
const selectedPlanExecutionPacket = computed<ProjectPlanExecutionPacket | null>(() => {
  if (!selectedPlan.value) {
    return null
  }

  return buildPlanExecutionPacket(selectedPlan.value)
})
const openTabPaths = computed(() => editorTabs.value.map(tab => tab.path))
const clipboardCount = computed(() => explorerClipboardEntries.value.length)
const dirtyFileCount = computed(() => editorTabs.value.filter(tab => tab.content !== tab.savedContent).length)
const activeTab = computed(() => editorTabs.value.find(tab => tab.path === activeFilePath.value) ?? null)
const editorCursorState = computed(() => {
  if (!activeTab.value) {
    return {
      line: 1,
      column: 1,
      selectionLength: 0,
    }
  }

  return deriveEditorCursorState(
    activeTab.value.content,
    activeTab.value.selectionStart,
    activeTab.value.selectionEnd,
  )
})

async function withEditorSessionSyncPaused(task: () => void | Promise<void>) {
  syncingEditorSession = true
  try {
    await task()
  } finally {
    await nextTick()
    syncingEditorSession = false
  }
}

function normalizeSelectionOffset(value: number, contentLength: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(Math.trunc(value), 0), contentLength)
}

function normalizeEditorSelectionRange(content: string, selectionStart: number, selectionEnd: number) {
  const contentLength = content.length
  const start = normalizeSelectionOffset(selectionStart, contentLength)
  const end = normalizeSelectionOffset(selectionEnd, contentLength)

  return {
    selectionStart: Math.min(start, end),
    selectionEnd: Math.max(start, end),
  }
}

function deriveEditorCursorState(content: string, selectionStart: number, selectionEnd: number) {
  const normalizedSelection = normalizeEditorSelectionRange(content, selectionStart, selectionEnd)
  const leadingContent = content.slice(0, normalizedSelection.selectionStart)
  const lines = leadingContent.split(/\r?\n/)
  const activeLine = lines[lines.length - 1] ?? ''

  return {
    line: lines.length,
    column: activeLine.length + 1,
    selectionLength: normalizedSelection.selectionEnd - normalizedSelection.selectionStart,
  }
}

function buildEditorSessionSnapshot(): IDEEditorSession | null {
  if (!workspace.value) {
    return null
  }

  const tabs = editorTabs.value
    .filter(tab => tab.path.trim() && !tab.loading && (!tab.error || tab.content !== tab.savedContent))
    .map(tab => {
      const normalizedSelection = normalizeEditorSelectionRange(tab.content, tab.selectionStart, tab.selectionEnd)
      return {
        path: tab.path,
        content: tab.content,
        savedContent: tab.savedContent,
        language: tab.language,
        selectionStart: normalizedSelection.selectionStart,
        selectionEnd: normalizedSelection.selectionEnd,
      }
    })

  if (tabs.length === 0) {
    return null
  }

  const activePath = tabs.some(tab => tab.path === activeFilePath.value)
    ? activeFilePath.value
    : tabs[0]?.path || ''

  return {
    workspaceId: workspace.value.id,
    tabs,
    activePath,
    updatedAt: Date.now(),
  }
}

function persistEditorSession(options?: { immediate?: boolean }) {
  aiStore.setIDEEditorSession(buildEditorSessionSnapshot(), options)
}

async function restoreEditorSessionForWorkspace(workspaceId: string) {
  const session = aiStore.ideEditorSession
  const currentWorkspace = workspace.value
  if (!session || session.workspaceId !== workspaceId || !currentWorkspace || session.tabs.length === 0) {
    return null
  }

  const workspaceFileSet = new Set(
    (currentWorkspace.structure?.files ?? [])
      .filter(entry => entry.type === 'file')
      .map(entry => normalizeWorkspaceRelativePath(entry.path)),
  )
  const shouldValidateTabs = workspaceFileSet.size > 0
  const restorableTabs = session.tabs
    .filter(tab => {
      const normalizedPath = normalizeWorkspaceRelativePath(tab.path)
      if (!shouldValidateTabs) {
        return true
      }

      return workspaceFileSet.has(normalizedPath) || tab.content !== tab.savedContent
    })
    .map(tab => {
      const normalizedPath = normalizeWorkspaceRelativePath(tab.path)
      const fileMissing = shouldValidateTabs && !workspaceFileSet.has(normalizedPath)
      const normalizedSelection = normalizeEditorSelectionRange(tab.content, tab.selectionStart ?? 0, tab.selectionEnd ?? 0)
      return {
        path: normalizedPath,
        content: tab.content,
        savedContent: tab.savedContent,
        language: tab.language,
        loading: false,
        error: fileMissing ? '文件已不在当前工作区中，当前保留的是上次未保存草稿。' : '',
        selectionStart: normalizedSelection.selectionStart,
        selectionEnd: normalizedSelection.selectionEnd,
      } satisfies EditorTabState
    })

  if (restorableTabs.length === 0) {
    return null
  }

  await withEditorSessionSyncPaused(() => {
    editorTabs.value = restorableTabs
    activeFilePath.value = restorableTabs.some(tab => tab.path === session.activePath)
      ? session.activePath
      : restorableTabs[0]?.path || ''
  })

  return {
    totalTabs: restorableTabs.length,
    dirtyTabs: restorableTabs.filter(tab => tab.content !== tab.savedContent).length,
    skippedTabs: Math.max(0, session.tabs.length - restorableTabs.length),
  }
}

watch(
  () => workspace.value?.id,
  async (nextWorkspaceId, previousWorkspaceId) => {
    if (nextWorkspaceId === previousWorkspaceId) {
      return
    }

    await withEditorSessionSyncPaused(() => {
      editorTabs.value = []
      activeFilePath.value = ''
      explorerClipboardEntries.value = []
    })
    selectedPlanId.value = workspacePlans.value[0]?.id || ''
    await loadWorkspaceScripts()
    const restoredSession = nextWorkspaceId
      ? await restoreEditorSessionForWorkspace(nextWorkspaceId)
      : null
    if (!restoredSession) {
      aiStore.setIDEEditorSession(null, { immediate: true })
    }
    await refreshSelectedPlanDrift({ silent: true })
    if (restoredSession) {
      const summaryParts = [`已恢复 ${restoredSession.totalTabs} 个编辑标签`]
      if (restoredSession.dirtyTabs > 0) {
        summaryParts.push(`其中 ${restoredSession.dirtyTabs} 个包含未保存草稿`)
      }
      if (restoredSession.skippedTabs > 0) {
        summaryParts.push(`跳过 ${restoredSession.skippedTabs} 个已失效的只读标签`)
      }
      showToast('success', summaryParts.join('，'))
    }
  },
  { immediate: true },
)

watch(
  [() => workspace.value?.id || '', editorTabs, activeFilePath],
  () => {
    if (syncingEditorSession) {
      return
    }

    persistEditorSession()
  },
  { deep: true },
)

watch(workspacePlans, plans => {
  if (!selectedPlanId.value || !plans.some(plan => plan.id === selectedPlanId.value)) {
    selectedPlanId.value = plans[0]?.id || ''
  }
})

watch(
  () => [workspace.value?.id || '', selectedPlanId.value, workspacePlans.value.length],
  () => {
    void refreshSelectedPlanDrift({ silent: true })
  },
  { immediate: true },
)

watch(dirtyFileCount, (nextCount, previousCount) => {
  if (nextCount < previousCount) {
    scheduleSelectedPlanDriftRefresh()
  }
})

onMounted(async () => {
  aiStore.setAgentMode('ide')
  window.addEventListener('beforeunload', handleBeforeUnload)
  await loadWorkspaceScripts()
  await refreshSelectedPlanDrift({ silent: true })
})

onBeforeRouteLeave(() => {
  persistEditorSession({ immediate: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  persistEditorSession({ immediate: true })
  if (selectedPlanDriftTimer) {
    clearTimeout(selectedPlanDriftTimer)
    selectedPlanDriftTimer = null
  }
})

function handleBeforeUnload() {
  persistEditorSession({ immediate: true })
}

function openAgentView() {
  persistEditorSession({ immediate: true })
  void router.push('/ai')
}

async function openWorkspacePicker() {
  if (!window.electronAPI?.chooseDirectory) {
    showToast('error', '当前环境不支持打开本地目录')
    return
  }

  if (dirtyFileCount.value > 0 && !window.confirm('当前有未保存文件，切换工作区会关闭这些编辑标签。是否继续？')) {
    return
  }

  const selectedPath = await window.electronAPI.chooseDirectory('选择 IDE 工作区', workspace.value?.rootPath)
  if (!selectedPath) {
    return
  }

  const nextWorkspace = await openWorkspace(selectedPath)
  if (!nextWorkspace) {
    showToast('error', '工作区打开失败，请确认目录可读')
    return
  }

  showToast('success', `已打开工作区：${nextWorkspace.name}`)
}

async function refreshWorkspaceState(options?: { silent?: boolean }) {
  if (!workspace.value) {
    return
  }

  refreshingWorkspace.value = true
  try {
    await refreshWorkspaceStructure(workspace.value)
    await loadWorkspaceScripts()
    await refreshSelectedPlanDrift({ silent: true })
    if (!options?.silent) {
      showToast('success', '工作区结构已刷新')
    }
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '刷新工作区失败')
  } finally {
    refreshingWorkspace.value = false
  }
}

async function loadWorkspaceScripts() {
  terminalScripts.value = []

  if (!workspace.value) {
    return
  }

  const exists = await workspaceFileExists(workspace.value, 'package.json')
  if (!exists) {
    return
  }

  const content = await readWorkspaceFile(workspace.value, 'package.json')
  if (!content) {
    return
  }

  try {
    const pkg = JSON.parse(content) as { packageManager?: string; scripts?: Record<string, string> }
    const packageManager = await resolveWorkspacePackageManager(pkg.packageManager)
    terminalScripts.value = Object.keys(pkg.scripts || {}).map(name => ({
      name,
      command: buildScriptCommand(packageManager, name),
    }))
  } catch {
    terminalScripts.value = []
  }
}

async function resolveWorkspacePackageManager(declaredPackageManager?: string): Promise<WorkspacePackageManager> {
  const normalized = typeof declaredPackageManager === 'string' ? declaredPackageManager.trim().toLowerCase() : ''
  if (normalized.startsWith('pnpm@')) return 'pnpm'
  if (normalized.startsWith('yarn@')) return 'yarn'
  if (normalized.startsWith('bun@')) return 'bun'
  if (normalized.startsWith('npm@')) return 'npm'

  if (!workspace.value) {
    return 'npm'
  }

  if (await workspaceFileExists(workspace.value, 'pnpm-lock.yaml')) return 'pnpm'
  if (await workspaceFileExists(workspace.value, 'yarn.lock')) return 'yarn'
  if (await workspaceFileExists(workspace.value, 'bun.lockb') || await workspaceFileExists(workspace.value, 'bun.lock')) return 'bun'

  return 'npm'
}

function buildScriptCommand(packageManager: WorkspacePackageManager, name: string) {
  if (packageManager === 'pnpm') {
    return `pnpm ${name}`
  }

  if (packageManager === 'yarn') {
    return `yarn ${name}`
  }

  if (packageManager === 'bun') {
    return `bun run ${name}`
  }

  return `npm run ${name}`
}

async function refreshSelectedPlanDrift(options?: { silent?: boolean }) {
  const currentWorkspace = workspace.value
  const currentPlan = selectedPlan.value
  const requestId = ++selectedPlanDriftRequestId

  if (!currentWorkspace || !currentPlan) {
    selectedPlanDrift.value = null
    return
  }

  try {
    const drift = await inspectPlanWorkspaceDrift(currentWorkspace, currentPlan.id)
    if (requestId !== selectedPlanDriftRequestId) {
      return
    }

    selectedPlanDrift.value = drift
  } catch (error) {
    if (requestId !== selectedPlanDriftRequestId) {
      return
    }

    selectedPlanDrift.value = null
    if (!options?.silent) {
      showToast('error', error instanceof Error ? error.message : '检查计划漂移失败')
    }
  }
}

function scheduleSelectedPlanDriftRefresh() {
  if (selectedPlanDriftTimer) {
    clearTimeout(selectedPlanDriftTimer)
  }

  selectedPlanDriftTimer = setTimeout(() => {
    selectedPlanDriftTimer = null
    void refreshSelectedPlanDrift({ silent: true })
  }, 120)
}

async function openFile(path: string) {
  if (!workspace.value) {
    return
  }

  const existingTab = editorTabs.value.find(tab => tab.path === path)
  if (existingTab) {
    activeFilePath.value = path
    return
  }

  const language = workspace.value.structure?.files.find(file => file.path === path)?.language
  const nextTab: EditorTabState = {
    path,
    content: '',
    savedContent: '',
    language,
    loading: true,
    error: '',
    selectionStart: 0,
    selectionEnd: 0,
  }

  editorTabs.value.push(nextTab)
  activeFilePath.value = path

  const content = await readWorkspaceFile(workspace.value, path)
  if (content === null) {
    nextTab.loading = false
    nextTab.error = '文件不可读，可能是二进制文件、过大文件或路径无效。'
    return
  }

  nextTab.content = content
  nextTab.savedContent = content
  nextTab.loading = false
}

function selectTab(path: string) {
  activeFilePath.value = path
}

function closeTab(path: string) {
  const tab = editorTabs.value.find(item => item.path === path)
  if (!tab) {
    return
  }

  if (tab.content !== tab.savedContent && !window.confirm(`文件 ${tab.path} 还有未保存修改，确认关闭？`)) {
    return
  }

  const currentIndex = editorTabs.value.findIndex(item => item.path === path)
  editorTabs.value = editorTabs.value.filter(item => item.path !== path)

  if (activeFilePath.value === path) {
    const fallback = editorTabs.value[currentIndex] || editorTabs.value[currentIndex - 1] || editorTabs.value[0] || null
    activeFilePath.value = fallback?.path || ''
  }
}

function updateActiveTabContent(content: string) {
  if (activeTab.value) {
    activeTab.value.content = content
    const normalizedSelection = normalizeEditorSelectionRange(
      content,
      activeTab.value.selectionStart,
      activeTab.value.selectionEnd,
    )
    activeTab.value.selectionStart = normalizedSelection.selectionStart
    activeTab.value.selectionEnd = normalizedSelection.selectionEnd
  }
}

function updateActiveTabSelection(payload: EditorSelectionPayload) {
  if (!activeTab.value) {
    return
  }

  const normalizedSelection = normalizeEditorSelectionRange(
    activeTab.value.content,
    payload.selectionStart,
    payload.selectionEnd,
  )
  activeTab.value.selectionStart = normalizedSelection.selectionStart
  activeTab.value.selectionEnd = normalizedSelection.selectionEnd
}

async function saveActiveTab() {
  if (!workspace.value || !activeTab.value || activeTab.value.loading || activeTab.value.error) {
    return
  }

  const saved = await writeWorkspaceFile(workspace.value, activeTab.value.path, activeTab.value.content)
  if (!saved) {
    showToast('error', `保存失败：${activeTab.value.path}`)
    return
  }

  activeTab.value.savedContent = activeTab.value.content
  await refreshSelectedPlanDrift({ silent: true })
  showToast('success', `已保存：${activeTab.value.path}`)
}

async function saveAllTabs() {
  if (!workspace.value) {
    return
  }

  const dirtyTabs = editorTabs.value.filter(tab => tab.content !== tab.savedContent && !tab.loading && !tab.error)
  if (dirtyTabs.length === 0) {
    return
  }

  for (const tab of dirtyTabs) {
    const saved = await writeWorkspaceFile(workspace.value, tab.path, tab.content)
    if (!saved) {
      showToast('error', `保存失败：${tab.path}`)
      return
    }
    tab.savedContent = tab.content
  }

  showToast('success', `已保存 ${dirtyTabs.length} 个文件`)
}

function normalizeWorkspaceRelativePath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

function isSameOrNestedPath(candidatePath: string, targetPath: string) {
  return candidatePath === targetPath || candidatePath.startsWith(`${targetPath}/`)
}

function normalizeTopLevelWorkspacePaths(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.map(normalizeWorkspaceRelativePath).filter(Boolean)))
    .sort((left, right) => left.length - right.length || left.localeCompare(right, 'zh-CN', { numeric: true }))

  return uniquePaths.filter(path => !uniquePaths.some(other => other !== path && path.startsWith(`${other}/`)))
}

function getPathBaseName(path: string) {
  const segments = normalizeWorkspaceRelativePath(path).split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function getPathParent(path: string) {
  const normalized = normalizeWorkspaceRelativePath(path)
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return ''
  }

  return segments.slice(0, -1).join('/')
}

function buildWorkspaceTargetPath(targetDirectory: string, sourcePath: string) {
  const baseName = getPathBaseName(sourcePath)
  return targetDirectory ? `${targetDirectory}/${baseName}` : baseName
}

function splitWorkspaceCopyName(baseName: string, entryType: 'file' | 'directory') {
  if (entryType === 'directory') {
    return { stem: baseName, extension: '' }
  }

  const lastDotIndex = baseName.lastIndexOf('.')
  if (lastDotIndex <= 0) {
    return { stem: baseName, extension: '' }
  }

  return {
    stem: baseName.slice(0, lastDotIndex),
    extension: baseName.slice(lastDotIndex),
  }
}

function buildWorkspaceCopyVariantName(baseName: string, entryType: 'file' | 'directory', copyIndex: number) {
  const { stem, extension } = splitWorkspaceCopyName(baseName, entryType)
  const suffix = copyIndex <= 1 ? ' copy' : ` copy ${copyIndex}`
  return `${stem}${suffix}${extension}`
}

function buildWorkspaceCopyTargetPath(
  sourcePath: string,
  entryType: 'file' | 'directory',
  targetDirectory: string,
  occupiedPaths: Set<string>,
  reservedPaths: Set<string>,
) {
  const baseName = getPathBaseName(sourcePath)
  const directTargetPath = buildWorkspaceTargetPath(targetDirectory, sourcePath)
  const isTaken = (candidatePath: string) => occupiedPaths.has(candidatePath) || reservedPaths.has(candidatePath)

  if (directTargetPath && directTargetPath !== sourcePath && !isTaken(directTargetPath)) {
    return directTargetPath
  }

  for (let copyIndex = 1; copyIndex < 1000; copyIndex += 1) {
    const candidateName = buildWorkspaceCopyVariantName(baseName, entryType, copyIndex)
    const candidatePath = targetDirectory ? `${targetDirectory}/${candidateName}` : candidateName
    if (candidatePath !== sourcePath && !isTaken(candidatePath)) {
      return candidatePath
    }
  }

  return ''
}

function sanitizeWorkspaceTempName(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'entry'
}

async function buildWorkspaceRenameTempPath(
  workspaceState: NonNullable<typeof workspace.value>,
  sourcePath: string,
  occupiedPaths: Set<string>,
  reservedPaths: Set<string>,
) {
  const parentPath = getPathParent(sourcePath)
  const sourceName = sanitizeWorkspaceTempName(getPathBaseName(sourcePath))
  const timestampToken = Date.now().toString(36)

  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const candidateName = `.__openagent_tmp__${sourceName}__${timestampToken}_${attempt}`
    const candidatePath = parentPath ? `${parentPath}/${candidateName}` : candidateName
    if (occupiedPaths.has(candidatePath) || reservedPaths.has(candidatePath)) {
      continue
    }

    if (await workspaceFileExists(workspaceState, candidatePath)) {
      continue
    }

    reservedPaths.add(candidatePath)
    return candidatePath
  }

  return ''
}

function getDirtyTabsForPaths(targetPaths: string[]) {
  return editorTabs.value.filter(tab => targetPaths.some(path => isSameOrNestedPath(tab.path, path)) && tab.content !== tab.savedContent)
}

function remapOpenTabsAfterRename(fromPath: string, toPath: string) {
  editorTabs.value = editorTabs.value.map(tab => {
    if (!isSameOrNestedPath(tab.path, fromPath)) {
      return tab
    }

    return {
      ...tab,
      path: tab.path.replace(fromPath, toPath),
    }
  })

  if (isSameOrNestedPath(activeFilePath.value, fromPath)) {
    activeFilePath.value = activeFilePath.value.replace(fromPath, toPath)
  }
}

function closeTabsForDeletedEntry(targetPath: string) {
  const affectedTabs = editorTabs.value.filter(tab => isSameOrNestedPath(tab.path, targetPath))
  if (affectedTabs.length === 0) {
    return { affectedTabs, hasDirtyTabs: false }
  }

  const hasDirtyTabs = affectedTabs.some(tab => tab.content !== tab.savedContent)
  const removedPaths = new Set(affectedTabs.map(tab => tab.path))
  const previousTabs = [...editorTabs.value]
  editorTabs.value = editorTabs.value.filter(tab => !removedPaths.has(tab.path))

  if (removedPaths.has(activeFilePath.value)) {
    const previousActiveIndex = previousTabs.findIndex(tab => tab.path === activeFilePath.value)
    const fallback = editorTabs.value[previousActiveIndex] || editorTabs.value[previousActiveIndex - 1] || editorTabs.value[0] || null
    activeFilePath.value = fallback?.path || ''
  }

  return { affectedTabs, hasDirtyTabs }
}

async function handleCreateFile(path: string) {
  if (!workspace.value) {
    return
  }

  const normalizedPath = normalizeWorkspaceRelativePath(path)
  if (!normalizedPath) {
    showToast('error', '文件路径无效')
    return
  }

  if (await workspaceFileExists(workspace.value, normalizedPath)) {
    showToast('warning', `文件已存在：${normalizedPath}`)
    return
  }

  const created = await createWorkspaceFile(workspace.value, normalizedPath)
  if (!created) {
    showToast('error', `创建文件失败：${normalizedPath}`)
    return
  }

  await refreshWorkspaceState({ silent: true })
  await openFile(normalizedPath)
  showToast('success', `已创建文件：${normalizedPath}`)
}

async function handleCreateDirectory(path: string) {
  if (!workspace.value) {
    return
  }

  const normalizedPath = normalizeWorkspaceRelativePath(path)
  if (!normalizedPath) {
    showToast('error', '目录路径无效')
    return
  }

  if (await workspaceFileExists(workspace.value, normalizedPath)) {
    showToast('warning', `目录已存在：${normalizedPath}`)
    return
  }

  const created = await createWorkspaceDirectory(workspace.value, normalizedPath)
  if (!created) {
    showToast('error', `创建目录失败：${normalizedPath}`)
    return
  }

  await refreshWorkspaceState({ silent: true })
  showToast('success', `已创建目录：${normalizedPath}`)
}

function handleCopyEntries(payload: ExplorerCopyEntriesPayload) {
  if (!workspace.value) {
    return
  }

  const entryTypeMap = new Map<string, 'file' | 'directory'>()
  for (const entry of payload.entries) {
    const normalizedPath = normalizeWorkspaceRelativePath(entry.path)
    if (!normalizedPath) {
      continue
    }
    entryTypeMap.set(normalizedPath, entry.entryType)
  }

  const sourcePaths = normalizeTopLevelWorkspacePaths(Array.from(entryTypeMap.keys()))
  if (sourcePaths.length === 0) {
    explorerClipboardEntries.value = []
    showToast('warning', '没有可复制的条目')
    return
  }

  explorerClipboardEntries.value = sourcePaths
    .map(path => {
      const entryType = entryTypeMap.get(path)
      if (!entryType) {
        return null
      }

      return {
        path,
        entryType,
      }
    })
    .filter((entry): entry is ExplorerEntryPayload => Boolean(entry))

  if (explorerClipboardEntries.value.length === 0) {
    showToast('warning', '没有可复制的条目')
    return
  }

  showToast(
    'success',
    explorerClipboardEntries.value.length === 1
      ? `已复制到剪贴板：${explorerClipboardEntries.value[0].path}`
      : `已复制 ${explorerClipboardEntries.value.length} 个条目到剪贴板`,
  )
}

async function handlePasteEntries(payload: ExplorerPasteEntriesPayload) {
  if (!workspace.value) {
    return
  }

  if (explorerClipboardEntries.value.length === 0) {
    showToast('warning', '剪贴板当前为空，请先在资源管理器中复制条目')
    return
  }

  const targetDirectory = normalizeWorkspaceRelativePath(payload.targetDirectory)
  const workspaceEntries = workspace.value.structure?.files ?? []
  const workspaceEntryMap = new Map(
    workspaceEntries.map(entry => [normalizeWorkspaceRelativePath(entry.path), entry.type] as const),
  )
  if (targetDirectory && workspaceEntryMap.get(targetDirectory) !== 'directory') {
    showToast('error', `目标目录不可用：${targetDirectory}`)
    return
  }

  const occupiedPaths = new Set(workspaceEntries.map(entry => normalizeWorkspaceRelativePath(entry.path)))
  const reservedPaths = new Set<string>()
  const pendingCopies: Array<{ from: string; to: string; entryType: 'file' | 'directory' }> = []
  const skippedSources = new Set<string>()

  for (const entry of explorerClipboardEntries.value) {
    const sourcePath = normalizeWorkspaceRelativePath(entry.path)
    if (!sourcePath) {
      continue
    }

    if (entry.entryType === 'directory' && targetDirectory && isSameOrNestedPath(targetDirectory, sourcePath)) {
      skippedSources.add(sourcePath)
      continue
    }

    const nextPath = buildWorkspaceCopyTargetPath(
      sourcePath,
      entry.entryType,
      targetDirectory,
      occupiedPaths,
      reservedPaths,
    )
    if (!nextPath) {
      skippedSources.add(sourcePath)
      continue
    }

    reservedPaths.add(nextPath)
    pendingCopies.push({
      from: sourcePath,
      to: nextPath,
      entryType: entry.entryType,
    })
  }

  if (pendingCopies.length === 0) {
    showToast(
      'warning',
      skippedSources.size > 0 ? '剪贴板中的条目无法粘贴到当前目录' : '没有可粘贴的条目',
    )
    return
  }

  const successfulCopies: Array<{ path: string; entryType: 'file' | 'directory' }> = []
  const failedSources: string[] = []

  for (const pendingCopy of pendingCopies) {
    const copied = await copyWorkspaceEntry(workspace.value, pendingCopy.from, pendingCopy.to)
    if (!copied) {
      failedSources.push(pendingCopy.from)
      continue
    }

    occupiedPaths.add(pendingCopy.to)
    successfulCopies.push({
      path: pendingCopy.to,
      entryType: pendingCopy.entryType,
    })
  }

  if (successfulCopies.length > 0) {
    await refreshWorkspaceState({ silent: true })
    if (successfulCopies.length === 1 && successfulCopies[0].entryType === 'file') {
      await openFile(successfulCopies[0].path)
    }
  }

  if (failedSources.length === 0 && skippedSources.size === 0) {
    showToast(
      'success',
      successfulCopies.length === 1
        ? `已粘贴：${successfulCopies[0].path}`
        : `已粘贴 ${successfulCopies.length} 个条目`,
    )
    return
  }

  if (successfulCopies.length === 0) {
    showToast(
      'error',
      failedSources.length > 0
        ? `粘贴失败：${failedSources[0]}`
        : '剪贴板中的条目无法粘贴到当前目录',
    )
    return
  }

  const summaryParts = [`已粘贴 ${successfulCopies.length} 个条目`]
  if (skippedSources.size > 0) {
    summaryParts.push(`跳过 ${skippedSources.size} 个`)
  }
  if (failedSources.length > 0) {
    summaryParts.push(`失败 ${failedSources.length} 个`)
  }
  showToast('warning', summaryParts.join('，'))
}

async function handleRenameEntry(payload: { from: string; to: string; entryType: 'file' | 'directory' }) {
  await handleRenameEntries({ entries: [payload] })
}

async function handleRenameEntries(payload: ExplorerRenameEntriesPayload) {
  if (!workspace.value) {
    return
  }

  const normalizedEntries = payload.entries
    .map(entry => ({
      from: normalizeWorkspaceRelativePath(entry.from),
      to: normalizeWorkspaceRelativePath(entry.to),
      entryType: entry.entryType,
    }))
    .filter(entry => entry.from && entry.to && entry.from !== entry.to)

  if (normalizedEntries.length === 0) {
    return
  }

  const seenSourcePaths = new Set<string>()
  const renameEntries = normalizedEntries.filter(entry => {
    if (seenSourcePaths.has(entry.from)) {
      return false
    }

    seenSourcePaths.add(entry.from)
    return true
  })
  if (renameEntries.length === 0) {
    return
  }

  const targetPathCounts = new Map<string, number>()
  for (const entry of renameEntries) {
    targetPathCounts.set(entry.to, (targetPathCounts.get(entry.to) || 0) + 1)
  }
  const duplicatedTargetPath = Array.from(targetPathCounts.entries()).find(([, count]) => count > 1)?.[0]
  if (duplicatedTargetPath) {
    showToast('error', `批量重命名存在冲突目标：${duplicatedTargetPath}`)
    return
  }

  const movingFromPaths = new Set(renameEntries.map(entry => entry.from))
  for (const entry of renameEntries) {
    const targetExists = await workspaceFileExists(workspace.value, entry.to)
    if (targetExists && !movingFromPaths.has(entry.to)) {
      showToast('warning', `${entry.entryType === 'directory' ? '目录' : '文件'}已存在：${entry.to}`)
      return
    }
  }

  const occupiedPaths = new Set(
    (workspace.value.structure?.files ?? []).map(entry => normalizeWorkspaceRelativePath(entry.path)),
  )
  const reservedTempPaths = new Set<string>()
  const stagedEntries: Array<{ from: string; to: string; temp: string; entryType: 'file' | 'directory' }> = []

  for (const entry of renameEntries) {
    const tempPath = await buildWorkspaceRenameTempPath(workspace.value, entry.from, occupiedPaths, reservedTempPaths)
    if (!tempPath) {
      showToast('error', `无法为 ${entry.from} 分配临时重命名路径`)
      return
    }

    stagedEntries.push({
      ...entry,
      temp: tempPath,
    })
  }

  const stagedTempPaths: Array<{ from: string; temp: string }> = []
  for (const entry of stagedEntries) {
    const staged = await renameWorkspaceEntry(workspace.value, entry.from, entry.temp)
    if (!staged) {
      for (const rollbackEntry of [...stagedTempPaths].reverse()) {
        await renameWorkspaceEntry(workspace.value, rollbackEntry.temp, rollbackEntry.from)
      }

      showToast('error', `重命名预处理失败：${entry.from}`)
      return
    }

    stagedTempPaths.push({
      from: entry.from,
      temp: entry.temp,
    })
  }

  const completedEntries: Array<{ from: string; to: string; temp: string }> = []
  for (const entry of stagedEntries) {
    const finalized = await renameWorkspaceEntry(workspace.value, entry.temp, entry.to)
    if (!finalized) {
      for (const rollbackEntry of [...completedEntries].reverse()) {
        await renameWorkspaceEntry(workspace.value, rollbackEntry.to, rollbackEntry.from)
      }
      for (const rollbackEntry of [...stagedEntries].reverse()) {
        if (completedEntries.some(item => item.temp === rollbackEntry.temp)) {
          continue
        }
        await renameWorkspaceEntry(workspace.value, rollbackEntry.temp, rollbackEntry.from)
      }

      showToast('error', `重命名提交失败：${entry.from}`)
      return
    }

    completedEntries.push({
      from: entry.from,
      to: entry.to,
      temp: entry.temp,
    })
  }

  for (const entry of stagedEntries) {
    remapOpenTabsAfterRename(entry.from, entry.to)
  }

  await refreshWorkspaceState({ silent: true })
  showToast(
    'success',
    stagedEntries.length === 1
      ? `已重命名为：${stagedEntries[0].to}`
      : `已批量重命名 ${stagedEntries.length} 个条目`,
  )
}

async function handleDeleteEntry(payload: { path: string; entryType: 'file' | 'directory' }) {
  await handleDeleteEntries({ entries: [payload] })
}

async function handleDeleteEntries(payload: ExplorerDeleteEntriesPayload) {
  if (!workspace.value) {
    return
  }

  const entryTypeMap = new Map<string, 'file' | 'directory'>()
  for (const entry of payload.entries) {
    const normalizedPath = normalizeWorkspaceRelativePath(entry.path)
    if (!normalizedPath) {
      continue
    }
    entryTypeMap.set(normalizedPath, entry.entryType)
  }

  const targetPaths = normalizeTopLevelWorkspacePaths(Array.from(entryTypeMap.keys()))
  if (targetPaths.length === 0) {
    return
  }

  const affectedDirtyTabs = getDirtyTabsForPaths(targetPaths)
  if (
    affectedDirtyTabs.length > 0
    && !window.confirm(`即将删除的条目中包含 ${affectedDirtyTabs.length} 个未保存文件，确认继续删除？`)
  ) {
    return
  }

  let successCount = 0
  const failedPaths: string[] = []

  for (const targetPath of targetPaths) {
    const deleted = await deleteWorkspaceEntry(workspace.value, targetPath)
    if (!deleted) {
      failedPaths.push(targetPath)
      continue
    }

    closeTabsForDeletedEntry(targetPath)
    successCount += 1
  }

  if (successCount > 0) {
    await refreshWorkspaceState({ silent: true })
  }

  if (failedPaths.length === 0) {
    const entryType = targetPaths.length === 1 ? entryTypeMap.get(targetPaths[0]) : null
    if (targetPaths.length === 1 && entryType) {
      showToast('success', `${entryType === 'directory' ? '目录' : '文件'}已删除：${targetPaths[0]}`)
      return
    }

    showToast('success', `已删除 ${successCount} 个条目`)
    return
  }

  if (successCount === 0) {
    showToast('error', `删除失败：${failedPaths[0]}`)
    return
  }

  showToast('warning', `已删除 ${successCount} 个条目，另有 ${failedPaths.length} 个删除失败`)
}

async function handleMoveEntries(payload: ExplorerMoveEntriesPayload) {
  if (!workspace.value) {
    return
  }

  const targetDirectory = normalizeWorkspaceRelativePath(payload.targetDirectory)
  const sourcePaths = normalizeTopLevelWorkspacePaths(payload.sources)
  if (sourcePaths.length === 0) {
    return
  }

  const pendingMoves: Array<{ from: string; to: string }> = []
  const skippedSources = new Set<string>()
  const seenTargetPaths = new Set<string>()

  for (const sourcePath of sourcePaths) {
    if (targetDirectory && isSameOrNestedPath(targetDirectory, sourcePath)) {
      skippedSources.add(sourcePath)
      continue
    }

    const nextPath = buildWorkspaceTargetPath(targetDirectory, sourcePath)
    if (!nextPath || nextPath === sourcePath || seenTargetPaths.has(nextPath)) {
      skippedSources.add(sourcePath)
      continue
    }

    if (await workspaceFileExists(workspace.value, nextPath)) {
      skippedSources.add(sourcePath)
      continue
    }

    seenTargetPaths.add(nextPath)
    pendingMoves.push({ from: sourcePath, to: nextPath })
  }

  if (pendingMoves.length === 0) {
    showToast('warning', skippedSources.size > 0 ? '选中条目无法移动到目标目录' : '没有可移动的条目')
    return
  }

  let successCount = 0
  const failedMoves: string[] = []

  // 这里先逐条执行 rename，再统一刷新结构，避免批量移动时把已打开标签路径映射丢到半成品状态。
  for (const move of pendingMoves) {
    const moved = await renameWorkspaceEntry(workspace.value, move.from, move.to)
    if (!moved) {
      failedMoves.push(move.from)
      continue
    }

    remapOpenTabsAfterRename(move.from, move.to)
    successCount += 1
  }

  if (successCount > 0) {
    await refreshWorkspaceState({ silent: true })
  }

  if (failedMoves.length === 0 && skippedSources.size === 0) {
    showToast('success', `已移动 ${successCount} 个条目`)
    return
  }

  if (successCount === 0) {
    showToast('error', failedMoves.length > 0 ? `移动失败：${failedMoves[0]}` : '选中条目无法移动到目标目录')
    return
  }

  const detailParts = [`已移动 ${successCount} 个条目`]
  if (skippedSources.size > 0) {
    detailParts.push(`跳过 ${skippedSources.size} 个`)
  }
  if (failedMoves.length > 0) {
    detailParts.push(`失败 ${failedMoves.length} 个`)
  }
  showToast('warning', detailParts.join('，'))
}

async function createGeneratedPlanDraft(payload: { goal: string; overview: string; techStack: string[] }) {
  if (!workspace.value) {
    return
  }

  const plan = aiStore.createProjectPlan(workspace.value.id, payload.goal, payload.overview, payload.techStack)
  let currentPlan = plan
  let generationError = ''

  try {
    const phases = await generateInitialPlanPhases(workspace.value, payload)
    currentPlan = aiStore.setProjectPlanPhases(plan.id, phases) ?? plan
  } catch (error) {
    generationError = error instanceof Error ? error.message : '计划自动生成失败'
    aiStore.addDevLog(plan.id, {
      type: 'error',
      title: '计划自动生成失败',
      content: generationError,
      metadata: { workspaceId: workspace.value.id },
    })
  }

  const phaseCount = currentPlan.phases.length
  const taskCount = currentPlan.phases.reduce((sum, phase) => sum + phase.tasks.length, 0)

  aiStore.addDevLog(plan.id, {
    type: 'plan',
    title: generationError ? '创建 IDE 计划草稿' : '创建 IDE 项目计划',
    content: generationError
      ? `在工作区 ${workspace.value.name} 中创建计划草稿：${payload.goal}。自动生成任务失败，已回退为草稿。`
      : `在工作区 ${workspace.value.name} 中创建项目计划：${payload.goal}。已生成 ${phaseCount} 个阶段 / ${taskCount} 个任务。`,
    metadata: {
      workspaceId: workspace.value.id,
      phaseCount,
      taskCount,
    },
  })

  await recordPlanWorkspaceSnapshot(workspace.value, currentPlan.id, {
    reason: 'initial-plan',
    content: `为项目计划「${currentPlan.goal}」记录工作区基线，供后续基于 diff、失败反馈与上下文信号动态重规划。`,
  })
  await flushPlanToWorkspace(workspace.value, currentPlan)
  selectedPlanId.value = currentPlan.id
  showToast(
    'success',
    generationError
      ? '项目计划草稿已创建，自动任务生成已回退'
      : `项目计划已创建：${phaseCount} 个阶段 / ${taskCount} 个任务`,
  )
}

async function createPlanDraft(payload: { goal: string; overview: string; techStack: string[] }) {
  if (!workspace.value) {
    return
  }

  const plan = aiStore.createProjectPlan(workspace.value.id, payload.goal, payload.overview, payload.techStack)
  aiStore.addDevLog(plan.id, {
    type: 'plan',
    title: '创建 IDE 计划草案',
    content: `在工作区 ${workspace.value.name} 中创建计划草案：${payload.goal}`,
    metadata: { workspaceId: workspace.value.id },
  })

  await recordPlanWorkspaceSnapshot(workspace.value, plan.id, {
    reason: 'draft-plan',
    content: `为计划草案「${plan.goal}」记录当前工作区基线，避免后续真实代码差异无法被识别。`,
  })
  await flushPlanToWorkspace(workspace.value, plan)
  selectedPlanId.value = plan.id
  showToast('success', '项目计划草案已创建')
}

function formatPlanStatusLabel(status: PlanStatus) {
  const map: Record<PlanStatus, string> = {
    drafting: '草稿中',
    approved: '已确认',
    'in-progress': '进行中',
    completed: '已完成',
    paused: '已暂停',
  }

  return map[status] || status
}

async function handleUpdatePlanStatus(payload: { planId: string; status: PlanStatus }) {
  if (!workspace.value) {
    return
  }

  const targetPlan = workspacePlans.value.find(plan => plan.id === payload.planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可更新状态的项目计划')
    return
  }

  if (payload.status === 'completed' && targetPlan.progress < 100) {
    const shouldContinue = window.confirm(`当前计划进度只有 ${targetPlan.progress}%，仍要手动标记为已完成吗？`)
    if (!shouldContinue) {
      return
    }
  }

  updatingPlanStatus.value = true
  try {
    aiStore.updateProjectPlanStatus(targetPlan.id, payload.status)
    aiStore.addDevLog(targetPlan.id, {
      type: 'decision',
      title: `计划状态切换为${formatPlanStatusLabel(payload.status)}`,
      content: [
        `计划「${targetPlan.goal}」的执行状态已切换为 ${formatPlanStatusLabel(payload.status)}。`,
        payload.status === 'approved' ? '当前阶段进入用户确认后的可执行状态，主代理可开始整理执行队列与子代理分工。' : '',
        payload.status === 'in-progress' ? '主代理现在应按 `.openagent/TASKS.md` 和 `.openagent/SUBAGENTS.md` 持续推进任务，并在必要时并行派发子代理。' : '',
        payload.status === 'paused' ? '执行已暂停，后续恢复前应先确认当前阻塞、上下文变化和待处理风险。' : '',
        payload.status === 'completed' ? '计划已进入完成态，建议同步最终报告、验证结论与交付说明。' : '',
      ].filter(Boolean).join(''),
      metadata: {
        workspaceId: workspace.value.id,
        status: payload.status,
      },
    })

    const updatedPlan = aiStore.getProjectPlan(targetPlan.id)
    if (updatedPlan) {
      await flushPlanToWorkspace(workspace.value, updatedPlan)
    }
    await refreshSelectedPlanDrift({ silent: true })
    showToast('success', `计划状态已更新为${formatPlanStatusLabel(payload.status)}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '更新计划状态失败')
  } finally {
    updatingPlanStatus.value = false
  }
}

async function handleSyncPlanBaseline(planId: string) {
  if (!workspace.value) {
    return
  }

  const targetPlan = workspacePlans.value.find(plan => plan.id === planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可同步基线的项目计划')
    return
  }

  syncingPlanBaseline.value = true
  try {
    const drift = await syncPlanWorkspaceBaseline(workspace.value, targetPlan.id, {
      reason: 'manual-baseline-sync',
      content: `已为计划“${targetPlan.goal}”同步最新工作区基线，后续漂移判断将以本次状态为准。`,
    })

    if (!drift) {
      showToast('error', '同步计划基线失败，请稍后重试')
      return
    }

    selectedPlanDrift.value = drift
    showToast('success', `已同步计划基线：${targetPlan.goal}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '同步计划基线失败')
  } finally {
    syncingPlanBaseline.value = false
  }
}

async function handleReplanPlan(planId: string) {
  if (!workspace.value) {
    return
  }

  const targetPlan = workspacePlans.value.find(plan => plan.id === planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可重规划的项目计划')
    return
  }

  replanningPlan.value = true
  try {
    const contextSummary = [
      activeFilePath.value ? `当前聚焦文件：${activeFilePath.value}` : '',
      dirtyFileCount.value > 0 ? `当前仍有 ${dirtyFileCount.value} 个未保存文件` : '',
      targetPlan.overview,
    ].filter(Boolean).join('；')

    const result = await replanProjectPlan(workspace.value, targetPlan.id, {
      reason: 'manual-ide-panel',
      contextSummary,
    })

    if (!result) {
      showToast('error', '动态重规划失败，请稍后重试')
      return
    }

    selectedPlanId.value = result.plan.id
    await refreshSelectedPlanDrift({ silent: true })
    const changedCount = result.diff.added.length + result.diff.modified.length + result.diff.removed.length
    showToast(
      'success',
      changedCount > 0
        ? `动态重规划已完成，已吸收 ${changedCount} 处真实代码差异`
        : '动态重规划已完成，计划已按当前上下文重新校准',
    )
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '动态重规划失败')
  } finally {
    replanningPlan.value = false
  }
}
</script>

<style lang="scss" scoped>
.ide-view {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.ide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-lg;
  padding: $spacing-lg;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;

  p {
    color: var(--text-secondary);
    line-height: 1.7;
    max-width: 760px;
  }
}

.header-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode-pill {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: $font-sm;
  font-weight: 700;
  cursor: pointer;

  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    border-color: transparent;
    color: var(--text-inverse);
  }

  &.ghost:hover {
    background: var(--primary-bg);
    color: var(--primary);
  }
}

.ide-onboarding {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-lg;
  padding: $spacing-xl;
}

.onboarding-copy {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  p {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.ide-shell {
  display: grid;
  grid-template-columns: 64px minmax(240px, 300px) minmax(0, 1fr) minmax(280px, 340px);
  gap: $spacing-md;
  flex: 1;
  min-height: 0;
}

.ide-center,
.ide-sidebar {
  display: grid;
  min-height: 0;
  gap: $spacing-md;
}

.ide-center {
  grid-template-rows: minmax(0, 1fr) auto;
}

.ide-sidebar {
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
}

@media (max-width: 1440px) {
  .ide-shell {
    grid-template-columns: 64px minmax(220px, 260px) minmax(0, 1fr);
  }

  .ide-sidebar {
    grid-column: 2 / span 2;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: none;
  }
}

@media (max-width: 1100px) {
  .ide-header,
  .ide-onboarding {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .ide-shell {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .ide-sidebar {
    grid-column: 1 / -1;
    grid-template-columns: 1fr;
  }
}
</style>
