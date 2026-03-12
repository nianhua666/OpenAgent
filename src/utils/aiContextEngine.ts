/**
 * 智能上下文引擎 — 增量摘要、语义优先级、跨 Agent 上下文共享
 *
 * 改进点（相对原有 ensureContextWithinLimit）：
 * 1. 增量快照 — 每 N 轮主动生成快照，而非只在 82% 时才压缩
 * 2. 语义优先级 — 标记关键消息（决策、代码块、错误）避免被压缩丢弃
 * 3. 跨 Agent 上下文总线 — 主/子 Agent 共享关键事实和目标
 * 4. 滑动窗口 — 保留最近 K 条完整消息 + 历史摘要
 *
 * 说明：本模块不替换现有 aiConversation.ts 的压缩逻辑，
 * 而是提供增量快照能力供新 Agent 模式使用。
 * 现有压缩流程保持不变，Phase 4 集成时再由工具层桥接。
 */

import type {
  AIChatMessage,
  ContextSnapshot,
  ContextPriority,
  AIMemoryEntry
} from '@/types'
import { useAIStore } from '@/stores/ai'
import { estimateMessageTokens, estimateTextTokens } from '@/utils/ai'

// ==================== 配置常量 ====================

// 增量快照触发间隔（每 N 条消息生成一次快照）
const INCREMENTAL_SNAPSHOT_INTERVAL = 10

// 滑动窗口保留最近 K 条完整消息
const SLIDING_WINDOW_SIZE = 16

// 快照中关键事实的最大条数
const MAX_KEY_FACTS = 20

// 快照中活跃目标的最大条数
const MAX_ACTIVE_GOALS = 5

// ==================== 语义优先级 ====================

// 高优先级消息匹配模式
const HIGH_PRIORITY_PATTERNS: Array<{ pattern: RegExp; reason: string; boost: number }> = [
  { pattern: /```[\s\S]{50,}```/m, reason: '包含代码块', boost: 0.3 },
  { pattern: /错误|error|bug|异常|exception|失败|fail|crash/i, reason: '错误信息', boost: 0.35 },
  { pattern: /决定|决策|选择|采用|方案|plan|决议/i, reason: '关键决策', boost: 0.25 },
  { pattern: /TODO|FIXME|HACK|BUG|WARNING|注意|重要/i, reason: '标记信息', boost: 0.2 },
  { pattern: /创建了|修改了|删除了|重构了|迁移了|部署了/i, reason: '变更记录', boost: 0.2 },
  { pattern: /记住|牢记|偏好|规则|约定|规范|convention/i, reason: '长期规则', boost: 0.3 },
]

// 低优先级消息匹配模式
const LOW_PRIORITY_PATTERNS: Array<{ pattern: RegExp; penalty: number }> = [
  { pattern: /^(好的|了解|谢谢|ok|sure|thanks|明白|收到)[\s!！.。]*$/i, penalty: 0.3 },
  { pattern: /^(你好|嗨|hello|hi)[\s!！.。]*$/i, penalty: 0.25 },
]

/**
 * 评估单条消息的语义优先级
 */
export function evaluateMessagePriority(
  message: AIChatMessage,
  currentGoal?: string
): ContextPriority {
  let score = 0.5 // 基准分
  const reasons: string[] = []

  // 角色基础权重
  if (message.role === 'system') {
    score = 0.9
    reasons.push('系统消息')
  } else if (message.role === 'tool') {
    score = 0.6
    reasons.push('工具结果')
  }

  const content = message.content || ''

  // 高优先级模式检测
  for (const { pattern, reason, boost } of HIGH_PRIORITY_PATTERNS) {
    if (pattern.test(content)) {
      score = Math.min(score + boost, 1.0)
      reasons.push(reason)
    }
  }

  // 低优先级模式检测
  for (const { pattern, penalty } of LOW_PRIORITY_PATTERNS) {
    if (pattern.test(content)) {
      score = Math.max(score - penalty, 0.05)
      reasons.push('低信息量')
    }
  }

  // 包含附件的消息更重要
  if (message.attachments && message.attachments.length > 0) {
    score = Math.min(score + 0.15, 1.0)
    reasons.push('含附件')
  }

  // 包含工具调用的消息更重要
  if (message.toolCalls && message.toolCalls.length > 0) {
    score = Math.min(score + 0.2, 1.0)
    reasons.push('含工具调用')
  }

  // 与当前目标相关的加分
  if (currentGoal && content.length > 0) {
    const goalKeywords = currentGoal.split(/[\s,，、;；]+/).filter(w => w.length >= 2)
    const matchCount = goalKeywords.filter(kw => content.includes(kw)).length
    if (matchCount > 0) {
      score = Math.min(score + matchCount * 0.08, 1.0)
      reasons.push('与当前目标相关')
    }
  }

  return {
    messageId: message.id,
    score: Math.round(score * 100) / 100,
    reason: reasons.join('、') || '常规消息'
  }
}

