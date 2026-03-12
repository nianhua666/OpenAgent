/**
 * 自动化开发日志引擎
 * 提供便捷的日志记录 API，支持批量写入工作区 MD 文件、阶段性报告生成
 */

import type { DevLogEntry, IDEWorkspace, ProjectPlan } from '@/types'
import { useAIStore } from '@/stores/ai'
import { renderDevLogToMarkdown, generatePhaseReport } from '@/utils/aiPlanEngine'

// ========== 便捷日志记录 ==========

/** 记录日志条目到指定 Plan */
export function log(
  planId: string,
  type: DevLogEntry['type'],
  title: string,
  content: string,
  metadata?: Record<string, unknown>,
): DevLogEntry | null {
  const aiStore = useAIStore()
  return aiStore.addDevLog(planId, { type, title, content, metadata })
}

/** 记录规划日志 */
export function logPlan(planId: string, title: string, content: string): DevLogEntry | null {
  return log(planId, 'plan', title, content)
}

/** 记录任务开始 */
export function logTaskStart(planId: string, taskTitle: string, description: string): DevLogEntry | null {
  return log(planId, 'task-start', `开始: ${taskTitle}`, description)
}

/** 记录任务完成 */
export function logTaskComplete(planId: string, taskTitle: string, output: string): DevLogEntry | null {
  return log(planId, 'task-complete', `完成: ${taskTitle}`, output)
}

/** 记录错误 */
export function logError(planId: string, title: string, error: string): DevLogEntry | null {
  return log(planId, 'error', title, error)
}

/** 记录决策 */
export function logDecision(planId: string, title: string, reason: string): DevLogEntry | null {
  return log(planId, 'decision', title, reason)
}

/** 记录里程碑 */
export function logMilestone(planId: string, title: string, summary: string): DevLogEntry | null {
  return log(planId, 'milestone', title, summary)
}

/** 记录上下文压缩事件 */
export function logContextCompress(planId: string, before: number, after: number): DevLogEntry | null {
  return log(planId, 'context-compress', '上下文压缩', `${before} → ${after} tokens`, {
    tokensBefore: before,
    tokensAfter: after,
    ratio: before > 0 ? Math.round((after / before) * 100) : 0,
  })
}

// ========== 工作区文件同步 ==========

/** 将日志批量写入工作区 dev-log.md */
export async function flushToFile(
  workspace: IDEWorkspace,
  entries: DevLogEntry[],
): Promise<boolean> {
  const api = window.electronAPI
  if (!api || entries.length === 0) return false

  const md = renderDevLogToMarkdown(entries)
  const dirPath = workspace.rootPath + '/.openagent'
  await api.ideCreateDirectory(dirPath)
  return await api.ideWriteFile(dirPath + '/dev-log.md', md)
}

/** 将指定 Plan 的日志写入工作区 */
export async function flushPlanLog(planId: string, workspace: IDEWorkspace): Promise<boolean> {
  const aiStore = useAIStore()
  const entries = aiStore.getDevLog(planId)
  return await flushToFile(workspace, entries)
}

// ========== 报告生成 ==========

/** 生成并写入阶段报告 */
export async function generateAndWritePhaseReport(
  workspace: IDEWorkspace,
  plan: ProjectPlan,
  phaseId: string,
): Promise<string> {
  const api = window.electronAPI
  const report = generatePhaseReport(plan, phaseId)
  if (!report) return ''

  if (api) {
    const dirPath = workspace.rootPath + '/.openagent/reports'
    await api.ideCreateDirectory(dirPath)

    const phase = plan.phases.find(p => p.id === phaseId)
    const fileName = phase ? `phase-${phase.order}-${sanitizeFileName(phase.name)}.md` : `phase-${phaseId}.md`
    await api.ideWriteFile(dirPath + '/' + fileName, report)
  }

  return report
}

/** 生成项目最终报告 */
export function generateFinalReport(plan: ProjectPlan): string {
  const lines: string[] = []
  lines.push(`# 项目报告: ${plan.goal}`)
  lines.push('')
  lines.push(`> ${plan.overview}`)
  lines.push('')
  lines.push(`## 概览`)
  lines.push('')
  lines.push(`- **技术栈**: ${plan.techStack.join(', ')}`)
  lines.push(`- **状态**: ${plan.status}`)
  lines.push(`- **总进度**: ${plan.progress}%`)
  lines.push(`- **创建时间**: ${new Date(plan.createdAt).toLocaleString('zh-CN')}`)
  lines.push(`- **完成时间**: ${new Date(plan.updatedAt).toLocaleString('zh-CN')}`)
  lines.push('')

  // 各阶段摘要
  lines.push('## 阶段摘要')
  lines.push('')
  for (const phase of plan.phases) {
    const total = phase.tasks.length
    const done = phase.tasks.filter(t => t.status === 'completed').length
    const failed = phase.tasks.filter(t => t.status === 'failed').length
    lines.push(`### 阶段 ${phase.order}: ${phase.name}`)
    lines.push(`- 状态: ${phase.status} | 任务: ${done}/${total} 完成${failed ? ` | ${failed} 失败` : ''}`)
    lines.push('')
  }

  // 关键决策
  const decisions = plan.devLog.filter(e => e.type === 'decision')
  if (decisions.length > 0) {
    lines.push('## 关键决策')
    lines.push('')
    for (const d of decisions) {
      lines.push(`- **${d.title}**: ${d.content}`)
    }
    lines.push('')
  }

  // 错误与问题
  const errors = plan.devLog.filter(e => e.type === 'error')
  if (errors.length > 0) {
    lines.push('## 遇到的问题')
    lines.push('')
    for (const e of errors) {
      lines.push(`- **${e.title}**: ${e.content}`)
    }
    lines.push('')
  }

  // 里程碑
  const milestones = plan.devLog.filter(e => e.type === 'milestone')
  if (milestones.length > 0) {
    lines.push('## 里程碑')
    lines.push('')
    for (const m of milestones) {
      lines.push(`- **${new Date(m.timestamp).toLocaleDateString('zh-CN')}** — ${m.title}: ${m.content}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ========== 工具函数 ==========

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 50)
}
