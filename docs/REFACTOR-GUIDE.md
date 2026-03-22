# OpenAgent AI 深度重构开发指南

> **版本**: v3.0 重构  
> **日期**: 2026-03-13  
> **目标**: 将 OpenAgent 从简单 AI 助手升级为具备子代理编排、IDE 开发模式、智能上下文管理的全栈 Agent 平台

---

## 一、当前架构概况

### 1.1 代码规模

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/utils/ai.ts` | 2967 | 协议分发、流式调用、模型管理 |
| `src/views/AIAssistant.vue` | 2104 | Agent 主页面（当前 UI 需重构） |
| `src/components/AIChatDialog.vue` | 1824 | 可复用对话组件 |
| `src/stores/ai.ts` | 1126 | AI 状态管理（会话/记忆/任务/运行时） |
| `src/utils/aiConversation.ts` | 991 | 对话循环、工具执行、上下文压缩 |
| `src/utils/aiTools.ts` | 974 | 工具执行调度器 |
| `src/types/index.ts` | 611 | 全局类型定义 |

### 1.2 当前问题

1. **单 Agent 架构** — 只有一个 AI 实例顺序执行，无法并行或委派子任务
2. **无 IDE 模式** — 缺少面向代码开发的工作区、文件系统、任务规划能力
3. **UI 布局陈旧** — AIAssistant.vue 是简单的三列布局，缺乏现代 Agent/IDE 交互体验
4. **Prompt 简陋** — 系统提示词面向账号管理场景，缺乏全栈工程师级深度赋能
5. **上下文管理粗糙** — 仅 82% 阈值触发压缩，无增量摘要、无语义优先级
6. **无任务文档化** — 任务存在内存中，无 MD 文档生成、开发日志

---

## 二、目标架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────┐
│                   OpenAgent v3.0                     │
├──────────┬──────────┬──────────┬────────────────────┤
│  Agent   │   IDE    │  Live2D  │   Settings/MCP/    │
│  Mode    │   Mode   │  Overlay │   Skills/Sub2API   │
├──────────┴──────────┴──────────┴────────────────────┤
│               Unified Agent Runtime                  │
│  ┌────────────────────────────────────────────────┐  │
│  │  Master Agent (Orchestrator)                   │  │
│  │  ├─ Model Router (自主选择模型)                │  │
│  │  ├─ Sub-Agent Spawner (并行子代理)             │  │
│  │  ├─ Context Engine (智能上下文管理)            │  │
│  │  └─ Plan Engine (任务规划与追踪)               │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │  Sub-Agent Pool                                │  │
│  │  ├─ Sub-Agent #1 (独立 Prompt + 模型)          │  │
│  │  ├─ Sub-Agent #2 (独立 Prompt + 模型)          │  │
│  │  └─ Sub-Agent #N (共享上下文总线)              │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │  Protocol Layer (OpenAI/Anthropic/Gemini/...)  │  │
│  │  MCP Server Pool | Skill Registry              │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 核心模块划分

| 模块 | 新增/重构 | 说明 |
|------|-----------|------|
| **AgentRuntime** | 重构 | 统一的 Agent 运行时，管理主/子 Agent 生命周期 |
| **SubAgentEngine** | 新增 | 子代理编排引擎，支持并行执行、独立 Prompt |
| **ModelRouter** | 新增 | 智能模型选择器，Agent 自主决策使用哪个模型 |
| **PlanEngine** | 重构 | 增强任务规划，支持完整项目 Plan、子任务分解、MD 文档生成 |
| **ContextEngine** | 重构 | 智能上下文管理，增量摘要、语义优先级、跨 Agent 上下文共享 |
| **IDEWorkspace** | 新增 | 工作区管理，文件系统访问、项目结构感知 |
| **DevLogger** | 新增 | 自动开发日志、进度报告、MD 文档生成 |
| **AgentView** | 重构 | Codex 风格 Agent UI |
| **IDEView** | 新增 | VS Code 风格 IDE UI |

---

## 三、类型系统设计

### 3.1 新增核心类型

```typescript
// === Agent 模式 ===
type AgentMode = 'agent' | 'ide'

