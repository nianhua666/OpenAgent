/**
 * AI 工具执行器
 * 接收AI返回的工具调用，路由到对应的实际操作
 */
import type { AIChatMessage, AIToolCall, Account, AccountType, AIChatAttachment, AITaskStep, AIProviderModel, DevLogEntry, IDETerminalEvent, IDETerminalSessionSnapshot, IDEWorkspace, MCPScreenCaptureInfo, MCPWindowInfo, PlanStatus, ProjectTaskStatus } from '@/types'
import { useAccountStore } from '@/stores/account'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAIStore } from '@/stores/ai'
import { useAIResourcesStore } from '@/stores/aiResources'
import { useSettingsStore } from '@/stores/settings'
import router from '@/router'
import { genId } from '@/utils/helpers'
import { isManagedMcpToolInvocationName } from '@/utils/aiManagedResources'
import { listLocalLive2DModels } from '@/utils/live2d'
import { coerceToolArguments } from '@/utils/aiToolArgs'
import { routeModel, recommendSubAgentModel } from '@/utils/aiModelRouter'
import { spawnAndRunSubAgent } from '@/utils/aiSubAgent'
import { chatCompletion, fetchAvailableModels } from '@/utils/ai'
import { buildSharedContext } from '@/utils/aiContextEngine'
import { readWorkspaceFile, writeWorkspaceFile, searchFiles } from '@/utils/aiIDEWorkspace'
import { syncAutonomyRunState } from '@/utils/aiAutonomyScheduler'
import { joinRuntimePath, resolveAgentStorageLayout, sanitizeDirectorySegment } from '@/utils/runtimeDirectories'
import {
  advanceTask,
  buildPlanExecutionPacket,
  renderPlanToMarkdown,
  flushPlanToWorkspace,
  generateInitialPlanPhases,
  recordPlanWorkspaceSnapshot,
  replanProjectPlan,
} from '@/utils/aiPlanEngine'
import * as devLogger from '@/utils/aiDevLogger'

interface ToolExecutionResult {
  output: string
  error?: string
  attachments?: AIChatAttachment[]
}

interface ToolExecutionContext {
  sessionId?: string
}

const MODEL_CATALOG_CACHE_TTL_MS = 60 * 1000
const modelCatalogCache = new Map<string, { expiresAt: number; models: AIProviderModel[] }>()
const IDE_COMMAND_DEFAULT_TIMEOUT_MS = 30_000
const IDE_COMMAND_MAX_TIMEOUT_MS = 120_000
const IDE_COMMAND_DEFAULT_IDLE_TIMEOUT_MS = 12_000
const IDE_COMMAND_MAX_IDLE_TIMEOUT_MS = 30_000
const IDE_COMMAND_OUTPUT_LIMIT = 16_000
const IDE_COMMAND_CAPTURE_BUFFER_LIMIT = IDE_COMMAND_OUTPUT_LIMIT * 6
const IDE_COMMAND_INTERACTIVE_OUTPUT_PATTERN = /(y\/n|yes\/no|password|passphrase|press any key|select an option|choose one|continue\?|are you sure|请输入|确认是否|是否继续|输入密码)/i

function jsonOutput(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

function successResult(message: string, data?: Record<string, unknown>): ToolExecutionResult {
  return {
    output: jsonOutput({ success: true, message, ...(data ? { data } : {}) })
  }
}

function errorResult(message: string, data?: Record<string, unknown>): ToolExecutionResult {
  return {
    output: jsonOutput({ success: false, message, ...(data ? { data } : {}) }),
    error: message
  }
}

function normalizeTextValue(value: unknown) {
  if (value === null || typeof value === 'undefined') {
    return ''
  }

  return String(value).trim()
}

function normalizeFieldKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function tryParseJson<T = unknown>(value: string | undefined | null) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/').trim()
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'image.png'
}

async function buildImageAttachmentFromPath(filePath: string, source: AIChatAttachment['source'] = 'tool') {
  const dataUrl = await window.electronAPI?.readImageAsDataUrl?.(filePath)
  if (!dataUrl) {
    return null
  }

  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i)
  return {
    id: genId(),
    type: 'image' as const,
    name: getFileName(filePath),
    mimeType: mimeMatch?.[1] || 'image/png',
    dataUrl,
    source,
    filePath
  }
}

async function extractScreenshotAttachment(result: { output?: string; data?: unknown }) {
  const data = (result.data && typeof result.data === 'object' ? result.data : null) as MCPScreenCaptureInfo | null
  const filePath = data?.filePath || result.output?.match(/截图已保存:\s*(.+?)(?:\r?\n|$)/)?.[1]?.trim()
  if (!filePath) {
    return null
  }

  return buildImageAttachmentFromPath(filePath, 'tool')
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
}

function createFallbackModelEntry(modelId: string): AIProviderModel {
  return {
    id: modelId,
    name: modelId,
    label: modelId,
  }
}

function getModelCatalogCacheKey() {
  const aiStore = useAIStore()
  return [
    aiStore.config.protocol,
    aiStore.config.baseUrl.trim(),
    aiStore.config.model.trim(),
  ].join('|')
}

async function resolveAvailableModelsForRouting() {
  const aiStore = useAIStore()
  const cacheKey = getModelCatalogCacheKey()
  const cached = modelCatalogCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() && cached.models.length > 0) {
    return {
      models: cached.models,
      source: 'cache' as const,
      warning: '',
    }
  }

  try {
    const models = await fetchAvailableModels(aiStore.config)
    if (models.length > 0) {
      modelCatalogCache.set(cacheKey, {
        models,
        expiresAt: Date.now() + MODEL_CATALOG_CACHE_TTL_MS,
      })
      return {
        models,
        source: 'remote' as const,
        warning: '',
      }
    }
  } catch (error) {
    const warning = error instanceof Error ? error.message : '模型列表拉取失败'
    const currentModel = aiStore.config.model.trim()
    return {
      models: currentModel ? [createFallbackModelEntry(currentModel)] : [],
      source: 'fallback' as const,
      warning,
    }
  }

  const currentModel = aiStore.config.model.trim()
  return {
    models: currentModel ? [createFallbackModelEntry(currentModel)] : [],
    source: 'fallback' as const,
    warning: currentModel ? '远端模型列表为空，已回退到当前模型。' : '当前没有可用模型。',
  }
}

function getLatestPlanInActiveWorkspace() {
  const aiStore = useAIStore()
  const workspace = getActiveWorkspace()
  if (!workspace) {
    return { workspace: null, plan: null }
  }

  const plan = [...aiStore.projectPlans]
    .filter(item => item.workspaceId === workspace.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null

  return { workspace, plan }
}

function normalizeEnvRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const env = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key.trim(), typeof item === 'string' ? item : String(item ?? '')])
      .filter(([key, item]) => key && item)
  )

  return Object.keys(env).length > 0 ? env : undefined
}

async function ensureResourcesStoreReady() {
  const resourcesStore = useAIResourcesStore()
  if (!resourcesStore.loaded) {
    await resourcesStore.init()
  }
  return resourcesStore
}

function getTypeFieldMap(type: AccountType) {
  return new Map(type.fields.map(field => [field.key, field]))
}

function validateAccountPayload(type: AccountType, accounts: unknown[]) {
  const fieldMap = getTypeFieldMap(type)
  const normalizedAccounts: Record<string, string>[] = []

  for (let index = 0; index < accounts.length; index += 1) {
    const item = accounts[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `第 ${index + 1} 条账号数据不是对象结构` }
    }

    const rawRecord = item as Record<string, unknown>
    const unknownKeys = Object.keys(rawRecord).filter(key => !fieldMap.has(key))
    if (unknownKeys.length > 0) {
      return { error: `第 ${index + 1} 条账号包含未定义字段: ${unknownKeys.join(', ')}` }
    }

    const normalizedRecord: Record<string, string> = {}
    for (const field of type.fields) {
      const value = normalizeTextValue(rawRecord[field.key])
      if (field.required && !value) {
        return { error: `第 ${index + 1} 条账号缺少必填字段: ${field.name}(${field.key})` }
      }

      normalizedRecord[field.key] = value
    }

    normalizedAccounts.push(normalizedRecord)
  }

  return { normalizedAccounts }
}

/** 执行单个工具调用 */
export async function executeToolCall(toolCall: AIToolCall, context: ToolExecutionContext = {}): Promise<ToolExecutionResult> {
  const args = coerceToolArguments(toolCall.name, toolCall.arguments)

  switch (toolCall.name) {
    case 'query_accounts':
      return queryAccounts(args)
    case 'import_accounts':
      return importAccounts(args)
    case 'export_accounts':
      return exportAccounts(args)
    case 'get_account_types':
      return getAccountTypes()
    case 'create_account_type':
      return createAccountType(args)
    case 'get_live2d_models':
      return getLive2DModels()
    case 'get_windows_mcp_status':
      return getWindowsMcpStatus()
    case 'navigate_app':
      return navigateApp(args)
    case 'set_live2d_enabled':
      return setLive2DEnabled(args)
    case 'update_task_plan':
      return updateTaskPlanTool(args, context)
    case 'complete_task':
      return completeTaskTool(args, context)
    case 'remember':
      return rememberInfo(args, context)
    case 'get_managed_ai_resources':
      return getManagedAIResources()
    case 'install_mcp_server':
      return installManagedMcpServer(args)
    case 'refresh_mcp_server_tools':
      return refreshManagedMcpServerTools(args)
    case 'set_mcp_server_enabled':
      return setManagedMcpServerEnabled(args)
    case 'remove_mcp_server':
      return removeManagedMcpServer(args)
    case 'upsert_ai_skill':
      return upsertManagedSkill(args)
    case 'set_ai_skill_enabled':
      return setManagedSkillEnabled(args)
    case 'remove_ai_skill':
      return removeManagedSkill(args)
    case 'execute_command':
      return executeMcpCommand(args)
    case 'read_screen':
      return readScreen(args)
    case 'mouse_click':
      return doMouseClick(args)
    case 'keyboard_input':
      return doKeyboardInput(args)
    case 'list_windows':
      return doListWindows()
    case 'focus_window':
      return doFocusWindow(args)
    // Agent 增强工具
    case 'route_model':
      return routeModelTool(args)
    case 'delegate_model_task':
      return delegateModelTaskTool(args, context)
    case 'agent_write_artifact':
      return agentWriteArtifactTool(args, context)
    case 'spawn_sub_agent':
      return spawnSubAgentTool(args, context)
    case 'get_sub_agent_status':
      return getSubAgentStatusTool(args, context)
    // IDE 模式工具
    case 'ide_read_file':
      return ideReadFileTool(args)
    case 'ide_write_file':
      return ideWriteFileTool(args)
    case 'ide_list_directory':
      return ideListDirectoryTool(args)
    case 'ide_search_files':
      return ideSearchFilesTool(args)
    case 'ide_run_command':
      return ideRunCommandTool(args)
    case 'ide_create_plan':
      return ideCreatePlanToolV2(args)
    case 'ide_update_plan_status':
      return ideUpdatePlanStatusTool(args)
    case 'ide_advance_task':
      return ideAdvanceTaskTool(args, context)
    case 'ide_replan_plan':
      return ideReplanPlanTool(args, context)
    case 'ide_get_plan':
      return ideGetPlanTool(args)
    case 'ide_get_autonomy_run':
      return ideGetAutonomyRunTool(args)
    case 'ide_sync_autonomy_run':
      return ideSyncAutonomyRunTool(args)
    case 'ide_log':
      return ideLogTool(args)
    case 'web_search':
      return webSearchTool(args)
    default:
      if (isManagedMcpToolInvocationName(toolCall.name)) {
        return callManagedMcpTool(toolCall.name, args)
      }

      return { output: '', error: `未知工具: ${toolCall.name}` }
  }
}

