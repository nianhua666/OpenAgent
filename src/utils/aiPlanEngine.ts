/**
 * 项目规划引擎
 * 负责项目 Plan 的初始生成、Markdown 渲染、任务推进与工作区落盘。
 */

import type {
  DevLogEntry,
  IDEWorkspace,
  ProjectPhase,
  ProjectPlanDriftSummary,
  ProjectPlan,
  ProjectTask,
  ProjectTaskStatus,
  ProjectPlanWorkspaceDiff,
} from '@/types'
import { useAIStore } from '@/stores/ai'
import { readWorkspaceFile, refreshWorkspaceStructure, workspaceFileExists } from '@/utils/aiIDEWorkspace'
import { genId } from '@/utils/helpers'

type PlanSeed = {
  goal: string
  overview: string
  techStack: string[]
}

type WorkspacePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

type WorkspacePackageJson = {
  packageManager?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

type PlanningSignals = {
  packageManager: WorkspacePackageManager
  scripts: string[]
  frameworkLabel: string
  languageLabel: string
  architecturePaths: string[]
  implementationPaths: string[]
  integrationPaths: string[]
  validationPaths: string[]
  documentationPaths: string[]
  validationCommands: string[]
  hasElectron: boolean
  hasTests: boolean
}

type PlanWorkspaceSnapshotFile = {
  path: string
  size: number
  hash?: string
}

type PlanWorkspaceSnapshot = {
  version: 1
  createdAt: number
  totalFiles: number
  files: PlanWorkspaceSnapshotFile[]
}

type ReplanProjectOptions = {
  reason?: string
  taskId?: string
  failureOutput?: string
  contextSummary?: string
  sessionId?: string
}

type ReplanProjectResult = {
  plan: ProjectPlan
  diff: ProjectPlanWorkspaceDiff
  snapshot: PlanWorkspaceSnapshot
  summary: string
  createdTasks: string[]
}

type SnapshotLogOptions = {
  reason?: string
  title?: string
  content?: string
}

const PLAN_WORKSPACE_SNAPSHOT_KEY = 'workspace-plan-snapshot'
const SNAPSHOT_HASH_LIMIT = 80
const SNAPSHOT_HASH_SIZE_LIMIT = 64 * 1024

// ========== Plan Markdown 渲染 ==========

/** 将 ProjectPlan 渲染为 PLAN.md 内容 */
export function renderPlanToMarkdown(plan: ProjectPlan): string {
  const lines: string[] = []

  lines.push(`# ${plan.goal}`)
  lines.push('')
  lines.push(`> ${plan.overview}`)
  lines.push('')
  lines.push(`**技术栈**: ${plan.techStack.join(', ')}`)
  lines.push(`**状态**: ${formatPlanStatus(plan.status)} | **进度**: ${plan.progress}%`)
  lines.push(`**创建时间**: ${formatTime(plan.createdAt)} | **更新时间**: ${formatTime(plan.updatedAt)}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const phase of plan.phases) {
    const phaseIcon = getStatusIcon(phase.status)
    lines.push(`## ${phaseIcon} 阶段 ${phase.order}: ${phase.name}`)
    lines.push('')

    if (phase.description) {
      lines.push(phase.description)
      lines.push('')
    }

    if (phase.tasks.length > 0) {
      lines.push('| # | 任务 | 类型 | 状态 | 涉及文件 |')
      lines.push('|---|------|------|------|----------|')

      for (const task of phase.tasks) {
        const taskIcon = getStatusIcon(task.status)
        const files = task.files.length > 0 ? task.files.map(file => `\`${file}\``).join(', ') : '-'
        lines.push(`| ${task.order} | ${taskIcon} ${task.title} | ${task.type} | ${task.status} | ${files} |`)
      }

      lines.push('')
    }
  }

  return lines.join('\n')
}

export async function generateInitialPlanPhases(
  workspace: IDEWorkspace,
  seed: PlanSeed,
): Promise<ProjectPhase[]> {
  const signals = await collectPlanningSignals(workspace, seed)

  const phase1Id = genId()
  const phase1Task1 = createPlanTask(
    phase1Id,
    1,
    `梳理 ${seed.goal} 的工作区边界`,
    `基于 ${signals.frameworkLabel} / ${signals.languageLabel} 的现有结构，确认本轮改动涉及的入口、状态流和依赖边界。`,
    'docs',
    signals.architecturePaths,
  )
  const phase1Task2 = createPlanTask(
    phase1Id,
    2,
    '确认脚本能力与交付约束',
    signals.validationCommands.length > 0
      ? `优先核对可复用的验证命令：${signals.validationCommands.join('、')}，并同步确认文档与构建交付要求。`
      : '核对当前工作区的构建、验证与交付约束，避免引入无法验证的改动。',
    'config',
    uniquePaths([...signals.validationPaths, ...signals.documentationPaths], 6),
  )

  const phase2Id = genId()
  const phase2Task1 = createPlanTask(
    phase2Id,
    1,
    `实现 ${seed.goal} 的核心改动`,
    `围绕目标“${seed.goal}”完成主功能开发，优先保持既有架构、状态契约与界面行为一致。`,
    'modify',
    signals.implementationPaths,
    [phase1Task1.id, phase1Task2.id],
  )
  const phase2Task2 = createPlanTask(
    phase2Id,
    2,
    signals.hasElectron ? '补齐主进程、状态与工具集成' : '补齐状态与配套集成',
    signals.hasElectron
      ? '同步修正渲染层、主进程 IPC、工具调用和工作区状态，避免出现功能已改但链路未闭环的问题。'
      : '同步修正状态管理、工具函数与页面联动，确保改动不会停留在单点实现。',
    signals.hasElectron ? 'modify' : 'refactor',
    signals.integrationPaths,
    [phase2Task1.id],
  )

  const phase3Id = genId()
  const phase3Task1 = createPlanTask(
    phase3Id,
    1,
    '执行构建与自动化验证',
    signals.validationCommands.length > 0
      ? `执行并记录关键验证命令：${signals.validationCommands.join('、')}。`
      : '执行当前项目可用的构建和自动化验证链路，确认本轮改动没有引入明显回归。',
    'test',
    signals.validationPaths,
    [phase2Task2.id],
  )
  const phase3Task2 = createPlanTask(
    phase3Id,
    2,
    signals.hasTests ? '覆盖关键用户流程回归' : '补做关键流程回归检查',
    signals.hasElectron
      ? '围绕主窗口、工作台、工具调用和高风险交互路径做一轮回归，确认渲染层与主进程之间没有行为断裂。'
      : '围绕本轮目标涉及的关键页面与数据链路做回归，确认交互与状态更新一致。',
    'test',
    uniquePaths([...signals.implementationPaths, ...signals.integrationPaths], 6),
    [phase3Task1.id],
  )

  const phase4Id = genId()
  const phase4Task1 = createPlanTask(
    phase4Id,
    1,
    '更新任务、变更与交接文档',
    '同步更新任务清单、变更记录、开发日志与交接信息，确保后续接手可以直接对齐真实状态。',
    'docs',
    signals.documentationPaths,
    [phase3Task1.id, phase3Task2.id],
  )

  return [
    createPlanPhase(
      phase1Id,
      1,
      '基线梳理',
      `结合 ${workspace.name} 工作区结构、现有脚本能力和本轮目标，先确认影响面与风险边界。`,
      [phase1Task1, phase1Task2],
    ),
    createPlanPhase(
      phase2Id,
      2,
      '实现与集成',
      `围绕“${seed.goal}”推进核心改动，并同步补齐相关状态、工具和运行链路。`,
      [phase2Task1, phase2Task2],
    ),
    createPlanPhase(
      phase3Id,
      3,
      '验证与回归',
      '通过构建、自动化验证与关键流程回归确认本轮改动没有留下明显缺口。',
      [phase3Task1, phase3Task2],
    ),
    createPlanPhase(
      phase4Id,
      4,
      '文档与交接',
      '将任务进度、变更说明与交接文档同步到仓库，避免实现与文档再次脱节。',
      [phase4Task1],
    ),
  ]
}

export async function recordPlanWorkspaceSnapshot(
  workspace: IDEWorkspace,
  planId: string,
  options: SnapshotLogOptions = {},
): Promise<PlanWorkspaceSnapshot | null> {
  const aiStore = useAIStore()
  const plan = aiStore.getProjectPlan(planId)
  if (!plan || plan.workspaceId !== workspace.id) {
    return null
  }

  const snapshot = await capturePlanWorkspaceSnapshot(workspace, plan)
  aiStore.addDevLog(planId, {
    type: 'plan',
    title: options.title || '记录工作区基线快照',
    content: options.content || `为计划「${plan.goal}」记录当前工作区基线，共覆盖 ${snapshot.files.length} 个文件。`,
    metadata: {
      snapshotKind: PLAN_WORKSPACE_SNAPSHOT_KEY,
      snapshotReason: options.reason || 'manual',
      snapshot,
    },
  })
  return snapshot
}

export async function inspectPlanWorkspaceDrift(
  workspace: IDEWorkspace,
  planId: string,
): Promise<ProjectPlanDriftSummary | null> {
  const aiStore = useAIStore()
  const plan = aiStore.getProjectPlan(planId)
  if (!plan || plan.workspaceId !== workspace.id) {
    return null
  }

  const previousSnapshot = getLatestPlanWorkspaceSnapshot(plan)
  const currentSnapshot = await capturePlanWorkspaceSnapshot(workspace, plan)
  const diff = diffPlanWorkspaceSnapshots(previousSnapshot, currentSnapshot)

  return createPlanDriftSummary(planId, diff, currentSnapshot, previousSnapshot)
}

export async function syncPlanWorkspaceBaseline(
  workspace: IDEWorkspace,
  planId: string,
  options: SnapshotLogOptions = {},
): Promise<ProjectPlanDriftSummary | null> {
  const aiStore = useAIStore()
  const snapshot = await recordPlanWorkspaceSnapshot(workspace, planId, {
    reason: options.reason || 'baseline-sync',
    title: options.title || '同步计划工作区基线',
    content: options.content,
  })

  if (!snapshot) {
    return null
  }

  const updatedPlan = aiStore.getProjectPlan(planId)
  if (updatedPlan) {
    await flushPlanToWorkspace(workspace, updatedPlan)
  }

  return createPlanDriftSummary(
    planId,
    {
      added: [],
      removed: [],
      modified: [],
      baselineMissing: false,
    },
    snapshot,
    snapshot,
  )
}

export async function replanProjectPlan(
  workspace: IDEWorkspace,
  planId: string,
  options: ReplanProjectOptions = {},
): Promise<ReplanProjectResult | null> {
  const aiStore = useAIStore()
  const plan = aiStore.getProjectPlan(planId)
  if (!plan || plan.workspaceId !== workspace.id) {
    return null
  }

  const previousSnapshot = getLatestPlanWorkspaceSnapshot(plan)
  const currentSnapshot = await capturePlanWorkspaceSnapshot(workspace, plan)
  const contextSummary = resolveReplanContextSummary(options)
  const diff = diffPlanWorkspaceSnapshots(previousSnapshot, currentSnapshot)
  const nextPhases = buildReplannedPhases(plan, diff, {
    ...options,
    contextSummary,
  })
  const updatedPlan = aiStore.setProjectPlanPhases(planId, nextPhases)
  if (!updatedPlan) {
    return null
  }

  const summary = buildReplanSummary(plan, diff, {
    ...options,
    contextSummary,
  })

  aiStore.addDevLog(planId, {
    type: 'plan',
    title: '动态重规划',
    content: summary,
    metadata: {
      snapshotKind: PLAN_WORKSPACE_SNAPSHOT_KEY,
      snapshotReason: options.reason || 'manual-replan',
      snapshot: currentSnapshot,
      diff,
      taskId: options.taskId || undefined,
      failureOutput: sanitizeLogText(options.failureOutput, 1200) || undefined,
      contextSummary: contextSummary || undefined,
    },
  })

  await flushPlanToWorkspace(workspace, updatedPlan)

  const replanPhase = updatedPlan.phases.find(phase => phase.name === '动态重规划')
  return {
    plan: updatedPlan,
    diff,
    snapshot: currentSnapshot,
    summary,
    createdTasks: replanPhase?.tasks.map(task => task.title) ?? [],
  }
}

/** 获取下一个可执行的任务（依赖全部完成 + 状态为 pending） */
export function getNextExecutableTask(plan: ProjectPlan): ProjectTask | null {
  const completedIds = new Set<string>()
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (task.status === 'completed' || task.status === 'skipped') {
        completedIds.add(task.id)
      }
    }
  }

  for (const phase of plan.phases) {
    if (phase.status === 'completed') continue

    for (const task of phase.tasks) {
      if (task.status !== 'pending') continue

      const depsReady = task.dependencies.every(dep => completedIds.has(dep))
      if (depsReady) return task
    }
  }

  return null
}

