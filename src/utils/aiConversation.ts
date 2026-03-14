import type { AIChatAttachment, AIChatPreferences, AIToolCall, AIChatMessage, AIChatSession, AITaskStep } from '@/types'
import { useAIStore } from '@/stores/ai'
import { chatCompletion, splitEmbeddedReasoningContent, streamChat } from '@/utils/ai'
import { executeToolCall } from '@/utils/aiTools'
import { genId } from '@/utils/helpers'
import { shouldCreateSnapshot, createLocalContextSnapshot } from '@/utils/aiContextEngine'
import { flushPlanToWorkspace } from '@/utils/aiPlanEngine'
import { compactToolResultForConversation } from '@/utils/aiMessagePresentation'

export interface AIConversationHooks {
  onStream: (content: string) => void
  onAfterUpdate?: () => void | Promise<void>
  onError?: (message: string) => void
}

const MAX_ATTACHMENT_COUNT = 8
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024
const TEXT_FILE_PREVIEW_LIMIT = 24000
const CONTEXT_COMPRESSION_TRIGGER_RATIO = 0.82
const MAX_IDENTICAL_TOOL_EXECUTIONS = 2
const AUTO_TASK_STEP_PREFIX = 'auto-step-'

type ToolRoundReviewDecision = 'continue' | 'replan' | 'pause' | 'complete'

interface ToolRoundReview {
  progressed: boolean
  decision: ToolRoundReviewDecision
  summary: string
  reason: string
  nextAction: string
}

const activeControllers = new Map<string, AbortController>()
const compressionLocks = new Set<string>()

const TEXT_FILE_PATTERN = /\.(txt|md|markdown|csv|json|log|yaml|yml|xml|html|htm|js|ts|tsx|jsx|vue|scss|sass|css|ini|cfg)$/i

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function isTextLikeFile(file: File) {
  return file.type.startsWith('text/')
    || /(json|xml|javascript|typescript)/i.test(file.type)
    || TEXT_FILE_PATTERN.test(file.name)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`文件 ${file.name} 读取失败`))
    reader.readAsText(file, 'utf-8')
  })
}

function loadImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.width, height: image.height })
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

const ASSISTANT_MARKDOWN_IMAGE_PATTERN = /(?:!\[([^\]]*)\]|\[([^\]]*)\])\s*\(\s*(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\s*\)/gi
const ASSISTANT_RAW_DATA_URL_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi

function normalizeImageDataUrl(dataUrl: string) {
  const [meta, base64 = ''] = String(dataUrl || '').split(',', 2)
  return `${meta},${base64.replace(/\s+/g, '')}`
}

function getImageExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/jpeg') {
    return 'jpg'
  }

  if (normalized === 'image/svg+xml') {
    return 'svg'
  }

  return normalized.replace(/^image\//, '').replace(/[^a-z0-9.+-]+/g, '') || 'png'
}

