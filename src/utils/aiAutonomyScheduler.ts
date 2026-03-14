import type {
  AutonomyRun,
  AutonomyRunCadence,
  AutonomyRunHeartbeat,
  AutonomyRunLoopStage,
  AutonomyRunPermissionRule,
  AutonomyRunStatus,
  AutonomyRunTaskClaim,
  IDEWorkspace,
  ProjectPlan,
  ProjectPlanExecutionPacket,
  ProjectTaskExecutionBrief,
  SubAgent,
} from '@/types'
import { useAIStore } from '@/stores/ai'
import { useAIResourcesStore } from '@/stores/aiResources'
import { useSettingsStore } from '@/stores/settings'
import { genId } from '@/utils/helpers'

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000
const MAX_AUTONOMY_PARALLEL_TASKS = 3
const MAX_VISIBLE_PERMISSION_RULES = 12
const MAX_VISIBLE_HISTORY_CLAIMS = 4

interface AutonomyRunSyncOptions {
  trigger?: string
  note?: string
  statusOverride?: AutonomyRunStatus
  error?: string
}

export async function syncAutonomyRunState(
  workspace: IDEWorkspace,
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  options: AutonomyRunSyncOptions = {},
): Promise<AutonomyRun> {
  const aiStore = useAIStore()
  const resourcesStore = useAIResourcesStore()
  if (!resourcesStore.loaded) {
    await resourcesStore.init()
  }

  const settingsStore = useSettingsStore()
  const existingRun = aiStore.getAutonomyRunByPlan(plan.id)
  const sessionId = resolveRunSessionId(plan, existingRun)
  const relatedSubAgents = sessionId ? aiStore.getSubAgentsForSession(sessionId) : []
  const permissions = buildPermissionRules(resourcesStore, settingsStore)
  const maxParallelTasks = computeRecommendedParallelLimit(packet.readyTasks)
  const claims = buildTaskClaims(packet, relatedSubAgents, existingRun, maxParallelTasks)
  const claimedTaskIds = claims
    .filter(claim => claim.status === 'claimed' || claim.status === 'running')
    .map(claim => claim.taskId)
  const nextStatus = options.statusOverride || resolveAutonomyRunStatus(plan, packet, relatedSubAgents, claimedTaskIds, existingRun)
  const cadence = buildAutonomyCadence(plan, packet, nextStatus, claims)
  const summary = buildAutonomySummary(plan, packet, nextStatus, claims)
  const nextAction = buildNextAction(plan, packet, nextStatus, claims)
  const heartbeat = buildHeartbeat(packet, summary, nextAction, claims, cadence, options.note)
  const now = Date.now()

  const nextRun: AutonomyRun = {
    id: existingRun?.id || genId(),
    workspaceId: workspace.id,
    planId: plan.id,
    sessionId,
    status: nextStatus,
    mode: 'continuous',
    maxParallelTasks,
    subAgentBatchLimit: maxParallelTasks,
    heartbeatIntervalMs: existingRun?.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS,
    summary,
    nextAction,
    permissions,
    queue: {
      readyTaskIds: packet.readyTasks.map(task => task.taskId),
      blockedTaskIds: packet.blockedTasks.map(task => task.taskId),
      claimedTaskIds,
    },
    claims,
    cadence,
    lastHeartbeat: heartbeat,
    lastError: options.error
      || (nextStatus === 'failed'
        ? existingRun?.lastError || '自治调度器进入失败态，请先处理阻塞原因。'
        : undefined),
    createdAt: existingRun?.createdAt || now,
    updatedAt: now,
    startedAt: nextStatus === 'running'
      ? (existingRun?.startedAt || now)
      : existingRun?.startedAt,
    pausedAt: nextStatus === 'paused'
      ? now
      : existingRun?.pausedAt,
    completedAt: nextStatus === 'completed'
      ? now
      : existingRun?.completedAt,
  }

  return aiStore.upsertAutonomyRun(nextRun) || nextRun
}