// ==================== 联网搜索工具 ====================

/**
 * 联网搜索工具
 * 支持 DuckDuckGo Instant Answer API（无需密钥）以及 Electron 内置搜索
 */
async function webSearchTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = normalizeTextValue(args.query)
  if (!query) {
    return errorResult('搜索关键词不能为空')
  }

  const maxResults = Math.min(Math.max(Number(args.maxResults) || 5, 1), 10)
  const searchType = typeof args.searchType === 'string' ? args.searchType : 'general'

  // 优先使用 Electron 内置搜索接口
  if ((window.electronAPI as any)?.webSearch) {
    try {
      const result = await (window.electronAPI as any).webSearch({ query, maxResults, searchType })
      if (result?.results?.length > 0) {
        return successResult(`搜索完成，返回 ${result.results.length} 条结果`, {
          query,
          searchType,
          results: result.results
        })
      }
    } catch {
      // fallback to DuckDuckGo
    }
  }

  // 降级方案：DuckDuckGo Instant Answer API（无需 API Key）
  try {
    const encodedQuery = encodeURIComponent(query)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_redirect=1&no_html=1&skip_disambig=1`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let ddgResponse: Response
    try {
      ddgResponse = await fetch(ddgUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'OpenAgent/1.0' }
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!ddgResponse.ok) {
      throw new Error(`DuckDuckGo API 返回 ${ddgResponse.status}`)
    }

    const ddgData = await ddgResponse.json() as {
      Abstract?: string
      AbstractText?: string
      AbstractURL?: string
      AbstractSource?: string
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string }>
      Results?: Array<{ Text?: string; FirstURL?: string }>
      Answer?: string
      AnswerType?: string
      Definition?: string
      DefinitionURL?: string
      Heading?: string
    }

    const results: Array<{ title: string; snippet: string; url: string }> = []

    if (ddgData.Answer) {
      results.push({ title: `直接答案 (${ddgData.AnswerType || 'answer'})`, snippet: ddgData.Answer, url: '' })
    }

    if (ddgData.AbstractText || ddgData.Abstract) {
      results.push({
        title: ddgData.Heading || ddgData.AbstractSource || '摘要',
        snippet: ddgData.AbstractText || ddgData.Abstract || '',
        url: ddgData.AbstractURL || ''
      })
    }

    if (ddgData.Definition) {
      results.push({ title: '定义', snippet: ddgData.Definition, url: ddgData.DefinitionURL || '' })
    }

    const related = ddgData.RelatedTopics || []
    for (const topic of related) {
      if (results.length >= maxResults) break
      if (topic.Text && topic.FirstURL) {
        results.push({ title: topic.Name || topic.Text.slice(0, 60), snippet: topic.Text, url: topic.FirstURL })
      }
    }

    const directResults = ddgData.Results || []
    for (const r of directResults) {
      if (results.length >= maxResults) break
      if (r.Text && r.FirstURL) {
        results.push({ title: r.Text.slice(0, 60), snippet: r.Text, url: r.FirstURL })
      }
    }

    if (results.length === 0) {
      return successResult(`搜索"${query}"完成，但未返回即时答案；建议尝试更具体的关键词或安装搜索类 MCP 服务器。`, {
        query, searchType, results: [],
        tip: '可在「AI 设置 > 托管资源 > MCP 服务器」中安装 brave-search 或 tavily 以获得更强的联网搜索能力。'
      })
    }

    return successResult(`搜索"${query}"完成，返回 ${results.length} 条结果`, {
      query, searchType, source: 'duckduckgo', results
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '搜索请求失败'
    return errorResult(`联网搜索失败: ${errMsg}。建议安装 brave-search 或 tavily MCP 服务器以获得完整搜索能力。`, {
      query,
      tip: '可在「AI 设置 > 托管资源 > MCP 服务器」中安装搜索类 MCP 以启用完整联网搜索。'
    })
  }
}

function ensureWindowsMcpEnabled() {
  const settingsStore = useSettingsStore()

  if (!settingsStore.settings.windowsMcpEnabled) {
    return errorResult('Windows MCP 当前已关闭，请先在设置中启用后再执行系统级操作', {
      windowsMcpEnabled: false
    })
  }

  return null
}

// ==================== 账号相关工具 ====================

async function queryAccounts(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const accountStore = useAccountStore()
  const typeStore = useAccountTypeStore()
  const typeId = args.typeId as string | undefined
  const status = (args.status as string) || 'all'
  const keyword = (args.keyword as string) || ''
  const limit = Math.min((args.limit as number) || 20, 100)

  let results: Account[] = []

  if (typeId) {
    results = status === 'exported'
      ? accountStore.getByType(typeId).filter(a => a.status === 'exported')
      : status === 'in_stock'
        ? accountStore.getInStockByType(typeId)
        : accountStore.getByType(typeId)
  } else {
    results = status === 'exported'
      ? accountStore.accounts.filter(a => a.status === 'exported')
      : status === 'in_stock'
        ? accountStore.accounts.filter(a => a.status === 'in_stock')
        : [...accountStore.accounts]
  }

  // 关键字过滤
  if (keyword) {
    const kw = keyword.toLowerCase()
    results = results.filter(a => {
      const dataStr = Object.values(a.data).join(' ').toLowerCase()
      return dataStr.includes(kw) || a.notes.toLowerCase().includes(kw) || a.source.toLowerCase().includes(kw)
    })
  }

  const totalMatched = results.length
  results = results.slice(0, limit)

  const typeMap = new Map(typeStore.typeList.map(t => [t.id, t.name]))
  const records = results.map(account => ({
    id: account.id,
    typeId: account.typeId,
    typeName: typeMap.get(account.typeId) || account.typeId,
    status: account.status,
    source: account.source,
    cost: account.cost,
    notes: account.notes,
    importTime: account.importTime,
    importBatchId: account.importBatchId,
    exportRecord: account.exportRecord || null,
    data: account.data
  }))

  return successResult(results.length > 0 ? `找到 ${results.length} 条账号` : '未找到匹配的账号', {
    filters: {
      typeId: typeId || null,
      status,
      keyword,
      limit
    },
    totalMatched,
    returnedCount: records.length,
    accounts: records
  })
}

async function importAccounts(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const accountStore = useAccountStore()
  const typeStore = useAccountTypeStore()
  const typeId = args.typeId as string
  const accounts = args.accounts as Record<string, string>[]
  const source = typeof args.source === 'string' ? args.source.trim() : ''
  const totalCost = typeof args.totalCost === 'number' ? args.totalCost : 0

  if (!typeId) return errorResult('缺少账号类型ID')
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    return errorResult('账号数据为空')
  }

  const type = typeStore.typeList.find(t => t.id === typeId)
  if (!type) return errorResult(`类型 ${typeId} 不存在`)

  const validation = validateAccountPayload(type, accounts)
  if ('error' in validation) {
    return errorResult(validation.error || '账号字段校验失败', {
      typeId,
      typeName: type.name,
      expectedFields: type.fields.map(field => ({
        key: field.key,
        name: field.name,
        required: field.required
      }))
    })
  }

  try {
    const batch = await accountStore.importAccounts(typeId, validation.normalizedAccounts, source, totalCost)
    return successResult(`成功导入 ${batch.count} 条 ${type.name} 账号`, {
      typeId,
      typeName: type.name,
      batch,
      normalizedAccounts: validation.normalizedAccounts
    })
  } catch (error) {
    return errorResult(`导入失败: ${(error as Error).message}`)
  }
}

async function exportAccounts(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const accountStore = useAccountStore()
  const typeStore = useAccountTypeStore()
  const typeId = args.typeId as string
  const accountIds = args.accountIds as string[]
  const destination = typeof args.destination === 'string' ? args.destination.trim() : ''
  const totalProfit = typeof args.totalProfit === 'number' ? args.totalProfit : 0

  if (!typeId) return errorResult('缺少账号类型ID')
  if (!accountIds || accountIds.length === 0) return errorResult('账号ID列表为空')

  const type = typeStore.typeList.find(t => t.id === typeId)
  if (!type) return errorResult(`类型 ${typeId} 不存在`)

  const exportableAccounts = accountStore.accounts.filter(account =>
    account.typeId === typeId
    && account.status === 'in_stock'
    && accountIds.includes(account.id)
  )
  const missingIds = accountIds.filter(id => !exportableAccounts.some(account => account.id === id))

  if (missingIds.length > 0) {
    return errorResult('存在无效账号 ID，或账号已不在可导出状态', {
      typeId,
      typeName: type.name,
      missingIds
    })
  }

  try {
    const batch = await accountStore.exportAccounts(typeId, accountIds, destination, totalProfit)
    return successResult(`成功导出 ${batch.count} 条 ${type.name} 账号`, {
      typeId,
      typeName: type.name,
      batch,
      destination,
      totalProfit
    })
  } catch (error) {
    return errorResult(`导出失败: ${(error as Error).message}`)
  }
}

async function getAccountTypes(): Promise<ToolExecutionResult> {
  const typeStore = useAccountTypeStore()
  const types = typeStore.typeList

  if (types.length === 0) {
    return successResult('当前没有任何账号类型', {
      count: 0,
      types: []
    })
  }

  return successResult(`共 ${types.length} 个账号类型`, {
    count: types.length,
    types: types.map(type => ({
      id: type.id,
      name: type.name,
      color: type.color,
      importSeparator: type.importSeparator,
      accountSeparator: type.accountSeparator,
      exportSeparator: type.exportSeparator,
      exportAccountSeparator: type.exportAccountSeparator,
      fields: type.fields.map(field => ({
        key: field.key,
        name: field.name,
        required: field.required
      }))
    }))
  })
}

async function createAccountType(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const typeStore = useAccountTypeStore()
  const rawName = normalizeTextValue(args.name)
  const rawFields = Array.isArray(args.fields) ? args.fields : []

  if (!rawName) {
    return errorResult('缺少账号类型名称')
  }

  if (rawFields.length === 0) {
    return errorResult('字段定义不能为空')
  }

  const existedType = typeStore.typeList.find(type => type.name.trim().toLowerCase() === rawName.toLowerCase())
  if (existedType) {
    return successResult(`账号类型 ${existedType.name} 已存在，无需重复创建`, {
      reused: true,
      type: existedType
    })
  }

  const normalizedFields = rawFields
    .filter(item => item && typeof item === 'object')
    .map(item => item as Record<string, unknown>)
    .map(item => ({
      key: normalizeFieldKey(normalizeTextValue(item.key || item.name)),
      name: normalizeTextValue(item.name || item.key),
      required: Boolean(item.required)
    }))
    .filter(field => field.key && field.name)

  if (normalizedFields.length === 0) {
    return errorResult('没有可用的字段定义')
  }

  const uniqueFieldKeys = new Set(normalizedFields.map(field => field.key))
  if (uniqueFieldKeys.size !== normalizedFields.length) {
    return errorResult('字段 key 存在重复，请确保每个字段 key 唯一')
  }

  const createdType = await typeStore.addType({
    name: rawName,
    icon: '',
    color: normalizeTextValue(args.color) || '#5b9bd5',
    fields: normalizedFields,
    importSeparator: normalizeTextValue(args.importSeparator) || '-',
    exportSeparator: normalizeTextValue(args.exportSeparator) || '-',
    accountSeparator: normalizeTextValue(args.accountSeparator) || '\n',
    exportAccountSeparator: normalizeTextValue(args.exportAccountSeparator) || '\n'
  })

  return successResult(`已创建账号类型 ${createdType.name}`, {
    type: createdType
  })
}

async function getLive2DModels(): Promise<ToolExecutionResult> {
  const settingsStore = useSettingsStore()
  const availableModels = await listLocalLive2DModels()

  return successResult('已返回当前 Live2D 模型清单', {
    activeModel: {
      name: settingsStore.settings.live2dModelName,
      runtimePath: settingsStore.settings.live2dModel,
      source: settingsStore.settings.live2dModelSource
    },
    availableModels: availableModels.map(model => ({
      id: model.id,
      name: model.name,
      source: model.source,
      runtimePath: model.runtimePath,
      localPath: model.localPath || null
    }))
  })
}

async function updateTaskPlanTool(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const sessionId = context.sessionId || aiStore.activeSessionId

  if (!sessionId) {
    return errorResult('当前没有活跃会话，无法更新任务计划')
  }

  const steps = Array.isArray(args.steps)
    ? args.steps
        .filter(step => step && typeof step === 'object')
        .map(step => step as Record<string, unknown>)
        .map((step, index) => ({
          id: typeof step.id === 'string' && step.id ? step.id : `task-step-${index + 1}`,
          title: normalizeTextValue(step.title),
          status: ['in_progress', 'completed', 'blocked'].includes(normalizeTextValue(step.status))
            ? normalizeTextValue(step.status) as AITaskStep['status']
            : 'pending',
          note: normalizeTextValue(step.note) || undefined
        }))
        .filter(step => step.title)
    : []

  const task = aiStore.updateTaskPlan(sessionId, {
    goal: normalizeTextValue(args.goal) || aiStore.activeSession?.title || '未命名任务',
    status: ['planning', 'completed', 'blocked'].includes(normalizeTextValue(args.status))
      ? normalizeTextValue(args.status) as 'planning' | 'completed' | 'blocked'
      : 'running',
    summary: normalizeTextValue(args.summary),
    steps,
    maxIterations: typeof args.maxIterations === 'number' ? args.maxIterations : undefined
  })

  return successResult('任务计划已更新', {
    task
  })
}

async function completeTaskTool(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const sessionId = context.sessionId || aiStore.activeSessionId

  if (!sessionId) {
    return errorResult('当前没有活跃会话，无法完成任务')
  }

  const summary = normalizeTextValue(args.summary)
  if (!summary) {
    return errorResult('任务完成摘要不能为空')
  }

  const task = aiStore.completeTask(sessionId, summary)
  if (!task) {
    return errorResult('当前没有可完成的任务')
  }

  return successResult('任务已标记完成并归档', {
    task
  })
}

async function getWindowsMcpStatus(): Promise<ToolExecutionResult> {
  const settingsStore = useSettingsStore()

  return successResult('已返回 Windows MCP 状态', {
    builtIn: Boolean(window.electronAPI),
    enabled: settingsStore.settings.windowsMcpEnabled,
    capabilities: settingsStore.settings.windowsMcpEnabled
      ? ['execute_command', 'read_screen', 'mouse_click', 'keyboard_input', 'list_windows', 'focus_window']
      : [],
    note: settingsStore.settings.windowsMcpEnabled
      ? '当前可执行系统级辅助操作，调用前仍需遵守安全确认规则。'
      : '当前已关闭系统级 MCP，模型不应继续调用对应工具。'
  })
}

async function navigateApp(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const path = normalizeTextValue(args.path)

  if (!path) {
    return errorResult('缺少应用页面路径 path')
  }

  const allowedPaths = new Set(['/accounts', '/types', '/import', '/export', '/records', '/settings', '/ai-settings', '/ai', '/data'])
  if (!allowedPaths.has(path)) {
    return errorResult(`不支持的页面路径: ${path}`, {
      allowedPaths: Array.from(allowedPaths)
    })
  }

  if (window.electronAPI?.showMainWindow && window.electronAPI?.navigateMainWindow) {
    window.electronAPI.showMainWindow()
    window.electronAPI.navigateMainWindow(path)
    return successResult(`已打开主窗口并跳转到 ${path}`, { path })
  }

  await router.push(path)
  return successResult(`已跳转到 ${path}`, { path })
}

async function setLive2DEnabled(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const enabled = Boolean(args.enabled)
  const settingsStore = useSettingsStore()

  await settingsStore.update({ live2dEnabled: enabled })

  if (enabled) {
    window.electronAPI?.showLive2DWindow?.()
  } else {
    window.electronAPI?.hideLive2DWindow?.()
  }

  return successResult(enabled ? '已显示 Live2D 悬浮窗' : '已隐藏 Live2D 悬浮窗', {
    enabled
  })
}

// ==================== 记忆工具 ====================

async function rememberInfo(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const content = args.content as string
  const category = (args.category as 'preference' | 'fact' | 'context' | 'instruction') || 'fact'
  const sessionId = context.sessionId || ''
  const session = sessionId ? aiStore.getSessionById(sessionId) : null
  const scope = session?.scope || (sessionId ? aiStore.resolveSessionScope(sessionId) : 'main')
  const sessionAgent = session ? aiStore.getSessionAgent(session) : null

  if (!content) return errorResult('记忆内容为空')

  const entry = aiStore.addMemory(content, category, 'ai', scope, sessionAgent?.id)
  return successResult(`已写入长期记忆: ${entry.content}`, {
    memory: entry
  })
}

// ==================== 托管扩展资源工具 ====================

async function getManagedAIResources(): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()

  return successResult('已返回统一托管扩展资源清单', {
    updatedAt: resourcesStore.registry.updatedAt,
    mcpServers: resourcesStore.registry.mcpServers.map(server => ({
      id: server.id,
      name: server.name,
      description: server.description,
      enabled: server.enabled,
      source: server.source,
      packageName: server.packageName || null,
      command: server.command,
      args: server.args,
      installedAt: server.installedAt || null,
      lastError: server.lastError || null,
      toolCount: server.tools.length,
      tools: server.tools.map(tool => ({
        invocationName: tool.invocationName,
        originalName: tool.originalName,
        description: tool.description
      }))
    })),
    skills: resourcesStore.registry.skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
      source: skill.source,
      updatedAt: skill.updatedAt
    }))
  })
}

async function installManagedMcpServer(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const packageName = normalizeTextValue(args.packageName)
  const serverId = normalizeTextValue(args.id || args.name || packageName || args.command)
  const serverName = normalizeTextValue(args.name || packageName || args.command || serverId)
  const description = normalizeTextValue(args.description)
  const entryCommand = normalizeTextValue(args.entryCommand) || undefined
  const env = normalizeEnvRecord(args.env)
  const cwd = normalizeTextValue(args.cwd) || undefined
  const enabled = typeof args.enabled === 'boolean' ? Boolean(args.enabled) : true
  let command = normalizeTextValue(args.command)
  let launchArgs = normalizeStringArray(args.args)
  let installResult: Awaited<ReturnType<NonNullable<typeof window.electronAPI.mcpInstallManagedPackage>>> | null = null
  let installDirectory: string | undefined
  let installedAt: number | undefined

  if (!serverId) {
    return errorResult('缺少托管 MCP 服务器 ID、名称、包名或启动命令')
  }

  if (!serverName) {
    return errorResult('缺少托管 MCP 服务器名称')
  }

  const existingServer = resourcesStore.getManagedMcpServer(serverId)
  const duplicatedServer = resourcesStore.findManagedMcpServerBySignature({
    packageName: packageName || undefined,
    entryCommand,
    command,
    args: launchArgs,
    env,
    cwd
  })

  if (!existingServer && duplicatedServer) {
    return successResult(`托管 MCP 服务器 ${duplicatedServer.name} 已存在，无需重复安装`, {
      reused: true,
      server: duplicatedServer
    })
  }

  if (packageName) {
    if (!window.electronAPI?.mcpInstallManagedPackage) {
      return errorResult('当前环境不支持安装托管 MCP 包')
    }

    installResult = await window.electronAPI.mcpInstallManagedPackage({
      serverId,
      packageName,
      entryCommand,
      args: launchArgs
    })

    if (!installResult.success) {
      return errorResult('托管 MCP 包安装失败', {
        install: installResult
      })
    }

    command = installResult.command
    launchArgs = installResult.args
    installDirectory = installResult.installDirectory
    installedAt = Date.now()
  }

  if (!command) {
    return errorResult('缺少托管 MCP 服务器启动命令')
  }

  if (!window.electronAPI?.mcpInspectManagedServer) {
    return errorResult('当前环境不支持探测托管 MCP 服务器')
  }

  const inspection = await window.electronAPI.mcpInspectManagedServer({
    command,
    args: launchArgs,
    env,
    cwd: cwd || installDirectory
  })

  const server = await resourcesStore.upsertManagedMcpServer({
    id: serverId,
    name: serverName,
    description,
    enabled: inspection.success ? enabled : false,
    packageName: packageName || undefined,
    installDirectory,
    entryCommand,
    command,
    args: launchArgs,
    env,
    cwd: cwd || installDirectory,
    source: 'ai',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    installedAt,
    lastError: inspection.error,
    serverInfo: inspection.serverInfo,
    tools: inspection.tools
  })

  if (!inspection.success) {
    return errorResult('托管 MCP 服务器已登记，但工具探测失败', {
      server,
      inspection,
      install: installResult
    })
  }

  return successResult('托管 MCP 服务器已安装并同步工具列表', {
    server,
    inspection,
    install: installResult
  })
}

async function refreshManagedMcpServerTools(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const serverId = normalizeTextValue(args.serverId)
  if (!serverId) {
    return errorResult('缺少托管 MCP 服务器 ID')
  }

  const existingServer = resourcesStore.getManagedMcpServer(serverId)
  if (!existingServer) {
    return errorResult(`托管 MCP 服务器 ${serverId} 不存在`)
  }

  if (!window.electronAPI?.mcpInspectManagedServer) {
    return errorResult('当前环境不支持探测托管 MCP 服务器')
  }

  const inspection = await window.electronAPI.mcpInspectManagedServer({
    command: existingServer.command,
    args: existingServer.args,
    env: existingServer.env,
    cwd: existingServer.cwd
  })

  const server = await resourcesStore.upsertManagedMcpServer({
    ...existingServer,
    enabled: inspection.success ? existingServer.enabled : false,
    lastError: inspection.error,
    serverInfo: inspection.serverInfo,
    tools: inspection.tools
  })

  if (!inspection.success) {
    return errorResult('托管 MCP 服务器工具刷新失败，已自动停用该服务器', {
      server,
      inspection
    })
  }

  return successResult('托管 MCP 服务器工具列表已刷新', {
    server,
    inspection
  })
}

async function setManagedMcpServerEnabled(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const serverId = normalizeTextValue(args.serverId)
  if (!serverId) {
    return errorResult('缺少托管 MCP 服务器 ID')
  }

  const server = await resourcesStore.setManagedMcpServerEnabled(serverId, Boolean(args.enabled))
  if (!server) {
    return errorResult(`托管 MCP 服务器 ${serverId} 不存在`)
  }

  return successResult(server.enabled ? '托管 MCP 服务器已启用' : '托管 MCP 服务器已停用', {
    server
  })
}

async function removeManagedMcpServer(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const serverId = normalizeTextValue(args.serverId)
  if (!serverId) {
    return errorResult('缺少托管 MCP 服务器 ID')
  }

  const removed = await resourcesStore.removeManagedMcpServer(serverId)
  if (!removed) {
    return errorResult(`托管 MCP 服务器 ${serverId} 不存在`)
  }

  return successResult('托管 MCP 服务器已移除', {
    serverId
  })
}

async function upsertManagedSkill(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const name = normalizeTextValue(args.name)
  const content = normalizeTextValue(args.content)
  const skillId = normalizeTextValue(args.skillId)
  if (!name || !content) {
    return errorResult('新增或更新技能时必须提供 name 和 content')
  }

  const existingSkill = skillId ? resourcesStore.registry.skills.find(item => item.id === skillId) : null
  const duplicatedSkill = resourcesStore.findManagedSkillBySignature({
    name,
    content
  })

  if (!existingSkill && duplicatedSkill) {
    return successResult(`技能 ${duplicatedSkill.name} 已存在，无需重复保存`, {
      reused: true,
      skill: duplicatedSkill
    })
  }

  const skill = await resourcesStore.upsertManagedSkill({
    id: skillId || undefined,
    name,
    description: normalizeTextValue(args.description),
    content,
    enabled: typeof args.enabled === 'boolean' ? Boolean(args.enabled) : true,
    source: 'ai'
  })

  return successResult('托管技能已保存', {
    skill
  })
}

async function setManagedSkillEnabled(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const skillId = normalizeTextValue(args.skillId)
  if (!skillId) {
    return errorResult('缺少技能 ID')
  }

  const skill = await resourcesStore.setManagedSkillEnabled(skillId, Boolean(args.enabled))
  if (!skill) {
    return errorResult(`技能 ${skillId} 不存在`)
  }

  return successResult(skill.enabled ? '托管技能已启用' : '托管技能已停用', {
    skill
  })
}

async function removeManagedSkill(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const skillId = normalizeTextValue(args.skillId)
  if (!skillId) {
    return errorResult('缺少技能 ID')
  }

  const removed = await resourcesStore.removeManagedSkill(skillId)
  if (!removed) {
    return errorResult(`技能 ${skillId} 不存在`)
  }

  return successResult('托管技能已移除', {
    skillId
  })
}

async function callManagedMcpTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const resourcesStore = await ensureResourcesStoreReady()
  const match = resourcesStore.findManagedMcpTool(toolName)
  if (!match) {
    return errorResult(`托管 MCP 工具 ${toolName} 不存在`)
  }

  if (!match.server.enabled) {
    return errorResult(`托管 MCP 服务器 ${match.server.name} 当前已停用，无法调用 ${toolName}`)
  }

  if (!window.electronAPI?.mcpCallManagedTool) {
    return errorResult('当前环境不支持调用托管 MCP 工具')
  }

  const result = await window.electronAPI.mcpCallManagedTool({
    command: match.server.command,
    args: match.server.args,
    env: match.server.env,
    cwd: match.server.cwd,
    toolName: match.tool.originalName,
    arguments: args
  })

  if (result.error) {
    return errorResult(result.error, {
      serverId: match.server.id,
      serverName: match.server.name,
      toolName,
      originalToolName: match.tool.originalName,
      data: result.data || null
    })
  }

  return successResult(`托管 MCP 工具 ${toolName} 调用成功`, {
    serverId: match.server.id,
    serverName: match.server.name,
    toolName,
    originalToolName: match.tool.originalName,
    output: result.output || '',
    data: result.data || null
  })
}

// ==================== Agent 增强工具 ====================

async function routeModelTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const task = normalizeTextValue(args.task)

  if (!task) {
    return errorResult('缺少任务描述')
  }

  const modelCatalog = await resolveAvailableModelsForRouting()
  if (modelCatalog.models.length === 0) {
    return errorResult('当前没有可用于模型路由的模型')
  }

  const decision = routeModel(
    task,
    modelCatalog.models,
    aiStore.config.protocol,
    {
      preferSpeed: args.preferSpeed === true,
    },
  )

  if (!decision) {
    return errorResult('模型路由失败，未找到可用模型')
  }

  return successResult('模型路由完成', {
    decision,
    availableModelCount: modelCatalog.models.length,
    catalogSource: modelCatalog.source,
    ...(modelCatalog.warning ? { warning: modelCatalog.warning } : {}),
  })
}

function normalizeRequiredCapabilities(value: unknown) {
  const allowedCapabilities = new Set(['vision', 'thinking', 'toolUse', 'imageInput', 'taskPlanning', 'mcpControl'])
  return normalizeStringArray(value).filter(item => allowedCapabilities.has(item))
}

function normalizeArtifactRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/').trim().replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    return ''
  }

  return normalized
    .split('/')
    .filter(Boolean)
    .map(segment => {
      const dotIndex = segment.lastIndexOf('.')
      const stem = dotIndex > 0 ? segment.slice(0, dotIndex) : segment
      const extension = dotIndex > 0 ? segment.slice(dotIndex).replace(/[^.a-z0-9_-]/gi, '') : ''
      return `${sanitizeDirectorySegment(stem || 'artifact', 'artifact')}${extension}`
    })
    .join('/')
}

function getToolContextSession(context: ToolExecutionContext) {
  const aiStore = useAIStore()
  const sessionId = context.sessionId || aiStore.activeSessionId
  return sessionId ? aiStore.getSessionById(sessionId) : null
}

function getLatestAttachmentCarrier(sessionId: string) {
  const aiStore = useAIStore()
  const session = aiStore.getSessionById(sessionId)
  if (!session) {
    return null
  }

  return [...session.messages]
    .reverse()
    .find(message => Array.isArray(message.attachments) && message.attachments.length > 0) ?? null
}

async function delegateModelTaskTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const session = getToolContextSession(context)
  const task = normalizeTextValue(args.task)
  const requestedModel = normalizeTextValue(args.model)
  const note = normalizeTextValue(args.note)
  const includeLatestAttachments = args.includeLatestAttachments !== false

  if (!task) {
    return errorResult('模型委派需要提供 task')
  }

  const baseConfig = aiStore.getEffectiveConfig(session || 'main')
  const modelCatalog = await resolveAvailableModelsForRouting()
  if (modelCatalog.models.length === 0) {
    return errorResult('当前接口没有可用模型，无法执行模型委派')
  }

  const matchedRequestedModel = requestedModel
    ? modelCatalog.models.find(model => model.id === requestedModel || model.name === requestedModel || model.label === requestedModel) ?? null
    : null
  const requiredCapabilities = normalizeRequiredCapabilities(args.requiredCapabilities)
  const recommended = routeModel(
    task,
    modelCatalog.models,
    baseConfig.protocol,
    {
      requiredCapabilities: requiredCapabilities as Array<'vision' | 'thinking' | 'toolUse' | 'imageInput' | 'taskPlanning' | 'mcpControl'>,
    },
  )

  const delegatedModel = matchedRequestedModel?.id || recommended?.model || baseConfig.model
  const selectionMode = matchedRequestedModel ? 'manual' : recommended?.model ? 'router' : 'fallback'
  const selectionReason = matchedRequestedModel
    ? `显式指定委派模型：${matchedRequestedModel.label || matchedRequestedModel.id}`
    : recommended?.reason || `未命中更优路由，回退到当前模型 ${delegatedModel}`

  const delegateMessages: AIChatMessage[] = [
    {
      id: 'delegate-system',
      role: 'system' as const,
      content: [
        '你是主 Agent 创建的一次性模型委派执行器。',
        '只完成当前委派任务，不要调用工具，不要改写用户意图，不要假装已经执行桌面或文件操作。',
        '输出应尽量结构化，直接给出结论、关键依据、风险与建议下一步。',
      ].join('\n'),
      timestamp: 0,
    },
    {
      id: 'delegate-user',
      role: 'user' as const,
      content: [
        `委派任务：${task}`,
        note ? `补充约束：${note}` : '',
        session?.summary ? `当前会话长摘要：${session.summary}` : '',
        session?.id ? `共享上下文：\n${buildSharedContext(session.id)}` : '',
      ].filter(Boolean).join('\n\n'),
      timestamp: 0,
      attachments: [],
    },
  ]

  if (session?.id && includeLatestAttachments) {
    const latestAttachmentCarrier = getLatestAttachmentCarrier(session.id)
    if (latestAttachmentCarrier?.attachments?.length) {
      delegateMessages[1].attachments = latestAttachmentCarrier.attachments
    }
  }

  const delegatedConfig = {
    ...baseConfig,
    model: delegatedModel,
  }

  const result = await chatCompletion(
    delegatedConfig,
    delegateMessages,
    { ...aiStore.preferences, autoMemory: false },
    { includeTools: false },
  )

  return successResult('模型委派已完成', {
    selectedModel: delegatedModel,
    selectionMode,
    selectionReason,
    availableModelCount: modelCatalog.models.length,
    catalogSource: modelCatalog.source,
    content: result.content,
    reasoningContent: result.reasoningContent || '',
    requiredCapabilities,
    attachmentCount: delegateMessages[1].attachments?.length || 0,
    ...(modelCatalog.warning ? { warning: modelCatalog.warning } : {}),
  })
}

async function agentWriteArtifactTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const session = getToolContextSession(context)
  const agent = session ? aiStore.getSessionAgent(session) : aiStore.getSelectedAgent('main')
  const relativePath = normalizeArtifactRelativePath(normalizeTextValue(args.relativePath))
  const content = typeof args.content === 'string' ? args.content : ''
  const requestedRoot = normalizeTextValue(args.targetRoot)

  if (!relativePath) {
    return errorResult('写入 Agent 产物需要提供合法的 relativePath，且不能包含 ..')
  }

  if (!window.electronAPI?.ideWriteFile) {
    return errorResult('当前环境不支持写入本地产物目录')
  }

  const storage = await resolveAgentStorageLayout(
    agent?.id || 'agent',
    agent?.name,
    requestedRoot || agent?.preferredArtifactRoot,
  )
  const targetPath = joinRuntimePath(storage.artifactsDirectory, relativePath)
  const saved = await window.electronAPI.ideWriteFile(targetPath, content)
  if (!saved) {
    return errorResult('Agent 产物写入失败', { path: targetPath })
  }

  return successResult('Agent 产物已写入', {
    agentId: agent?.id || 'agent',
    agentName: agent?.name || 'Agent',
    path: targetPath,
    dataDirectory: storage.dataDirectory,
    artifactsDirectory: storage.artifactsDirectory,
    bytes: content.length,
  })
}

async function spawnSubAgentTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const parentSessionId = context.sessionId || aiStore.activeSessionId
  const name = normalizeTextValue(args.name)
  const role = normalizeTextValue(args.role)
  const task = normalizeTextValue(args.task)
  const requestedModel = normalizeTextValue(args.model)
  const planId = normalizeTextValue(args.planId)
  const taskId = normalizeTextValue(args.taskId)

  if (!parentSessionId) {
    return errorResult('当前没有活动会话，无法生成子代理')
  }

  if (!name || !role || !task) {
    return errorResult('生成子代理需要 name、role、task')
  }

  const modelCatalog = await resolveAvailableModelsForRouting()
  const sharedContext = buildSharedContext(parentSessionId)
  const parentContext = [normalizeTextValue(args.contextFromParent), sharedContext]
    .filter(Boolean)
    .join('\n\n')

  const recommended = recommendSubAgentModel(
    role,
    task,
    modelCatalog.models,
    aiStore.config.protocol,
  )

  const matchedRequestedModel = requestedModel
    ? modelCatalog.models.find(model => model.id === requestedModel || model.name === requestedModel || model.label === requestedModel) ?? null
    : null

  const selectedModel = matchedRequestedModel?.id
    || ((requestedModel && modelCatalog.models.length === 0) ? requestedModel : '')
  const delegatedModel = selectedModel
    || recommended?.model
    || aiStore.config.model

  if (!delegatedModel) {
    return errorResult('当前没有可用于子代理的模型')
  }

  const selectionMode = matchedRequestedModel
    ? 'manual'
    : recommended?.model
      ? 'router'
      : 'fallback'
  const modelReason = matchedRequestedModel
    ? `主代理显式指定子代理使用 ${matchedRequestedModel.label || matchedRequestedModel.id}。`
    : recommended?.reason
      || `未获取到更优模型路由，已回退到当前模型 ${delegatedModel}。`
  const selectionWarning = requestedModel && !matchedRequestedModel && modelCatalog.models.length > 0
    ? `指定模型 ${requestedModel} 不在当前接口返回的模型列表中，已按自动路由改用 ${delegatedModel}。`
    : modelCatalog.warning

  const result = await spawnAndRunSubAgent(parentSessionId, {
    name,
    role,
    task,
    planId: planId || undefined,
    taskId: taskId || undefined,
    contextFromParent: parentContext,
    model: delegatedModel,
    protocol: recommended?.protocol || aiStore.config.protocol,
    modelReason,
    selectedCapabilities: recommended?.capabilities || [],
    availableModelCount: modelCatalog.models.length,
    selectionMode,
  })

  const { workspace, plan } = getLatestPlanInActiveWorkspace()
  if (workspace && plan) {
    aiStore.addDevLog(plan.id, {
      type: result.success ? 'milestone' : 'error',
      title: `${result.success ? '子代理完成' : '子代理失败'}: ${name}`,
      content: [
        `角色：${role}`,
        `模型：${delegatedModel}`,
        `选型方式：${selectionMode}`,
        `选型理由：${modelReason}`,
        selectionWarning ? `选型告警：${selectionWarning}` : '',
        `任务：${task}`,
        result.output ? `结果摘要：${result.output.slice(0, 600)}` : '',
      ].filter(Boolean).join('\n'),
      metadata: {
        subAgentName: name,
        subAgentRole: role,
        planId: planId || undefined,
        taskId: taskId || undefined,
        model: delegatedModel,
        selectionMode,
        availableModelCount: modelCatalog.models.length,
        selectedCapabilities: recommended?.capabilities || [],
      },
    })
    await flushPlanToWorkspace(workspace, aiStore.getProjectPlan(plan.id) || plan)
  }

  if (!result.success) {
    return errorResult('子代理执行失败', {
      result,
      selectedModel: delegatedModel,
      selectionMode,
      modelReason,
      availableModelCount: modelCatalog.models.length,
      ...(selectionWarning ? { warning: selectionWarning } : {}),
    })
  }

  return successResult('子代理执行完成', {
    result,
    selectedModel: delegatedModel,
    selectionMode,
    modelReason,
    availableModelCount: modelCatalog.models.length,
    selectedCapabilities: recommended?.capabilities || [],
    catalogSource: modelCatalog.source,
    ...(selectionWarning ? { warning: selectionWarning } : {}),
  })
}

async function getSubAgentStatusTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const parentSessionId = context.sessionId || aiStore.activeSessionId
  const agentId = normalizeTextValue(args.agentId)

  if (!parentSessionId) {
    return errorResult('当前没有活动会话，无法读取子代理状态')
  }

  const agents = aiStore.getSubAgentsForSession(parentSessionId)
  if (!agentId) {
    return successResult(`已返回当前会话的 ${agents.length} 个子代理`, {
      sessionId: parentSessionId,
      agents,
    })
  }

  const agent = agents.find(item => item.id === agentId)
  if (!agent) {
    return errorResult('未找到指定子代理', {
      sessionId: parentSessionId,
      agentId,
    })
  }

  return successResult(`已返回子代理 ${agent.name} 的状态`, {
    sessionId: parentSessionId,
    agent,
  })
}

// ==================== IDE 模式工具 ====================

const ALLOWED_DEVLOG_TYPES: DevLogEntry['type'][] = [
  'plan',
  'task-start',
  'task-complete',
  'error',
  'decision',
  'milestone',
  'context-compress',
]

const ALLOWED_PROJECT_TASK_STATUSES: ProjectTaskStatus[] = [
  'pending',
  'in-progress',
  'completed',
  'failed',
  'skipped',
]

const ALLOWED_PLAN_STATUSES: PlanStatus[] = [
  'drafting',
  'approved',
  'in-progress',
  'completed',
  'paused',
]

function getActiveWorkspace() {
  const aiStore = useAIStore()
  if (aiStore.agentMode !== 'ide') {
    return null
  }

  return aiStore.ideWorkspace
}

function getWorkspaceForCommandTool() {
  const aiStore = useAIStore()
  if (aiStore.ideWorkspace) {
    return aiStore.ideWorkspace
  }

  return null
}

function normalizeCommandDuration(value: unknown, fallback: number, max: number) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(Math.max(numericValue, 3_000), max)
}

function resolveWorkspaceRelativePath(workspace: IDEWorkspace, inputPath: string) {
  const normalizedInput = inputPath.replace(/\\/g, '/').trim()
  if (!normalizedInput) {
    return workspace.rootPath
  }

  if (/^[a-z]:[\\/]/i.test(normalizedInput) || normalizedInput.startsWith('/')) {
    return normalizedInput.replace(/\//g, '\\')
  }

  const rootPath = workspace.rootPath.replace(/[\\/]+$/, '')
  const normalizedRelativePath = normalizedInput.replace(/\//g, '\\')
  return `${rootPath}\\${normalizedRelativePath}`
}

async function resolveIdeCommandCwd(workspace: IDEWorkspace, requestedCwd: string) {
  const targetPath = resolveWorkspaceRelativePath(workspace, requestedCwd)
  const api = window.electronAPI
  if (!api?.ideFileExists || !api?.ideFileStat) {
    throw new Error('当前环境不支持终端工作目录校验')
  }

  const exists = await api.ideFileExists(targetPath)
  if (!exists) {
    throw new Error('终端工作目录不存在')
  }

  const stat = await api.ideFileStat(targetPath)
  if (!stat?.isDirectory) {
    throw new Error('终端工作目录必须是文件夹')
  }

  return targetPath
}

function trimTerminalCapture(value: string) {
  if (value.length <= IDE_COMMAND_OUTPUT_LIMIT) {
    return {
      text: value,
      truncated: false,
    }
  }

  const headChars = Math.max(4_000, Math.floor(IDE_COMMAND_OUTPUT_LIMIT * 0.45))
  const tailChars = Math.max(4_000, IDE_COMMAND_OUTPUT_LIMIT - headChars)
  return {
    text: `${value.slice(0, headChars)}\n...[output truncated in middle]...\n${value.slice(-tailChars)}`,
    truncated: true,
  }
}

async function awaitIdeCommandResult(sessionId: string, overallTimeoutMs: number) {
  const api = window.electronAPI
  if (!api?.onIdeTerminalEvent || !api?.ideCancelCommand) {
    throw new Error('当前环境不支持终端事件监听')
  }

  return await new Promise<{
    status: 'completed' | 'failed' | 'cancelled'
    exitCode: number | null
    signal: string | null
    stdout: string
    stderr: string
    system: string
    durationMs: number
    eventError: string
    truncated: boolean
  }>((resolve) => {
    let stdout = ''
    let stderr = ''
    let system = ''
    let truncated = false
    const startedAt = Date.now()
    let finished = false
    let polling = false
    let lastHeartbeatAt = startedAt
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const finalize = (result: {
      status: 'completed' | 'failed' | 'cancelled'
      exitCode: number | null
      signal: string | null
      eventError: string
    }) => {
      if (finished) {
        return
      }

      finished = true
      clearTimeout(timeoutTimer)
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      removeListener?.()
      const trimmedStdout = trimTerminalCapture(stdout)
      const trimmedStderr = trimTerminalCapture(stderr)
      const trimmedSystem = trimTerminalCapture(system)
      truncated = truncated || trimmedStdout.truncated || trimmedStderr.truncated || trimmedSystem.truncated
      resolve({
        ...result,
        stdout: trimmedStdout.text,
        stderr: trimmedStderr.text,
        system: trimmedSystem.text,
        durationMs: Date.now() - startedAt,
        truncated,
      })
    }

    const pushChunk = (current: string, chunk: string) => {
      const next = `${current}${chunk}`
      if (next.length > IDE_COMMAND_CAPTURE_BUFFER_LIMIT) {
        truncated = true
        const preservedHead = next.slice(0, IDE_COMMAND_OUTPUT_LIMIT * 2)
        const preservedTail = next.slice(-(IDE_COMMAND_CAPTURE_BUFFER_LIMIT - IDE_COMMAND_OUTPUT_LIMIT * 2))
        return `${preservedHead}\n...[output truncated in middle]...\n${preservedTail}`
      }
      return next
    }

    const finalizeFromSnapshot = (snapshot: IDETerminalSessionSnapshot) => {
      if (snapshot.status === 'running') {
        const lastActivityAt = snapshot.lastActivityAt || snapshot.startedAt
        const idleFor = Date.now() - lastActivityAt
        if (idleFor >= 2_000 && Date.now() - lastHeartbeatAt >= 5_000) {
          lastHeartbeatAt = Date.now()
          system = pushChunk(
            system,
            `[system] 命令仍在运行：已运行 ${Math.max(1, Math.round((Date.now() - snapshot.startedAt) / 1000))} 秒，距上次输出 ${Math.max(1, Math.round(idleFor / 1000))} 秒。\n`
          )
        }
        return
      }

      if (!stdout.trim() && !stderr.trim() && !system.trim()) {
        system = pushChunk(
          system,
          typeof snapshot.exitCode === 'number' && snapshot.exitCode === 0
            ? '[system] 命令已结束，未产生标准输出。\n'
            : '[system] 命令已结束，但事件通道未收到额外输出，已根据运行快照完成收口。\n',
        )
      }

      finalize({
        status: snapshot.status,
        exitCode: typeof snapshot.exitCode === 'number' ? snapshot.exitCode : null,
        signal: snapshot.signal ?? null,
        eventError: snapshot.error || '',
      })
    }

    const removeListener = api.onIdeTerminalEvent((event: IDETerminalEvent) => {
      if (event.sessionId !== sessionId) {
        return
      }

      if (event.type === 'data' && event.chunk) {
        if (event.stream === 'stderr') {
          stderr = pushChunk(stderr, event.chunk)
        } else if (event.stream === 'system') {
          system = pushChunk(system, event.chunk)
        } else {
          stdout = pushChunk(stdout, event.chunk)
        }
        return
      }

      if (event.type === 'error') {
        finalize({
          status: event.status === 'cancelled' ? 'cancelled' : 'failed',
          exitCode: typeof event.exitCode === 'number' ? event.exitCode : null,
          signal: event.signal ?? null,
          eventError: event.error || '终端执行失败',
        })
        return
      }

      if (event.type === 'exit') {
        finalize({
          status: event.status === 'completed'
            ? 'completed'
            : event.status === 'cancelled'
              ? 'cancelled'
              : 'failed',
          exitCode: typeof event.exitCode === 'number' ? event.exitCode : null,
          signal: event.signal ?? null,
          eventError: event.error || '',
        })
      }
    })

    pollTimer = setInterval(async () => {
      if (finished || polling || typeof api.ideGetTerminalSessionSnapshot !== 'function') {
        return
      }

      polling = true
      try {
        const snapshot = await api.ideGetTerminalSessionSnapshot(sessionId)
        if (snapshot) {
          finalizeFromSnapshot(snapshot)
        }
      } catch {
        // ignore polling failures and keep waiting for primary event channel
      } finally {
        polling = false
      }
    }, 1_500)

    const timeoutTimer = setTimeout(async () => {
      try {
        await api.ideCancelCommand(sessionId)
      } catch {
        // ignore cancellation fallback failure
      }

      finalize({
        status: 'failed',
        exitCode: null,
        signal: null,
        eventError: `命令结果等待超过 ${Math.round(overallTimeoutMs / 1000)} 秒，已终止等待。`,
      })
    }, overallTimeoutMs)
  })
}

function getPlanInActiveWorkspace(planId: string) {
  const aiStore = useAIStore()
  const workspace = getActiveWorkspace()
  if (!workspace) {
    return { workspace: null, plan: null }
  }

  const plan = aiStore.getProjectPlan(planId)
  if (!plan || plan.workspaceId !== workspace.id) {
    return { workspace, plan: null }
  }

  return { workspace, plan }
}

async function ideReadFileTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const workspace = getActiveWorkspace()
  const path = normalizeTextValue(args.path)
  if (!workspace || !path) {
    return errorResult('读取工作区文件需要已打开工作区且提供 path')
  }

  const content = await readWorkspaceFile(workspace, path)
  if (content === null) {
    return errorResult('读取文件失败', { path })
  }

  return successResult(`已读取文件 ${path}`, {
    path,
    content,
  })
}

async function ideWriteFileTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const workspace = getActiveWorkspace()
  const path = normalizeTextValue(args.path)
  const content = typeof args.content === 'string' ? args.content : ''
  if (!workspace || !path) {
    return errorResult('写入工作区文件需要已打开工作区且提供 path')
  }

  const ok = await writeWorkspaceFile(workspace, path, content)
  if (!ok) {
    return errorResult('写入文件失败', { path })
  }

  return successResult(`已写入文件 ${path}`, {
    path,
    bytes: content.length,
  })
}

async function ideListDirectoryTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const workspace = getActiveWorkspace()
  if (!workspace) {
    return errorResult('当前未打开工作区')
  }

  const relativePath = normalizeTextValue(args.path) || ''
  const api = window.electronAPI
  if (!api?.ideListDirectory) {
    return errorResult('当前环境不支持 IDE 文件系统能力')
  }

  const root = workspace.rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  const target = relativePath ? `${root}/${relativePath.replace(/^\//, '')}` : root
  const entries = await api.ideListDirectory(target)
  if (!entries) {
    return errorResult('读取目录失败', { path: relativePath || '.' })
  }

  return successResult(`已列出目录 ${relativePath || '.'}`, {
    path: relativePath || '.',
    entries,
  })
}

async function ideSearchFilesTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const workspace = getActiveWorkspace()
  const pattern = normalizeTextValue(args.pattern)
  if (!workspace || !pattern) {
    return errorResult('搜索文件需要已打开工作区且提供 pattern')
  }

  const results = searchFiles(workspace, pattern)
  return successResult(`找到 ${results.length} 个匹配文件`, {
    pattern,
    files: results,
  })
}

async function ideRunCommandTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const workspace = getWorkspaceForCommandTool()
  const command = normalizeTextValue(args.command)
  const requestedCwd = normalizeTextValue(args.cwd)
  const reason = normalizeTextValue(args.reason)

  if (!workspace || !command) {
    return errorResult('执行工作区命令需要已打开工作区且提供 command')
  }

  if (!window.electronAPI?.ideRunCommand) {
    return errorResult('当前环境不支持 IDE 命令执行能力')
  }

  let cwd = workspace.rootPath
  try {
    cwd = await resolveIdeCommandCwd(workspace, requestedCwd)
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : '终端工作目录校验失败', {
      cwd: requestedCwd || workspace.rootPath,
    })
  }

  const timeoutMs = normalizeCommandDuration(args.timeoutMs, IDE_COMMAND_DEFAULT_TIMEOUT_MS, IDE_COMMAND_MAX_TIMEOUT_MS)
  const idleTimeoutMs = normalizeCommandDuration(
    args.idleTimeoutMs,
    Math.min(IDE_COMMAND_DEFAULT_IDLE_TIMEOUT_MS, Math.max(timeoutMs - 1_000, 3_000)),
    Math.min(IDE_COMMAND_MAX_IDLE_TIMEOUT_MS, Math.max(timeoutMs - 1_000, 3_000)),
  )

  try {
    const session = await window.electronAPI.ideRunCommand({
      command,
      cwd,
      timeoutMs,
      idleTimeoutMs,
    })
    const result = await awaitIdeCommandResult(session.sessionId, timeoutMs + 8_000)
    const combinedOutput = [result.stdout, result.stderr, result.system].filter(Boolean).join('\n')
    const interactiveOutputDetected = IDE_COMMAND_INTERACTIVE_OUTPUT_PATTERN.test(combinedOutput)

    if (result.status !== 'completed') {
      return errorResult(result.eventError || '命令执行失败', {
        command,
        reason,
        cwd,
        sessionId: session.sessionId,
        timeoutMs,
        idleTimeoutMs,
        status: result.status,
        exitCode: result.exitCode,
        signal: result.signal,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        system: result.system,
        truncated: result.truncated,
        interactiveOutputDetected,
        suggestion: interactiveOutputDetected
          ? '输出里出现了交互式提示，请改用非交互参数，或在可见终端手动完成这类命令。'
          : '请根据 stderr / system 输出调整命令参数、缩小作用范围，或改用 IDE 文件工具与结构化工具链。',
      })
    }

    const successMessage = combinedOutput.trim()
      ? '工作区命令执行完成'
      : '工作区命令执行完成，未产生标准输出'

    return successResult(successMessage, {
      command,
      reason,
      cwd,
      sessionId: session.sessionId,
      timeoutMs,
      idleTimeoutMs,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      system: result.system,
      truncated: result.truncated,
      interactiveOutputDetected,
    })
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : '命令执行失败', {
      command,
      reason,
      cwd,
    })
  }
}