/** 获取当前阶段所有可并行执行的任务 */
export function getParallelExecutableTasks(plan: ProjectPlan): ProjectTask[] {
  const completedIds = new Set<string>()
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (task.status === 'completed' || task.status === 'skipped') {
        completedIds.add(task.id)
      }
    }
  }

  const ready: ProjectTask[] = []
  for (const phase of plan.phases) {
    if (phase.status === 'completed') continue

    for (const task of phase.tasks) {
      if (task.status !== 'pending') continue
      if (task.dependencies.every(dep => completedIds.has(dep))) {
        ready.push(task)
      }
    }

    if (ready.length > 0) break
  }

  return ready
}

/** 推进任务状态并同步 store 与日志 */
export function advanceTask(
  planId: string,
  taskId: string,
  status: ProjectTaskStatus,
  output?: string,
): void {
  const aiStore = useAIStore()

  aiStore.updateProjectTaskStatus(planId, taskId, status, output)

  const plan = aiStore.getProjectPlan(planId)
  if (!plan) return

  let task: ProjectTask | undefined
  for (const phase of plan.phases) {
    task = phase.tasks.find(item => item.id === taskId)
    if (task) break
  }

  if (!task) return

  if (status === 'in-progress') {
    aiStore.addDevLog(planId, {
      type: 'task-start',
      title: `开始: ${task.title}`,
      content: task.description,
      metadata: { taskId, phaseId: task.phaseId },
    })
  } else if (status === 'completed') {
    aiStore.addDevLog(planId, {
      type: 'task-complete',
      title: `完成: ${task.title}`,
      content: output || '任务已完成',
      metadata: { taskId, phaseId: task.phaseId },
    })
  } else if (status === 'failed') {
    aiStore.addDevLog(planId, {
      type: 'error',
      title: `失败: ${task.title}`,
      content: output || '任务执行失败',
      metadata: { taskId, phaseId: task.phaseId },
    })
  }
}

