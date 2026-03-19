<template>
  <div class="sub2api-page">
    <section v-if="showHeroSection" class="page-hero glass-panel">
      <div class="hero-copy">
        <span class="hero-tag">Sub2API</span>
        <h2 class="page-title">Sub2API 账号池与 API 工作台</h2>
        <p>这里优先服务账号池接入、模型同步、API Key 复用和 Agent 绑定。OpenAgent 仍然支持本机托管 Sub2API 运行时，但主界面只保留必要控制，避免把完整后台系统长期塞进工作流里。</p>
      </div>
      <div class="hero-metrics">
        <div class="hero-metric">
          <span>接入模式</span>
          <strong>{{ gatewayModeLabel }}</strong>
        </div>
        <div class="hero-metric">
          <span>{{ desktopModeEnabled ? '本地状态' : '已缓存模型' }}</span>
          <strong>{{ desktopModeEnabled ? runtimeStatusLabel : `${activeModels.length} 个` }}</strong>
        </div>
        <div class="hero-metric">
          <span>AI 绑定</span>
          <strong>{{ currentAiModeLabel }}</strong>
        </div>
      </div>
    </section>

    <div class="sub2api-scroll">

    <section v-if="showConfigSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-gateway"/></svg>
            账号池接入与运行时
          </h3>
          <p class="section-desc">默认推荐桌面模式：OpenAgent 本机直接托管 Sub2API 二进制运行时。这里优先保留账号池、模型、API Key 与 AI 绑定所需操作；外部网关继续作为备用入口。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" @click="openAISettingsPage">打开 AI 设置</button>
          <button class="btn btn-secondary btn-sm" :disabled="!desktopModeEnabled" @click="openSub2ApiConsolePage">打开嵌入面板</button>
          <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.adminUrl" @click="openSub2ApiAdmin">打开原始后台</button>
          <button class="btn btn-primary btn-sm" :disabled="!canApplyToAI" @click="applyToAI()">同步到 Agent</button>
        </div>
      </div>

      <div class="mode-switch-row">
        <button
          class="mode-switch-card"
          :class="{ active: gatewayMode === 'desktop' }"
          @click="setGatewayMode('desktop')"
        >
          <span class="provider-card-tag">本地</span>
          <strong>桌面网关</strong>
          <small>OpenAgent 主进程直接拉起 Sub2API 本地运行时，AI 设置、模型目录和检查都走本机地址。</small>
        </button>
        <button
          class="mode-switch-card"
          :class="{ active: gatewayMode === 'external' }"
          @click="setGatewayMode('external')"
        >
          <span class="provider-card-tag">远端</span>
          <strong>外部网关</strong>
          <small>继续连接你已经部署好的远端 Sub2API 服务，适合有现成公网网关的场景。</small>
        </button>
      </div>

      <div class="status-strip">
        <span class="status-chip">当前接入：{{ gatewayModeLabel }}</span>
        <span class="status-chip" :class="{ 'is-accent': runtimeState.healthy }">运行状态：{{ runtimeStatusLabel }}</span>
        <span class="status-chip">管理地址：{{ effectiveGatewayRoot || '未配置' }}</span>
        <span v-if="desktopModeEnabled" class="status-chip">健康状态：{{ runtimeHealthLabel }}</span>
      </div>

      <div v-if="desktopModeEnabled" class="workflow-grid">
        <article class="workflow-card workflow-card-emphasis">
          <span class="provider-card-tag">推荐流程</span>
          <strong>默认本地网关</strong>
          <p>{{ desktopFlowSummary }}</p>
          <div class="workflow-step-list">
            <div class="workflow-step-item">
              <span>1</span>
              <div>
                <strong>启动本地服务</strong>
                <small>{{ runtimeStatusLabel }}，{{ runtimeHealthLabel }}</small>
              </div>
            </div>
            <div class="workflow-step-item">
              <span>2</span>
              <div>
                <strong>接入账号池</strong>
                <small>{{ setupStatusLabel === '已完成初始化' ? '本地 setup 已完成，可以直接进入后台维护账号池。' : '首次运行先点“打开后台”，完成初始化后再登录并加入账号池。' }}</small>
              </div>
            </div>
            <div class="workflow-step-item">
              <span>3</span>
              <div>
                <strong>同步模型目录</strong>
                <small>当前路由已缓存 {{ activeModels.length }} 个模型，账号池变化后建议重新读取一次。</small>
              </div>
            </div>
            <div class="workflow-step-item">
              <span>4</span>
              <div>
                <strong>绑定到 Agent</strong>
                <small>{{ currentAiModeLabel }}；点击“同步到 Agent”即可一键带上路由、Base URL 与默认模型。</small>
              </div>
            </div>
          </div>
          <p class="workflow-footnote">{{ desktopNextActionLabel }}</p>
        </article>

        <article class="workflow-card">
          <span class="provider-card-tag">本地统计</span>
          <strong>运行与接入概览</strong>
          <div class="workflow-metrics-grid">
            <div class="workflow-metric-card">
              <span>运行时长</span>
              <strong>{{ runtimeUptimeLabel }}</strong>
            </div>
            <div class="workflow-metric-card">
              <span>已缓存模型</span>
              <strong>{{ totalCachedModelCount }}</strong>
            </div>
            <div class="workflow-metric-card">
              <span>最近检查</span>
              <strong>{{ activeCheckSummaryLabel }}</strong>
            </div>
            <div class="workflow-metric-card">
              <span>启动日志</span>
              <strong>{{ runtimeLogLineCount }} 行</strong>
            </div>
          </div>
        </article>
      </div>

      <div class="config-grid">
        <label class="config-field">
          <span>Sub2API API Key</span>
          <div class="input-wrap">
            <input
              :type="showApiKey ? 'text' : 'password'"
              class="setting-input"
              :value="apiKey"
              placeholder="sk-your-sub2api-key"
              @input="apiKey = ($event.target as HTMLInputElement).value"
            />
            <button class="toggle-visibility-btn" :title="showApiKey ? '隐藏' : '显示'" @click="showApiKey = !showApiKey">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="showApiKey" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle v-if="showApiKey" cx="12" cy="12" r="3"/>
                <path v-if="!showApiKey" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line v-if="!showApiKey" x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <small>用于 OpenAgent 内嵌 Sub2API 路由与模型列表读取。同步到 Agent 时会一并写入当前 AI 配置。</small>
        </label>

        <label v-if="!desktopModeEnabled" class="config-field">
          <span>网关根地址</span>
          <input
            class="setting-input"
            :value="gatewayRoot"
            :placeholder="SUB2API_GATEWAY_PLACEHOLDER"
            @input="gatewayRoot = normalizeSub2ApiGatewayRoot(($event.target as HTMLInputElement).value)"
          />
          <small>只填根地址，不要带 /v1、/v1beta、/messages、/responses、:generateContent，或 /antigravity/v1。</small>
        </label>

        <label v-else class="config-field">
          <span>本地网关地址</span>
          <input
            class="setting-input"
            :value="effectiveGatewayRoot"
            readonly
          />
          <small>桌面模式会根据主机和端口自动推导本地根地址，并同步给 AI 设置页、模型目录和 Codex 模板。</small>
        </label>
      </div>

      <div v-if="desktopModeEnabled" class="desktop-runtime-panel">
        <div class="desktop-runtime-head">
          <div>
            <strong>本地桌面接入</strong>
            <p>{{ runtimeState.healthMessage || 'OpenAgent 会直接管理内嵌 Sub2API 运行时。完成初始化后，可以使用这里的管理员账号与统一密码自动登录后台，并为 OpenAgent 复用或创建专属 API Key。' }}</p>
          </div>
          <div class="hero-actions">
            <button class="btn btn-secondary btn-sm" :disabled="syncingDesktopAccess" @click="syncDesktopAccess">
              {{ syncingDesktopAccess ? '同步中...' : '同步本地专属 Key' }}
            </button>
            <button class="btn btn-secondary btn-sm" :disabled="!effectiveGatewayRoot" @click="openSub2ApiConsolePage">进入内嵌后台</button>
            <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.adminUrl" @click="openSub2ApiAdmin">打开外部后台</button>
          </div>
        </div>

        <div class="status-strip">
          <span class="status-chip">管理员账号：{{ managedAdminEmail }}</span>
          <span class="status-chip">统一密码：{{ managedSharedPassword }}</span>
          <span class="status-chip">专属 Key：{{ managedApiKeyStatusLabel }}</span>
          <span class="status-chip">当前状态：{{ runtimeStatusLabel }}</span>
        </div>

        <div class="runtime-note-grid">
          <div class="runtime-note-card">
            <strong>默认接入</strong>
            <p>OpenAgent 默认使用 127.0.0.1:38080、本地桌面运行时和 OpenAgentnh 作为初始化密码。首次启动后只需要完成必要初始化，然后就能围绕账号池、模型和 API Key 继续接入。</p>
          </div>
          <div class="runtime-note-card">
            <strong>API Key 自动接入</strong>
            <p>初始化完成后，OpenAgent 会尝试使用当前管理员账号自动登录后台，并按「{{ managedApiKeyName }}」查找或创建专属 API Key，方便一键同步到 AI 设置与日常调用。</p>
          </div>
        </div>

        <details class="advanced-fold">
          <summary>自动接入参数</summary>

          <div class="config-grid advanced-fold-body">
            <label class="config-field">
              <span>管理员邮箱</span>
              <input class="setting-input" :value="managedAdminEmail" type="email" placeholder="admin@openagent.local" @input="managedAdminEmail = ($event.target as HTMLInputElement).value" />
              <small>用于本地自动登录、创建专属 API Key，以及首次进入后台时的默认管理员账号。</small>
            </label>

            <label class="config-field">
              <span>统一密码</span>
              <input class="setting-input" :value="managedSharedPassword" placeholder="OpenAgentnh" @input="managedSharedPassword = ($event.target as HTMLInputElement).value" />
              <small>默认会作为初始化阶段建议密码，以及后台自动登录时使用的管理员密码。</small>
            </label>

            <label class="config-field config-field-span">
              <span>专属 API Key 名称</span>
              <input class="setting-input" :value="managedApiKeyName" placeholder="OpenAgent Desktop" @input="managedApiKeyName = ($event.target as HTMLInputElement).value" />
              <small>OpenAgent 会按这个名称在本地后台自动查找或创建专属 API Key，便于 AI 设置一键复用。</small>
            </label>
          </div>
        </details>
      </div>

      <div v-if="desktopModeEnabled" class="desktop-runtime-panel">
        <div class="desktop-runtime-head">
          <div>
            <strong>本地网关运行时</strong>
            <p>{{ runtimeState.healthMessage || 'OpenAgent 会默认按本机网关模式管理 Sub2API；常用操作只保留启停、后台入口和模型接入，高级参数折叠到下方。' }}</p>
          </div>
          <div class="hero-actions">
            <button class="btn btn-secondary btn-sm" @click="chooseDesktopBinary">选择二进制</button>
            <button class="btn btn-secondary btn-sm" @click="chooseDesktopDataDir">选择数据目录</button>
            <button class="btn btn-primary btn-sm" :disabled="sub2ApiStore.runtimeBusy || runtimeState.status === 'running'" @click="startDesktopRuntime">
              {{ startRuntimeLabel }}
            </button>
            <button class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy || runtimeState.status !== 'running'" @click="restartDesktopRuntime">重启</button>
            <button class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy || !canStopRuntime" @click="stopDesktopRuntime">停止</button>
          </div>
        </div>

        <div class="status-strip">
          <span class="status-chip">自动启动：{{ desktopAutoStart ? '已启用' : '未启用' }}</span>
          <button class="status-chip status-chip-button" @click="toggleDesktopAutoStart">{{ desktopAutoStart ? '关闭自启动' : '启用自启动' }}</button>
          <span class="status-chip">依赖目录：{{ runtimeState.dependencyRoot || 'build/sub2api-runtime' }}</span>
          <button class="status-chip status-chip-button" @click="copyText(runtimeState.dependencyRoot || 'build/sub2api-runtime', '依赖目录')">复制目录</button>
          <span class="status-chip">日志文件：{{ runtimeState.logFilePath || '将在首次启动后生成' }}</span>
        </div>

        <details class="advanced-fold">
          <summary>高级运行时参数</summary>

          <div class="config-grid advanced-fold-body">
            <label class="config-field">
              <span>监听主机</span>
              <input
                class="setting-input"
                :value="desktopHost"
                placeholder="127.0.0.1"
                @input="desktopHost = ($event.target as HTMLInputElement).value"
              />
              <small>建议本机默认使用 127.0.0.1；如果需要让局域网其他设备访问，再改成 0.0.0.0。</small>
            </label>

            <label class="config-field">
              <span>监听端口</span>
              <input
                class="setting-input"
                type="number"
                min="1"
                max="65535"
                :value="desktopPort"
                @input="desktopPort = Number(($event.target as HTMLInputElement).value)"
              />
              <small>AI 设置页和本地健康检查都会复用这个端口。</small>
            </label>

            <label class="config-field">
              <span>运行模式</span>
              <select class="setting-input" :value="desktopRunMode" @change="desktopRunMode = ($event.target as HTMLSelectElement).value as 'simple' | 'standard'">
                <option value="simple">simple</option>
                <option value="standard">standard</option>
              </select>
              <small>simple 适合先把本地网关跑起来；standard 需要更完整的后端依赖与配置。</small>
            </label>

            <label class="config-field">
              <span>依赖模式</span>
              <select class="setting-input" :value="desktopDependencyMode" @change="desktopDependencyMode = ($event.target as HTMLSelectElement).value as 'external' | 'docker'">
                <option value="docker">Docker 容器依赖</option>
                <option value="external">外部 PostgreSQL / Redis</option>
              </select>
              <small>推荐使用 Docker 容器隔离 PostgreSQL / Redis；这样 setup、日志和数据都能跟本地网关一起隔离。</small>
            </label>

            <label class="config-field">
              <span>日志级别</span>
              <select class="setting-input" :value="desktopLogLevel" @change="desktopLogLevel = ($event.target as HTMLSelectElement).value as 'debug' | 'info' | 'warn' | 'error'">
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
              <small>这里控制主进程传给 Sub2API 的运行级别，启动排障时建议先切到 debug。</small>
            </label>

            <label class="config-field config-field-span">
              <span>Sub2API 二进制</span>
              <div class="path-input-row">
                <input
                  class="setting-input"
                  :value="desktopBinaryPath"
                  placeholder="留空则优先使用打包内置路径"
                  @input="desktopBinaryPath = ($event.target as HTMLInputElement).value"
                />
                <button class="btn btn-secondary btn-sm" @click="chooseDesktopBinary">浏览</button>
              </div>
              <small>开发态默认查找 {{ runtimeState.bundledBinaryPath || 'build/sub2api-runtime/bin/sub2api.exe' }}；打包后会切到 resources/sub2api-runtime/bin。</small>
            </label>

            <label class="config-field config-field-span">
              <span>源码目录</span>
              <div class="path-input-row">
                <input
                  class="setting-input"
                  :value="desktopSourceDir"
                  placeholder="留空则使用应用数据目录/sub2api-runtime/source/sub2api"
                  @input="desktopSourceDir = ($event.target as HTMLInputElement).value"
                />
                <button class="btn btn-secondary btn-sm" @click="chooseDesktopSourceDir">浏览</button>
              </div>
              <small>推荐使用官方源码工作树。OpenAgent 会识别 backend / frontend 目录，并在构建完成后优先托管源码产物。</small>
            </label>

            <label class="config-field config-field-span">
              <span>源码仓库地址</span>
              <input
                class="setting-input"
                :value="desktopSourceRepoUrl"
                placeholder="https://github.com/Wei-Shaw/sub2api.git"
                @input="desktopSourceRepoUrl = ($event.target as HTMLInputElement).value"
              />
              <small>点击“同步源码”时会按这个地址 clone 或 pull。默认使用官方仓库。</small>
            </label>

            <label class="config-field config-field-span checkbox-field">
              <span>源码优先</span>
              <label class="checkbox-row">
                <input type="checkbox" :checked="desktopPreferSourceBuild" @change="desktopPreferSourceBuild = ($event.target as HTMLInputElement).checked" />
                <span>优先使用源码构建产物，而不是内嵌 exe</span>
              </label>
              <small>如果已检测到源码构建产物，OpenAgent 会优先启动源码编译生成的 `sub2api.exe`。</small>
            </label>

            <label class="config-field config-field-span">
              <span>数据目录</span>
              <div class="path-input-row">
                <input
                  class="setting-input"
                  :value="desktopDataDir"
                  placeholder="留空则使用应用数据目录/sub2api-runtime"
                  @input="desktopDataDir = ($event.target as HTMLInputElement).value"
                />
                <button class="btn btn-secondary btn-sm" @click="chooseDesktopDataDir">浏览</button>
              </div>
              <small>DATA_DIR、.installed 锁文件和桌面启动日志都会落在这里；首次运行没有 config.yaml 时会进入 setup 向导。</small>
            </label>

            <label class="config-field config-field-span">
              <span>config.yaml 路径</span>
              <input
                class="setting-input"
                :value="desktopConfigPath"
                placeholder="可留空；若已有 config.yaml，可填写完整路径"
                @input="desktopConfigPath = ($event.target as HTMLInputElement).value"
              />
              <small>如果填的是非 config.yaml 文件，启动器会在数据目录内复制成标准 config.yaml 再启动，避免参考后端读取不到配置。</small>
            </label>
          </div>

          <div class="status-strip">
            <span class="status-chip">源码状态：{{ sourceWorkflowStatusLabel }}</span>
            <span class="status-chip">工具链：{{ sourceToolchainSummary }}</span>
            <span class="status-chip">目标产物：{{ sourceBuildTargetLabel }}</span>
            <span class="status-chip">依赖状态：{{ dependencyStatusLabel }}</span>
          </div>

          <div class="hero-actions">
            <button class="btn btn-secondary btn-sm" @click="syncDesktopSource">同步源码</button>
            <button class="btn btn-secondary btn-sm" @click="buildDesktopSource">源码构建</button>
            <button class="btn btn-secondary btn-sm" @click="openDesktopSourceDir">打开源码目录</button>
          </div>

          <template v-if="desktopDependencyMode === 'docker'">
            <div class="config-grid">
              <label class="config-field">
                <span>Docker 项目名</span>
                <input
                  class="setting-input"
                  :value="desktopDockerProjectName"
                  placeholder="openagent-sub2api"
                  @input="desktopDockerProjectName = ($event.target as HTMLInputElement).value"
                />
                <small>用于隔离当前本地网关对应的容器、网络和卷命名。</small>
              </label>

              <label class="config-field config-field-span">
                <span>Docker Compose 目录</span>
                <div class="path-input-row">
                  <input
                    class="setting-input"
                    :value="desktopDockerComposeDir"
                    placeholder="留空则使用 应用数据目录/sub2api-runtime/dependencies/docker"
                    @input="desktopDockerComposeDir = ($event.target as HTMLInputElement).value"
                  />
                  <button class="btn btn-secondary btn-sm" @click="chooseDesktopComposeDir">浏览</button>
                </div>
                <small>OpenAgent 会在这里自动生成 `docker-compose.yml`，并把 PostgreSQL / Redis 的数据卷绑定到隔离目录。</small>
              </label>
            </div>

            <div class="status-strip">
              <span class="status-chip">Docker：{{ dockerToolchainSummary }}</span>
              <span class="status-chip">Compose 文件：{{ runtimeState.dependencyComposePath || '等待生成' }}</span>
            </div>

            <div class="hero-actions">
              <button class="btn btn-secondary btn-sm" @click="startDesktopDependencies">启动容器依赖</button>
              <button class="btn btn-secondary btn-sm" @click="stopDesktopDependencies">停止容器依赖</button>
            </div>
          </template>

          <div class="runtime-note-grid">
            <div class="runtime-note-card">
              <strong>源码优先建议</strong>
              <p>当前更推荐使用源码工作树而不是单独 exe。内嵌二进制只保留为兜底路径，日常维护建议走“同步源码 -> 构建 -> 启动”。</p>
            </div>
            <div class="runtime-note-card">
              <strong>依赖隔离建议</strong>
              <p>如果切到 Docker 容器依赖模式，OpenAgent 会用独立 Compose 项目启动 PostgreSQL / Redis，并把数据绑定到当前运行数据目录下，避免和系统已有数据库实例混用。</p>
            </div>
          </div>
        </details>

        <div class="desktop-setup-panel">
          <div class="desktop-runtime-head">
            <div>
              <strong>首次接入诊断</strong>
              <p>日常主要还是维护账号池、模型和 API Key；只有首次接入或更换 PostgreSQL / Redis 参数时才需要来这里。初始化按钮现在会先自动做依赖预检，不再把后端原始连接错误直接甩给你。</p>
            </div>
            <div class="hero-actions">
              <button class="btn btn-secondary btn-sm" :disabled="sub2ApiStore.runtimeBusy || setupBusy" @click="inspectDesktopSetup">
                {{ inspectSetupLabel }}
              </button>
              <button class="btn btn-secondary btn-sm" :disabled="!canTestSetupDatabase" @click="testDesktopSetupDatabase">
                {{ testSetupDatabaseLabel }}
              </button>
              <button class="btn btn-secondary btn-sm" :disabled="!canTestSetupRedis" @click="testDesktopSetupRedis">
                {{ testSetupRedisLabel }}
              </button>
              <button class="btn btn-primary btn-sm" :disabled="!canInstallSetup" @click="installDesktopSetup">
                {{ installSetupLabel }}
              </button>
            </div>
          </div>

          <div class="status-strip">
            <span class="status-chip" :class="{ 'is-accent': setupStatus.reachable }">setup 状态：{{ setupStatusLabel }}</span>
            <span class="status-chip">最近检查：{{ setupLastCheckedLabel }}</span>
            <span class="status-chip">缺失项：{{ setupFormIssues.length }} 项</span>
            <span class="status-chip" :class="setupDatabaseStatusTone">PostgreSQL：{{ setupDatabaseStatusLabel }}</span>
            <span class="status-chip" :class="setupRedisStatusTone">Redis：{{ setupRedisStatusLabel }}</span>
            <span class="status-chip">服务端：{{ setupStatus.endpoint || '等待诊断' }}</span>
          </div>

          <div v-if="setupBlockingIssue" class="inline-error">{{ setupBlockingIssue.message }}</div>
          <div v-if="setupDependencyBlockingIssue" class="inline-error">{{ setupDependencyBlockingIssue }}</div>
          <div class="inline-note">“{{ installSetupLabel }}” 会先自动测试 PostgreSQL 与 Redis；任一失败都会直接阻断安装，并把失败点转换成可操作的依赖提示。</div>

          <div class="check-list">
            <div v-for="item in setupDependencyCards" :key="item.id" class="check-item" :class="`is-${item.state}`">
              <div class="check-copy">
                <strong>{{ item.label }}</strong>
                <small>{{ item.endpoint }}</small>
              </div>
              <span>{{ item.message }}</span>
            </div>
          </div>

          <details class="advanced-fold">
            <summary>数据库 / Redis 参数与深度诊断</summary>

            <div v-if="setupFormIssues.length" class="setup-issue-grid advanced-fold-body">
              <div v-for="item in setupFormIssues" :key="item.id" class="setup-issue-card" :class="`is-${item.level}`">
                <strong>{{ item.label }}</strong>
                <p>{{ item.message }}</p>
              </div>
            </div>

            <div class="config-grid">
              <label class="config-field">
                <span>PostgreSQL 主机</span>
                <input class="setting-input" :value="setupDatabaseHost" placeholder="127.0.0.1" @input="setupDatabaseHost = ($event.target as HTMLInputElement).value" />
                <small>指向 Sub2API 使用的 PostgreSQL 实例。首次测试时若数据库不存在，setup 会尝试自动创建。</small>
              </label>

              <label class="config-field">
                <span>PostgreSQL 端口</span>
                <input class="setting-input" type="number" min="1" max="65535" :value="setupDatabasePort" @input="setupDatabasePort = Number(($event.target as HTMLInputElement).value)" />
                <small>默认 5432。建议和本机 PostgreSQL 实例保持一致。</small>
              </label>

              <label class="config-field">
                <span>PostgreSQL 用户</span>
                <input class="setting-input" :value="setupDatabaseUser" placeholder="postgres" @input="setupDatabaseUser = ($event.target as HTMLInputElement).value" />
                <small>需要有建库和建表权限，setup 才能执行迁移。</small>
              </label>

              <label class="config-field">
                <span>PostgreSQL 数据库</span>
                <input class="setting-input" :value="setupDatabaseName" placeholder="sub2api" @input="setupDatabaseName = ($event.target as HTMLInputElement).value" />
                <small>建议使用独立数据库，避免与其他业务混库。</small>
              </label>

              <label class="config-field config-field-span">
                <span>PostgreSQL 密码</span>
                <input class="setting-input" type="password" :value="setupDatabasePassword" placeholder="数据库密码" @input="setupDatabasePassword = ($event.target as HTMLInputElement).value" />
                <small>仅用于当前安装流程测试与初始化，不会同步到 Agent 配置。</small>
              </label>

              <label class="config-field">
                <span>PostgreSQL SSL 模式</span>
                <select class="setting-input" :value="setupDatabaseSslMode" @change="setupDatabaseSslMode = ($event.target as HTMLSelectElement).value as 'disable' | 'require' | 'verify-ca' | 'verify-full'">
                  <option value="disable">disable</option>
                  <option value="require">require</option>
                  <option value="verify-ca">verify-ca</option>
                  <option value="verify-full">verify-full</option>
                </select>
                <small>本地默认通常用 disable；连接云数据库时再切到更严格模式。</small>
              </label>

              <label class="config-field">
                <span>Redis 主机</span>
                <input class="setting-input" :value="setupRedisHost" placeholder="127.0.0.1" @input="setupRedisHost = ($event.target as HTMLInputElement).value" />
                <small>Sub2API 缓存、令牌和部分并发控制会依赖 Redis。</small>
              </label>

              <label class="config-field">
                <span>Redis 端口</span>
                <input class="setting-input" type="number" min="1" max="65535" :value="setupRedisPort" @input="setupRedisPort = Number(($event.target as HTMLInputElement).value)" />
                <small>默认 6379。</small>
              </label>

              <label class="config-field">
                <span>Redis DB</span>
                <input class="setting-input" type="number" min="0" max="15" :value="setupRedisDb" @input="setupRedisDb = Number(($event.target as HTMLInputElement).value)" />
                <small>仅支持 0 到 15。建议为 Sub2API 单独分配一个 DB。</small>
              </label>

              <label class="config-field config-field-span">
                <span>Redis 密码</span>
                <input class="setting-input" type="password" :value="setupRedisPassword" placeholder="无密码可留空" @input="setupRedisPassword = ($event.target as HTMLInputElement).value" />
                <small>如果 Redis 未启用认证，可以留空。</small>
              </label>

              <label class="config-field config-field-span checkbox-field">
                <span>Redis TLS</span>
                <label class="checkbox-row">
                  <input type="checkbox" :checked="setupRedisEnableTls" @change="setupRedisEnableTls = ($event.target as HTMLInputElement).checked" />
                  <span>连接 Redis 时启用 TLS</span>
                </label>
                <small>连接云 Redis 或托管 Redis 时通常需要启用 TLS。</small>
              </label>

              <label class="config-field">
                <span>管理员邮箱</span>
                <input class="setting-input" type="email" :value="setupAdminEmail" placeholder="admin@example.com" @input="setupAdminEmail = ($event.target as HTMLInputElement).value" />
                <small>安装完成后使用这个账号登录后台。</small>
              </label>

              <label class="config-field">
                <span>管理员密码</span>
                <input class="setting-input" type="password" :value="setupAdminPassword" placeholder="至少 8 位" @input="setupAdminPassword = ($event.target as HTMLInputElement).value" />
                <small>setup 接口会拒绝短密码，建议直接使用高强度密码。</small>
              </label>

              <label class="config-field config-field-span">
                <span>时区</span>
                <input class="setting-input" :value="setupTimezone" placeholder="Asia/Shanghai" @input="setupTimezone = ($event.target as HTMLInputElement).value" />
                <small>当前 setup API 本身不接收 timezone，安装完成后桌面启动器会把这里的值回写到 config.yaml，保证预览和落盘一致。</small>
              </label>
            </div>

            <div class="runtime-note-grid">
              <div class="runtime-note-card">
                <strong>预检链路</strong>
                <p>点击「{{ inspectSetupLabel }}」会先确认本地进程和 setup/status；点击「{{ installSetupLabel }}」则会继续自动测试 PostgreSQL 与 Redis，只有全部通过后才真正执行 setup/install。</p>
              </div>
              <div class="runtime-note-card">
                <strong>真实安装链路</strong>
                <p>初始化不是前端伪造成功，而是直接调用 Sub2API 原生 setup/install：验证依赖、执行迁移、创建管理员、写 config.yaml，并在完成后尝试自动同步 OpenAgent 专属 API Key。</p>
              </div>
            </div>

            <div v-if="setupDiagnostics.items.length" class="check-list">
              <div v-for="item in setupDiagnostics.items" :key="item.id" class="check-item" :class="`is-${item.level === 'info' ? 'pending' : item.level}`">
                <div class="check-copy">
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.id }}</small>
                </div>
                <span>{{ item.message }}</span>
              </div>
            </div>

            <div class="config-preview-grid">
              <div class="config-preview-block">
                <span class="config-preview-label">config.yaml 预览</span>
                <textarea class="setting-textarea config-preview-textarea" :value="setupConfigPreview" rows="18" readonly />
              </div>
            </div>
          </details>
        </div>

        <div v-if="runtimeState.logs.length" class="runtime-log-block">
          <div class="runtime-log-head">
            <strong>最近启动日志</strong>
            <button class="btn btn-secondary btn-sm" @click="copyText(runtimeLogPreviewText, '运行时日志')">复制最近日志</button>
          </div>
          <textarea class="setting-textarea config-preview-textarea runtime-log-textarea" :value="runtimeLogPreviewText" rows="8" readonly />
        </div>
      </div>

      <div class="route-grid">
        <button
          v-for="mode in modeOptions"
          :key="mode.value"
          class="route-card"
          :class="{ active: activeMode === mode.value }"
          @click="setActiveMode(mode.value)"
        >
          <span class="provider-card-tag">{{ mode.tag }}</span>
          <strong>{{ mode.title }}</strong>
          <small>{{ mode.description }}</small>
          <span class="route-pill">{{ (effectiveGatewayRoot || gatewayRoot || SUB2API_GATEWAY_PLACEHOLDER) + mode.routeSuffix }}</span>
        </button>
      </div>

      <div class="route-strip">
        <span class="route-chip">当前模板：{{ activePreset.title }}</span>
        <span class="route-chip">实际 Base URL：{{ activeBaseUrl || '未配置' }}</span>
        <span class="route-chip">当前网关：{{ effectiveGatewayRoot || '未配置' }}</span>
        <span class="route-chip is-accent">AI 当前绑定：{{ currentAiModeLabel }}</span>
      </div>
    </section>

    <section v-if="showModelsSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-ai"/></svg>
            模型目录
          </h3>
          <p class="section-desc">按当前路由读取并缓存模型目录。选中的默认模型会在同步到 Agent 时自动带上，也会被 AI 设置页直接复用。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.configured || sub2ApiStore.loadingMode === activeMode" @click="refreshActiveModels">
            {{ sub2ApiStore.loadingMode === activeMode ? '读取中...' : '刷新当前路由模型' }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="!activeModels.length" @click="applyToAI(activeMode)">用当前默认模型同步到 AI</button>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-chip">默认模型：{{ preferredModel }}</span>
        <span class="status-chip">目录状态：{{ modelStatusLabel }}</span>
        <span class="status-chip" v-if="activeCatalog.updatedAt">最近同步：{{ formatTimestamp(activeCatalog.updatedAt) }}</span>
      </div>

      <div v-if="activeCatalog.error" class="inline-error">{{ activeCatalog.error }}</div>

      <div v-if="filteredActiveModels.length" class="model-grid">
        <button
          v-for="model in filteredActiveModels"
          :key="model.id"
          class="model-card"
          :class="{ active: preferredModel === model.name }"
          @click="setPreferredModel(model.name)"
        >
          <div class="model-card-head">
            <strong>{{ model.label }}</strong>
            <span>{{ model.provider || activePreset.title }}</span>
          </div>
          <p>{{ model.description || '未提供附加说明' }}</p>
          <div class="model-tags">
            <span v-for="label in getModelCapabilityLabels(model.capabilities)" :key="`${model.id}-${label}`" class="model-tag">{{ label }}</span>
            <span v-if="getModelCapabilityLabels(model.capabilities).length === 0" class="model-tag is-muted">能力待确认</span>
          </div>
          <div class="model-tags" v-if="getModelLimitLabels(model.limits).length">
            <span v-for="label in getModelLimitLabels(model.limits)" :key="`${model.id}-${label}`" class="model-tag is-limit">{{ label }}</span>
          </div>
        </button>
      </div>
      <div v-else class="empty-state compact">
        <svg width="48" height="48"><use href="#icon-search"/></svg>
        <div class="empty-title">当前路由还没有可用模型目录</div>
        <div class="empty-desc">先确认网关根地址和 API Key，再刷新当前路由模型。</div>
      </div>
    </section>

    <section v-if="showChecksSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-refresh"/></svg>
            核心能力检查
          </h3>
          <p class="section-desc">最小化验证模型列表、当前主路由与 Responses / Codex 路径；如果服务端仍保留 legacy 兼容层，也会补充检查 /chat/completions。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" :disabled="!sub2ApiStore.adminUrl" @click="openSub2ApiAdmin">打开后台</button>
          <button class="btn btn-primary btn-sm" :disabled="!sub2ApiStore.configured || sub2ApiStore.checkingMode === activeMode" @click="runChecksForActiveMode">
            {{ sub2ApiStore.checkingMode === activeMode ? '检查中...' : '检查当前路由' }}
          </button>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-chip">{{ checksSummary }}</span>
      </div>

      <div v-if="activeChecks.length" class="check-list">
        <div v-for="item in activeChecks" :key="item.id" class="check-item" :class="`is-${item.state}`">
          <div class="check-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.endpoint }}</small>
          </div>
          <span>{{ item.message }}</span>
        </div>
      </div>
    </section>

    <section v-if="showCodexSection" class="section glass-panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">
            <svg width="18" height="18"><use href="#icon-copy"/></svg>
            Codex CLI 模板
          </h3>
          <p class="section-desc">当服务端分组已经绑定 OpenAI OAuth / Codex 登录账号时，这里直接给出可复用的 CLI 配置模板。</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" @click="copyText(codexConfigToml, 'config.toml')">复制 config.toml</button>
          <button class="btn btn-secondary btn-sm" @click="copyText(codexAuthJson, 'auth.json')">复制 auth.json</button>
        </div>
      </div>

      <div class="config-preview-grid">
        <div class="config-preview-block">
          <span class="config-preview-label">%userprofile%/.codex/config.toml</span>
          <textarea class="setting-textarea config-preview-textarea" :value="codexConfigToml" rows="12" readonly />
        </div>
        <div class="config-preview-block">
          <span class="config-preview-label">%userprofile%/.codex/auth.json</span>
          <textarea class="setting-textarea setting-textarea-sm config-preview-textarea" :value="codexAuthJson" rows="4" readonly />
        </div>
      </div>
    </section>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state glass-panel">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配的 Sub2API 设置项</div>
      <div class="empty-desc">请尝试搜索路由、模型、Codex、Responses 或网关等关键词。</div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { useSub2ApiStore } from '@/stores/sub2api'
import { getModelCapabilityLabels, getModelLimitLabels } from '@/utils/ai'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'
import {
  SUB2API_GATEWAY_PLACEHOLDER,
  SUB2API_MODE_PRESETS,
  buildSub2ApiAiPatch,
  createSub2ApiSetupConfigPreview,
  createSub2ApiCodexAuthJson,
  createSub2ApiCodexConfigToml,
  getSub2ApiPreferredModel,
  normalizeSub2ApiGatewayRoot,
  resolveSub2ApiMode,
  type Sub2ApiMode
} from '@/utils/sub2api'

const props = defineProps<{ searchQuery?: string }>()

const router = useRouter()
const aiStore = useAIStore()
const sub2ApiStore = useSub2ApiStore()
const showApiKey = ref(false)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))

