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
- 多引擎 TTS：支持系统语音、Edge、Azure 与 Kokoro 本地语音，兼顾低延迟、情绪表达与离线能力。
- 长期记忆与任务规划：支持长期记忆、分域会话、自动任务步骤推进。
- Windows MCP：在桌面版中可调用系统级读屏、聚焦、输入与自动化工具链。

## 核心能力

### AI 对话与推理

- 支持普通文本对话、工具调用、任务规划与多轮长上下文执行。
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

### Live2D 与桌面交互

- 支持 Live2D 悬浮窗独立会话。
- 支持模型双击唤出工具、按住拖动、抽屉工具栏与悬浮聊天窗口。
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

### Sub2API 桌面运行时目录

如果你要让 OpenAgent 本机直接作为 Sub2API 网关，请把桌面运行时依赖放在项目内的以下目录。当前方案是 OpenAgent 内嵌二进制运行时，不依赖 Docker 或 Compose：

- build/sub2api-runtime/bin/：放 Sub2API 可执行文件，默认文件名建议为 sub2api.exe
- build/sub2api-runtime/：放打包时需要一起带走的其他运行时资源
- 应用数据目录/sub2api-runtime/：运行时生成的 DATA_DIR、.installed、launcher 日志与本地 config.yaml

开发态下，OpenAgent 会优先从 build/sub2api-runtime/bin/sub2api.exe 查找本地网关二进制；打包后会自动复制到 resources/sub2api-runtime/bin/。

如果当前数据目录还没有 config.yaml，首次启动本地网关时会优先进入 Sub2API setup 向导。你可以在应用里的 Sub2API 页面点击“打开后台”完成初始化，后续管理员登录和 OpenAgent 专属 API Key 会继续由桌面端自动接入。

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

该命令会把 build/sub2api-runtime 目录一并打进桌面包体，供本地 Sub2API 网关模式直接使用。

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

发布页入口：

- [Latest Release](https://github.com/nianhua666/OpenAgent/releases/latest)
- [All Releases](https://github.com/nianhua666/OpenAgent/releases)

## 开源协议

本项目使用 MIT License 开源。

## 作者

- 年华
- GitHub: [nianhua666](https://github.com/nianhua666)