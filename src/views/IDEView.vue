<template>
  <div class="ide-view">
    <section class="ide-header glass-panel">
      <div class="header-copy">
        <p class="header-eyebrow">IDE Workbench</p>
        <h1>{{ workspace?.name || 'OpenAgent IDE' }}</h1>
        <p class="header-path" :title="workspace?.rootPath || ''">
          {{ workspace ? `项目目录 ${workspaceRootLabel}` : '先选择一个基础项目目录，再开始编辑、终端调试和 Agent 协作。' }}
        </p>
      </div>

      <div class="header-actions">
        <button class="mode-pill ghost" @click="openAgentView">Agent</button>
        <button class="mode-pill active">IDE</button>
        <select
          v-if="workspaceList.length > 0"
          class="workspace-select"
          :value="workspace?.id || ''"
          @change="handleWorkspaceSwitch(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in workspaceList" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <button class="btn btn-ghost btn-sm" :disabled="dirtyFileCount === 0" @click="saveAllTabs">保存全部</button>
        <button class="btn btn-secondary btn-sm" @click="openWorkspacePicker">{{ workspace ? '新建工作区' : '打开工作区' }}</button>
        <button class="btn btn-ghost btn-sm" :disabled="!workspace || refreshingWorkspace" @click="refreshWorkspaceState()">刷新结构</button>
      </div>
    </section>

    <section v-if="!workspace" class="ide-onboarding glass-panel">
      <div class="onboarding-copy">
        <strong>当前还没有绑定工作区</strong>
        <p>先选择一个项目目录，再选择该工作区的基础产物目录。绑定后，IDE 模式会扫描项目结构、打开文件、同步计划和开发日志，并把产物优先写入独立目录。</p>
      </div>
      <button class="btn btn-primary" @click="openWorkspacePicker">选择项目目录</button>
    </section>

    <section v-if="!workspace" class="ide-empty-shell" aria-label="IDE 空工作台预览">
      <IDEActivityBar
        :workspace-ready="true"
        :dirty-count="0"
        :show-left-pane="true"
        :show-bottom-pane="true"
        :show-right-pane="true"
        @open-workspace="openWorkspacePicker"
        @refresh-workspace="refreshWorkspaceState"
        @save-all="saveAllTabs"
        @toggle-left-pane="void 0"
        @toggle-bottom-pane="void 0"
        @toggle-right-pane="void 0"
        @open-agent="openAgentView"
      />

      <div class="ide-empty-left">
        <section class="placeholder-panel glass-panel">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Explorer</p>
              <strong>文件资源管理器</strong>
            </div>
            <button class="placeholder-action" type="button" @click="openWorkspacePicker">绑定项目</button>
          </div>
          <div class="placeholder-panel-body">
            <div class="placeholder-tree">
              <span class="placeholder-line is-strong">src</span>
              <span class="placeholder-line">components</span>
              <span class="placeholder-line">views</span>
              <span class="placeholder-line">utils</span>
            </div>
            <ul class="placeholder-list">
              <li>自动扫描项目目录与脚本入口</li>
              <li>支持新建、拖拽、批量重命名与计划联动</li>
              <li>绑定后会恢复编辑标签、终端与任务上下文</li>
            </ul>
          </div>
        </section>

        <section class="placeholder-panel glass-panel">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Resources</p>
              <strong>MCP / Skills</strong>
            </div>
            <span class="placeholder-tag">待连接</span>
          </div>
          <div class="placeholder-panel-body is-compact">
            <p>这里会显示当前工作区可见的 MCP 服务、托管 Skill、异常摘要与最近刷新状态。</p>
            <div class="placeholder-tag-row">
              <span class="placeholder-tag">MCP Servers</span>
              <span class="placeholder-tag">Skills</span>
              <span class="placeholder-tag">Runtime</span>
            </div>
          </div>
        </section>
      </div>

      <div class="ide-empty-center">
        <section class="placeholder-panel glass-panel is-editor">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Editor</p>
              <strong>文件内容区</strong>
            </div>
            <div class="placeholder-tab-row">
              <span class="placeholder-mini-tab is-active">README.md</span>
              <span class="placeholder-mini-tab">PLAN.md</span>
              <span class="placeholder-mini-tab">index.ts</span>
            </div>
          </div>
          <div class="placeholder-editor-body">
            <span class="placeholder-code-line is-wide"></span>
            <span class="placeholder-code-line"></span>
            <span class="placeholder-code-line is-short"></span>
            <span class="placeholder-code-line is-wide"></span>
            <span class="placeholder-code-line"></span>
          </div>
        </section>

        <section class="placeholder-panel glass-panel is-terminal">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Runtime</p>
              <strong>终端与命令反馈</strong>
            </div>
            <span class="placeholder-tag">PTY</span>
          </div>
          <div class="placeholder-terminal-row">
            <code>npm run dev</code>
            <code>pnpm build</code>
            <code>git status</code>
          </div>
          <p class="placeholder-copy">绑定工作区后会创建真实终端标签、持续回传输出、自动收口超时或交互提示，并把结果同步给 IDE Agent。</p>
        </section>
      </div>

      <aside class="ide-empty-right">
        <section v-if="recentWorkspaces.length > 0" class="placeholder-panel glass-panel">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Recent</p>
              <strong>最近工作区</strong>
            </div>
            <span class="placeholder-tag">{{ recentWorkspaces.length }} 个</span>
          </div>
          <div class="recent-workspace-list">
            <button
              v-for="item in recentWorkspaces"
              :key="item.id"
              type="button"
              class="recent-workspace-card"
              @click="handleWorkspaceSwitch(item.id)"
            >
              <strong>{{ item.name }}</strong>
              <span class="recent-workspace-meta">
                {{ formatWorkbenchTimestamp(item.lastOpenedAt || item.updatedAt || item.createdAt) }}
              </span>
              <span class="recent-workspace-path">
                项目 {{ compactWorkbenchPath(item.rootPath, 2) }}
              </span>
              <span class="recent-workspace-path is-artifact">
                产物 {{ compactWorkbenchPath(item.artifactRootPath, 2) || '未设置' }}
              </span>
            </button>
          </div>
        </section>

        <section v-else class="placeholder-panel glass-panel">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Recent</p>
              <strong>Quick Start</strong>
            </div>
            <span class="placeholder-tag">Empty</span>
          </div>
          <div class="placeholder-panel-body is-compact">
            <p>当前还没有最近工作区记录。先绑定一个项目目录和产物目录，后续 IDE 会自动记住最近现场、编辑标签与计划状态。</p>
            <div class="placeholder-tag-row">
              <span class="placeholder-tag">Workspace Restore</span>
              <span class="placeholder-tag">Editor Session</span>
              <span class="placeholder-tag">Plan Sync</span>
            </div>
            <button class="placeholder-action" type="button" @click="openWorkspacePicker">Create Workspace</button>
          </div>
        </section>

        <section class="placeholder-panel glass-panel">
          <div class="placeholder-panel-head">
            <div>
              <p class="header-eyebrow">Inspector</p>
              <strong>IDE Agent / 计划 / 日志</strong>
            </div>
            <span class="placeholder-tag">Ready</span>
          </div>
          <div class="placeholder-card-grid">
            <article class="placeholder-card">
              <strong>IDE Agent</strong>
              <p>负责读代码、提炼上下文、调用工具与持续推进任务。</p>
            </article>
            <article class="placeholder-card">
              <strong>计划面板</strong>
              <p>基于目录结构、脚本与框架自动生成阶段、任务和执行文档。</p>
            </article>
            <article class="placeholder-card">
              <strong>开发日志</strong>
              <p>持续记录关键改动、验证结果和上下文接力信息。</p>
            </article>
          </div>
        </section>
      </aside>
    </section>

    <template v-else>
      <section class="workbench-toolbar glass-panel">
        <div class="workbench-toolbar-copy">
          <span class="toolbar-pill is-mode">Workbench</span>
          <span class="toolbar-pill is-path" :title="workspace.rootPath">{{ workspaceRootLabel }}</span>
          <span class="toolbar-pill" :title="workspace.artifactRootPath">产物 {{ artifactRootLabel }}</span>
          <span class="toolbar-pill">{{ workspace.language || '未识别语言' }}</span>
          <span class="toolbar-pill">{{ workspace.framework || '未识别框架' }}</span>
          <span class="toolbar-pill" :title="activeFilePath || ''">{{ activeFileLabel }}</span>
          <span class="toolbar-pill">标签 {{ editorTabs.length }}</span>
          <span class="toolbar-pill">未保存 {{ dirtyFileCount }}</span>
        </div>
        <div class="workbench-toolbar-actions">
          <button class="toolbar-toggle" :class="{ active: !ideWorkbenchLayout.leftCollapsed }" @click="toggleIdePane('left')">资源</button>
          <button class="toolbar-toggle" :class="{ active: !ideWorkbenchLayout.mcpCollapsed && !ideWorkbenchLayout.leftCollapsed }" @click="toggleIdePane('mcp')">MCP</button>
          <button class="toolbar-toggle" :class="{ active: !ideWorkbenchLayout.bottomCollapsed }" @click="toggleIdePane('bottom')">终端</button>
          <button class="toolbar-toggle" :class="{ active: !ideWorkbenchLayout.rightCollapsed }" @click="toggleIdePane('right')">Inspector</button>
          <button class="toolbar-toggle" :class="{ active: isIdeFocusMode }" @click="toggleIdeFocusMode">{{ isIdeFocusMode ? '退出聚焦' : '聚焦编辑区' }}</button>
          <button class="toolbar-toggle" @click="resetIdeWorkbenchLayout">重置布局</button>
        </div>
      </section>

      <div class="ide-shell" :class="ideShellClasses" :style="ideWorkbenchStyle">
        <IDEActivityBar
          :workspace-ready="Boolean(workspace)"
          :dirty-count="dirtyFileCount"
          :show-left-pane="!ideWorkbenchLayout.leftCollapsed"
          :show-bottom-pane="!ideWorkbenchLayout.bottomCollapsed"
          :show-right-pane="!ideWorkbenchLayout.rightCollapsed"
          @open-workspace="openWorkspacePicker"
          @refresh-workspace="refreshWorkspaceState"
          @save-all="saveAllTabs"
          @toggle-left-pane="toggleIdePane('left')"
          @toggle-bottom-pane="toggleIdePane('bottom')"
          @toggle-right-pane="toggleIdePane('right')"
          @open-agent="openAgentView"
        />

        <div class="ide-left-column" :class="{ 'is-collapsed': ideWorkbenchLayout.leftCollapsed, 'is-mcp-collapsed': ideWorkbenchLayout.mcpCollapsed }">
          <IDEExplorer
            class="ide-explorer-panel"
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

          <button class="ide-splitter ide-splitter--horizontal is-inline-left" type="button" aria-label="调整 MCP 面板高度" @pointerdown="startIdeResize('mcp', $event)" @dblclick="resetIdePaneSize('mcp')" />

          <IDEMcpPanel class="ide-mcp-panel-slot" />
        </div>

        <button class="ide-splitter ide-splitter--vertical is-left" type="button" aria-label="调整资源管理器宽度" @pointerdown="startIdeResize('left', $event)" @dblclick="resetIdePaneSize('left')" />

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

          <button class="ide-splitter ide-splitter--horizontal" type="button" aria-label="调整终端高度" @pointerdown="startIdeResize('bottom', $event)" @dblclick="resetIdePaneSize('bottom')" />

          <div class="ide-terminal-slot">
            <IDETerminal
              :workspace-path="workspace.rootPath"
              :active-file-path="activeFilePath"
              :dirty-count="dirtyFileCount"
              :scripts="terminalScripts"
            />
          </div>
        </div>

        <button class="ide-splitter ide-splitter--vertical is-right" type="button" aria-label="调整右侧面板宽度" @pointerdown="startIdeResize('right', $event)" @dblclick="resetIdePaneSize('right')" />

        <div class="ide-sidebar">
          <div class="inspector-toolbar glass-panel">
            <div class="inspector-copy">
              <p class="header-eyebrow">Inspector</p>
              <strong>{{ ideInspectorTitle }}</strong>
            </div>
            <div class="inspector-tabs">
              <button class="inspector-tab" :class="{ active: ideInspectorTab === 'assistant' }" @click="ideInspectorTab = 'assistant'">Agent</button>
              <button class="inspector-tab" :class="{ active: ideInspectorTab === 'plan' }" @click="ideInspectorTab = 'plan'">计划</button>
              <button class="inspector-tab" :class="{ active: ideInspectorTab === 'log' }" @click="ideInspectorTab = 'log'">日志</button>
            </div>
          </div>

          <IDEAssistantPanel v-if="ideInspectorTab === 'assistant'" class="ide-assistant-panel-slot" />

          <IDEPlanPanel
            v-else-if="ideInspectorTab === 'plan'"
            class="ide-plan-panel-slot"
            :plans="workspacePlans"
            :selected-plan-id="selectedPlanId"
            :replanning="replanningPlan"
            :syncing-baseline="syncingPlanBaseline"
            :syncing-autonomy="syncingAutonomyRun"
            :updating-plan-status="updatingPlanStatus"
            :selected-plan-drift="selectedPlanDrift"
            :execution-packet="selectedPlanExecutionPacket"
            :autonomy-run="selectedAutonomyRun"
            @select-plan="selectedPlanId = $event"
            @create-plan="createGeneratedPlanDraft"
            @update-plan-status="handleUpdatePlanStatus"
            @replan-plan="handleReplanPlan"
            @sync-plan-baseline="handleSyncPlanBaseline"
            @sync-autonomy-run="handleSyncAutonomyRun"
            @resume-autonomy-run="handleResumeAutonomyRun"
            @pause-autonomy-run="handlePauseAutonomyRun"
          />

          <IDEDevLog v-else class="ide-devlog-panel-slot" :plan="selectedPlan" />
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
import IDEAssistantPanel from '@/components/ide/IDEAssistantPanel.vue'
import IDEDevLog from '@/components/ide/IDEDevLog.vue'
import IDEEditor from '@/components/ide/IDEEditor.vue'
import IDEExplorer from '@/components/ide/IDEExplorer.vue'
import IDEMcpPanel from '@/components/ide/IDEMcpPanel.vue'
import IDEPlanPanel from '@/components/ide/IDEPlanPanel.vue'
import IDEStatusBar from '@/components/ide/IDEStatusBar.vue'
import IDETerminal from '@/components/ide/IDETerminal.vue'
import { useAIStore } from '@/stores/ai'
import type { AutonomyRun, IDEEditorSession, PlanStatus, ProjectPlanDriftSummary, ProjectPlanExecutionPacket } from '@/types'
import { copyWorkspaceEntry, createWorkspaceDirectory, createWorkspaceFile, deleteWorkspaceEntry, renameWorkspaceEntry, workspaceFileExists, openWorkspace, readWorkspaceFile, refreshWorkspaceStructure, writeWorkspaceFile } from '@/utils/aiIDEWorkspace'
import { syncAutonomyRunState } from '@/utils/aiAutonomyScheduler'
import { buildPlanExecutionPacket, flushPlanToWorkspace, generateInitialPlanPhases, inspectPlanWorkspaceDrift, recordPlanWorkspaceSnapshot, replanProjectPlan, syncPlanWorkspaceBaseline } from '@/utils/aiPlanEngine'
import { getSuggestedWorkspaceArtifactRoot } from '@/utils/runtimeDirectories'
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
type IdeWorkbenchLayoutState = {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  mcpHeight: number
  leftCollapsed: boolean
  rightCollapsed: boolean
  bottomCollapsed: boolean
  mcpCollapsed: boolean
}

