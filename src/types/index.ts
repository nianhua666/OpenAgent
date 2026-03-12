// 数据模型类型定义

/** 账号字段定义 */
export interface AccountField {
  key: string
  name: string
  required: boolean
}

/** 账号类型 */
export interface AccountType {
  id: string
  name: string
  icon: string          // SVG 路径标识
  color: string
  fields: AccountField[]
  importSeparator: string      // 字段间分隔符
  exportSeparator: string
  accountSeparator: string     // 账号间分隔符，默认换行
  exportAccountSeparator: string
  createdAt: number
  updatedAt: number
}

/** 账号记录 */
export interface Account {
  id: string
  typeId: string
  data: Record<string, string>  // field.key -> value
  notes: string
  source: string
  cost: number
  status: 'in_stock' | 'exported'
  importTime: number
  importBatchId: string
  exportRecord?: ExportInfo
}

/** 导出信息（嵌入 Account） */
export interface ExportInfo {
  destination: string
  profit: number
  exportTime: number
  exportBatchId: string
}

/** 导入批次 */
export interface ImportBatch {
  id: string
  typeId: string
  source: string
  totalCost: number
  count: number
  time: number
}

/** 导出批次 */
export interface ExportBatch {
  id: string
  typeId: string
  destination: string
  totalProfit: number
  count: number
  accountIds: string[]
  time: number
}

/** 应用设置 */
export interface AppSettings {
  theme: 'sakura' | 'ocean' | 'twilight' | 'jade' | 'dark'
  sidebarCollapsed: boolean
  live2dEnabled: boolean
  live2dModel: string
  live2dModelName: string
  live2dModelSource: Live2DModelSource
  live2dStoragePath: string
  live2dPosition: { x: number; y: number }
  live2dScale: number
  closeToTray: boolean
  launchAtLogin: boolean
  language: string
  defaultPageSize: number
  autoSaveInterval: number
  currencySymbol: string
  windowsMcpEnabled: boolean
  ttsEnabled: boolean
  ttsEngine: TTSEngine
  ttsAutoPlayLive2D: boolean
  ttsShowMainReplyButton: boolean
  ttsModelId: string
  ttsVoiceId: string
  ttsVoiceName: string
  ttsAzureKey: string
  ttsAzureRegion: string
  ttsEmotionStyle: TTSEmotionStyle
  ttsEmotionIntensity: number
  ttsSpeed: number
  ttsVolume: number
}

export type Live2DModelSource = 'preset' | 'bundled' | 'imported' | 'custom'

export interface Live2DLibraryItem {
  id: string
  name: string
  source: Live2DModelSource
  runtimePath: string
  modelFile: string
  localPath?: string
  referenceUrl?: string
  remoteUrl?: string
  updatedAt?: number
}

export interface Live2DRemoteModelRequest {
  id?: string
  name: string
  url: string
  fallbackUrls?: string[]
  source: 'preset' | 'custom'
  referenceUrl?: string
}

export interface Live2DModelPreset extends Live2DRemoteModelRequest {
  id: string
  description: string
}

export interface Live2DReferenceLink {
  name: string
  url: string
  description: string
}

export interface Live2DStoragePaths {
  storagePath: string
  bundledPath: string
  usingCustomStorage: boolean
}

export interface Live2DModelBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowShapeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Live2DCursorPoint {
  screenX: number
  screenY: number
  localX: number
  localY: number
  insideWindow: boolean
}

export type RuntimeDataStorageMode = 'auto' | 'custom'

export interface RuntimeDataStorageInfo {
  mode: RuntimeDataStorageMode
  activeUserDataPath: string
  defaultUserDataPath: string
  recommendedUserDataPath: string
  customUserDataPath: string
  dataPath: string
  logsPath: string
  tempPath: string
  live2dDefaultStoragePath: string
  usingCustomStorage: boolean
  usingRecommendedStorage: boolean
  onSystemDrive: boolean
  systemDriveRoot: string
}

// ==================== AI 对话系统 ====================

export type AIProtocol = 'openai' | 'anthropic' | 'ollama-local' | 'ollama-cloud' | 'custom'

export type AIGatewayTemplate = 'standard' | 'sub2api-openai' | 'sub2api-claude' | 'sub2api-antigravity'

export interface AIProviderModel {
  id: string
  name: string
  label: string
  description?: string
  provider?: string
  capabilities?: AIModelCapabilities
  limits?: AIModelLimits
}

export interface AIModelLimits {
  maxContextTokens: number
  maxOutputTokens: number
}

export interface AIModelCapabilities {
  vision: boolean
  thinking: boolean
  toolUse: boolean
  imageInput: boolean
  taskPlanning: boolean
  mcpControl: boolean
}

export type AIThinkingLevel = 'off' | 'low' | 'medium' | 'high'

export type AIConversationScope = 'main' | 'live2d'

export interface AIActiveSessions {
  main: string
  live2d: string
}

export interface AIChatPreferences {
  thinkingEnabled: boolean
  thinkingLevel: AIThinkingLevel
  planningMode: boolean
  autoMemory: boolean
  maxAutoSteps: number
}

export interface AIChatAttachment {
  id: string
  type: 'image' | 'file'
  name: string
  mimeType: string
  dataUrl?: string
  source: 'user' | 'tool'
  filePath?: string
  width?: number
  height?: number
  size?: number
  textContent?: string
  truncated?: boolean
}

export interface AIContextMetrics {
  estimatedInputTokens: number
  selectedContextTokens: number
  modelMaxContextTokens: number
  maxOutputTokens: number
  usageRatio: number
  compressionCount: number
  lastCompressedAt?: number
}