const modeOptions = Object.values(SUB2API_MODE_PRESETS)
const activeMode = computed(() => sub2ApiStore.config.activeMode)
const activePreset = computed(() => SUB2API_MODE_PRESETS[activeMode.value])
const gatewayMode = computed(() => sub2ApiStore.gatewayMode)
const desktopModeEnabled = computed(() => sub2ApiStore.desktopModeEnabled)
const runtimeState = computed(() => sub2ApiStore.runtimeState)
const setupDiagnostics = computed(() => sub2ApiStore.setupDiagnostics)
const setupDependencies = computed(() => sub2ApiStore.setupDependencies)
const setupStatus = computed(() => sub2ApiStore.setupStatus)
const setupBusy = computed(() => sub2ApiStore.setupBusy)
const setupFormIssues = computed(() => sub2ApiStore.setupFormIssues)
const setupBlockingIssue = computed(() => sub2ApiStore.setupBlockingIssue)
const setupDependencyBlockingIssue = computed(() => sub2ApiStore.setupDependencyBlockingIssue)
const effectiveGatewayRoot = computed(() => sub2ApiStore.effectiveGatewayRoot)
const gatewayRoot = computed({
  get: () => sub2ApiStore.config.gatewayRoot,
  set: (value: string) => {
    void sub2ApiStore.setGatewayRoot(value)
  }
})
const apiKey = computed({
  get: () => sub2ApiStore.config.apiKey,
  set: (value: string) => {
    void sub2ApiStore.setApiKey(value)
  }
})
const desktopHost = computed({
  get: () => sub2ApiStore.config.desktopRuntime.host,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ host: value })
  }
})
const desktopPort = computed({
  get: () => sub2ApiStore.config.desktopRuntime.port,
  set: (value: number) => {
    void sub2ApiStore.setDesktopRuntime({ port: value })
  }
})
const desktopRunMode = computed({
  get: () => sub2ApiStore.config.desktopRuntime.runMode,
  set: (value: 'simple' | 'standard') => {
    void sub2ApiStore.setDesktopRuntime({ runMode: value })
  }
})
const desktopDependencyMode = computed({
  get: () => sub2ApiStore.config.desktopRuntime.dependencyMode,
  set: (value: 'external' | 'docker') => {
    void sub2ApiStore.setDesktopRuntime({ dependencyMode: value })
  }
})
const desktopDockerProjectName = computed({
  get: () => sub2ApiStore.config.desktopRuntime.dockerProjectName,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ dockerProjectName: value })
  }
})
const desktopDockerComposeDir = computed({
  get: () => sub2ApiStore.config.desktopRuntime.dockerComposeDir,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ dockerComposeDir: value })
  }
})
const desktopLogLevel = computed({
  get: () => sub2ApiStore.config.desktopRuntime.logLevel,
  set: (value: 'debug' | 'info' | 'warn' | 'error') => {
    void sub2ApiStore.setDesktopRuntime({ logLevel: value })
  }
})
const desktopBinaryPath = computed({
  get: () => sub2ApiStore.config.desktopRuntime.binaryPath,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ binaryPath: value })
  }
})
const desktopSourceDir = computed({
  get: () => sub2ApiStore.config.desktopRuntime.sourceDir,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ sourceDir: value })
  }
})
const desktopSourceRepoUrl = computed({
  get: () => sub2ApiStore.config.desktopRuntime.sourceRepoUrl,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ sourceRepoUrl: value })
  }
})
const desktopPreferSourceBuild = computed({
  get: () => sub2ApiStore.config.desktopRuntime.preferSourceBuild,
  set: (value: boolean) => {
    void sub2ApiStore.setDesktopRuntime({ preferSourceBuild: value })
  }
})
const desktopDataDir = computed({
  get: () => sub2ApiStore.config.desktopRuntime.dataDir,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ dataDir: value })
  }
})
const desktopConfigPath = computed({
  get: () => sub2ApiStore.config.desktopRuntime.configPath,
  set: (value: string) => {
    void sub2ApiStore.setDesktopRuntime({ configPath: value })
  }
})
const managedAdminEmail = computed({
  get: () => sub2ApiStore.config.desktopManaged.adminEmail,
  set: (value: string) => {
    void sub2ApiStore.setDesktopManaged({ adminEmail: value })
  }
})
const managedSharedPassword = computed({
  get: () => sub2ApiStore.config.desktopManaged.sharedPassword,
  set: (value: string) => {
    void sub2ApiStore.setDesktopManaged({ sharedPassword: value })
  }
})
const managedApiKeyName = computed({
  get: () => sub2ApiStore.config.desktopManaged.apiKeyName,
  set: (value: string) => {
    void sub2ApiStore.setDesktopManaged({ apiKeyName: value })
  }
})
const setupDatabaseHost = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.host,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ database: { host: value } })
  }
})
const setupDatabasePort = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.port,
  set: (value: number) => {
    void sub2ApiStore.setDesktopSetup({ database: { port: value } })
  }
})
const setupDatabaseUser = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.user,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ database: { user: value } })
  }
})
const setupDatabasePassword = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.password,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ database: { password: value } })
  }
})
const setupDatabaseName = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.dbname,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ database: { dbname: value } })
  }
})
const setupDatabaseSslMode = computed({
  get: () => sub2ApiStore.config.desktopSetup.database.sslmode,
  set: (value: 'disable' | 'require' | 'verify-ca' | 'verify-full') => {
    void sub2ApiStore.setDesktopSetup({ database: { sslmode: value } })
  }
})
const setupRedisHost = computed({
  get: () => sub2ApiStore.config.desktopSetup.redis.host,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ redis: { host: value } })
  }
})
const setupRedisPort = computed({
  get: () => sub2ApiStore.config.desktopSetup.redis.port,
  set: (value: number) => {
    void sub2ApiStore.setDesktopSetup({ redis: { port: value } })
  }
})
const setupRedisPassword = computed({
  get: () => sub2ApiStore.config.desktopSetup.redis.password,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ redis: { password: value } })
  }
})
const setupRedisDb = computed({
  get: () => sub2ApiStore.config.desktopSetup.redis.db,
  set: (value: number) => {
    void sub2ApiStore.setDesktopSetup({ redis: { db: value } })
  }
})
const setupRedisEnableTls = computed({
  get: () => sub2ApiStore.config.desktopSetup.redis.enableTls,
  set: (value: boolean) => {
    void sub2ApiStore.setDesktopSetup({ redis: { enableTls: value } })
  }
})
const setupAdminEmail = computed({
  get: () => sub2ApiStore.config.desktopSetup.admin.email,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ admin: { email: value } })
  }
})
const setupAdminPassword = computed({
  get: () => sub2ApiStore.config.desktopSetup.admin.password,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ admin: { password: value } })
  }
})
const setupTimezone = computed({
  get: () => sub2ApiStore.config.desktopSetup.timezone,
  set: (value: string) => {
    void sub2ApiStore.setDesktopSetup({ timezone: value })
  }
})
const desktopAutoStart = computed(() => sub2ApiStore.config.desktopRuntime.autoStart)
const activeBaseUrl = computed(() => sub2ApiStore.activeBaseUrl)
const activeCatalog = computed(() => sub2ApiStore.modelRegistry[activeMode.value])
const activeModels = computed(() => sub2ApiStore.getModelsForMode(activeMode.value))
const activeChecks = computed(() => sub2ApiStore.getChecksForMode(activeMode.value))
const preferredModel = computed(() => getSub2ApiPreferredModel(sub2ApiStore.config, activeMode.value))
const currentAiMode = computed(() => resolveSub2ApiMode(aiStore.config.connectionTemplate))
const currentAiModeLabel = computed(() => currentAiMode.value ? SUB2API_MODE_PRESETS[currentAiMode.value].title : '未绑定 Sub2API')
const syncingDesktopAccess = ref(false)
const canApplyToAI = computed(() => {
  if (!desktopModeEnabled.value) {
    return sub2ApiStore.configured
  }

  return !sub2ApiStore.runtimeBusy && runtimeState.value.status !== 'missing-binary'
})
const gatewayModeLabel = computed(() => {
  if (!desktopModeEnabled.value) {
    return '外部网关'
  }

  return '本地桌面网关'
})
const runtimeStatusLabel = computed(() => {
  switch (runtimeState.value.status) {
    case 'running':
      return runtimeState.value.healthy ? '运行中' : '已启动，等待健康检查'
    case 'starting':
      return '启动中'
    case 'stopping':
      return '停止中'
    case 'error':
      return '启动异常'
    case 'unavailable':
      return '当前模式不可用'
    case 'missing-binary':
      return '缺少二进制'
    default:
      return '未启动'
  }
})
const runtimeHealthLabel = computed(() => {
  if (runtimeState.value.healthy) {
    return '网关在线'
  }

  if (runtimeState.value.status === 'running') {
    return runtimeState.value.healthMessage || '进程已启动，等待初始化'
  }

  return runtimeState.value.healthMessage || '等待启动'
})
const runtimeLogPreviewText = computed(() => runtimeState.value.logs.slice(-12).join('\n'))
const canStopRuntime = computed(() => runtimeState.value.status === 'running' || runtimeState.value.status === 'starting')
const startRuntimeLabel = computed(() => {
  if (runtimeState.value.status !== 'missing-binary') {
    return '启动本地网关'
  }

  return desktopPreferSourceBuild.value ? '先构建源码后启动' : '补齐运行产物后启动'
})
const sourceToolchainSummary = computed(() => [
  runtimeState.value.gitAvailable ? 'Git' : 'Git 缺失',
  runtimeState.value.pnpmAvailable ? 'pnpm' : 'pnpm 缺失',
  runtimeState.value.goAvailable ? 'Go' : 'Go 缺失'
].join(' / '))
const dockerToolchainSummary = computed(() => [
  runtimeState.value.dockerAvailable ? 'Docker' : 'Docker 缺失',
  runtimeState.value.dockerComposeAvailable ? 'Compose' : 'Compose 缺失'
].join(' / '))
const sourceWorkflowStatusLabel = computed(() => {
  if (!runtimeState.value.sourceDetected) {
    return '未检测到源码工作树'
  }

  if (!runtimeState.value.sourceBinaryExists) {
    return '已检测到源码，但尚未构建'
  }

  return desktopPreferSourceBuild.value ? '源码构建产物已就绪' : '源码已就绪，但当前未设为优先'
})
const sourceBuildTargetLabel = computed(() => runtimeState.value.sourceBinaryPath || '等待解析源码构建产物路径')
const dependencyStatusLabel = computed(() => {
  if (runtimeState.value.dependencyMode !== 'docker') {
    return '外部依赖'
  }

  if (runtimeState.value.dependencyStatus === 'ready') {
    return '容器依赖已就绪'
  }

  if (runtimeState.value.dependencyStatus === 'partial') {
    return '容器依赖部分就绪'
  }

  if (runtimeState.value.dependencyStatus === 'stopped') {
    return '容器依赖未启动'
  }

  if (runtimeState.value.dependencyStatus === 'unavailable') {
    return 'Docker 不可用'
  }

  return '尚未检查'
})
const setupStatusLabel = computed(() => {
  if (!setupDiagnostics.value.checkedAt) {
    return '未检查'
  }

  if (setupStatus.value.needsSetup === true) {
    return '等待初始化'
  }

  if (setupStatus.value.needsSetup === false) {
    return '已完成初始化'
  }

  return setupStatus.value.reachable ? '已连接' : '不可达'
})
const setupLastCheckedLabel = computed(() => setupDiagnostics.value.checkedAt ? formatTimestamp(setupDiagnostics.value.checkedAt) : '未检查')
const inspectSetupLabel = computed(() => {
  if (sub2ApiStore.setupAction === 'inspect') {
    return '诊断中...'
  }

  return runtimeState.value.status === 'running' ? '刷新诊断' : '启动并诊断'
})
const testSetupDatabaseLabel = computed(() => sub2ApiStore.setupAction === 'test-db' ? '测试中...' : '测 PostgreSQL')
const testSetupRedisLabel = computed(() => sub2ApiStore.setupAction === 'test-redis' ? '测试中...' : '测 Redis')
const installSetupLabel = computed(() => sub2ApiStore.setupAction === 'install' ? '检查并初始化中...' : '检查依赖后初始化')
const canTestSetupDatabase = computed(() => Boolean(setupDatabaseHost.value.trim()) && Boolean(setupDatabaseUser.value.trim()) && Boolean(setupDatabaseName.value.trim()) && !setupBusy.value)
const canTestSetupRedis = computed(() => Boolean(setupRedisHost.value.trim()) && !setupBusy.value)
const canInstallSetup = computed(() => !setupBusy.value && !sub2ApiStore.runtimeBusy && !setupBlockingIssue.value && !setupDependencyBlockingIssue.value && setupStatus.value.needsSetup !== false)
const setupConfigPreview = computed(() => createSub2ApiSetupConfigPreview(sub2ApiStore.config.desktopRuntime, sub2ApiStore.config.desktopSetup))
const setupDatabaseStatusLabel = computed(() => {
  if (setupDependencies.value.database.success === true) {
    return '已通过'
  }

  if (setupDependencies.value.database.success === false) {
    return '未通过'
  }

  return '待检查'
})
const setupRedisStatusLabel = computed(() => {
  if (setupDependencies.value.redis.success === true) {
    return '已通过'
  }

  if (setupDependencies.value.redis.success === false) {
    return '未通过'
  }

  return '待检查'
})
const setupDatabaseStatusTone = computed(() => setupDependencies.value.database.success === true
  ? 'is-accent'
  : setupDependencies.value.database.success === false
    ? 'is-error'
    : 'is-warning')
