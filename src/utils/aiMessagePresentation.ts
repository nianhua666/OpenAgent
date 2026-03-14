import type { AIChatMessage, AITaskStep, AIToolCall } from '@/types'

export type AIActivityTone = 'info' | 'success' | 'warning' | 'danger'

export interface AIActivityDisplay {
  title: string
  summary: string
  details: string
  badges: string[]
  tone: AIActivityTone
}

interface SummarizedTaskStep {
  id: string
  title: string
  status: string
  note: string
}

interface SummarizedTaskSteps {
  count: number
  items: SummarizedTaskStep[]
}

interface SummarizedTaskRecord {
  id: string
  goal: string
  status: string
  summary: string
  iterationCount?: number
  maxIterations?: number
  steps: SummarizedTaskSteps
}

interface SummarizedPlanRecord {
  id: string
  goal: string
  status: string
  progress?: number
  phaseCount: number
  taskCount: number
}

interface SummarizedExecutionRecord {
  readyTasks: number
  blockedTasks: number
  activeTask: null | {
    id: string
    title: string
    status: string
  }
}

const OMITTED_COMPACT_KEYS = new Set([
  'markdown',
  'execution',
  'plan',
  'plans',
  'logs',
  'raw',
  'rawcontent',
  'content',
  'providermetadata',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function compactText(value: string | undefined | null, limit = 180) {
  const normalized = normalizeWhitespace(String(value || ''))
  if (!normalized) {
    return ''
  }

  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(limit - 1, 1))}…`
}

function tryParseJsonText(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function tryParseEscapedJsonText(value: string) {
  const trimmed = value.trim()
  if (!trimmed || !(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null
  }

  const unescaped = trimmed
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\')

  try {
    return JSON.parse(unescaped) as unknown
  } catch {
    return null
  }
}

function parseNestedJsonValue(value: unknown, maxDepth = 3): unknown {
  let current = value

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (typeof current !== 'string') {
      break
    }

    const direct = tryParseJsonText(current)
    if (direct !== null) {
      current = direct
      continue
    }

    const escaped = tryParseEscapedJsonText(current)
    if (escaped !== null) {
      current = escaped
      continue
    }

    break
  }

  return current
}

function pickText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function summarizeTaskSteps(value: unknown): SummarizedTaskSteps {
  const steps = Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((step, index) => ({
          id: typeof step.id === 'string' && step.id.trim() ? step.id.trim() : `step-${index + 1}`,
          title: compactText(typeof step.title === 'string' ? step.title : '', 80),
          status: compactText(typeof step.status === 'string' ? step.status : '', 24),
          note: compactText(typeof step.note === 'string' ? step.note : '', 120),
        }))
        .filter(step => step.title)
    : []

  return {
    count: steps.length,
    items: steps.slice(0, 4),
  }
}

function summarizeTaskRecord(record: Record<string, unknown>): SummarizedTaskRecord {
  return {
    id: compactText(typeof record.id === 'string' ? record.id : '', 48),
    goal: compactText(pickText(record, ['goal', 'objective', 'title', 'task']), 120),
    status: compactText(pickText(record, ['status', 'state']), 24),
    summary: sanitizeTaskSummaryForStorage(pickText(record, ['summary', 'message', 'reason'])),
    iterationCount: typeof record.iterationCount === 'number' ? record.iterationCount : undefined,
    maxIterations: typeof record.maxIterations === 'number' ? record.maxIterations : undefined,
    steps: summarizeTaskSteps(record.steps),
  }
}

function summarizePlanRecord(record: Record<string, unknown>): SummarizedPlanRecord {
  const phases = Array.isArray(record.phases) ? record.phases.filter(isRecord) : []
  const taskCount = phases.reduce((total, phase) => total + (Array.isArray(phase.tasks) ? phase.tasks.length : 0), 0)

  return {
    id: compactText(typeof record.id === 'string' ? record.id : '', 48),
    goal: compactText(pickText(record, ['goal', 'title']), 120),
    status: compactText(pickText(record, ['status', 'state']), 24),
    progress: typeof record.progress === 'number' ? record.progress : undefined,
    phaseCount: phases.length,
    taskCount,
  }
}

function summarizeExecutionRecord(record: Record<string, unknown>): SummarizedExecutionRecord {
  const readyTasks = Array.isArray(record.readyTasks) ? record.readyTasks.filter(isRecord) : []
  const blockedTasks = Array.isArray(record.blockedTasks) ? record.blockedTasks.filter(isRecord) : []
  const activeTask = isRecord(record.activeTask) ? record.activeTask : null

  return {
    readyTasks: readyTasks.length,
    blockedTasks: blockedTasks.length,
    activeTask: activeTask
      ? {
          id: compactText(typeof activeTask.id === 'string' ? activeTask.id : '', 48),
          title: compactText(pickText(activeTask, ['title', 'goal', 'task']), 100),
          status: compactText(pickText(activeTask, ['status', 'state']), 24),
        }
      : null,
  }
}

function compactStructuredValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return compactText(value, depth === 0 ? 220 : 120)
  }

  if (Array.isArray(value)) {
    const sample = value.slice(0, 4).map(item => compactStructuredValue(item, depth + 1))
    return value.length > 4
      ? { count: value.length, sample }
      : sample
  }

  if (!isRecord(value)) {
    return value
  }

  const entries = Object.entries(value)
    .filter(([key]) => !OMITTED_COMPACT_KEYS.has(key.toLowerCase()))
    .slice(0, depth === 0 ? 8 : 5)
    .map(([key, itemValue]) => {
      if (key === 'steps') {
        return [key, summarizeTaskSteps(itemValue)]
      }

      if (key === 'task' && isRecord(itemValue)) {
        return [key, summarizeTaskRecord(itemValue)]
      }

      if (key === 'plan' && isRecord(itemValue)) {
        return [key, summarizePlanRecord(itemValue)]
      }

      if (key === 'execution' && isRecord(itemValue)) {
        return [key, summarizeExecutionRecord(itemValue)]
      }

      return [key, compactStructuredValue(itemValue, depth + 1)]
    })

  return Object.fromEntries(entries)
}

function compactToolResultData(toolName: string, value: unknown) {
  if (!isRecord(value)) {
    return compactStructuredValue(value)
  }

  if (toolName === 'update_task_plan') {
    return value.task && isRecord(value.task)
      ? { task: summarizeTaskRecord(value.task) }
      : compactStructuredValue(value)
  }

  if (toolName === 'ide_update_plan_status' || toolName === 'ide_get_plan' || toolName === 'ide_replan_plan') {
    return {
      plan: value.plan && isRecord(value.plan) ? summarizePlanRecord(value.plan) : undefined,
      execution: value.execution && isRecord(value.execution) ? summarizeExecutionRecord(value.execution) : undefined,
      summary: compactText(typeof value.summary === 'string' ? value.summary : '', 180),
      diff: compactStructuredValue(value.diff),
      createdTasks: Array.isArray(value.createdTasks) ? value.createdTasks.length : undefined,
    }
  }

  if (toolName === 'ide_advance_task') {
    return {
      planId: compactText(typeof value.planId === 'string' ? value.planId : '', 48),
      taskId: compactText(typeof value.taskId === 'string' ? value.taskId : '', 48),
      status: compactText(typeof value.status === 'string' ? value.status : '', 24),
      progress: typeof value.progress === 'number' ? value.progress : undefined,
      execution: value.execution && isRecord(value.execution) ? summarizeExecutionRecord(value.execution) : undefined,
      replan: value.replan && isRecord(value.replan) ? compactStructuredValue(value.replan) : undefined,
    }
  }

  if (toolName === 'ide_get_autonomy_run' || toolName === 'ide_sync_autonomy_run') {
    return {
      planId: compactText(typeof value.planId === 'string' ? value.planId : '', 48),
      execution: value.execution && isRecord(value.execution) ? summarizeExecutionRecord(value.execution) : undefined,
      run: compactStructuredValue(value.run),
    }
  }

  return compactStructuredValue(value)
}

export function sanitizeTaskSummaryForStorage(summary: string): string {
  const normalized = String(summary || '').trim()
  if (!normalized) {
    return ''
  }

  const parsed = parseNestedJsonValue(normalized)
  if (isRecord(parsed)) {
    const nestedSummary = pickText(parsed, ['summary', 'message', 'reason'])
    if (nestedSummary && nestedSummary !== normalized) {
      return compactText(nestedSummary, 220)
    }

    const taskSummary = summarizeTaskRecord(parsed)
    const summaryParts: string[] = [
      taskSummary.goal ? `目标 ${taskSummary.goal}` : '',
      taskSummary.status ? `状态 ${taskSummary.status}` : '',
      taskSummary.steps.count > 0
        ? `步骤 ${taskSummary.steps.items.map((step: SummarizedTaskStep) => `${step.title}${step.status ? `(${step.status})` : ''}`).join('、')}`
        : '',
    ].filter(Boolean)

    if (summaryParts.length > 0) {
      return compactText(summaryParts.join('；'), 220)
    }
  }

  return compactText(normalized, 220)
}

function formatActivityDetails(rawContent: string) {
  const parsed = parseNestedJsonValue(rawContent)
  if (typeof parsed === 'string') {
    return rawContent.trim()
  }

  return JSON.stringify(parsed, null, 2)
}

function formatInlineSummary(value: unknown, limit = 180): string {
  if (typeof value === 'string') {
    return compactText(value, limit)
  }

  if (Array.isArray(value)) {
    return compactText(value.map(item => formatInlineSummary(item, 36)).filter(Boolean).join('、'), limit)
  }

  if (!isRecord(value)) {
    return compactText(String(value ?? ''), limit)
  }

  const parts = Object.entries(value)
    .filter(([, itemValue]) => itemValue !== undefined && itemValue !== null && itemValue !== '')
    .slice(0, 4)
    .map(([key, itemValue]) => `${key}: ${formatInlineSummary(itemValue, 48)}`)

  return compactText(parts.join(' · '), limit)
}

function buildToolActivityDisplay(message: AIChatMessage): AIActivityDisplay {
  const rawContent = typeof message.providerMetadata?.rawContent === 'string'
    ? message.providerMetadata.rawContent
    : message.content
  const parsed = parseNestedJsonValue(rawContent)
  const parsedRecord = isRecord(parsed) ? parsed : null
  const toolName = message.toolName?.trim() || '工具'
  const success = typeof parsedRecord?.success === 'boolean'
    ? parsedRecord.success
    : !/(失败|异常|error)/i.test(rawContent)
  const compactData = parsedRecord && Object.prototype.hasOwnProperty.call(parsedRecord, 'data')
    ? compactToolResultData(toolName, parsedRecord.data)
    : compactStructuredValue(parsed)

  const title = parsedRecord?.message && typeof parsedRecord.message === 'string'
    ? compactText(parsedRecord.message, 60)
    : `${toolName} 已执行`
  const summary = formatInlineSummary(compactData, 220) || compactText(rawContent, 220)
  const details = formatActivityDetails(rawContent)

  return {
    title,
    summary,
    details,
    badges: [toolName, success ? '成功' : '失败'],
    tone: success ? 'success' : 'warning',
  }
}

function buildSystemActivityDisplay(message: AIChatMessage): AIActivityDisplay {
  const review = isRecord(message.providerMetadata?.toolRoundReview)
    ? message.providerMetadata?.toolRoundReview as Record<string, unknown>
    : null

  if (review) {
    const progressed = review.progressed === true
    const decision = compactText(typeof review.decision === 'string' ? review.decision : '', 24)
    const summary = compactText(typeof review.summary === 'string' ? review.summary : message.content, 220)
    const reason = compactText(typeof review.reason === 'string' ? review.reason : '', 240)
    const nextAction = compactText(typeof review.nextAction === 'string' ? review.nextAction : '', 240)

    return {
      title: '工具回合自检',
      summary,
      details: [reason ? `原因：${reason}` : '', nextAction ? `下一步：${nextAction}` : ''].filter(Boolean).join('\n'),
      badges: [progressed ? '已推进' : '未推进', decision || 'review'],
      tone: progressed ? 'success' : (decision === 'replan' || decision === 'pause' ? 'warning' : 'info'),
    }
  }

  const content = message.content.trim()
  return {
    title: '系统记录',
    summary: compactText(content, 220),
    details: content,
    badges: ['系统'],
    tone: 'info',
  }
}

export function getActivityMessageDisplay(message: AIChatMessage): AIActivityDisplay | null {
  if (message.role === 'tool') {
    return buildToolActivityDisplay(message)
  }

  if (message.role === 'system') {
    return buildSystemActivityDisplay(message)
  }

  return null
}

export function getToolCallDisplay(toolCall: AIToolCall): AIActivityDisplay {
  const compactResult = compactToolResultForConversation(toolCall.name, toolCall.result || '')
  const summary = compactText(compactResult.content, 180)
  return {
    title: toolCall.name,
    summary,
    details: compactResult.rawContent ? formatActivityDetails(compactResult.rawContent) : '',
    badges: [toolCall.name],
    tone: toolCall.result && /(失败|异常|error)/i.test(toolCall.result) ? 'warning' : 'info',
  }
}

export function compactToolResultForConversation(toolName: string, rawOutput: string): { content: string; rawContent?: string } {
  const normalized = String(rawOutput || '').trim()
  if (!normalized) {
    return { content: '' }
  }

  const parsed = parseNestedJsonValue(normalized)
  if (!isRecord(parsed)) {
    const compacted = compactText(normalized, 480)
    return compacted !== normalized ? { content: compacted, rawContent: normalized } : { content: compacted }
  }

  const payload: Record<string, unknown> = {}
  if (typeof parsed.success === 'boolean') {
    payload.success = parsed.success
  }

  const message = pickText(parsed, ['message', 'summary', 'title'])
  if (message) {
    payload.message = compactText(message, 180)
  }

  if (Object.prototype.hasOwnProperty.call(parsed, 'data')) {
    payload.data = compactToolResultData(toolName, parsed.data)
  }

  if (Object.keys(payload).length === 0) {
    Object.assign(payload, compactStructuredValue(parsed))
  }

  const compacted = JSON.stringify(payload)
  return compacted !== normalized
    ? { content: compacted, rawContent: normalized }
    : { content: compacted }
}
