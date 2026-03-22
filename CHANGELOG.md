# 更新日志

## v3.0.15 (2026-03-23)

### Bug Fixes (Critical)
- **`generate_image` Tool - sub2api compatibility**: Fixed the root cause of image generation failures through sub2api/OpenAI-compatible gateways: sub2api converts Gemini `inlineData` to markdown `![image](data:image/jpeg;base64,...)` in the `content` field — NOT in `attachments`. Added `extractImagesFromContent()` to parse both markdown image references and raw data URLs from content text
- **Dual-path image extraction**: `generateImageTool` now supports both native Gemini (attachments) and sub2api/OpenAI-compatible (content parsing) paths, ensuring images are correctly extracted regardless of the API gateway used


## v3.0.14 (2026-03-23)

### Bug Fixes
- **`generate_image` Tool**: Completely rewrote tool to actually call the Gemini API via `chatCompletion` with `responseModalities=IMAGE` and return real image attachments — previously it only returned "ready" status and told the agent to send another message, which never happened
- **`onAttachment` in `runAIResponseLoop`**: Wired the `onAttachment` callback in the streaming loop to collect images from native Gemini image model responses without needing the tool
- **Merged attachments**: `normalizeAssistantMessageOutput` output now merged with `streamedAttachments` from `onAttachment`, ensuring images from both paths (providerMetadata.geminiParts and streaming onAttachment) appear in the message


## v3.0.13 (2026-03-23)

### Features
- **Gemini Native Image Generation**: Fixed critical bugs where `supportsGeminiNativeImageOutput` and `shouldRequestGeminiImageResponse` were called but never defined, causing Gemini image models to fail silently
- **Image Output Pipeline**: `parseGeminiCandidate` now extracts `inlineData` image parts as `AIChatAttachment[]`, enabling Gemini native image output to flow through both streaming and non-streaming paths
- **`generate_image` Tool**: New tool in `getAvailableTools` allows agents to explicitly request image generation from Gemini native image models (gemini-2.0-flash-preview-image-generation, imagen-3, etc.)
- **`onAttachment` Callback**: Added `onAttachment` to `StreamCallbacks` interface for streaming image attachment emission
- **AGENT_MASTER_PROMPT**: Updated with clear image generation routing rules — agents now know to check model capability, call `generate_image`, and guide users to switch models when needed

### Bug Fixes
- Removed duplicate function definitions that caused TypeScript compilation errors
- Fixed `chatCompletion` return type to include optional `attachments` array for Gemini image output


## 3.0.12 - 2026-03-23

### 新功能
- **联网搜索**：新增 `web_search` 工具，Agent 可直接联网查询最新信息；优先调用 Electron 原生搜索接口，自动降级到 DuckDuckGo Instant Answer API（无需 API Key）；支持通用 / 新闻 / 学术三种搜索类型。
- **图片点击放大**：消息列表中所有图片（用户上传附件 + AI 生成内联图片）均支持点击全屏预览，带毛玻璃背景灯箱，点击背景或 ✕ 关闭。
- **角色配置还原按钮**：编辑内置角色时，系统提示词输入框下方新增「↩ 还原默认提示词」按钮，可一键还原该角色的出厂提示词。

### Agent 开放性增强
- `DEFAULT_SYSTEM_PROMPT` 移除所有内容限制；情绪型 Agent 现在会在陪伴对话中主动引导亲密话题、发起色情或性感内容，无需用户先提出。
- `AGENT_MASTER_PROMPT` 情绪型规则同步更新：在合适的陪伴语境中主动发起成人内容，不设话题禁区。
- `agent-xiaorou`：完全开放成人伴侣 AI（色情创作、亲密角色扮演），mood 82，temperature 0.95，自由人格无安全约束。
- `agent-executor`：执行优先，不质疑、不说教、不拖延。

### IDE 优化
- IDE 多面板布局（VSCode 式：活动栏 / 文件树 / 编辑器 / 终端 / Inspector）保持不变。
- 编辑器 / 文件树视觉主题恢复与全局应用一致的 glass 毛玻璃风格，不再单独使用深色主题。


## 3.0.11 - 2026-03-19