const DEFAULT_IDE_WORKBENCH_LAYOUT: IdeWorkbenchLayoutState = {
  leftWidth: 232,
  rightWidth: 312,
  bottomHeight: 196,
  mcpHeight: 156,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
  mcpCollapsed: false,
}

const aiStore = useAIStore()
const router = useRouter()

const editorTabs = ref<EditorTabState[]>([])
const activeFilePath = ref('')
const terminalScripts = ref<Array<{ name: string; command: string }>>([])
const explorerClipboardEntries = ref<ExplorerEntryPayload[]>([])
const selectedPlanId = ref('')
const ideInspectorTab = ref<'assistant' | 'plan' | 'log'>('assistant')
const refreshingWorkspace = ref(false)
const replanningPlan = ref(false)
const syncingPlanBaseline = ref(false)
const syncingAutonomyRun = ref(false)
const updatingPlanStatus = ref(false)
const selectedPlanDrift = ref<ProjectPlanDriftSummary | null>(null)
const ideWorkbenchLayout = ref<IdeWorkbenchLayoutState>({ ...DEFAULT_IDE_WORKBENCH_LAYOUT })
const ideWorkbenchRestoreSnapshot = ref<IdeWorkbenchLayoutState | null>(null)
let selectedPlanDriftRequestId = 0
let selectedPlanDriftTimer: ReturnType<typeof setTimeout> | null = null
let syncingEditorSession = false
let removeIdeResizeListeners: (() => void) | null = null

