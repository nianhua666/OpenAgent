# 更新日志

## Unreleased

## 3.0.5 - 2026-03-15

- Agent 工作台继续收口信息密度：`AgentView.vue` 压掉了标题区与工作台条之间的重复状态，把角色类型收回到头部摘要，工作台条只保留会话域、会话标题、当前模型、消息数与上下文负载，减少顶部两层胶囊同时表达同一件事的视觉噪声。
- Agent 输入区改成更紧凑的底部工作条：`AgentInputBar.vue` 现在把文本输入、发送、附件 / 截图、模型选择、模型刷新与自动步数控制收进同一套 composer 结构，发送按钮固定贴靠在输入区右侧，模型选择稳定留在底部，空会话时也不会再因为底部控制区过散而显得像一大片空白。
- 安装与数据目录保护继续收口：确认安装版升级时，electron-builder 的 NSIS assisted installer 会优先读取上一版本注册表中的 `InstallLocation` 并默认沿用旧目录；`electron-builder.config.cjs` 现已显式绑定 `build/installer.nsh`，避免后续构建链调整时丢失这条自定义逻辑。
- 自动数据目录记忆补强：`electron/main.ts` 现在会为自动策略持久化最近一次自动运行数据目录，重装或升级后即使安装位置变化，也会优先回到原来的数据根目录，避免账号数据、AI 会话和日志切到新的空目录。
- 设置页补齐安装 / 数据安全状态：`Settings.vue` 新增安装目录、自动策略记忆目录和升级策略提示，直接展示当前安装路径、当前运行数据根目录与自动策略回落目标，便于发包后人工确认升级不会跑偏。
- Gemini 原生产图链路补强：`src/utils/ai.ts` 在识别到原生 Gemini 图片模型且用户本轮明确提出“生成 / 编辑图片”请求时，会为 `generateContent` 显式附加 `responseModalities: ['TEXT', 'IMAGE']`，避免模型继续只返回口头描述；`src/utils/aiPrompts.ts` 也同步补充约束，要求原生产图模型优先返回真实图片结果，而不是只描述“准备画什么”。

## 3.0.4 - 2026-03-14