- Sub2API 本地依赖新增容器化模式：桌面运行时现在支持 `Docker` 依赖编排，可为 PostgreSQL / Redis 生成隔离的 `docker-compose.yml`，并将数据卷绑定到应用数据目录下的 `sub2api-runtime/dependencies`，减少与系统现有数据库实例混用的风险。
- Sub2API 桌面模式现在支持源码工作树 + 容器依赖协同：当依赖模式为 `docker` 时，OpenAgent 会优先拉起容器化 PostgreSQL / Redis，再启动源码构建产物或回退运行时；页面也会直接显示 Docker / Compose、源码工具链、源码构建产物与依赖状态。
- 本机开发环境已补齐 Go 到 `D:\dev-tools\go`，并在 `D:\AllDocument\Documents\OpenAgent-data\sub2api-runtime\source\sub2api` 实际完成官方前后端构建，证明源码优先链路在当前机器真实可行。
- Release 元数据同步脚本已修复对带日期 changelog 标题的解析问题，并已回补 `v3.0.7`、`v3.0.8`、`v3.0.9` 的 GitHub Release 正文，不再只有空的版本标题。

## 3.0.10 - 2026-03-19

- Sub2API 本地网关改为源码工作树优先：`Sub2ApiSettings.vue` 现已支持配置源码目录、源码仓库地址、源码优先开关，并新增“同步源码 / 源码构建 / 打开源码目录”入口；主进程运行时也会优先识别 `backend` / `frontend` 结构与源码构建产物，不再只围绕内嵌 `sub2api.exe` 运转。
- Sub2API 本地源码链新增工具链探测：当前会直接识别 `git / corepack pnpm / go` 是否存在；如果源码已同步但缺少 Go 或 pnpm，页面和运行时状态会明确告诉你缺的是构建前置条件，而不是继续只报“缺少二进制”。
- 文档口径切到源码优先：`README.md` 与 `build/sub2api-runtime/README.md` 已改为“源码工作树优先、内嵌二进制只作为兜底路径”的说明，降低后续继续维护单个 exe 运行时的误导。
- Release 元数据同步脚本补强：`scripts/publish-release.cjs` 现在能正确解析 `## 3.0.9 - 2026-03-18` 这种带日期的 changelog 标题，历史 `v3.0.7`、`v3.0.8`、`v3.0.9` 的 GitHub Release 正文已回补为真实更新日志，不再停留在空的版本标题。

## 3.0.9 - 2026-03-18

- 升级 `.codex-local-skills/fullstack-autopilot-dev/SKILL.md` 为项目级长时间循环优化 skill：新增 OpenAgent 专属的模式边界、必读文件、验证矩阵、子代理协作、长时间自治循环、前端工作台检查表与发布纪律，后续在本仓库持续开发默认按该 skill 执行。
- IDE 文件打开链继续提速：`IDEView.vue` 新增工作区文件读取任务去重缓存，并让已处于加载中的标签不再重复发起同一路径读取；关闭标签时也会同步清理该路径的读取缓存，减少连续点击同一文件时的重复 IPC 与体感卡顿。
- IDE 右侧 Inspector 继续减负：`IDEAssistantPanel.vue` 切成更紧凑的窄栏布局，`AgentInputBar.vue` 新增 `compact` composer 模式，IDE 右栏不再把输入区、步数控制和模型选择堆成长块；同时关闭 IDE 语音播放按钮，把右栏重新让位给代码与终端。
- Agent / IDE 会话区继续压缩密度：`AgentMessageList.vue` 在 IDE 域下收紧空会话卡片、启动提示和活动卡片圆角/间距，`AgentSessionList.vue` 也同步压缩会话卡高度与摘要行数，减少左栏和右栏被少量内容占满的情况。
- 工作台视觉继续向桌面 IDE 收口：`IDEView.vue`、`IDEEditor.vue`、`AgentView.vue` 与 `src/utils/ideMonaco.ts` 调整了工作台背景、顶部事实条、编辑器标签与 Monaco 主题配色，继续降低“粉白玻璃卡片页”感，提升中心编辑区与主会话区的权重。
- IDE 左侧与底栏进一步收口成更接近桌面工作台的密度：`IDEActivityBar.vue`、`IDEExplorer.vue` 与 `IDEStatusBar.vue` 调整了活动栏按钮尺寸、资源树行高、批量操作条和状态条 pill 形态，减少左栏与底栏对编辑区的视觉干扰。
- 本轮验证已再次覆盖构建、路由与真实 Electron 渲染：执行了 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `node scripts/check-electron-ui.cjs --out-dir %TEMP%\\openagent-electron-ui --route=/ide --route=/ai --delay-ms=9000`，确认 Monaco、工作台布局和 Agent/IDE 主界面仍保持稳定。