async function ideCreatePlanToolV2(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const workspace = getActiveWorkspace()
  const goal = normalizeTextValue(args.goal)
  const overview = normalizeTextValue(args.overview)
  const techStack = normalizeStringArray(args.techStack)

  if (!workspace || !goal || !overview || techStack.length === 0) {
    return errorResult('创建计划需要已打开工作区，并提供 goal、overview、techStack')
  }

  const plan = aiStore.createProjectPlan(workspace.id, goal, overview, techStack)
  let currentPlan = plan
  let generationError = ''

  try {
    const phases = await generateInitialPlanPhases(workspace, { goal, overview, techStack })
    currentPlan = aiStore.setProjectPlanPhases(plan.id, phases) ?? plan
  } catch (error) {
    generationError = error instanceof Error ? error.message : '计划自动生成失败'
    aiStore.addDevLog(plan.id, {
      type: 'error',
      title: '计划自动生成失败',
      content: generationError,
      metadata: { workspaceId: workspace.id },
    })
  }

  const phaseCount = currentPlan.phases.length
  const taskCount = currentPlan.phases.reduce((sum, phase) => sum + phase.tasks.length, 0)

  aiStore.addDevLog(plan.id, {
    type: 'plan',
    title: generationError ? '初始化项目计划草稿' : '初始化项目计划',
    content: generationError
      ? `为工作区 ${workspace.name} 创建计划草稿：${goal}。自动生成任务失败，已回退为草稿。`
      : `为工作区 ${workspace.name} 创建项目计划：${goal}。已生成 ${phaseCount} 个阶段 / ${taskCount} 个任务。`,
    metadata: {
      workspaceId: workspace.id,
      phaseCount,
      taskCount,
    },
  })

  await recordPlanWorkspaceSnapshot(workspace, currentPlan.id, {
    reason: 'initial-plan',
    content: `为项目计划「${currentPlan.goal}」记录工作区基线，后续可基于真实 diff、失败反馈与上下文摘要动态重规划。`,
  })
  await flushPlanToWorkspace(workspace, currentPlan)

  return successResult(generationError ? '项目计划草稿已创建，自动任务生成已回退' : '项目计划已创建', {
    plan: currentPlan,
    markdown: renderPlanToMarkdown(currentPlan),
    execution: buildPlanExecutionPacket(currentPlan),
    ...(generationError ? { generationError } : {}),
  })
}

