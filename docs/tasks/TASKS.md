# OpenAgent v3.0 任务进度跟踪

> **创建时间**: 2026-03-13  
> **当前阶段**: Phase 9 - 前端工作台重构
> **总进度**: 99%

---

## Phase 1: 类型基础 + Prompt 系统

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 1.1 | 新增 SubAgent/IDE/Plan/Context 类型 | 已完成 | `src/types/index.ts` |
| 1.2 | 创建 Prompt 模板集合 | 已完成 | `src/utils/aiPrompts.ts` |
| 1.3 | AI Store 扩展（子代理/Plan/IDE 状态） | 已完成 | `src/stores/ai.ts` |

## Phase 2: 引擎层

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 2.1 | 模型路由器 | 已完成 | `src/utils/aiModelRouter.ts` |
| 2.2 | 子代理引擎 | 已完成 | `src/utils/aiSubAgent.ts` |
| 2.3 | 智能上下文引擎 | 已完成 | `src/utils/aiContextEngine.ts` |
| 2.4 | 对话循环集成新引擎 | 已完成 | `src/utils/aiConversation.ts`, `src/stores/ai.ts` |

## Phase 3: IDE 基础设施

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 3.1 | Electron IPC 文件系统 | 已完成 | `electron/main.ts`, `electron/preload.ts`, `src/env.d.ts` |
| 3.2 | 工作区管理器 | 已完成 | `src/utils/aiIDEWorkspace.ts` |
| 3.3 | 项目规划引擎 | 已完成 | `src/utils/aiPlanEngine.ts` |
| 3.4 | 开发日志系统 | 已完成 | `src/utils/aiDevLogger.ts` |

## Phase 4: 工具层扩展

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 4.1 | 新增 `route_model` 工具 | 已完成 | `src/utils/ai.ts`, `src/utils/aiTools.ts` |
| 4.2 | 新增 `spawn_sub_agent` 工具 | 已完成 | `src/utils/ai.ts`, `src/utils/aiTools.ts` |
| 4.3 | 新增 IDE 文件操作工具 | 已完成 | `src/utils/ai.ts`, `src/utils/aiTools.ts` |
| 4.4 | 新增 plan/devlog 工具 | 已完成 | `src/utils/ai.ts`, `src/utils/aiTools.ts` |

## Phase 5: Agent Mode UI

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 5.1 | `AgentSessionList` 组件 | 已完成 | `src/components/agent/AgentSessionList.vue` |
| 5.2 | `AgentMessageList` 组件 | 已完成 | `src/components/agent/AgentMessageList.vue` |
| 5.3 | `AgentInputBar` 组件 | 已完成 | `src/components/agent/AgentInputBar.vue` |
| 5.4 | `AgentProfileManager` 组件 | 已完成 | `src/components/agent/AgentProfileManager.vue` |
| 5.5 | `AgentTaskBoard` 组件 | 已完成 | `src/components/agent/AgentTaskBoard.vue` |
| 5.6 | `AgentToolbar` 组件 | 已完成 | `src/components/agent/AgentToolbar.vue` |
| 5.7 | `AgentContextBar` 组件 | 已完成 | `src/components/agent/AgentContextBar.vue` |
| 5.8 | `AgentView` 页面 | 已完成 | `src/views/AgentView.vue` |

## Phase 6: IDE Mode UI

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 6.1 | `IDEActivityBar` 组件 | 已完成 | `src/components/ide/IDEActivityBar.vue` |
| 6.2 | `IDEExplorer` 组件 | 已完成 | `src/components/ide/IDEExplorer.vue` |
| 6.3 | `IDEEditor` 组件 | 已完成 | `src/components/ide/IDEEditor.vue` |
| 6.4 | `IDETerminal` 组件 | 已完成 | `src/components/ide/IDETerminal.vue` |
| 6.5 | `IDEPlanPanel` 组件 | 已完成 | `src/components/ide/IDEPlanPanel.vue` |
| 6.6 | `IDEDevLog` 组件 | 已完成 | `src/components/ide/IDEDevLog.vue` |
| 6.7 | `IDEStatusBar` 组件 | 已完成 | `src/components/ide/IDEStatusBar.vue` |
| 6.8 | `IDEView` 页面 | 已完成 | `src/views/IDEView.vue` |

## Phase 7: 路由 + 布局集成

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 7.1 | 路由更新 | 已完成 | `src/router/index.ts` |
| 7.2 | Sidebar 导航更新 | 已完成 | `src/components/Sidebar.vue` |
| 7.3 | `App.vue` 布局适配 | 已完成 | `src/App.vue` |
| 7.4 | 模式切换逻辑 | 已完成 | `src/views/AgentView.vue`, `src/views/IDEView.vue` |

## Phase 8: 测试 + 优化

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 8.1 | 构建验证 | 已完成 | `npm.cmd run build` |
| 8.2 | 功能测试 | 进行中 | `/ai`, `/ide`, `/ai-overlay`, `/sub2api`, `node-pty`, `electron/main.ts` |
| 8.3 | 代码巡检 | 已完成 | `electron/main.ts`, `electron/preload.ts`, `src/env.d.ts`, `src/types/index.ts`, `src/components/ide/IDETerminal.vue`, `src/components/ide/IDEPlanPanel.vue`, `src/components/ide/IDEExplorer.vue`, `src/utils/aiPlanEngine.ts`, `src/utils/aiTools.ts`, `src/views/IDEView.vue`, `vite.config.mts` |

## Phase 9: 前端工作台重构

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 9.1 | 梳理 Agent / IDE 当前可用性问题，补齐错误、布局、字体与缩放层面的真实问题清单 | 进行中 | `docs/tasks/TASKS.md`, `src/views/AgentView.vue`, `src/views/IDEView.vue`, `src/components/ide/IDETerminal.vue`, `src/App.vue`, `src/components/Sidebar.vue` |
| 9.2 | 修复 `node-pty` / `conpty.node` 原生模块加载问题，确保 IDE 终端可在开发态与打包态正常启动 | 进行中 | `vite.config.mts`, `electron/main.ts`, `electron-builder.config.cjs`, `package.json` |
| 9.3 | 建立紧凑型设计令牌，整体下调组件尺寸、间距、字号与圆角，收紧玻璃卡片风格的占位体积 | 进行中 | `src/styles/variables.scss`, `src/styles/global.scss`, `src/styles/themes.scss` |
| 9.4 | 重构 App 外层壳：进入 `/ai` / `/ide` 后自动收缩软件侧边栏，并给工作台视图提供更高可用宽度 | 进行中 | `src/App.vue`, `src/components/Sidebar.vue`, `src/stores/settings.ts` |
| 9.5 | 重构 IDE 为类 VS Code 布局：左侧资源管理器、左下 MCP / 资源面板、中间编辑器、右侧 Agent、底部终端，支持面板伸缩与折叠 | 进行中 | `src/views/IDEView.vue`, `src/components/ide/*`, `src/stores/ai.ts` |
| 9.6 | 重构 Agent 为多层级工作台：左侧角色列表 / 会话，顶部工作台动作按钮，中央消息区，侧边抽屉承载角色配置 / 记忆 / MCP / Skill | 进行中 | `src/views/AgentView.vue`, `src/components/agent/*`, `src/stores/ai.ts` |
| 9.7 | 统一 IDE / Agent 信息密度与可拖拽面板行为，避免“卡片堆叠式页面”继续侵入工作台视图 | 进行中 | `src/views/AgentView.vue`, `src/views/IDEView.vue`, `src/components/ide/*`, `src/components/agent/*` |
| 9.8 | 做一轮前端专项巡检：验证主要页面可测试、可滚动、可收缩、可切换，补齐任务文档与变更日志 | 进行中 | `docs/tasks/TASKS.md`, `CHANGELOG.md`, `/ai`, `/ide`, `/ai-overlay` |
| 9.9 | 修复工具回合“下一步”触发的上下文污染与 502 风险：压缩工具结果 / 自检消息写入，改造 Agent / IDE 会话为紧凑活动卡片，避免原始 JSON 与系统日志整段刷屏 | 已完成 | `src/utils/aiConversation.ts`, `src/utils/aiMessagePresentation.ts`, `src/stores/ai.ts`, `src/components/agent/AgentMessageList.vue`, `src/components/ide/IDEAssistantPanel.vue`, `src/utils/ai.ts` |
| 9.10 | 为 Agent / IDE 对话输入区补齐手动截图、底部锚定输入栏与悬浮窗纯对话布局，继续压缩 Agent 顶部重复信息 | 已完成 | `electron/main.ts`, `electron/preload.ts`, `src/env.d.ts`, `src/utils/aiConversation.ts`, `src/components/AIChatDialog.vue`, `src/components/agent/AgentInputBar.vue`, `src/components/ide/IDEAssistantPanel.vue`, `src/views/AgentView.vue`, `src/views/AIOverlay.vue` |
| 9.11 | 修复 Gemini 原生多模态模型的产图回包：在原生图片模型下显式请求 IMAGE 模态，并约束 Agent 优先返回真实图片而不是口头描述 | 已完成 | `src/utils/ai.ts`, `src/utils/aiPrompts.ts`, `src/utils/aiConversation.ts` |
| 9.12 | 收口安装目录与运行数据目录保护：确认升级安装默认沿用旧安装目录，并让自动数据目录在重装后继续回到原路径 | 已完成 | `electron-builder.config.cjs`, `build/installer.nsh`, `electron/main.ts`, `src/views/Settings.vue`, `src/types/index.ts`, `README.md` |
| 9.13 | 继续压缩 Agent 顶部重复信息与底部输入区密度，统一工作台信息层级与底部 composer 交互 | 已完成 | `src/views/AgentView.vue`, `src/components/agent/AgentInputBar.vue`, `CHANGELOG.md`, `README.md` |
| 9.14 | 落地情绪型 Agent 心情带与 IDE 长任务循环节律：让 Prompt、自治执行状态、TTS 与运行文档统一遵循可持续长任务协议 | 已完成 | `src/utils/agentMood.ts`, `src/stores/ai.ts`, `src/utils/aiPrompts.ts`, `src/utils/aiAutonomyScheduler.ts`, `src/utils/aiPlanEngine.ts`, `src/components/AIChatDialog.vue`, `src/components/ide/IDEAssistantPanel.vue`, `src/components/ide/IDEPlanPanel.vue`, `src/types/index.ts` |
| 9.15 | 收口情绪链路最后一批入口：经典 `/ai` 语音播报改为沿用角色心情带，角色编辑页补上心情带预览与执行倾向提示 | 已完成 | `src/views/AIAssistant.vue`, `src/components/agent/AgentProfileManager.vue`, `README.md`, `CHANGELOG.md` |

