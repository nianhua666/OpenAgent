# OpenAgent

OpenAgent 是一个面向 Windows 桌面场景的 AI 助手工具，集成了多协议大模型对话、账号管理、托管 MCP / Skills、Live2D 桌面悬浮窗、图片理解、思考过程展示与本地 TTS 播报能力，适合需要把 AI 对话、自动化工具和业务数据整理放在一个桌面工作流里的用户。

[下载最新版本](https://github.com/nianhua666/OpenAgent/releases/latest)
[查看全部 Release](https://github.com/nianhua666/OpenAgent/releases)

## 项目特点

- 多模型协议支持：内置 OpenAI 兼容协议、Anthropic Messages、Ollama 本地与云端接入。
- 账号管理工作台：支持账号类型设计、账号查询、批量导入、批量导出与业务字段约束。
- 托管 MCP / Skills：内置 MCP 与 Skill 商城、统一启停、健康检查与托管调用。
- Live2D 桌面助手：支持异形悬浮显示、模型双击唤出工具、独立聊天窗口、拖动与交互。
- 多模态对话：支持图片附件发送、视觉模型识别、推理过程展示与折叠查看。
- 手动截图输入：Agent、IDE Agent 与悬浮对话窗都支持调用 Windows 手动截图流程，截图完成后会自动作为附件挂到输入框上方。
- Agent / IDE 工作台：Agent 顶部信息条与底部输入区继续收口为高密度工作台布局，模型选择、附件、截图和自动步数控制统一留在底部 composer，减少大面积空白与重复状态栏。
- Agent / IDE 会话隔离：IDE 模式拥有独立的主Agent与独立会话域，不会再和普通 Agent 模式共享会话、角色绑定或记忆链路。
- 情绪型 Agent 心情带：情绪型角色的隐藏心情值会映射到不同的语气与播报风格，让陪伴式对话更自然，但不会盖过执行用户任务的主优先级。
- 多引擎 TTS：支持系统语音、Edge、Azure 与 Kokoro 本地语音，兼顾低延迟、情绪表达与离线能力。
- 长期记忆与任务规划：支持长期记忆、分域会话、自动任务步骤推进，以及更接近 Opencode 风格的长任务循环节律。
- Windows MCP：在桌面版中可调用系统级读屏、聚焦、输入与自动化工具链。

## 核心能力

### AI 对话与推理

- 支持普通文本对话、工具调用、任务规划与多轮长上下文执行。
- 每个 Agent 会话都会绑定单一角色，避免在同一会话中切换角色导致长期记忆、人设和任务上下文混乱。
- 情绪型 Agent 会根据隐藏心情带动态调整语气、主动性和 TTS 风格；功能型 Agent 则保持更稳、更直接的执行表达。
- 支持手动截图、图片粘贴与普通文件附件统一进入对话输入区，便于直接把屏幕内容交给视觉模型分析。
- 支持模型思考过程展示，用户可在聊天界面中展开或收起。
- 对视觉模型自动启用图片理解约束，减少“无法解析图像”的无效回复。

### 账号管理

- 自定义账号类型与字段结构。
- 按字段规则导入账号数据，降低脏数据风险。
- 结构化导出账号内容，适合迁移、备份与交接。

### MCP / Skill 扩展

- 内置资源商城，可直接安装、启用与刷新托管资源。
- 支持将稳定规则以 Skill 的形式注入系统提示。
- 支持桌面环境下的 Windows MCP 能力接入。

### IDE 工作流

- IDE 模式使用独立主Agent负责规划、读代码、调用 IDE 工具与长任务推进，不复用普通 Agent 会话。
- Inspector、Explorer、MCP、终端与编辑区都采用独立滚动链，减少长消息、长日志或长表单互相挤压的情况。
- 打开工作区后不再自动拉起 shell，终端只在用户手动创建或 IDE 主Agent明确需要时启动。

### Live2D 与桌面交互

- 支持 Live2D 悬浮窗独立会话。
- 支持模型双击唤出工具、按住拖动、抽屉工具栏与悬浮聊天窗口。
- 悬浮聊天窗口默认保持纯对话布局，避免在小窗里重复展示 AI 配置与网关面板。
- 打包态支持内置模型诊断与资源协议自检。

### TTS 语音播报

- 系统语音模式：启动快、延迟低，适合快速播报。
- Kokoro 模式：支持离线缓存、自定义模型与更多开源音色。
- AI 设置页支持模型、音色、缓存状态与试听控制。

## 技术栈

- Electron
- Vue 3
- TypeScript
- Pinia
- Vite
- electron-builder
- kokoro-js-zh
- oh-my-live2d

## 本地开发

### Sub2API 本地网关模式

OpenAgent 支持把 Sub2API 作为可选本地网关接入，并在应用内完成运行、初始化、模型读取和 Agent 绑定。

README 只保留高层说明：

- 本地网关是可选能力，不影响普通外部 API 接入
- OpenAgent 会在应用内提供运行状态、初始化入口、模型同步和 AI 绑定
- 具体运行时实现、构建方式和本地依赖策略属于内部集成细节，不在主 README 展开

### 环境要求

- Node.js 20+
- npm 10+
- Windows 10/11

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建前端与 Electron 产物

```bash
npm run build
```

### 生成桌面安装包与便携包

```bash
npm run electron:build:clean
```

该命令会把 `build/sub2api-runtime` 一并打进桌面包体，作为本地网关的兜底运行时；如果你已经配置源码工作树，桌面版会优先尝试使用源码构建产物。

安装版升级时，NSIS 安装器会优先读取上一版本记录的安装目录，并默认沿用原目录；只有用户在安装界面手动切换时才会改变。

运行数据目录与安装目录是分离的：OpenAgent 会优先沿用你最近一次自动策略目录，或继续使用你手动指定的自定义数据目录，避免因为重装或升级而把账号数据、AI 会话、日志和缓存切到新的空目录。

### 上传当前版本 GitHub Release 资产

```bash
npm run release:publish
```

该命令会自动读取当前 package.json 版本号，若远端不存在对应 Tag / Release，会自动创建 Release，并用当前版本目录下的安装包、便携版、blockmap 和 latest.yml 覆盖上传。

如果远端 Release 已存在，脚本会先同步标题、正文和发布属性，再覆盖上传当前版本资产。Release 正文会按 UTF-8 从 CHANGELOG 提取，避免中文说明在 GitHub 移动端显示成问号。

如需只修复已有 Release 的标题或正文而不重复上传大文件，可执行：

```bash
node scripts/publish-release.cjs --version 2.2.0 --metadata-only
```

### 构建并自动发布当前版本

```bash
npm run electron:release
```

构建完成后，产物会输出到：

```text
release/v当前版本/
```

其中包含：

- OpenAgent Setup 当前版本.exe
- OpenAgent Setup 当前版本.exe.blockmap
- OpenAgent Portable 当前版本.exe
- win-unpacked/

后续版本会自动按当前 package.json 的版本号输出到对应目录，例如 v2.3.0、v2.4.0。

## 发布说明

建议从 GitHub Release 下载正式版本：

- 安装版：适合常规桌面安装使用。
- 便携版：适合免安装直接运行。
- 安装版升级默认沿用旧安装目录；便携版升级建议直接覆盖原目录，确保就近资源与数据目录保持一致。

发布页入口：

- [Latest Release](https://github.com/nianhua666/OpenAgent/releases/latest)
- [All Releases](https://github.com/nianhua666/OpenAgent/releases)

## 开源协议

本项目使用 MIT License 开源。

## 作者

- 年华
- GitHub: [nianhua666](https://github.com/nianhua666)