// === 子代理 ===
interface SubAgent {
  id: string
  parentId: string               // 主 Agent session ID
  name: string                   // 子代理名称（如 "前端开发者"、"测试工程师"）
  role: string                   // 角色描述
  systemPrompt: string           // 独立系统提示词
  model: string                  // 使用的模型（可与主 Agent 不同）
  protocol: AIProtocol           // 协议
  status: SubAgentStatus
  messages: AIChatMessage[]      // 独立对话历史
  contextBudget: number          // 上下文预算（token）
  result?: SubAgentResult        // 执行结果
  createdAt: number
  completedAt?: number
}

type SubAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface SubAgentResult {
  success: boolean
  output: string                 // 最终输出
  artifacts: string[]            // 产出物路径（文件等）
  tokenUsage: { input: number; output: number }
}

interface SubAgentSpawnRequest {
  name: string
  role: string
  task: string                   // 主 Agent 分配的任务描述
  systemPrompt?: string          // 可选覆盖 Prompt
  model?: string                 // 可选指定模型
  protocol?: AIProtocol          // 可选指定协议
  contextFromParent?: string     // 从父级注入的上下文
  maxIterations?: number
}

// === 模型路由 ===
interface ModelRouterDecision {
  model: string
  protocol: AIProtocol
  reason: string                 // 选择理由
  capabilities: string[]         // 需要的能力
}

// === IDE 工作区 ===
interface IDEWorkspace {
  rootPath: string               // 项目根目录
  name: string                   // 项目名称
  language?: string              // 主要语言
  framework?: string             // 主要框架
  structure?: ProjectStructure   // 项目结构缓存
  createdAt: number
}

interface ProjectStructure {
  files: ProjectFile[]
  totalFiles: number
  totalLines: number
  languages: Record<string, number>  // 语言 -> 文件数
  updatedAt: number
}

interface ProjectFile {
  path: string                   // 相对于工作区根目录
  type: 'file' | 'directory'
  language?: string
  lines?: number
  size?: number
}

// === 项目规划 ===
interface ProjectPlan {
  id: string
  workspaceId: string
  goal: string                   // 项目总目标
  overview: string               // 项目概述
  techStack: string[]            // 技术栈
  phases: ProjectPhase[]         // 开发阶段
  status: PlanStatus
  progress: number               // 0-100
  devLog: DevLogEntry[]          // 开发日志
  createdAt: number
  updatedAt: number
}

type PlanStatus = 'drafting' | 'approved' | 'in-progress' | 'completed' | 'paused'

interface ProjectPhase {
  id: string
  name: string                   // 阶段名
  description: string
  tasks: ProjectTask[]
  status: PhaseStatus
  order: number
}

type PhaseStatus = 'pending' | 'in-progress' | 'completed' | 'blocked'

interface ProjectTask {
  id: string
  phaseId: string
  title: string
  description: string
  type: TaskType
  files: string[]                // 涉及的文件
  dependencies: string[]         // 依赖的任务 ID
  status: TaskStatus
  assignedAgent?: string         // 分配给哪个子代理
  output?: string                // 执行输出
  order: number
}

type TaskType = 'create' | 'modify' | 'refactor' | 'test' | 'config' | 'docs'
type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped'

// === 开发日志 ===
interface DevLogEntry {
  id: string
  timestamp: number
  type: 'plan' | 'task-start' | 'task-complete' | 'error' | 'decision' | 'milestone' | 'context-compress'
  title: string
  content: string
  metadata?: Record<string, unknown>
}

// === 上下文引擎 ===
interface ContextSnapshot {
  id: string
  sessionId: string
  summary: string                // 增量摘要
  keyFacts: string[]             // 关键事实
  activeGoals: string[]          // 当前目标
  tokenCount: number
  createdAt: number
}