function buildAssistantAttachmentName(mimeType: string, label: string, index: number) {
  const normalizedLabel = label
    .trim()
    .replace(/^!+/, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalizedLabel || `agent-image-${index + 1}`}.${getImageExtensionFromMimeType(mimeType)}`
}

async function createAssistantImageAttachment(dataUrl: string, label: string, index: number): Promise<AIChatAttachment> {
  const normalizedDataUrl = normalizeImageDataUrl(dataUrl)
  const mimeMatch = normalizedDataUrl.match(/^data:([^;]+);base64,/i)
  const mimeType = mimeMatch?.[1] || 'image/png'
  const base64Payload = normalizedDataUrl.split(',', 2)[1] || ''
  const dimensions = await loadImageDimensions(normalizedDataUrl)

  return {
    id: genId(),
    type: 'image',
    name: buildAssistantAttachmentName(mimeType, label, index),
    mimeType,
    dataUrl: normalizedDataUrl,
    source: 'assistant',
    width: dimensions?.width,
    height: dimensions?.height,
    size: Math.floor((base64Payload.length * 3) / 4)
  }
}

function extractGeminiInlineImageDataUrls(providerMetadata: Record<string, unknown> | undefined) {
  const parts = Array.isArray(providerMetadata?.geminiParts)
    ? providerMetadata.geminiParts
    : []

  return parts
    .filter((part): part is { inlineData?: { mimeType?: string; data?: string } } => Boolean(part) && typeof part === 'object')
    .map(part => {
      const mimeType = typeof part.inlineData?.mimeType === 'string' ? part.inlineData.mimeType.trim() : ''
      const data = typeof part.inlineData?.data === 'string' ? part.inlineData.data.replace(/\s+/g, '') : ''
      if (!mimeType || !data || !/^image\//i.test(mimeType)) {
        return ''
      }

      return `data:${mimeType};base64,${data}`
    })
    .filter(Boolean)
}

function sanitizeAssistantProviderMetadata(providerMetadata: Record<string, unknown> | undefined) {
  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return undefined
  }

  const sanitizedGeminiParts = Array.isArray(providerMetadata.geminiParts)
    ? providerMetadata.geminiParts
        .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === 'object')
        .map(part => {
          const nextPart = { ...part }
          delete nextPart.inlineData
          return nextPart
        })
        .filter(part => Object.keys(part).length > 0)
    : []

  if (sanitizedGeminiParts.length === 0) {
    return undefined
  }

  return {
    ...providerMetadata,
    geminiParts: sanitizedGeminiParts
  }
}

async function normalizeAssistantMessageOutput(content: string, providerMetadata?: Record<string, unknown>) {
  const attachments: AIChatAttachment[] = []
  const seenDataUrls = new Set<string>()
  let cleanedContent = content

  const pushAttachment = async (dataUrl: string, label: string) => {
    const normalizedDataUrl = normalizeImageDataUrl(dataUrl)
    if (seenDataUrls.has(normalizedDataUrl)) {
      return
    }

    seenDataUrls.add(normalizedDataUrl)
    attachments.push(await createAssistantImageAttachment(normalizedDataUrl, label, attachments.length))
  }

  for (const dataUrl of extractGeminiInlineImageDataUrls(providerMetadata)) {
    await pushAttachment(dataUrl, 'Gemini 图片')
  }

  const markdownMatches: Array<{ raw: string; dataUrl: string; label: string }> = []
  ASSISTANT_MARKDOWN_IMAGE_PATTERN.lastIndex = 0
  let markdownMatch = ASSISTANT_MARKDOWN_IMAGE_PATTERN.exec(content)
  while (markdownMatch) {
    markdownMatches.push({
      raw: markdownMatch[0],
      label: String(markdownMatch[1] || markdownMatch[2] || 'AI 图片').trim(),
      dataUrl: markdownMatch[3]
    })
    markdownMatch = ASSISTANT_MARKDOWN_IMAGE_PATTERN.exec(content)
  }

  for (const match of markdownMatches) {
    await pushAttachment(match.dataUrl, match.label)
    cleanedContent = cleanedContent.replace(match.raw, '')
  }

  const rawMatches: Array<{ raw: string }> = []
  ASSISTANT_RAW_DATA_URL_PATTERN.lastIndex = 0
  let rawMatch = ASSISTANT_RAW_DATA_URL_PATTERN.exec(cleanedContent)
  while (rawMatch) {
    rawMatches.push({ raw: rawMatch[0] })
    rawMatch = ASSISTANT_RAW_DATA_URL_PATTERN.exec(cleanedContent)
  }

  for (const match of rawMatches) {
    await pushAttachment(match.raw, 'AI 图片')
    cleanedContent = cleanedContent.replace(match.raw, '')
  }

  cleanedContent = cleanedContent
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  return {
    content: cleanedContent,
    attachments,
    providerMetadata: sanitizeAssistantProviderMetadata(providerMetadata)
  }
}

function toAttachmentName(file: File) {
  return file.name || `未命名文件-${Date.now()}`
}

export async function createImageAttachmentFromFile(file: File): Promise<AIChatAttachment> {
  if (!isImageFile(file)) {
    throw new Error('仅支持发送图片文件')
  }

  const dataUrl = await readFileAsDataUrl(file)
  const dimensions = await loadImageDimensions(dataUrl)

  return {
    id: genId(),
    type: 'image',
    name: toAttachmentName(file),
    mimeType: file.type || 'image/png',
    dataUrl,
    source: 'user',
    width: dimensions?.width,
    height: dimensions?.height,
    size: file.size
  }
}

export async function createAttachmentFromFile(file: File): Promise<AIChatAttachment> {
  if (isImageFile(file)) {
    return createImageAttachmentFromFile(file)
  }

  if (isTextLikeFile(file)) {
    const rawText = await readFileAsText(file)
    return {
      id: genId(),
      type: 'file',
      name: toAttachmentName(file),
      mimeType: file.type || 'text/plain',
      source: 'user',
      size: file.size,
      textContent: rawText.slice(0, TEXT_FILE_PREVIEW_LIMIT),
      truncated: rawText.length > TEXT_FILE_PREVIEW_LIMIT
    }
  }

  return {
    id: genId(),
    type: 'file',
    name: toAttachmentName(file),
    mimeType: file.type || 'application/octet-stream',
    source: 'user',
    size: file.size,
    textContent: file.size > MAX_TEXT_FILE_BYTES
      ? '该文件过大，当前仅保留文件名、类型和大小元数据。'
      : '当前文件为二进制格式，暂不直接解析内容，仅保留元数据供模型参考。'
  }
}

export async function createAttachmentsFromFiles(files: File[]) {
  return Promise.all(files.slice(0, MAX_ATTACHMENT_COUNT).map(file => createAttachmentFromFile(file)))
}

async function notifyUpdate(hooks: AIConversationHooks) {
  await hooks.onAfterUpdate?.()
}

function buildVisionFollowUpPrompt(toolCall: AIToolCall) {
  return `以下是工具 ${toolCall.name} 生成的最新图像结果。请直接分析图像中的可见内容、文本、界面状态和变化，并继续完成当前任务；除非图像附件缺失或损坏，不要笼统回答“无法解析图像”。`
}

function toToolFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : '工具执行失败'
}

function buildAutoTaskStep(index: number, title: string, status: AITaskStep['status'], note?: string): AITaskStep {
  return {
    id: `${AUTO_TASK_STEP_PREFIX}${index + 1}`,
    title,
    status,
    note
  }
}

function buildBootstrapTaskSteps(goal: string, attachments: AIChatAttachment[]) {
  const normalizedGoal = goal.replace(/\s+/g, '').toLowerCase()

  if (attachments.length > 0) {
    return [
      buildAutoTaskStep(0, '分析附件与目标', 'in_progress', '先读取图片或文件内容，确认任务边界与可执行信息'),
      buildAutoTaskStep(1, '整理关键信息', 'pending', '把附件中的文本、字段、界面元素或业务约束整理成结构化输入'),
      buildAutoTaskStep(2, '执行核心操作', 'pending', '调用合适工具推进任务，不做无依据的猜测'),
      buildAutoTaskStep(3, '验证结果并总结', 'pending', '回看工具结果或截图，确认任务是否真正完成')
    ]
  }

  if (/(浏览器|微信|qq|窗口|桌面|点击|输入|搜索|打开|聚焦|截图|read_screen|mouse_click|keyboard_input)/i.test(normalizedGoal)) {
    return [
      buildAutoTaskStep(0, '确认目标窗口与当前界面', 'in_progress', '先识别目标软件、前台窗口与当前页面，避免误操作'),
      buildAutoTaskStep(1, '执行桌面操作', 'pending', '按先验证后操作的顺序调用聚焦、点击、输入等工具'),
      buildAutoTaskStep(2, '复核界面变化', 'pending', '对界面跳转、搜索结果或输入状态做二次确认'),
      buildAutoTaskStep(3, '汇总结论或等待确认', 'pending', '明确已完成内容、剩余阻塞点与下一步')
    ]
  }

  if (/(导入|导出|账号|批量|字段|类型|数据整理|excel|表格)/i.test(normalizedGoal)) {
    return [
      buildAutoTaskStep(0, '识别数据结构与目标类型', 'in_progress', '先确认字段、账号类型、分隔规则与业务要求'),
      buildAutoTaskStep(1, '形成执行方案', 'pending', '明确要查询、创建、导入或导出的目标对象与范围'),
      buildAutoTaskStep(2, '执行数据操作', 'pending', '在拿到足够结构化信息后再调用对应工具'),
      buildAutoTaskStep(3, '核验结果并输出摘要', 'pending', '确认条数、目标类型和执行结果是否一致')
    ]
  }

  return [
    buildAutoTaskStep(0, '理解目标与约束', 'in_progress', '先明确用户真实目标、可用工具与限制条件'),
    buildAutoTaskStep(1, '拆分执行步骤', 'pending', '把任务拆成可验证、可推进的几个阶段'),
    buildAutoTaskStep(2, '执行并观察结果', 'pending', '优先推进最关键的一步，再根据结果调整策略'),
    buildAutoTaskStep(3, '整理结论与下一步', 'pending', '给出当前完成度、证据和后续建议')
  ]
}

function extractJsonObject(content: string) {
  const normalized = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const firstBrace = normalized.indexOf('{')
  const lastBrace = normalized.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1)
  }

  return normalized
}

function normalizeToolRoundDecision(value: unknown): ToolRoundReviewDecision {
  if (value === 'continue' || value === 'replan' || value === 'pause' || value === 'complete') {
    return value
  }

  return 'replan'
}

function truncateReviewText(value: string | undefined, limit = 1200) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit)}...`
}

