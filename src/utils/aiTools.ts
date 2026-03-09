/**
 * AI 工具执行器
 * 接收AI返回的工具调用，路由到对应的实际操作
 */
import type { AIToolCall, Account, AccountType, AIChatAttachment, AITaskStep, MCPScreenCaptureInfo, MCPWindowInfo } from '@/types'
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

interface ToolExecutionResult {
  output: string
  error?: string
  attachments?: AIChatAttachment[]
}

interface ToolExecutionContext {
  sessionId?: string
}

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
    default:
      if (isManagedMcpToolInvocationName(toolCall.name)) {
        return callManagedMcpTool(toolCall.name, args)
      }

      return { output: '', error: `未知工具: ${toolCall.name}` }
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
  const scope = sessionId ? aiStore.resolveSessionScope(sessionId) : 'main'

  if (!content) return errorResult('记忆内容为空')

  const entry = aiStore.addMemory(content, category, 'ai', scope)
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

// ==================== MCP 工具 ====================

async function executeMcpCommand(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const command = args.command as string
  const disabledResult = ensureWindowsMcpEnabled()

  if (disabledResult) {
    return disabledResult
  }

  if (!command) return { output: '', error: '命令为空' }
  if (!window.electronAPI?.mcpExecuteCommand) {
    return { output: '', error: 'MCP 环境不可用' }
  }

  const result = await window.electronAPI.mcpExecuteCommand(command)
  return { output: result.output || '命令执行完成', error: result.error }
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