async function ideCreatePlanTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const workspace = getActiveWorkspace()
  const goal = normalizeTextValue(args.goal)
  const overview = normalizeTextValue(args.overview)
  const techStack = normalizeStringArray(args.techStack)

  if (!workspace || !goal || !overview || techStack.length === 0) {
    return errorResult('创建计划需要已打开工作区，并提供 goal、overview、techStack')
  }

  const plan = aiStore.createProjectPlan(workspace.id, goal, overview, techStack)
  aiStore.addDevLog(plan.id, {
    type: 'plan',
    title: '初始化项目计划',
    content: `为工作区 ${workspace.name} 创建项目计划`,
    metadata: { workspaceId: workspace.id },
  })

  await recordPlanWorkspaceSnapshot(workspace, plan.id, {
    reason: 'initial-plan',
    content: `为项目计划「${plan.goal}」记录工作区基线，供后续差异识别与动态重规划复用。`,
  })
  await flushPlanToWorkspace(workspace, plan)

  return successResult('项目计划已创建', {
    plan,
    markdown: renderPlanToMarkdown(plan),
    execution: buildPlanExecutionPacket(plan),
  })
}

async function ideUpdatePlanStatusTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const planId = normalizeTextValue(args.planId)
  const statusValue = normalizeTextValue(args.status)
  const note = normalizeTextValue(args.note)
  const { workspace, plan } = planId ? getPlanInActiveWorkspace(planId) : { workspace: null, plan: null }

  if (!workspace || !planId || !statusValue) {
    return errorResult('更新计划状态需要 planId、status，并且已打开工作区')
  }

  if (!ALLOWED_PLAN_STATUSES.includes(statusValue as PlanStatus)) {
    return errorResult(`无效计划状态: ${statusValue}`)
  }

  if (!plan) {
    return errorResult('未找到当前工作区下的项目计划', { planId })
  }

  const status = statusValue as PlanStatus
  const previousStatus = plan.status
  aiStore.updateProjectPlanStatus(planId, status)
  const updatedPlan = aiStore.getProjectPlan(planId)
  if (!updatedPlan || updatedPlan.workspaceId !== workspace.id) {
    return errorResult('更新后未找到当前工作区下的项目计划', { planId })
  }

  aiStore.addDevLog(planId, {
    type: 'decision',
    title: `计划状态更新为 ${status}`,
    content: note || `主代理已将计划状态切换为 ${status}。`,
    metadata: {
      previousStatus,
      nextStatus: status,
    },
  })

  await flushPlanToWorkspace(workspace, updatedPlan)

  return successResult('项目计划状态已更新', {
    plan: updatedPlan,
    markdown: renderPlanToMarkdown(updatedPlan),
    execution: buildPlanExecutionPacket(updatedPlan),
  })
}

