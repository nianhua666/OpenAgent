/**
 * 模型路由器 — Agent 自主选择最适合当前任务的模型
 *
 * 决策流程：
 * 1. 分析任务需要的能力（vision / thinking / toolUse / 大上下文）
 * 2. 从可用模型列表中筛选满足能力要求的候选
 * 3. 按优先级策略排序（质量 > 速度 > 成本）
 * 4. 返回决策及理由
 */

import type { AIProviderModel, AIProtocol, AIModelCapabilities, ModelRouterDecision } from '@/types'
import { inferModelCapabilities, inferModelLimits } from '@/utils/ai'

// ==================== 任务特征分析 ====================

type TaskCapabilityHint = 'thinking' | 'fast-coding' | 'vision' | 'large-context' | 'general'

/**
 * 能力需求权重：数值越高表示越匹配该模型能力方向
 */
interface CapabilityDemand {
  thinking: number    // 深度推理需求 0-1
  speed: number       // 生成速度需求 0-1
  vision: number      // 视觉能力需求 0-1
  context: number     // 大上下文需求 0-1
  toolUse: number     // 工具调用需求 0-1
}

// 常见任务关键词 → 能力倾向映射
const TASK_HINT_PATTERNS: Array<{ pattern: RegExp; demand: Partial<CapabilityDemand> }> = [
  // 深度推理类
  { pattern: /架构|设计|分析|审查|review|refactor|重构|debug|调试|根因|安全|漏洞/i, demand: { thinking: 0.9 } },
  // 大量代码生成
  { pattern: /生成|创建|编写|实现|开发|代码|组件|页面|模块|API|接口|implement|create|build/i, demand: { speed: 0.8, toolUse: 0.7 } },
  // 视觉类
  { pattern: /图片|截图|screenshot|图像|视觉|UI|界面|布局|样式|image|photo/i, demand: { vision: 0.95 } },
  // 大上下文
  { pattern: /全局|整体|大文件|整个项目|所有文件|全部代码|codebase|全量/i, demand: { context: 0.8 } },
  // 测试
  { pattern: /测试|test|验证|检查|覆盖率|coverage/i, demand: { speed: 0.6, thinking: 0.4 } },
  // 文档
  { pattern: /文档|readme|changelog|注释|说明|documentation/i, demand: { speed: 0.7 } },
]

const DEFAULT_DEMAND: CapabilityDemand = { thinking: 0.3, speed: 0.5, vision: 0, context: 0.3, toolUse: 0.5 }

/**
 * 从任务描述推断能力需求
 */
function analyzeTaskDemand(task: string): CapabilityDemand {
  const demand = { ...DEFAULT_DEMAND }

  for (const { pattern, demand: hint } of TASK_HINT_PATTERNS) {
    if (pattern.test(task)) {
      for (const [key, value] of Object.entries(hint)) {
        const demandKey = key as keyof CapabilityDemand
        demand[demandKey] = Math.max(demand[demandKey], value)
      }
    }
  }

  return demand
}

// ==================== 模型评分 ====================

// 已知高能力模型列表（用于排序加权）
const HIGH_CAPABILITY_PATTERNS = [
  /claude-4|claude-3-7|sonnet-4|opus/i,
  /gpt-4o(?!-mini)|gpt-4\.1|gpt-5|o3|o1/i,
  /gemini-2\.5-pro|gemini-pro/i,
  /deepseek-r1|qwen3/i,
]

const FAST_MODEL_PATTERNS = [
  /gpt-4o-mini|gpt-4\.1-mini|gpt-4\.1-nano/i,
  /claude-3-5-haiku|haiku/i,
  /gemini-2\.0-flash|gemini-flash/i,
  /qwen2\.5|qwen-turbo/i,
]

function isHighCapabilityModel(modelId: string) {
  return HIGH_CAPABILITY_PATTERNS.some(p => p.test(modelId))
}

function isFastModel(modelId: string) {
  return FAST_MODEL_PATTERNS.some(p => p.test(modelId))
}

/**
 * 为候选模型计算综合得分
 */