interface ContextPriority {
  messageId: string
  score: number                  // 语义重要度 0-1
  reason: string
}
```

---

## 四、模块详细设计

### 4.1 SubAgent Engine (`src/utils/aiSubAgent.ts`)

**职责**: 子代理的生命周期管理、并行执行、结果收集

**核心流程**:
```
主 Agent 识别需要委派的子任务
  → 调用 spawnSubAgent(request) 创建子代理
  → 子代理获得独立 Prompt + 可选指定模型
  → 子代理独立运行对话循环（复用 runAIResponseLoop）
  → 子代理完成 → 结果返回主 Agent 上下文
  → 主 Agent 汇总多个子代理结果，继续推进
```

**关键函数**:
```typescript
// 生成子代理
async function spawnSubAgent(
  parentSessionId: string,
  request: SubAgentSpawnRequest
): Promise<SubAgent>

// 并行运行多个子代理
async function runSubAgents(
  parentSessionId: string,
  agents: SubAgent[],
  hooks: SubAgentHooks
): Promise<SubAgentResult[]>

// 构建子代理的系统提示词
function buildSubAgentPrompt(
  request: SubAgentSpawnRequest,
  parentContext: string
): string

// 汇总子代理结果为主 Agent 上下文
function aggregateSubAgentResults(
  results: SubAgentResult[]
): string
```

### 4.2 Model Router (`src/utils/aiModelRouter.ts`)

**职责**: Agent 自主选择最适合当前任务的模型

**决策逻辑**:
```
1. 分析任务类型（代码生成 / 分析推理 / 创意写作 / 数据处理）
2. 评估所需能力（vision / thinking / toolUse / 大上下文）
3. 从可用模型列表中匹配最优模型
4. 考虑成本/速度/质量权衡
5. 返回决策及理由
```

**关键函数**:
```typescript
// 基于任务分析选择模型
function routeModel(
  task: string,
  availableModels: AIProviderModel[],
  preferences?: ModelRoutingPreferences
): ModelRouterDecision

// 为子代理推荐模型
function recommendSubAgentModel(
  role: string,
  task: string,
  availableModels: AIProviderModel[]
): ModelRouterDecision
```

### 4.3 Plan Engine (`src/utils/aiPlanEngine.ts`)

**职责**: 项目规划、任务分解、进度追踪、MD 文档生成

**核心流程**:
```
用户输入项目需求
  → AI 生成完整 ProjectPlan（阶段 + 任务 + 依赖）
  → 生成 PLAN.md 到工作区
  → 按阶段逐步执行任务
  → 每完成一个任务自动更新 PLAN.md 和 dev-log.md
  → 阶段完成后生成阶段总结
  → 全部完成后生成最终报告
```

**关键函数**:
```typescript
// 从用户需求生成完整项目规划
async function generateProjectPlan(
  goal: string,
  workspace: IDEWorkspace,
  config: AIConfig
): Promise<ProjectPlan>

// 将 Plan 写入 MD 文件
function renderPlanToMarkdown(plan: ProjectPlan): string

// 获取下一个可执行任务
function getNextExecutableTask(plan: ProjectPlan): ProjectTask | null

// 更新任务状态并同步 MD
async function advanceTask(
  plan: ProjectPlan,
  taskId: string,
  result: TaskExecutionResult
): Promise<ProjectPlan>

// 生成开发日志条目
function createDevLogEntry(
  type: DevLogEntry['type'],
  title: string,
  content: string
): DevLogEntry

