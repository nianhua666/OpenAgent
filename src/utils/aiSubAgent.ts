/**
 * 子代理引擎 — 管理子代理的生命周期、并行执行、结果收集
 *
 * 核心流程：
 * 主 Agent 识别需要委派的子任务
 *   → spawnAndRunSubAgent() 创建并运行子代理
 *   → 子代理获得独立 Prompt + 可选指定模型
 *   → 子代理独立运行对话循环（复用 streamChat）
 *   → 子代理完成 → 结果返回主 Agent
 *   → aggregateSubAgentResults() 汇总结果
 */

import type {
  SubAgent,
  SubAgentSpawnRequest,
  SubAgentResult,
  SubAgentStatus,
  AIChatMessage,
  AIConfig
} from '@/types'
import { useAIStore } from '@/stores/ai'
import { streamChat } from '@/utils/ai'
import { buildSubAgentPrompt, getSubAgentPreferredCapability } from '@/utils/aiPrompts'

// ==================== 子代理执行控制器 ====================

const subAgentControllers = new Map<string, AbortController>()

export interface SubAgentHooks {
  onStatusChange?: (agentId: string, status: SubAgentStatus) => void
  onProgress?: (agentId: string, content: string) => void
  onComplete?: (agentId: string, result: SubAgentResult) => void
  onError?: (agentId: string, error: string) => void
}

// 单个子代理对话循环最大轮次
const SUB_AGENT_MAX_TURNS = 20

// ==================== 核心 API ====================

/**
 * 创建并立即运行一个子代理
 */
export async function spawnAndRunSubAgent(
  parentSessionId: string,
  request: SubAgentSpawnRequest,
  hooks?: SubAgentHooks
): Promise<SubAgentResult> {
  const aiStore = useAIStore()

  // 在 store 中注册子代理
  const agent = aiStore.spawnSubAgent(parentSessionId, request)

  // 用模板构建 Prompt
  const systemPrompt = request.systemPrompt || buildSubAgentPrompt(
    request.role,
    request.task,
    request.contextFromParent
  )

  agent.systemPrompt = systemPrompt
  aiStore.updateSubAgentStatus(agent.id, 'running')
  hooks?.onStatusChange?.(agent.id, 'running')

  const abortController = new AbortController()
  subAgentControllers.set(agent.id, abortController)

  try {
    const result = await runSubAgentConversation(agent, request, hooks, abortController.signal)
    aiStore.setSubAgentResult(agent.id, result)
    hooks?.onComplete?.(agent.id, result)
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '子代理执行失败'
    const failResult: SubAgentResult = {
      success: false,
      output: errorMessage,
      artifacts: [],
      tokenUsage: { input: 0, output: 0 }
    }
    aiStore.setSubAgentResult(agent.id, failResult)
    hooks?.onError?.(agent.id, errorMessage)
    return failResult
  } finally {
    subAgentControllers.delete(agent.id)
  }
}

/**
 * 并行运行多个子代理
 */
export async function runSubAgentsParallel(
  parentSessionId: string,
  requests: SubAgentSpawnRequest[],
  hooks?: SubAgentHooks
): Promise<SubAgentResult[]> {
  const tasks = requests.map(request =>
    spawnAndRunSubAgent(parentSessionId, request, hooks)
  )
  return Promise.all(tasks)
}

/**
 * 取消指定子代理
 */
export function cancelSubAgent(agentId: string) {
  const controller = subAgentControllers.get(agentId)
  if (controller) {
    controller.abort()
    subAgentControllers.delete(agentId)
  }

  const aiStore = useAIStore()
  aiStore.updateSubAgentStatus(agentId, 'cancelled')
}

/**
 * 取消某个会话下的所有子代理
 */
export function cancelAllSubAgents(parentSessionId: string) {
  const aiStore = useAIStore()
  const agents = aiStore.getSubAgentsForSession(parentSessionId)

  for (const agent of agents) {
    if (agent.status === 'pending' || agent.status === 'running') {
      cancelSubAgent(agent.id)
    }
  }
}