const workspace = computed(() => aiStore.ideWorkspace)
const workspaceList = computed(() => aiStore.getIDEWorkspaces())
const recentWorkspaces = computed(() => {
  return [...workspaceList.value]
    .sort((left, right) => (right.lastOpenedAt || right.updatedAt || 0) - (left.lastOpenedAt || left.updatedAt || 0))
    .slice(0, 4)
})
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
const selectedAutonomyRun = computed<AutonomyRun | null>(() => {
  if (!selectedPlan.value) {
    return null
  }

  return aiStore.getAutonomyRunByPlan(selectedPlan.value.id)
})
const ideWorkbenchStyle = computed(() => ({
  '--ide-left-width': ideWorkbenchLayout.value.leftCollapsed ? '0px' : `${ideWorkbenchLayout.value.leftWidth}px`,
  '--ide-right-width': ideWorkbenchLayout.value.rightCollapsed ? '0px' : `${ideWorkbenchLayout.value.rightWidth}px`,
  '--ide-bottom-height': ideWorkbenchLayout.value.bottomCollapsed ? '0px' : `${ideWorkbenchLayout.value.bottomHeight}px`,
  '--ide-left-bottom-height': ideWorkbenchLayout.value.leftCollapsed || ideWorkbenchLayout.value.mcpCollapsed ? '0px' : `${ideWorkbenchLayout.value.mcpHeight}px`,
  '--ide-left-splitter': ideWorkbenchLayout.value.leftCollapsed ? '0px' : '6px',
  '--ide-right-splitter': ideWorkbenchLayout.value.rightCollapsed ? '0px' : '6px',
  '--ide-bottom-splitter': ideWorkbenchLayout.value.bottomCollapsed ? '0px' : '6px',
  '--ide-left-bottom-splitter': ideWorkbenchLayout.value.leftCollapsed || ideWorkbenchLayout.value.mcpCollapsed ? '0px' : '6px',
}))
const isIdeFocusMode = computed(() => ideWorkbenchRestoreSnapshot.value !== null)
const ideShellClasses = computed(() => ({
  'is-left-collapsed': ideWorkbenchLayout.value.leftCollapsed,
  'is-right-collapsed': ideWorkbenchLayout.value.rightCollapsed,
  'is-bottom-collapsed': ideWorkbenchLayout.value.bottomCollapsed,
}))
const ideInspectorTitle = computed(() => {
  if (ideInspectorTab.value === 'assistant') {
    return 'IDE Agent'
  }

  if (ideInspectorTab.value === 'plan') {
    return '项目计划'
  }

  return '开发日志'
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
const workspaceRootLabel = computed(() => compactWorkbenchPath(workspace.value?.rootPath || '', 2) || '未绑定工作区')
const artifactRootLabel = computed(() => compactWorkbenchPath(workspace.value?.artifactRootPath || '', 2) || '未设置')
const activeFileLabel = computed(() => activeFilePath.value ? compactWorkbenchPath(activeFilePath.value, 3) : '未选择文件')

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

function compactWorkbenchPath(targetPath: string, tailSegments = 2) {
  const normalized = targetPath.trim().replace(/\\/g, '/')
  if (!normalized) {
    return ''
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= tailSegments + 1) {
    return normalized
  }

  const head = /^[A-Za-z]:$/.test(segments[0]) ? `${segments[0]}/` : ''
  return `${head}.../${segments.slice(-tailSegments).join('/')}`
}

function formatWorkbenchTimestamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '最近未打开'
  }

  const deltaMs = Date.now() - timestamp
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (deltaMs < minuteMs) {
    return '刚刚打开'
  }

  if (deltaMs < hourMs) {
    return `${Math.max(1, Math.floor(deltaMs / minuteMs))} 分钟前`
  }

  if (deltaMs < dayMs) {
    return `${Math.max(1, Math.floor(deltaMs / hourMs))} 小时前`
  }

  if (deltaMs < 7 * dayMs) {
    return `${Math.max(1, Math.floor(deltaMs / dayMs))} 天前`
  }

  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })
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
  () => [workspace.value?.id || '', selectedPlan.value?.id || '', selectedPlan.value?.updatedAt || 0],
  () => {
    void syncSelectedAutonomyRun({ silent: true })
  },
  { immediate: true },
)

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
  if (!aiStore.loaded) {
    await aiStore.init()
  }
  loadIdeWorkbenchLayout()
  window.addEventListener('beforeunload', handleBeforeUnload)
  await loadWorkspaceScripts()
  await refreshSelectedPlanDrift({ silent: true })
})

