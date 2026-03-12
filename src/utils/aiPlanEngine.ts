/**
 * 项目规划引擎
 * 负责项目 Plan 的生成、Markdown 渲染、任务推进、开发日志渲染
 */

import type {
  ProjectPlan, ProjectPhase, ProjectTask, ProjectTaskStatus,
  DevLogEntry, IDEWorkspace,
} from '@/types'
import { useAIStore } from '@/stores/ai'

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
        const files = task.files.length > 0 ? task.files.map(f => `\`${f}\``).join(', ') : '-'
        lines.push(`| ${task.order} | ${taskIcon} ${task.title} | ${task.type} | ${task.status} | ${files} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
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
      // 所有依赖都已完成
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
    // 只返回当前未完成阶段的任务
    if (ready.length > 0) break
  }

  return ready
}

/** 推进任务状态并同步 store + 日志 */
export function advanceTask(
  planId: string,
  taskId: string,
  status: ProjectTaskStatus,
  output?: string,
): void {
  const aiStore = useAIStore()

  aiStore.updateProjectTaskStatus(planId, taskId, status, output)

  // 生成对应的日志条目
  const plan = aiStore.getProjectPlan(planId)
  if (!plan) return

  let task: ProjectTask | undefined
  for (const phase of plan.phases) {
    task = phase.tasks.find(t => t.id === taskId)
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

  // 按日期分组
  const grouped = groupByDate(entries)

  for (const [date, dayEntries] of grouped) {
    lines.push(`## ${date}`)
    lines.push('')

    for (const entry of dayEntries) {
      const time = formatTimeOnly(entry.timestamp)
      const icon = getLogTypeIcon(entry.type)
      lines.push(`### ${icon} ${time} — ${entry.title}`)
      lines.push('')
      lines.push(entry.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** 生成阶段总结报告 */
export function generatePhaseReport(plan: ProjectPlan, phaseId: string): string {
  const phase = plan.phases.find(p => p.id === phaseId)
  if (!phase) return ''

  const completedTasks = phase.tasks.filter(t => t.status === 'completed')
  const failedTasks = phase.tasks.filter(t => t.status === 'failed')
  const skippedTasks = phase.tasks.filter(t => t.status === 'skipped')

  const lines: string[] = []
  lines.push(`## 阶段报告: ${phase.name}`)
  lines.push('')
  lines.push(`- **状态**: ${phase.status}`)
  lines.push(`- **总任务数**: ${phase.tasks.length}`)
  lines.push(`- **已完成**: ${completedTasks.length}`)
  if (failedTasks.length) lines.push(`- **失败**: ${failedTasks.length}`)
  if (skippedTasks.length) lines.push(`- **跳过**: ${skippedTasks.length}`)
  lines.push('')

  if (completedTasks.length > 0) {
    lines.push('### 完成的任务')
    lines.push('')
    for (const t of completedTasks) {
      lines.push(`- **${t.title}**: ${t.output || t.description}`)
    }
    lines.push('')
  }

  if (failedTasks.length > 0) {
    lines.push('### 失败的任务')
    lines.push('')
    for (const t of failedTasks) {
      lines.push(`- **${t.title}**: ${t.output || '无输出'}`)
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

  // 写入 PLAN.md
  const planMd = renderPlanToMarkdown(plan)
  const planPath = workspace.rootPath + '/.openagent/PLAN.md'
  await api.ideCreateDirectory(workspace.rootPath + '/.openagent')
  await api.ideWriteFile(planPath, planMd)

  // 写入 dev-log.md
  if (plan.devLog.length > 0) {
    const logMd = renderDevLogToMarkdown(plan.devLog)
    const logPath = workspace.rootPath + '/.openagent/dev-log.md'
    await api.ideWriteFile(logPath, logMd)
  }
}

// ========== 内部工具函数 ==========

function formatPlanStatus(status: string): string {
  const map: Record<string, string> = {
    'drafting': '草案中', 'approved': '已批准', 'in-progress': '进行中',
    'completed': '已完成', 'paused': '已暂停',
  }
  return map[status] || status
}

function getStatusIcon(status: string): string {
  const map: Record<string, string> = {
    'pending': '[ ]', 'in-progress': '[~]', 'completed': '[x]',
    'failed': '[!]', 'skipped': '[-]', 'blocked': '[B]',
  }
  return map[status] || '[ ]'
}

function getLogTypeIcon(type: DevLogEntry['type']): string {
  const map: Record<string, string> = {
    'plan': '[PLAN]', 'task-start': '[START]', 'task-complete': '[DONE]',
    'error': '[ERROR]', 'decision': '[DECISION]', 'milestone': '[MILESTONE]',
    'context-compress': '[CTX]',
  }
  return map[type] || '[LOG]'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function formatTimeOnly(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
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