export interface AIRuntimeState {
  running: boolean
  sessionId: string
  sessionScope: AIConversationScope | ''
  phase: 'idle' | 'streaming' | 'compressing'
  content: string
  reasoningContent: string
  startedAt: number
  updatedAt: number
  lastError?: string
  context: AIContextMetrics | null
}

/** AI 服务配置 */
export interface AIConfig {
  apiKey: string
  baseUrl: string
  model: string
  protocol: AIProtocol
  connectionTemplate: AIGatewayTemplate
  contextWindow: number
  maxTokens: number
  temperature: number
  systemPrompt: string
}

/** AI 对话消息 */
export interface AIChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoningContent?: string
  timestamp: number
  attachments?: AIChatAttachment[]
  toolCalls?: AIToolCall[]
  toolCallId?: string
  toolName?: string
}

/** AI 工具调用 */
export interface AIToolCall {
  id: string
  name: string
  arguments: string
  result?: string
}

/** AI 对话会话 */
export interface AIChatSession {
  id: string
  scope: AIConversationScope
  title: string
  messages: AIChatMessage[]
  summary?: string
  summaryUpdatedAt?: number
  createdAt: number
  updatedAt: number
}

export type AITaskStatus = 'planning' | 'running' | 'completed' | 'blocked'

export interface AITaskStep {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  note?: string
}

export interface AIAgentTask {
  id: string
  sessionId: string
  goal: string
  status: AITaskStatus
  steps: AITaskStep[]
  summary: string
  iterationCount: number
  maxIterations: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/** AI 长期记忆条目 */
export interface AIMemoryEntry {
  id: string
  scope: AIConversationScope
  content: string
  category: 'preference' | 'fact' | 'context' | 'instruction'
  source: string
  createdAt: number
  updatedAt: number
}

export type TTSEngine = 'kokoro-js-zh' | 'system-speech' | 'edge-neural' | 'azure-speech'

export type TTSEmotionStyle =
  | 'auto'
  | 'neutral'
  | 'affectionate'
  | 'angry'
  | 'assistant'
  | 'calm'
  | 'chat'
  | 'chat-casual'
  | 'cheerful'
  | 'customerservice'
  | 'disgruntled'
  | 'empathetic'
  | 'excited'
  | 'fearful'
  | 'friendly'
  | 'gentle'
  | 'hopeful'
  | 'lyrical'
  | 'newscast'
  | 'narration-professional'
  | 'narration-relaxed'
  | 'sad'
  | 'serious'
  | 'sorry'
  | 'whispering'

export interface TTSModelLibraryItem {
  id: string
  engine: TTSEngine
  modelId: string
  aliasIds?: string[]
  name: string
  description: string
  language: string
  sourceLabel: string
  sourceUrl: string
  defaultVoiceId: string
  recommended?: boolean
  builtIn?: boolean
  remote?: boolean
}

export interface TTSVoiceLibraryItem {
  id: string
  engine: TTSEngine
  modelId: string
  name: string
  locale: string
  gender: 'female' | 'male'
  accent: string
  description: string
  sampleText: string
  sourceLabel: string
  sourceUrl: string
  emotionStyles?: TTSEmotionStyle[]
  roles?: string[]
  recommended?: boolean
  builtIn?: boolean
}

export interface TTSSynthesizePayload {
  text: string
  engine: TTSEngine
  modelId: string
  voiceId: string
  emotionStyle?: TTSEmotionStyle
  emotionIntensity?: number
  speed?: number
}

export interface TTSSynthesisResult {
  success: boolean
  engine: TTSEngine
  modelId: string
  voiceId: string
  voiceName: string
  mimeType: string
  audioBase64?: string
  durationMs?: number
  sampleRate?: number
  error?: string
}

export interface AIManagedMCPServerTool {
  invocationName: string
  originalName: string
  description: string
  inputSchema: Record<string, unknown>
  updatedAt: number
}

export interface AIManagedMCPToolInspection {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface AIManagedMCPServer {
  id: string
  name: string
  description?: string
  enabled: boolean
  packageName?: string
  installDirectory?: string
  entryCommand?: string
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
  source: 'ai' | 'user'
  createdAt: number
  updatedAt: number
  installedAt?: number
  lastError?: string
  serverInfo?: {
    name?: string
    version?: string
  }
  tools: AIManagedMCPServerTool[]
}

export interface AIManagedSkill {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  source: 'ai' | 'user'
  createdAt: number
  updatedAt: number
}

export interface AIManagedResourceRegistry {
  mcpServers: AIManagedMCPServer[]
  skills: AIManagedSkill[]
  updatedAt: number
}

export interface AIManagedMCPServerInspection {
  success: boolean
  tools: AIManagedMCPToolInspection[]
  serverInfo?: {
    name?: string
    version?: string
  }
  output?: string
  error?: string
}

export interface AIManagedMCPPackageInstallResult {
  success: boolean
  command: string
  args: string[]
  installDirectory: string
  output: string
  error?: string
}

/** MCP 工具定义 */
export interface MCPToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface MCPWindowInfo {
  id: number
  processName: string
  title: string
  handle?: string
  windowHandle?: string
  isForeground?: boolean
}

export interface MCPScreenCaptureInfo {
  filePath?: string
  width?: number
  height?: number
  x?: number
  y?: number
  window?: MCPWindowInfo | null
}

/** MCP 工具执行结果 */
export interface MCPToolResult {
  success: boolean
  output: string
  error?: string
  data?: unknown
}

/** Toast 消息 */
export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}