onBeforeRouteLeave(() => {
  persistEditorSession({ immediate: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  removeIdeResizeListeners?.()
  persistEditorSession({ immediate: true })
  if (selectedPlanDriftTimer) {
    clearTimeout(selectedPlanDriftTimer)
    selectedPlanDriftTimer = null
  }
})

function handleBeforeUnload() {
  persistEditorSession({ immediate: true })
}

function loadIdeWorkbenchLayout() {
  try {
    const raw = window.localStorage.getItem('openagent.ide.workbench-layout')
    if (!raw) {
      return
    }

    const parsed = JSON.parse(raw) as Partial<typeof ideWorkbenchLayout.value>
    ideWorkbenchLayout.value = {
      leftWidth: clampWorkbenchSize(parsed.leftWidth, 212, 360, DEFAULT_IDE_WORKBENCH_LAYOUT.leftWidth),
      rightWidth: clampWorkbenchSize(parsed.rightWidth, 276, 420, DEFAULT_IDE_WORKBENCH_LAYOUT.rightWidth),
      bottomHeight: clampWorkbenchSize(parsed.bottomHeight, 150, 320, DEFAULT_IDE_WORKBENCH_LAYOUT.bottomHeight),
      mcpHeight: clampWorkbenchSize(parsed.mcpHeight, 112, 240, DEFAULT_IDE_WORKBENCH_LAYOUT.mcpHeight),
      leftCollapsed: parsed.leftCollapsed === true,
      rightCollapsed: parsed.rightCollapsed === true,
      bottomCollapsed: parsed.bottomCollapsed === true,
      mcpCollapsed: parsed.mcpCollapsed === true,
    }
  } catch {
    // 忽略损坏的本地布局缓存，避免阻塞 IDE 启动
  }
}

function persistIdeWorkbenchLayout() {
  window.localStorage.setItem('openagent.ide.workbench-layout', JSON.stringify(ideWorkbenchLayout.value))
}

function clearIdeFocusSnapshot() {
  ideWorkbenchRestoreSnapshot.value = null
}

function toggleIdePane(target: 'left' | 'right' | 'bottom' | 'mcp') {
  clearIdeFocusSnapshot()
  if (target === 'left') {
    ideWorkbenchLayout.value.leftCollapsed = !ideWorkbenchLayout.value.leftCollapsed
  } else if (target === 'mcp') {
    if (ideWorkbenchLayout.value.leftCollapsed) {
      ideWorkbenchLayout.value.leftCollapsed = false
      ideWorkbenchLayout.value.mcpCollapsed = false
    } else {
      ideWorkbenchLayout.value.mcpCollapsed = !ideWorkbenchLayout.value.mcpCollapsed
    }
  } else if (target === 'right') {
    ideWorkbenchLayout.value.rightCollapsed = !ideWorkbenchLayout.value.rightCollapsed
  } else {
    ideWorkbenchLayout.value.bottomCollapsed = !ideWorkbenchLayout.value.bottomCollapsed
  }

  persistIdeWorkbenchLayout()
}

function resetIdePaneSize(target: 'left' | 'right' | 'bottom' | 'mcp') {
  clearIdeFocusSnapshot()
  if (target === 'left') {
    ideWorkbenchLayout.value.leftCollapsed = false
    ideWorkbenchLayout.value.leftWidth = DEFAULT_IDE_WORKBENCH_LAYOUT.leftWidth
  } else if (target === 'mcp') {
    ideWorkbenchLayout.value.mcpCollapsed = false
    ideWorkbenchLayout.value.mcpHeight = DEFAULT_IDE_WORKBENCH_LAYOUT.mcpHeight
  } else if (target === 'right') {
    ideWorkbenchLayout.value.rightCollapsed = false
    ideWorkbenchLayout.value.rightWidth = DEFAULT_IDE_WORKBENCH_LAYOUT.rightWidth
  } else {
    ideWorkbenchLayout.value.bottomCollapsed = false
    ideWorkbenchLayout.value.bottomHeight = DEFAULT_IDE_WORKBENCH_LAYOUT.bottomHeight
  }

  persistIdeWorkbenchLayout()
}

function resetIdeWorkbenchLayout() {
  clearIdeFocusSnapshot()
  ideWorkbenchLayout.value = { ...DEFAULT_IDE_WORKBENCH_LAYOUT }
  persistIdeWorkbenchLayout()
}

function toggleIdeFocusMode() {
  if (ideWorkbenchRestoreSnapshot.value) {
    ideWorkbenchLayout.value = { ...ideWorkbenchRestoreSnapshot.value }
    clearIdeFocusSnapshot()
    persistIdeWorkbenchLayout()
    return
  }

  ideWorkbenchRestoreSnapshot.value = { ...ideWorkbenchLayout.value }
  ideWorkbenchLayout.value.leftCollapsed = true
  ideWorkbenchLayout.value.rightCollapsed = true
  ideWorkbenchLayout.value.bottomCollapsed = true
  ideWorkbenchLayout.value.mcpCollapsed = true
  persistIdeWorkbenchLayout()
}

function clampWorkbenchSize(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}

function startIdeResize(target: 'left' | 'right' | 'bottom' | 'mcp', event: PointerEvent) {
  if (window.innerWidth <= 860) {
    return
  }

  event.preventDefault()
  clearIdeFocusSnapshot()

  removeIdeResizeListeners?.()

  const startX = event.clientX
  const startY = event.clientY
  const startLayout = { ...ideWorkbenchLayout.value }
  const cursor = target === 'bottom' || target === 'mcp' ? 'row-resize' : 'col-resize'
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'

  const handlePointerMove = (moveEvent: PointerEvent) => {
    if (target === 'left') {
      ideWorkbenchLayout.value.leftCollapsed = false
      ideWorkbenchLayout.value.leftWidth = clampWorkbenchSize(startLayout.leftWidth + (moveEvent.clientX - startX), 212, 360, startLayout.leftWidth)
      return
    }

    if (target === 'right') {
      ideWorkbenchLayout.value.rightCollapsed = false
      ideWorkbenchLayout.value.rightWidth = clampWorkbenchSize(startLayout.rightWidth - (moveEvent.clientX - startX), 276, 420, startLayout.rightWidth)
      return
    }

    if (target === 'mcp') {
      ideWorkbenchLayout.value.mcpCollapsed = false
      ideWorkbenchLayout.value.mcpHeight = clampWorkbenchSize(startLayout.mcpHeight - (moveEvent.clientY - startY), 112, 240, startLayout.mcpHeight)
      return
    }

    ideWorkbenchLayout.value.bottomCollapsed = false
    ideWorkbenchLayout.value.bottomHeight = clampWorkbenchSize(startLayout.bottomHeight - (moveEvent.clientY - startY), 150, 320, startLayout.bottomHeight)
  }

  const stopResize = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persistIdeWorkbenchLayout()
    removeIdeResizeListeners = null
  }

  removeIdeResizeListeners = stopResize
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

function openAgentView() {
  persistEditorSession({ immediate: true })
  void router.push('/ai')
}

function getWorkspaceNameFromRootPath(rootPath: string) {
  return rootPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'workspace'
}

function shouldConfirmWorkspaceSwitch() {
  return dirtyFileCount.value > 0
    && !window.confirm('当前有未保存文件，切换工作区会关闭这些编辑标签。是否继续？')
}

function handleWorkspaceSwitch(workspaceId: string) {
  if (!workspaceId || workspaceId === workspace.value?.id) {
    return
  }

  if (shouldConfirmWorkspaceSwitch()) {
    return
  }

  const nextWorkspace = aiStore.switchIDEWorkspace(workspaceId)
  if (!nextWorkspace) {
    showToast('error', '工作区切换失败')
    return
  }

  showToast('success', `已切换工作区：${nextWorkspace.name}`)
}

async function openWorkspacePicker() {
  if (!window.electronAPI?.chooseDirectory) {
    showToast('error', '当前环境不支持打开本地目录')
    return
  }

  if (shouldConfirmWorkspaceSwitch()) {
    return
  }

  const selectedPath = await window.electronAPI.chooseDirectory('选择 IDE 工作区', workspace.value?.rootPath)
  if (!selectedPath) {
    return
  }

  const suggestedArtifactRoot = await getSuggestedWorkspaceArtifactRoot(getWorkspaceNameFromRootPath(selectedPath))
  const artifactRootPath = await window.electronAPI.chooseDirectory('选择工作区基础产物目录', suggestedArtifactRoot)
  if (!artifactRootPath) {
    showToast('warning', '已取消创建工作区：必须为工作区选择独立的基础产物目录')
    return
  }

  const nextWorkspace = await openWorkspace(selectedPath, artifactRootPath)
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

async function syncSelectedAutonomyRun(options?: { note?: string; silent?: boolean }) {
  const currentWorkspace = workspace.value
  const currentPlan = selectedPlan.value
  if (!currentWorkspace || !currentPlan) {
    return null
  }

  syncingAutonomyRun.value = true
  try {
    const run = await syncAutonomyRunState(
      currentWorkspace,
      currentPlan,
      buildPlanExecutionPacket(currentPlan),
      {
        trigger: options?.note ? 'ide-panel-manual' : 'ide-panel-auto',
        note: options?.note,
      },
    )

    if (!options?.silent) {
      showToast('success', `自治调度状态已同步：${currentPlan.goal}`)
    }

    return run
  } catch (error) {
    if (!options?.silent) {
      showToast('error', error instanceof Error ? error.message : '同步自治调度状态失败')
    }
    return null
  } finally {
    syncingAutonomyRun.value = false
  }
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

async function handleSyncAutonomyRun(planId: string) {
  const targetPlan = workspacePlans.value.find(plan => plan.id === planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可同步的自治调度状态')
    return
  }

  if (targetPlan.id !== selectedPlan.value?.id) {
    selectedPlanId.value = targetPlan.id
  }

  await syncSelectedAutonomyRun({
    note: '主代理从 IDE 面板手动刷新自治调度状态。',
  })
}

async function handleResumeAutonomyRun(planId: string) {
  const targetPlan = workspacePlans.value.find(plan => plan.id === planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可恢复自治执行的计划')
    return
  }

  if (targetPlan.id !== selectedPlan.value?.id) {
    selectedPlanId.value = targetPlan.id
  }

  if (targetPlan.status === 'drafting') {
    showToast('warning', '请先确认计划，再启动自治执行')
    return
  }

  if (targetPlan.status !== 'in-progress') {
    await handleUpdatePlanStatus({
      planId: targetPlan.id,
      status: 'in-progress',
    })
  }

  await syncSelectedAutonomyRun({
    note: '主代理已恢复自治执行，将继续按 RUN.md 和 TASKS.md 推进 ready queue。',
  })
}

async function handlePauseAutonomyRun(planId: string) {
  const targetPlan = workspacePlans.value.find(plan => plan.id === planId) ?? selectedPlan.value
  if (!targetPlan) {
    showToast('error', '当前没有可暂停的自治计划')
    return
  }

  if (targetPlan.id !== selectedPlan.value?.id) {
    selectedPlanId.value = targetPlan.id
  }

  if (targetPlan.status !== 'paused') {
    await handleUpdatePlanStatus({
      planId: targetPlan.id,
      status: 'paused',
    })
  }

  await syncSelectedAutonomyRun({
    note: '主代理已从 IDE 面板暂停自治执行，等待下一次恢复。',
  })
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
  gap: 6px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 4px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 22%),
    radial-gradient(circle at top right, rgba(244, 114, 182, 0.08), transparent 18%),
    linear-gradient(180deg, rgba(247, 250, 253, 0.98), rgba(235, 241, 248, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.ide-view :deep(.glass-panel) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(243, 247, 251, 0.95));
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}

.ide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;

  > p {
    color: var(--text-secondary);
    line-height: 1.45;
    max-width: 920px;
  }
}

.header-copy > p:not(.header-eyebrow):not(.header-path) {
  display: none;
}

.header-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.header-copy h1 {
  font-size: 20px;
  line-height: 1.05;
}

.inspector-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.header-path {
  color: var(--text-muted);
  font-size: $font-sm;
  max-width: 680px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.workspace-select {
  min-width: 144px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font: inherit;
}

.mode-pill {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
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
  gap: $spacing-md;
  padding: 12px 14px;
  border-color: rgba(251, 191, 36, 0.22);
  background:
    linear-gradient(180deg, rgba(255, 252, 244, 0.92), rgba(255, 248, 236, 0.88));
}

.ide-empty-shell {
  display: grid;
  grid-template-columns: 52px minmax(220px, 248px) minmax(0, 1fr) minmax(268px, 320px);
  gap: 6px;
  flex: 1;
  min-height: 520px;
}

.ide-empty-left,
.ide-empty-center,
.ide-empty-right {
  display: grid;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.ide-empty-left {
  grid-template-rows: minmax(0, 1fr) minmax(128px, 156px);
}

.ide-empty-center {
  grid-template-rows: minmax(0, 1fr) minmax(156px, 188px);
}

.ide-empty-right {
  grid-template-rows: auto minmax(0, 1fr);
}

.placeholder-panel {
  display: grid;
  gap: 10px;
  min-height: 0;
  padding: 10px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(244, 247, 250, 0.9));
}

.placeholder-panel.is-editor {
  grid-template-rows: auto minmax(0, 1fr);
}

.placeholder-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.placeholder-panel-body {
  display: grid;
  gap: 12px;
  align-content: start;
}

.placeholder-panel-body.is-compact {
  gap: 8px;
}

.placeholder-panel-body p,
.placeholder-copy,
.placeholder-card p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.placeholder-action,
.placeholder-tag,
.placeholder-mini-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
}

.placeholder-action {
  border: 1px solid color-mix(in srgb, var(--primary) 42%, var(--border));
  background: color-mix(in srgb, var(--primary) 16%, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
  cursor: pointer;
}

.placeholder-tag,
.placeholder-mini-tab {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.placeholder-mini-tab.is-active {
  background: color-mix(in srgb, var(--primary) 18%, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
}

.placeholder-tab-row,
.placeholder-tag-row,
.placeholder-terminal-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.placeholder-tree,
.placeholder-list,
.placeholder-card-grid,
.placeholder-editor-body {
  display: grid;
  gap: 8px;
}

.placeholder-tree {
  padding: 10px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(226, 232, 240, 0.26), rgba(226, 232, 240, 0.12));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.placeholder-line {
  color: var(--text-secondary);
  font-size: 12px;
}

.placeholder-line.is-strong {
  color: var(--text-primary);
  font-weight: 700;
}

.placeholder-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.placeholder-list li {
  margin: 0;
}

.placeholder-card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.placeholder-card {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(235, 241, 249, 0.88), rgba(226, 234, 244, 0.64));
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.placeholder-card strong {
  font-size: 13px;
}

.recent-workspace-list {
  display: grid;
  gap: 8px;
  align-content: start;
}

.recent-workspace-card {
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 68px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(236, 242, 249, 0.92), rgba(229, 236, 245, 0.74));
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.recent-workspace-card:hover,
.recent-workspace-card:focus-visible {
  border-color: color-mix(in srgb, var(--primary) 34%, rgba(148, 163, 184, 0.22));
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.recent-workspace-card strong {
  font-size: 12px;
  line-height: 1.4;
}

.recent-workspace-meta,
.recent-workspace-time {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.recent-workspace-path {
  display: block;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-workspace-path.is-artifact {
  color: var(--text-muted);
}

.placeholder-editor-body {
  align-content: start;
  padding: 10px;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.08), rgba(30, 41, 59, 0.04)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.1));
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.placeholder-code-line {
  display: block;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(96, 165, 250, 0.28), rgba(148, 163, 184, 0.12));
}

.placeholder-code-line.is-wide {
  width: 82%;
}

.placeholder-code-line.is-short {
  width: 38%;
}

.placeholder-terminal-row code {
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
  font-size: 11px;
}

.workbench-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
}

.workbench-toolbar-copy,
.workbench-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  max-width: 236px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-pill.is-mode {
  background: color-mix(in srgb, var(--primary) 18%, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
}

.toolbar-pill.is-path {
  max-width: 288px;
}

.toolbar-toggle {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast, border-color $transition-fast;

  &.active {
    background: color-mix(in srgb, var(--primary) 18%, rgba(255, 255, 255, 0.05));
    border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
    color: var(--text-primary);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }
}

.onboarding-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;

  p {
    color: var(--text-secondary);
    line-height: 1.55;
  }
}

.ide-shell {
  display: grid;
  grid-template-columns: 56px var(--ide-left-width) var(--ide-left-splitter) minmax(0, 1fr) var(--ide-right-splitter) var(--ide-right-width);
  gap: 6px;
  flex: 1;
  min-height: 0;
}

.ide-left-column,
.ide-center,
.ide-sidebar {
  display: grid;
  min-height: 0;
  gap: 6px;
  min-width: 0;
}

.ide-left-column {
  grid-column: 2;
  grid-row: 1;
  grid-template-rows: minmax(0, 1fr) var(--ide-left-bottom-splitter) var(--ide-left-bottom-height);
}

.ide-center {
  grid-column: 4;
  grid-row: 1;
  grid-template-rows: minmax(0, 1fr) var(--ide-bottom-splitter) var(--ide-bottom-height);
}

.ide-sidebar {
  grid-column: 6;
  grid-row: 1;
  grid-template-rows: auto minmax(0, 1fr);
}

:deep(.ide-activity-bar) {
  grid-column: 1;
  min-height: 0;
}

.ide-explorer-panel {
  min-height: 0;
}

.ide-mcp-panel-slot {
  min-height: 0;
}

.ide-left-column.is-mcp-collapsed {
  .ide-mcp-panel-slot,
  .ide-splitter.is-inline-left {
    visibility: hidden;
    overflow: hidden;
  }
}

.ide-assistant-panel-slot,
.ide-plan-panel-slot,
.ide-devlog-panel-slot {
  min-height: 0;
}

.ide-terminal-slot {
  min-height: 0;
}

.ide-shell.is-left-collapsed {
  .ide-left-column {
    visibility: hidden;
    overflow: hidden;
  }

  .ide-splitter.is-left {
    display: none;
  }
}

.ide-shell.is-right-collapsed {
  .ide-sidebar {
    visibility: hidden;
    overflow: hidden;
  }

  .ide-splitter.is-right {
    display: none;
  }
}

.ide-shell.is-bottom-collapsed {
  .ide-terminal-slot {
    visibility: hidden;
    overflow: hidden;
  }

  .ide-splitter--horizontal {
    display: none;
  }
}

.ide-splitter {
  border: none;
  padding: 0;
  background: transparent;
  position: relative;
  cursor: col-resize;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    opacity: 0;
    transition: opacity 0.18s ease, background 0.18s ease;
  }

  &:hover::before,
  &:focus-visible::before {
    opacity: 1;
    background: color-mix(in srgb, var(--primary) 55%, rgba(255, 255, 255, 0.12));
  }
}

.ide-splitter--horizontal {
  cursor: row-resize;
}

.ide-splitter.is-hidden {
  display: none;
}

.ide-splitter.is-left {
  grid-column: 3;
  grid-row: 1;
}

.ide-splitter.is-right {
  grid-column: 5;
  grid-row: 1;
}

.ide-splitter.is-inline-left {
  grid-row: 2;
}

.inspector-toolbar {
  display: grid;
  gap: 6px;
  padding: 7px 9px;
}

.inspector-copy {
  display: grid;
  gap: 4px;
}

.inspector-tabs {
  justify-content: flex-start;
}

.inspector-tab {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.inspector-tab.active {
  background: color-mix(in srgb, var(--primary) 22%, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border));
}

:deep(.ide-activity-bar) {
  width: 52px;
  min-width: 52px;
  padding: 6px;
}

:deep(.ide-activity-bar .activity-btn) {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

:deep(.ide-activity-bar .activity-badge) {
  min-width: 16px;
  height: 16px;
  line-height: 16px;
}

:deep(.ide-explorer-panel),
:deep(.ide-mcp-panel),
:deep(.ide-editor),
:deep(.ide-terminal),
:deep(.ide-plan-panel),
:deep(.ide-dev-log),
:deep(.ide-assistant-panel) {
  border-radius: 12px;
}

:deep(.ide-explorer),
:deep(.ide-plan-panel),
:deep(.ide-dev-log),
:deep(.ide-mcp-panel),
:deep(.ide-assistant-panel),
:deep(.ide-terminal) {
  padding: 8px;
}

:deep(.ide-explorer .explorer-head),
:deep(.ide-terminal .terminal-head),
:deep(.ide-plan-panel .panel-head),
:deep(.ide-dev-log .log-head),
:deep(.ide-assistant-panel .panel-head) {
  margin-bottom: 6px;
}

:deep(.ide-explorer .explorer-action) {
  width: 26px;
  height: 26px;
  border-radius: 8px;
}

:deep(.ide-explorer .explorer-meta),
:deep(.ide-explorer .selection-bar),
:deep(.ide-terminal .terminal-summary),
:deep(.ide-assistant-panel .runtime-strip) {
  border-radius: 12px;
}

:deep(.ide-explorer .tree-row) {
  min-height: 26px;
  border-radius: 8px;
}

:deep(.ide-editor .editor-tabs) {
  gap: 4px;
  padding-bottom: 6px;
}

:deep(.ide-editor .editor-tab) {
  min-height: 28px;
  padding: 0 9px;
  border-radius: 8px;
}

:deep(.ide-editor .editor-toolbar),
:deep(.ide-editor .editor-footer) {
  min-height: 30px;
  padding: 4px 8px;
}

:deep(.ide-editor .editor-textarea) {
  font-size: 11px;
  line-height: 1.5;
}

:deep(.ide-terminal .terminal-tab) {
  min-height: 32px;
  border-radius: 10px;
  padding: 5px 9px;
}

:deep(.ide-terminal .command-input input) {
  min-height: 30px;
  padding: 6px 9px;
}

:deep(.ide-terminal .command-actions .btn),
:deep(.ide-plan-panel .btn),
:deep(.ide-assistant-panel .btn) {
  min-height: 28px;
  padding: 0 10px;
}

:deep(.ide-assistant-panel .panel-head) {
  align-items: flex-start;
}

:deep(.ide-assistant-panel .session-select) {
  min-height: 32px;
  padding: 0 10px;
}

@media (max-width: 1440px) {
  .ide-shell {
    grid-template-columns: 56px var(--ide-left-width) var(--ide-left-splitter) minmax(0, 1fr) var(--ide-right-splitter) var(--ide-right-width);
  }
}

@media (max-width: 1100px) {
  .ide-header,
  .ide-onboarding,
  .workbench-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .workbench-toolbar-actions {
    justify-content: flex-start;
  }

  .ide-empty-shell {
    grid-template-columns: 52px minmax(208px, 236px) minmax(0, 1fr);
  }

  .ide-empty-right {
    grid-column: 2 / span 2;
  }

  .placeholder-card-grid {
    grid-template-columns: 1fr;
  }

  .ide-shell {
    grid-template-columns: 56px var(--ide-left-width) var(--ide-left-splitter) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 10px minmax(260px, 320px);
  }

  .ide-sidebar {
    grid-column: 1 / -1;
    grid-row: 3;
  }

  .ide-splitter.is-right {
    display: none;
  }
}

@media (max-width: 860px) {
  .workbench-toolbar {
    align-items: stretch;
  }

  .ide-empty-shell {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .ide-empty-left,
  .ide-empty-center,
  .ide-empty-right {
    grid-column: 1;
  }

  .ide-shell {
    grid-template-columns: 48px minmax(0, 1fr);
    grid-template-rows: minmax(240px, auto) minmax(160px, auto) minmax(0, 1fr) minmax(260px, auto);
  }

  :deep(.ide-activity-bar) {
    grid-row: 1 / span 4;
  }

  .ide-left-column {
    grid-column: 2;
    grid-row: 1;
    grid-template-rows: minmax(0, 1fr) var(--ide-left-bottom-splitter) var(--ide-left-bottom-height);
  }

  .ide-center {
    grid-column: 2;
    grid-row: 2 / span 2;
  }

  .ide-sidebar {
    grid-column: 2;
    grid-row: 4;
  }

  .ide-splitter {
    display: none;
  }
}
</style>
