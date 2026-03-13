# OpenAgent v3.0 任务进度跟踪

> **创建时间**: 2026-03-13  
> **当前阶段**: Phase 8 - 测试 + 优化  
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
| 5.4 | `SubAgentCard` 组件 | 已完成 | `src/components/agent/SubAgentCard.vue` |
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

---

## 当前剩余缺口

- `IDETerminal` 已支持多标签、持久 shell、stdin 持续输入、`xterm` 渲染、按键直通与 resize 同步，`vim` / `top` 这类全屏命令也具备前端承载条件；当前剩余风险主要是缺少这类 TUI 场景的人工回归，以及长时间运行命令下的稳定性观察。
- IDE 项目计划已支持基于真实工作区快照、diff、失败反馈和上下文摘要的动态重规划，并在 `IDEPlanPanel` 中补齐了“计划漂移可见性 + 手动同步基线”能力：用户现在能直接看到当前计划与工作区之间的新增 / 修改 / 删除差异，区分“需要重规划”还是“仅需确认基线”；剩余工作是继续观察复杂冲突、跨阶段返工与多次连续重规划场景下的计划稳定性。
- `IDEExplorer` 已补齐资源管理器的高频交互闭环：支持 Ctrl/Cmd 多选、Shift 连选、根目录拖放区、目录拖拽移动、批量删除、剪贴板式复制/粘贴与批量重命名；复制会在目标目录中自动规避重名，并在目录自拷贝到子目录这类危险路径上做前置跳过，批量重命名会保留文件扩展名并在提交前预览冲突。当前剩余工作更多偏增量体验优化，例如跨工作区复制提示、更细的复制冲突策略和批量重命名模板增强，不再属于交付阻断项。
- `IDEEditor` 与 `IDEView` 已补齐编辑会话恢复链路：打开标签、当前焦点文件与未保存草稿现在会按工作区持久化到 AI Store，并在从 `/ide` 切到 `/ai`、侧边导航跳转或页面重建后自动恢复，避免未保存内容静默丢失；恢复时还会跳过已失效的只读标签，仅为仍存在的文件或未保存草稿重建编辑状态。当前剩余工作更多偏编辑器增强，例如查找替换、行号 / 光标状态和更细的草稿冲突提示。
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