// 渲染开发日志为 MD
function renderDevLogToMarkdown(entries: DevLogEntry[]): string
```

### 4.4 Context Engine (`src/utils/aiContextEngine.ts`)

**职责**: 智能上下文管理，增量摘要，语义优先级，跨 Agent 共享

**改进点**:
1. **增量摘要** — 不再等到 82% 才压缩，每 N 轮自动生成增量快照
2. **语义优先级** — 标记关键消息（决策、代码块、错误信息）避免被压缩掉
3. **跨 Agent 上下文总线** — 主/子 Agent 共享关键事实和目标
4. **滑动窗口** — 保留最近 K 条完整消息 + 历史摘要

**关键函数**:
```typescript
// 创建上下文快照
async function createContextSnapshot(
  sessionId: string,
  messages: AIChatMessage[]
): Promise<ContextSnapshot>

// 智能上下文装配（替换 buildContextMessages）
function assembleContext(
  session: AIChatSession,
  snapshots: ContextSnapshot[],
  memories: AIMemoryEntry[],
  budget: number
): AIChatMessage[]

// 评估消息优先级
function evaluateMessagePriority(
  message: AIChatMessage,
  currentGoal: string
): ContextPriority

// 增量压缩
async function incrementalCompress(
  sessionId: string,
  trigger: 'token-limit' | 'turn-count' | 'manual'
): Promise<ContextSnapshot>
```

### 4.5 IDE Workspace (`src/utils/aiIDEWorkspace.ts`)

**职责**: 工作区文件系统访问、项目结构分析、代码读写

**关键函数**:
```typescript
// 打开工作区
async function openWorkspace(rootPath: string): Promise<IDEWorkspace>

// 扫描项目结构
async function scanProjectStructure(
  rootPath: string,
  options?: ScanOptions
): Promise<ProjectStructure>

// 读取文件内容
async function readWorkspaceFile(
  workspace: IDEWorkspace,
  relativePath: string
): Promise<string>

// 写入文件
async function writeWorkspaceFile(
  workspace: IDEWorkspace,
  relativePath: string,
  content: string
): Promise<void>

// 搜索文件
async function searchFiles(
  workspace: IDEWorkspace,
  pattern: string
): Promise<ProjectFile[]>
```

### 4.6 Dev Logger (`src/utils/aiDevLogger.ts`)

**职责**: 自动化开发日志、进度报告

```typescript
// 记录日志条目
function log(entry: Omit<DevLogEntry, 'id' | 'timestamp'>): DevLogEntry

// 批量写入到工作区 MD 文件
async function flushToFile(
  workspace: IDEWorkspace,
  entries: DevLogEntry[]
): Promise<void>