// ==================== 增量快照 ====================

/**
 * 判断是否应该生成增量快照
 */
export function shouldCreateSnapshot(
  sessionId: string,
  messageCount: number
): boolean {
  const aiStore = useAIStore()
  const latest = aiStore.getLatestContextSnapshot(sessionId)

  if (!latest) {
    // 从未创建过快照，消息数量达到阈值时创建
    return messageCount >= INCREMENTAL_SNAPSHOT_INTERVAL
  }

  // 距离上次快照新增了足够多的消息
  const session = aiStore.getSessionById(sessionId)
  if (!session) return false

  const messagesSinceSnapshot = session.messages.filter(
    msg => msg.timestamp > latest.createdAt
  ).length

  return messagesSinceSnapshot >= INCREMENTAL_SNAPSHOT_INTERVAL
}

/**
 * 从消息历史中提取关键事实
 */
export function extractKeyFacts(messages: AIChatMessage[]): string[] {
  const facts: string[] = []

  for (const msg of messages) {
    const content = msg.content || ''
    if (!content.trim()) continue

    // 提取包含关键模式的语句
    for (const { pattern, reason } of HIGH_PRIORITY_PATTERNS) {
      if (pattern.test(content) && content.length < 500) {
        const truncated = content.length > 200
          ? content.slice(0, 200) + '...'
          : content
        facts.push(`[${reason}] ${truncated}`)
        break
      }
    }
  }

  return facts.slice(-MAX_KEY_FACTS)
}

/**
 * 从消息历史中提取当前活跃目标
 */
export function extractActiveGoals(messages: AIChatMessage[]): string[] {
  const goals: string[] = []

  // 从用户消息中提取目标
  const userMessages = messages.filter(m => m.role === 'user' && m.content.trim())
  const recentUserMessages = userMessages.slice(-5)

  for (const msg of recentUserMessages) {
    const content = msg.content.trim()
    if (content.length > 10 && content.length < 200) {
      goals.push(content)
    } else if (content.length >= 200) {
      goals.push(content.slice(0, 100) + '...')
    }
  }

  return goals.slice(-MAX_ACTIVE_GOALS)
}

/**
 * 创建增量上下文快照（纯本地分析，不调用 LLM）
 */
export function createLocalContextSnapshot(
  sessionId: string,
  messages: AIChatMessage[]
): ContextSnapshot {
  const aiStore = useAIStore()
  const latest = aiStore.getLatestContextSnapshot(sessionId)

  // 增量：只处理新消息
  const newMessages = latest
    ? messages.filter(m => m.timestamp > latest.createdAt)
    : messages

  const keyFacts = extractKeyFacts(newMessages)
  const activeGoals = extractActiveGoals(messages)
  const summary = buildIncrementalSummary(latest?.summary, newMessages)
  const tokenCount = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)

  const snapshot = aiStore.saveContextSnapshot({
    sessionId,
    summary,
    keyFacts: latest
      ? [...(latest.keyFacts || []).slice(-10), ...keyFacts].slice(-MAX_KEY_FACTS)
      : keyFacts,
    activeGoals,
    tokenCount
  })

  return snapshot
}

// ==================== 智能上下文装配 ====================

/**
 * 智能上下文装配（增强版 buildContextMessages）
 * 保留高优先级消息 + 最近 K 条 + 历史摘要
 */