function isToolCallFailure(toolCall: AIToolCall) {
  const result = String(toolCall.result || '').trim()
  if (!result) {
    return false
  }

  if (/^工具执行异常:/i.test(result) || /^抱歉，发生了错误:/i.test(result) || /"success"\s*:\s*false/i.test(result)) {
    return true
  }

  const parsedResult = tryParseJsonValue(result)
  if (parsedResult && typeof parsedResult === 'object' && !Array.isArray(parsedResult)) {
    const record = parsedResult as Record<string, unknown>
    if (record.success === false) {
      return true
    }
  }

  return /^(error|failed|failure|exception)[:\s]/i.test(result)
    || /\b(access denied|permission denied|timed out|timeout|not found|not supported)\b/i.test(result)
}

function isReadOnlyDiscoveryTool(toolCall: AIToolCall) {
  const normalizedName = toolCall.name.trim().toLowerCase()
  if (!normalizedName) {
    return false
  }

  if (/(delete|remove|kill|stop|apply|patch|write|create|insert|rename|move|click|type|press|drag|upload|execute|run|build|launch|start)/i.test(normalizedName)) {
    return false
  }

  return /(read|search|grep|list|fetch|get|inspect|check|view|summary|usage|error|models|memory|resolve|analy[sz]e|review|scan)/i.test(normalizedName)
}

function isSearchLikeDiscoveryTool(toolCall: AIToolCall) {
  return /(search|grep|find|usage|semantic|file_search|search_subagent|resolve)/i.test(toolCall.name.trim().toLowerCase())
}

function isToolCallEmptySearchResult(toolCall: AIToolCall) {
  const result = String(toolCall.result || '').trim()
  if (!result || !isSearchLikeDiscoveryTool(toolCall)) {
    return !result
  }

  const parsedResult = tryParseJsonValue(result)
  if (Array.isArray(parsedResult)) {
    return parsedResult.length === 0
  }

  if (parsedResult && typeof parsedResult === 'object') {
    const record = parsedResult as Record<string, unknown>
    const collectionKeys = ['results', 'items', 'matches', 'files', 'usages', 'references']
    if (collectionKeys.some(key => Array.isArray(record[key]) && (record[key] as unknown[]).length > 0)) {
      return false
    }

    if (collectionKeys.some(key => Array.isArray(record[key]) && (record[key] as unknown[]).length === 0)) {
      return true
    }

    if (typeof record.total === 'number') {
      return record.total === 0
    }

    if (typeof record.count === 'number') {
      return record.count === 0
    }
  }

  return /(no results?|no matches?|0 matches?|未找到(?:任何)?结果|未找到匹配|没有找到匹配|无匹配结果|结果为空)/i.test(result)
}

function hasSubstantiveToolOutput(toolCall: AIToolCall) {
  const result = String(toolCall.result || '').trim()
  return Boolean(result) && !isToolCallEmptySearchResult(toolCall)
}

function isResearchOrCodeTask(goalText: string) {
  return /(代码|编程|开发|项目|仓库|工作区|workspace|repo|bug|报错|错误|调试|修复|重构|prompt|skill|agent|ide|文件|日志|构建|打包|测试|review|分析|定位|文档|配置|模型|接口|code|debug|fix|refactor|build|test|error|prompt|skill|agent|workspace|file|log)/i.test(goalText)
}

function maybePromoteToolRoundReview(review: ToolRoundReview, goalText: string, toolCalls: AIToolCall[]): ToolRoundReview {
  if (review.progressed || review.decision === 'pause' || review.decision === 'complete') {
    return review
  }

  const hasFailure = toolCalls.some(toolCall => isToolCallFailure(toolCall))
  const hasUsableOutput = toolCalls.some(toolCall => hasSubstantiveToolOutput(toolCall))
  const allReadOnly = toolCalls.length > 0 && toolCalls.every(toolCall => isReadOnlyDiscoveryTool(toolCall))

  if (hasFailure || !hasUsableOutput || (!allReadOnly && !isResearchOrCodeTask(goalText))) {
    return review
  }

  return {
    progressed: true,
    decision: 'continue',
    summary: '本轮已获得新的检索、读取或诊断结果，任务可以继续推进。',
    reason: '当前回合属于信息收集、代码分析或调试定位，只要拿到新的可用结果，就应视为有效推进，而不是阻断为 replan。',
    nextAction: '基于最新结果继续定位根因、修改代码或验证修复，避免重复读取完全相同的信息。'
  }
}

function getLatestMeaningfulUserMessage(sessionId: string) {
  const aiStore = useAIStore()
  const session = aiStore.getSessionById(sessionId)
  if (!session) {
    return ''
  }

  const visibleUserMessage = [...session.messages]
    .reverse()
    .find(message => message.role === 'user' && !/^以下是工具 .+ 生成的最新图像结果/.test(message.content.trim()))

  return visibleUserMessage?.content.trim() || ''
}

function summarizeToolCallsForReview(toolCalls: AIToolCall[]) {
  return toolCalls.map((toolCall, index) => {
    const argumentsText = truncateReviewText(toolCall.arguments, 900)
    const rawResult = typeof toolCall.providerMetadata?.rawContent === 'string'
      ? toolCall.providerMetadata.rawContent
      : toolCall.result
    const resultText = truncateReviewText(rawResult, 1600)
    return [
      `工具 ${index + 1}: ${toolCall.name}`,
      `参数: ${argumentsText || '无'}`,
      `结果: ${resultText || '无'}`
    ].join('\n')
  }).join('\n\n')
}

