# 更新日志

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