---

## 当前剩余缺口

- Prompt 工程与命令执行链路已经按最新要求收口：运行时系统 Prompt、`aiPrompts.ts`、`ide_run_command` 工具声明与 Windows MCP 原始命令入口现在都改为“允许执行命令，但默认先说明目标、影响范围与回退方式”，不再使用命令黑名单或前置危险命令拦截；主进程仍会在命令长时间无输出、检测到交互式提示或超时后自动停止，并把触发停机的提示行与系统说明一并回传，工具层也保留输出头尾，减少“最后的报错被截掉、模型误判卡住原因”的问题。当前剩余工作主要是继续通过真实 TUI / 长命令人工回归观察自动停机阈值是否合适，以及继续细磨 Prompt 让模型在高影响命令前更稳定地先解释风险。
- 工具回合“下一步”链路这一轮已确认并修复一类真实问题：工具执行后的原始 JSON 结果、任务摘要回包与“工具回合自检”系统消息过去会原样写回会话，再被下一轮 `Responses` 请求重新注入上下文，导致请求体被无意义的工具日志膨胀，并在部分接口上复现 `502 upstream_error`。当前版本已改为把工具结果压缩成紧凑结构、把原始输出仅保留在消息元数据中供前端按需展开，同时把自检消息改成单行摘要 + 结构化 metadata，并为 `502/503/504 upstream` 增加一次轻量瞬时重试。剩余工作主要是继续观察真实长任务、复杂工具链和经典 `/ai` 兼容页是否还存在零散的原始日志刷屏点。
- Agent / IDE / AI 悬浮窗这轮又暴露出一类真实工作台问题：`/ai` 主工作台根容器未把中央区约束到剩余高度，消息流增长后会把输入区整体挤出可视区；沉浸式页头与悬浮窗标题栏也缺少明确拖拽区，用户拖动窗口时会误选文字；AI 悬浮窗还把 `Sub2API` / 配置桥接整段暴露在小窗里，打断纯对话体验。当前版本已把 Agent 根布局切到“头部固定 + 主区 1fr”、给 Agent / IDE 页头和悬浮窗标题栏加上原生拖拽区与 `no-drag` 控件边界，并把悬浮窗裁成纯对话视图；剩余工作主要是继续观察 Live2D 与其他沉浸式页面是否还存在局部误选中或拖拽手感不一致的问题。
- Agent / IDE 对话输入区这轮补齐了统一的手动截图链路：桌面端现在会通过 Windows 手动截图流程等待用户完成框选，再自动把截图结果挂到输入框上方的附件区；Agent 主工作台、IDE Agent 以及 AI 悬浮窗都已接入同一套能力，并把模型选择收回到底部控制区，避免输入组件继续出现“中间一大块空白、控制项和发送按钮分散”的问题。当前剩余工作主要是继续补用户手动截图的真实人工回归，因为系统截图流程无法通过当前自动化脚本完全模拟。
- Gemini 原生产图模型这轮确认了一类真实链路缺口：前端消息渲染与 `inlineData -> attachment` 转换早已存在，但 Gemini `generateContent` 请求体过去没有在图片生成场景显式要求 `IMAGE` 模态，导致 `gemini-*-image` 这类原生模型经常只返回文字描述。当前版本已在 `src/utils/ai.ts` 按“原生图片模型 + 本轮明确产图 / 编辑意图”自动附加 `responseModalities: ['TEXT', 'IMAGE']`，并在 Prompt 中补充“优先返回真实图片，不要只口头描述”的约束；剩余工作主要是继续用真实 Gemini / Sub2API 网关做人工联调，观察不同网关对原生图片 parts 的兼容情况。
- 安装目录与运行数据目录这轮也做了针对性收口：安装版升级时，electron-builder 的 NSIS assisted installer 本身就会优先读取上一版本注册表里的 `InstallLocation` 并默认沿用原安装目录；当前版本又显式把 `build/installer.nsh` 绑定进 `electron-builder.config.cjs`，避免后续构建链调整时失去这条逻辑。更重要的是，`electron/main.ts` 现在会为“自动策略”持久化最近一次自动运行数据目录，重装或升级后即使安装位置变化，也会优先回到原来的数据根目录，而不是重新落到新的空目录；设置页也补上了安装目录、自动策略记忆目录与升级策略提示，方便发包前后直接人工确认。
- Agent 工作台这轮继续做了结构化减法：头部摘要不再把角色类型、作用域和运行态在两层状态条里重复展示，工作台条只保留会话域、会话标题、模型、消息数与上下文负载；底部输入区则改成统一 composer，把发送、附件、截图、模型选择与自动步数收进一块稳定的底部工作条，减少空会话时的大面积留白，也让输入区更稳定地贴靠在窗口底边。
- 情绪型 Agent 这一轮终于不再只是“有个 mood 数值却几乎不用”：新增的 `agentMood.ts` 会把隐藏心情值归一到 `guarded / reserved / steady / warm / bright` 五档情绪带，并为每一档定义语气摘要、执行倾向、Prompt 指引与 TTS 建议。当前版本会根据用户的关怀、夸奖、负面反馈与受伤语气动态调整情绪型角色的隐藏心情，但不会因为命令式表达削弱 Agent 对用户明确指令的执行优先级。剩余工作主要是继续做真实陪伴场景人工回归，观察不同模型在“更有人情味”与“不过度表演”之间的平衡。
- IDE 长任务自治执行这轮也从“有调度状态”继续收口到了“有稳定循环节律”：运行时 Prompt、`RUN.md`、监督提示词和自治状态机现在统一采用 `Observe -> Choose Lane -> Execute -> Verify -> Record -> Continue` 的循环协议，并把当前循环阶段、焦点摘要、验证清单与继续规则落盘，明显更接近 Opencode 一类长任务代理的持续推进方式。剩余工作主要是继续观察真实长任务下的多轮阻塞处理、后台 worker 连续运行与更细的权限/资源治理，而不是循环协议仍然缺位。
- 情绪链路这一轮又补齐了两个容易遗漏的入口：经典 `/ai` 页面现在也会按当前角色心情带播放 TTS，不会再和 Agent / IDE / 悬浮窗出现不同的情绪播报手感；角色编辑页也新增了“当前心情带 + 语气摘要 + 执行倾向”即时预览，调节情绪型角色时不再只面对抽象滑杆。剩余工作主要是继续观察不同模型在真实陪伴对话中的语气稳定性，以及是否还需要更细的心情恢复/冷却机制。
- IDE 终端与上下文压缩这轮继续做了“长时间运行防卡死”收口：命令会话现在会持久化运行快照并支持 renderer 轮询兜底，即使退出事件丢失也能按快照收口；对于重复循环输出、长时间无输出、交互式提示和超时都会给出系统心跳或自动停机说明，命令若正常结束但无标准输出也会显式回传“已结束、无输出”，避免模型把“安静结束”误判成“仍在卡住”。上下文压缩则改为输出结构化 handoff 摘要，快照会记录消息锚点、最近工具、来源和已覆盖消息数，减少因只按创建时间增量切片而漏掉新消息的问题。当前剩余风险主要集中在真实 Electron 终端下 `vim` / `top` / watch 类命令的长时间人工回归，以及更深层的前后台自治调度协同。
- IDE 模式现在已经支持多工作区并行管理：每个工作区在创建时都会先选择项目根目录，再选择独立的基础产物目录；工作区会持久化自己的数据目录、产物目录、最近打开时间、编辑会话与计划链路，切换工作区时也会独立恢复对应的编辑现场。当前剩余工作主要集中在继续补强“跨工作区复制 / 迁移提示、工作区级终端与计划资源占用观测、长时间后台连续运行”这类深水区体验，而不是基础多工作区骨架缺失。
- Agent 模式现在已补齐“按角色覆盖运行参数”的主链路：每个角色都可以独立设定默认模型、温度与默认产物目录，主窗口 `/ai`、兼容入口 `/ai/classic` 与悬浮对话窗都会按当前角色的有效模型运行；角色切换模型后也会联动重新计算推荐自动步数。当前剩余工作主要是继续补“角色级温度 / 模型参数的更细粒度可视化、角色长期记忆管理面板、真正的一体化图片生成产物流”，而不是运行参数仍停留在全局配置。
- Agent / IDE 两条主链路现在都已补齐特殊文本识别：网页链接、绝对路径、工作区相对路径、脚本路径和 Markdown 文档路径会在对话消息中被自动识别为可激活目标，并优先按工作区根目录或本地路径解析；Prompt 也同步强调了 URL、脚本入口、文档路径和结构化资源线索的识别规则。当前剩余工作主要是继续观察更复杂路径模式、带行号跳转和更多富文本格式的兼容表现。
- Agent Mode 现在已经从“主代理 + 子代理池”收口为真正的“多角色 Agent 工作台”：主窗口与 Live2D / 悬浮窗都可以绑定不同角色，每个角色独立维护系统提示词、长期记忆、文件控制、软件控制、MCP 与 Skill 边界；会话会绑定角色，长期记忆也按角色隔离，且 Agent 模式下已显式禁止继续创建、建议创建或调用子代理工具。当前剩余工作主要不是角色切换本身，而是继续补齐“角色长期记忆可视化管理 / 清理 / 导出”等管理界面，以及让兼容入口 `/ai/classic` 也逐步跟上主链路体验。
- Live2D / AI 悬浮对话主链路现在已经真正默认绑定“小柔”：`/ai-overlay` 直接继承 Live2D 域默认角色，AI 悬浮窗会显示当前角色身份、能力边界并沿用角色级 TTS 风格；Live2D 悬浮窗抽屉也会显示当前角色、长期记忆、软件控制、MCP / Skill 与自动播报状态，方便用户从桌面侧确认“当前到底是谁在响应”。当前剩余工作主要是继续把 Live2D 表情 / 口型 / TTS 情绪做更深联动，以及补更多人工回归场景。
- Sub2API 的核心接入能力已经不再局限于独立工作台：`/ai` 主页面与悬浮对话窗现在都补上了可复用的桥接面板，用户可以在 Agent 主链路里直接看到本地 / 外部网关状态、一键切换当前 Sub2API 路由、读取模型、同步本地专属 Key 并执行快速体检。当前剩余工作不再是“有没有入口”，而是继续把账号池状态、路由选择与自治执行器里的任务上下文做更深的一体化联动。
- IDE 自治执行链路已经从 `.openagent/CONTEXT.md` handoff 升级到真正的 `.openagent/RUN.md` 自治调度状态机：当前会持久化自治运行状态、权限画像、建议并行度、任务领取映射、最近心跳，并在计划文档刷新时同步收口到工作区。当前剩余工作不再是“有没有调度器”，而是继续把它从“高质量状态机 + 恢复锚点”推进到“真正后台连续运行的 worker / 任务循环”。
- 主代理委派子代理时已经会自动拉取当前接口支持的模型列表并执行子代理模型路由，落盘记录选型方式、可用模型数量和选型理由；`spawn_sub_agent` 现在也支持把 `planId` / `taskId` 显式挂到任务领取状态，便于自治调度器追踪 ready task -> 子代理 -> 结果回传的链路。当前剩余缺口是把这套模型治理继续扩展到“按 Skill / MCP / 工具权限 / 成本预算”统一调度的强约束执行层，以及支持更长生命周期的多轮子代理执行。
- IDE 计划链路已经补齐“先生成详细计划、等待用户确认、切换计划状态、输出 `.openagent/PLAN.md` / `.openagent/TASKS.md` / `.openagent/CONTEXT.md` / `.openagent/RUN.md` / `.openagent/SUBAGENTS.md` / `.openagent/SUPERVISOR.md`、再由主代理按 ready task 监督并发”的执行协议；`IDEPlanPanel` 现在也会直接展示自治调度状态、权限统计、当前领取任务和最近心跳。当前剩余工作主要集中在把这套协议进一步收口成“可脱离前台页面持续运行”的执行器，而不是计划表达、任务树或监督提示词缺失。
- `IDETerminal` 已支持多标签、持久 shell、stdin 持续输入、`xterm` 渲染、按键直通与 resize 同步，`vim` / `top` 这类全屏命令也具备前端承载条件；当前剩余风险主要是缺少这类 TUI 场景的人工回归，以及长时间运行命令下的稳定性观察。
- IDE 项目计划已支持基于真实工作区快照、diff、失败反馈和上下文摘要的动态重规划，并在 `IDEPlanPanel` 中补齐了“计划漂移可见性 + 手动同步基线”能力：用户现在能直接看到当前计划与工作区之间的新增 / 修改 / 删除差异，区分“需要重规划”还是“仅需确认基线”；剩余工作是继续观察复杂冲突、跨阶段返工与多次连续重规划场景下的计划稳定性。
- `IDEExplorer` 已补齐资源管理器的高频交互闭环：支持 Ctrl/Cmd 多选、Shift 连选、根目录拖放区、目录拖拽移动、批量删除、剪贴板式复制/粘贴与批量重命名；复制会在目标目录中自动规避重名，并在目录自拷贝到子目录这类危险路径上做前置跳过，批量重命名会保留文件扩展名并在提交前预览冲突。当前剩余工作更多偏增量体验优化，例如跨工作区复制提示、更细的复制冲突策略和批量重命名模板增强，不再属于交付阻断项。
- `IDEEditor` 与 `IDEView` 已补齐编辑会话恢复与基础编辑增强：打开标签、当前焦点文件、未保存草稿和光标范围现在会按工作区持久化到 AI Store，并在从 `/ide` 切到 `/ai`、侧边导航跳转或页面重建后自动恢复；编辑器也已补上行号 gutter、实时 Ln/Col 状态、Ctrl/Cmd+F 查找、Ctrl/Cmd+H 替换、大小写切换、匹配跳转与替换当前 / 全部替换。当前剩余工作更多偏编辑器深水区能力，例如语法高亮、折叠、大文件编辑性能和更细的草稿冲突提示。
- `IDEPlanPanel` 已把“创建草案”文案改为“生成项目计划”，并显式提示会结合工作区结构、脚本和技术栈自动生成阶段/任务，避免用户误以为这里只会创建空计划；剩余工作是继续通过真实项目验证生成结果的可解释性和任务颗粒度。
- 构建层已把 `xterm` 相关依赖单独切分到 `terminal-vendor`，避免 IDE 终端能力把主 `vendor` chunk 继续推高；剩余工作是继续观察真实发布包下的加载体积与首屏行为。
- `/ai`、`/ide`、`/ai-overlay`、`/sub2api` 现在已补齐可复用的 `npm.cmd run smoke:routes` 路由烟测脚本，能在本机自动拉起 `vite preview`、验证关键页面返回 200 并在 Windows 上正确回收 preview 进程树；剩余缺口是完整浏览器 / Electron 交互级自动化回归，当前仍受 Playwright 在本机 Chrome 启动阶段退出（exit code 13）限制。