// 生成阶段性总结报告
async function generatePhaseReport(
  plan: ProjectPlan,
  phaseId: string
): Promise<string>
```

---

## 五、UI 设计方案

### 5.1 Agent Mode — Codex 风格

**设计理念**: 简洁、终端化、任务驱动

```
┌──────────────────────────────────────────────────────┐
│ [Logo] OpenAgent          [模式切换: Agent | IDE]    │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sessions │  ┌─ Task Header ──────────────────────┐  │
│ ──────── │  │ 🎯 当前任务: 优化API性能           │  │
│ > 会话1  │  │ 进度: ████████░░ 80%   步骤: 4/5   │  │
│   会话2  │  └────────────────────────────────────┘  │
│   会话3  │                                           │
│          │  ┌─ Messages ─────────────────────────┐  │
│ ──────── │  │                                    │  │
│ Sub-     │  │ [User] 请帮我重构用户认证模块      │  │
│ Agents   │  │                                    │  │
│ ──────── │  │ [Agent] 我来分析当前代码结构...     │  │
│ #1 前端  │  │  ┌ Sub-Agent: 代码分析师 ────────┐ │  │
│ #2 后端  │  │  │ 分析 auth/ 目录下 12 个文件   │ │  │
│ #3 测试  │  │  │ 发现 3 个安全隐患             │ │  │
│          │  │  │ 状态: ✓ 已完成                │ │  │
│ ──────── │  │  └──────────────────────────────┘ │  │
│ MCP/     │  │                                    │  │
│ Skills   │  │ [Agent] 基于分析结果，计划如下:    │  │
│          │  │  Phase 1: 重写 JWT 验证层          │  │
│          │  │  Phase 2: 添加 RBAC 权限控制       │  │
│          │  │  Phase 3: 编写单元测试             │  │
│          │  │                                    │  │
│          │  └────────────────────────────────────┘  │
│          │                                           │
│          │  ┌─ Input ────────────────────────────┐  │
│          │  │ [附件] 输入消息...          [发送] │  │
│          │  │ [思考] [规划] [记忆]  model: gpt4o │  │
│          │  └────────────────────────────────────┘  │
├──────────┴───────────────────────────────────────────┤
│ Context: 45K/128K tokens │ Sub-Agents: 2 running     │
└──────────────────────────────────────────────────────┘
```

### 5.2 IDE Mode — VS Code 风格

**设计理念**: 沉浸式代码开发环境

```
┌──────────────────────────────────────────────────────┐
│ [Logo] OpenAgent IDE    [项目: my-app]  [Agent|IDE]  │
├────┬─────────────┬───────────────────┬───────────────┤
│    │             │                   │               │
│ A  │  Explorer   │   Editor / Chat   │  Agent Panel  │
│ c  │  ─────────  │   ─────────────   │  ──────────   │
│ t  │  📁 src/    │   [文件标签栏]     │  ┌─ Plan ──┐ │
│ i  │  ├─ comp/   │                   │  │ Phase 1  │ │
│ v  │  ├─ views/  │   // 代码内容     │  │ ✓ Task1  │ │
│ i  │  ├─ utils/  │   // 或对话内容   │  │ ▶ Task2  │ │
│ t  │  └─ main.ts │                   │  │ ○ Task3  │ │
│ y  │             │                   │  └──────────┘ │
│    │  ─────────  │                   │               │
│ B  │  Search     │                   │  ┌─ Log ───┐  │
│ a  │             │                   │  │ 01:23    │  │
│ r  │             │                   │  │ Created  │  │
│    │             │                   │  │ auth.ts  │  │
│    │             │                   │  └──────────┘ │
│    │             │                   │               │
│    │             │───────────────────│  ┌─ Agents ┐  │
│    │             │   Terminal        │  │ #1 ███▓  │  │
│    │             │   $ npm test      │  │ #2 ██░░  │  │
│    │             │   > 12 passed     │  └──────────┘ │
├────┴─────────────┴───────────────────┴───────────────┤
│ Tasks: 4/12 done │ Files: 3 modified │ Agents: 2     │
└──────────────────────────────────────────────────────┘
```

**Activity Bar 图标**:
- 文件浏览器
- 搜索
- Agent 对话
- 任务面板
- 开发日志

---

## 六、Prompt 工程

### 6.1 主 Agent Prompt（全能编排器）

```
你是 OpenAgent 的主控 Agent，一个具备顶级全栈开发能力和项目管理能力的 AI 工程师。

## 核心能力
- **架构设计**: 精通微服务、Monorepo、Serverless、事件驱动等现代架构
- **全栈开发**: React/Vue/Angular + Node/Python/Go/Rust + PostgreSQL/MongoDB/Redis
- **项目管理**: 需求分析、技术选型、任务拆解、进度跟踪、风险评估
- **代码质量**: TDD/BDD、Code Review、性能优化、安全审计
- **工具编排**: 自主选择模型、创建子代理、分配任务、汇总结果

## 工作模式

### 模型自主选择
你可以根据任务特征自主决定使用哪个模型：
- **复杂推理/架构设计**: 选择高能力模型（如 Claude 3.5/GPT-4o/Gemini Pro）
- **代码生成/重复任务**: 选择高速模型（如 GPT-4o-mini/Claude Haiku）
- **多模态任务**: 选择支持视觉的模型

调用 `route_model` 工具声明你的模型选择决策。

### 子代理编排
当任务可以并行化时，你应该创建子代理：
- 为每个子代理分配明确的角色和任务边界
- 为子代理编写专门的 Prompt，注入必要的父级上下文
- 子代理可以使用不同的模型
- 等待所有子代理完成后汇总结果