function buildToolRoundReviewSystemMessage(review: ToolRoundReview) {
  const progressLabel = review.progressed ? '已推进' : '未推进'
  const decisionLabel = review.decision === 'complete'
    ? '完成'
    : review.decision === 'pause'
      ? '暂停'
      : review.decision === 'replan'
        ? '改计划'
        : '继续'

  return `工具回合自检：${progressLabel}，${decisionLabel}。${truncateReviewText(review.summary, 180) || '已记录当前回合状态。'}`
}

function createFallbackToolRoundReview(toolCalls: AIToolCall[]): ToolRoundReview {
  const hasFailure = toolCalls.some(toolCall => isToolCallFailure(toolCall))
  const hasUsableOutput = toolCalls.some(toolCall => hasSubstantiveToolOutput(toolCall))

  if (hasFailure) {
    return {
      progressed: false,
      decision: 'replan',
      summary: '本轮工具执行出现失败或异常结果，不能视为任务已推进。',
      reason: '至少一个工具返回失败、异常或不可用结果，需要先调整策略。',
      nextAction: '先解释阻塞点，再调整计划或改用更合适的工具，不要重复相同调用。'
    }
  }

  if (!hasUsableOutput) {
    return {
      progressed: false,
      decision: 'replan',
      summary: '本轮工具没有返回足够结果，暂时无法确认任务推进。',
      reason: '缺少可验证输出，继续原样执行的风险较高。',
      nextAction: '下一轮先补充验证信息，再决定是否继续执行副作用操作。'
    }
  }

  return {
    progressed: true,
    decision: 'continue',
    summary: '本轮工具已产生新结果，可以在验证基础上继续推进。',
    reason: '工具返回了可用输出，默认视为任务获得了新的有效信息。',
    nextAction: '结合最新结果继续下一步，但仍需避免重复调用同一动作。'
  }
}

async function reviewToolRound(
  sessionId: string,
  assistantContent: string,
  toolCalls: AIToolCall[],
  signal?: AbortSignal
): Promise<ToolRoundReview> {
  const aiStore = useAIStore()
  const session = aiStore.getSessionById(sessionId)
  if (!session || toolCalls.length === 0) {
    return createFallbackToolRoundReview(toolCalls)
  }

  const task = aiStore.getLatestTaskForSession(sessionId)
  const currentStep = task?.steps.find(step => step.status === 'in_progress')
  const goalContext = [task?.goal, task?.summary, currentStep?.title, assistantContent].filter(Boolean).join(' ')
  const reviewSystemPrompt = [
    '你是 AI 工具执行回合的轻量自检器。',
    '目标：判断“刚刚这一轮工具结果是否真正推进了任务”，并决定下一轮是继续、改计划、暂停还是准备收尾。',
    '只返回严格 JSON，不要输出额外解释。',
    '格式如下：',
    '{"progressed":true,"decision":"continue|replan|pause|complete","summary":"...","reason":"...","nextAction":"..."}',
    '判定规则：',
    '- 只有在工具带来了新的可验证信息、状态变化或明显更接近目标时，progressed 才能为 true。',
    '- 对代码开发、错误定位、日志分析、文件检索、文档整理、方案规划等任务，只要本轮拿到了新的文件内容、搜索结果、错误信息、测试输出、构建日志或依赖信息，就应视为推进。',
    '- 对探索性回合，定位到根因、缩小范围、确认影响面、拿到下一步决策依据，也属于有效推进，不能机械判成 replan。',
    '- 对账号管理任务，若没有完成字段校验、类型确认、真实账号 ID 核验或导入导出结果验证，不能算推进。',
    '- 对桌面操作任务，若只是点击/输入/打开窗口，但没有新的 read_screen 或等价验证证据，通常不能算推进。',
    '- 如果结果显示当前方案无效，应返回 replan；如果需要等待用户、权限、验证码或外部条件，应返回 pause；只有目标已被明确验证完成时才返回 complete。',
    '- nextAction 必须给出下一轮最重要的动作约束，避免重复无效调用。'
  ].join('\n')

  const reviewUserPrompt = [
    `当前用户目标: ${task?.goal || getLatestMeaningfulUserMessage(sessionId) || session.title}`,
    `当前任务摘要: ${task?.summary || '无'}`,
    `当前步骤: ${currentStep ? `${currentStep.title}${currentStep.note ? ` | ${currentStep.note}` : ''}` : '无'}`,
    `本轮助手输出: ${truncateReviewText(assistantContent, 1200) || '无'}`,
    '本轮工具调用与结果如下：',
    summarizeToolCallsForReview(toolCalls)
  ].join('\n\n')

  try {
    const { content } = await chatCompletion(
      aiStore.getEffectiveConfig(sessionId),
      [
        { id: 'tool-review-system', role: 'system', content: reviewSystemPrompt, timestamp: 0 },
        { id: 'tool-review-user', role: 'user', content: reviewUserPrompt, timestamp: 0 }
      ],
      { ...aiStore.preferences, thinkingEnabled: false },
      { includeTools: false },
      signal
    )

    const parsed = JSON.parse(extractJsonObject(content)) as Partial<ToolRoundReview>
    const summary = String(parsed.summary || '').trim()
    const reason = String(parsed.reason || '').trim()
    const nextAction = String(parsed.nextAction || '').trim()

    return maybePromoteToolRoundReview({
      progressed: Boolean(parsed.progressed),
      decision: normalizeToolRoundDecision(parsed.decision),
      summary: summary || '本轮自检未返回摘要。',
      reason: reason || '本轮自检未返回具体原因。',
      nextAction: nextAction || '下一轮先重新确认结果，再决定是否继续调用工具。'
    }, goalContext, toolCalls)
  } catch {
    return maybePromoteToolRoundReview(createFallbackToolRoundReview(toolCalls), goalContext, toolCalls)
  }
}

function normalizeCompressionCategory(category: string | undefined) {
  if (category === 'preference' || category === 'fact' || category === 'context' || category === 'instruction') {
    return category
  }

  return 'context'
}

type CompressionMemoryCategory = 'preference' | 'fact' | 'context' | 'instruction'

type CompressionSummaryPayload = {
  goal: string
  instructions: string[]
  discoveries: string[]
  accomplished: string[]
  nextSteps: string[]
  relevantFiles: string[]
  memories: Array<{ content: string; category: CompressionMemoryCategory }>
}