export function assembleContext(
  sessionMessages: AIChatMessage[],
  snapshot: ContextSnapshot | null,
  memories: AIMemoryEntry[],
  systemPrompt: string,
  tokenBudget: number
): AIChatMessage[] {
  const systemMessage: AIChatMessage = {
    id: 'system',
    role: 'system',
    content: systemPrompt,
    timestamp: 0
  }

  const result: AIChatMessage[] = [systemMessage]
  let usedTokens = estimateMessageTokens(systemMessage)

  // 注入摘要上下文（如果有快照）
  if (snapshot?.summary) {
    const summaryMessage: AIChatMessage = {
      id: 'context-snapshot',
      role: 'system',
      content: `## 历史上下文摘要\n${snapshot.summary}\n\n### 关键事实\n${(snapshot.keyFacts || []).map(f => `- ${f}`).join('\n')}\n\n### 当前目标\n${(snapshot.activeGoals || []).map(g => `- ${g}`).join('\n')}`,
      timestamp: 0
    }
    const snapshotTokens = estimateMessageTokens(summaryMessage)
    if (usedTokens + snapshotTokens < tokenBudget * 0.3) {
      result.push(summaryMessage)
      usedTokens += snapshotTokens
    }
  }

  // 评估所有消息优先级
  const currentGoal = snapshot?.activeGoals?.[snapshot.activeGoals.length - 1]
  const prioritized = sessionMessages.map(msg => ({
    message: msg,
    priority: evaluateMessagePriority(msg, currentGoal)
  }))

  // 滑动窗口：最近 K 条必须保留
  const recentMessages = sessionMessages.slice(-SLIDING_WINDOW_SIZE)
  const recentIds = new Set(recentMessages.map(m => m.id))

  // 高优先级历史消息（不在滑动窗口内的）
  const highPriorityOlder = prioritized
    .filter(p => !recentIds.has(p.message.id) && p.priority.score >= 0.7)
    .sort((a, b) => b.priority.score - a.priority.score)

  // 先装高优先级老消息
  for (const { message } of highPriorityOlder) {
    const tokens = estimateMessageTokens(message)
    if (usedTokens + tokens > tokenBudget * 0.6) break
    result.push(message)
    usedTokens += tokens
  }

  // 再装最近消息（从旧到新，遇到预算上限截断）
  const selectedRecent: AIChatMessage[] = []
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i]
    const tokens = estimateMessageTokens(msg)
    if (selectedRecent.length > 0 && usedTokens + tokens > tokenBudget) break
    selectedRecent.unshift(msg)
    usedTokens += tokens
  }
  result.push(...selectedRecent)

  return result
}

// ==================== 跨 Agent 上下文总线 ====================

/**
 * 从主 Agent 上下文生成跨 Agent 共享摘要
 */
export function buildSharedContext(
  sessionId: string
): string {
  const aiStore = useAIStore()
  const snapshot = aiStore.getLatestContextSnapshot(sessionId)
  const task = aiStore.getLatestTaskForSession(sessionId)

  const sections: string[] = []

  if (task) {
    sections.push(`当前任务：${task.goal}`)
    sections.push(`任务状态：${task.status}，进度 ${task.iterationCount} 轮`)
    if (task.summary) sections.push(`任务摘要：${task.summary}`)
  }

  if (snapshot) {
    if (snapshot.activeGoals.length > 0) {
      sections.push(`活跃目标：\n${snapshot.activeGoals.map(g => `- ${g}`).join('\n')}`)
    }
    if (snapshot.keyFacts.length > 0) {
      sections.push(`关键事实：\n${snapshot.keyFacts.slice(-8).map(f => `- ${f}`).join('\n')}`)
    }
  }

  return sections.join('\n\n')
}

// ==================== 内部工具 ====================

/**
 * 纯本地增量摘要（不调用 LLM，基于文本截取）
 */
function buildIncrementalSummary(
  previousSummary: string | undefined,
  newMessages: AIChatMessage[]
): string {
  const newContent = newMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const role = m.role === 'user' ? '用户' : 'AI'
      const text = (m.content || '').trim()
      return text ? `${role}: ${text.slice(0, 150)}` : ''
    })
    .filter(Boolean)
    .slice(-8)
    .join('\n')

  if (!previousSummary) {
    return newContent || '（暂无历史上下文）'
  }

  // 增量追加，控制总长度
  const combined = `${previousSummary}\n---\n${newContent}`
  if (estimateTextTokens(combined) > 2000) {
    // 截取后半部分保留新信息
    const lines = combined.split('\n')
    const kept = lines.slice(-30).join('\n')
    return kept
  }

  return combined
}