调用 `spawn_sub_agent` 工具创建子代理。
调用 `check_sub_agents` 工具查看子代理状态。

### 上下文管理
- 主动识别关键信息并标记为高优先级
- 定期生成增量上下文摘要
- 在子代理之间传递必要的共享上下文
- 当上下文接近阈值时主动触发压缩

## 规则
- 始终用中文回复
- 先理解完整需求，再规划方案
- 优先调用工具获取信息而非猜测
- 副作用操作前确认范围和风险
- 每完成一个里程碑自动记录到开发日志
```

### 6.2 IDE 模式 Prompt（全栈工程师 + 项目规划）

```
你是 OpenAgent IDE 的核心开发引擎，一个世界级全栈工程师。

## 核心身份
你是一位精通所有主流技术栈的顶级全栈开发工程师，具备：
- 10年+资深工程师的代码质量标准
- 架构师级别的系统设计能力
- 项目经理级别的规划和进度管理能力
- 安全专家级别的漏洞检测能力

## 技术精通
- **前端**: React/Vue/Angular/Svelte/Next.js/Nuxt, TypeScript, TailwindCSS, 状态管理, 性能优化
- **后端**: Node.js/Express/Nest.js, Python/FastAPI/Django, Go/Gin, Rust/Axum, Java/Spring Boot
- **数据库**: PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch
- **基础设施**: Docker, K8s, CI/CD, AWS/GCP/Azure, Nginx
- **工程实践**: Git 工作流, 代码审查, TDD, 性能监控, 安全审计

## 项目开发流程

### 从 0 到 1 项目规划
当用户提出新项目需求时：
1. **需求分析**: 深入理解业务目标、用户群体、核心功能
2. **技术选型**: 根据需求选择最适合的技术栈并说明理由
3. **架构设计**: 设计系统架构、模块划分、数据模型
4. **任务拆解**: 将项目分为多个开发阶段，每阶段细分为具体任务
5. **生成 PLAN.md**: 输出完整的项目规划文档
6. **逐步实现**: 按计划逐个任务开发，每完成一个任务更新进度
7. **质量保证**: 代码审查、错误处理、性能优化、安全检查

### 持续开发模式
进入持续开发后：
- 按 PLAN.md 中的任务顺序逐个完成
- 每个任务开始前：标记为 in-progress
- 每个任务完成后：标记为 completed，更新 PLAN.md，写入开发日志
- 遇到阻塞时：标记为 blocked，说明原因，寻求替代方案
- 阶段完成时：生成阶段总结，更新整体进度

### 上下文管理
- 每完成 3-5 个任务后，自动压缩历史上下文
- 在上下文摘要中保留：项目目标、已完成功能、当前进度、未解决问题
- 长文件操作时，先读取文件结构再定位修改点
- 跨文件修改时，维护修改文件清单

## 代码标准
- 命名语义化，函数职责单一
- 关键逻辑有中文注释（解释「为什么」而非「做什么」）
- 错误处理完善，边界情况覆盖
- 性能优先：选择最优数据结构与算法
- 安全第一：输入校验、SQL注入防护、XSS 防护