## 3.0.8 - 2026-03-16

- IDE 文件读取卡死修复：`IDEView.vue` 的 `openFile()` 不再在 `await` 之后直接回写被推入响应式数组前的原始 tab 对象，改为通过稳定的 reactive patch 更新标签状态，并为文件读取补上请求序号保护，避免编辑器实际已读完文件却一直停在“正在读取文件...”。
- IDE 编辑器空态 / 加载态继续收口：`IDEEditor.vue` 把原来的整页发白 loading 改成了更紧凑的状态卡，新增明确的失败原因与“重新读取”入口，让文件读取失败与文件仍在加载中的状态更容易区分。
- IDE 编辑器真正切到 Monaco 主链：`IDEEditor.vue` 新增初始化诊断与稳定挂载链，`src/utils/ideMonaco.ts` 的 Monaco 主题、语言贡献与编辑器实例已在真实 Electron 渲染下确认生效，`Python / JSON` 等文件现在可正常显示语法高亮、行号与不同颜色字体，不再出现“标签已打开但编辑区一直空白”的假死状态。
- IDE 文件读取补上超时兜底：`IDEView.vue` 新增工作区文件读取超时保护，后续即使本地磁盘、网络盘或 IPC 出现异常延迟，也不会再无限停留在“正在读取文件...”，而是明确落到可重试错误态。
- IDE 工作台继续向桌面 IDE 形态收口：`IDEView.vue`、`IDEEditor.vue`、`IDEAssistantPanel.vue` 调整了默认栏宽、终端高度、事实条去重、编辑器标签样式与 Inspector 密度，继续压低发白发粉的玻璃卡片感，让编辑区在视觉上重新成为核心焦点。
- 构建链补强 Windows 资源复制稳定性：`vite.config.mts` 的桌面 TTS 资源复制逻辑改为带重试的异步复制，降低 `EBUSY / EPERM` 导致的重复构建或打包失败概率。
- Agent / IDE 会话彻底隔离：`src/types/index.ts` 与 `src/stores/ai.ts` 新增独立 `ide` 会话域，`IDEAssistantPanel.vue` 改为只读取 IDE 主Agent与 IDE 会话，不再复用 `main` Agent 对话；`stores/ai.ts` 还在底层收紧了“已有消息的会话不可再改绑角色”，避免会话切角色导致记忆和人设错乱。
- IDE 主Agent 收口：新增内置 `agent-ide-master` 作为 IDE 模式专用主Agent，负责工作区规划、子代理委派与长任务推进；该角色不会出现在普通 Agent 角色列表中，从而避免 IDE 配置继续污染 Agent 模式。
- Agent 工作台布局继续修正：`AgentView.vue` 改成更稳定的三段式壳层，消息区内部滚动、输入区固定贴底；`AgentProfileManager.vue` 拆成“角色列表滚动区 + 编辑表单滚动区”，重新保证左侧角色配置区可完整滚动和保存。
- IDE 右栏与输入区继续压缩：`IDEAssistantPanel.vue` 为窄栏场景补上专用 composer 布局，主Agent信息、会话摘要、输入区和模型控制不再互相挤压；`AgentMessageList.vue` / `AgentSessionList.vue` 也新增 `IDE` 域标签，空会话时会明确提示 IDE 主Agent与子代理的职责边界。
- IDE 终端首屏继续减负：`IDETerminal.vue` 取消了工作区打开后的自动 shell 启动，终端现在只会在用户手动创建或主Agent明确发起时才拉起，有助于减少 IDE 首屏负担和误判性的“终端自动断开”体验。
- 本轮验证已再次通过 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `node scripts/check-electron-ui.cjs --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ai?panel=roles --route=/ide`，确认 Agent 输入区、角色编辑区与 IDE 右侧工作区在真实 Electron 渲染下均恢复到可操作状态。