export function renderAutonomyRunToMarkdown(
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  run: AutonomyRun | null,
): string {
  const permissions = run?.permissions || []
  const claims = run?.claims || []
  const lines: string[] = []

  lines.push('# 自治调度器状态')
  lines.push('')
  lines.push(`- **项目**: ${plan.goal}`)
  lines.push(`- **计划状态**: ${plan.status} (${plan.progress}%)`)
  lines.push(`- **调度状态**: ${formatRunStatus(run?.status || 'queued')}`)
  lines.push(`- **建议并行任务数**: ${run?.maxParallelTasks || 1}`)
  lines.push(`- **子代理批次上限**: ${run?.subAgentBatchLimit || 1}`)
  lines.push(`- **最近心跳**: ${run?.lastHeartbeat ? formatTime(run.lastHeartbeat.timestamp) : '尚未记录'}`)
  lines.push('')

  if (run?.cadence) {
    lines.push('## 长任务循环节律')
    lines.push('')
    lines.push(`- **当前循环阶段**: ${formatLoopStage(run.cadence.loopStage)}`)
    lines.push(`- **当前聚焦**: ${run.cadence.focusSummary || '先确认当前 ready queue 与最近心跳。'}`)
    if (run.cadence.verificationChecklist.length > 0) {
      lines.push('- **本轮验证清单**:')
      run.cadence.verificationChecklist.forEach(item => {
        lines.push(`  - ${item}`)
      })
    }
    if (run.cadence.continuationRules.length > 0) {
      lines.push('- **持续推进纪律**:')
      run.cadence.continuationRules.forEach(item => {
        lines.push(`  - ${item}`)
      })
    }
    lines.push('')
  }

  lines.push('## 当前摘要')
  lines.push('')
  lines.push(run?.summary || '当前尚未生成自治调度摘要。')
  lines.push('')
  lines.push(`- **下一动作**: ${run?.nextAction || '先刷新调度器状态，再决定是否继续推进 ready queue。'}`)
  if (run?.lastError) {
    lines.push(`- **最近错误**: ${run.lastError}`)
  }
  lines.push('')

  lines.push('## 长时自治运行协议')
  lines.push('')
  lines.push('1. 先阅读 `PLAN.md`、`TASKS.md`、`CONTEXT.md` 与 `RUN.md`，确认目标、上下文和当前队列。')
  lines.push('2. 仅在计划已进入 `approved` / `in-progress` 后继续自动推进；若仍处于 `drafting`，先等待用户确认。')
  lines.push('3. 主代理先处理 ready queue 中真正独立的任务，再按当前接口支持的模型列表为子代理选型并派发。')
  lines.push('4. 子代理只负责被委派任务，不能继续创建代理；主代理负责验收、更新任务状态和必要时重规划。')
  lines.push('5. 每一轮推进后刷新 `PLAN.md`、`TASKS.md`、`CONTEXT.md`、`SUBAGENTS.md`、`SUPERVISOR.md`、`RUN.md` 和 `dev-log.md`。')
  lines.push('6. 当 ready queue 耗尽、阻塞增加或失败反馈出现时，先判断是同步基线、解除阻塞还是触发动态重规划。')
  lines.push('')

  lines.push('## 调度队列')
  lines.push('')
  lines.push(`- **Ready**: ${packet.readyTaskCount}`)
  lines.push(`- **Blocked**: ${packet.blockedTaskCount}`)
  lines.push(`- **Claimed**: ${run?.queue.claimedTaskIds.length || 0}`)
  lines.push(`- **下一优先任务**: ${packet.nextTaskTitle || '暂无'}`)
  lines.push('')

  lines.push('## 当前任务领取')
  lines.push('')
  if (claims.length === 0) {
    lines.push('- 当前没有可展示的任务领取记录。')
  } else {
    claims.forEach(claim => {
      lines.push(`- **${claim.taskTitle}** [${formatClaimStatus(claim.status)}] -> ${claim.agentName}（${claim.agentRole}）`)
      if (claim.files.length > 0) {
        lines.push(`  - 关键文件: ${claim.files.map(file => `\`${file}\``).join(', ')}`)
      }
      if (claim.model) {
        lines.push(`  - 当前模型: ${claim.model}${claim.selectionMode ? ` (${claim.selectionMode})` : ''}`)
      }
      if (claim.reason) {
        lines.push(`  - 原因: ${claim.reason}`)
      }
    })
  }
  lines.push('')

  lines.push('## 权限治理')
  lines.push('')
  if (permissions.length === 0) {
    lines.push('- 当前没有可用的自治权限规则。')
  } else {
    permissions.slice(0, MAX_VISIBLE_PERMISSION_RULES).forEach(rule => {
      const capabilityLabel = rule.capabilities.length > 0 ? ` | 能力: ${rule.capabilities.join(' / ')}` : ''
      lines.push(`- **${rule.name}** [${formatPermissionMode(rule.mode)}]${capabilityLabel}`)
      if (rule.description) {
        lines.push(`  - ${rule.description}`)
      }
    })
  }
  lines.push('')

  if (run?.lastHeartbeat) {
    lines.push('## 最近心跳')
    lines.push('')
    lines.push(`- **时间**: ${formatTime(run.lastHeartbeat.timestamp)}`)
    lines.push(`- **摘要**: ${run.lastHeartbeat.summary}`)
    lines.push(`- **下一动作**: ${run.lastHeartbeat.nextAction}`)
    if (run.lastHeartbeat.loopStage) {
      lines.push(`- **循环阶段**: ${formatLoopStage(run.lastHeartbeat.loopStage)}`)
    }
    if (run.lastHeartbeat.focusSummary) {
      lines.push(`- **当前聚焦**: ${run.lastHeartbeat.focusSummary}`)
    }
    lines.push(`- **Ready IDs**: ${run.lastHeartbeat.readyTaskIds.join(', ') || '无'}`)
    lines.push(`- **Blocked IDs**: ${run.lastHeartbeat.blockedTaskIds.join(', ') || '无'}`)
    lines.push(`- **Claimed IDs**: ${run.lastHeartbeat.claimedTaskIds.join(', ') || '无'}`)
    lines.push('')
  }

  return lines.join('\n')
}

function resolveRunSessionId(plan: ProjectPlan, existingRun: AutonomyRun | null) {
  const aiStore = useAIStore()
  if (existingRun?.sessionId) {
    return existingRun.sessionId
  }

  if (aiStore.activeSessionId) {
    return aiStore.activeSessionId
  }

  return aiStore.activeSession?.id || ''
}

function buildPermissionRules(
  resourcesStore: ReturnType<typeof useAIResourcesStore>,
  settingsStore: ReturnType<typeof useSettingsStore>,
): AutonomyRunPermissionRule[] {
  const rules: AutonomyRunPermissionRule[] = [
    {
      id: 'builtin-plan-governance',
      kind: 'builtin',
      name: '计划治理工具',
      description: '允许更新计划状态、推进任务、记录日志、读取自治运行状态并触发重规划。',
      mode: 'allow',
      capabilities: ['plan', 'tracking', 'replan'],
    },
    {
      id: 'builtin-workspace-files',
      kind: 'builtin',
      name: '工作区文件工具',
      description: '允许读取、写入、列目录和搜索工作区内文件，是自治编码的主通道。',
      mode: 'allow',
      capabilities: ['ide-read', 'ide-write', 'search'],
    },
    {
      id: 'builtin-sub-agent',
      kind: 'builtin',
      name: '子代理委派工具',
      description: '允许主代理按模型列表路由并创建子代理，但子代理自身禁止再创建代理。',
      mode: 'allow',
      capabilities: ['route-model', 'spawn-sub-agent', 'supervision'],
    },
    {
      id: 'builtin-account-data',
      kind: 'builtin',
      name: '账号业务工具',
      description: '涉及业务数据写入与导入导出，自治运行时默认保留人工确认意识。',
      mode: 'ask',
      capabilities: ['account-data', 'import-export'],
    },
    {
      id: 'builtin-windows-mcp',
      kind: 'builtin',
      name: 'Windows MCP',
      description: settingsStore.settings.windowsMcpEnabled
        ? '当前已启用。适合桌面级验证和系统操作，但应优先做视觉确认并减少高风险重复操作。'
        : '当前未启用，自治调度器不应尝试依赖系统级 Windows MCP 操作。',
      mode: settingsStore.settings.windowsMcpEnabled ? 'ask' : 'deny',
      capabilities: ['screen', 'mouse', 'keyboard', 'window-control'],
    },
  ]

  resourcesStore.registry.skills.forEach(skill => {
    rules.push({
      id: skill.id,
      kind: 'skill',
      name: skill.name,
      description: skill.description || '托管 Skill 规则。',
      mode: skill.enabled ? 'allow' : 'deny',
      capabilities: ['skill'],
    })
  })

  resourcesStore.registry.mcpServers.forEach(server => {
    rules.push({
      id: server.id,
      kind: 'mcp',
      name: server.name,
      description: server.description || `${server.command}${server.args.length > 0 ? ` ${server.args.join(' ')}` : ''}`,
      mode: server.enabled ? 'allow' : 'deny',
      capabilities: server.tools.slice(0, 6).map(tool => tool.invocationName),
    })
  })

  return rules
}

function buildTaskClaims(
  packet: ProjectPlanExecutionPacket,
  relatedSubAgents: SubAgent[],
  existingRun: AutonomyRun | null,
  maxParallelTasks: number,
): AutonomyRunTaskClaim[] {
  const acceptedTaskIds = selectParallelTaskIds(packet.readyTasks, maxParallelTasks)
  const claims = packet.readyTasks.map(task => {
    const matchedAgent = findMatchingSubAgent(task, relatedSubAgents, existingRun)
    const claimStatus = resolveClaimStatus(task, matchedAgent, acceptedTaskIds)
    return {
      taskId: task.taskId,
      phaseId: task.phaseId,
      taskTitle: task.taskTitle,
      agentName: task.recommendedAgentName,
      agentRole: task.recommendedRole,
      files: task.files,
      status: claimStatus,
      reason: buildClaimReason(claimStatus, task, matchedAgent, acceptedTaskIds),
      assignedAgentId: matchedAgent?.id,
      model: matchedAgent?.model,
      modelReason: matchedAgent?.modelReason,
      selectionMode: matchedAgent?.selectionMode,
      updatedAt: matchedAgent?.completedAt || matchedAgent?.createdAt || Date.now(),
    } satisfies AutonomyRunTaskClaim
  })

  const historicalClaims = (existingRun?.claims || [])
    .filter(claim => !claims.some(item => item.taskId === claim.taskId))
    .filter(claim => claim.status === 'completed' || claim.status === 'failed' || claim.status === 'blocked')
    .slice(0, MAX_VISIBLE_HISTORY_CLAIMS)

  return [...claims, ...historicalClaims]
}

function findMatchingSubAgent(
  task: ProjectTaskExecutionBrief,
  relatedSubAgents: SubAgent[],
  existingRun: AutonomyRun | null,
) {
  const existingClaim = existingRun?.claims.find(claim => claim.taskId === task.taskId && claim.assignedAgentId)
  if (existingClaim?.assignedAgentId) {
    const claimAgent = relatedSubAgents.find(agent => agent.id === existingClaim.assignedAgentId)
    if (claimAgent) {
      return claimAgent
    }
  }

  return relatedSubAgents.find(agent => agent.taskId === task.taskId || (agent.planId === task.planId && agent.task.includes(task.taskTitle)))
}

function resolveClaimStatus(
  task: ProjectTaskExecutionBrief,
  matchedAgent: SubAgent | undefined,
  acceptedTaskIds: Set<string>,
): AutonomyRunTaskClaim['status'] {
  if (matchedAgent) {
    if (matchedAgent.status === 'running') {
      return 'running'
    }
    if (matchedAgent.status === 'pending') {
      return 'claimed'
    }
    if (matchedAgent.status === 'completed') {
      return 'completed'
    }
    if (matchedAgent.status === 'failed' || matchedAgent.status === 'cancelled') {
      return 'failed'
    }
  }

  return acceptedTaskIds.has(task.taskId) ? 'ready' : 'deferred'
}

function buildClaimReason(
  status: AutonomyRunTaskClaim['status'],
  task: ProjectTaskExecutionBrief,
  matchedAgent: SubAgent | undefined,
  acceptedTaskIds: Set<string>,
) {
  if (matchedAgent?.modelReason) {
    return matchedAgent.modelReason
  }

  if (status === 'running' || status === 'claimed') {
    return '该任务已被自治调度器分配给子代理，主代理当前只需监督执行与验收。'
  }

  if (status === 'completed') {
    return '该任务已有最近一次完成记录，可由主代理复核后推进计划状态。'
  }

  if (status === 'failed') {
    return '该任务最近一次执行未通过，主代理应结合失败反馈决定是否重规划。'
  }

  if (acceptedTaskIds.has(task.taskId)) {
    return '该任务与当前批次其他 ready task 文件冲突较低，适合优先领取并推进。'
  }

  return '该任务已 ready，但当前批次为了控制共享文件冲突和监督成本，暂缓到下一轮领取。'
}

function computeRecommendedParallelLimit(readyTasks: ProjectTaskExecutionBrief[]) {
  const acceptedTaskIds = selectParallelTaskIds(readyTasks, MAX_AUTONOMY_PARALLEL_TASKS)
  return Math.max(1, acceptedTaskIds.size || (readyTasks.length > 0 ? 1 : 1))
}

function selectParallelTaskIds(readyTasks: ProjectTaskExecutionBrief[], maxParallelTasks: number) {
  const accepted: ProjectTaskExecutionBrief[] = []
  const acceptedIds = new Set<string>()

  for (const task of readyTasks) {
    if (accepted.length >= maxParallelTasks) {
      break
    }

    if (accepted.every(existingTask => isParallelSafe(existingTask, task))) {
      accepted.push(task)
      acceptedIds.add(task.taskId)
    }
  }

  if (acceptedIds.size === 0 && readyTasks[0]) {
    acceptedIds.add(readyTasks[0].taskId)
  }

  return acceptedIds
}

function isParallelSafe(left: ProjectTaskExecutionBrief, right: ProjectTaskExecutionBrief) {
  if (left.taskId === right.taskId) {
    return true
  }

  const leftFiles = normalizeTaskFiles(left.files)
  const rightFiles = normalizeTaskFiles(right.files)
  if (leftFiles.length === 0 || rightFiles.length === 0) {
    return true
  }

  return leftFiles.every(leftFile =>
    rightFiles.every(rightFile =>
      leftFile !== rightFile
      && !leftFile.startsWith(`${rightFile}/`)
      && !rightFile.startsWith(`${leftFile}/`),
    ),
  )
}

function normalizeTaskFiles(files: string[]) {
  return files
    .map(file => file.replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter(Boolean)
}

function resolveAutonomyRunStatus(
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  relatedSubAgents: SubAgent[],
  claimedTaskIds: string[],
  existingRun: AutonomyRun | null,
): AutonomyRunStatus {
  if (plan.status === 'completed') {
    return 'completed'
  }

  if (plan.status === 'paused') {
    return 'paused'
  }

  if (existingRun?.lastError && plan.status === 'in-progress' && packet.readyTaskCount === 0 && packet.blockedTaskCount === 0) {
    return 'failed'
  }

  if (plan.status === 'drafting' || plan.status === 'approved') {
    return 'queued'
  }

  if (relatedSubAgents.some(agent => agent.status === 'running')) {
    return 'running'
  }

  if (packet.readyTaskCount === 0 && packet.blockedTaskCount > 0) {
    return 'blocked'
  }

  if (plan.status === 'in-progress' || claimedTaskIds.length > 0) {
    return 'running'
  }

  return 'queued'
}

function buildAutonomyCadence(
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  status: AutonomyRunStatus,
  claims: AutonomyRunTaskClaim[],
): AutonomyRunCadence {
  const runningClaim = claims.find(claim => claim.status === 'running' || claim.status === 'claimed')
  const readyClaim = claims.find(claim => claim.status === 'ready')
  const focusClaim = runningClaim || readyClaim || claims[0]

  let loopStage: AutonomyRunLoopStage = 'observe'
  if (plan.status === 'drafting' || plan.status === 'approved') {
    loopStage = 'plan'
  } else if (status === 'blocked' || status === 'failed') {
    loopStage = 'observe'
  } else if (runningClaim) {
    loopStage = 'execute'
  } else if (readyClaim) {
    loopStage = 'plan'
  } else if (status === 'completed') {
    loopStage = 'record'
  }

  return {
    loopStage,
    focusSummary: buildCadenceFocusSummary(plan, status, focusClaim),
    verificationChecklist: buildVerificationChecklist(packet, focusClaim),
    continuationRules: [
      '每轮只保留一个主任务 lane，只有文件和状态互不冲突时才并行副任务。',
      '每次改动后立刻做最小必要验证，不把 build / test / 回读全部拖到最后一轮。',
      '如果连续两轮没有实质进展，先总结阻塞与缺口，再同步基线或触发重规划。',
      '每轮结束都要刷新 TASKS.md、CONTEXT.md、RUN.md 和 dev-log.md，保证后续可无缝续跑。',
    ],
  }
}

function buildCadenceFocusSummary(
  plan: ProjectPlan,
  status: AutonomyRunStatus,
  focusClaim: AutonomyRunTaskClaim | undefined,
) {
  if (plan.status === 'drafting') {
    return '当前重点是确认计划范围、风险和依赖，暂不直接改代码。'
  }

  if (status === 'blocked') {
    return '当前重点是识别阻塞来自依赖、失败反馈还是工作区漂移，并决定先同步基线还是重规划。'
  }

  if (status === 'failed') {
    return '当前重点是读取最近失败输出、收紧任务粒度，并给出下一轮恢复策略。'
  }

  if (!focusClaim) {
    return '当前先复核 ready queue、最近心跳与工作区 diff，再选择下一轮的主任务 lane。'
  }

  const lane = focusClaim.files.length > 0
    ? `文件范围：${focusClaim.files.slice(0, 3).join('、')}`
    : `角色：${focusClaim.agentRole}`
  return `本轮主任务 lane 聚焦「${focusClaim.taskTitle}」，${lane}。先完成这一轮的改动与验证，再决定是否切换任务。`
}

function buildVerificationChecklist(
  packet: ProjectPlanExecutionPacket,
  focusClaim: AutonomyRunTaskClaim | undefined,
) {
  const checklist = [
    '修改完成后先回读 diff、关键文件或工具输出，确认没有偏离当前任务。'
  ]
  const taskType = packet.readyTasks.find(task => task.taskId === focusClaim?.taskId)?.taskType

  if (taskType === 'create' || taskType === 'modify' || taskType === 'refactor') {
    checklist.push('优先执行最小必要的 build / typecheck / lint / 局部测试，而不是盲目全量跑长流程。')
  }

  if (taskType === 'test') {
    checklist.push('测试任务要明确覆盖目标、失败原因和通过证据，并避免只写未执行的测试草稿。')
  }

  if (taskType === 'docs') {
    checklist.push('文档任务完成后要交叉检查 README / TASKS / PLAN / 开发日志是否一致。')
  }

  if (taskType === 'config') {
    checklist.push('配置任务完成后要确认影响范围、回退方式和是否需要重新构建或重启。')
  }

  if (focusClaim?.files.some(file => /src\/views|src\/components|\.vue$/i.test(file))) {
    checklist.push('涉及前端界面时，优先补截图、烟测或关键状态回读，避免只改代码不看实际视图。')
  }

  checklist.push('完成本轮后立刻同步任务状态、心跳摘要和下一动作，不要把记录拖到后面。')
  return checklist.slice(0, 5)
}

function buildAutonomySummary(
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  status: AutonomyRunStatus,
  claims: AutonomyRunTaskClaim[],
) {
  if (status === 'completed') {
    return '计划已经收口到完成态，自治调度器当前只需要保留交付记录和恢复锚点。'
  }

  if (status === 'paused') {
    return '自治调度器当前处于暂停态，已保留 ready queue、权限画像和最近心跳，等待下一次恢复执行。'
  }

  if (status === 'blocked') {
    return '当前没有可立即推进的 ready task，自治调度器判断主要阻塞集中在依赖任务、失败反馈或基线漂移。'
  }

  if (status === 'failed') {
    return '自治调度器当前进入失败态，建议主代理先检查最近错误、回退策略和重规划入口。'
  }

  const activeClaims = claims.filter(claim => claim.status === 'running' || claim.status === 'claimed').length
  if (activeClaims > 0) {
    return `自治调度器正在监督 ${activeClaims} 个已领取任务，并持续根据 ready queue、模型路由和权限画像推进长时开发。`
  }

  if (packet.readyTaskCount > 0) {
    return `当前已整理出 ${packet.readyTaskCount} 个 ready task，可在确认计划状态后按共享文件冲突程度分批推进。`
  }

  return `计划“${plan.goal}”的自治调度状态已生成，但当前还没有 ready task，可继续观察基线、失败反馈和后续重规划结果。`
}

function buildNextAction(
  plan: ProjectPlan,
  packet: ProjectPlanExecutionPacket,
  status: AutonomyRunStatus,
  claims: AutonomyRunTaskClaim[],
) {
  if (plan.status === 'drafting') {
    return '先等待用户确认详细计划，再把计划状态切到 approved 或 in-progress。'
  }

  if (status === 'paused') {
    return '先确认暂停原因和当前风险，再恢复自治执行。'
  }

  if (status === 'blocked') {
    return '先检查 blocked queue、最近失败输出和工作区漂移，再决定同步基线还是重规划。'
  }

  const runningClaim = claims.find(claim => claim.status === 'running' || claim.status === 'claimed')
  if (runningClaim) {
    return `优先监督“${runningClaim.taskTitle}”的结果回传，完成后立即更新任务状态并刷新 RUN.md。`
  }

  const readyClaim = claims.find(claim => claim.status === 'ready')
  if (readyClaim) {
    return `优先领取“${readyClaim.taskTitle}”，并在分派前读取当前接口模型列表完成子代理选型。`
  }

  if (packet.blockedTaskCount > 0) {
    return '当前 ready queue 为空，下一步应处理阻塞依赖或触发动态重规划。'
  }

  return '先刷新计划和上下文状态，再决定是否继续拆分任务或结束当前执行轮次。'
}

function buildHeartbeat(
  packet: ProjectPlanExecutionPacket,
  summary: string,
  nextAction: string,
  claims: AutonomyRunTaskClaim[],
  cadence: AutonomyRunCadence,
  note?: string,
): AutonomyRunHeartbeat {
  const heartbeatSummary = note ? `${summary} ${note}`.trim() : summary
  return {
    timestamp: Date.now(),
    summary: heartbeatSummary,
    nextAction,
    loopStage: cadence.loopStage,
    focusSummary: cadence.focusSummary,
    readyTaskIds: packet.readyTasks.map(task => task.taskId),
    blockedTaskIds: packet.blockedTasks.map(task => task.taskId),
    claimedTaskIds: claims
      .filter(claim => claim.status === 'claimed' || claim.status === 'running')
      .map(claim => claim.taskId),
  }
}

function formatRunStatus(status: AutonomyRunStatus) {
  const map: Record<AutonomyRunStatus, string> = {
    queued: '待命',
    running: '运行中',
    paused: '已暂停',
    blocked: '阻塞',
    completed: '已完成',
    failed: '失败',
  }

  return map[status] || status
}

function formatClaimStatus(status: AutonomyRunTaskClaim['status']) {
  const map: Record<AutonomyRunTaskClaim['status'], string> = {
    ready: '待领取',
    deferred: '延后',
    claimed: '已领取',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    blocked: '阻塞',
  }

  return map[status] || status
}

function formatLoopStage(stage: AutonomyRunLoopStage) {
  const map: Record<AutonomyRunLoopStage, string> = {
    observe: 'Observe / 观察',
    plan: 'Choose Lane / 选主线',
    execute: 'Execute / 推进',
    verify: 'Verify / 验证',
    record: 'Record / 记录',
  }

  return map[stage] || stage
}

function formatPermissionMode(mode: AutonomyRunPermissionRule['mode']) {
  const map: Record<AutonomyRunPermissionRule['mode'], string> = {
    allow: '允许',
    ask: '谨慎使用',
    deny: '禁止',
  }

  return map[mode] || mode
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}