async function ideAdvanceTaskTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext = {},
): Promise<ToolExecutionResult> {
  const planId = normalizeTextValue(args.planId)
  const taskId = normalizeTextValue(args.taskId)
  const statusValue = normalizeTextValue(args.status)
  const output = normalizeTextValue(args.output)
  const { workspace, plan } = planId ? getPlanInActiveWorkspace(planId) : { workspace: null, plan: null }

  if (!workspace || !planId || !taskId || !statusValue) {
    return errorResult('推进任务需要 planId、taskId、status，并且已打开工作区')
  }

  if (!ALLOWED_PROJECT_TASK_STATUSES.includes(statusValue as ProjectTaskStatus)) {
    return errorResult(`无效任务状态: ${statusValue}`)
  }

  if (!plan) {
    return errorResult('未找到当前工作区下的项目计划', { planId })
  }

  const status = statusValue as ProjectTaskStatus

  advanceTask(planId, taskId, status, output)
  const updatedPlan = useAIStore().getProjectPlan(planId)
  if (!updatedPlan || updatedPlan.workspaceId !== workspace.id) {
    return errorResult('更新后未找到当前工作区下的项目计划', { planId })
  }

  let replan: Awaited<ReturnType<typeof replanProjectPlan>> = null
  if (status === 'failed') {
    replan = await replanProjectPlan(workspace, planId, {
      reason: 'task-failed',
      taskId,
      failureOutput: output,
      sessionId: context.sessionId,
    })
  }

  const effectivePlan = replan?.plan ?? updatedPlan
  if (!replan) {
    await flushPlanToWorkspace(workspace, updatedPlan)
  }

  return successResult(replan ? '任务已标记失败，并已基于失败反馈动态重规划' : '任务状态已更新', {
    planId,
    taskId,
    status,
    progress: effectivePlan.progress,
    execution: buildPlanExecutionPacket(effectivePlan),
    ...(replan
      ? {
          replan: {
            summary: replan.summary,
            diff: replan.diff,
            createdTasks: replan.createdTasks,
          },
        }
      : {}),
  })
}

