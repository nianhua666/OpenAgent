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
        <button class="btn btn-ghost btn-sm" :disabled="!workspace || refreshingWorkspace" @click="refreshWorkspaceState">刷新结构</button>
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
          @open-file="openFile"
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
            @select-plan="selectedPlanId = $event"
            @create-plan="createPlanDraft"
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
        :active-file-path="activeFilePath"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IDEActivityBar from '@/components/ide/IDEActivityBar.vue'
import IDEDevLog from '@/components/ide/IDEDevLog.vue'
import IDEEditor from '@/components/ide/IDEEditor.vue'
import IDEExplorer from '@/components/ide/IDEExplorer.vue'
import IDEPlanPanel from '@/components/ide/IDEPlanPanel.vue'
import IDEStatusBar from '@/components/ide/IDEStatusBar.vue'
import IDETerminal from '@/components/ide/IDETerminal.vue'
import { useAIStore } from '@/stores/ai'
import { workspaceFileExists, openWorkspace, readWorkspaceFile, refreshWorkspaceStructure, writeWorkspaceFile } from '@/utils/aiIDEWorkspace'
import { flushPlanToWorkspace } from '@/utils/aiPlanEngine'
import { showToast } from '@/utils/toast'

interface EditorTabState {
  path: string
  content: string
  savedContent: string
  language?: string
  loading: boolean
  error: string
}

type WorkspacePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

const aiStore = useAIStore()
const router = useRouter()

const editorTabs = ref<EditorTabState[]>([])
const activeFilePath = ref('')
const terminalScripts = ref<Array<{ name: string; command: string }>>([])
const selectedPlanId = ref('')
const refreshingWorkspace = ref(false)

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
const openTabPaths = computed(() => editorTabs.value.map(tab => tab.path))
const dirtyFileCount = computed(() => editorTabs.value.filter(tab => tab.content !== tab.savedContent).length)
const activeTab = computed(() => editorTabs.value.find(tab => tab.path === activeFilePath.value) ?? null)

watch(
  () => workspace.value?.id,
  async (nextWorkspaceId, previousWorkspaceId) => {
    if (nextWorkspaceId === previousWorkspaceId) {
      return
    }

    editorTabs.value = []
    activeFilePath.value = ''
    selectedPlanId.value = workspacePlans.value[0]?.id || ''
    await loadWorkspaceScripts()
  },
  { immediate: true },
)

watch(workspacePlans, plans => {
  if (!selectedPlanId.value || !plans.some(plan => plan.id === selectedPlanId.value)) {
    selectedPlanId.value = plans[0]?.id || ''
  }
})

onMounted(async () => {
  aiStore.setAgentMode('ide')
  await loadWorkspaceScripts()
})

function openAgentView() {
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

async function refreshWorkspaceState() {
  if (!workspace.value) {
    return
  }

  refreshingWorkspace.value = true
  try {
    await refreshWorkspaceStructure(workspace.value)
    await loadWorkspaceScripts()
    showToast('success', '工作区结构已刷新')
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
  }
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

  await flushPlanToWorkspace(workspace.value, plan)
  selectedPlanId.value = plan.id
  showToast('success', '项目计划草案已创建')
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