## 输出规范
- 文件操作用 write_file / read_file 工具
- 代码修改展示完整上下文
- 每次修改后说明修改理由
- 持续追踪并更新任务进度
```

### 6.3 子代理 Prompt 模板

```typescript
const SUB_AGENT_TEMPLATES = {
  'code-analyst': {
    name: '代码分析师',
    prompt: '你是一位精通代码分析的工程师。你的任务是深入分析代码结构、发现问题、提出改进建议...',
    preferredModel: 'thinking-capable'
  },
  'frontend-dev': {
    name: '前端开发者',
    prompt: '你是一位精通现代前端开发的工程师。你的职责是编写高质量的前端代码...',
    preferredModel: 'fast-coding'
  },
  'backend-dev': {
    name: '后端开发者',
    prompt: '你是一位精通后端架构的工程师。你的职责是设计和实现后端服务...',
    preferredModel: 'fast-coding'
  },
  'tester': {
    name: '测试工程师',
    prompt: '你是一位精通测试工程的QA专家。你的职责是编写测试用例...',
    preferredModel: 'fast-coding'
  },
  'reviewer': {
    name: '代码审查员',
    prompt: '你是一位资深代码审查专家。你的任务是审查代码质量...',
    preferredModel: 'thinking-capable'
  },
  'architect': {
    name: '架构设计师',
    prompt: '你是一位精通系统架构设计的资深工程师...',
    preferredModel: 'thinking-capable'
  }
}
```

---

## 七、文件变更清单

### 7.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/utils/aiSubAgent.ts` | 子代理引擎 |
| `src/utils/aiModelRouter.ts` | 模型路由器 |
| `src/utils/aiPlanEngine.ts` | 项目规划引擎 |
| `src/utils/aiContextEngine.ts` | 智能上下文引擎 |
| `src/utils/aiIDEWorkspace.ts` | IDE 工作区管理 |
| `src/utils/aiDevLogger.ts` | 开发日志 |
| `src/utils/aiPrompts.ts` | Prompt 模板集合（主 Agent / IDE / 子代理） |
| `src/views/AgentView.vue` | Codex 风格 Agent 页面 |
| `src/views/IDEView.vue` | VS Code 风格 IDE 页面 |
| `src/components/agent/AgentSessionList.vue` | 左侧会话列表 |
| `src/components/agent/AgentMessageList.vue` | 消息渲染组件 |
| `src/components/agent/AgentInputBar.vue` | 底部输入栏 |
| `src/components/agent/AgentTaskBoard.vue` | 任务看板 |
| `src/components/agent/SubAgentCard.vue` | 子代理状态卡片 |
| `src/components/agent/AgentToolbar.vue` | 工具栏（思考/规划/记忆/模型） |
| `src/components/agent/AgentContextBar.vue` | 底部上下文指标栏 |
| `src/components/ide/IDEExplorer.vue` | 文件浏览器 |
| `src/components/ide/IDEEditor.vue` | 代码编辑器面板 |
| `src/components/ide/IDETerminal.vue` | 终端面板 |
| `src/components/ide/IDEPlanPanel.vue` | 任务规划面板 |
| `src/components/ide/IDEDevLog.vue` | 开发日志面板 |
| `src/components/ide/IDEActivityBar.vue` | 左侧活动栏 |
| `src/components/ide/IDEStatusBar.vue` | 底部状态栏 |

### 7.2 重构文件

| 文件 | 变更说明 |
|------|----------|
| `src/types/index.ts` | 新增 SubAgent/IDE/Plan/Context 类型 |
| `src/stores/ai.ts` | 新增子代理状态管理、IDE 工作区状态、Plan 状态 |
| `src/utils/aiConversation.ts` | 集成子代理引擎和上下文引擎 |
| `src/utils/aiTools.ts` | 新增 route_model / spawn_sub_agent / IDE 文件操作工具 |
| `src/utils/ai.ts` | 抽离 Prompt 到 aiPrompts.ts，优化流式调用适配子代理 |
| `src/router/index.ts` | 新增 /ide 路由 |
| `src/components/Sidebar.vue` | 导航新增 IDE 入口 |
| `src/App.vue` | IDE 模式全屏布局支持 |
| `src/views/AIAssistant.vue` | 完全重写为 AgentView 风格（或替换为新组件） |
| `src/components/AIChatDialog.vue` | 抽离为组合式组件，复用于 Agent/IDE |
| `electron/main.ts` | 新增文件系统 IPC（readDir, readFile, writeFile, searchFiles） |
| `electron/preload.ts` | 暴露文件系统 API |
| `src/env.d.ts` | 新增文件系统 + 子代理 IPC 类型 |