- Agent 工作台布局回归继续收口：`App.vue` 把 immersive 页面内容区固定成全高 flex 子布局，`AgentView.vue` 的会话壳层改成“消息区内部滚动 + 输入区固定停在底部”的结构，避免 `/ai` 在空会话、长消息或角色配置并存时继续把底部输入区顶出窗口。
- 角色配置侧栏可操作性修复：`AgentProfileManager.vue` 现已切成单一滚动内容区，角色列表与编辑表单共用同一条滚动链路，表单头部保持粘性，解决左侧角色配置区下半部分被遮挡、无法继续编辑的问题。
- Agent 输入栏进一步稳定：`AgentInputBar.vue` 改成显式的输入高度控制与更紧凑的底部控制区，空会话时不再依赖浏览器默认 textarea 高度去撑开布局；最新 `npm.cmd run check:electron-ui -- --route=/ai` 已再次完成真实 Electron 截图复核。
- Agent 高度链二次收口：`AgentView.vue` 已改成纵向 flex 根布局，主区明确拆分成“顶部工具 / 消息滚动层 / 底部输入条”，并统一补上 `box-sizing: border-box`，继续消除消息一多就把输入条顶出视口的情况。
- 角色编辑区拆成双滚动层：`AgentProfileManager.vue` 现在把角色列表和编辑表单拆成独立滚动区，默认侧栏宽度同步提升到 `320`，避免左栏在长角色配置场景下既看不全也难以操作。
- 兼容旧工作台栏宽缓存：`AgentView.vue` 在进入“角色”页签时会自动把历史过窄的侧栏宽度抬回可编辑范围，避免升级后仍被旧布局缓存拖回窄侧栏。
- Agent 顶部重复信息再压一轮：标题区不再重复显示模型和角色类型，工作台条统一承载会话标题、当前模型、角色类型、消息数和上下文负载；空会话 `session-ready` 卡片和输入区也同步缩小，继续为消息区释放高度。
- Agent / IDE 对话输入区补齐了统一的手动截图能力：桌面端现在会通过 Windows 手动截图流程等待用户完成框选，再把截图自动挂到输入框上方的附件区；`AgentInputBar.vue`、`IDEAssistantPanel.vue` 和 `AIChatDialog.vue` 已接入同一条链路，并把模型选择收回到底部控制区。
- AI 悬浮窗进一步裁成纯对话视图：`AIOverlay.vue` 与 `AIChatDialog.vue` 移除了悬浮窗内的 `AI 设置`、`Sub2API` 配置桥接和运行面板，只保留角色切换、会话和消息输入输出，避免小窗继续被配置项挤占。
- Agent 主工作台继续压缩顶部重复信息：`AgentView.vue` 现已把模型、会话、作用域和运行态重新分层，减少标题区 / 工作台条 / 运行偏好之间的重复胶囊；消息区和输入区继续保持“中间滚动、底部贴靠”的工作台结构。
- 修复 Agent 主工作台消息区把输入框整体挤出视口的问题：`AgentView.vue` 现已改成“头部固定 + 主区 1fr”根布局，消息流只在中央区内部滚动，底部输入区会稳定贴住工作台底边。
- 补齐沉浸式页面的原生拖拽区：`AgentView.vue`、`IDEView.vue` 与 `AIOverlay.vue` 的页头 / 工具条现在会作为窗口拖拽区工作，按钮、下拉框与输入控件显式标记为 `no-drag`，避免拖动窗口时误选中文字。
- 裁剪 AI 悬浮窗为纯对话视图：`AIOverlay.vue` 与 `AIChatDialog.vue` 已移除悬浮窗里的 AI 设置入口与 `Sub2API` 配置桥接，保留角色切换、会话与对话输入输出，避免小窗继续被配置面板挤占。
- 回归验证已覆盖构建、路由与 Electron 真实渲染：本轮执行了 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ai-overlay --route=/ide`，确认布局与拖拽区修正未破坏主链路。

## 3.0.3 - 2026-03-14

- 继续统一 Agent 消息展示规范：经典 `/ai` 页面现在也改成了和 Agent / IDE 一致的紧凑活动卡片，系统自检、工具结果与大段原始输出不再直接刷满消息流，默认改为“结论 / 状态 / 下一步”，详细参数与原始结果按需折叠展开。
- 工具回合上下文治理继续生效到兼容页面：经典页的工具调用展示也改为复用统一的活动摘要层，减少旧页面和新工作台之间“两套消息风格、两套工具结果密度”的割裂感，便于继续做统一的人眼回归和交互打磨。
- 发布 3.0.3 验证包：基于本轮工具回合压缩、自检摘要收口与经典页消息流统一展示重新构建桌面产物，用于继续验证 `/ai`、`/ide` 和消息执行链的一致性。

- 修复工具回合“下一步”阶段的上下文污染：`aiConversation.ts` 现在会把工具结果压缩后再写回会话，把原始 JSON / 日志保留在 metadata 中供界面按需展开；`stores/ai.ts` 也会在任务摘要落库前先做清洗，避免嵌套 JSON 摘要反复注入后续请求。
- Agent / IDE 会话区改成紧凑活动卡片：`AgentMessageList.vue` 不再把系统自检、工具结果和大段原始输出整块铺在消息流中，而是默认显示“结论 / 状态 / 下一步”，详细参数与原始结果按需折叠展开；`IDEAssistantPanel.vue` 复用同一展示并修复了运行态“会话”标签乱码。
- OpenAI / Responses 请求链路新增一次轻量 upstream 重试：对 `502/503/504` 且错误文本包含 `upstream / gateway / timeout` 的场景，会先做一次短等待后重试原组合，降低供应商瞬时波动直接打断工具回合的概率。

## 3.0.2 - 2026-03-14

- 收口 Agent / IDE / Sub2API 三条主工作流的布局与滚动行为：沉浸式页面改为内部面板滚动，避免整页下滑；`/ai` 去掉底部重复上下文条，`/ide` 继续对齐左侧 Explorer、左下 MCP、中央 Editor、底部 Runtime、右侧 Inspector 的桌面 IDE 结构。
- Agent 角色体系升级为“功能型 / 情绪型”双轨：功能型角色会在能力边界内优先执行用户明确指令；情绪型角色新增隐藏心情值并用于语气调节，但不会因为人设而偏离任务。会话与消息区统一显示角色名，不再回退成泛化 `AI` 标签，Live2D 仅保留为作用域标签。
- Sub2API 本地一键启动与接入链路补强：桌面运行时健康检查在 `/health` 失败时会自动回退探测 `/setup/status`，并在启动 / 重启后继续自动同步本地专属 Key、初始化状态与模型目录，减少“服务已起但页面仍显示失败”的假阴性。
- AI / Sub2API 模型能力展示口径统一：模型限制统一显示为“总上下文 / 最大输出”，并使用 `k` / `m` 紧凑单位；Agent 顶部工作台、AI 设置、对话页、悬浮窗、IDE Agent 与 Sub2API 模型目录都共用同一套限制标签。
- 发布前验证已覆盖真实 Electron 与 Sub2API 契约：本轮通过 `npm.cmd run build`、`npm.cmd run smoke:routes`、`npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ide --route=/sub2api` 与 `npm.cmd run check:sub2api`，确认桌面渲染、主路由和 Sub2API 核心 API 契约均正常。

- 工作台视觉对比度继续收口：`App.vue`、`IDEView.vue` 与 `AgentView.vue` 统一收紧 immersive 背景、卡片边界、阴影和页内工具条层级，最新 Electron 截图已经能更稳定地区分工作台外壳、面板主体和页内导航锚点。
- 消息区与终端可读性继续提升：`AgentMessageList.vue` 抬高了 session-ready、消息卡片、标签、代码片段和附件卡片的对比度；`IDETerminal.vue` 同步增强了摘要胶囊、运行状态、标签卡和脚本芯片；`IDEAssistantPanel.vue` 也去掉了临时重复的 sessions 状态胶囊。
- 真实 Electron 视图再次复测通过：本轮重新执行 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui`，确认这次对比度与正文可读性调整没有破坏 `/ai` 与 `/ide` 的工作台布局和主路由可达性。