const setupRedisStatusTone = computed(() => setupDependencies.value.redis.success === true
  ? 'is-accent'
  : setupDependencies.value.redis.success === false
    ? 'is-error'
    : 'is-warning')
const setupDependencyCards = computed(() => {
  const databaseMessage = setupDependencies.value.database.checkedAt
    ? setupDependencies.value.database.details || setupDependencies.value.database.message
    : '还没有执行连接测试。点击“测 PostgreSQL”或“检查依赖后初始化”时会自动补跑。'
  const redisMessage = setupDependencies.value.redis.checkedAt
    ? setupDependencies.value.redis.details || setupDependencies.value.redis.message
    : '还没有执行连接测试。点击“测 Redis”或“检查依赖后初始化”时会自动补跑。'

  return [
    {
      id: 'database',
      label: 'PostgreSQL 依赖',
      endpoint: `${setupDatabaseHost.value}:${setupDatabasePort.value}/${setupDatabaseName.value || 'sub2api'}`,
      state: setupDependencies.value.database.success === true ? 'success' : setupDependencies.value.database.success === false ? 'error' : 'pending',
      message: databaseMessage
    },
    {
      id: 'redis',
      label: 'Redis 依赖',
      endpoint: `${setupRedisHost.value}:${setupRedisPort.value}/db${setupRedisDb.value}`,
      state: setupDependencies.value.redis.success === true ? 'success' : setupDependencies.value.redis.success === false ? 'error' : 'pending',
      message: redisMessage
    }
  ]
})
const managedApiKeyStatusLabel = computed(() => {
  if (sub2ApiStore.config.apiKey.trim()) {
    return '已同步到工作台'
  }

  if (runtimeState.value.managedApiKeyDetected) {
    return '已识别，等待同步'
  }

  return setupStatus.value.needsSetup === false ? '等待识别' : '完成初始化后可自动识别'
})
const modelStatusLabel = computed(() => {
  if (sub2ApiStore.loadingMode === activeMode.value) {
    return '模型目录同步中'
  }

  if (activeCatalog.value.error) {
    return '上次同步失败'
  }

  if (activeModels.value.length > 0) {
    return `已缓存 ${activeModels.value.length} 个模型`
  }

  return '尚未读取模型目录'
})
const checksSummary = computed(() => {
  if (sub2ApiStore.checkingMode === activeMode.value) {
    return '检查中，会验证模型列表、当前主路由和 Responses / Codex 能力。'
  }

  if (activeChecks.value.length === 0) {
    return '尚未执行检查。建议在调整 API Key、网关地址或路由后主动检查一次。'
  }

  const successCount = activeChecks.value.filter(item => item.state === 'success').length
  const failureCount = activeChecks.value.filter(item => item.state === 'error').length
  return `已完成 ${activeChecks.value.length} 项检查：成功 ${successCount} 项，失败 ${failureCount} 项。`
})
const totalCachedModelCount = computed(() => modeOptions.reduce((count, mode) => count + sub2ApiStore.getModelsForMode(mode.value).length, 0))
const runtimeLogLineCount = computed(() => runtimeState.value.logs.length)
const activeCheckSuccessCount = computed(() => activeChecks.value.filter(item => item.state === 'success').length)
const activeCheckFailureCount = computed(() => activeChecks.value.filter(item => item.state === 'error').length)
const activeCheckSummaryLabel = computed(() => {
  if (activeChecks.value.length === 0) {
    return '未检查'
  }

  return `${activeCheckSuccessCount.value}/${activeChecks.value.length} 通过`
})
const runtimeUptimeLabel = computed(() => {
  if (!runtimeState.value.startedAt) {
    return '未启动'
  }

  return formatDuration(Date.now() - runtimeState.value.startedAt)
})
const desktopFlowSummary = computed(() => {
  if (desktopPreferSourceBuild.value && runtimeState.value.sourceDetected && !runtimeState.value.sourceBinaryExists) {
    return `当前已切到源码优先模式，但源码产物还没有生成。建议先同步源码并构建；当前工具链状态：${sourceToolchainSummary.value}。`
  }

  if (runtimeState.value.status === 'missing-binary') {
    return '当前没有可运行的本地网关。优先建议切到源码工作树模式：拉取 Sub2API 源码、构建后端产物，再由 OpenAgent 直接托管。'
  }

  if (runtimeState.value.status === 'running' && sub2ApiStore.config.apiKey.trim()) {
    return '本地桌面网关已经启动，OpenAgent 专属 API Key 也已同步完成。接下来可以直接进入内嵌后台维护账号池，然后刷新模型目录并同步到 Agent。'
  }

  if (setupStatus.value.needsSetup === false) {
    return '本地网关已经完成初始化。接下来只需要进入后台登录、维护账号池，再回到这里刷新支持模型并同步到 Agent。'
  }

  return 'OpenAgent 已默认帮你准备本地网关地址、管理员账号和自动接入参数。首次只需要启动本地网关，打开后台完成初始化、登录与账号池接入。'
})
const desktopNextActionLabel = computed(() => {
  if (runtimeState.value.status === 'missing-binary') {
    return '下一步：先补齐或重新指定 Sub2API 二进制，然后再次启动本地网关。'
  }

  if (!sub2ApiStore.config.apiKey.trim()) {
    return '下一步：完成初始化后点击“同步本地专属 Key”，然后就能把本地网关一键同步到 Agent。'
  }

  if (setupStatus.value.needsSetup !== false) {
    return '下一步：先启动本地网关并打开后台，完成初始化后再登录并加入账号池。'
  }

  if (activeModels.value.length === 0) {
    return '下一步：账号池就绪后刷新模型目录，OpenAgent 会缓存当前路由返回的支持模型。'
  }

  if (currentAiMode.value === null) {
    return '下一步：点击“同步到 Agent”，把当前 Sub2API 路由和默认模型一键带入 AI 设置。'
  }

  return '当前本地网关、模型目录和 AI 绑定已经就绪，可以直接开始使用。'
})
const codexConfigToml = computed(() => createSub2ApiCodexConfigToml(sub2ApiStore.config, getSub2ApiPreferredModel(sub2ApiStore.config, 'openai'), sub2ApiStore.runtimeState))
const codexAuthJson = computed(() => createSub2ApiCodexAuthJson(sub2ApiStore.config.apiKey || aiStore.config.apiKey))
const filteredActiveModels = computed(() => activeModels.value.filter(model => matchesSearchQuery(
  normalizedSearchQuery.value,
  model.id,
  model.name,
  model.label,
  model.description,
  model.provider,
  getModelCapabilityLabels(model.capabilities),
  getModelLimitLabels(model.limits)
)))

const showHeroSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'Sub2API',
  '工作台',
  '网关',
  'Codex',
  'Responses',
  activePreset.value.title,
  currentAiModeLabel.value
))
const showConfigSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '网关',
  '本地网关',
  'desktop',
  '初始化',
  'PostgreSQL',
  'Redis',
  'setup',
  '诊断',
  'binary',
  'config.yaml',
  'DATA_DIR',
  'OpenAgentnh',
  '管理员',
  '专属 Key',
  'API Key',
  '路由',
  'Claude',
  'OpenAI',
  'Gemini',
  'Antigravity',
  sub2ApiStore.config,
  activeBaseUrl.value
))
const showModelsSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '模型',
  '目录',
  preferredModel.value,
  activeModels.value
))
const showChecksSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '检查',
  'Responses',
  'Codex',
  '能力',
  activeChecks.value
))
const showCodexSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'Codex',
  'config.toml',
  'auth.json',
  codexConfigToml.value,
  codexAuthJson.value
))
const hasVisibleSection = computed(() => [
  showHeroSection.value,
  showConfigSection.value,
  showModelsSection.value,
  showChecksSection.value,
  showCodexSection.value
].some(Boolean))

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(Math.floor(durationMs / 1000), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`
  }

  if (minutes > 0) {
    return `${minutes} 分钟`
  }

  return `${Math.max(totalSeconds, 1)} 秒`
}

async function setActiveMode(mode: Sub2ApiMode) {
  await sub2ApiStore.setActiveMode(mode)
}

async function setGatewayMode(mode: 'desktop' | 'external') {
  await sub2ApiStore.setGatewayMode(mode)
  showToast('success', mode === 'desktop' ? '已切换到本地桌面网关模式' : '已切换到外部网关模式')
}

async function setPreferredModel(modelName: string) {
  await sub2ApiStore.setPreferredModel(activeMode.value, modelName)
  showToast('success', `已将 ${modelName} 设为 ${activePreset.value.title} 默认模型`)
}

async function chooseDesktopBinary() {
  const filePath = await sub2ApiStore.chooseBinary(desktopBinaryPath.value || runtimeState.value.resolvedBinaryPath)
  if (!filePath) {
    return
  }

  await sub2ApiStore.setDesktopRuntime({ binaryPath: filePath })
  showToast('success', '已更新 Sub2API 二进制路径')
}

async function chooseDesktopDataDir() {
  if (!window.electronAPI?.chooseDirectory) {
    showToast('error', '当前环境不支持目录选择')
    return
  }

  const selectedPath = await window.electronAPI.chooseDirectory('选择 Sub2API 数据目录', desktopDataDir.value || runtimeState.value.resolvedDataDir || undefined)
  if (!selectedPath) {
    return
  }

  await sub2ApiStore.setDesktopRuntime({ dataDir: selectedPath })
  showToast('success', '已更新 Sub2API 数据目录')
}

async function chooseDesktopSourceDir() {
  if (!window.electronAPI?.chooseDirectory) {
    showToast('error', '当前环境不支持目录选择')
    return
  }

  const selectedPath = await window.electronAPI.chooseDirectory('选择 Sub2API 源码目录', desktopSourceDir.value || runtimeState.value.sourceDir || undefined)
  if (!selectedPath) {
    return
  }

  await sub2ApiStore.setDesktopRuntime({ sourceDir: selectedPath })
  await sub2ApiStore.refreshRuntimeState()
  showToast('success', '已更新 Sub2API 源码目录')
}

async function syncDesktopSource() {
  try {
    const result = await sub2ApiStore.syncDesktopSource()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '拉取 Sub2API 源码失败')
  }
}

async function buildDesktopSource() {
  try {
    const result = await sub2ApiStore.buildDesktopSource()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '构建 Sub2API 源码失败')
  }
}

async function openDesktopSourceDir() {
  const targetPath = desktopSourceDir.value || runtimeState.value.sourceDir
  if (!targetPath) {
    showToast('error', '当前还没有配置源码目录')
    return
  }

  const opened = await window.electronAPI?.openPath?.(targetPath)
  if (!opened) {
    showToast('error', '打开源码目录失败')
  }
}

async function chooseDesktopComposeDir() {
  if (!window.electronAPI?.chooseDirectory) {
    showToast('error', '当前环境不支持目录选择')
    return
  }

  const selectedPath = await window.electronAPI.chooseDirectory('选择 Docker Compose 目录', desktopDockerComposeDir.value || runtimeState.value.dependencyComposePath || undefined)
  if (!selectedPath) {
    return
  }

  await sub2ApiStore.setDesktopRuntime({ dockerComposeDir: selectedPath })
  await sub2ApiStore.refreshRuntimeState()
  showToast('success', '已更新容器依赖目录')
}

async function startDesktopDependencies() {
  try {
    const result = await sub2ApiStore.startDesktopDependencies()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '启动容器依赖失败')
  }
}

async function stopDesktopDependencies() {
  try {
    const result = await sub2ApiStore.stopDesktopDependencies()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '停止容器依赖失败')
  }
}

async function toggleDesktopAutoStart() {
  await sub2ApiStore.setDesktopRuntime({ autoStart: !desktopAutoStart.value })
  showToast('success', desktopAutoStart.value ? '已启用 Sub2API 桌面网关自启动' : '已关闭 Sub2API 桌面网关自启动')
}

async function syncDesktopRuntimeContext() {
  try {
    const diagnostics = await sub2ApiStore.inspectDesktopSetup()
    if (diagnostics.status.reachable && diagnostics.status.needsSetup === false && !sub2ApiStore.config.apiKey.trim()) {
      try {
        await sub2ApiStore.ensureDesktopAccess()
      } catch {
        // 初始化未完成或后台尚未准备好时，保持诊断结果即可，不阻断启动流程。
      }
    }

    if (sub2ApiStore.configured) {
      try {
        await sub2ApiStore.refreshModels(activeMode.value)
      } catch {
        // 模型目录读取失败不阻断启动，只保留运行时和诊断状态。
      }
    }
  } catch {
    // 启动成功但后台尚未返回 setup 诊断时，不阻断主流程。
  }
}

async function startDesktopRuntime() {
  try {
    await sub2ApiStore.startDesktopRuntime()
    await syncDesktopRuntimeContext()
    showToast(runtimeState.value.healthy ? 'success' : 'info', runtimeState.value.healthy ? '本地 Sub2API 网关已启动' : runtimeState.value.healthMessage || '本地网关进程已启动')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关启动失败')
  }
}

async function stopDesktopRuntime() {
  try {
    await sub2ApiStore.stopDesktopRuntime()
    showToast('success', '本地 Sub2API 网关已停止')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关停止失败')
  }
}

async function restartDesktopRuntime() {
  try {
    await sub2ApiStore.restartDesktopRuntime()
    await syncDesktopRuntimeContext()
    showToast(runtimeState.value.healthy ? 'success' : 'info', runtimeState.value.healthy ? '本地 Sub2API 网关已重启' : runtimeState.value.healthMessage || '本地网关已重启')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '本地网关重启失败')
  }
}

async function inspectDesktopSetup() {
  try {
    if (runtimeState.value.status !== 'running' && !sub2ApiStore.runtimeBusy) {
      await sub2ApiStore.startDesktopRuntime()
    }

    const diagnostics = await sub2ApiStore.inspectDesktopSetup()
    showToast(diagnostics.status.reachable ? 'success' : 'info', diagnostics.status.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '初始化诊断失败')
  }
}

async function testDesktopSetupDatabase() {
  try {
    const result = await sub2ApiStore.testDesktopSetupDatabase()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'PostgreSQL 测试失败')
  }
}

async function testDesktopSetupRedis() {
  try {
    const result = await sub2ApiStore.testDesktopSetupRedis()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Redis 测试失败')
  }
}

async function installDesktopSetup() {
  try {
    const result = await sub2ApiStore.installDesktopSetup()
    showToast(result.success ? 'success' : 'error', result.details || result.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Sub2API 初始化失败')
  }
}

async function syncDesktopAccess() {
  syncingDesktopAccess.value = true

  try {
    if (runtimeState.value.status !== 'running' && !sub2ApiStore.runtimeBusy) {
      await sub2ApiStore.startDesktopRuntime()
    }

    const access = await sub2ApiStore.ensureDesktopAccess()
    showToast('success', access.message)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '同步本地专属 Key 失败')
  } finally {
    syncingDesktopAccess.value = false
  }
}

function ensureDesktopRuntimeReady(actionLabel: string) {
  if (!desktopModeEnabled.value) {
    return true
  }

  if (runtimeState.value.status === 'running') {
    return true
  }

  if (runtimeState.value.status === 'missing-binary' || runtimeState.value.status === 'error' || runtimeState.value.status === 'unavailable') {
    showToast('error', runtimeState.value.healthMessage || '当前本地网关不可用')
    return false
  }

  showToast('error', `当前处于本地桌面模式，请先启动本地网关后再${actionLabel}`)
  return false
}

async function applyToAI(mode = activeMode.value) {
  if (desktopModeEnabled.value && !sub2ApiStore.config.apiKey.trim()) {
    try {
      if (runtimeState.value.status !== 'running' && !sub2ApiStore.runtimeBusy) {
        await sub2ApiStore.startDesktopRuntime()
      }

      await sub2ApiStore.ensureDesktopAccess()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '同步本地专属 Key 失败')
      return
    }
  }

  if (!sub2ApiStore.configured) {
    showToast('error', desktopModeEnabled.value ? '请先完成 API Key 配置，必要时补齐本地二进制并启动网关' : '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  await aiStore.updateConfig(buildSub2ApiAiPatch(sub2ApiStore.config, mode, sub2ApiStore.runtimeState))
  showToast('success', `已把 ${SUB2API_MODE_PRESETS[mode].title} 同步到 Agent`)
}

async function refreshActiveModels() {
  if (!sub2ApiStore.configured) {
    showToast('error', desktopModeEnabled.value ? '请先完成 API Key 配置，并确保本地网关已经启动' : '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  if (!ensureDesktopRuntimeReady('读取模型目录')) {
    return
  }

  try {
    const models = await sub2ApiStore.refreshModels(activeMode.value)
    if (models.length > 0) {
      showToast('success', `已读取 ${models.length} 个模型`)
      return
    }

    showToast('info', '接口可访问，但当前路由没有返回模型目录')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '读取模型目录失败')
  }
}

async function runChecksForActiveMode() {
  if (!sub2ApiStore.configured) {
    showToast('error', desktopModeEnabled.value ? '请先完成 API Key 配置，并确保本地网关已经启动' : '请先完成 Sub2API 网关根地址和 API Key 配置')
    return
  }

  if (!ensureDesktopRuntimeReady('执行核心能力检查')) {
    return
  }

  try {
    const items = await sub2ApiStore.runChecks(activeMode.value)
    const hasError = items.some(item => item.state === 'error')
    showToast(hasError ? 'error' : 'success', hasError ? 'Sub2API 核心能力检查完成，存在失败项' : 'Sub2API 核心能力检查通过')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : 'Sub2API 核心能力检查失败')
  }
}

function openSub2ApiAdmin() {
  if (!sub2ApiStore.adminUrl) {
    showToast('error', desktopModeEnabled.value ? '请先完成本地网关参数配置' : '请先填写 Sub2API 网关根地址')
    return
  }

  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(sub2ApiStore.adminUrl)
    return
  }

  window.open(sub2ApiStore.adminUrl, '_blank', 'noopener,noreferrer')
}

function openAISettingsPage() {
  void router.push('/ai-settings')
}

function openSub2ApiConsolePage() {
  void router.push('/sub2api-console')
}

onMounted(() => {
  if (desktopModeEnabled.value) {
    void sub2ApiStore.inspectDesktopSetup().catch(() => undefined)
  }

  if (desktopModeEnabled.value && runtimeState.value.status === 'running' && !sub2ApiStore.config.apiKey.trim()) {
    void sub2ApiStore.ensureDesktopAccess().catch(() => undefined)
  }
})

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('success', `${label} 已复制`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : `${label} 复制失败`)
  }
}
</script>

<style lang="scss" scoped>
.sub2api-page {
  --sub2api-accent: color-mix(in srgb, var(--primary) 78%, #f59e0b 22%);
  --sub2api-accent-soft: color-mix(in srgb, var(--primary) 12%, rgba(255, 255, 255, 0.72));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 18px;
}

.sub2api-scroll {
  display: grid;
  gap: 18px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.page-hero,
.section {
  padding: 20px;
}

.page-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.hero-copy {
  display: grid;
  gap: 10px;

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
    max-width: 720px;
  }
}

.hero-tag {
  display: inline-flex;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sub2api-accent) 14%, rgba(255, 255, 255, 0.7));
  color: color-mix(in srgb, var(--sub2api-accent) 82%, #4b5563 18%);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: min(100%, 420px);
}

.hero-metric {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 12%, rgba(255, 255, 255, 0.52));
  background: rgba(255, 255, 255, 0.62);

  span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  strong {
    color: var(--text-primary);
    font-size: 15px;
  }
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
}

.section-desc {
  margin: 8px 0 0;
  color: var(--text-secondary);
  line-height: 1.8;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.mode-switch-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.mode-switch-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(18, 85, 92, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.68);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.28);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: linear-gradient(135deg, rgba(255, 249, 234, 0.85), rgba(222, 243, 236, 0.82));
  }
}

.config-field {
  display: grid;
  gap: 8px;

  span {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.config-field-span {
  grid-column: 1 / -1;
}

.checkbox-field {
  gap: 10px;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-primary);

  input {
    width: 16px;
    height: 16px;
    accent-color: #12555c;
  }

  span {
    font-size: 14px;
    font-weight: 500;
  }
}

.setting-input,
.setting-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus {
    outline: none;
    border-color: rgba(18, 85, 92, 0.35);
    box-shadow: 0 0 0 3px rgba(18, 85, 92, 0.1);
  }
}

.setting-input {
  min-height: 42px;
  padding: 0 14px;
}

.setting-textarea {
  min-height: 140px;
  padding: 12px 14px;
  resize: vertical;
}

.setting-textarea-sm {
  min-height: 96px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.toggle-visibility-btn {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    background: rgba(18, 85, 92, 0.08);
    color: var(--text-primary);
  }
}

.input-wrap .setting-input {
  padding-right: 42px;
}

.path-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.desktop-runtime-panel {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: linear-gradient(135deg, rgba(255, 249, 239, 0.76), rgba(241, 249, 246, 0.78));
}

.workflow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 12px;
  margin-top: 16px;
}

.workflow-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.12);
  background: rgba(255, 255, 255, 0.66);

  strong {
    color: var(--text-primary);
    font-size: 15px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
  }
}

.workflow-card-emphasis {
  background: linear-gradient(135deg, rgba(255, 249, 234, 0.88), rgba(222, 243, 236, 0.84));
}

.workflow-step-list {
  display: grid;
  gap: 10px;
}

.workflow-step-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: rgba(18, 85, 92, 0.12);
    color: #12555c;
    font-size: 12px;
    font-weight: 700;
  }

  strong {
    display: block;
    font-size: 14px;
  }

  small {
    display: block;
    margin-top: 4px;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.workflow-footnote {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.workflow-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workflow-metric-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: rgba(255, 255, 255, 0.8);

  span {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  strong {
    font-size: 16px;
  }
}

.desktop-setup-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.12);
  background: rgba(255, 255, 255, 0.58);
}

.desktop-runtime-head,
.runtime-log-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  strong {
    color: var(--text-primary);
    font-size: 15px;
  }

  p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.runtime-note-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.advanced-fold {
  display: grid;
  gap: 14px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 12%, rgba(255, 255, 255, 0.48));
  background: rgba(255, 255, 255, 0.56);

  summary {
    cursor: pointer;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::after {
    content: '展开';
    margin-left: 10px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
  }

  &[open] summary::after {
    content: '收起';
  }
}

.advanced-fold-body {
  margin-top: 4px;
}

.setup-issue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.setup-issue-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 12%, rgba(255, 255, 255, 0.48));
  background: rgba(255, 255, 255, 0.72);

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
    font-size: 12px;
  }

  &.is-error {
    border-color: rgba(180, 35, 24, 0.16);
    background: rgba(254, 243, 242, 0.92);
  }

  &.is-warning {
    border-color: rgba(176, 107, 10, 0.16);
    background: rgba(255, 247, 237, 0.9);
  }
}

.runtime-note-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 12%, rgba(255, 255, 255, 0.48));
  background: rgba(255, 255, 255, 0.68);

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.runtime-log-block {
  display: grid;
  gap: 10px;
}

.runtime-log-textarea {
  min-height: 180px;
}

.status-chip-button {
  border: none;
  cursor: pointer;
}

.route-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.route-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 16%, rgba(255, 255, 255, 0.48));
  background: rgba(255, 255, 255, 0.62);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--sub2api-accent) 32%, rgba(255, 255, 255, 0.36));
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: color-mix(in srgb, var(--sub2api-accent) 34%, rgba(255, 255, 255, 0.34));
    background: linear-gradient(135deg, color-mix(in srgb, var(--sub2api-accent) 10%, rgba(255, 249, 234, 0.92)), rgba(255, 255, 255, 0.84));
  }
}

.provider-card-tag,
.route-pill,
.route-chip,
.status-chip,
.model-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.provider-card-tag,
.route-pill {
  background: color-mix(in srgb, var(--sub2api-accent) 10%, rgba(255, 255, 255, 0.72));
  color: color-mix(in srgb, var(--sub2api-accent) 84%, #4b5563 16%);
}

.route-pill {
  max-width: 100%;
  word-break: break-all;
}

.route-strip,
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.route-chip,
.status-chip {
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-secondary);
  border: 1px solid color-mix(in srgb, var(--sub2api-accent) 10%, rgba(255, 255, 255, 0.46));

  &.is-accent {
    color: color-mix(in srgb, var(--sub2api-accent) 84%, #4b5563 16%);
    background: color-mix(in srgb, var(--sub2api-accent) 12%, rgba(255, 255, 255, 0.86));
  }

  &.is-warning {
    color: #9a3412;
    background: rgba(255, 247, 237, 0.9);
    border-color: rgba(176, 107, 10, 0.16);
  }

  &.is-error {
    color: #b42318;
    background: rgba(254, 243, 242, 0.92);
    border-color: rgba(180, 35, 24, 0.16);
  }
}

.inline-error {
  margin-top: 12px;
  color: #b42318;
  font-size: 12px;
  line-height: 1.7;
}

.inline-note {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.model-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(18, 85, 92, 0.12);
  background: rgba(255, 255, 255, 0.62);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 85, 92, 0.24);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(18, 85, 92, 0.28);
    background: linear-gradient(135deg, rgba(255, 250, 240, 0.88), rgba(226, 246, 240, 0.88));
  }
}

.model-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
  }
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.model-tag {
  background: rgba(93, 135, 255, 0.1);
  color: #2d4f99;

  &.is-muted {
    background: rgba(180, 180, 180, 0.14);
    color: var(--text-secondary);
  }

  &.is-limit {
    background: rgba(255, 174, 113, 0.16);
    color: #9a3412;
  }
}

.check-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(18, 85, 92, 0.1);
  background: rgba(255, 255, 255, 0.78);

  span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
    text-align: right;
  }

  &.is-success {
    border-color: rgba(18, 120, 96, 0.18);
    background: rgba(228, 248, 239, 0.88);
  }

  &.is-error {
    border-color: rgba(180, 35, 24, 0.16);
    background: rgba(254, 243, 242, 0.92);
  }

  &.is-warning {
    border-color: rgba(176, 107, 10, 0.16);
    background: rgba(255, 247, 237, 0.9);
  }

  &.is-pending {
    border-color: rgba(18, 85, 92, 0.14);
    background: rgba(243, 248, 251, 0.92);
  }
}

.check-copy {
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: 13px;
  }

  small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.6;
    word-break: break-all;
  }
}

.config-preview-grid {
  display: grid;
  gap: 12px;
}

.config-preview-block {
  display: grid;
  gap: 6px;
}

.config-preview-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.config-preview-textarea {
  font-family: 'Consolas', 'Cascadia Mono', 'SFMono-Regular', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;
}

.empty-state.compact {
  padding: 28px 18px;
}

.empty-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.empty-desc {
  color: var(--text-secondary);
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .hero-metrics,
  .workflow-grid,
  .workflow-metrics-grid,
  .config-grid,
  .mode-switch-row,
  .route-grid,
  .runtime-note-grid,
  .setup-issue-grid,
  .model-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-hero,
  .section-head,
  .desktop-runtime-head,
  .runtime-log-head,
  .check-item {
    flex-direction: column;
    align-items: stretch;
  }

  .workflow-step-item {
    grid-template-columns: 1fr;
  }

  .path-input-row {
    grid-template-columns: 1fr;
  }
}
</style>