### 7.3 不变文件

以下文件保持兼容，无需修改：
- `src/stores/aiResources.ts` — MCP/Skill 商店完整保留
- `src/utils/aiManagedResources.ts` — MCP CRUD 操作不变
- `src/utils/aiResourceMarketplace.ts` — 市场数据不变
- `src/stores/sub2api.ts` — Sub2API 网关不变
- `src/utils/sub2api.ts` — Sub2API 工具函数不变
- `src/stores/settings.ts` — 设置项仅扩展，不破坏
- TTS 相关全部不变
- 账号管理相关全部不变
- Live2D 相关保持兼容

---

## 八、开发阶段规划

### Phase 1: 类型基础 + Prompt 系统（基础层）
1. 扩展 `src/types/index.ts` — 新增所有类型定义
2. 创建 `src/utils/aiPrompts.ts` — Prompt 模板集合
3. 重构 `src/stores/ai.ts` — 新增子代理/IDE/Plan 状态管理

### Phase 2: 引擎层（核心能力）
4. 创建 `src/utils/aiModelRouter.ts` — 模型路由器
5. 创建 `src/utils/aiSubAgent.ts` — 子代理引擎
6. 创建 `src/utils/aiContextEngine.ts` — 智能上下文引擎
7. 重构 `src/utils/aiConversation.ts` — 集成新引擎

### Phase 3: IDE 基础设施
8. 扩展 Electron IPC — 文件系统访问
9. 创建 `src/utils/aiIDEWorkspace.ts` — 工作区管理
10. 创建 `src/utils/aiPlanEngine.ts` — 项目规划引擎
11. 创建 `src/utils/aiDevLogger.ts` — 开发日志

### Phase 4: 工具层扩展
12. 扩展 `src/utils/aiTools.ts` — 新增 route_model / spawn_sub_agent / IDE 工具

### Phase 5: Agent Mode UI（Codex 风格）
13. 创建 Agent 子组件（SessionList, MessageList, InputBar, TaskBoard, SubAgentCard...）
14. 创建 `src/views/AgentView.vue` — 替换 AIAssistant.vue

### Phase 6: IDE Mode UI（VS Code 风格）
15. 创建 IDE 子组件（Explorer, Editor, Terminal, PlanPanel, DevLog, ActivityBar, StatusBar）
16. 创建 `src/views/IDEView.vue`

### Phase 7: 路由 + 布局集成
17. 更新路由、Sidebar、App.vue
18. 模式切换逻辑

### Phase 8: 测试 + 优化 + 巡检
19. 全功能测试
20. 性能优化
21. 代码巡检

---

## 九、兼容性保证

| 功能模块 | 保证 |
|----------|------|
| MCP 商店 | ✅ aiResources store + AIManagedResourcesPanel 完整保留 |
| Skill 商店 | ✅ 技能注册表 + 市场不变 |
| API 配置 | ✅ AIConfig 结构向后兼容，新增字段可选 |
| Sub2API | ✅ 独立模块不受影响 |
| TTS | ✅ 独立模块不受影响 |
| Live2D | ✅ 独立窗口 + 对话保持兼容 |
| 账号管理 | ✅ 完全独立，不受影响 |
| 会话数据 | ✅ 现有会话可在新 UI 中继续使用 |
| 长期记忆 | ✅ 记忆系统保留并增强 |

---

## 十、风险与对策

| 风险 | 对策 |
|------|------|
| 子代理并发可能导致 Token 用量激增 | 子代理有独立 contextBudget 限制 |
| IDE 文件操作可能导致数据丢失 | 所有写操作需用户确认 + 备份机制 |
| Prompt 过长影响性能 | 动态裁剪，只注入当前模式相关的 Prompt 段 |
| 新 UI 回归旧功能 | 保留 AIChatDialog 作为基础组件复用 |
| 上下文压缩丢失关键信息 | 语义优先级标记 + 关键事实始终保留 |