function scoreModel(
  model: AIProviderModel,
  demand: CapabilityDemand,
  protocol: AIProtocol
): number {
  const caps = model.capabilities || inferModelCapabilities(model.id, protocol)
  const limits = model.limits || inferModelLimits(model.id, protocol)

  let score = 50 // 基准分

  // 能力匹配度加分
  if (demand.vision > 0.5 && caps.vision) score += 20
  if (demand.vision > 0.5 && !caps.vision) score -= 40 // 需要视觉但不支持，严重减分
  if (demand.thinking > 0.6 && caps.thinking) score += 15
  if (demand.toolUse > 0.5 && caps.toolUse) score += 10
  if (demand.toolUse > 0.5 && !caps.toolUse) score -= 30

  // 上下文容量加分
  if (demand.context > 0.5 && limits.maxContextTokens >= 200000) score += 15
  else if (demand.context > 0.5 && limits.maxContextTokens >= 128000) score += 8

  // 速度优先时偏好快模型
  if (demand.speed > 0.7 && isFastModel(model.id)) score += 15
  // 推理优先时偏好高能力模型
  if (demand.thinking > 0.7 && isHighCapabilityModel(model.id)) score += 15

  // 通用加权：高能力模型基线更高
  if (isHighCapabilityModel(model.id)) score += 5

  return score
}

// ==================== 公开 API ====================

export interface ModelRoutingPreferences {
  preferSpeed?: boolean
  preferQuality?: boolean
  preferCost?: boolean
  requiredCapabilities?: Array<keyof AIModelCapabilities>
}

/**
 * 基于任务描述从可用模型列表中选择最优模型
 */
export function routeModel(
  task: string,
  availableModels: AIProviderModel[],
  currentProtocol: AIProtocol,
  preferences?: ModelRoutingPreferences
): ModelRouterDecision | null {
  if (availableModels.length === 0) return null

  const demand = analyzeTaskDemand(task)

  // 应用用户偏好覆盖
  if (preferences?.preferSpeed) demand.speed = Math.max(demand.speed, 0.8)
  if (preferences?.preferQuality) demand.thinking = Math.max(demand.thinking, 0.8)

  // 必需能力硬过滤
  let candidates = [...availableModels]
  if (preferences?.requiredCapabilities?.length) {
    candidates = candidates.filter(model => {
      const caps = model.capabilities || inferModelCapabilities(model.id, currentProtocol)
      return preferences.requiredCapabilities!.every(cap => caps[cap])
    })
  }

  // 视觉需求硬过滤
  if (demand.vision > 0.5) {
    const visionModels = candidates.filter(model => {
      const caps = model.capabilities || inferModelCapabilities(model.id, currentProtocol)
      return caps.vision
    })
    if (visionModels.length > 0) candidates = visionModels
  }

  if (candidates.length === 0) candidates = [...availableModels]

  // 评分排序
  const scored = candidates
    .map(model => ({ model, score: scoreModel(model, demand, currentProtocol) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const caps = best.model.capabilities || inferModelCapabilities(best.model.id, currentProtocol)
  const neededCaps: string[] = []
  if (demand.vision > 0.5) neededCaps.push('vision')
  if (demand.thinking > 0.6) neededCaps.push('thinking')
  if (demand.toolUse > 0.5) neededCaps.push('toolUse')
  if (demand.context > 0.5) neededCaps.push('large-context')

  return {
    model: best.model.id,
    protocol: currentProtocol,
    baseUrl: '',
    apiKey: '',
    reason: buildRoutingReason(best.model, demand, caps),
    capabilities: neededCaps
  }
}

/**
 * 为子代理角色推荐模型
 */
export function recommendSubAgentModel(
  role: string,
  task: string,
  availableModels: AIProviderModel[],
  currentProtocol: AIProtocol
): ModelRouterDecision | null {
  // 将角色描述和任务描述合并分析
  const combinedTask = `${role}: ${task}`
  return routeModel(combinedTask, availableModels, currentProtocol)
}

/**
 * 从 Prompt 模板的 preferredCapability hint 转换为能力需求
 */
export function capabilityHintToDemand(hint: TaskCapabilityHint): Partial<CapabilityDemand> {
  switch (hint) {
    case 'thinking': return { thinking: 0.9 }
    case 'fast-coding': return { speed: 0.85, toolUse: 0.7 }
    case 'vision': return { vision: 0.95 }
    case 'large-context': return { context: 0.9 }
    default: return {}
  }
}

// ==================== 内部工具 ====================

function buildRoutingReason(
  model: AIProviderModel,
  demand: CapabilityDemand,
  caps: AIModelCapabilities
): string {
  const reasons: string[] = []

  if (demand.vision > 0.5 && caps.vision) reasons.push('支持视觉理解')
  if (demand.thinking > 0.6 && caps.thinking) reasons.push('支持深度推理')
  if (demand.speed > 0.7 && isFastModel(model.id)) reasons.push('高速生成')
  if (demand.thinking > 0.7 && isHighCapabilityModel(model.id)) reasons.push('高能力模型')

  if (reasons.length === 0) reasons.push('综合评分最优')

  return `选择 ${model.name || model.id}：${reasons.join('、')}`
}