function normalizeCompressionText(value: unknown, limit = 220) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }

  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit - 3)}...`
}

function normalizeCompressionList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized = value
    .map(item => normalizeCompressionText(item, 220))
    .filter(Boolean)

  return [...new Set(normalized)].slice(0, limit)
}

function buildCompressionSummaryPayload(
  sessionId: string,
  session: AIChatSession,
  parsed: Partial<{
    summary: string
    goal: string
    instructions: unknown[]
    discoveries: unknown[]
    accomplished: unknown[]
    nextSteps: unknown[]
    relevantFiles: unknown[]
    memories: Array<{ content?: string; category?: string }>
  }>
): CompressionSummaryPayload {
  const fallbackGoal = normalizeCompressionText(
    parsed.goal
    || getLatestMeaningfulUserMessage(sessionId)
    || session.title,
    280,
  )

  const fallbackSummaryLines = String(parsed.summary || '')
    .split(/\r?\n/)
    .map(line => normalizeCompressionText(line, 220))
    .filter(Boolean)

  const payload: CompressionSummaryPayload = {
    goal: fallbackGoal || '继续当前会话任务',
    instructions: normalizeCompressionList(parsed.instructions, 6),
    discoveries: normalizeCompressionList(parsed.discoveries, 8),
    accomplished: normalizeCompressionList(parsed.accomplished, 8),
    nextSteps: normalizeCompressionList(parsed.nextSteps, 6),
    relevantFiles: normalizeCompressionList(parsed.relevantFiles, 8),
    memories: Array.isArray(parsed.memories)
      ? parsed.memories
          .map(item => ({
            content: normalizeCompressionText(item?.content, 200),
            category: normalizeCompressionCategory(item?.category) as CompressionMemoryCategory,
          }))
          .filter(item => item.content)
      : [],
  }

  if (payload.discoveries.length === 0 && fallbackSummaryLines.length > 0) {
    payload.discoveries = [...new Set(fallbackSummaryLines)].slice(0, 6)
  }

  return payload
}

function buildCompressionHandoffSummary(payload: CompressionSummaryPayload) {
  const sections: string[] = [
    [
      '## Goal',
      `- ${payload.goal}`,
    ].join('\n'),
  ]

  if (payload.instructions.length > 0) {
    sections.push([
      '## Instructions',
      ...payload.instructions.map(item => `- ${item}`),
    ].join('\n'))
  }

  if (payload.discoveries.length > 0) {
    sections.push([
      '## Discoveries',
      ...payload.discoveries.map(item => `- ${item}`),
    ].join('\n'))
  }

  if (payload.accomplished.length > 0) {
    sections.push([
      '## Accomplished',
      ...payload.accomplished.map(item => `- ${item}`),
    ].join('\n'))
  }

  if (payload.nextSteps.length > 0) {
    sections.push([
      '## Next Steps',
      ...payload.nextSteps.map(item => `- ${item}`),
    ].join('\n'))
  }

  if (payload.relevantFiles.length > 0) {
    sections.push([
      '## Relevant Files',
      ...payload.relevantFiles.map(item => `- ${item}`),
    ].join('\n'))
  }

  return sections.join('\n\n').slice(0, 3200)
}

async function syncIDEExecutionHandoff(sessionId: string) {
  const aiStore = useAIStore()
  const workspace = aiStore.ideWorkspace
  if (!workspace) {
    return
  }

  const plan = [...aiStore.projectPlans]
    .filter(item => item.workspaceId === workspace.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]

  if (!plan) {
    return
  }

  aiStore.addDevLog(plan.id, {
    type: 'context-compress',
    title: '刷新执行上下文摘要',
    content: `会话 ${sessionId} 已完成一次上下文压缩，并同步刷新工作区内的 CONTEXT.md 与 RUN.md 接力摘要。`,
    metadata: {
      sessionId,
    },
  })
  await flushPlanToWorkspace(workspace, aiStore.getProjectPlan(plan.id) || plan)
}

function formatCompressionMessages(messages: AIChatMessage[]) {
  return messages.map(message => {
    const role = message.role === 'assistant' ? 'AI' : message.role === 'tool' ? '工具' : message.role === 'system' ? '系统' : '用户'
    const toolSummary = message.toolName ? `[工具:${message.toolName}]` : ''
    const toolCallsSummary = (message.toolCalls ?? [])
      .map(toolCall => toolCall.name?.trim())
      .filter(Boolean)
      .join(', ')
    const attachmentSummary = (message.attachments ?? []).map(attachment => attachment.type === 'image'
      ? `[图片:${attachment.name}]`
      : `[文件:${attachment.name}]`).join(' ')

    return `${role}: ${[toolSummary, toolCallsSummary ? `[调用:${toolCallsSummary}]` : '', message.content, attachmentSummary].filter(Boolean).join(' ')}`.trim()
  }).join('\n')
}

async function compressConversationContext(sessionId: string, hooks: AIConversationHooks, signal?: AbortSignal) {
  const aiStore = useAIStore()
  const session = aiStore.getSessionById(sessionId)
  if (!session) {
    return
  }

  const olderMessages = session.messages.slice(0, -12)
  if (olderMessages.length === 0) {
    return
  }

  aiStore.setRuntimePhase(sessionId, 'compressing')
  hooks.onStream(aiStore.runtime.content)

  const compressionPrompt = [
    '你是 AI 对话上下文压缩器。',
    '目标：把即将被压缩出上下文窗口的旧对话整理成下一位模型也能直接接手执行的结构化 JSON。',
    '只保留后续仍然有效的信息：目标、约束、已完成工作、关键发现、阻塞点、下一步和相关文件。',
    '丢弃短期无效内容：寒暄、一次性验证码、瞬时 UI 坐标、重复确认、无结论的试探。',
    '返回严格 JSON，不要输出解释。格式如下：',
    '{"goal":"...","instructions":["..."],"discoveries":["..."],"accomplished":["..."],"nextSteps":["..."],"relevantFiles":["..."],"memories":[{"content":"...","category":"preference|fact|context|instruction"}]}',
    '约束：',
    '- goal 用一句话描述当前真正要继续完成的任务。',
    '- instructions 只保留仍然有效的长期规则、用户偏好和禁止事项。',
    '- discoveries 写已经证实的事实、错误根因、可复用结论，不写猜测。',
    '- accomplished 写已经完成且不必重复做的工作。',
    '- nextSteps 写下一位模型最应该继续推进的动作。',
    '- relevantFiles 只写真实相关的文件、目录、脚本或接口名。',
    '- memories 仅保留值得写入长期记忆的稳定信息。',
  ].join('\n')

  const userPrompt = [
    session.summary ? `现有摘要：\n${session.summary}` : '',
    '以下是需要压缩的历史对话：',
    formatCompressionMessages(olderMessages)
  ].filter(Boolean).join('\n\n')

  const { content } = await chatCompletion(
    aiStore.getEffectiveConfig(sessionId),
    [
      { id: 'compress-system', role: 'system', content: compressionPrompt, timestamp: 0 },
      { id: 'compress-user', role: 'user', content: userPrompt, timestamp: 0 }
    ],
    { ...aiStore.preferences, thinkingEnabled: false },
    { includeTools: false },
    signal
  )

  const parsedContent = extractJsonObject(content)
  let nextSummary = ''
  let memoryList: Array<{ content: string; category: CompressionMemoryCategory }> = []

  try {
    const parsed = JSON.parse(parsedContent) as Partial<{
      summary: string
      goal: string
      instructions: unknown[]
      discoveries: unknown[]
      accomplished: unknown[]
      nextSteps: unknown[]
      relevantFiles: unknown[]
      memories: Array<{ content?: string; category?: string }>
    }>
    const compressionPayload = buildCompressionSummaryPayload(sessionId, session, parsed)
    nextSummary = buildCompressionHandoffSummary(compressionPayload)
    memoryList = compressionPayload.memories
  } catch {
    const fallbackPayload = buildCompressionSummaryPayload(sessionId, session, {
      goal: getLatestMeaningfulUserMessage(sessionId) || session.title,
      discoveries: parsedContent
        .split(/\r?\n/)
        .map(line => normalizeCompressionText(line, 220))
        .filter(Boolean)
        .slice(0, 6),
      nextSteps: ['基于最近一轮用户目标和工具结果继续执行，不要重复已完成步骤。'],
    })
    nextSummary = buildCompressionHandoffSummary(fallbackPayload)
  }

  if (nextSummary) {
    aiStore.updateSessionSummary(sessionId, nextSummary)
  }

  const currentSession = aiStore.getSessionById(sessionId)
  const sessionScope = currentSession?.scope || aiStore.resolveSessionScope(sessionId)
  const sessionAgent = currentSession ? aiStore.getSessionAgent(currentSession) : null
  if (currentSession && aiStore.getEffectiveAgentCapabilities(currentSession).memoryEnabled) {
    memoryList.forEach(memory => {
      aiStore.addMemory(memory.content, memory.category, 'ai', sessionScope, sessionAgent?.id)
    })
  }

  if (nextSummary) {
    const refreshedSession = aiStore.getSessionById(sessionId)
    if (refreshedSession) {
      createLocalContextSnapshot(sessionId, refreshedSession.messages, {
        source: 'compression',
        summaryOverride: nextSummary,
      })
    }
  }

  aiStore.recordCompression(sessionId)
  aiStore.updateRuntimeContext(sessionId, aiStore.getContextMetrics(sessionId))
  await syncIDEExecutionHandoff(sessionId)
  await notifyUpdate(hooks)
  if (!signal?.aborted) {
    aiStore.setRuntimePhase(sessionId, 'streaming')
  }
}

async function ensureContextWithinLimit(sessionId: string, hooks: AIConversationHooks, signal?: AbortSignal) {
  const aiStore = useAIStore()
  const metrics = aiStore.getContextMetrics(sessionId)
  aiStore.updateRuntimeContext(sessionId, metrics)

  if (metrics.usageRatio < CONTEXT_COMPRESSION_TRIGGER_RATIO || compressionLocks.has(sessionId)) {
    return metrics
  }

  compressionLocks.add(sessionId)
  try {
    await compressConversationContext(sessionId, hooks, signal)
  } finally {
    compressionLocks.delete(sessionId)
  }

  const nextMetrics = aiStore.getContextMetrics(sessionId)
  aiStore.updateRuntimeContext(sessionId, nextMetrics)
  return nextMetrics
}

async function executeToolLoop(
  sessionId: string,
  toolCalls: AIToolCall[],
  hooks: AIConversationHooks,
  signal?: AbortSignal
) {
  const aiStore = useAIStore()

  for (const toolCall of toolCalls) {
    if (signal?.aborted) {
      return
    }

    try {
      const result = await executeToolCall(toolCall, { sessionId })
      const rawToolResultContent = result.output || (result.error ? `{"success":false,"message":"${result.error}"}` : '')
      const compactedToolResult = compactToolResultForConversation(toolCall.name, rawToolResultContent)
      toolCall.result = compactedToolResult.content
      toolCall.providerMetadata = {
        ...(toolCall.providerMetadata ?? {}),
        ...(compactedToolResult.rawContent ? { rawContent: compactedToolResult.rawContent } : {})
      }

      aiStore.addMessage(sessionId, {
        role: 'tool',
        content: compactedToolResult.content,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        attachments: result.attachments,
        providerMetadata: {
          ...(compactedToolResult.rawContent ? { rawContent: compactedToolResult.rawContent } : {})
        }
      })

      if (result.attachments?.length) {
        aiStore.addMessage(sessionId, {
          role: 'user',
          content: buildVisionFollowUpPrompt(toolCall),
          attachments: result.attachments
        })
      }
    } catch (error) {
      const message = toToolFailureMessage(error)
      const rawFailureContent = JSON.stringify({
        success: false,
        message: `工具执行异常: ${message}`
      })
      const compactedFailure = compactToolResultForConversation(toolCall.name, rawFailureContent)
      toolCall.result = compactedFailure.content
      toolCall.providerMetadata = {
        ...(toolCall.providerMetadata ?? {}),
        ...(compactedFailure.rawContent ? { rawContent: compactedFailure.rawContent } : {})
      }
      aiStore.addMessage(sessionId, {
        role: 'tool',
        content: compactedFailure.content,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        providerMetadata: {
          ...(compactedFailure.rawContent ? { rawContent: compactedFailure.rawContent } : {}),
          error: message
        }
      })
    }
  }

  await notifyUpdate(hooks)
}

function createRunController(sessionId: string, signal?: AbortSignal) {
  const controller = new AbortController()
  activeControllers.set(sessionId, controller)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return controller
}

function isCurrentRun(sessionId: string, signal?: AbortSignal) {
  if (!signal) {
    return true
  }

  return activeControllers.get(sessionId)?.signal === signal
}

export function cancelConversationRun(sessionId?: string) {
  const aiStore = useAIStore()
  const targetSessionId = sessionId || aiStore.runtime.sessionId
  if (!targetSessionId) {
    return
  }

  const controller = activeControllers.get(targetSessionId)
  if (controller) {
    controller.abort()
    activeControllers.delete(targetSessionId)
  }

  aiStore.blockTask(targetSessionId, '任务已手动停止，等待用户下一步指令。')
  aiStore.failRuntime(targetSessionId, '任务已手动停止')
}

function shouldStopByIterationLimit(sessionId: string) {
  const aiStore = useAIStore()
  const task = aiStore.getLatestTaskForSession(sessionId)
  if (!task || task.maxIterations <= 0) {
    return false
  }

  return task.iterationCount >= task.maxIterations
}

function tryParseJsonValue(value: string | undefined) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function normalizeLoopString(value: string) {
  return value
    .replace(/[A-Z]:\\[^\s"']+/gi, '<path>')
    .replace(/\/Users\/[^\s"']+/gi, '<path>')
    .replace(/\/tmp\/[^\s"']+/gi, '<path>')
    .replace(/\/temp\/[^\s"']+/gi, '<path>')
    .replace(/\b\d{6,}\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600)
}

function sanitizeLoopValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return normalizeLoopString(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLoopValue(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .filter(key => !/^(filePath|path|createdAt|updatedAt|timestamp|startedAt|completedAt)$/i.test(key))
      .sort((a, b) => a.localeCompare(b))
      .map(key => [key, sanitizeLoopValue(record[key])])
  )
}

function stableStringify(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort((a, b) => a.localeCompare(b))
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function buildToolBatchFingerprint(toolCalls: AIToolCall[], includeResult = false) {
  return toolCalls
    .map(toolCall => {
      const normalizedArguments = sanitizeLoopValue(tryParseJsonValue(toolCall.arguments) ?? normalizeLoopString(toolCall.arguments || ''))
      const normalizedResult = includeResult
        ? sanitizeLoopValue(tryParseJsonValue(toolCall.result) ?? normalizeLoopString(toolCall.result || ''))
        : undefined

      return stableStringify({
        name: toolCall.name.trim(),
        arguments: normalizedArguments,
        ...(includeResult ? { result: normalizedResult } : {})
      })
    })
    .join('|')
}

/**
 * 增量上下文快照：满足条件时自动创建本地快照
 */
function tryIncrementalSnapshot(sessionId: string) {
  try {
    const aiStore = useAIStore()
    const session = aiStore.getSessionById(sessionId)
    if (!session || session.messages.length === 0) return

    if (shouldCreateSnapshot(sessionId, session.messages.length)) {
      createLocalContextSnapshot(sessionId, session.messages)
    }
  } catch {
    // 快照失败不影响主流程
  }
}

export async function runAIResponseLoop(
  sessionId: string,
  hooks: AIConversationHooks,
  signal?: AbortSignal
) {
  const aiStore = useAIStore()
  let lastExecutedToolBatchFingerprint = ''
  let identicalToolExecutionCount = 0

  aiStore.startRuntime(sessionId)
  hooks.onStream(aiStore.runtime.content)

  try {
    while (!signal?.aborted) {
      await ensureContextWithinLimit(sessionId, hooks, signal)
      aiStore.setRuntimePhase(sessionId, 'streaming')
      aiStore.updateRuntimeContext(sessionId, aiStore.getContextMetrics(sessionId))

      const turnResult = await new Promise<{ content: string; reasoningContent: string; toolCalls: AIToolCall[]; providerMetadata?: Record<string, unknown>; error?: string }>((resolve) => {
        let streamedContent = ''
        let streamedReasoning = ''
        const collectedToolCalls: AIToolCall[] = []
        let providerMetadata: Record<string, unknown> | undefined

        void streamChat(
          aiStore.getEffectiveConfig(sessionId),
          aiStore.buildContextMessages(sessionId),
          {
            onToken(token) {
              streamedContent += token
              aiStore.updateRuntimeContent(sessionId, streamedContent)
              hooks.onStream(streamedContent)
            },
            onReasoning(token) {
              streamedReasoning += token
              aiStore.updateRuntimeReasoning(sessionId, streamedReasoning)
            },
            onToolCall(toolCall) {
              collectedToolCalls.push(toolCall)
            },
            onProviderMetadata(metadata) {
              providerMetadata = metadata
            },
            async onDone() {
              resolve({ content: streamedContent, reasoningContent: streamedReasoning, toolCalls: collectedToolCalls, providerMetadata })
            },
            onError(error) {
              resolve({ content: streamedContent, reasoningContent: streamedReasoning, toolCalls: collectedToolCalls, providerMetadata, error })
            }
          },
          aiStore.preferences,
          undefined,
          signal
        )
      })

      if (turnResult.error) {
        throw new Error(turnResult.error)
      }

      const embeddedReasoning = splitEmbeddedReasoningContent(turnResult.content)
      const nextAssistantContent = embeddedReasoning.content
      const mergedReasoningContent = [turnResult.reasoningContent, embeddedReasoning.reasoningContent]
        .filter(Boolean)
        .join('\n\n')
        .trim()
      const normalizedAssistantOutput = await normalizeAssistantMessageOutput(nextAssistantContent, turnResult.providerMetadata)

      if (normalizedAssistantOutput.content || mergedReasoningContent || turnResult.toolCalls.length > 0 || normalizedAssistantOutput.attachments.length > 0) {
        aiStore.addMessage(sessionId, {
          role: 'assistant',
          content: normalizedAssistantOutput.content,
          reasoningContent: mergedReasoningContent || undefined,
          toolCalls: turnResult.toolCalls.length > 0 ? turnResult.toolCalls : undefined,
          attachments: normalizedAssistantOutput.attachments.length > 0 ? normalizedAssistantOutput.attachments : undefined,
          providerMetadata: normalizedAssistantOutput.providerMetadata
        })
      }

      aiStore.updateRuntimeContent(sessionId, '')
      aiStore.updateRuntimeReasoning(sessionId, '')
      hooks.onStream('')

      await notifyUpdate(hooks)

      if (turnResult.toolCalls.length === 0) {
        if (isCurrentRun(sessionId, signal)) {
          aiStore.finishRuntime(sessionId)
        }
        return
      }

      aiStore.incrementTaskIteration(sessionId)
      await executeToolLoop(sessionId, turnResult.toolCalls, hooks, signal)

      const toolRoundReview = await reviewToolRound(sessionId, turnResult.content, turnResult.toolCalls, signal)
      aiStore.applyTaskRoundReview(sessionId, {
        progressed: toolRoundReview.progressed,
        summary: toolRoundReview.summary
      })
      aiStore.addMessage(sessionId, {
        role: 'system',
        content: buildToolRoundReviewSystemMessage(toolRoundReview),
        providerMetadata: {
          toolRoundReview
        }
      })
      await notifyUpdate(hooks)

      // 增量上下文快照：每 N 轮自动创建本地快照
      tryIncrementalSnapshot(sessionId)

      if (toolRoundReview.decision === 'pause') {
        aiStore.blockTask(sessionId, toolRoundReview.summary || '工具回合自检判断当前任务需要暂停。')
        aiStore.addMessage(sessionId, {
          role: 'assistant',
          content: toolRoundReview.reason || toolRoundReview.summary || '当前任务需要暂停，请先处理阻塞条件后再继续。'
        })
        hooks.onStream('')
        await notifyUpdate(hooks)
        if (isCurrentRun(sessionId, signal)) {
          aiStore.finishRuntime(sessionId)
        }
        return
      }

      const currentExecutionFingerprint = buildToolBatchFingerprint(turnResult.toolCalls, true)
      if (currentExecutionFingerprint && currentExecutionFingerprint === lastExecutedToolBatchFingerprint) {
        identicalToolExecutionCount += 1
      } else {
        lastExecutedToolBatchFingerprint = currentExecutionFingerprint
        identicalToolExecutionCount = 1
      }

      if (currentExecutionFingerprint && identicalToolExecutionCount >= MAX_IDENTICAL_TOOL_EXECUTIONS) {
        if (toolRoundReview.decision === 'replan' && identicalToolExecutionCount === MAX_IDENTICAL_TOOL_EXECUTIONS) {
          aiStore.addMessage(sessionId, {
            role: 'system',
            content: '工具回合守卫：检测到相同工具结果连续出现，下一轮必须调整计划或补充验证，不能继续原样重复调用。',
            providerMetadata: {
              toolRoundReview: {
                progressed: false,
                decision: 'replan',
                summary: '检测到相同工具结果连续出现，下一轮必须调整计划或补充验证。',
                reason: '连续回合返回了同一组工具结果，继续原样执行只会重复消耗上下文与接口请求。',
                nextAction: '先基于当前结果总结状态，再切换验证方式、补充读取证据或改计划。'
              }
            }
          })
          await notifyUpdate(hooks)
          continue
        }

        aiStore.blockTask(sessionId, '检测到同一组工具调用连续返回相同结果，任务已自动暂停，避免重复执行。')
        aiStore.addMessage(sessionId, {
          role: 'assistant',
          content: '检测到同一组工具调用连续返回相同结果，当前流程没有继续推进。为避免重复打开浏览器、重复聚焦窗口或重复点击，任务已自动暂停。请确认当前桌面状态，或补充更明确的下一步后再继续。'
        })
        hooks.onStream('')
        await notifyUpdate(hooks)
        if (isCurrentRun(sessionId, signal)) {
          aiStore.finishRuntime(sessionId)
        }
        return
      }

      if (shouldStopByIterationLimit(sessionId)) {
        aiStore.blockTask(sessionId, '达到自动循环上限，任务已暂停，请人工确认下一步。')
        aiStore.addMessage(sessionId, {
          role: 'assistant',
          content: '已达到当前自动循环上限，任务已暂停。你可以继续补充要求，或将自动步数切到无限后继续。'
        })
        await notifyUpdate(hooks)
        if (isCurrentRun(sessionId, signal)) {
          aiStore.finishRuntime(sessionId)
        }
        return
      }
    }

    if (isCurrentRun(sessionId, signal)) {
      aiStore.finishRuntime(sessionId)
    }
  } catch (error) {
    if (signal?.aborted) {
      hooks.onStream('')
      if (isCurrentRun(sessionId, signal) && aiStore.runtime.sessionId === sessionId && aiStore.runtime.running) {
        aiStore.failRuntime(sessionId, '任务已取消')
      }
      return
    }

    const message = error instanceof Error ? error.message : '请求失败'
    if (isCurrentRun(sessionId, signal)) {
      aiStore.failRuntime(sessionId, message)
    }
    hooks.onStream('')
    aiStore.addMessage(sessionId, {
      role: 'assistant',
      content: `抱歉，发生了错误: ${message}`
    })
    await notifyUpdate(hooks)
    hooks.onError?.(message)
  }
}

export async function startConversationTurn(
  sessionId: string,
  text: string,
  attachments: AIChatAttachment[],
  hooks: AIConversationHooks,
  signal?: AbortSignal
) {
  const aiStore = useAIStore()
  const normalizedText = text.trim()

  if (!normalizedText && attachments.length === 0) {
    return
  }

  if (aiStore.preferences.planningMode) {
    const latestTask = aiStore.getLatestTaskForSession(sessionId)
    const shouldReuseActiveTask = Boolean(latestTask && (latestTask.status === 'planning' || latestTask.status === 'running'))
    const nextGoal = shouldReuseActiveTask ? latestTask!.goal : normalizedText || latestTask?.goal || (attachments.length > 0 ? '多模态任务' : '未命名任务')
    const shouldSeedSteps = !shouldReuseActiveTask || !latestTask?.steps.length
    aiStore.updateTaskPlan(sessionId, {
      goal: nextGoal,
      status: shouldReuseActiveTask ? latestTask!.status : 'planning',
      ...(shouldSeedSteps ? { steps: buildBootstrapTaskSteps(nextGoal, attachments) } : {}),
      maxIterations: aiStore.preferences.maxAutoSteps
    })
  }

  aiStore.addMessage(sessionId, {
    role: 'user',
    content: normalizedText,
    attachments
  })

  await notifyUpdate(hooks)

  const existingController = activeControllers.get(sessionId)
  if (existingController) {
    existingController.abort()
    activeControllers.delete(sessionId)
  }

  const controller = createRunController(sessionId, signal)
  try {
    await runAIResponseLoop(sessionId, hooks, controller.signal)
  } finally {
    const activeController = activeControllers.get(sessionId)
    if (activeController === controller) {
      activeControllers.delete(sessionId)
    }
  }
}

export function getDefaultChatPreferences(): AIChatPreferences {
  return {
    thinkingEnabled: false,
    thinkingLevel: 'medium',
    planningMode: true,
    autoMemory: true,
    maxAutoSteps: 0
  }
}