async function ideReplanPlanTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext = {},
): Promise<ToolExecutionResult> {
  const planId = normalizeTextValue(args.planId)
  const reason = normalizeTextValue(args.reason) || 'manual-tool'
  const taskId = normalizeTextValue(args.taskId)
  const failureOutput = normalizeTextValue(args.failureOutput)
  const contextSummary = normalizeTextValue(args.contextSummary)
  const { workspace, plan } = planId ? getPlanInActiveWorkspace(planId) : { workspace: null, plan: null }

  if (!workspace || !planId) {
    return errorResult('动态重规划需要 planId，并且已打开工作区')
  }

  if (!plan) {
    return errorResult('未找到当前工作区下的项目计划', { planId })
  }

  const result = await replanProjectPlan(workspace, planId, {
    reason,
    taskId: taskId || undefined,
    failureOutput: failureOutput || undefined,
    contextSummary: contextSummary || undefined,
    sessionId: context.sessionId,
  })

  if (!result) {
    return errorResult('项目动态重规划失败', { planId })
  }

  return successResult('项目计划已完成动态重规划', {
    plan: result.plan,
    markdown: renderPlanToMarkdown(result.plan),
    execution: buildPlanExecutionPacket(result.plan),
    diff: result.diff,
    summary: result.summary,
    createdTasks: result.createdTasks,
  })
}