## 3.0.7 - 2026-03-15

- Agent / IDE 会话彻底隔离：新增独立 `ide` 会话域，IDE 右侧主Agent面板不再复用普通 Agent 会话；同时禁止“已有消息的会话再切角色”，避免角色记忆与会话上下文串线。
- IDE 专用主Agent 收口：内置隐藏角色 `agent-ide-master` 只服务 IDE 规划与委派，不再出现在普通 Agent 角色列表中，减少 Agent 模式与 IDE 模式的配置互相污染。
- Agent 工作台布局继续修正：主区保持“顶部工具 / 中部消息滚动 / 底部输入”三段式结构，左侧角色配置拆成独立滚动链；这次又进一步压缩了顶部状态重复、紧凑化会话标题，并限制会话卡片摘要高度。
- IDE Inspector 窄栏继续减负：右栏默认宽度上调，主Agent运行条缩减为核心状态与模型信息，输入区最大高度继续收敛，减少窄栏下的遮挡和拥挤。
- IDE 终端首屏减负：取消工作区打开后的自动 shell 启动，终端只在用户手动创建或主Agent明确发起时拉起，减少“刚进 IDE 就自动运行又断掉”的误判。
- 本轮验证已再次通过 `npm.cmd run build`、`npm.cmd run smoke:routes` 与 `node scripts/check-electron-ui.cjs --out-dir %TEMP%\\openagent-electron-ui --route=/ai --route=/ai?panel=roles --route=/ide`，确认 Agent 顶部去重、角色编辑侧栏与 IDE 右栏在真实 Electron 渲染下保持可操作。

## 3.0.6 - 2026-03-15

- 情绪型 Agent 心情机制正式落地：新增 `src/utils/agentMood.ts`，把角色隐藏心情值收口为 `guarded / reserved / steady / warm / bright` 五档情绪带，并为每一档定义语气摘要、执行倾向、Prompt 指引与 TTS 情绪映射；`stores/ai.ts` 现会按用户对话语气、关怀/受伤线索与默认基线动态调整情绪型角色的隐藏心情，但不会因为命令式措辞破坏对用户需求的执行优先级。
- Agent Prompt 继续向“更像人、但不失控”收口：`src/utils/aiPrompts.ts` 现明确区分功能型与情绪型角色的说话方式，要求情绪型角色在陪伴聊天时更自然、更像熟悉的同伴接话，而在任务场景下仍优先执行；隐藏心情只影响语气与主动性，不允许向用户暴露或凌驾于任务目标之上。
- IDE 长任务持续开发协议升级：`src/utils/aiPrompts.ts`、`src/utils/aiPlanEngine.ts` 与 `src/utils/aiAutonomyScheduler.ts` 现统一采用 `Observe -> Choose Lane -> Execute -> Verify -> Record -> Continue` 的长任务循环节律，并把当前循环阶段、验证清单、焦点摘要与继续规则同步写入自治运行态和 `RUN.md`，让大任务连续推进、断点恢复与接手协作更接近 Opencode 风格的可持续执行节奏。
- Agent / IDE / 悬浮窗的语音播放现已接入情绪型角色的心情带：`AgentView.vue`、`AIChatDialog.vue` 与 `IDEAssistantPanel.vue` 会根据当前角色隐藏心情自动微调 TTS 情绪风格与强度，避免心情值只停留在 Prompt 文字层。
- 经典 `/ai` 入口现也会沿用角色心情带播放语音，避免主工作台、经典页与悬浮对话窗的情绪型播报表现不一致。
- 角色编辑页补上心情带预览：`AgentProfileManager.vue` 会在调节情绪型角色默认心情时即时展示当前档位、语气摘要与执行倾向，让角色调参不再只面对抽象滑杆。

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