/** 记录决策日志 */
export function logDecision(planId: string, title: string, content: string): void {
  const aiStore = useAIStore()
  aiStore.addDevLog(planId, { type: 'decision', title, content })
}

/** 记录里程碑日志 */
export function logMilestone(planId: string, title: string, content: string): void {
  const aiStore = useAIStore()
  aiStore.addDevLog(planId, { type: 'milestone', title, content })
}

// ========== 开发日志 Markdown 渲染 ==========

/** 将开发日志渲染为 dev-log.md 内容 */
export function renderDevLogToMarkdown(entries: DevLogEntry[]): string {
  if (entries.length === 0) return '# 开发日志\n\n暂无记录。\n'

  const lines: string[] = []
  lines.push('# 开发日志')
  lines.push('')

  const grouped = groupByDate(entries)

  for (const [date, dayEntries] of grouped) {
    lines.push(`## ${date}`)
    lines.push('')

    for (const entry of dayEntries) {
      const time = formatTimeOnly(entry.timestamp)
      const icon = getLogTypeIcon(entry.type)
      lines.push(`### ${icon} ${time} - ${entry.title}`)
      lines.push('')
      lines.push(entry.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** 生成阶段总结报告 */
export function generatePhaseReport(plan: ProjectPlan, phaseId: string): string {
  const phase = plan.phases.find(item => item.id === phaseId)
  if (!phase) return ''

  const completedTasks = phase.tasks.filter(task => task.status === 'completed')
  const failedTasks = phase.tasks.filter(task => task.status === 'failed')
  const skippedTasks = phase.tasks.filter(task => task.status === 'skipped')

  const lines: string[] = []
  lines.push(`## 阶段报告: ${phase.name}`)
  lines.push('')
  lines.push(`- **状态**: ${phase.status}`)
  lines.push(`- **总任务数**: ${phase.tasks.length}`)
  lines.push(`- **已完成**: ${completedTasks.length}`)
  if (failedTasks.length > 0) lines.push(`- **失败**: ${failedTasks.length}`)
  if (skippedTasks.length > 0) lines.push(`- **跳过**: ${skippedTasks.length}`)
  lines.push('')

  if (completedTasks.length > 0) {
    lines.push('### 已完成任务')
    lines.push('')
    for (const task of completedTasks) {
      lines.push(`- **${task.title}**: ${task.output || task.description}`)
    }
    lines.push('')
  }

  if (failedTasks.length > 0) {
    lines.push('### 失败任务')
    lines.push('')
    for (const task of failedTasks) {
      lines.push(`- **${task.title}**: ${task.output || '无输出'}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** 将 Plan 和日志写入工作区文件 */
export async function flushPlanToWorkspace(
  workspace: IDEWorkspace,
  plan: ProjectPlan,
): Promise<void> {
  const api = window.electronAPI
  if (!api?.ideWriteFile) return

  const planMd = renderPlanToMarkdown(plan)
  const planPath = workspace.rootPath + '/.openagent/PLAN.md'
  await api.ideCreateDirectory(workspace.rootPath + '/.openagent')
  await api.ideWriteFile(planPath, planMd)

  if (plan.devLog.length > 0) {
    const logMd = renderDevLogToMarkdown(plan.devLog)
    const logPath = workspace.rootPath + '/.openagent/dev-log.md'
    await api.ideWriteFile(logPath, logMd)
  }
}

// ========== 内部工具函数 ==========

async function collectPlanningSignals(
  workspace: IDEWorkspace,
  seed: PlanSeed,
): Promise<PlanningSignals> {
  const structureEntries = workspace.structure?.files ?? []
  const filePaths = structureEntries
    .filter(entry => entry.type === 'file')
    .map(entry => entry.path.replace(/\\/g, '/'))
  const directoryPaths = structureEntries
    .filter(entry => entry.type === 'directory')
    .map(entry => entry.path.replace(/\\/g, '/'))
  const keywordHints = buildGoalPathHints(seed)

  const pkg = await readWorkspacePackageJson(workspace)
  const scripts = Object.keys(pkg?.scripts ?? {})
  const packageManager = await resolveWorkspacePackageManager(workspace, pkg?.packageManager)
  const dependencyNames = uniquePaths([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
  ], 200)

  const hasElectron = dependencyNames.includes('electron')
    || (workspace.framework || '').toLowerCase() === 'electron'
    || directoryPaths.includes('electron')
    || filePaths.some(path => path.startsWith('electron/'))
    || filePaths.some(path => /(?:^|\/)(main|preload)\.(c|m)?(t|j)sx?$/.test(path))

  const hasTests = scripts.some(script => /(test|lint|check|vitest|jest|playwright|cypress)/i.test(script))
    || filePaths.some(path => /(^|\/)(__tests__|tests?|e2e|spec|playwright)\b/i.test(path))

  const architecturePaths = uniquePaths([
    ...pickExistingPaths(directoryPaths, filePaths, [
      'src/router',
      'src/stores',
      'src/types',
      'src/utils',
      'src/components',
      'src/views',
      'electron',
      'package.json',
    ], 6),
    ...pickTopDirectories(directoryPaths, ['docs', '.openagent'], 3),
  ], 6)

  const implementationPaths = uniquePaths([
    ...pickExistingPaths(directoryPaths, filePaths, [
      ...keywordHints,
      'src/views',
      'src/components',
      'src/stores',
      'src/utils',
      'electron',
    ], 6),
    ...pickTopDirectories(directoryPaths, ['docs', '.openagent'], 2),
  ], 6)

  const integrationPaths = uniquePaths([
    ...pickExistingPaths(directoryPaths, filePaths, [
      'src/stores/ai.ts',
      'src/router/index.ts',
      'src/App.vue',
      'src/utils/ai.ts',
      'src/utils/aiTools.ts',
      'src/utils/aiIDEWorkspace.ts',
      'electron',
      ...keywordHints,
    ], 6),
    ...pickTopDirectories(directoryPaths, ['docs', '.openagent'], 2),
  ], 6)

  const validationPaths = uniquePaths([
    ...pickExistingPaths(directoryPaths, filePaths, [
      'package.json',
      'playwright.config.ts',
      'vitest.config.ts',
      'cypress.config.ts',
      'tests',
      'test',
      'e2e',
      ...keywordHints,
    ], 6),
    ...pickTopDirectories(directoryPaths, ['docs', '.openagent'], 2),
  ], 6)

  const documentationPaths = uniquePaths([
    ...pickExistingPaths(directoryPaths, filePaths, [
      'docs/tasks/TASKS.md',
      'CHANGELOG.md',
      'README.md',
      'docs',
      '.github',
    ], 6),
    '.openagent/PLAN.md',
    '.openagent/dev-log.md',
  ], 6)

  const validationCommands = uniquePaths([
    ...scripts
      .filter(script => ['build', 'test', 'lint', 'check', 'typecheck', 'electron:preview', 'preview', 'electron:build']
        .includes(script)),
    ...scripts.filter(script => /(test|lint|check|typecheck|preview)$/i.test(script)),
  ], 8).map(script => buildScriptCommand(packageManager, script))

  if (validationCommands.length === 0) {
    if (scripts.includes('build')) {
      validationCommands.push(buildScriptCommand(packageManager, 'build'))
    } else if (await workspaceFileExists(workspace, 'package.json')) {
      validationCommands.push('npm.cmd run build')
    }
  }

  return {
    packageManager,
    scripts,
    frameworkLabel: workspace.framework || inferWorkspaceFrameworkLabel(seed.techStack),
    languageLabel: workspace.language || inferWorkspaceLanguageLabel(seed.techStack),
    architecturePaths,
    implementationPaths,
    integrationPaths,
    validationPaths,
    documentationPaths,
    validationCommands,
    hasElectron,
    hasTests,
  }
}

function buildGoalPathHints(seed: PlanSeed): string[] {
  const content = `${seed.goal} ${seed.overview} ${seed.techStack.join(' ')}`.toLowerCase()
  const hints: string[] = []

  if (content.includes('ide') || content.includes('工作区') || content.includes('terminal') || content.includes('终端')) {
    hints.push(
      'src/views/IDEView.vue',
      'src/components/ide',
      'src/utils/aiIDEWorkspace.ts',
      'src/utils/aiPlanEngine.ts',
      'electron',
    )
  }

  if (content.includes('agent') || content.includes('代理') || content.includes('会话')) {
    hints.push(
      'src/views/AgentView.vue',
      'src/components/agent',
      'src/stores/ai.ts',
      'src/utils/ai.ts',
      'src/utils/aiTools.ts',
    )
  }

  if (content.includes('context') || content.includes('上下文') || content.includes('memory') || content.includes('记忆')) {
    hints.push(
      'src/stores/ai.ts',
      'src/utils/aiContextEngine.ts',
      'src/utils/aiConversation.ts',
      'src/utils/ai.ts',
    )
  }

  if (content.includes('plan') || content.includes('任务') || content.includes('交接')) {
    hints.push(
      'src/utils/aiPlanEngine.ts',
      'src/components/ide/IDEPlanPanel.vue',
      'docs/tasks/TASKS.md',
      'CHANGELOG.md',
    )
  }

  return uniquePaths(hints, 12)
}

function createPlanPhase(
  id: string,
  order: number,
  name: string,
  description: string,
  tasks: ProjectTask[],
): ProjectPhase {
  return {
    id,
    name,
    description,
    tasks,
    status: 'pending',
    order,
  }
}

function createPlanTask(
  phaseId: string,
  order: number,
  title: string,
  description: string,
  type: ProjectTask['type'],
  files: string[],
  dependencies: string[] = [],
): ProjectTask {
  return {
    id: genId(),
    phaseId,
    title,
    description,
    type,
    files: uniquePaths(files, 6),
    dependencies: uniquePaths(dependencies, 8),
    status: 'pending',
    order,
  }
}

async function capturePlanWorkspaceSnapshot(
  workspace: IDEWorkspace,
  plan: ProjectPlan,
): Promise<PlanWorkspaceSnapshot> {
  await refreshWorkspaceStructure(workspace)

  const structureFiles = (workspace.structure?.files ?? [])
    .filter(file => file.type === 'file')
    .map(file => ({
      path: file.path.replace(/\\/g, '/'),
      size: Number(file.size || 0) || 0,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))

  const trackedPaths = getPlanTrackedPaths(plan)
  const allPaths = uniquePaths([
    ...trackedPaths,
    ...structureFiles.map(file => file.path),
  ], 2400)
  const pathMeta = new Map(structureFiles.map(file => [file.path, file]))
  const hashPriorityPaths = new Set(
    uniquePaths(
      [
        ...trackedPaths,
        ...structureFiles
          .map(file => file.path)
          .filter(path => isSnapshotPriorityPath(path)),
      ],
      SNAPSHOT_HASH_LIMIT,
    ),
  )

  let hashBudget = SNAPSHOT_HASH_LIMIT
  const files: PlanWorkspaceSnapshotFile[] = []

  for (const path of allPaths) {
    const meta = pathMeta.get(path)
    const nextFile: PlanWorkspaceSnapshotFile = {
      path,
      size: meta?.size ?? 0,
    }

    if (hashBudget > 0 && hashPriorityPaths.has(path) && shouldHashSnapshotFile(path, nextFile.size)) {
      const content = await readWorkspaceFile(workspace, path)
      if (content !== null) {
        nextFile.hash = createTextFingerprint(content)
        hashBudget -= 1
      }
    }

    files.push(nextFile)
  }

  return {
    version: 1,
    createdAt: Date.now(),
    totalFiles: structureFiles.length,
    files,
  }
}

function getLatestPlanWorkspaceSnapshot(plan: ProjectPlan): PlanWorkspaceSnapshot | null {
  for (let index = plan.devLog.length - 1; index >= 0; index -= 1) {
    const entry = plan.devLog[index]
    const metadata = entry.metadata
    if (!metadata || metadata.snapshotKind !== PLAN_WORKSPACE_SNAPSHOT_KEY) {
      continue
    }

    const snapshot = metadata.snapshot
    if (isPlanWorkspaceSnapshot(snapshot)) {
      return snapshot
    }
  }

  return null
}

function diffPlanWorkspaceSnapshots(
  previous: PlanWorkspaceSnapshot | null,
  current: PlanWorkspaceSnapshot,
): ProjectPlanWorkspaceDiff {
  if (!previous) {
    return {
      added: [],
      removed: [],
      modified: [],
      baselineMissing: true,
    }
  }

  const previousMap = new Map(previous.files.map(file => [file.path, file]))
  const currentMap = new Map(current.files.map(file => [file.path, file]))
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const [path, currentFile] of currentMap) {
    const previousFile = previousMap.get(path)
    if (!previousFile) {
      added.push(path)
      continue
    }

    const sizeChanged = previousFile.size !== currentFile.size
    const hashChanged = Boolean(previousFile.hash && currentFile.hash && previousFile.hash !== currentFile.hash)
    if (sizeChanged || hashChanged) {
      modified.push(path)
    }
  }

  for (const path of previousMap.keys()) {
    if (!currentMap.has(path)) {
      removed.push(path)
    }
  }

  return {
    added: uniquePaths(added, 12),
    removed: uniquePaths(removed, 12),
    modified: uniquePaths(modified, 12),
    baselineMissing: false,
  }
}

function createPlanDriftSummary(
  planId: string,
  diff: ProjectPlanWorkspaceDiff,
  currentSnapshot: PlanWorkspaceSnapshot,
  previousSnapshot: PlanWorkspaceSnapshot | null,
): ProjectPlanDriftSummary {
  const samplePaths = uniquePaths([
    ...diff.modified,
    ...diff.added,
    ...diff.removed,
  ], 6)
  const totalChanges = diff.added.length + diff.modified.length + diff.removed.length

  return {
    planId,
    changed: diff.baselineMissing || totalChanges > 0,
    totalChanges,
    totalFiles: currentSnapshot.totalFiles,
    baselineCreatedAt: previousSnapshot?.createdAt ?? null,
    checkedAt: currentSnapshot.createdAt,
    samplePaths,
    diff,
  }
}

function buildReplannedPhases(
  plan: ProjectPlan,
  diff: ProjectPlanWorkspaceDiff,
  options: ReplanProjectOptions,
): ProjectPhase[] {
  const phases = plan.phases.map(phase => ({
    ...phase,
    tasks: phase.tasks.map(task => ({
      ...task,
      files: [...task.files],
      dependencies: [...task.dependencies],
    })),
  }))

  const focusedTask = getFocusedTask(plan, options.taskId)
  const nextTask = getNextExecutableTask(plan)
  const trackedPaths = new Set(getPlanTrackedPaths(plan))
  const fallbackPaths = uniquePaths([
    ...(focusedTask?.files ?? []),
    ...(nextTask?.files ?? []),
    ...diff.modified,
    ...diff.added,
    'package.json',
    'src/stores/ai.ts',
    'src/utils/aiPlanEngine.ts',
    'src/utils/aiTools.ts',
    'src/views/IDEView.vue',
    'docs/tasks/TASKS.md',
    'CHANGELOG.md',
  ], 8)
  const impactedPaths = uniquePaths([
    ...(focusedTask?.files ?? []),
    ...diff.modified,
    ...diff.added,
    ...fallbackPaths,
  ], 8)
  const untrackedPaths = uniquePaths(
    [...diff.modified, ...diff.added].filter(path => !trackedPaths.has(path)),
    8,
  )

  const replanPhaseId = phases.find(phase => phase.name === '动态重规划')?.id || genId()
  const replanTasks: ProjectTask[] = []

  replanTasks.push(createPlanTask(
    replanPhaseId,
    1,
    focusedTask ? `修复失败任务链路：${focusedTask.title}` : '重新校准当前执行路径',
    buildReplanFixTaskDescription(diff, options, focusedTask, nextTask),
    focusedTask?.type || (diff.modified.length > 0 ? 'modify' : 'refactor'),
    impactedPaths,
  ))

  if (untrackedPaths.length > 0 || diff.removed.length > 0 || diff.baselineMissing) {
    replanTasks.push(createPlanTask(
      replanPhaseId,
      replanTasks.length + 1,
      '吸收工作区新增差异并收口集成边界',
      buildReplanDiffTaskDescription(diff, untrackedPaths),
      'refactor',
      uniquePaths([...untrackedPaths, ...diff.removed, ...fallbackPaths], 8),
      [replanTasks[0].id],
    ))
  }

  const validationDependencies = replanTasks.map(task => task.id)
  replanTasks.push(createPlanTask(
    replanPhaseId,
    replanTasks.length + 1,
    '回归验证动态重规划结果',
    buildReplanValidationTaskDescription(diff, options),
    'test',
    uniquePaths([...impactedPaths, ...fallbackPaths], 8),
    validationDependencies,
  ))

  replanTasks.push(createPlanTask(
    replanPhaseId,
    replanTasks.length + 1,
    '同步任务文档与交接记录',
    '根据动态重规划后的执行路径更新 PLAN、任务文档与关键交付说明，避免计划再次和真实代码脱节。',
    'docs',
    uniquePaths(['docs/tasks/TASKS.md', 'CHANGELOG.md', '.openagent/PLAN.md'], 6),
    [replanTasks[replanTasks.length - 1].id],
  ))

  const existingIndex = phases.findIndex(phase => phase.name === '动态重规划')
  const replanPhase = createPlanPhase(
    replanPhaseId,
    existingIndex >= 0 ? phases[existingIndex].order : phases.length + 1,
    '动态重规划',
    buildReplanPhaseDescription(diff, options, focusedTask),
    replanTasks,
  )

  if (existingIndex >= 0) {
    phases.splice(existingIndex, 1, replanPhase)
  } else {
    phases.splice(findReplanInsertIndex(phases), 0, replanPhase)
  }

  return phases.map((phase, phaseIndex) => ({
    ...phase,
    order: phaseIndex + 1,
    tasks: phase.tasks.map((task, taskIndex) => ({
      ...task,
      phaseId: phase.id,
      order: taskIndex + 1,
    })),
  }))
}

function getFocusedTask(plan: ProjectPlan, taskId?: string) {
  if (taskId) {
    const exactTask = findTaskById(plan, taskId)
    if (exactTask) {
      return exactTask
    }
  }

  return [...plan.phases]
    .reverse()
    .flatMap(phase => [...phase.tasks].reverse())
    .find(task => task.status === 'failed') ?? null
}

function findTaskById(plan: ProjectPlan, taskId: string) {
  for (const phase of plan.phases) {
    const task = phase.tasks.find(item => item.id === taskId)
    if (task) {
      return task
    }
  }

  return null
}

function getPlanTrackedPaths(plan: ProjectPlan) {
  return uniquePaths(
    plan.phases.flatMap(phase => phase.tasks.flatMap(task => task.files.map(file => file.replace(/\\/g, '/')))),
    2400,
  )
}

function resolveReplanContextSummary(options: ReplanProjectOptions) {
  if (options.contextSummary?.trim()) {
    return options.contextSummary.trim()
  }

  const aiStore = useAIStore()
  const sessionId = options.sessionId || aiStore.activeSessionId
  if (!sessionId) {
    return ''
  }

  const snapshot = aiStore.getLatestContextSnapshot(sessionId)
  if (!snapshot) {
    return ''
  }

  const parts = [
    snapshot.summary,
    snapshot.activeGoals.length > 0 ? `当前目标：${snapshot.activeGoals.join('、')}` : '',
    snapshot.keyFacts.length > 0 ? `关键事实：${snapshot.keyFacts.slice(0, 3).join('；')}` : '',
  ].filter(Boolean)

  return parts.join('；')
}

function buildReplanSummary(
  plan: ProjectPlan,
  diff: ProjectPlanWorkspaceDiff,
  options: ReplanProjectOptions,
) {
  const focusedTask = getFocusedTask(plan, options.taskId)
  const summaryParts: string[] = []

  if (focusedTask) {
    summaryParts.push(`以任务「${focusedTask.title}」为锚点重新校准后续执行路径。`)
  } else {
    summaryParts.push('根据最新工作区状态重新校准后续执行路径。')
  }

  if (diff.baselineMissing) {
    summaryParts.push('之前没有可复用的工作区快照，本次已先建立新的差异基线。')
  } else {
    summaryParts.push(`检测到 ${diff.added.length} 个新增、${diff.modified.length} 个修改、${diff.removed.length} 个移除文件。`)
  }

  if (options.failureOutput?.trim()) {
    summaryParts.push(`失败反馈：${sanitizeLogText(options.failureOutput, 220)}。`)
  }

  if (options.contextSummary?.trim()) {
    summaryParts.push(`上下文摘要：${sanitizeLogText(options.contextSummary, 220)}。`)
  }

  return summaryParts.join(' ')
}

function buildReplanPhaseDescription(
  diff: ProjectPlanWorkspaceDiff,
  options: ReplanProjectOptions,
  focusedTask: ProjectTask | null,
) {
  const headline = focusedTask
    ? `围绕任务「${focusedTask.title}」吸收失败反馈、代码差异与上下文信号。`
    : '围绕真实代码差异、失败反馈与上下文信号重新排列后续执行步骤。'
  const diffSummary = diff.baselineMissing
    ? '当前为首次建立工作区差异基线。'
    : `当前检测到新增 ${diff.added.length}、修改 ${diff.modified.length}、移除 ${diff.removed.length} 个文件。`
  const contextSummary = options.contextSummary?.trim()
    ? `上下文重点：${sanitizeLogText(options.contextSummary, 180)}。`
    : ''

  return [headline, diffSummary, contextSummary].filter(Boolean).join(' ')
}

function buildReplanFixTaskDescription(
  diff: ProjectPlanWorkspaceDiff,
  options: ReplanProjectOptions,
  focusedTask: ProjectTask | null,
  nextTask: ProjectTask | null,
) {
  const anchor = focusedTask
    ? `优先修复任务「${focusedTask.title}」暴露出的阻塞点`
    : nextTask
      ? `围绕下一步任务「${nextTask.title}」重新校准执行边界`
      : '围绕当前计划重新校准执行边界'
  const failure = options.failureOutput?.trim()
    ? `失败反馈：${sanitizeLogText(options.failureOutput, 220)}。`
    : ''
  const diffSummary = diff.baselineMissing
    ? '当前缺少历史快照，先按最新工作区基线重新确认关键文件与依赖。'
    : `优先核对 ${diff.modified.length + diff.added.length} 个变化文件与现有任务描述是否一致。`

  return [anchor, diffSummary, failure].filter(Boolean).join(' ')
}

function buildReplanDiffTaskDescription(diff: ProjectPlanWorkspaceDiff, untrackedPaths: string[]) {
  if (diff.baselineMissing) {
    return '当前计划之前没有差异基线，需要先把最新工作区结构纳入计划，再确认新增文件、移除文件和实际依赖关系。'
  }

  const parts: string[] = []
  if (untrackedPaths.length > 0) {
    parts.push(`将当前计划尚未覆盖的文件纳入执行范围：${untrackedPaths.join('、')}。`)
  }
  if (diff.removed.length > 0) {
    parts.push(`同步处理已移除文件对引用链路的影响：${diff.removed.join('、')}。`)
  }

  return parts.join(' ') || '吸收最新代码差异，避免新增改动游离在计划之外。'
}

function buildReplanValidationTaskDescription(
  diff: ProjectPlanWorkspaceDiff,
  options: ReplanProjectOptions,
) {
  const parts = [
    '基于重规划后的任务结果重新执行构建、关键脚本与高风险交互回归。',
    diff.baselineMissing
      ? '重点确认新基线已经正确覆盖当前工作区。'
      : `重点覆盖新增 ${diff.added.length}、修改 ${diff.modified.length}、移除 ${diff.removed.length} 个文件对应的风险路径。`,
    options.failureOutput?.trim() ? '需要回归验证失败反馈中提到的问题已被真正修复。' : '',
  ].filter(Boolean)

  return parts.join(' ')
}

function findReplanInsertIndex(phases: ProjectPhase[]) {
  const docsPhaseIndex = phases.findIndex(phase => {
    if (/文档|交接/.test(phase.name)) {
      return true
    }

    return phase.tasks.length > 0 && phase.tasks.every(task => task.type === 'docs')
  })

  return docsPhaseIndex >= 0 ? docsPhaseIndex : phases.length
}

function isPlanWorkspaceSnapshot(value: unknown): value is PlanWorkspaceSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<PlanWorkspaceSnapshot>
  return snapshot.version === 1
    && typeof snapshot.createdAt === 'number'
    && typeof snapshot.totalFiles === 'number'
    && Array.isArray(snapshot.files)
}

function isSnapshotPriorityPath(path: string) {
  return path === 'package.json'
    || path === 'CHANGELOG.md'
    || path === 'docs/tasks/TASKS.md'
    || path.startsWith('src/')
    || path.startsWith('electron/')
    || path.startsWith('docs/')
    || path.startsWith('.github/')
    || path.startsWith('.openagent/')
}

function shouldHashSnapshotFile(path: string, size: number) {
  if (size <= 0 || size > SNAPSHOT_HASH_SIZE_LIMIT) {
    return false
  }

  return /\.(?:vue|ts|tsx|js|jsx|json|md|scss|css|html|yml|yaml|ps1|cjs|mjs)$/i.test(path)
    || path === 'package.json'
}

function createTextFingerprint(content: string) {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function sanitizeLogText(content: string | undefined, limit: number) {
  if (!content) {
    return ''
  }

  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit).trim()}…`
}

async function readWorkspacePackageJson(workspace: IDEWorkspace): Promise<WorkspacePackageJson | null> {
  const content = await readWorkspaceFile(workspace, 'package.json')
  if (!content) return null

  try {
    return JSON.parse(content) as WorkspacePackageJson
  } catch {
    return null
  }
}

async function resolveWorkspacePackageManager(
  workspace: IDEWorkspace,
  declaredPackageManager?: string,
): Promise<WorkspacePackageManager> {
  const normalized = typeof declaredPackageManager === 'string'
    ? declaredPackageManager.trim().toLowerCase()
    : ''

  if (normalized.startsWith('pnpm@')) return 'pnpm'
  if (normalized.startsWith('yarn@')) return 'yarn'
  if (normalized.startsWith('bun@')) return 'bun'
  if (normalized.startsWith('npm@')) return 'npm'

  if (await workspaceFileExists(workspace, 'pnpm-lock.yaml')) return 'pnpm'
  if (await workspaceFileExists(workspace, 'yarn.lock')) return 'yarn'
  if (await workspaceFileExists(workspace, 'bun.lockb') || await workspaceFileExists(workspace, 'bun.lock')) return 'bun'

  return 'npm'
}

function buildScriptCommand(packageManager: WorkspacePackageManager, scriptName: string): string {
  if (packageManager === 'pnpm') return `pnpm ${scriptName}`
  if (packageManager === 'yarn') return `yarn ${scriptName}`
  if (packageManager === 'bun') return `bun run ${scriptName}`
  return `npm run ${scriptName}`
}

function pickExistingPaths(
  directoryPaths: string[],
  filePaths: string[],
  preferred: string[],
  limit: number,
): string[] {
  const directories = new Set(directoryPaths)
  const files = new Set(filePaths)
  const matches: string[] = []

  for (const rawCandidate of preferred) {
    const candidate = rawCandidate.replace(/\\/g, '/').trim()
    if (!candidate) continue

    if (directories.has(candidate) || files.has(candidate)) {
      matches.push(candidate)
      if (matches.length >= limit) break
      continue
    }

    const nestedDirectory = directoryPaths.find(path => path.startsWith(candidate + '/'))
    if (nestedDirectory) {
      matches.push(candidate)
      if (matches.length >= limit) break
      continue
    }

    const nestedFile = filePaths.find(path => path.startsWith(candidate + '/'))
    if (nestedFile) {
      matches.push(candidate)
      if (matches.length >= limit) break
    }
  }

  return uniquePaths(matches, limit)
}

function pickTopDirectories(
  directoryPaths: string[],
  excluded: string[],
  limit: number,
): string[] {
  const excludedSet = new Set(excluded.map(item => item.toLowerCase()))
  const topDirectories = directoryPaths
    .filter(path => path && !path.includes('/'))
    .filter(path => !excludedSet.has(path.toLowerCase()))

  return uniquePaths(topDirectories, limit)
}

function uniquePaths(paths: string[], limit: number): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const rawPath of paths) {
    const normalized = String(rawPath || '').replace(/\\/g, '/').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit) break
  }

  return result
}

function inferWorkspaceFrameworkLabel(techStack: string[]): string {
  const normalized = techStack.map(item => item.toLowerCase())
  if (normalized.some(item => item.includes('electron'))) return 'Electron'
  if (normalized.some(item => item.includes('next'))) return 'Next.js'
  if (normalized.some(item => item.includes('nuxt'))) return 'Nuxt'
  if (normalized.some(item => item.includes('vue'))) return 'Vue'
  if (normalized.some(item => item.includes('react'))) return 'React'
  if (normalized.some(item => item.includes('angular'))) return 'Angular'
  if (normalized.some(item => item.includes('svelte'))) return 'Svelte'
  if (normalized.some(item => item.includes('fastapi'))) return 'FastAPI'
  if (normalized.some(item => item.includes('django'))) return 'Django'
  if (normalized.some(item => item.includes('flask'))) return 'Flask'
  return '通用项目'
}

function inferWorkspaceLanguageLabel(techStack: string[]): string {
  const normalized = techStack.map(item => item.toLowerCase())
  if (normalized.some(item => item.includes('typescript'))) return 'TypeScript'
  if (normalized.some(item => item.includes('javascript'))) return 'JavaScript'
  if (normalized.some(item => item.includes('python'))) return 'Python'
  if (normalized.some(item => item.includes('go'))) return 'Go'
  if (normalized.some(item => item.includes('rust'))) return 'Rust'
  if (normalized.some(item => item.includes('java'))) return 'Java'
  if (normalized.some(item => item.includes('c#') || item.includes('dotnet'))) return 'C#'
  return '多语言'
}

function formatPlanStatus(status: string): string {
  const map: Record<string, string> = {
    'drafting': '草案中',
    'approved': '已批准',
    'in-progress': '进行中',
    'completed': '已完成',
    'paused': '已暂停',
  }
  return map[status] || status
}

function getStatusIcon(status: string): string {
  const map: Record<string, string> = {
    'pending': '[ ]',
    'in-progress': '[~]',
    'completed': '[x]',
    'failed': '[!]',
    'skipped': '[-]',
    'blocked': '[B]',
  }
  return map[status] || '[ ]'
}

function getLogTypeIcon(type: DevLogEntry['type']): string {
  const map: Record<string, string> = {
    'plan': '[PLAN]',
    'task-start': '[START]',
    'task-complete': '[DONE]',
    'error': '[ERROR]',
    'decision': '[DECISION]',
    'milestone': '[MILESTONE]',
    'context-compress': '[CTX]',
  }
  return map[type] || '[LOG]'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatTimeOnly(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function groupByDate(entries: DevLogEntry[]): [string, DevLogEntry[]][] {
  const map = new Map<string, DevLogEntry[]>()
  for (const entry of entries) {
    const date = new Date(entry.timestamp).toLocaleDateString('zh-CN')
    const list = map.get(date) || []
    list.push(entry)
    map.set(date, list)
  }
  return Array.from(map.entries())
}