- IDE 工作台继续收口信息密度：`IDEView.vue`、`IDEEditor.vue`、`IDEExplorer.vue`、`IDETerminal.vue`、`IDEStatusBar.vue` 与 `IDEActivityBar.vue` 统一下调头部、标签、状态条、资源树和终端控件体积，把视觉层级收回到更接近桌面 IDE 的密度；`IDETerminal.vue` 还新增了活动会话状态胶囊、最近命令摘要与运行中会话计数，减少长时间执行时“终端是否还活着”的判断成本。
- IDE Agent 联调逻辑补正：`IDEAssistantPanel.vue` 现在按当前会话 / 当前角色的有效配置判断接口是否可用、是否允许刷新模型列表，并在配置变化时自动重拉模型目录，不再错误复用全局 AI 配置；同时补上运行态状态胶囊，让“待补配置 / 正在同步 / 模型同步失败 / 已就绪”在 IDE 右侧面板里直接可见。
- 真实 Electron 视图复测通过：本轮再次执行 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui`，确认 `/ide` 的密度调整和 `IDE Agent` 联调修正没有破坏主工作台布局与桌面渲染链。

- Agent 工作台继续收口运行态锚点：`AgentView.vue` 现在会在页头和 workbench 状态条直接显示“待补齐运行配置 / 模型目录读取中 / 读取失败 / 已就绪”状态胶囊，减少用户必须滚到消息区上方才知道当前角色是否真正可跑的成本。
- IDE 空工作台继续提升恢复感：`IDEView.vue` 的最近工作区卡片新增最近打开时间展示；当本地还没有任何最近工作区时，右上会自动切换成 `Quick Start` 面板，直接说明工作区恢复、编辑现场与计划同步会如何生效。
- 真实 Electron 截图复核通过：本轮再次执行 `npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui`，确认新增的运行态胶囊与空工作台 `Quick Start` 面板没有破坏 `/ai`、`/ide` 的首屏布局。

- Agent 前后端联调继续收口：`AgentView.vue` 的模型列表刷新已改为基于当前角色 / 当前会话的有效配置拉取，不再错误复用全局 AI 配置；当角色切换导致 `baseUrl`、`apiKey`、协议或模型边界变化时，工作台会自动重拉模型目录，减少“角色已切换但列表还是旧接口结果”的错位。
- Agent 工作台补上运行时联调卡片：当前会直接显示接口地址、鉴权状态、当前模型与模型列表读取状态，并提供“打开 AI 设置 / 刷新模型列表 / 打开 Sub2API”快捷入口，便于在主工作台内直接判断是接口未配、Key 缺失还是模型目录读取失败。
- IDE 空工作台补上最近工作区入口：未绑定工作区时右侧 Inspector 上方会展示最近工作区卡片，清楚区分项目目录与产物目录，支持一键回到最近现场，减少“空工作台需要重新找项目”的摩擦。
- 真实 Electron 视图回归再次通过：`npm.cmd run check:electron-ui -- --out-dir %TEMP%\\openagent-electron-ui` 已重新导出 `/ai` 与 `/ide` 截图，并确认这轮新增的运行时联调卡片和最近工作区入口没有破坏工作台布局。
- Playwright / MCP 浏览器阻塞再次复现：本轮继续用 MCP 浏览器拉起本地预览时，Chrome 仍在启动阶段直接 `exit code 13`；阻塞依旧来自本机 Chrome 环境，而不是 OpenAgent 页面代码。

- 工作台视觉层级继续精修：`App.vue` 为 immersive 场景补上更中性的桌面背景层，`IDEView.vue` 与 `AgentView.vue` 统一增强 panel 对比度、边界和阴影，`Sidebar.vue` 也把工作台态主侧边栏收回更克制的工具栏色相，减少整页被主题粉白色冲淡的问题。
- 高频导航状态更清晰：`IDEActivityBar.vue` 与 Agent 页内 rail 新增 active indicator，`AgentSessionList.vue` 强化当前会话选中态，`AgentView.vue` 压掉了页内侧栏头部多余的空玻璃卡片，让“当前所在面板 / 当前选中会话”更容易一眼识别。
- 真实 Electron UI 回归链路已补齐：`electron/main.ts` 新增 `--main-route`、`--capture-main-window`、`--capture-delay-ms` 与 `--capture-quit` 启动参数，配合 `scripts/check-electron-ui.cjs` 和 `npm.cmd run check:electron-ui`，现在可以直接导出 `/ai`、`/ide` 的 Electron 实际渲染截图，绕过本机 Chrome 自动化阻塞继续做人眼回归。
- 前端空态首屏继续收口：`/ide` 在未绑定工作区时新增 Explorer / MCP / Editor / Runtime / Inspector 工作台骨架，`/ai` 在“已有会话但尚未发送消息”时新增 session-ready 卡片与起手 prompt，避免真实 Electron 截图被大片空白占满，便于后续继续打磨布局和交互。
- Chrome 自动化阻塞已新增可执行诊断：`scripts/check-chrome-automation.cjs` 与 `npm.cmd run check:chrome-automation` 会复现 plain / remote-debugging / temp-profile 三种 Chrome 启动场景；当前本机三种场景仍全部返回 `exit code 13`，已进一步确认 Playwright / MCP 浏览器自动化缺口来自本机 Chrome 环境而不是页面代码。
- 前端工作台精修第六轮：`/ai` 工作台新增 `AgentResourcesPanel`，把托管 MCP / Skill 状态、角色授权边界、异常服务摘要与快速跳转 AI 设置的入口直接接进页内侧栏，让角色配置 / 长期记忆 / 资源边界真正形成一套连续工作流。
- 前端巡检补充：这轮按 `playwright-interactive` 路径再次拉起本地静态预览并尝试用 MCP 浏览器打开 `/ai`，Chrome 仍在启动阶段返回 `exit code 13`；因此当前 UI 验证依旧以 `npm.cmd run build`、`npm.cmd run smoke:routes`、静态预览可达性与代码级巡检为主。
- 前端工作台精修第五轮：`/ide` 左栏继续收口为可调高的 Explorer / MCP 双区，新增 MCP 独立显隐按钮、左栏内联分割条双击复位与布局持久化，进一步对齐“左侧资源、左下 MCP”的工作台结构。
- 前端工作台精修第五轮：`/ai` 工作台新增页内侧栏显隐 / 重置栏宽按钮、分割条双击复位，以及 `scope / sessionId / panel` 路由同步；刷新、切页或分享当前工作上下文时更容易回到原来的角色面板和会话位置。
- IDE 资源面板巡检补充：`IDEMcpPanel.vue` 新增手动刷新入口与异常计数摘要，避免 MCP 配置变化后用户必须跳出当前工作台才能重新确认左下角资源状态。
- 前端工作台精修第四轮：继续统一收紧全局设计令牌与软件壳层密度，缩小主侧边栏、按钮、输入框、状态条、圆角和留白；`/ide` 与 `/ai` 的工作台面板统一切向更冷静的桌面 IDE 视觉，内部高频组件如会话列表、角色面板、消息区、终端输入区和底部状态条也同步降密度。
- 前端巡检补充：这轮已尝试通过 Playwright MCP 直接做页面对比，但本机 Chrome 仍然稳定返回 `exit code 13`；因此当前 UI 验证仍以 `vite preview`、`npm.cmd run build`、`npm.cmd run smoke:routes` 和代码级巡检为主，后续仍需补真实 Electron / 浏览器的人眼回归。
- 前端工作台精修第三轮：`/ide` 顶部改为窄头部 + workbench 信息条，工作区路径、产物目录、语言/框架与当前文件统一折叠到高密度状态胶囊里，并同步下调默认左右栏宽度与终端高度，让编辑区更接近真实 IDE 比例。
- 前端工作台精修第三轮：`/ai` 进一步压缩顶部 hero、页内侧栏与输入区密度，新增上下文胶囊信息并收紧默认侧栏宽度，减少说明区挤占消息区的问题。
- Electron 终端加载链修复：`electron/main.ts` 改为通过 `createRequire` 在运行时加载 `node-pty`，`vite.config.mts` 也同步外置 `node-pty` 子路径；清理旧构建产物后，`dist-electron/main.js` 已不再残留 `import("node-pty")` 或 `Could not dynamically require` 文本。
- 这轮已执行 `npm.cmd run build:clean`、`npm.cmd run build` 与 `npm.cmd run smoke:routes`；当前仍缺少真实 Electron 视图的人眼回归，以及本机 Chrome `exit code 13` 导致的浏览器自动化缺口。
- 前端工作台精修第二轮：`/ide` 新增顶部 workbench 工具条与活动栏面板开关，资源 / 终端 / Inspector 现在都可直接显隐切换，并将折叠状态持久化到本地布局缓存。
- 前端工作台精修第二轮：`/ai` 新增页内工作台条与本地侧栏折叠，角色 / 会话 / 记忆 / 任务可以在顶部与侧栏双入口切换，进一步降低对外层软件侧栏的依赖。
- 全局设计令牌继续下调：统一缩小字号、圆角、按钮与输入框密度，并同步收紧 `AgentToolbar`、`AgentInputBar`、`AgentSessionList`、`AgentProfileManager`、`AgentTaskBoard` 的卡片与表单体积。
- 这轮已再次通过 `npm.cmd run build` 与 `npm.cmd run smoke:routes`；当前前端剩余重点主要是实际 Electron 视图的人眼回归，以及更细的面板视觉抛光。
- 前端工作台重构第一轮：`/ide` 已切成更接近 VS Code 的工作台骨架，左侧拆分为资源管理器与 MCP 面板，中间为编辑器与终端，右侧改为带 `Agent / 计划 / 日志` 页签的 Inspector，并补上左右列宽与终端高度拖拽状态。
- Agent 工作台重构第一轮：`/ai` 已改成左侧本地功能侧栏 + 中央对话区结构，页内侧栏可切换会话、角色、长期记忆与任务，新增 `AgentMemoryPanel.vue` 让长期记忆可见、可编辑、可删除。
- Electron 打包链路补强：`electron-builder.config.cjs` 新增 `node_modules/node-pty/**/*` 的 `asarUnpack`，配合此前对 `node-pty` 的外置，继续收口 IDE 终端在打包态下的 `conpty.node` 加载风险。
- 这轮已完成前端专项巡检：`npm.cmd run build` 与 `npm.cmd run smoke:routes` 通过；当前仍缺真实 Electron 视图人工回归，以及本机 Chrome `exit code 13` 导致的 Playwright 浏览器自动化缺口。

## 3.0.1 - 2026-03-14

- 发布 3.0.1 安装包：基于当前工作台 UI 与 Electron 回归链的最新修整结果重新构建桌面产物，用于继续验证 `/ai`、`/ide`、终端与多面板工作台的实际桌面表现。
- 工作台可读性修整纳入版本发布：这一版聚焦沉浸式背景、面板层级、消息区可读性、终端状态可见性和真实 Electron 截图回归，不引入新的主功能分支，重点是把 3.0 主工作流继续打磨到更稳定可测的状态。

## 3.0.0 - 2026-03-14

- 发布 3.0.0 验证包：本轮已完成 Sub2API 核心链路复核、可执行自检脚本沉淀与桌面打包交付，供本地安装验证；已产出 `release/v3.0.0/OpenAgent Setup 3.0.0.exe` 与 `release/v3.0.0/OpenAgent Portable 3.0.0.exe`。
- Live2D 与 Sub2API 核心链路补上了可复用诊断入口：新增 `scripts/run-electron.cjs` 清理 `ELECTRON_RUN_AS_NODE` 后再启动 Electron，避免诊断与预览被错误降级为普通 Node 进程；同时补充 `npm.cmd run check:live2d`，让 `--live2d-diagnose` 能稳定复现真实 Electron 环境下的资源协议与默认模型自检。
- 新增 `scripts/check-sub2api.cjs` 与 `npm.cmd run check:sub2api`，可用 mock gateway 或真实 `--base-url` 对 Sub2API 的 `/v1/models`、`/v1/responses` 和 legacy `/v1/chat/completions` 兼容层做契约校验，帮助确认 OpenAgent 所需的模型列表与 Responses 主链路可正常接入。
- IDE 长时间运行链路进一步收口：命令会话现在会持久化运行快照并支持 renderer 轮询兜底，即使终态事件丢失也能按快照完成收口；无输出结束会显式回传“命令已结束，未产生标准输出”，重复循环输出、长时间无输出、交互提示与超时则统一进入自动停机与系统说明链路，减少模型把命令误判成“仍在卡住”的概率。
- Agent 上下文压缩与快照机制已升级为可接力 handoff：本地快照改为按 `messageCount / lastMessageAt` 增量切片，记录快照来源、已覆盖消息数和最近工具；LLM 压缩输出也改成 `Goal / Instructions / Discoveries / Accomplished / Next Steps / Relevant Files` 结构化摘要，并在压缩后同步写回 `compression` 来源快照，提升长对话、切模型和长时间续跑时的上下文稳定性。

- Prompt 工程与终端命令链路已按最新策略收口：运行时系统 Prompt、IDE Prompt、`ide_run_command` 工具声明与 Windows MCP 原始命令入口统一改为“允许执行命令，但默认先说明目标、影响范围与回退方式”，不再使用命令黑名单或前置危险命令拦截。
- IDE 一次性命令执行现在会在“长时间无输出 / 检测到交互式提示 / 超时”时自动停止，并把触发停机的提示行与系统说明一起回传；工具层也改为保留输出头尾，减少长输出下最后报错被截断导致的误判。
- IDE 一次性命令现在允许使用工作区外的明确工作目录，Windows MCP 原始命令也不再做前置黑名单拦截；风险控制改为 Prompt 提示、结果回读和自动停机守卫，避免把执行能力锁死在硬编码规则里。
- IDE Mode 现已支持多工作区持久化：创建工作区时会同时绑定项目根目录与基础产物目录，每个工作区独立维护数据目录、最近打开状态、编辑会话与计划链路，切换工作区时会恢复对应的编辑现场，而不是把所有项目状态混在一个全局 IDE 上下文里。
- Agent Mode 现已支持按角色覆盖运行参数：角色可独立配置默认模型、温度与默认产物目录，`/ai`、`/ai/classic` 与悬浮对话窗都会按当前角色的有效模型运行，切换角色模型时也会同步联动推荐自动步数。
- 对话富文本链路已补齐特殊目标识别：URL、绝对路径、工作区相对路径、脚本入口和 Markdown 文档路径会在 Agent 主界面、经典对话页与悬浮窗中被自动识别为可点击资源，并直接调用桌面端打开外链或本地目标，降低“用户发了路径但 Agent 只能把它当普通文本看”的落差。
- Agent Mode 现已收口为真正的多角色工作台：主窗口与 Live2D / 悬浮窗都可绑定不同角色，支持自定义系统提示词、长期记忆、文件控制、软件控制、MCP 与 Skill 边界；会话会绑定角色，长期记忆也会按角色隔离，且 Agent 模式已显式禁止再创建或调用子代理。
- AI 悬浮对话与 Live2D 默认角色已统一到“小柔”：`/ai-overlay` 会直接继承 Live2D 域默认角色并沿用角色级 TTS 风格，Live2D 悬浮窗抽屉也会显示当前角色、长期记忆、软件控制、MCP / Skill 与自动播报状态，减少用户在桌面侧对当前响应身份的判断成本。
- Agent 模式的运行时 Prompt 与能力边界说明已同步收口：不再在 Agent 模式里建议模型路由或子代理编排，而是围绕“单角色持续执行、长期记忆、软件控制、文件控制和回读验证”组织系统约束，避免 UI 与实际工具权限出现两套说法。
- OpenAgent 主工作流已接入 Sub2API 桥接面板：`/ai` 主页面与悬浮对话窗现在都能直接查看本地 / 外部网关状态、一键把当前 Sub2API 路由接管到 Agent、读取账号池模型、同步本地专属 Key 并执行快速体检，不必再先切到独立 Sub2API 页面才能完成核心接入动作。
- Sub2API 与 Agent 的同步链路现在会优先使用真实运行时地址：`buildSub2ApiAiPatch`、模型读取、能力检查与 Codex 配置模板都已改成显式吃 `runtimeState`，减少桌面网关模式下“页面显示已启动但 Agent 仍沿用静态推导地址”的细小错位。
- IDE Mode 已新增 `.openagent/RUN.md` 自治调度状态机：现在会持久化自治运行状态、权限画像、建议并行度、任务领取映射和最近心跳，并在计划文档刷新时同步落盘，帮助主代理在长时间连续开发、切模型续跑和任务恢复时快速回到当前执行面。
- IDE Mode 计划面板已补齐自治调度视图与工具闭环：`IDEPlanPanel` 会直接展示自治调度状态、权限统计、当前领取任务和最近心跳；同时新增 `ide_get_autonomy_run` / `ide_sync_autonomy_run`，让主代理可以把自治调度状态机当成结构化运行上下文持续刷新。
- IDE Mode 已新增更接近长时间自治开发的接力机制：主代理现在会在 `route_model` / `spawn_sub_agent` 时自动拉取当前接口支持的模型列表并为子代理执行模型选型，记录选型方式、可用模型数量与理由；子代理提示词也显式禁止继续创建代理，避免多层代理失控。
- IDE Mode 已新增 `.openagent/CONTEXT.md` 工作区 handoff 文档：会把计划状态、ready / blocked 队列、会话长摘要、上下文压缩快照、最近子代理结果与恢复执行建议压成可持续接力的上下文文档；当对话触发上下文压缩时，工作区 handoff 文档也会自动刷新，帮助切模型、换会话或长时间续跑时快速恢复进度。
- IDE Mode 计划执行链路已补齐“先规划、再确认、后持续执行”的闭环：新增计划状态流转、ready / blocked 执行包、`.openagent/TASKS.md` 全量任务树、`.openagent/SUBAGENTS.md` 与 `.openagent/SUPERVISOR.md` 输出，`IDEPlanPanel` 也能直接展示并复制主代理监督提示词与每个 ready task 的子代理提示词，方便按主代理监督、多子代理并行的方式持续推进任务。
- IDE Mode 编辑器已补齐查找替换与光标状态：文本区新增行号 gutter、实时 Ln/Col 与选区状态，支持 Ctrl/Cmd+F 查找、Ctrl/Cmd+H 替换、大小写切换、匹配跳转以及替换当前 / 全部替换；当前标签的光标范围也会和编辑会话一起持久化，切换页面后恢复的不只是文件列表，还包括更接近上次离开时的编辑位置。
- IDE Mode 编辑会话现在会按工作区持久化恢复：打开标签、当前焦点文件和未保存草稿会同步写入 AI Store，并在从 `/ide` 切到 `/ai`、通过侧边导航离开或页面重建后自动恢复；若某个文件已不再存在，则仅保留含未保存改动的草稿并跳过失效的只读标签，避免用户因为页面切换而静默丢失编辑上下文。
- IDE Mode 资源管理器新增批量重命名面板：支持对多选条目执行查找替换、前缀/后缀拼接，并在提交前预览冲突与最终名称；文件会自动保留扩展名，目录与文件互换名称时通过临时路径两阶段提交，避免循环重命名直接失败。
- IDE 工作区文件操作新增路径守卫：工作区相对路径现在会显式拦截 `../` 越界片段，避免异常输入把读写、复制、删除和重命名操作带出当前项目根目录。
- IDE Mode 资源管理器现在支持剪贴板式复制 / 粘贴：可复制单个或多选条目并粘贴到当前聚焦目录，若目标目录已有同名文件或目录会自动生成 `copy` 变体名，避免用户手动重命名才能完成结构整理；同时会阻止把目录粘贴进它自己的子目录，降低误操作风险。
- 工程侧新增 `npm run smoke:routes` 路由烟测脚本：现在可以自动拉起 `vite preview` 检查 `/`、`/ai`、`/ide`、`/ai-overlay`、`/sub2api` 的可达性，并在 Windows 上正确回收 preview 进程树，避免本地回归脚本跑完后把预览服务挂在后台。
- IDE Mode 项目计划面板已补齐“计划漂移可见性 + 手动同步基线”能力：现在可以直接看到当前计划相对工作区基线的新增 / 修改 / 删除差异、最近基线时间与样例文件；当变化只是你确认过的工作区更新时，可以直接同步基线，避免把所有变更都误判成必须重规划。
- IDE Mode 资源管理器已补齐高级文件管理交互：支持 Ctrl/Cmd 多选、Shift 连选、根目录拖放区、目录拖拽移动与批量删除；批量操作会自动折叠父子节点，避免重复执行文件系统动作，并在移动后同步迁移已打开编辑标签的路径，减少用户在重构目录时的状态错乱。
- IDE Mode 资源管理器已补齐新建文件 / 新建目录 / 重命名 / 删除能力：现在可以直接在当前聚焦目录或当前文件所在目录下管理节点，创建文件后会自动刷新结构并直接打开到编辑器；重命名与删除时会同步处理已打开标签，避免编辑器状态与真实文件树脱节；同时在前端先做名称校验，避免把非法路径片段直接带到 IPC。
- IDE Mode 终端已补齐真正的 PTY 前端视图：终端面板现在基于 `xterm` 渲染，可直接聚焦后键入、粘贴并承载 `vim`、`top` 这类依赖原始按键流的全屏命令；主进程同步新增终端 resize IPC，让 PTY 的 cols / rows 跟随前端视口变化。
- IDE Mode 终端交互进一步对齐真实用户预期：顶部停止按钮在 shell 会话中改为优先发送 Ctrl+C 中断前台命令，而不是直接销毁整个终端；同时新增每标签输入草稿保留与最近命令历史切换，减少多标签开发时的误操作和上下文丢失。
- IDE Mode 终端链路已升级为多标签交互式终端：Electron 运行时优先走 `node-pty` 提供真实 PTY，会话可持续写入 stdin，并保留 Pipe fallback 兜底；同时新增 `rebuild:native` / `postinstall` 自动重建原生依赖，降低 native 模块失配风险。
- 构建产物已为 IDE 终端能力单独拆分 `terminal-vendor` chunk，避免 `xterm` 相关依赖继续推高主 `vendor` 包体，降低非 IDE 页面被终端依赖拖累的风险。
- IDE 项目计划已支持基于真实工作区快照、diff、失败反馈与上下文摘要的动态重规划：新增 `ide_replan_plan` 工具、失败任务自动重规划逻辑，以及 IDE 面板手动重规划入口，计划创建时也会自动记录工作区基线。
- IDE Mode 终端面板从命令甲板升级为真实 shell 执行链路：现在可以在工作区内直接运行脚本或自定义命令，查看实时输出，并取消当前进程；脚本命令也会按 `packageManager` / lockfile 自动识别 `npm`、`pnpm`、`yarn`、`bun`。
- IDE 项目计划创建不再只是空草稿：现在会结合工作区结构、`package.json` 脚本、框架/语言与目标关键词自动生成初始阶段和任务，且 IDE 面板与 `ide_create_plan` 工具已统一复用同一条生成链路；生成失败时会自动回退为草稿并写入日志。
- IDE 项目计划面板文案已与真实能力对齐：表单改为明确说明会自动生成阶段与任务，避免用户把“生成计划”误解成“只创建空草稿”。
- Agent 上下文主链路已切到快照 + 语义优先装配：长对话会优先保留高信号历史，并在装配异常时自动回退旧滑窗，避免对话链路因新装配器异常而中断。

## 2.5.1

- 收紧 Sub2API 首次接入流程：一键初始化现在会先自动测试 PostgreSQL 与 Redis，可把 127.0.0.1:5432 / 6379 这类连接拒绝错误直接解释成可操作的依赖问题，并阻断误初始化。
- 优化 Sub2API 嵌入与工作台叙事：首次接入能力继续保留，但默认界面更聚焦账号池、模型、API Key 与 AI 绑定，减少“把完整后台长期塞进主流程”的负担。
- 缩小 AI 对话悬浮窗与 Live2D 悬浮窗默认尺寸，修正 AI 悬浮窗拖动与显示时反复重置位置的问题，并统一前端版本展示为读取 package.json。

## 2.5.0

- 新增 Sub2API 一级工作台页面，并接入左侧导航。现在可以在应用内集中维护网关根地址、API Key、路由模式、模型目录、能力检查和 Codex CLI 配置模板，不再把 Sub2API 能力散落在单个 AI 设置区块里。
- AI 设置页已改为直接消费内嵌 Sub2API 状态：可从独立页面同步配置，也能在 AI 设置里继续一键切换 Claude、OpenAI 与 Antigravity 路由，并直接选择来自 Sub2API 的模型目录。
- AI 配置导入导出现在已覆盖内嵌 Sub2API 配置与模型缓存元数据，迁移 OpenAgent 配置时可以把 Sub2API 工作台一并带走，避免新机器上重复配置。

## 2.4.0

- Sub2API OpenAI 路由现已在桌面端原生走 /v1/responses，不再只停留在 /chat/completions 兼容层，工具调用、推理摘要与 Codex 反代链路直接对齐服务端能力。
- AI 设置页进一步完善 Sub2API 接入体验：OpenAI 路由默认推荐 gpt-5.4，界面明确标记 Responses 通道，并可继续验证模型列表、消息路由与 Codex / Responses 可用性。
- GitHub Release 发布脚本改为真正的元数据同步模式：已存在的 Release 会按 CHANGELOG 自动更新标题与正文，并显式用 UTF-8 请求体上传，避免中文说明在移动端显示成问号。
- 发布脚本新增 metadata-only 修复模式，可在不重复上传大体积安装包的前提下单独修复历史 Release 的正文与说明。

## 2.3.0

- 新增 Sub2API 网关快捷接入面板，可一键切换 Claude、OpenAI 与 Antigravity Claude 路由，并同步协议、Base URL 与推荐模型。
- 新增 Sub2API 核心能力检查与后台入口，可直接验证模型列表、当前请求路由以及 OpenAI Responses 路径，用于确认 Codex 额度链路是否可用。
- 新增 Codex CLI 配置模板展示与复制能力，便于让外部 Codex 客户端复用同一套 Sub2API 网关接入。
- Anthropic 协议优先读取远端 /models，仅在服务端明确不支持该接口时才回退到内置模型列表，避免鉴权失败被误判为可用。
- AI 主聊天页与悬浮对话窗新增 Sub2API / Antigravity 状态徽章，并优化模型刷新条件与设置页交互反馈。

## 2.2.0

- 修复桌面打包版渲染页仍运行在 file 协议下导致的 Kokoro 本地模型与音色资源加载异常，改为统一走 openagent 协议提供内置页面与运行时资源。
- 重构 Live2D 悬浮窗交互，使用窗口形状同步模型与面板命中区域，去掉整块透明点击层，修复二次打开后聊天面板拖动与关闭失效的问题。
- 将 Live2D 工具唤出方式改为双击模型，降低拖动时误触工具栏的概率，并放宽大模型显示尺寸与窗口可用范围。
- 优化 TTS 设置页运行状态提示，区分模型初始化、资源加载、后端降级与失败状态，便于定位问题。
- 同步更新版本号、README 构建示例与发布说明。