async function ideGetPlanTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const planId = normalizeTextValue(args.planId)
  if (!planId) {
    return errorResult('缺少 planId')
  }

  const { plan } = getPlanInActiveWorkspace(planId)
  if (!plan) {
    return errorResult('未找到当前工作区下的项目计划', { planId })
  }

  return successResult('已获取项目计划', {
    plan,
    markdown: renderPlanToMarkdown(plan),
    execution: buildPlanExecutionPacket(plan),
  })
}

async function ideGetAutonomyRunTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const requestedPlanId = normalizeTextValue(args.planId)
  const workspace = getActiveWorkspace()
  if (!workspace) {
    return errorResult('当前未打开工作区，无法读取自治调度状态')
  }

  const plan = requestedPlanId
    ? aiStore.getProjectPlan(requestedPlanId)
    : [...aiStore.projectPlans]
      .filter(item => item.workspaceId === workspace.id)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] || null

  if (!plan || plan.workspaceId !== workspace.id) {
    return errorResult('未找到当前工作区下的项目计划', { planId: requestedPlanId || null })
  }

  const execution = buildPlanExecutionPacket(plan)
  const run = aiStore.getAutonomyRunByPlan(plan.id) || await syncAutonomyRunState(workspace, plan, execution, {
    trigger: 'tool-read',
  })
  return successResult('已返回自治调度状态', {
    planId: plan.id,
    run,
    execution,
  })
}

async function ideSyncAutonomyRunTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const aiStore = useAIStore()
  const planId = normalizeTextValue(args.planId)
  const note = normalizeTextValue(args.note)
  const { workspace, plan } = planId ? getPlanInActiveWorkspace(planId) : { workspace: null, plan: null }

  if (!workspace || !plan) {
    return errorResult('同步自治调度状态需要有效的 planId 且当前已打开工作区')
  }

  const execution = buildPlanExecutionPacket(plan)
  const run = await syncAutonomyRunState(workspace, plan, execution, {
    trigger: 'tool-sync',
    note,
  })

  if (note) {
    aiStore.addDevLog(plan.id, {
      type: 'milestone',
      title: '自治调度状态同步',
      content: `主代理已同步 RUN.md 与自治状态机。${note}`,
      metadata: {
        runId: run.id,
        status: run.status,
      },
    })
    await flushPlanToWorkspace(workspace, aiStore.getProjectPlan(plan.id) || plan)
  }

  return successResult('自治调度状态已同步', {
    planId: plan.id,
    run,
    execution,
  })
}

async function ideLogTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const planId = normalizeTextValue(args.planId)
  const typeValue = normalizeTextValue(args.type)
  const title = normalizeTextValue(args.title)
  const content = normalizeTextValue(args.content)
  const { workspace, plan } = planId ? getPlanInActiveWorkspace(planId) : { workspace: null, plan: null }

  if (!workspace || !planId || !typeValue || !title || !content) {
    return errorResult('写入开发日志需要 planId、type、title、content，并且已打开工作区')
  }

  if (!ALLOWED_DEVLOG_TYPES.includes(typeValue as DevLogEntry['type'])) {
    return errorResult(`无效日志类型: ${typeValue}`)
  }

  if (!plan) {
    return errorResult('未找到当前工作区下的项目计划', { planId })
  }

  const type = typeValue as DevLogEntry['type']

  const entry = devLogger.log(planId, type, title, content)
  if (!entry) {
    return errorResult('写入开发日志失败')
  }

  await devLogger.flushPlanLog(planId, workspace)

  return successResult('开发日志已写入', {
    entry,
  })
}

// ==================== MCP 工具 ====================

async function executeMcpCommand(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const command = normalizeTextValue(args.command)
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!command) {
    return errorResult('命令为空')
  }
  if (!window.electronAPI?.mcpExecuteCommand) {
    return errorResult('MCP 环境不可用')
  }

  const result = await window.electronAPI.mcpExecuteCommand(command)
  if (result.error) {
    return errorResult(result.error, { command })
  }

  return successResult(result.output || '命令执行完成', { command })
}

async function readScreen(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const region = (args.region as string) || 'full'
  const windowId = typeof args.windowId === 'number' ? args.windowId : undefined
  const windowHandle = normalizeTextValue(args.windowHandle || args.handle)
  const windowTitle = normalizeTextValue(args.windowTitle || args.title)
  const processName = normalizeTextValue(args.processName)
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!window.electronAPI?.mcpCaptureScreen) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpCaptureScreen({
    region: (region === 'active' || region === 'window') ? region : 'full',
    windowId,
    windowHandle: windowHandle || undefined,
    windowTitle: windowTitle || undefined,
    processName: processName || undefined
  })
  const attachment = await extractScreenshotAttachment(result)

  if (result.error) {
    return errorResult(result.error, {
      region,
      target: { windowId, windowHandle, windowTitle, processName }
    })
  }

  return {
    output: result.output || '',
    error: result.error,
    attachments: attachment ? [attachment] : undefined
  }
}

async function doMouseClick(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const x = args.x as number
  const y = args.y as number
  const button = (args.button as string) || 'left'
  const clickType = (args.clickType as string) || 'single'
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (typeof x !== 'number' || typeof y !== 'number') {
    return { output: '', error: '坐标无效' }
  }
  if (!window.electronAPI?.mcpMouseClick) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpMouseClick(x, y, button, clickType)
  return { output: result.output || '', error: result.error }
}

async function doKeyboardInput(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const text = args.text as string | undefined
  const keys = args.keys as string | undefined
  const windowId = typeof args.windowId === 'number' ? args.windowId : undefined
  const windowHandle = normalizeTextValue(args.windowHandle || args.handle)
  const windowTitle = normalizeTextValue(args.windowTitle || args.title)
  const processName = normalizeTextValue(args.processName)
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!window.electronAPI?.mcpKeyboardInput) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpKeyboardInput({
    text,
    keys,
    windowId,
    windowHandle: windowHandle || undefined,
    windowTitle: windowTitle || undefined,
    processName: processName || undefined
  })

  const parsed = tryParseJson<Record<string, unknown>>(result.output)
  if (parsed && parsed.success === false) {
    return errorResult('键盘输入失败，目标窗口未成功聚焦', { result: parsed })
  }

  return successResult(text ? `已输入文本 ${text.length} 个字符` : `已发送按键 ${keys}`, {
    target: parsed?.target || result.data || null,
    raw: parsed || result.output || ''
  })
}

async function doListWindows(): Promise<ToolExecutionResult> {
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!window.electronAPI?.mcpListWindows) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpListWindows()
  const parsed = tryParseJson<MCPWindowInfo[] | MCPWindowInfo>(result.output)
  const windows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []

  if (result.error) {
    return errorResult(result.error)
  }

  return successResult(`已返回 ${windows.length} 个窗口`, {
    windows,
    note: '优先使用 id 精确聚焦窗口；如果模型误取了 handle，也可以把 windowHandle 一并传给 focus_window、read_screen 或 keyboard_input。'
  })
}

async function doFocusWindow(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const title = normalizeTextValue(args.title)
  const processName = normalizeTextValue(args.processName)
  const id = typeof args.id === 'number' ? args.id : undefined
  const windowHandle = normalizeTextValue(args.windowHandle || args.handle)
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!title && !processName && typeof id !== 'number' && !windowHandle) return { output: '', error: '窗口目标为空' }

  if (!window.electronAPI?.mcpFocusWindow) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpFocusWindow({ id, windowHandle: windowHandle || undefined, title: title || undefined, processName: processName || undefined })
  const parsed = tryParseJson<Record<string, unknown>>(result.output)

  if (result.error || parsed?.success === false) {
    return errorResult(result.error || '目标窗口未成功聚焦', {
      target: { id, windowHandle, title, processName },
      raw: parsed || result.output || ''
    })
  }

  return successResult(`已聚焦窗口 ${String(parsed?.title || title || processName || windowHandle || id)}`, {
    window: parsed || result.data || null
  })
}
