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
  aiOverlayBounds: WindowBounds | null
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

export interface WindowBounds {
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

export interface Live2DMouthState {
  level: number
  speaking: boolean
  timestamp: number
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

export type AIProtocol = 'openai' | 'anthropic' | 'gemini' | 'ollama-local' | 'ollama-cloud' | 'custom'

export type AIGatewayTemplate = 'standard' | 'sub2api-openai' | 'sub2api-claude' | 'sub2api-gemini' | 'sub2api-antigravity'

export type Sub2ApiGatewayMode = 'external' | 'desktop'

export type Sub2ApiDesktopRunMode = 'simple' | 'standard'

export type Sub2ApiRuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'missing-binary' | 'unavailable'

export interface Sub2ApiDesktopRuntimeConfig {
  autoStart: boolean
  host: string
  port: number
  runMode: Sub2ApiDesktopRunMode
  binaryPath: string
  dataDir: string
  configPath: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface Sub2ApiDesktopManagedConfig {
  sharedPassword: string
  adminEmail: string
  apiKeyName: string
}

export interface Sub2ApiRuntimeState {
  status: Sub2ApiRuntimeStatus
  mode: Sub2ApiGatewayMode
  host: string
  port: number
  baseUrl: string
  adminUrl: string
  pid: number | null
  startedAt: number
  healthy: boolean
  healthEndpoint: string
  healthMessage: string
  resolvedBinaryPath: string
  binaryExists: boolean
  usingBundledBinary: boolean
  resolvedDataDir: string
  resolvedConfigPath: string
  configExists: boolean
  logFilePath: string
  dependencyRoot: string
  bundledBinaryPath: string
  lastError: string
  lastExitCode: number | null
  managedAdminEmail: string
  managedApiKeyName: string
  managedApiKeyDetected: boolean
  logs: string[]
}

export interface Sub2ApiSetupDatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  dbname: string
  sslmode: 'disable' | 'require' | 'verify-ca' | 'verify-full'
}

export interface Sub2ApiSetupRedisConfig {
  host: string
  port: number
  password: string
  db: number
  enableTls: boolean
}

export interface Sub2ApiSetupAdminConfig {
  email: string
  password: string
}

export interface Sub2ApiDesktopSetupProfile {
  database: Sub2ApiSetupDatabaseConfig
  redis: Sub2ApiSetupRedisConfig
  admin: Sub2ApiSetupAdminConfig
  timezone: string
}

export type Sub2ApiSetupDiagnosticLevel = 'success' | 'info' | 'warning' | 'error'

export interface Sub2ApiSetupDiagnosticItem {
  id: string
  label: string
  level: Sub2ApiSetupDiagnosticLevel
  message: string
}

export interface Sub2ApiSetupStatus {
  reachable: boolean
  needsSetup: boolean | null
  step: string
  endpoint: string
  statusCode: number | null
  message: string
}

export interface Sub2ApiSetupDiagnostics {
  checkedAt: number
  status: Sub2ApiSetupStatus
  items: Sub2ApiSetupDiagnosticItem[]
}

export interface Sub2ApiSetupActionResult {
  success: boolean
  code: number
  message: string
  details: string
  data?: unknown
}

export interface Sub2ApiDesktopAccessResult {
  success: boolean
  gatewayRoot: string
  adminUrl: string
  apiKey: string
  apiKeyName: string
  adminEmail: string
  message: string
  runtimeState: Sub2ApiRuntimeState
}

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

export interface AISelectedAgents {
  main: string
  live2d: string
}

export interface AIAgentCapabilitySettings {
  conversationOnly: boolean
  memoryEnabled: boolean
  fileControlEnabled: boolean
  softwareControlEnabled: boolean
  mcpEnabled: boolean
  skillEnabled: boolean
}

export interface AIAgentTTSProfile {
  autoPlayReplies?: boolean
  emotionStyle?: TTSEmotionStyle
  emotionIntensity?: number
}

export interface AIAgentProfile {
  id: string
  name: string
  description: string
  systemPrompt: string
  preferredModel?: string
  temperature?: number
  preferredArtifactRoot?: string
  capabilities: AIAgentCapabilitySettings
  tts: AIAgentTTSProfile
  isBuiltin?: boolean
  isDefault?: boolean
  createdAt: number
  updatedAt: number
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
  source: 'user' | 'tool' | 'assistant'
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
  providerMetadata?: Record<string, unknown>
}

/** AI 工具调用 */
export interface AIToolCall {
  id: string
  name: string
  arguments: string
  result?: string
  providerMetadata?: Record<string, unknown>
}

/** AI 对话会话 */
export interface AIChatSession {
  id: string
  scope: AIConversationScope
  agentId?: string
  title: string
  messages: AIChatMessage[]
  summary?: string
  summaryUpdatedAt?: number
  createdAt: number
  updatedAt: number
}

// ==================== Agent 模式 ====================

export type AgentMode = 'agent' | 'ide'

// ==================== 子代理系统 ====================

export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface SubAgentResult {
  success: boolean
  output: string
  artifacts: string[]
  tokenUsage: { input: number; output: number }
}

export interface SubAgent {
  id: string
  parentSessionId: string
  name: string
  role: string
  task: string
  planId?: string
  taskId?: string
  systemPrompt: string
  model: string
  protocol: AIProtocol
  baseUrl: string
  apiKey: string
  status: SubAgentStatus
  messages: AIChatMessage[]
  contextBudget: number
  modelReason?: string
  selectedCapabilities?: string[]
  availableModelCount?: number
  selectionMode?: 'manual' | 'router' | 'fallback'
  result?: SubAgentResult
  createdAt: number
  completedAt?: number
}

export interface SubAgentSpawnRequest {
  name: string
  role: string
  task: string
  planId?: string
  taskId?: string
  systemPrompt?: string
  model?: string
  protocol?: AIProtocol
  baseUrl?: string
  apiKey?: string
  contextFromParent?: string
  maxIterations?: number
  modelReason?: string
  selectedCapabilities?: string[]
  availableModelCount?: number
  selectionMode?: 'manual' | 'router' | 'fallback'
}

/** 模型路由决策 */
export interface ModelRouterDecision {
  model: string
  protocol: AIProtocol
  baseUrl: string
  apiKey: string
  reason: string
  capabilities: string[]
}

// ==================== IDE 工作区 ====================

export interface IDEWorkspace {
  id: string
  rootPath: string
  name: string
  artifactRootPath: string
  dataDirectory: string
  language?: string
  framework?: string
  structure?: ProjectStructure
  createdAt: number
  updatedAt?: number
  lastOpenedAt?: number
}

export interface ProjectStructure {
  files: ProjectFile[]
  totalFiles: number
  totalLines: number
  languages: Record<string, number>
  updatedAt: number
}

export interface ProjectFile {
  path: string
  type: 'file' | 'directory'
  language?: string
  lines?: number
  size?: number
}

export type IDETerminalStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type IDETerminalStream = 'stdout' | 'stderr' | 'system'
export type IDETerminalSessionMode = 'command' | 'shell'

export interface IDETerminalRunRequest {
  command: string
  cwd: string
}

export interface IDETerminalRunResult {
  sessionId: string
  command: string
  cwd: string
  startedAt: number
}

export interface IDETerminalSessionCreateRequest {
  cwd: string
  title?: string
}

export interface IDETerminalSessionInfo {
  sessionId: string
  cwd: string
  title: string
  mode: IDETerminalSessionMode
  shell: string
  startedAt: number
}

export interface IDETerminalInputRequest {
  sessionId: string
  input: string
}

export interface IDETerminalResizeRequest {
  sessionId: string
  cols: number
  rows: number
}

export interface IDETerminalEvent {
  sessionId: string
  type: 'start' | 'data' | 'exit' | 'error'
  command: string
  cwd: string
  mode?: IDETerminalSessionMode
  title?: string
  shell?: string
  timestamp: number
  stream?: IDETerminalStream
  chunk?: string
  status?: IDETerminalStatus
  exitCode?: number | null
  signal?: string | null
  error?: string
}

export interface IDEEditorTabSession {
  path: string
  content: string
  savedContent: string
  language?: string
  selectionStart?: number
  selectionEnd?: number
}

export interface IDEEditorSession {
  workspaceId: string
  tabs: IDEEditorTabSession[]
  activePath: string
  updatedAt: number
}

// ==================== 项目规划 ====================

export type PlanStatus = 'drafting' | 'approved' | 'in-progress' | 'completed' | 'paused'
export type PhaseStatus = 'pending' | 'in-progress' | 'completed' | 'blocked'
export type ProjectTaskType = 'create' | 'modify' | 'refactor' | 'test' | 'config' | 'docs'
export type ProjectTaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped'

export interface ProjectPlan {
  id: string
  workspaceId: string
  goal: string
  overview: string
  techStack: string[]
  phases: ProjectPhase[]
  status: PlanStatus
  progress: number
  devLog: DevLogEntry[]
  createdAt: number
  updatedAt: number
}

export interface ProjectPhase {
  id: string
  name: string
  description: string
  tasks: ProjectTask[]
  status: PhaseStatus
  order: number
}

export interface ProjectTask {
  id: string
  phaseId: string
  title: string
  description: string
  type: ProjectTaskType
  files: string[]
  dependencies: string[]
  status: ProjectTaskStatus
  assignedAgent?: string
  output?: string
  order: number
}

export interface ProjectTaskExecutionBrief {
  planId: string
  phaseId: string
  phaseName: string
  taskId: string
  taskTitle: string
  taskType: ProjectTaskType
  recommendedTemplateId: string
  recommendedAgentName: string
  recommendedRole: string
  dependencyTitles: string[]
  files: string[]
  executionPrompt: string
  supervisionNotes: string[]
}

export interface ProjectTaskBlocker {
  taskId: string
  phaseId: string
  phaseName: string
  taskTitle: string
  dependencyTitles: string[]
}

export interface ProjectPlanExecutionPacket {
  planId: string
  status: PlanStatus
  progress: number
  readyTaskCount: number
  blockedTaskCount: number
  nextTaskId: string | null
  nextTaskTitle: string | null
  readyTasks: ProjectTaskExecutionBrief[]
  blockedTasks: ProjectTaskBlocker[]
  supervisorPrompt: string
}

export interface ProjectPlanWorkspaceDiff {
  added: string[]
  removed: string[]
  modified: string[]
  baselineMissing: boolean
}

export interface ProjectPlanDriftSummary {
  planId: string
  changed: boolean
  totalChanges: number
  totalFiles: number
  baselineCreatedAt: number | null
  checkedAt: number
  samplePaths: string[]
  diff: ProjectPlanWorkspaceDiff
}

export type AutonomyRunStatus = 'queued' | 'running' | 'paused' | 'blocked' | 'completed' | 'failed'
export type AutonomyRunPermissionMode = 'allow' | 'ask' | 'deny'
export type AutonomyRunResourceKind = 'builtin' | 'skill' | 'mcp'
export type AutonomyRunTaskClaimStatus = 'ready' | 'deferred' | 'claimed' | 'running' | 'completed' | 'failed' | 'blocked'

export interface AutonomyRunPermissionRule {
  id: string
  kind: AutonomyRunResourceKind
  name: string
  description: string
  mode: AutonomyRunPermissionMode
  capabilities: string[]
}

export interface AutonomyRunTaskClaim {
  taskId: string
  phaseId: string
  taskTitle: string
  agentName: string
  agentRole: string
  files: string[]
  status: AutonomyRunTaskClaimStatus
  reason: string
  assignedAgentId?: string
  model?: string
  modelReason?: string
  selectionMode?: SubAgent['selectionMode']
  updatedAt: number
}

export interface AutonomyRunHeartbeat {
  timestamp: number
  summary: string
  nextAction: string
  readyTaskIds: string[]
  blockedTaskIds: string[]
  claimedTaskIds: string[]
}

export interface AutonomyRun {
  id: string
  workspaceId: string
  planId: string
  sessionId: string
  status: AutonomyRunStatus
  mode: 'continuous'
  maxParallelTasks: number
  subAgentBatchLimit: number
  heartbeatIntervalMs: number
  summary: string
  nextAction: string
  permissions: AutonomyRunPermissionRule[]
  queue: {
    readyTaskIds: string[]
    blockedTaskIds: string[]
    claimedTaskIds: string[]
  }
  claims: AutonomyRunTaskClaim[]
  lastHeartbeat?: AutonomyRunHeartbeat
  lastError?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  pausedAt?: number
  completedAt?: number
}

export interface DevLogEntry {
  id: string
  timestamp: number
  type: 'plan' | 'task-start' | 'task-complete' | 'error' | 'decision' | 'milestone' | 'context-compress'
  title: string
  content: string
  metadata?: Record<string, unknown>
}

// ==================== 上下文引擎 ====================

export interface ContextSnapshot {
  id: string
  sessionId: string
  summary: string
  keyFacts: string[]
  activeGoals: string[]
  tokenCount: number
  createdAt: number
}

export interface ContextPriority {
  messageId: string
  score: number
  reason: string
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
  agentId?: string
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