---

## 开发日志

| 时间 | 类型 | 内容 |
|------|------|------|
| 2026-03-13 01:10 | plan | 完成架构分析，生成 `REFACTOR-GUIDE.md` 和 `TASKS.md` |
| 2026-03-13 | types | Phase 1.1: `types/index.ts` 新增 SubAgent / IDE / Plan / Context 类型定义 |
| 2026-03-13 | code | Phase 1.2: 创建 `aiPrompts.ts`，落地主 Agent / IDE / 子代理 Prompt 与动态构建函数 |
| 2026-03-13 | code | Phase 1.3: `stores/ai.ts` 扩展 `agentMode` / `subAgents` / `ideWorkspace` / `projectPlans` / `contextSnapshots` 与对应 CRUD |
| 2026-03-13 | build | Phase 1 构建验证通过（`vue-tsc --noEmit`） |
| 2026-03-13 | code | Phase 2.1: 创建 `aiModelRouter.ts`，完成任务分析、能力需求和候选模型评分 |
| 2026-03-13 | code | Phase 2.2: 创建 `aiSubAgent.ts`，完成子代理生命周期管理、执行与结果汇总 |
| 2026-03-13 | code | Phase 2.3: 创建 `aiContextEngine.ts`，完成语义优先级、增量快照、上下文装配、跨 Agent 共享 |
| 2026-03-13 | code | Phase 2.4: `aiConversation.ts` 集成增量快照触发逻辑（`tryIncrementalSnapshot`） |
| 2026-03-13 | build | Phase 2 构建验证通过（`vue-tsc --noEmit`） |
| 2026-03-13 | code | Phase 3.1: `electron/main.ts` + `preload.ts` + `env.d.ts` 新增 IDE 文件系统 IPC 通道 |
| 2026-03-13 | code | Phase 3.2: 创建 `aiIDEWorkspace.ts`，支持工作区打开、扫描、读写、搜索、框架推断 |
| 2026-03-13 | code | Phase 3.3: 创建 `aiPlanEngine.ts`，支持 Plan Markdown 渲染、任务推进、阶段报告 |
| 2026-03-13 | code | Phase 3.4: 创建 `aiDevLogger.ts`，支持开发日志 API、工作区文档同步和最终报告生成 |
| 2026-03-13 | review | Phase 3 审查修复：补齐路径遍历防护、`writeFile` 大小限制、`electronAPI` 空值检查 |
| 2026-03-14 | code | Phase 9 前端工作台重构：`IDEView` 已重排为资源管理器 / MCP / 编辑器 / 终端 / 右侧 Inspector 骨架，并补上左右列与终端高度拖拽状态。 |
| 2026-03-14 | code | Phase 9 前端工作台重构：`AgentView` 已切为左侧本地工作台侧栏 + 中央视图，角色 / 会话 / 长期记忆 / 任务切换改为页内侧栏标签，新增 `AgentMemoryPanel.vue`。 |
| 2026-03-14 | build | Phase 9 巡检：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过；`electron-builder.config.cjs` 已补 `asarUnpack` 以收口 `node-pty` 打包态加载链路。 |
| 2026-03-14 | fix | Phase 9 工具回合 502 收口：定位到 `aiConversation.ts` 会把完整工具结果与“工具回合自检”整段写回会话，导致下一轮请求上下文被 JSON / 日志污染；现已改为压缩写入、原始结果转入 metadata，并为 `Responses` 的 502/503/504 upstream 错误增加一次轻量重试。 |
| 2026-03-14 | fix | Phase 9 工作台交互修正：`AgentView.vue` 改为 `auto / auto / 1fr` 根布局，避免消息区把输入框挤出视口；`AgentView.vue`、`IDEView.vue` 与 `AIOverlay.vue` 新增头部原生拖拽区并显式标记 `no-drag` 控件，修复拖动窗口时误选中文字的问题；`AIChatDialog.vue` 与 `AIOverlay.vue` 同步裁掉悬浮窗里的 AI 设置 / Sub2API 配置露出，保留纯对话小窗。 |
| 2026-03-14 | test | Phase 9 工作台交互回归：再次执行 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ai-overlay --route=/ide`，确认 Agent 输入区、悬浮窗纯对话视图与沉浸式拖拽区改动未破坏桌面渲染链。 |
| 2026-03-15 | code | Phase 9 情绪机制与长任务协议收口：新增 `agentMood.ts`，把情绪型 Agent 的隐藏心情值映射为五档心情带，并在 `stores/ai.ts` / `aiPrompts.ts` 中补齐“更自然的人情味表达 + 任务优先级不失控”的 Prompt 规则；`aiAutonomyScheduler.ts` / `aiPlanEngine.ts` / `IDEPlanPanel.vue` 则把 IDE 长任务推进统一到 `Observe -> Choose Lane -> Execute -> Verify -> Record -> Continue` 的循环节律。 |
| 2026-03-15 | fix | Phase 9 情绪链路补全：`AgentView.vue`、`AIChatDialog.vue` 与 `IDEAssistantPanel.vue` 的 TTS 播放现已接入心情带驱动，不再只读取角色静态 TTS 配置；情绪型 Agent 的心情变化会影响语气和播报风格，但不会覆盖执行用户明确需求的主目标。 |
| 2026-03-15 | build | Phase 9 情绪机制与自治循环节律验证：执行 `npm.cmd run build` 与 `npm.cmd run smoke:routes`，确认新增类型、自治状态字段、Prompt 收口和 TTS 心情映射未破坏主构建与关键路由。 |
| 2026-03-15 | polish | Phase 9 情绪链路一致性收口：`AIAssistant.vue` 现已接入 `resolveMoodAwareTtsOverrides`，经典页会沿用角色心情带播报；`AgentProfileManager.vue` 则补上心情带即时预览，方便调校情绪型角色的人情味与执行倾向。 |
| 2026-03-14 | ui | Phase 9 会话区收口：`AgentMessageList.vue` 改为把系统消息 / 工具结果渲染为紧凑活动卡片，工具调用参数和原始结果默认折叠展示；`IDEAssistantPanel.vue` 复用同一组件，并顺手修复了运行态“会话”标签乱码。 |
| 2026-03-14 | test | Phase 9 工具回合收口验证：`npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ide` 均通过，确认新消息压缩层和活动卡片展示没有破坏 `/ai`、`/ide` 主界面。 |
| 2026-03-14 | code | Phase 9 前端精修第二轮：`IDEActivityBar.vue` 新增资源 / 终端 / Inspector 面板显隐开关，`IDEView.vue` 新增顶部 workbench 工具条、折叠态持久化与更紧凑的骨架变量，继续向可收纳工作台收口。 |
| 2026-03-14 | code | Phase 9 前端精修第二轮：`AgentView.vue` 新增页内工作台条、侧栏折叠与持久化；`AgentToolbar.vue`、`AgentInputBar.vue`、`AgentSessionList.vue`、`AgentProfileManager.vue`、`AgentTaskBoard.vue` 收紧标题、卡片、按钮与表单密度，减少卡片堆叠感。 |
| 2026-03-14 | build | Phase 9 精修验证：全局设计令牌进一步下调后再次执行 `npm.cmd run build` 与 `npm.cmd run smoke:routes`，主路由与工作台页面仍保持可构建、可访问。 |
| 2026-03-14 | code | Phase 9 前端精修第三轮：`IDEView.vue` 把顶部大信息卡收口为窄头部 + workbench 工具条，工作区路径、产物目录、语言/框架和当前文件统一折叠到紧凑胶囊信息里；同时下调 IDE 默认左右栏宽度和终端高度，让编辑区更接近真实工作台比例。 |
| 2026-03-14 | code | Phase 9 前端精修第三轮：`AgentView.vue` 进一步压缩顶部 hero 与页内侧栏密度，新增上下文胶囊信息，收紧默认侧栏宽度、按钮、输入区和上下文栏尺寸，减少“页面说明区挤占消息区”的问题。 |
| 2026-03-14 | code | Phase 9 终端加载链收口：`electron/main.ts` 改为使用 `createRequire` 在运行时加载 `node-pty`，并增加多候选路径回退；`vite.config.mts` 同步外置 `node-pty` 子路径，避免原生绑定再次被 Rollup 打进 Electron main bundle。 |
| 2026-03-14 | build | Phase 9 终端链路验证：执行 `npm.cmd run build:clean` 后重新构建，确认 `dist-electron` 仅产出 `main.js` / `preload.js`，且 `dist-electron/main.js` 已不再包含 `import(\"node-pty\")` 与 `Could not dynamically require` 残留文本；`npm.cmd run smoke:routes` 再次通过。 |
| 2026-03-14 | code | Phase 9 前端精修第五轮：`IDEView.vue` 把左侧工作区继续收口为可调高的 Explorer / MCP 双区，新增 MCP 独立显隐按钮、左栏内联分割条双击复位与布局持久化，让“左侧资源、左下 MCP”真正成为稳定布局而不是静态堆叠。 |
| 2026-03-14 | code | Phase 9 前端精修第五轮：`IDEMcpPanel.vue` 补上手动刷新入口与异常计数摘要，`AgentView.vue` 则新增页内侧栏显隐 / 重置栏宽按钮、侧栏分割条双击复位，以及 `scope / sessionId / panel` 路由同步，减少刷新或切页后的工作上下文丢失。 |
| 2026-03-14 | build | Phase 9 精修验证：本轮交互改动完成后再次执行 `npm.cmd run build` 与 `npm.cmd run smoke:routes`，主路由与工作台页面继续保持可构建、可访问；`git diff --check` 无新增空白符错误，仅保留现有 LF -> CRLF 提示。 |
| 2026-03-14 | code | Phase 9 前端精修第六轮：新增 `AgentResourcesPanel.vue`，把托管 MCP / Skill 状态、角色授权边界、已启用资源与异常资源摘要接入 Agent 页内侧栏；`AgentView.vue` 新增“资源”工作台标签，让 `9.6` 中要求的“角色配置 / 记忆 / MCP / Skill”抽屉不再缺失 MCP / Skill 这一块。 |
| 2026-03-14 | build | Phase 9 精修验证：新增 Agent 资源面板后再次执行 `npm.cmd run build`，确认 `AgentView` 侧栏标签扩展与 `AgentResourcesPanel.vue` 引入未破坏类型检查与打包。 |
| 2026-03-14 | risk | Phase 9 MCP 浏览器复核：本轮按 `playwright-interactive` 工作流再次拉起本地静态预览并尝试用 MCP 浏览器访问 `/ai`，Chrome 仍在启动阶段退出并返回 `exit code 13`；这说明前端 UI 自动化缺口依旧来自本机浏览器环境，而不是页面代码或本地预览服务。 |
| 2026-03-14 | code | Phase 9 真实 Electron 回归补强：`electron/main.ts` 新增 `--main-route`、`--capture-main-window`、`--capture-delay-ms`、`--capture-quit` 启动参数，`scripts/check-electron-ui.cjs` 可直接导出 `/ai` 与 `/ide` 的真实 Electron PNG 截图，用于在 Chrome 阻塞时继续做人眼回归。 |
| 2026-03-14 | code | Phase 9 空态工作台精修：`IDEView.vue` 在未绑定工作区时新增 Explorer / MCP / Editor / Runtime / Inspector 空工作台骨架，避免 Electron 截图只剩大片空白；`AgentMessageList.vue` 在“已有会话但尚未发送消息”时新增 session-ready 状态卡，把提示词、会话事实和下一步入口集中到消息区首屏。 |
| 2026-03-14 | build | Phase 9 Electron 截图验证：执行 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui` 成功导出 `/ai` 与 `/ide` 的真实 Electron 视图截图；`npm.cmd run build` 与 `npm.cmd run smoke:routes` 继续通过，说明空态精修未破坏主路由与桌面渲染链。 |
| 2026-03-14 | risk | Phase 9 Chrome 自动化复核：执行 `npm.cmd run check:chrome-automation` 后，plain / remote-debugging / temp-profile 三种 Chrome 启动场景仍全部返回 `exit code 13`；当前 Playwright/MCP 自动化阻塞已进一步确认属于本机 Chrome 运行环境，而不是 OpenAgent 页面代码。 |
| 2026-03-14 | code | Phase 9 视觉层级精修：`App.vue` 为 immersive 工作台补上更中性的桌面背景层，`IDEView.vue` / `AgentView.vue` 统一增强 glass panel 对比度、边界和阴影，`Sidebar.vue` 收紧工作台态主侧边栏色相与边框，让 `/ai`、`/ide` 从主题化粉白底回到更可持续工作的中性桌面层级。 |
| 2026-03-14 | code | Phase 9 高频导航精修：`AgentView.vue` 移除页内侧栏头部的多余玻璃卡片感，`AgentSessionList.vue` 强化当前会话选中态，`IDEActivityBar.vue` 与 Agent 页内 rail 新增 active indicator，降低“当前在哪个面板”不够明确的问题。 |
| 2026-03-14 | build | Phase 9 视觉回归复测：完成对比度与 active state 精修后再次执行 `npm.cmd run build`、`npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui` 与 `git diff --check`，确认 `/ai`、`/ide` 真实 Electron 截图可继续导出，且未引入新的空白符错误。 |
| 2026-03-13 | build | Phase 3 构建验证通过（`vue-tsc --noEmit`） |
| 2026-03-13 | code | Phase 4: `ai.ts` + `aiTools.ts` 新增模型路由、子代理、IDE 文件、计划与日志工具 |
| 2026-03-13 | review | Phase 4 审查修复：增加 IDE 模式门禁、计划归属校验、日志类型校验 |
| 2026-03-13 | build | Phase 4 构建验证通过（`vue-tsc --noEmit`） |
| 2026-03-13 | code | Phase 5: 创建 Agent Mode 组件集与 `AgentView`，完成会话区、消息流、输入栏、任务板、子代理池、上下文栏 |
| 2026-03-13 | code | Phase 7.1: `/ai` 路由切换到 `AgentView`，并保留 `/ai/classic` 兼容入口 |
| 2026-03-13 | review | Phase 5 审查修复：禁止未配置状态下新建会话，收紧输入栏禁用逻辑 |
| 2026-03-13 | build | Phase 5/7 构建验证通过（`vue-tsc --noEmit`） |
| 2026-03-13 | code | Phase 6: 创建 IDE Mode 组件集与 `IDEView`，打通工作区打开、文件浏览、编辑保存、计划与日志面板 |
| 2026-03-13 | code | Phase 6/7: Sidebar 新增 IDE 导航，`App.vue` 对 `/ide` 启用工作台布局，`IDETerminal` 先落地为命令甲板首版 |
| 2026-03-13 | code | Phase 7.4: `AgentView` 与 `IDEView` 双向模式切换按钮接入 |
| 2026-03-13 | code | Phase 6/工具闭环: AI Store 补齐 `ideWorkspace` / `projectPlans` / `contextSnapshots` 持久化回读，新增 `get_sub_agent_status` 工具并对齐 IDE Prompt 工具名 |
| 2026-03-13 | review | Phase 6 审查修复：工作区切换未保存保护、稳定工作区 ID、IDE 就绪态提示、保存快捷键条件保护、工具契约与状态持久化收口 |
| 2026-03-13 | build | Phase 6/7/8.1 构建验证通过（`npm.cmd run build`） |
| 2026-03-13 | code | Phase 8: `stores/ai.ts` 将 `buildContextMessages()` 切到 `assembleContext()` 主链路，正式接入快照摘要与语义优先上下文装配，并保留旧滑窗回退 |
| 2026-03-13 | build | Phase 8 上下文主链路集成后构建验证通过（`npm.cmd run build`） |
| 2026-03-13 | code | Phase 7.2/7.3: `Sidebar.vue` 新增 Agent 工作区分区与 IDE 入口，`App.vue` 为 `/ide` 启用无顶栏沉浸布局并关闭无效搜索热键 |
| 2026-03-13 | review | Phase 8.3: 代码巡检补齐 Sidebar 类型列表双高亮修复，并避免 `/ide` 顶栏隐藏后外层容器裁剪超出视口内容 |
| 2026-03-13 | build | Phase 7.2/7.3/8.3 集成修复后 `vue-tsc --noEmit` 通过 |
| 2026-03-13 | code | Phase 8: `electron/main.ts` / `preload.ts` / `env.d.ts` 接入 IDE 终端命令执行、实时输出事件与取消能力，`IDETerminal.vue` 升级为真实终端面板，`IDEView.vue` 同步识别 `npm` / `pnpm` / `yarn` / `bun` 脚本命令 |
| 2026-03-13 | build | Phase 8 IDE 终端链路接入后构建验证通过（`npm.cmd run build`） |
| 2026-03-13 | code | Phase 8: `aiPlanEngine.ts` 重建初始计划生成链路，基于工作区结构、脚本与技术栈推断自动生成阶段/任务；`IDEView.vue` 与 `aiTools.ts` 统一接入同一套计划创建逻辑，避免再次产出空草稿 |
| 2026-03-13 | review | Phase 8 巡检：复核 IDE 计划链路与 store 状态归一化，确认 `setProjectPlanPhases()` + `addProjectPhase()` 会统一规范 `phaseId` / order；当前无新增阻断项，剩余风险收敛为 PTY 能力与真实交互回归 |
| 2026-03-13 | build | Phase 8 计划生成链路收口后 `npm.cmd run build` 通过 |
| 2026-03-13 | code | Phase 8: `electron/main.ts` 接入 `node-pty` 优先的交互式 PTY，多标签终端在 Electron 运行时支持真实 PTY / 回退 Pipe 双通道；`package.json` 新增 `rebuild:native` / `postinstall` 自动重建原生依赖 |
| 2026-03-13 | code | Phase 8: `aiPlanEngine.ts` / `aiTools.ts` / `ai.ts` / `aiPrompts.ts` 接入基于工作区快照、diff、失败反馈和上下文摘要的动态重规划；`IDEPlanPanel.vue` 与 `IDEView.vue` 新增手动动态重规划入口 |
| 2026-03-13 | review | Phase 8 巡检：收口 `stores/ai.ts` 计划进度计算重复逻辑，并复核 `IDETerminal`、主进程终端会话管理、动态重规划插入阶段与日志快照链路的一致性 |
| 2026-03-13 | test | Phase 8 烟测：`npm.cmd run build` 通过；`Invoke-WebRequest` 验证 `/ai`、`/ide`、`/ai-overlay`、`/sub2api` 本地预览均返回 200；Electron 运行时完成 `node-pty` import 与 PTY spawn smoke |
| 2026-03-13 | risk | Phase 8 风险记录：Playwright 浏览器自动化在本机 Chrome 启动阶段退出（exit code 13），因此本轮 UI 回归以路由烟测 + Electron PTY 运行时验证 + 代码巡检为主，后续需补自动化 UI 验证 |
| 2026-03-13 | review | Phase 8 用户视角深巡检：确认 IDE 终端顶部“停止”按钮在 shell 模式下直接关闭会话不符合用户预期，切标签后缺少输入草稿/命令历史连续性，计划面板“创建草案”文案与真实自动生成逻辑不一致，已列为 UX 阻断项并完成修复 |
| 2026-03-13 | code | Phase 8 UX 优化：`electron/main.ts` / `preload.ts` / `env.d.ts` 新增 `ideInterruptTerminalSession`，`IDETerminal.vue` 改为 shell 优先发送 Ctrl+C 中断、补齐每标签草稿与命令历史浏览，`IDEPlanPanel.vue` 同步校正文案与生成提示 |
| 2026-03-13 | code | Phase 8 终端补全：`IDETerminal.vue` 接入 `xterm` 终端画布与按键直通，`electron/main.ts` / `preload.ts` / `env.d.ts` / `types/index.ts` 新增 `ideResizeTerminalSession`，让 PTY cols/rows 跟随前端视口同步，补齐全屏终端类命令的前端承载能力 |
| 2026-03-13 | review | Phase 8 性能巡检：新增 `vite.config.mts` 中的 `terminal-vendor` chunk 拆分，避免 `xterm` 相关依赖继续推高主 `vendor` 包体；当前构建无新增超限告警，仅保留既有 wasm/runtime warning |
| 2026-03-13 | build | Phase 8 PTY 视图补全后 `npm.cmd run build` 通过，终端依赖已拆分为独立 `terminal-vendor` chunk |
| 2026-03-13 | code | Phase 8 资源管理器补全：`IDEExplorer.vue` 新增新建文件 / 新建目录 / 重命名 / 删除动作、目标目录提示、名称校验与焦点态；`IDEView.vue` 接入创建后自动刷新结构与文件自动打开，并在重命名 / 删除时同步处理打开标签；`electron/main.ts` / `preload.ts` / `env.d.ts` / `aiIDEWorkspace.ts` 新增条目重命名与删除链路 |
| 2026-03-13 | build | Phase 8 资源管理器管理链路接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | review | Phase 8 用户视角巡检：确认资源管理器高级剩余项集中在批量选择反馈、目录拖拽移动与批量删除闭环；同时要求批量操作不能打断已打开标签路径映射，也不能在父子节点同时选中时重复执行文件系统动作 |
| 2026-03-13 | code | Phase 8 资源管理器高级补全：`IDEExplorer.vue` 新增 Ctrl/Cmd 多选、Shift 连选、根目录拖放区、目录拖拽移动与批量删除；`IDEView.vue` 接入批量删除 / 移动后的脏文件保护、顶层路径折叠、标签路径重映射与统一结构刷新 |
| 2026-03-13 | build | Phase 8 资源管理器高级交互补齐后 `npm.cmd run build` 通过 |
| 2026-03-13 | review | Phase 8 用户视角巡检：确认项目计划虽然已具备动态重规划，但用户仍缺少“当前计划是否已与真实工作区漂移”的可视判断，容易在应当重规划和只需同步基线之间误判 |
| 2026-03-13 | code | Phase 8 计划稳定性补全：`aiPlanEngine.ts` 导出计划漂移检查与基线同步能力，`IDEPlanPanel.vue` 新增漂移摘要卡片、基线时间与样例文件展示，`IDEView.vue` 在保存 / 刷新 / 重规划后联动刷新计划漂移状态并提供“同步基线”入口 |
| 2026-03-13 | build | Phase 8 计划漂移可视化与基线同步接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | code | Phase 8 回归兜底补全：新增 `scripts/smoke-routes.cjs` 与 `npm.cmd run smoke:routes`，自动拉起 `vite preview` 并验证 `/`、`/ai`、`/ide`、`/ai-overlay`、`/sub2api` 返回 200；同时修复 Windows 下 preview 进程树未回收导致脚本挂住的问题 |
| 2026-03-13 | test | Phase 8 路由烟测脚本验证通过：`npm.cmd run smoke:routes` 已在当前环境完成关键页面可达性检查，并确认 preview 进程能正确退出 |
| 2026-03-13 | code | Phase 8 资源管理器复制链路补全：`electron/main.ts` / `preload.ts` / `env.d.ts` / `aiIDEWorkspace.ts` 新增 `ide:copyEntry` 复制通道；`IDEView.vue` 接入工作区剪贴板、批量复制、重名避让与目录自拷贝保护；`IDEExplorer.vue` 补齐复制 / 粘贴按钮、快捷键与目标目录提示 |
| 2026-03-13 | build | Phase 8 资源管理器复制链路接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | code | Phase 8 资源管理器批量重命名补全：`IDEExplorer.vue` 新增批量重命名面板、查找替换 / 前后缀预览与冲突提示；`IDEView.vue` 接入两阶段临时路径重命名提交，解决多条目互换命名时的循环冲突，并同步迁移已打开标签路径 |
| 2026-03-13 | review | Phase 8 工作区安全加固：`aiIDEWorkspace.ts` 收紧工作区相对路径解析，禁止通过 `../` 逃出项目根目录，避免异常输入把文件系统操作越界到工作区外 |
| 2026-03-13 | build | Phase 8 批量重命名与路径守卫接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | review | Phase 8 用户视角巡检：确认 `/ide` 当前最大的真实风险不再是资源管理器，而是编辑区本地状态只挂在页面内存里；一旦切到 `/ai`、通过侧边栏离开或页面重建，未保存草稿会直接消失，因此将“编辑会话持久化与恢复”提升为当前最高优先级修复项 |
| 2026-03-13 | code | Phase 8 编辑会话恢复补全：`stores/ai.ts` 新增 `ideEditorSession` 持久化状态，`types/index.ts` 定义 IDE 编辑会话类型，`IDEView.vue` 接入工作区级编辑标签 / 焦点文件 / 未保存草稿的自动保存与恢复，并在路由切换和页面卸载前即时刷盘，避免从 `/ide` 跳转到其他页面时静默丢失未保存内容 |
| 2026-03-13 | build | Phase 8 编辑会话恢复接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | code | Phase 8 编辑器交互补全：`IDEEditor.vue` 接入行号 gutter、实时光标状态、Ctrl/Cmd+F 查找、Ctrl/Cmd+H 替换、匹配跳转与替换当前 / 全部替换；`IDEStatusBar.vue` 增加 Ln/Col 与选区信息展示，`IDEView.vue` / `stores/ai.ts` / `types/index.ts` 同步持久化每个标签的光标范围，保证切页恢复后编辑现场连续 |
| 2026-03-13 | build | Phase 8 编辑器交互补全接入后 `npm.cmd run build` 通过 |
| 2026-03-13 | code | Phase 8 计划执行协议补全：`types/index.ts` 新增执行编排类型，`aiPlanEngine.ts` / `aiTools.ts` / `ai.ts` / `aiPrompts.ts` 补齐计划状态流转、ready / blocked 执行包、`.openagent/TASKS.md` 全量任务树、`.openagent/SUBAGENTS.md` / `.openagent/SUPERVISOR.md` 输出与 `ide_update_plan_status` 工具，`IDEPlanPanel.vue` / `IDEView.vue` 接入计划确认、执行编排展示与主代理 / 子代理提示词复制 |
| 2026-03-13 | test | Phase 8 计划执行协议验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认 `/ai`、`/ide`、`/ai-overlay`、`/sub2api` 路由烟测仍可用 |
| 2026-03-13 | code | Phase 8 自治执行增强：`aiTools.ts` 改为在 `route_model` / `spawn_sub_agent` 中自动获取当前接口支持的模型列表并执行子代理模型选型，`types/index.ts` / `stores/ai.ts` 持久化子代理选型元数据，`aiPrompts.ts` 显式约束子代理不能再创建代理，`SubAgentCard.vue` 展示选型方式与理由 |
| 2026-03-13 | code | Phase 8 上下文接力增强：`aiPlanEngine.ts` 新增 `.openagent/CONTEXT.md` 工作区 handoff 文档，压缩计划状态、ready / blocked 队列、会话摘要、上下文快照、最近子代理与开发日志；`aiConversation.ts` 在触发上下文压缩后自动刷新 handoff 文档，`aiContextEngine.ts` 也会把会话长摘要注入子代理共享上下文 |
| 2026-03-13 | test | Phase 8 自治执行增强验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认新增模型路由、上下文 handoff 与压缩后文档刷新未破坏关键路由链路 |
| 2026-03-13 | code | Phase 8 自治调度器状态机：`types/index.ts` / `stores/ai.ts` 新增自治运行状态、权限规则、任务领取与心跳持久化；`aiAutonomyScheduler.ts` 负责汇总 Skill / MCP / 内置工具权限画像、建议并行度与 ready task 领取状态，并在计划刷新时同步生成 `.openagent/RUN.md` |
| 2026-03-13 | code | Phase 8 自治调度 UI/工具闭环：`IDEPlanPanel.vue` / `IDEView.vue` 新增自治调度状态卡片、运行/暂停/同步入口；`ai.ts` / `aiTools.ts` 新增 `ide_get_autonomy_run` / `ide_sync_autonomy_run`，并为 `spawn_sub_agent` 增加 `planId` / `taskId` 映射，打通任务 -> 子代理 -> 调度状态机链路 |
| 2026-03-13 | test | Phase 8 自治调度器状态机验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认 RUN.md 落盘、IDE 调度面板和自治工具链未破坏 `/ai`、`/ide`、`/ai-overlay`、`/sub2api` 主链路 |
| 2026-03-13 | code | Phase 8 Sub2API 主链路集成：新增 `Sub2ApiAgentBridge.vue`，把本地 / 外部网关状态、一键接管 Agent、模型读取、快速体检与本地专属 Key 同步直接下沉到 `/ai` 与悬浮对话窗；同时 `sub2api.ts` / `stores/sub2api.ts` / `AISettings.vue` / `Sub2ApiSettings.vue` 改为优先使用真实 `runtimeState` 推导 Base URL、模型读取、能力检查和 Codex 配置模板，避免桌面网关场景下的静态地址错位 |
| 2026-03-13 | test | Phase 8 Sub2API 主链路集成验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认 Agent 页面、悬浮对话窗与 `/sub2api` 工作台在新增桥接面板后仍保持关键路由可达 |
| 2026-03-13 | code | Phase 8 Agent 模式角色化收口：`stores/ai.ts` / `types/index.ts` 新增多角色 Agent 配置、角色级长期记忆与默认作用域选择；`AIChatDialog.vue` / `AgentView.vue` / `AgentSessionList.vue` / `AgentContextBar.vue` / `AgentProfileManager.vue` 改为围绕角色提示词、长期记忆、文件控制、软件控制、MCP / Skill 边界工作，并明确 Agent 模式不支持子代理 |
| 2026-03-13 | code | Phase 8 悬浮链路角色同步：`AIOverlay.vue` 默认显示 Live2D 域角色（默认小柔），`Live2DOverlay.vue` 抽屉新增角色身份、长期记忆、软件控制、MCP / Skill 与 TTS 自动播报状态展示，帮助用户从桌面侧快速确认当前角色配置 |
| 2026-03-13 | review | Phase 8 一致性巡检：修复 `AgentProfileManager.vue` 草稿脏状态判断失效、收口 `aiPrompts.ts` 中 Agent 模式仍建议模型路由 / 子代理的旧叙事，并校正文案空态，避免 UI 和运行时边界出现两套说法 |
| 2026-03-13 | test | Phase 8 多角色 Agent 收口验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认 `/ai`、`/ai-overlay`、`/live2d-overlay` 与 `/ide` 主链路在多角色 / 长期记忆 / 能力门禁接入后仍保持可构建和可达 |
| 2026-03-13 | code | Phase 8 多工作区与运行参数收口：`runtimeDirectories.ts` / `aiIDEWorkspace.ts` / `stores/ai.ts` / `IDEView.vue` 将 IDE 模式升级为多工作区持久化模型，每个工作区独立记录项目目录、基础产物目录、数据目录与最近打开状态；`AgentProfileManager.vue` / `AgentView.vue` / `AIChatDialog.vue` / `AIAssistant.vue` 则补齐角色级默认模型、温度与产物目录配置，并把有效模型显示统一到当前角色运行态 |
| 2026-03-13 | code | Phase 8 特殊目标识别收口：新增 `aiRichText.ts`，让 `/ai`、`/ai/classic`、悬浮对话窗和 Agent 消息流自动识别 URL、文件路径、工作区相对路径、脚本与 Markdown 文档路径，支持在桌面端直接打开外链或本地资源；`aiPrompts.ts` 也同步强化了特殊文本识别与目录写入规则 |
| 2026-03-13 | test | Phase 8 多工作区 / 角色运行参数 / 富文本目标识别验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认 `/ai`、`/ai/classic`、`/ide`、`/ai-overlay`、`/sub2api` 在新增有效模型覆盖与特殊链接处理后仍保持关键链路可达 |
| 2026-03-13 | code | Phase 8 Prompt / 终端安全收口：`stores/ai.ts` 与 `aiPrompts.ts` 补齐运行时命令建议，`ai.ts` / `aiTools.ts` 放宽 `ide_run_command` 与 Windows MCP 原始命令执行边界，移除命令黑名单与前置危险命令拦截，仅保留输出裁剪、结果回读与自动停机守卫；`IDETerminal.vue` 也同步展示一次性命令自动停机策略 |
| 2026-03-13 | review | Phase 8 终端防卡住巡检：确认 AI 一次性命令过去存在“交互提示行可能在自动停机前丢失、长输出易截断最后报错、MCP 原始命令报错过晚”的问题；现已统一改为先回传触发行再停机、保留输出头尾，并把风险控制从命令黑名单调整为 Prompt 引导 + 执行透明度 + 自动停机 |
| 2026-03-13 | test | Phase 8 Prompt / 终端策略调整验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认移除命令黑名单、放宽工作目录限制并保留自动停机守卫后，`/ai`、`/ide`、`/ai-overlay`、`/sub2api` 主链路未被破坏 |
| 2026-03-13 | code | Phase 8 长时间运行收口：`aiContextEngine.ts` 把上下文快照从“按创建时间增量”改成“按消息锚点 / lastMessageAt / messageCount 增量”，并把本地快照摘要升级为 `Goal / Instructions / Discoveries / Accomplished / Relevant Tools / Continued Context` 的可接力结构；`aiConversation.ts` 的 LLM 压缩输出也改为结构化 handoff JSON，并在压缩后同步写回 `compression` 来源快照 |
| 2026-03-13 | code | Phase 8 终端防挂起补强：`electron/main.ts` / `preload.ts` / `env.d.ts` / `types/index.ts` 新增命令会话运行快照查询，`aiTools.ts` 在等待命令结果时改为“事件流 + 运行快照轮询”双通道收口；若命令已经退出但前端没收到终态事件，会根据快照补发心跳与终态说明，重复循环输出也会进入自动停机守卫 |
| 2026-03-13 | review | Phase 8 长任务巡检：确认旧实现存在“快照按 createdAt 切片导致新消息被漏算、压缩摘要缺乏接力结构、命令结束无输出时模型可能误判为仍在运行、退出事件丢失会导致工具层长时间等待”的风险；当前版本已通过消息锚点快照、结构化压缩摘要、运行快照轮询与无输出显式回执完成收口 |
| 2026-03-13 | test | Phase 8 长时间运行收口验证：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，确认上下文快照扩展、运行快照 IPC、终端轮询收口与 `/ai`、`/ide`、`/ai-overlay`、`/sub2api` 主链路兼容 |
| 2026-03-14 | code | Phase 9 输入区重构：`AIChatDialog.vue`、`AgentInputBar.vue` 与 `IDEAssistantPanel.vue` 已补齐手动截图入口，截图完成后会自动挂载到输入框上方附件区；模型选择统一收回到底部控制区，并把 AI 悬浮窗切成纯对话视图。 |
| 2026-03-14 | review | Phase 9 布局巡检：`AgentView.vue` 已压缩顶部重复运行信息，`/ai` 主工作台继续保持“标题 / 会话操作 / 运行偏好 / 消息流 / 输入栏”分层，输入栏稳定贴底；`npm.cmd run check:electron-ui -- --route=/ai --route=/ai-overlay --route=/ide` 截图复核通过。 |
| 2026-03-15 | code | Phase 9 Gemini 产图修复：`src/utils/ai.ts` 现会在 `gemini-*-image` 原生模型下，遇到“生成 / 编辑图片”请求时自动为 `generateContent` 附加 `responseModalities: ['TEXT', 'IMAGE']`；`src/utils/aiPrompts.ts` 也同步约束 Agent 优先返回真实图片结果，而不是只给出文字构图说明。 |
| 2026-03-15 | build | Phase 9 Gemini 产图修复后已通过 `npm.cmd run build` 与 `npm.cmd run smoke:routes`，确认请求体调整和 Prompt 收口未破坏现有主路由与 Electron 构建链。 |
| 2026-03-15 | code | Phase 9 安装 / 数据目录保护：`electron/main.ts` 为自动策略新增最近一次自动数据目录记忆，`Settings.vue` 直接展示安装目录与自动策略记忆目录，`electron-builder.config.cjs` 显式绑定 `build/installer.nsh`，确保升级默认沿用旧安装目录，同时减少重装后数据目录跑偏的概率。 |
| 2026-03-15 | build | Phase 9 安装 / 数据目录保护后已通过 `npm.cmd run build` 与 `npm.cmd run smoke:routes`，确认主进程数据目录调整与设置页展示未破坏构建和主路由。 |
| 2026-03-15 | code | Phase 9 Agent 工作台精修：`AgentView.vue` 压缩顶部重复信息，把角色类型留在头部摘要、把工作台条收口到会话域 / 会话标题 / 模型 / 消息数 / 上下文负载；`AgentInputBar.vue` 重构为统一底部 composer，发送、附件、截图、模型选择与步数控制收进同一块底部工作条。 |
| 2026-03-15 | test | Phase 9 Agent 工作台精修验证：执行 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `node scripts/check-electron-ui.cjs --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/settings`，确认 `/ai` 顶部信息密度与底部输入区在真实 Electron 截图下保持稳定，设置页安装 / 数据目录卡片仍可正常渲染。 |

## Latest Check

- 2026-03-14 Agent 布局回归修正：`App.vue` 已把 immersive 路由内容区改成真正的全高 flex 子布局，避免 `/ai`、`/ide` 子页面在内容变多时继续把整页撑高；此前用户看到的“输入区被顶出窗口 / 只能看到上半截工作台”不再由外层容器继续放大。
- 2026-03-15 Gemini 原生产图回包检查：已确认问题不在前端渲染，而在 Gemini 原生请求未显式要求 `IMAGE` 模态。当前版本已在图片生成 / 编辑意图下补充 `responseModalities: ['TEXT', 'IMAGE']`，并保留既有 `inlineData -> assistant image attachment` 渲染链。
- 2026-03-15 安装与数据目录检查：已确认安装版升级时，electron-builder 默认会从注册表读取上一版本 `InstallLocation` 并沿用旧安装目录；当前版本又把这条自定义安装脚本显式绑定进打包配置。主进程同时开始记住最近一次自动数据目录，避免重装后因为安装位置变化而把运行数据切到新的空目录。
- 2026-03-15 Agent 工作台信息层级检查：顶部标题区与工作台条已拆成“角色摘要”和“运行摘要”两层，避免模型 / 会话 / 角色类型重复占两行；底部输入区已改成统一 composer，并在真实 Electron 截图中继续保持贴底，不再被空会话或短会话态拉出可视区。
- 2026-03-14 Agent 对话区锚点修正：`AgentView.vue` 已把会话壳层改成“消息区吃掉剩余高度、输入区固定停在底部”的结构，`AgentMessageList.vue` 同步压缩空会话态高度，`AgentInputBar.vue` 改为显式输入高度控制，避免空会话或长消息阶段把底部输入区继续往窗口外挤。
- 2026-03-14 角色配置区遮挡修正：`AgentProfileManager.vue` 现已改成单独滚动的配置区，角色列表与编辑表单共用一个可滚动内容层，表单头部保持粘性；此前左侧角色设置下方被遮挡、滚不到底的问题已纳入本轮前端回归修复。
- 2026-03-14 Agent 高度链二次收口：`AgentView.vue` 已把根布局从内容敏感的 grid 改成更稳定的纵向 flex，主区明确拆成“顶部状态 / 消息滚动层 / 底部输入条”三段；同时给 `AgentView`、消息区、输入条和侧栏面板统一补上 `box-sizing: border-box`，避免 `height: 100% + padding` 继续把底部输入区和侧栏内容挤出视口。
- 2026-03-14 角色侧栏可操作性二次收口：`AgentProfileManager.vue` 现已拆成“角色列表滚动区 + 编辑表单滚动区”双层结构，默认侧栏宽度从 `288` 提高到 `320`，最小宽度同步抬高；这轮修正后，角色卡不会再和下方编辑表单抢高度，长表单也能在左栏内独立滚动完成配置。
- 2026-03-14 旧栏宽缓存兼容：`AgentView.vue` 现已在切换到“角色”页签时自动把历史过窄的侧栏宽度提升到可编辑范围，避免用户沿用旧布局缓存后仍然看到角色配置区过窄、表单难以操作。
- 2026-03-14 顶部重复信息继续压缩：`AgentView.vue` 标题区已移除重复的模型/角色类型胶囊，工作台条改为集中显示会话标题、当前模型、消息数、角色类型和上下文负载；空会话态的 `session-ready` 卡片与输入区也已再缩一轮，减少顶部和中部重复占高。
- 2026-03-14 Electron 启动报错复核：此前出现的 `Cannot find module dist-electron/main.js` 属于旧运行态在未重新构建时直接拉起 Electron 所致；本轮已通过 `npm.cmd run build` 再次确认 `dist-electron/main.js` 与 `preload.js` 正常生成，当前开发构建链恢复正常。
- 2026-03-14 3.0.4 发包差异确认：本地 `release/v3.0.4` 目录时间戳早于这轮 Agent 布局修复，说明用户手上的 3.0.4 发行包并未包含本轮“输入区固定到底部 / 左侧角色配置区单独滚动 / 顶部信息压缩”这些最新修复；后续需要重新打包新的验证包才能让桌面安装版同步这些变更。
- 2026-03-14 Agent 顶部密度继续收口：`AgentView.vue` 已移除标题区冗余说明，将运行态卡片从大块网格压缩成一行状态胶囊，并把会话域 / 会话标题 / 会话计数 / 上下文负载收回同一条工作台信息带，为消息区和输入区继续释放纵向空间。
- 2026-03-14 工作台视觉对比度继续收口：`App.vue`、`IDEView.vue` 与 `AgentView.vue` 统一收紧 immersive 背景、卡片边界、阴影和页内工具条层级，最新 `ai.png` / `ide.png` 已确认 `/ai`、`/ide` 的工作台外壳与面板主体不再像前几轮那样发白发虚。
- 2026-03-14 消息区与终端可读性继续提升：`AgentMessageList.vue` 抬高了 session-ready、消息卡片、标签、代码片段和附件卡片的对比度；`IDETerminal.vue` 同步增强了摘要胶囊、运行状态、标签卡和脚本芯片，减少真实联调时“状态存在但读不清”的问题。
- 2026-03-14 IDE Agent 面板清理：`IDEAssistantPanel.vue` 去掉了临时重复的 sessions 状态胶囊，避免右侧 Inspector 再出现“状态标签堆叠但含义重复”的视觉噪音。
- 2026-03-14 Agent / 悬浮窗交互修正：`AgentView.vue` 现已把消息区和输入区锁进主工作区剩余高度，输入框不会再被消息流整体挤到窗口外；`AIOverlay.vue` 与 `AIChatDialog.vue` 也已改成原生拖拽标题栏 + 纯对话视图，不再在悬浮窗里露出 AI 设置与 Sub2API 配置桥接。
- 2026-03-14 沉浸式拖拽区修正：`AgentView.vue`、`IDEView.vue` 与 `AIOverlay.vue` 的页头 / 工具条已经显式标记为窗口拖拽区，按钮、下拉框和输入控件则保留 `no-drag`；这轮 Electron 截图回归后，工作台页头的拖拽语义已经和可交互控件分开，不会再边拖边选中文字。
- 2026-03-14 对话输入区重构：Agent 主工作台、IDE Agent 与 AI 悬浮窗现在都支持手动截图并把结果自动插入到输入框上方附件区；悬浮窗的配置桥接已完全移除，只保留角色切换、会话与纯对话输入输出；Agent 顶部重复的模型 / 上下文 / 输出信息也已压缩回更合理的层级。

- 2026-03-14 IDE 工作台密度继续收口：`IDEView.vue`、`IDEEditor.vue`、`IDEExplorer.vue`、`IDETerminal.vue`、`IDEStatusBar.vue` 与 `IDEActivityBar.vue` 统一缩小头部、标签、资源树与状态条体积，最新 Electron 截图已确认 `/ide` 的主编辑区占比和工作台层级比上一轮更接近真实桌面 IDE。
- 2026-03-14 IDE Agent 联调修正：`IDEAssistantPanel.vue` 已改为按当前会话 / 当前角色的有效配置判断模型刷新可用性，并在配置变化时自动重拉模型目录；右侧面板新增运行态胶囊，能直接区分 `Needs Config / Syncing / Model Sync Failed / Ready`。
- 2026-03-14 终端状态可见性提升：`IDETerminal.vue` 新增活动会话状态胶囊、最近命令摘要与 running 会话计数，结合既有自动停机与快照轮询链路，能更快判断命令是仍在执行、已静默结束还是需要人工介入。

- 2026-03-14 Agent 工作台细化：`AgentView.vue` 现已把运行态锚点前置到页头与 workbench 状态条，用户不进入消息区也能一眼看到当前角色是“待补齐运行配置 / 模型目录读取中 / 读取失败 / 已就绪”。
- 2026-03-14 IDE 空工作台细化：`IDEView.vue` 的最近工作区卡片新增最近打开时间；若本地还没有最近工作区，则右上自动切换为 `Quick Start` 面板，明确说明工作区恢复、编辑现场与计划同步会如何生效。
- 2026-03-14 真实 Electron 回归复核：本轮再次执行 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui`，确认新增运行态胶囊和 `Quick Start` 面板没有破坏 `/ai`、`/ide` 首屏布局。

- 2026-03-14 Agent 联调修复：`AgentView.vue` 当前已按“角色 / 会话的有效配置”刷新模型列表，而不是继续误用全局 AI 配置；当角色切换导致 `baseUrl`、`apiKey`、协议或模型边界变化时，工作台会自动重拉模型目录，避免前端显示和真实请求目标错位。
- 2026-03-14 Agent 运行时诊断可视化：`/ai` 主工作台已新增运行时联调卡片，直接展示接口地址、鉴权状态、当前模型与模型列表读取状态，并提供“打开 AI 设置 / 刷新模型列表 / 打开 Sub2API”快捷入口，便于在主界面内快速定位是配置缺失、鉴权缺失还是模型目录读取失败。
- 2026-03-14 IDE 空工作台入口优化：未绑定工作区时，`IDEView.vue` 右侧已补上最近工作区卡片，清楚区分项目目录和产物目录，支持一键切回最近工作区，减少空工作台重新找项目的摩擦。
- 2026-03-14 真实 Electron 回归复核：`npm.cmd run smoke:routes`、`npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui` 与 `npm.cmd run build` 已再次通过；最新 `ai.png` / `ide.png` 已确认这轮新增的联调卡片与最近工作区入口没有破坏工作台布局。
- 2026-03-14 MCP 浏览器阻塞复现：本轮再次通过 MCP Playwright 浏览器尝试打开本地预览，Chrome 仍在启动阶段直接返回 `exit code 13`；这一缺口继续归因于本机 Chrome 环境，而非 OpenAgent 页面代码。

- 2026-03-13 Live2D 巡检确认：此前 `electron:preview -- --live2d-diagnose` 的失败根因不是 Live2D 代码或资源损坏，而是终端环境残留 `ELECTRON_RUN_AS_NODE=1`，导致 Electron 被错误降级为普通 Node 进程。
- 2026-03-13 Live2D 真实验证：在清理环境变量后的真实 Electron 环境中，`npm.cmd run check:live2d` 已通过，默认 Shizuku 模型、`live2d://` 资源协议与采样资源请求均诊断成功。
- 2026-03-13 Sub2API 核心契约验证：新增 `npm.cmd run check:sub2api`，已确认 OpenAgent 依赖的 `/v1/models`、`/v1/responses` 与 responses-only legacy `/v1/chat/completions` 提示契约可用；真实上游模型调用仍需用户自己的网关地址与 API Key 做联调。
- 2026-03-14 3.0.0 发布验证：`npm.cmd run check:sub2api` 在当前 3.0.0 源码状态下再次通过，mock gateway 已确认模型列表、Responses 主链路与 legacy 兼容提示仍正常。
- 2026-03-14 桌面打包验证：`npm.cmd run electron:build:clean` 已产出 `release/v3.0.0/OpenAgent Setup 3.0.0.exe`、`release/v3.0.0/OpenAgent Portable 3.0.0.exe` 与 `release/v3.0.0/win-unpacked`，且 `win-unpacked/resources/sub2api-runtime/bin/sub2api.exe -version` 可正常执行。
- 2026-03-14 打包运行差异记录：`win-unpacked/OpenAgent.exe` 会拒绝开发态使用的 `--live2d-diagnose` 参数并返回 `bad option`，因此本轮打包后验证以安装包产物核对、Sub2API 二进制自检与前端路由烟测为主，后续如需继续保留发布包命令行诊断能力，需要单独调整打包态参数透传。
- 2026-03-14 终端加载链最新巡检：`electron/main.ts` 已改为通过 `createRequire` 在运行时加载 `node-pty`，并在清理旧构建产物后确认 `dist-electron/main.js` 不再包含 `import("node-pty")` 或 `Could not dynamically require` 文本，Windows `conpty.node` 的旧 bundle 误加载路径已被切断。
- 2026-03-14 前端工作台重构首轮：已下调全局设计令牌与外壳密度，进入 `/ai` / `/ide` 时软件侧边栏会自动收缩；`IDEView` 已补上左下 MCP 列表和右侧 IDE Agent 面板，`npm.cmd run build` 与 `npm.cmd run smoke:routes` 均通过，但 Agent 页面的多层级侧边栏与 IDE 面板拖拽伸缩仍是下一轮重点。
- 2026-03-14 前端工作台精修第二轮：`IDE` 现已补上工作台级面板显隐开关，顶部工具条可直接切换资源 / 终端 / Inspector；`Agent` 现已支持页内侧栏折叠与顶部快速切换栏，工作台不再完全依赖外层软件侧栏。
- 2026-03-14 前端工作台精修第二轮：全局字号、圆角、间距和按钮尺寸继续下调，`Agent` 子面板内部的标题、输入条、表单和任务板也同步收紧；当前剩余前端重点已收敛为真实 Electron 视图的人眼回归与少量面板细节继续抛光。
- 2026-03-14 前端工作台精修第三轮：`IDE` 顶部已从“大卡片堆叠”改成窄头部 + workbench 信息条，工作区路径与产物目录统一折叠到紧凑路径胶囊；`Agent` 顶部 hero 也改为更短的状态条，模型、上下文和当前会话信息集中到工作台胶囊区，进一步释放中心操作区域。
- 2026-03-14 前端工作台精修第四轮：统一下调全局设计令牌、按钮/输入/状态条密度与主侧边栏宽度；`/ai` 与 `/ide` 的工作台面板改为更中性的冷色玻璃层，继续压缩页内侧栏、消息卡片、会话卡片、角色表单、终端输入区与状态栏，让整体布局更接近可持续编码的桌面 IDE。
- 2026-03-14 前端工作台精修第五轮：`IDE` 左栏已进一步对齐“资源管理器在上、MCP 在左下”的结构，Explorer / MCP 现在支持独立显隐、左栏内联拖拽调高与双击复位；`Agent` 工作台则补上 `scope / session / panel` 的 URL 同步和栏宽复位，便于刷新后快速回到原工作上下文。
- 2026-03-14 前端工作台精修第六轮：`Agent` 工作台已补上托管资源抽屉，当前角色在页内即可查看 MCP / Skill 是否授权、已启用资源数量、异常服务与最近托管技能，无需离开主对话区再跳转到设置页确认能力边界。
- 2026-03-14 MCP UI 巡检阻塞记录：本机 Playwright MCP 仍然在拉起 Chrome 时直接退出并返回 `exit code 13`，这一轮已复现并确认不是页面脚本报错；因此实际采用 `vite preview` + `npm.cmd run build` + `npm.cmd run smoke:routes` + 代码级样式巡检的替代验证链路继续推进前端收口。
- 2026-03-14 真实 Electron 视图回归已具备可重复执行链路：`npm.cmd run check:electron-ui -- --out-dir %TEMP%\openagent-electron-ui` 会直接导出 `/ai` 与 `/ide` 的 Electron 实际渲染截图，当前已成功生成 `ai.png` / `ide.png`，后续不再需要完全依赖 Playwright 才能做前端人眼回归。
- 2026-03-14 空态前端首屏已收口：`/ide` 在未绑定工作区时会显示完整的 Explorer / MCP / Editor / Runtime / Inspector 预览骨架，`/ai` 在已有会话但没有消息时会显示 session-ready 卡片与建议起手 prompt；这两处修正后，Electron 截图不再被大片空白占满，更适合继续做视觉回归和后续抛光。
- 2026-03-14 Chrome 自动化阻塞进一步确认：`npm.cmd run check:chrome-automation` 再次验证 plain / remote-debugging / temp-profile 三种启动方式均立即退出并返回 `exit code 13`，当前浏览器自动化缺口应继续按“本机 Chrome 环境问题”处理，而不是继续误判为 OpenAgent 页面或预览服务异常。
- 2026-03-14 工作台视觉层级继续收口：最新 Electron 截图已经能看到 `/ai` 与 `/ide` 的背景、面板边界、当前面板选中态和页内导航锚点明显强于上一轮；当前前端剩余问题已从“大结构失真”收敛为更细的文本对比、卡片内容权重和空态文案抛光。
- 2026-03-14 经典 `/ai` 页面对齐：`AIAssistant.vue` 现已接入与 Agent / IDE 相同的活动卡片展示层，系统自检、工具结果与原始回包默认改成紧凑摘要 + 折叠详情，避免旧页面继续把原始日志整段刷进消息流，破坏测试与回归体验。
- 2026-03-14 3.0.3 打包准备：版本号已提升到 `3.0.3`，当前变更聚焦于工具回合消息收口和经典页展示统一；本轮将以新的桌面安装包继续验证 `/ai`、`/ide` 与工具执行链的一致性。
- 2026-03-14 Agent / IDE / Sub2API 工作台联调收口：`AgentView.vue` 去掉底部重复上下文条，顶部统一显示总上下文与最大输出；`AgentMessageList.vue` 与 `AgentSessionList.vue` 改为优先显示角色名，Live2D 会话只保留作用域标签；`App.vue`、`IDEView.vue` 与 `Sub2ApiSettings.vue` 继续收口为面板内部滚动，避免沉浸式页面整页下滑。
- 2026-03-14 Agent 角色策略升级：`stores/ai.ts`、`aiPrompts.ts` 与 `AgentProfileManager.vue` 新增功能型 / 情绪型角色定义；功能型角色在能力边界内必须优先执行用户明确指令，情绪型角色新增隐藏心情值用于语气调节，但不会因为人设偏离任务目标。
- 2026-03-14 Sub2API 本地接入修正：`electron/sub2apiRuntime.ts` 在 `/health` 不可用时会自动回退探测 `/setup/status`；`Sub2ApiSettings.vue` 的本地启动 / 重启链路会在运行时拉起后继续同步本地专属 Key、初始化状态与模型目录，减少桌面模式下的误报与手工跳转成本。
- 2026-03-14 模型限制展示口径统一：`utils/ai.ts` 新增紧凑 token 格式化，`AISettings.vue`、`AIAssistant.vue`、`AIChatDialog.vue`、`AgentView.vue`、`IDEAssistantPanel.vue` 与 `TopBar.vue` 已统一改成“总上下文 / 最大输出”显示；`Sub2ApiSettings.vue` 中的模型目录标签也复用同一套限制文案。
- 2026-03-14 发布前回归：再次执行 `npm.cmd run build`、`npm.cmd run smoke:routes`、`npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ide --route=/sub2api` 与 `npm.cmd run check:sub2api`，确认 `/ai`、`/ide`、`/sub2api` 真实 Electron 视图与 Sub2API 核心契约均正常；MCP / Playwright 浏览器链仍被本机 Chrome `exit code 13` 阻塞，继续按本机环境问题处理。
- 2026-03-14 工具回合显示与上下文污染回归：当前已确认 `Agent / IDE` 主工作台里的系统自检与工具回包不再整段挤进会话区，默认改为紧凑活动卡片；同时工具结果与任务摘要不会再把原始嵌套 JSON 持续写回上下文，从而显著降低“刚执行完一步，下一轮就因上游 502 中断”的概率。