/**
 * 将多个子代理的结果汇总为可注入主 Agent 上下文的文本
 */
export function aggregateSubAgentResults(
  agents: SubAgent[]
): string {
  if (agents.length === 0) return ''

  const sections = agents.map(agent => {
    const statusLabel = agent.status === 'completed' ? '✓ 完成'
      : agent.status === 'failed' ? '✗ 失败'
      : agent.status === 'cancelled' ? '⊘ 已取消'
      : '⟳ 运行中'

    const output = agent.result?.output?.trim() || '无输出'
    const artifacts = agent.result?.artifacts?.length
      ? `\n产出物：${agent.result.artifacts.join('、')}`
      : ''

    return `### 子代理: ${agent.name}（${agent.role}）\n状态：${statusLabel}\n输出：${output}${artifacts}`
  })

  return `## 子代理执行报告\n\n${sections.join('\n\n')}`
}

/**
 * 获取子代理推荐的能力类型（用于模型路由）
 */
export function getAgentCapabilityHint(roleOrTemplateId: string): string {
  return getSubAgentPreferredCapability(roleOrTemplateId)
}

// ==================== 内部实现 ====================

/**
 * 子代理独立对话循环（简化版，不含工具调用）
 * 子代理聚焦于分析 / 生成，不直接操作工具
 */
async function runSubAgentConversation(
  agent: SubAgent,
  request: SubAgentSpawnRequest,
  hooks: SubAgentHooks | undefined,
  signal: AbortSignal
): Promise<SubAgentResult> {
  const aiStore = useAIStore()

  // 构建子代理自己的 AIConfig（可以用不同的模型）
  const subConfig: AIConfig = {
    ...aiStore.config,
    model: agent.model || aiStore.config.model,
    protocol: agent.protocol || aiStore.config.protocol,
    baseUrl: agent.baseUrl || aiStore.config.baseUrl,
    apiKey: agent.apiKey || aiStore.config.apiKey,
    systemPrompt: agent.systemPrompt
  }

  // 初始化子代理消息（system + 任务描述）
  const messages: AIChatMessage[] = [
    {
      id: 'sub-system',
      role: 'system',
      content: agent.systemPrompt,
      timestamp: Date.now()
    },
    {
      id: 'sub-task',
      role: 'user',
      content: request.task,
      timestamp: Date.now()
    }
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let fullOutput = ''
  let turnCount = 0
  const maxTurns = request.maxIterations || SUB_AGENT_MAX_TURNS

  while (!signal.aborted && turnCount < maxTurns) {
    turnCount++

    // 预估输入 token
    const inputEstimate = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) / 3
    totalInputTokens += Math.ceil(inputEstimate)

    const turnResult = await new Promise<{ content: string; error?: string }>((resolve) => {
      let accumulated = ''

      void streamChat(
        subConfig,
        messages,
        {
          onToken(token) {
            accumulated += token
            hooks?.onProgress?.(agent.id, accumulated)
          },
          onReasoning() { /* 子代理忽略推理通道 */ },
          onToolCall() { /* 子代理不直接调用工具 */ },
          onProviderMetadata() {},
          async onDone() {
            resolve({ content: accumulated })
          },
          onError(error) {
            resolve({ content: accumulated, error })
          }
        },
        { thinkingEnabled: false, planningMode: false, autoMemory: false, thinkingLevel: 'off', maxAutoSteps: 0 },
        { includeTools: false },
        signal
      )
    })

    if (turnResult.error) {
      throw new Error(turnResult.error)
    }

    const outputEstimate = Math.ceil((turnResult.content?.length || 0) / 3)
    totalOutputTokens += outputEstimate
    fullOutput = turnResult.content

    // 子代理是单轮对话（不含工具），一轮即结束
    break
  }

  return {
    success: true,
    output: fullOutput,
    artifacts: [],
    tokenUsage: { input: totalInputTokens, output: totalOutputTokens }
  }
}
