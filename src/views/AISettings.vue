<template>
  <div class="ai-settings-page">
    <section v-if="showOverviewSection" class="page-hero glass-panel">
      <div class="hero-copy">
        <h2 class="page-title">AI 设置</h2>
        <p>统一管理模型连接、上下文策略、Windows MCP 开关，以及托管 MCP 与 skills 的扩展能力。</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary btn-sm" @click="openAIAssistantPage">打开 AI 助手</button>
        <button class="btn btn-secondary btn-sm" @click="openGeneralSettingsPage">返回通用设置</button>
      </div>
    </section>

    <section v-if="showRuntimeSection" class="ai-settings-section glass-panel">
      <div class="section-heading">
        <div>
          <h3>模型与连接</h3>
          <p>这里负责 AI 提供商、模型、提示词和 Windows MCP 等所有运行参数。</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">当前协议</span>
          <strong>{{ aiProviderTitle }}</strong>
          <small>{{ aiConnectionHint }}</small>
        </div>
        <div class="summary-card">
          <span class="summary-label">长期记忆</span>
          <strong>{{ aiMemorySummary }}</strong>
          <small>长期记忆会自动注入系统提示词，帮助弱模型保持稳定输出。</small>
        </div>
        <div class="summary-card">
          <span class="summary-label">Windows MCP</span>
          <strong>{{ settings.windowsMcpEnabled ? '已启用' : '已关闭' }}</strong>
          <small>关闭后，AI 将失去桌面读屏、窗口聚焦、键盘输入等系统级工具。</small>
        </div>
        <div class="summary-card">
          <span class="summary-label">语音联动</span>
          <strong>{{ ttsSummaryTitle }}</strong>
          <small>{{ ttsSummaryHint }}</small>
        </div>
      </div>

      <div class="ai-provider-grid">
        <button
          v-for="option in aiProtocolOptions"
          :key="option.value"
          class="ai-provider-card"
          :class="{ active: aiConfig.protocol === option.value }"
          @click="updateAIProtocol(option.value)"
        >
          <span class="provider-card-tag">{{ option.tag }}</span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.description }}</small>
        </button>
      </div>

      <div class="ai-runtime-banner">
        <div class="ai-runtime-copy">
          <strong>{{ aiProviderTitle }}</strong>
          <p>{{ aiProtocolDescription }}</p>
          <small>{{ aiConnectionHint }}</small>
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary btn-sm" @click="applyOfficialPreset">恢复当前协议官方默认</button>
          <button class="btn btn-primary btn-sm" :disabled="savingAIConfig" @click="saveAIConfigNow">
            {{ savingAIConfig ? '保存中...' : '立即保存 AI 配置' }}
          </button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">Windows MCP 系统控制</div>
          <div class="label-desc">桌面版内置读屏、窗口聚焦、鼠标点击、键盘输入和安全命令执行能力；关闭后模型将不再拿到这些系统级工具。</div>
        </div>
        <div class="ai-toggle-group">
          <span class="ai-inline-status" :class="{ 'is-enabled': settings.windowsMcpEnabled, 'is-disabled': !settings.windowsMcpEnabled }">
            {{ settings.windowsMcpEnabled ? '已启用' : '已关闭' }}
          </span>
          <label class="switch">
            <input type="checkbox" :checked="settings.windowsMcpEnabled" @change="toggleWindowsMcpEnabled" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">API Key / Token</div>
          <div class="label-desc">{{ aiApiKeyDescription }}</div>
        </div>
        <div class="input-wrap">
          <input
            :type="showApiKey ? 'text' : 'password'"
            class="setting-input"
            :value="aiConfig.apiKey"
            placeholder="sk-..."
            @change="updateAIConfig('apiKey', ($event.target as HTMLInputElement).value)"
          />
          <button class="toggle-visibility-btn" :title="showApiKey ? '隐藏' : '显示'" @click="showApiKey = !showApiKey">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="showApiKey" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle v-if="showApiKey" cx="12" cy="12" r="3"/>
              <path v-if="!showApiKey" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line v-if="!showApiKey" x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">Base URL</div>
          <div class="label-desc">{{ aiBaseUrlDescription }}</div>
        </div>
        <div class="ai-input-stack">
          <input class="setting-input" :value="aiConfig.baseUrl" :placeholder="aiBaseUrlPlaceholder" @change="updateAIConfig('baseUrl', ($event.target as HTMLInputElement).value)" />
          <span class="field-tip">{{ aiBaseUrlHint }}</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">模型名称</div>
          <div class="label-desc">{{ aiModelDescription }}</div>
        </div>
        <div class="ai-model-stack">
          <div class="ai-model-actions">
            <select class="setting-select" :value="aiConfig.model" @change="updateAIConfig('model', ($event.target as HTMLSelectElement).value)">
              <option value="">{{ aiModelSelectPlaceholder }}</option>
              <option v-for="model in availableAiModels" :key="model.id" :value="model.name">
                {{ model.label }}{{ model.description ? ` · ${model.description}` : '' }}
              </option>
            </select>
            <button class="btn btn-secondary btn-sm" :disabled="loadingAiModels || !canFetchAIModels" @click="refreshAIModels">
              {{ loadingAiModels ? '读取中...' : '读取模型' }}
            </button>
            <button class="btn btn-primary btn-sm" :disabled="savingAIConfig || !aiConfig.model.trim()" @click="saveAIConfigNow">
              {{ savingAIConfig ? '保存中...' : '保存模型' }}
            </button>
          </div>
          <input class="setting-input" :value="aiConfig.model" :placeholder="aiModelPlaceholder" @change="updateAIConfig('model', ($event.target as HTMLInputElement).value)" />
          <span v-if="aiModelStatusMessage" class="field-tip">{{ aiModelStatusMessage }}</span>
          <span v-if="aiModelLoadError" class="field-tip field-tip-error">{{ aiModelLoadError }}</span>
          <div v-if="selectedAiModelMeta" class="ai-capability-panel">
            <div class="ai-capability-header">
              <strong>{{ selectedAiModelMeta.label }}</strong>
              <span>{{ selectedAiModelMeta.provider || aiProviderTitle }}</span>
            </div>
            <div class="ai-capability-tags">
              <span v-for="label in selectedAiModelCapabilityLabels" :key="label" class="ai-capability-tag">{{ label }}</span>
              <span v-if="selectedAiModelCapabilityLabels.length === 0" class="ai-capability-tag is-muted">能力待确认</span>
            </div>
            <div v-if="selectedAiModelLimitLabels.length" class="ai-capability-tags">
              <span v-for="label in selectedAiModelLimitLabels" :key="label" class="ai-capability-tag is-limit">{{ label }}</span>
            </div>
            <span class="field-tip">模型能力会直接影响图片发送、思考模式、任务规划、自检回路和 MCP 电脑控制的可用体验。</span>
          </div>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">Temperature</div>
          <div class="label-desc">控制回复的创造性，越低越稳定，越高越发散。</div>
        </div>
        <div class="range-wrap">
          <input type="range" min="0" max="1" step="0.1" :value="aiConfig.temperature" @input="updateAIConfig('temperature', parseFloat(($event.target as HTMLInputElement).value))" />
          <span class="range-val">{{ aiConfig.temperature.toFixed(1) }}</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">上下文窗口</div>
          <div class="label-desc">接近上限时，系统会触发自动压缩和记忆提炼，避免长任务把模型拖垮。</div>
        </div>
        <div class="ai-token-stack">
          <input
            type="number"
            class="setting-input setting-input-sm"
            :value="aiConfig.contextWindow"
            min="4096"
            :max="selectedAiModelLimits.maxContextTokens"
            step="1024"
            @change="handleContextWindowChange(($event.target as HTMLInputElement).value)"
          />
          <span class="field-tip">当前选择 {{ formatTokenCount(resolvedTokenLimits.selectedContextTokens) }}，模型上限 {{ formatTokenCount(selectedAiModelLimits.maxContextTokens) }}。</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">最大 Token 数</div>
          <div class="label-desc">控制单次回复的输出长度，范围会自动受当前模型输出能力约束。</div>
        </div>
        <div class="ai-token-stack">
          <input
            type="number"
            class="setting-input setting-input-sm"
            :value="aiConfig.maxTokens"
            min="256"
            :max="selectedAiModelLimits.maxOutputTokens"
            step="256"
            @change="handleMaxTokensChange(($event.target as HTMLInputElement).value)"
          />
          <span class="field-tip">当前选择 {{ formatTokenCount(resolvedTokenLimits.maxOutputTokens) }}，模型上限 {{ formatTokenCount(selectedAiModelLimits.maxOutputTokens) }}。</span>
        </div>
      </div>

      <div class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">系统提示词</div>
          <div class="label-desc">这里适合写全局角色约束；具体稳定规则更建议写成下方的统一 Skills。</div>
        </div>
        <textarea class="setting-textarea" :value="aiConfig.systemPrompt" rows="6" placeholder="定义 AI 助手的角色和行为..." @change="updateAIConfig('systemPrompt', ($event.target as HTMLTextAreaElement).value)" />
      </div>
    </section>

    <section v-if="showTTSSection" class="ai-settings-section glass-panel">
      <div class="section-heading">
        <div>
          <h3>语音与 Live2D 联动</h3>
          <p>Live2D 悬浮窗现在使用独立对话域与长期记忆，默认可自动播报 AI 回复；主窗口则保持文本优先，只在需要时显示播放按钮。</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">当前音色</span>
          <strong>{{ selectedTTSVoice?.name || settings.ttsVoiceName || '未选择' }}</strong>
          <small>{{ selectedTTSVoice?.description || '当前默认使用兼容度最高的中文女声音色，可在后续切换模型与音色。' }}</small>
        </div>
        <div class="summary-card">
          <span class="summary-label">Live2D 独立域</span>
          <strong>会话 {{ live2dSessionCount }} / 记忆 {{ live2dMemoryCount }}</strong>
          <small>Live2D 悬浮窗不再复用主窗口对话，会单独保存上下文与长期记忆。</small>
        </div>
        <div class="summary-card">
          <span class="summary-label">主窗口播报按钮</span>
          <strong>{{ settings.ttsShowMainReplyButton ? '已显示' : '已隐藏' }}</strong>
          <small>只对 AI 正式回复显示播放按钮，不会为思考过程增加语音入口。</small>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">本地 TTS 引擎</div>
          <div class="label-desc">当前通过渲染层本地 WASM / ONNX 推理运行开源语音引擎，模型与音色随应用内置，默认即可离线使用。</div>
        </div>
        <div class="ai-toggle-group">
          <span class="ai-inline-status" :class="{ 'is-enabled': settings.ttsEnabled, 'is-disabled': !settings.ttsEnabled }">
            {{ settings.ttsEnabled ? '已启用' : '已关闭' }}
          </span>
          <label class="switch">
            <input type="checkbox" :checked="settings.ttsEnabled" @change="updateSetting('ttsEnabled', ($event.target as HTMLInputElement).checked)" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">Live2D 自动播报</div>
          <div class="label-desc">开启后，悬浮窗里的 AI 助手回复会在生成完成后自动朗读；适合把 Live2D 当作陪伴式聊天入口。</div>
        </div>
        <div class="ai-toggle-group">
          <span class="ai-inline-status" :class="{ 'is-enabled': settings.ttsAutoPlayLive2D, 'is-disabled': !settings.ttsAutoPlayLive2D }">
            {{ settings.ttsAutoPlayLive2D ? '自动播报' : '手动播放' }}
          </span>
          <label class="switch">
            <input type="checkbox" :checked="settings.ttsAutoPlayLive2D" @change="updateSetting('ttsAutoPlayLive2D', ($event.target as HTMLInputElement).checked)" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">主窗口播放按钮</div>
          <div class="label-desc">主窗口不自动播报，只在每条 AI 正式回复下方显示一个语音播放按钮，便于按需收听。</div>
        </div>
        <div class="ai-toggle-group">
          <span class="ai-inline-status" :class="{ 'is-enabled': settings.ttsShowMainReplyButton, 'is-disabled': !settings.ttsShowMainReplyButton }">
            {{ settings.ttsShowMainReplyButton ? '已显示' : '已隐藏' }}
          </span>
          <label class="switch">
            <input type="checkbox" :checked="settings.ttsShowMainReplyButton" @change="updateSetting('ttsShowMainReplyButton', ($event.target as HTMLInputElement).checked)" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">语音引擎</div>
          <div class="label-desc">Azure Speech 适合真正情绪语音，Edge 更适合免配置的高质量中文，系统语音偏低延迟，Kokoro 则适合离线模型与可控音色。</div>
        </div>
        <div class="ai-input-stack">
          <select class="setting-select" :value="settings.ttsEngine" @change="handleTTSEngineChange(($event.target as HTMLSelectElement).value)">
            <option v-for="engine in ttsEngineOptions" :key="engine.value" :value="engine.value">{{ engine.label }}</option>
          </select>
          <span class="field-tip">{{ ttsEngineDescription }}</span>
        </div>
      </div>

      <div class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">语音模型</div>
          <div class="label-desc">Azure 与 Edge 直接使用在线神经语音服务；系统引擎使用系统内置模型；Kokoro 支持离线模型、远程缓存和自定义兼容模型 ID。</div>
        </div>
        <div class="tts-resource-stack">
          <div class="tts-search-row">
            <input v-model="ttsModelSearchQuery" class="setting-input" placeholder="搜索模型名称、标识或来源" />
            <div class="tts-action-row">
              <button class="btn btn-secondary btn-sm" :disabled="refreshingTTSCacheState" @click="refreshTTSCacheState()">
                {{ refreshingTTSCacheState ? '刷新中...' : '刷新缓存状态' }}
              </button>
              <button class="btn btn-primary btn-sm" :disabled="savingTTSSelection" @click="saveCurrentTTSSelection">
                {{ savingTTSSelection ? '保存中...' : '保存当前语音配置' }}
              </button>
            </div>
          </div>
          <select class="setting-select" :value="settings.ttsModelId" @change="handleTTSModelChange(($event.target as HTMLSelectElement).value)">
            <option v-for="model in visibleTTSModelOptions" :key="model.modelId" :value="model.modelId">
              {{ model.name }}{{ model.builtIn ? ' · 内置' : model.remote ? ' · 可远程缓存' : '' }}
            </option>
          </select>
          <span v-if="ttsModelSearchQuery && filteredTTSModelOptions.length === 0" class="field-tip">没有找到匹配模型，已保留当前模型。你也可以直接输入兼容模型 ID。</span>
          <div v-if="!isSystemSpeechEngine && !isEdgeSpeechEngine && !isAzureSpeechEngine" class="tts-custom-model-row">
            <input v-model="ttsCustomModelInput" class="setting-input" placeholder="输入兼容 Hugging Face / ONNX 模型标识，例如 onnx-community/Kokoro-82M-v1.0-ONNX-timestamped" />
            <div class="tts-action-row">
              <button class="btn btn-secondary btn-sm" :disabled="!ttsCustomModelInput.trim()" @click="applyCustomTTSModel">应用模型</button>
              <button class="btn btn-secondary btn-sm" :disabled="cachingTTSModel || Boolean(selectedTTSModel?.builtIn) || ttsModelCached" @click="cacheSelectedTTSModel">
                {{ ttsModelSaveLabel }}
              </button>
            </div>
          </div>
          <span v-else-if="isAzureSpeechEngine" class="field-tip">Azure Speech 不需要下载模型，但必须先填写 Azure Speech Key 和 Region，之后才会读取支持真实 style/styledegree 的中文音色。</span>
          <span v-else-if="isEdgeSpeechEngine" class="field-tip">Edge 神经语音不需要额外下载模型，联网后即可直接使用在线神经音色与韵律情绪控制。</span>
          <span v-else class="field-tip">系统语音引擎不需要额外下载模型，切换后会直接走系统内置语音能力。</span>
          <div v-if="selectedTTSModel" class="ai-capability-panel">
            <div class="ai-capability-header">
              <strong>{{ selectedTTSModel.name }}</strong>
              <span>{{ selectedTTSModel.language }}</span>
            </div>
            <div class="ai-capability-tags">
              <span class="ai-capability-tag" :class="{ 'is-muted': !selectedTTSModel.builtIn && !ttsModelCached }">
                {{ isAzureSpeechEngine ? (azureTTSSupported ? '已鉴权' : '待鉴权') : isEdgeSpeechEngine ? '在线即用' : isSystemSpeechEngine ? '系统即用' : selectedTTSModel.builtIn ? '内置离线' : ttsModelCached ? '已缓存' : '远程可缓存' }}
              </span>
              <span v-if="selectedTTSModel.recommended" class="ai-capability-tag">推荐</span>
              <span class="ai-capability-tag is-limit">{{ selectedTTSModel.sourceLabel }}</span>
            </div>
            <span class="field-tip">{{ selectedTTSModel.description }}</span>
            <span class="field-tip">模型标识：{{ selectedTTSModel.modelId }}</span>
          </div>
        </div>
      </div>

      <div v-if="isAzureSpeechEngine" class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">Azure Speech 鉴权</div>
          <div class="label-desc">真正情绪语音依赖 Azure Speech Key 和 Region。若要更完整地使用预览情绪风格，优先考虑 southeastasia、eastus 或 westeurope。</div>
        </div>
        <div class="tts-resource-stack">
          <div class="input-wrap">
            <input
              :type="showAzureTTSKey ? 'text' : 'password'"
              class="setting-input"
              :value="settings.ttsAzureKey"
              placeholder="填写 Azure Speech Key"
              @change="updateSetting('ttsAzureKey', ($event.target as HTMLInputElement).value)"
            />
            <button class="toggle-visibility-btn" :title="showAzureTTSKey ? '隐藏' : '显示'" @click="showAzureTTSKey = !showAzureTTSKey">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="showAzureTTSKey" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle v-if="showAzureTTSKey" cx="12" cy="12" r="3"/>
                <path v-if="!showAzureTTSKey" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line v-if="!showAzureTTSKey" x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <input class="setting-input" :value="settings.ttsAzureRegion" placeholder="例如 southeastasia / eastus / westeurope" @change="updateSetting('ttsAzureRegion', ($event.target as HTMLInputElement).value)" />
          <div class="tts-action-row">
            <button class="btn btn-secondary btn-sm" :disabled="refreshingAzureVoiceCatalog" @click="refreshAzureVoiceCatalog()">
              {{ refreshingAzureVoiceCatalog ? '校验中...' : '校验并刷新 Azure 音色' }}
            </button>
          </div>
          <span class="field-tip">Azure voices/list 会返回每个音色的可用风格与角色。Key/Region 配置完成后，这里会自动读取可用中文情绪音色。</span>
        </div>
      </div>

      <div class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">默认音色</div>
          <div class="label-desc">Azure 会读取官方中文情绪音色，Edge 会读取在线神经音色，系统引擎读取 Windows 已安装音色，Kokoro 提供稳定的离线音色。</div>
        </div>
        <div class="tts-resource-stack">
          <div class="tts-search-row">
            <input v-model="ttsVoiceSearchQuery" class="setting-input" placeholder="搜索音色名称、语言、性别或口音" />
            <div class="tts-action-row">
              <button class="btn btn-secondary btn-sm" :disabled="isAzureSpeechEngine ? refreshingAzureVoiceCatalog : isEdgeSpeechEngine ? refreshingEdgeVoiceCatalog : isSystemSpeechEngine || cachingTTSVoice || Boolean(selectedTTSVoice?.builtIn) || ttsVoiceCached" @click="cacheSelectedTTSVoice">
                {{ ttsVoiceSaveLabel }}
              </button>
            </div>
          </div>
          <select class="setting-select" :value="settings.ttsVoiceId" @change="handleTTSVoiceChange(($event.target as HTMLSelectElement).value)">
            <option v-for="voice in visibleTTSVoiceOptions" :key="voice.id" :value="voice.id">{{ voice.name }} · {{ voice.locale }} · {{ voice.accent }}</option>
          </select>
          <span v-if="ttsVoiceSearchQuery && filteredTTSVoiceOptions.length === 0" class="field-tip">没有找到匹配音色，已保留当前选择。</span>
          <div v-if="selectedTTSVoice" class="ai-capability-panel">
            <div class="ai-capability-header">
              <strong>{{ selectedTTSVoice.name }}</strong>
              <span>{{ selectedTTSVoice.locale.toUpperCase() }}</span>
            </div>
            <div class="ai-capability-tags">
              <span class="ai-capability-tag" :class="{ 'is-muted': !selectedTTSVoice.builtIn && !ttsVoiceCached }">
                {{ isAzureSpeechEngine || isEdgeSpeechEngine ? '在线即用' : selectedTTSVoice.builtIn ? '内置离线' : ttsVoiceCached ? '已缓存' : '远程可缓存' }}
              </span>
              <span class="ai-capability-tag">{{ selectedTTSVoice.gender === 'female' ? '女声' : '男声' }}</span>
              <span class="ai-capability-tag is-limit">{{ selectedTTSVoice.accent }}</span>
            </div>
            <span class="field-tip">{{ selectedTTSVoice.description }}</span>
            <span v-if="selectedTTSVoiceEmotionStyles.length > 0" class="field-tip">支持风格：{{ selectedTTSVoiceEmotionStyles.join(' / ') }}</span>
            <span class="field-tip">试听样句：{{ selectedTTSVoice.sampleText }}</span>
          </div>
          <div class="tts-status-row">
            <span class="ai-capability-tag" :class="{ 'is-muted': !ttsModelCached }">
              {{ ttsModelStatusLabel }}
            </span>
            <span class="ai-capability-tag" :class="{ 'is-muted': !ttsVoiceCached }">
              {{ ttsVoiceStatusLabel }}
            </span>
          </div>
          <span v-if="ttsRuntimeStatus" class="field-tip">{{ ttsRuntimeStatus }}</span>
          <span v-if="ttsRuntimeError" class="field-tip field-tip-error">{{ ttsRuntimeError }}</span>
        </div>
      </div>

      <div v-if="isAzureSpeechEngine || isEdgeSpeechEngine" class="setting-row">
        <div class="setting-label">
          <div class="label-main">情绪风格</div>
          <div class="label-desc">{{ isAzureSpeechEngine ? 'Azure Speech 会直接使用官方 style 与 styledegree 输出真实情绪语气；若当前音色不支持所选风格，会自动回退到最接近的可用风格。' : 'Edge 神经语音会通过语速、音高和响度的组合来模拟情绪风格。建议先用自动或助手，再按场景切换为愉快、共情、严肃等风格。' }}</div>
        </div>
        <div class="ai-input-stack">
          <select class="setting-select" :value="settings.ttsEmotionStyle" @change="updateSetting('ttsEmotionStyle', ($event.target as HTMLSelectElement).value as AppSettings['ttsEmotionStyle'])">
            <option v-for="option in ttsEmotionStyleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <div class="range-wrap range-wrap-wide">
            <input type="range" min="0.6" max="1.6" step="0.1" :value="settings.ttsEmotionIntensity" @input="updateSetting('ttsEmotionIntensity', parseFloat(($event.target as HTMLInputElement).value))" />
            <span class="range-val">{{ settings.ttsEmotionIntensity.toFixed(1) }}x</span>
          </div>
          <span class="field-tip">{{ ttsEmotionStatusHint }}</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">语速</div>
          <div class="label-desc">建议保持在 0.9 到 1.1 之间，避免长句过快或过慢影响可懂度。</div>
        </div>
        <div class="range-wrap range-wrap-wide">
          <input type="range" min="0.7" max="1.35" step="0.05" :value="settings.ttsSpeed" @input="updateSetting('ttsSpeed', parseFloat(($event.target as HTMLInputElement).value))" />
          <span class="range-val">{{ settings.ttsSpeed.toFixed(2) }}x</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-label">
          <div class="label-main">音量</div>
          <div class="label-desc">这里控制 AI 语音回放音量，不影响应用其他系统声音。</div>
        </div>
        <div class="range-wrap range-wrap-wide">
          <input type="range" min="0" max="1" step="0.05" :value="settings.ttsVolume" @input="updateSetting('ttsVolume', parseFloat(($event.target as HTMLInputElement).value))" />
          <span class="range-val">{{ Math.round(settings.ttsVolume * 100) }}%</span>
        </div>
      </div>

      <div class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">试听文本</div>
          <div class="label-desc">用当前模型、音色、语速与音量即时试听，便于确认 Live2D 自动播报效果。</div>
        </div>
        <div class="ai-input-stack">
          <textarea v-model="ttsSampleText" class="setting-textarea setting-textarea-sm" rows="3" placeholder="输入要试听的文本" />
          <div class="hero-actions tts-preview-actions">
            <button class="btn btn-primary btn-sm" :disabled="playingTTSSample || !ttsSampleText.trim()" @click="playTTSSample">
              {{ playingTTSSample ? '播放中...' : '试听当前音色' }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="stopTTSSample">停止播放</button>
          </div>
        </div>
      </div>

      <div class="setting-row align-start">
        <div class="setting-label">
          <div class="label-main">独立会话与长期记忆</div>
          <div class="label-desc">主窗口与 Live2D 各自维护会话和长期记忆。这里可以查看数据量并按域清理，避免互相污染。</div>
        </div>
        <div class="scope-control-grid">
          <div class="scope-card">
            <strong>主窗口 AI</strong>
            <span class="scope-card-meta">会话 {{ mainSessionCount }} 条 · 记忆 {{ mainMemoryCount }} 条</span>
            <div class="scope-card-actions">
              <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming && aiStore.runtime.sessionScope === 'main'" @click="clearScopedSessions('main')">清空会话</button>
              <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming && aiStore.runtime.sessionScope === 'main'" @click="clearScopedMemories('main')">清空记忆</button>
            </div>
          </div>
          <div class="scope-card">
            <strong>Live2D 悬浮窗</strong>
            <span class="scope-card-meta">会话 {{ live2dSessionCount }} 条 · 记忆 {{ live2dMemoryCount }} 条</span>
            <div class="scope-card-actions">
              <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming && aiStore.runtime.sessionScope === 'live2d'" @click="clearScopedSessions('live2d')">清空会话</button>
              <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming && aiStore.runtime.sessionScope === 'live2d'" @click="clearScopedMemories('live2d')">清空记忆</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="showManagedResourcesSection" class="ai-settings-section">
      <AIManagedResourcesPanel :search-query="searchQuery" />
    </section>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state glass-panel">
      <svg width="64" height="64"><use href="#icon-search" /></svg>
      <div class="empty-title">未找到匹配的 AI 设置项</div>
      <div class="empty-desc">请尝试搜索模型、MCP、skills、提示词或上下文等关键词。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AIConfig, AIConversationScope, AIProviderModel, AIProtocol, AppSettings, TTSEmotionStyle, TTSVoiceLibraryItem } from '@/types'
import AIManagedResourcesPanel from '@/components/AIManagedResourcesPanel.vue'
import { useAIResourcesStore } from '@/stores/aiResources'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { fetchAvailableModels, getModelCapabilityLabels, getModelLimitLabels, inferModelCapabilities, inferModelLimits, resolveConfigTokenLimits } from '@/utils/ai'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import {
  AZURE_TTS_ENGINE,
  DEFAULT_TTS_SAMPLE_TEXT,
  EDGE_TTS_ENGINE,
  SYSTEM_TTS_ENGINE,
  TTS_EMOTION_STYLE_OPTIONS,
  TTS_ENGINE_OPTIONS,
  getDefaultTTSModelId,
  getDefaultTTSVoiceId,
  getTTSModelOption,
  getTTSVoiceOption,
  listTTSModels,
  listTTSVoices,
  normalizeTTSEngine,
  normalizeTTSModelId
} from '@/utils/ttsCatalog'
import { playTextToSpeech, stopTTSPlayback } from '@/utils/ttsPlayback'
import {
  cacheTTSModel,
  cacheTTSVoice,
  isAzureSpeechSupported,
  isEdgeSpeechSupported,
  isSystemSpeechSupported,
  isTTSModelCached,
  isTTSVoiceCached,
  listAzureSpeechVoices,
  listEdgeSpeechVoices,
  listSystemSpeechVoices
} from '@/utils/ttsRuntime'
import { showToast } from '@/utils/toast'

const props = defineProps<{ searchQuery?: string }>()

const router = useRouter()
const settingsStore = useSettingsStore()
const aiStore = useAIStore()
const resourcesStore = useAIResourcesStore()

const settings = computed(() => settingsStore.settings)
const aiConfig = computed(() => aiStore.config)
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))
const showApiKey = ref(false)
const showAzureTTSKey = ref(false)
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const savingAIConfig = ref(false)
const aiModelLoadError = ref('')
const aiModelStatus = ref('')
const playingTTSSample = ref(false)
const ttsSampleText = ref(DEFAULT_TTS_SAMPLE_TEXT)
const ttsModelSearchQuery = ref('')
const ttsVoiceSearchQuery = ref('')
const ttsCustomModelInput = ref('')
const refreshingTTSCacheState = ref(false)
const cachingTTSModel = ref(false)
const cachingTTSVoice = ref(false)
const savingTTSSelection = ref(false)
const ttsRuntimeStatus = ref('')
const ttsRuntimeError = ref('')
const ttsModelCached = ref(false)
const ttsVoiceCached = ref(false)
const systemTTSVoices = ref<TTSVoiceLibraryItem[]>([])
const systemTTSSupported = ref(false)
const azureTTSVoices = ref<TTSVoiceLibraryItem[]>([])
const azureTTSSupported = ref(false)
const refreshingAzureVoiceCatalog = ref(false)
const edgeTTSVoices = ref<TTSVoiceLibraryItem[]>([])
const edgeTTSSupported = ref(false)
const refreshingEdgeVoiceCatalog = ref(false)

type AIProtocolPreset = {
  label: string
  tag: string
  description: string
  protocolDescription: string
  apiKeyDescription: string
  baseUrlDescription: string
  modelDescription: string
  baseUrl: string
  model: string
  baseUrlPlaceholder: string
  modelPlaceholder: string
  supportsModelFetch: boolean
}

const AI_PROTOCOL_PRESETS: Record<AIProtocol, AIProtocolPreset> = {
  openai: {
    label: 'OpenAI 兼容',
    tag: '兼容层',
    description: '适合 OpenAI 与大多数兼容网关',
    protocolDescription: '选择 AI 服务供应商的 API 协议',
    apiKeyDescription: 'AI 服务的认证密钥',
    baseUrlDescription: 'OpenAI 兼容入口地址，默认使用官方 /v1',
    modelDescription: '指定使用的模型，例如 gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelPlaceholder: 'gpt-4o-mini',
    supportsModelFetch: true
  },
  anthropic: {
    label: 'Anthropic',
    tag: '官方',
    description: '原生 Claude Messages API',
    protocolDescription: 'Anthropic Messages API 协议，自动走 /v1/messages',
    apiKeyDescription: 'Anthropic API Key',
    baseUrlDescription: 'Anthropic 服务地址，默认使用官方 /v1',
    modelDescription: '指定 Claude 模型，例如 claude-3-7-sonnet-latest',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-7-sonnet-latest',
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
    modelPlaceholder: 'claude-3-7-sonnet-latest',
    supportsModelFetch: true
  },
  'ollama-local': {
    label: 'Ollama 本地',
    tag: '本机',
    description: '走官方本地 /api，直连 11434',
    protocolDescription: '使用 Ollama 官方本地 API，默认地址为 http://localhost:11434/api，适合本机模型。',
    apiKeyDescription: '本地 Ollama 默认不需要 API Key；如果你前面挂了鉴权代理，可在这里填写。',
    baseUrlDescription: '官方本地 API 基础地址，支持 /api 与旧 /v1 地址自动兼容迁移。',
    modelDescription: '指定本地 Ollama 模型名称，例如 qwen2.5:7b、deepseek-r1:8b。',
    baseUrl: 'http://localhost:11434/api',
    model: 'qwen2.5:7b',
    baseUrlPlaceholder: 'http://localhost:11434/api',
    modelPlaceholder: 'qwen2.5:7b',
    supportsModelFetch: true
  },
  'ollama-cloud': {
    label: 'Ollama 云端',
    tag: '官方云',
    description: '默认直连官方 ollama.com/api',
    protocolDescription: '使用 Ollama 官方云端 API，默认网关为 https://ollama.com/api，和本地 API 结构保持一致。',
    apiKeyDescription: '直连 ollama.com/api 时需要 API Key，按官方要求走 Authorization: Bearer。',
    baseUrlDescription: '默认已经内置官方云端网关；如果后续官方变更网关，只需在这里替换。',
    modelDescription: '指定云端 Ollama 模型名称，例如 gpt-oss:20b、llama3.3:70b。',
    baseUrl: 'https://ollama.com/api',
    model: 'gpt-oss:20b',
    baseUrlPlaceholder: 'https://ollama.com/api',
    modelPlaceholder: 'gpt-oss:20b',
    supportsModelFetch: true
  },
  custom: {
    label: '自定义',
    tag: '自定义',
    description: '给自建网关或第三方 API 用',
    protocolDescription: '自定义协议入口，由你自行提供兼容地址与模型名',
    apiKeyDescription: '按你的服务要求填写认证密钥',
    baseUrlDescription: '填写完整的 API 基础地址或直接填到具体聊天接口',
    modelDescription: '填写服务端实际识别的模型名称',
    baseUrl: '',
    model: '',
    baseUrlPlaceholder: 'https://your-custom-api.example.com/v1',
    modelPlaceholder: 'your-model-name',
    supportsModelFetch: true
  }
}

const aiProtocolOptions = (Object.entries(AI_PROTOCOL_PRESETS) as Array<[AIProtocol, AIProtocolPreset]>).map(([value, preset]) => ({
  value,
  label: preset.label,
  tag: preset.tag,
  description: preset.description
}))

const aiProtocolPreset = computed(() => AI_PROTOCOL_PRESETS[aiConfig.value.protocol])
const aiProviderTitle = computed(() => aiProtocolPreset.value.label)
const aiProtocolDescription = computed(() => aiProtocolPreset.value.protocolDescription)
const aiApiKeyDescription = computed(() => aiProtocolPreset.value.apiKeyDescription)
const aiBaseUrlDescription = computed(() => aiProtocolPreset.value.baseUrlDescription)
const aiModelDescription = computed(() => aiProtocolPreset.value.modelDescription)
const aiBaseUrlPlaceholder = computed(() => aiProtocolPreset.value.baseUrlPlaceholder)
const aiModelPlaceholder = computed(() => aiProtocolPreset.value.modelPlaceholder)
const canFetchAIModels = computed(() => aiProtocolPreset.value.supportsModelFetch && !!aiConfig.value.baseUrl.trim())
const aiBaseUrlHint = computed(() => {
  if (aiConfig.value.protocol === 'ollama-local') {
    return '本地模式使用官方 /api；旧的 /v1 地址会在请求时自动兼容迁移。'
  }

  if (aiConfig.value.protocol === 'ollama-cloud') {
    return '当前默认使用官方云端网关 https://ollama.com/api。'
  }

  return '建议填写基础地址，不要把路径锁死到单个接口。'
})
const aiConnectionHint = computed(() => {
  if (aiConfig.value.protocol === 'ollama-local') {
    return '本地运行，无需额外网关；模型列表直接读取本机 Ollama。'
  }

  if (aiConfig.value.protocol === 'ollama-cloud') {
    return '云端运行，默认走 Ollama 官方 API；可直接读取云端模型列表。'
  }

  if (aiConfig.value.protocol === 'anthropic') {
    return '使用 Claude 官方 Messages API；模型列表提供常用官方型号。'
  }

  if (aiConfig.value.protocol === 'custom') {
    return '自定义模式假设你的服务兼容常见模型枚举接口；如不兼容，可手动输入模型名。'
  }

  return 'OpenAI 兼容模式支持常见 /models 接口。'
})
const aiModelSelectPlaceholder = computed(() => canFetchAIModels.value ? '先读取可用模型，或继续手动输入' : '当前地址不可读取模型列表')
const aiModelStatusMessage = computed(() => aiModelStatus.value)
const aiMemorySummary = computed(() => {
  const allMemories = [...aiStore.getMemories('main'), ...aiStore.getMemories('live2d')]
  const aiCreated = allMemories.filter(memory => memory.source === 'ai').length
  const manualCreated = allMemories.length - aiCreated
  return `共 ${allMemories.length} 条，AI 记录 ${aiCreated} 条，手动添加 ${manualCreated} 条`
})
const selectedAiModelLimits = computed(() => selectedAiModelMeta.value?.limits || inferModelLimits(aiConfig.value.model, aiConfig.value.protocol))
const resolvedTokenLimits = computed(() => resolveConfigTokenLimits(aiConfig.value))
const selectedAiModelMeta = computed(() => {
  const matchedModel = availableAiModels.value.find(model => model.name === aiConfig.value.model)
  if (matchedModel) {
    return matchedModel
  }

  if (!aiConfig.value.model.trim()) {
    return null
  }

  return {
    id: aiConfig.value.model,
    name: aiConfig.value.model,
    label: aiConfig.value.model,
    provider: aiProviderTitle.value,
    capabilities: inferModelCapabilities(aiConfig.value.model, aiConfig.value.protocol),
    limits: inferModelLimits(aiConfig.value.model, aiConfig.value.protocol)
  }
})
const selectedAiModelCapabilityLabels = computed(() => getModelCapabilityLabels(selectedAiModelMeta.value?.capabilities))
const selectedAiModelLimitLabels = computed(() => getModelLimitLabels(selectedAiModelLimits.value))
const activeTTSEngine = computed(() => normalizeTTSEngine(settings.value.ttsEngine))
const isSystemSpeechEngine = computed(() => activeTTSEngine.value === SYSTEM_TTS_ENGINE)
const isAzureSpeechEngine = computed(() => activeTTSEngine.value === AZURE_TTS_ENGINE)
const isEdgeSpeechEngine = computed(() => activeTTSEngine.value === EDGE_TTS_ENGINE)
const ttsEngineOptions = TTS_ENGINE_OPTIONS
const ttsEmotionStyleOptions = TTS_EMOTION_STYLE_OPTIONS
const selectedTTSEmotionOption = computed(() => ttsEmotionStyleOptions.find(option => option.value === settings.value.ttsEmotionStyle) || ttsEmotionStyleOptions[0])
const selectedTTSVoiceEmotionStyles = computed<TTSEmotionStyle[]>(() => selectedTTSVoice.value?.emotionStyles || [])
const ttsEmotionStatusHint = computed(() => {
  const styleLabel = selectedTTSEmotionOption.value.label
  if (isAzureSpeechEngine.value) {
    if (selectedTTSVoiceEmotionStyles.value.length > 0) {
      return `当前风格：${styleLabel}。该音色支持 ${selectedTTSVoiceEmotionStyles.value.join(' / ')}；若当前风格不在支持列表中，会自动回退到最接近的官方风格。`
    }

    return `当前风格：${styleLabel}。Azure 会直接使用官方 style/styledegree；强度建议保持在 0.9 到 1.2 之间。`
  }

  return `当前风格：${styleLabel}。自动模式会根据文本语气选取风格；强度建议保持在 0.9 到 1.2 之间。`
})
const ttsEngineDescription = computed(() => {
  if (isAzureSpeechEngine.value) {
    return azureTTSSupported.value
      ? 'Azure Speech 已连通，当前会优先使用官方中文 style/styledegree 做真实情绪播报。'
      : '当前尚未完成 Azure Speech 鉴权，请填写 Key 与 Region 后刷新音色列表。'
  }

  if (isEdgeSpeechEngine.value) {
    return edgeTTSSupported.value
      ? 'Edge 神经语音会在线读取中文神经音色，并通过韵律控制模拟情绪风格，适合作为 AI 主播报引擎。'
      : '当前尚未连通 Edge 神经语音服务，可能需要联网后刷新在线音色列表。'
  }

  if (isSystemSpeechEngine.value) {
    return systemTTSSupported.value
      ? '系统语音直接使用 Windows / Chromium 已安装音色，几乎无需等待，适合低延迟播报。'
      : '当前环境暂未检测到系统语音能力，请切回 Kokoro 离线引擎。'
  }

  return 'Kokoro 走本地模型推理，支持离线缓存、自定义模型和更多开源音色。支持 WebGPU 时会优先加速。'
})
const ttsModelOptions = computed(() => {
  const currentModel = getTTSModelOption(settings.value.ttsModelId, activeTTSEngine.value)
  const models = [...listTTSModels(activeTTSEngine.value)]

  if (!models.some(item => item.modelId === currentModel.modelId)) {
    models.unshift(currentModel)
  }

  return models
})
const ttsVoiceOptions = computed(() => {
  if (isAzureSpeechEngine.value) {
    return azureTTSVoices.value.length > 0
      ? azureTTSVoices.value
      : listTTSVoices(settings.value.ttsModelId, activeTTSEngine.value)
  }

  if (isEdgeSpeechEngine.value) {
    return edgeTTSVoices.value.length > 0
      ? edgeTTSVoices.value
      : listTTSVoices(settings.value.ttsModelId, activeTTSEngine.value)
  }

  if (isSystemSpeechEngine.value) {
    return systemTTSVoices.value.length > 0
      ? systemTTSVoices.value
      : listTTSVoices(settings.value.ttsModelId, activeTTSEngine.value)
  }

  return listTTSVoices(settings.value.ttsModelId, activeTTSEngine.value)
})
const selectedTTSModel = computed(() => getTTSModelOption(settings.value.ttsModelId, activeTTSEngine.value))
const selectedTTSVoice = computed(() => {
  return ttsVoiceOptions.value.find(voice => voice.id === settings.value.ttsVoiceId)
    ?? getTTSVoiceOption(settings.value.ttsVoiceId, settings.value.ttsModelId, activeTTSEngine.value)
})
const filteredTTSModelOptions = computed(() => ttsModelOptions.value.filter(model => matchesSearchQuery(
  ttsModelSearchQuery.value,
  model.id,
  model.modelId,
  model.name,
  model.description,
  model.language,
  model.sourceLabel,
  model.sourceUrl
)))
const visibleTTSModelOptions = computed(() => filteredTTSModelOptions.value.length > 0
  ? filteredTTSModelOptions.value
  : (selectedTTSModel.value ? [selectedTTSModel.value] : []))
const filteredTTSVoiceOptions = computed(() => ttsVoiceOptions.value.filter(voice => matchesSearchQuery(
  ttsVoiceSearchQuery.value,
  voice.id,
  voice.name,
  voice.locale,
  voice.gender,
  voice.accent,
  voice.description,
  voice.sourceLabel,
  voice.sourceUrl
)))
const visibleTTSVoiceOptions = computed(() => filteredTTSVoiceOptions.value.length > 0
  ? filteredTTSVoiceOptions.value
  : (selectedTTSVoice.value ? [selectedTTSVoice.value] : []))
const ttsModelSaveLabel = computed(() => {
  if (isAzureSpeechEngine.value) {
    return azureTTSSupported.value ? '在线鉴权完成' : '等待鉴权'
  }

  if (isEdgeSpeechEngine.value) {
    return '在线即用'
  }

  if (isSystemSpeechEngine.value) {
    return '系统无需缓存'
  }

  if (cachingTTSModel.value) {
    return '保存中...'
  }

  if (selectedTTSModel.value?.builtIn) {
    return '内置模型'
  }

  if (ttsModelCached.value) {
    return '已缓存'
  }

  return '下载并保存模型'
})
const ttsVoiceSaveLabel = computed(() => {
  if (isAzureSpeechEngine.value) {
    return refreshingAzureVoiceCatalog.value ? '校验中...' : '校验并刷新音色'
  }

  if (isEdgeSpeechEngine.value) {
    return refreshingEdgeVoiceCatalog.value ? '刷新中...' : '刷新在线音色'
  }

  if (isSystemSpeechEngine.value) {
    return '系统无需缓存'
  }

  if (cachingTTSVoice.value) {
    return '保存中...'
  }

  if (selectedTTSVoice.value?.builtIn) {
    return '内置音色'
  }

  if (ttsVoiceCached.value) {
    return '已缓存'
  }

  return '下载并保存音色'
})
const mainSessionCount = computed(() => aiStore.getSessions('main').length)
const live2dSessionCount = computed(() => aiStore.getSessions('live2d').length)
const mainMemoryCount = computed(() => aiStore.getMemories('main').length)
const live2dMemoryCount = computed(() => aiStore.getMemories('live2d').length)
const ttsSummaryTitle = computed(() => settings.value.ttsEnabled ? (selectedTTSVoice.value?.name || settings.value.ttsVoiceName || '已启用') : '已关闭')
const ttsSummaryHint = computed(() => {
  if (!settings.value.ttsEnabled) {
    return '当前不会输出 AI 语音，可随时重新开启。'
  }

  const engineHint = isAzureSpeechEngine.value ? 'Azure 真情绪语音' : isEdgeSpeechEngine.value ? 'Edge 神经语音 + 情绪风格' : isSystemSpeechEngine.value ? '系统语音低延迟' : 'Kokoro 离线模型'
  const live2dHint = settings.value.ttsAutoPlayLive2D ? 'Live2D 自动播报' : 'Live2D 手动播放'
  const mainHint = settings.value.ttsShowMainReplyButton ? '主窗口带播放按钮' : '主窗口纯文本'
  return `${engineHint}，${live2dHint}，${mainHint}。`
})

const ttsModelStatusLabel = computed(() => {
  if (isAzureSpeechEngine.value) {
    return azureTTSSupported.value ? 'Azure 情绪语音已就绪' : '等待 Azure Speech 鉴权'
  }

  if (isEdgeSpeechEngine.value) {
    return edgeTTSSupported.value ? '在线神经语音模型已就绪' : '等待连接在线神经语音服务'
  }

  if (isSystemSpeechEngine.value) {
    return systemTTSSupported.value ? '系统模型由操作系统直接提供' : '当前环境未检测到系统语音能力'
  }

  return selectedTTSModel.value?.builtIn ? '模型已内置' : ttsModelCached.value ? '模型已缓存' : '模型待缓存'
})

const ttsVoiceStatusLabel = computed(() => {
  if (isAzureSpeechEngine.value) {
    return azureTTSSupported.value ? `已读取 ${azureTTSVoices.value.length} 个 Azure 中文情绪音色` : 'Azure 中文音色尚未读取'
  }

  if (isEdgeSpeechEngine.value) {
    return edgeTTSSupported.value ? `已读取 ${edgeTTSVoices.value.length} 个在线中文音色` : '在线音色尚未读取'
  }

  if (isSystemSpeechEngine.value) {
    return systemTTSSupported.value ? '系统音色无需单独下载' : '请改用 Kokoro 离线音色'
  }

  return selectedTTSVoice.value?.builtIn ? '音色已内置' : ttsVoiceCached.value ? '音色已缓存' : '音色待缓存'
})

const showOverviewSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'AI 设置',
  '模型',
  '上下文',
  'MCP',
  'skills',
  'TTS',
  '语音',
  aiProviderTitle.value,
  resourcesStore.registry
))
const showRuntimeSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'AI',
  '协议',
  '模型',
  'API Key',
  'Base URL',
  'Temperature',
  '提示词',
  '上下文',
  '最大 Token',
  'Windows MCP',
  aiConfig.value,
  aiProviderTitle.value
))
const showTTSSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  'TTS',
  '语音',
  '朗读',
  'Live2D',
  '播放按钮',
  settings.value.ttsEngine,
  settings.value.ttsModelId,
  settings.value.ttsVoiceId,
  settings.value.ttsVoiceName
))
const showManagedResourcesSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '托管',
  'mcp',
  'skills',
  '技能',
  resourcesStore.registry
))
const hasVisibleSection = computed(() => showOverviewSection.value || showRuntimeSection.value || showTTSSection.value || showManagedResourcesSection.value)

function updateAIProtocol(protocol: AIProtocol) {
  updateAIConfig('protocol', protocol)
}

function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  void settingsStore.update({ [key]: value } as Partial<AppSettings>)
}

function updateAIConfig(key: keyof AIConfig, value: AIConfig[keyof AIConfig]) {
  if (key === 'protocol') {
    const nextProtocol = value as AIProtocol
    const currentProtocol = aiConfig.value.protocol
    const currentPreset = AI_PROTOCOL_PRESETS[currentProtocol]
    const nextPreset = AI_PROTOCOL_PRESETS[nextProtocol]
    const partial: Partial<AIConfig> = { protocol: nextProtocol }

    availableAiModels.value = []
    aiModelLoadError.value = ''
    aiModelStatus.value = ''

    if (!aiConfig.value.baseUrl.trim() || aiConfig.value.baseUrl === currentPreset.baseUrl) {
      partial.baseUrl = nextPreset.baseUrl
    }

    if (!aiConfig.value.model.trim() || aiConfig.value.model === currentPreset.model) {
      partial.model = nextPreset.model
    }

    void aiStore.updateConfig(partial)
    return
  }

  if (key === 'baseUrl' || key === 'model') {
    aiModelLoadError.value = ''
    if (key === 'baseUrl') {
      aiModelStatus.value = ''
      availableAiModels.value = []
    }
  }

  void aiStore.updateConfig({ [key]: value } as Partial<AIConfig>)
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  const safeMin = Math.min(min, max)
  const safeMax = Math.max(min, max)
  return Math.min(Math.max(Math.round(value), safeMin), safeMax)
}

function handleContextWindowChange(rawValue: string) {
  const fallback = resolvedTokenLimits.value.selectedContextTokens
  const nextValue = clampInteger(Number.parseInt(rawValue, 10), 4096, selectedAiModelLimits.value.maxContextTokens, fallback)
  updateAIConfig('contextWindow', nextValue)
}

function handleMaxTokensChange(rawValue: string) {
  const fallback = resolvedTokenLimits.value.maxOutputTokens
  const nextValue = clampInteger(Number.parseInt(rawValue, 10), 256, selectedAiModelLimits.value.maxOutputTokens, fallback)
  updateAIConfig('maxTokens', nextValue)
}

function formatTokenCount(value: number) {
  return `${Math.max(value, 0).toLocaleString()} tokens`
}

async function saveAIConfigNow() {
  savingAIConfig.value = true

  try {
    await aiStore.updateConfig({ ...aiConfig.value })
    aiModelLoadError.value = ''
    aiModelStatus.value = 'AI 配置已手动保存，并已同步到所有窗口。'
    showToast('success', 'AI 配置已保存并同步')
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 AI 配置失败'
    aiModelLoadError.value = message
    showToast('error', message)
  } finally {
    savingAIConfig.value = false
  }
}

async function toggleWindowsMcpEnabled() {
  const nextValue = !settings.value.windowsMcpEnabled
  await settingsStore.update({ windowsMcpEnabled: nextValue })
  showToast('success', nextValue ? 'Windows MCP 已启用，AI 现在可以调用系统级工具' : 'Windows MCP 已关闭，AI 不会再调用系统级工具')
}

async function refreshAIModels() {
  if (!canFetchAIModels.value) {
    return
  }

  loadingAiModels.value = true
  aiModelLoadError.value = ''
  aiModelStatus.value = ''

  try {
    const models = await fetchAvailableModels(aiStore.config)
    availableAiModels.value = models
    aiModelStatus.value = models.length > 0 ? `已读取 ${models.length} 个模型，可直接选择。` : '当前接口没有返回模型列表，请手动输入模型名称。'
    if (!aiConfig.value.model.trim() && models[0]) {
      void aiStore.updateConfig({ model: models[0].name })
    }
  } catch (error) {
    availableAiModels.value = []
    aiModelLoadError.value = error instanceof Error ? error.message : '读取模型列表失败'
    showToast('error', aiModelLoadError.value)
  } finally {
    loadingAiModels.value = false
  }
}

function applyOfficialPreset() {
  const preset = AI_PROTOCOL_PRESETS[aiConfig.value.protocol]
  availableAiModels.value = []
  aiModelLoadError.value = ''
  aiModelStatus.value = ''
  void aiStore.updateConfig({
    protocol: aiConfig.value.protocol,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKey: aiConfig.value.protocol === 'ollama-local' ? '' : aiConfig.value.apiKey
  })
}

function openAIAssistantPage() {
  void router.push('/ai')
}

function openGeneralSettingsPage() {
  void router.push('/settings')
}

async function refreshSystemVoiceCatalog() {
  systemTTSSupported.value = isSystemSpeechSupported()
  if (!systemTTSSupported.value) {
    systemTTSVoices.value = []
    return
  }

  try {
    systemTTSVoices.value = await listSystemSpeechVoices()
  } catch (error) {
    systemTTSVoices.value = []
    console.warn('[AISettings] 系统语音列表读取失败', error)
  }
}

async function refreshAzureVoiceCatalog(silent = false) {
  if (!silent) {
    refreshingAzureVoiceCatalog.value = true
  }

  azureTTSSupported.value = isAzureSpeechSupported()
  if (!azureTTSSupported.value) {
    azureTTSVoices.value = []
    if (!silent) {
      setTTSError('当前环境暂不支持 Azure Speech 桥接。')
    }
    refreshingAzureVoiceCatalog.value = false
    return
  }

  try {
    azureTTSVoices.value = await listAzureSpeechVoices()
    azureTTSSupported.value = azureTTSVoices.value.length > 0
    if (!silent) {
      setTTSStatus(azureTTSSupported.value
        ? `已读取 ${azureTTSVoices.value.length} 个 Azure 中文情绪音色，可直接试听。`
        : '当前未读取到 Azure 中文音色，请检查 Key、Region 或网络。')
    }
  } catch (error) {
    azureTTSVoices.value = []
    azureTTSSupported.value = false
    if (!silent) {
      setTTSError(error instanceof Error ? error.message : '读取 Azure Speech 音色列表失败')
    }
    console.warn('[AISettings] Azure 语音列表读取失败', error)
  } finally {
    if (!silent) {
      refreshingAzureVoiceCatalog.value = false
    }
  }
}

async function refreshEdgeVoiceCatalog(silent = false) {
  if (!silent) {
    refreshingEdgeVoiceCatalog.value = true
  }

  edgeTTSSupported.value = isEdgeSpeechSupported()
  if (!edgeTTSSupported.value) {
    edgeTTSVoices.value = []
    if (!silent) {
      setTTSError('当前环境暂不支持 Edge 神经语音桥接。')
    }
    refreshingEdgeVoiceCatalog.value = false
    return
  }

  try {
    edgeTTSVoices.value = await listEdgeSpeechVoices()
    edgeTTSSupported.value = edgeTTSVoices.value.length > 0
    if (!silent) {
      setTTSStatus(edgeTTSSupported.value
        ? `已读取 ${edgeTTSVoices.value.length} 个在线中文神经音色，可直接试听。`
        : '当前未读取到在线神经音色，请稍后重试。')
    }
  } catch (error) {
    edgeTTSVoices.value = []
    edgeTTSSupported.value = false
    if (!silent) {
      setTTSError(error instanceof Error ? error.message : '读取 Edge 神经语音列表失败')
    }
    console.warn('[AISettings] Edge 语音列表读取失败', error)
  } finally {
    if (!silent) {
      refreshingEdgeVoiceCatalog.value = false
    }
  }
}

async function handleTTSEngineChange(engine: string) {
  const nextEngine = normalizeTTSEngine(engine)
  const nextModelId = normalizeTTSModelId(
    settings.value.ttsModelId,
    nextEngine
  )

  if (nextEngine === AZURE_TTS_ENGINE) {
    await refreshAzureVoiceCatalog(true)
  }

  if (nextEngine === EDGE_TTS_ENGINE) {
    await refreshEdgeVoiceCatalog(true)
  }

  if (nextEngine === SYSTEM_TTS_ENGINE) {
    await refreshSystemVoiceCatalog()
  }

  const fallbackVoiceId = getDefaultTTSVoiceId(nextEngine)
  const preferredVoice = nextEngine === AZURE_TTS_ENGINE
    ? azureTTSVoices.value.find(voice => /zh-cn/i.test(voice.locale)) || azureTTSVoices.value[0] || getTTSVoiceOption(fallbackVoiceId, nextModelId, nextEngine)
    : nextEngine === EDGE_TTS_ENGINE
      ? edgeTTSVoices.value.find(voice => /zh-cn/i.test(voice.locale)) || edgeTTSVoices.value[0] || getTTSVoiceOption(fallbackVoiceId, nextModelId, nextEngine)
    : nextEngine === SYSTEM_TTS_ENGINE
      ? systemTTSVoices.value.find(voice => /zh/i.test(voice.locale)) || systemTTSVoices.value[0] || getTTSVoiceOption(fallbackVoiceId, nextModelId, nextEngine)
      : getTTSVoiceOption(settings.value.ttsVoiceId, nextModelId, nextEngine)

  await settingsStore.update({
    ttsEngine: nextEngine,
    ttsModelId: nextModelId || getDefaultTTSModelId(nextEngine),
    ttsVoiceId: preferredVoice.id,
    ttsVoiceName: preferredVoice.name
  })

  setTTSStatus(
    nextEngine === AZURE_TTS_ENGINE
      ? '已切换到 Azure Speech 情绪语音引擎，后续 AI 播报会优先走官方中文 style/styledegree。'
      : nextEngine === EDGE_TTS_ENGINE
      ? '已切换到 Edge 神经语音引擎，后续 AI 播报会优先走更清晰且可带情绪的中文在线音色。'
      : nextEngine === SYSTEM_TTS_ENGINE
        ? '已切换到系统语音引擎，后续播报会优先走系统低延迟音色。'
        : '已切换到 Kokoro 离线引擎，可继续切换模型并缓存。'
  )
  await refreshTTSCacheState(true)
}

function setTTSStatus(message: string) {
  ttsRuntimeStatus.value = message
  ttsRuntimeError.value = ''
}

function setTTSError(message: string) {
  ttsRuntimeStatus.value = ''
  ttsRuntimeError.value = message
}

async function refreshTTSCacheState(silent = false) {
  if (!silent) {
    refreshingTTSCacheState.value = true
  }

  try {
    if (isAzureSpeechEngine.value) {
      await refreshAzureVoiceCatalog(true)
      ttsModelCached.value = azureTTSSupported.value
      ttsVoiceCached.value = azureTTSSupported.value && azureTTSVoices.value.length > 0

      if (!silent) {
        setTTSStatus(azureTTSSupported.value
          ? `Azure Speech 已可用，当前可选 ${azureTTSVoices.value.length} 个中文情绪音色，支持官方 style/styledegree。`
          : 'Azure Speech 暂不可用，请检查 Key、Region 与网络，或切换到 Edge / 系统 / Kokoro 引擎。')
      }
      return
    }

    if (isEdgeSpeechEngine.value) {
      await refreshEdgeVoiceCatalog(true)
      ttsModelCached.value = edgeTTSSupported.value
      ttsVoiceCached.value = edgeTTSSupported.value && edgeTTSVoices.value.length > 0

      if (!silent) {
        setTTSStatus(edgeTTSSupported.value
          ? `Edge 神经语音在线可用，当前可选 ${edgeTTSVoices.value.length} 个中文音色，无需下载模型或音色。`
          : 'Edge 神经语音暂不可用，请检查网络后重试，或切换到系统 / Kokoro 引擎。')
      }
      return
    }

    if (isSystemSpeechEngine.value) {
      await refreshSystemVoiceCatalog()
      ttsModelCached.value = systemTTSSupported.value
      ttsVoiceCached.value = systemTTSSupported.value

      if (!silent) {
        setTTSStatus(systemTTSSupported.value
          ? '系统语音由系统直接提供，无需额外下载模型或音色。'
          : '当前环境不支持系统语音，请切换到 Kokoro 离线引擎。')
      }
      return
    }

    const [modelCached, voiceCached] = await Promise.all([
      isTTSModelCached(settings.value.ttsModelId),
      isTTSVoiceCached(settings.value.ttsVoiceId)
    ])

    ttsModelCached.value = modelCached
    ttsVoiceCached.value = selectedTTSVoice.value?.builtIn ? true : voiceCached

    if (!silent) {
      const modelState = selectedTTSModel.value?.builtIn
        ? '模型已内置，可直接离线使用'
        : modelCached
          ? '模型已缓存到本地持久存储'
          : '模型尚未缓存，可按需远程下载'
      const voiceState = selectedTTSVoice.value?.builtIn
        ? '音色已内置，可立即播报'
        : ttsVoiceCached.value
          ? '音色已缓存到本地持久存储'
          : '音色尚未缓存，可按需远程下载'
      setTTSStatus(`${modelState}；${voiceState}。`)
    }
  } catch (error) {
    if (!silent) {
      setTTSError(error instanceof Error ? error.message : '读取 TTS 缓存状态失败')
    }
  } finally {
    if (!silent) {
      refreshingTTSCacheState.value = false
    }
  }
}

async function saveCurrentTTSSelection() {
  savingTTSSelection.value = true

  try {
    const nextVoice = ttsVoiceOptions.value.find(voice => voice.id === settings.value.ttsVoiceId)
      ?? getTTSVoiceOption(settings.value.ttsVoiceId, settings.value.ttsModelId, activeTTSEngine.value)
    await settingsStore.update({
      ttsEngine: activeTTSEngine.value,
      ttsEnabled: settings.value.ttsEnabled,
      ttsAutoPlayLive2D: settings.value.ttsAutoPlayLive2D,
      ttsShowMainReplyButton: settings.value.ttsShowMainReplyButton,
      ttsModelId: normalizeTTSModelId(settings.value.ttsModelId, activeTTSEngine.value),
      ttsVoiceId: nextVoice.id,
      ttsVoiceName: nextVoice.name,
      ttsAzureKey: settings.value.ttsAzureKey,
      ttsAzureRegion: settings.value.ttsAzureRegion,
      ttsEmotionStyle: settings.value.ttsEmotionStyle,
      ttsEmotionIntensity: settings.value.ttsEmotionIntensity,
      ttsSpeed: settings.value.ttsSpeed,
      ttsVolume: settings.value.ttsVolume
    })
    setTTSStatus('语音模型、音色与播报联动设置已保存。')
    showToast('success', 'TTS 配置已保存')
    await refreshTTSCacheState(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 TTS 配置失败'
    setTTSError(message)
    showToast('error', message)
  } finally {
    savingTTSSelection.value = false
  }
}

async function handleTTSModelChange(modelId: string) {
  const normalizedModelId = normalizeTTSModelId(modelId, activeTTSEngine.value)
  if (!normalizedModelId) {
    return
  }

  const nextVoice = getTTSVoiceOption(settings.value.ttsVoiceId, normalizedModelId, activeTTSEngine.value) || listTTSVoices(normalizedModelId, activeTTSEngine.value)[0]

  try {
    await settingsStore.update({
      ttsModelId: normalizedModelId,
      ttsVoiceId: nextVoice?.id || settings.value.ttsVoiceId,
      ttsVoiceName: nextVoice?.name || settings.value.ttsVoiceName
    })
    ttsCustomModelInput.value = normalizedModelId
    if (isAzureSpeechEngine.value) {
      setTTSStatus('Azure Speech 已切换到在线官方模型配置。')
    } else if (isEdgeSpeechEngine.value) {
      setTTSStatus('Edge 神经语音已切换到在线模型配置。')
    } else {
      setTTSStatus(getTTSModelOption(normalizedModelId, activeTTSEngine.value).builtIn ? '已切换到内置离线模型。' : '已切换到远程模型，可继续下载并保存到本地缓存。')
    }
    await refreshTTSCacheState(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : '切换 TTS 模型失败'
    setTTSError(message)
    showToast('error', message)
  }
}

async function applyCustomTTSModel() {
  if (isSystemSpeechEngine.value || isEdgeSpeechEngine.value || isAzureSpeechEngine.value) {
    setTTSStatus('当前引擎不需要自定义模型 ID。')
    return
  }

  const normalizedModelId = normalizeTTSModelId(ttsCustomModelInput.value)
  if (!normalizedModelId) {
    return
  }

  await handleTTSModelChange(normalizedModelId)
}

async function handleTTSVoiceChange(voiceId: string) {
  const nextVoice = ttsVoiceOptions.value.find(voice => voice.id === voiceId)
    ?? getTTSVoiceOption(voiceId, settings.value.ttsModelId, activeTTSEngine.value)
  if (!nextVoice) {
    return
  }

  try {
    await settingsStore.update({
      ttsVoiceId: nextVoice.id,
      ttsVoiceName: nextVoice.name
    })
    if (isAzureSpeechEngine.value) {
      setTTSStatus(`已切换到 Azure 情绪音色 ${nextVoice.name}，现在可以直接试听真实情绪播报。`)
    } else if (isEdgeSpeechEngine.value) {
      setTTSStatus(`已切换到 Edge 神经音色 ${nextVoice.name}，可直接试听情绪化中文播报。`)
    } else {
      setTTSStatus(nextVoice.builtIn ? `已切换到内置音色 ${nextVoice.name}。` : `已切换到音色 ${nextVoice.name}，可按需下载并保存。`)
    }
    await refreshTTSCacheState(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : '切换 TTS 音色失败'
    setTTSError(message)
    showToast('error', message)
  }
}

async function cacheSelectedTTSModel() {
  if (!selectedTTSModel.value) {
    return
  }

  if (isAzureSpeechEngine.value) {
    ttsModelCached.value = azureTTSSupported.value
    setTTSStatus(azureTTSSupported.value ? 'Azure Speech 为在线情绪引擎，无需下载模型。' : 'Azure Speech 暂不可用，请先完成 Key 与 Region 配置。')
    return
  }

  if (isEdgeSpeechEngine.value) {
    ttsModelCached.value = edgeTTSSupported.value
    setTTSStatus(edgeTTSSupported.value ? 'Edge 神经语音为在线引擎，无需下载模型。' : 'Edge 神经语音暂不可用，请检查网络后再试。')
    return
  }

  if (isSystemSpeechEngine.value) {
    ttsModelCached.value = systemTTSSupported.value
    setTTSStatus(systemTTSSupported.value ? '系统语音无需缓存模型。' : '当前环境不支持系统语音，请切换到 Kokoro。')
    return
  }

  if (selectedTTSModel.value.builtIn) {
    ttsModelCached.value = true
    setTTSStatus('当前模型已随应用内置，可直接离线使用。')
    return
  }

  cachingTTSModel.value = true

  try {
    await cacheTTSModel(settings.value.ttsModelId)
    ttsModelCached.value = true
    setTTSStatus(`模型 ${selectedTTSModel.value.name} 已下载并保存到本地缓存。`)
    showToast('success', 'TTS 模型已缓存')
  } catch (error) {
    const message = error instanceof Error ? error.message : '下载并保存模型失败'
    setTTSError(message)
    showToast('error', message)
  } finally {
    cachingTTSModel.value = false
  }
}

async function cacheSelectedTTSVoice() {
  if (!selectedTTSVoice.value) {
    return
  }

  if (isAzureSpeechEngine.value) {
    await refreshAzureVoiceCatalog()
    ttsVoiceCached.value = azureTTSSupported.value && azureTTSVoices.value.length > 0
    return
  }

  if (isEdgeSpeechEngine.value) {
    await refreshEdgeVoiceCatalog()
    ttsVoiceCached.value = edgeTTSSupported.value && edgeTTSVoices.value.length > 0
    return
  }

  if (isSystemSpeechEngine.value) {
    ttsVoiceCached.value = systemTTSSupported.value
    setTTSStatus(systemTTSSupported.value ? '系统语音无需缓存音色。' : '当前环境不支持系统语音，请切换到 Kokoro。')
    return
  }

  if (selectedTTSVoice.value.builtIn) {
    ttsVoiceCached.value = true
    setTTSStatus('当前音色已随应用内置，可直接离线播报。')
    return
  }

  cachingTTSVoice.value = true

  try {
    await cacheTTSVoice(selectedTTSVoice.value.id)
    ttsVoiceCached.value = true
    setTTSStatus(`音色 ${selectedTTSVoice.value.name} 已下载并保存到本地缓存。`)
    showToast('success', 'TTS 音色已缓存')
  } catch (error) {
    const message = error instanceof Error ? error.message : '下载并保存音色失败'
    setTTSError(message)
    showToast('error', message)
  } finally {
    cachingTTSVoice.value = false
  }
}

function handleTTSRuntimeProgress(event: Event) {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail || {}
  const status = typeof detail.status === 'string' ? detail.status : ''

  if (!status) {
    return
  }

  if (status === 'loading-model' || status === 'progress') {
    setTTSStatus('正在准备语音模型资源，请稍候。')
    return
  }

  if (status === 'device-fallback') {
    setTTSStatus('当前推理设备不可用，正在切换到后备语音后端。')
    return
  }

  if (status === 'model-ready') {
    ttsModelCached.value = true
    setTTSStatus('语音模型已经就绪，可以直接试听或播报。')
    return
  }

  if (status === 'voice-cached') {
    ttsVoiceCached.value = true
    setTTSStatus('音色资源已缓存到本地，可离线复用。')
    return
  }

  if (status === 'generating') {
    setTTSStatus('正在生成试听语音。')
    return
  }

  if (status === 'generated') {
    setTTSStatus('试听语音已生成并开始播放。')
    return
  }

  if (status === 'failed') {
    setTTSError(typeof detail.error === 'string' ? detail.error : 'TTS 资源准备失败')
  }
}

async function playTTSSample() {
  if (!ttsSampleText.value.trim()) {
    return
  }

  playingTTSSample.value = true

  try {
    await playTextToSpeech(settings.value, ttsSampleText.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : '试听播放失败'
    setTTSError(message)
    showToast('error', message)
  } finally {
    playingTTSSample.value = false
    await refreshTTSCacheState(true)
  }
}

function stopTTSSample() {
  playingTTSSample.value = false
  stopTTSPlayback()
}

async function clearScopedSessions(scope: AIConversationScope) {
  if (aiStore.streaming && aiStore.runtime.sessionScope === scope) {
    showToast('error', '当前对话域仍有任务在运行，请先停止后再清理。')
    return
  }

  const label = scope === 'live2d' ? 'Live2D 悬浮窗' : '主窗口 AI'
  if (!confirm(`确定要清空${label}的全部会话吗？此操作不可恢复。`)) {
    return
  }

  await aiStore.clearAllSessions(scope)
  showToast('success', `${label}会话已清空`)
}

async function clearScopedMemories(scope: AIConversationScope) {
  if (aiStore.streaming && aiStore.runtime.sessionScope === scope) {
    showToast('error', '当前对话域仍有任务在运行，请先停止后再清理。')
    return
  }

  const label = scope === 'live2d' ? 'Live2D 悬浮窗' : '主窗口 AI'
  if (!confirm(`确定要清空${label}的全部长期记忆吗？`)) {
    return
  }

  await aiStore.clearAllMemories(scope)
  showToast('success', `${label}长期记忆已清空`)
}

watch(() => settings.value.ttsModelId, (nextModelId) => {
  ttsCustomModelInput.value = nextModelId
}, { immediate: true })

watch(() => settings.value.ttsEngine, () => {
  void refreshSystemVoiceCatalog()
  void refreshAzureVoiceCatalog(true)
  void refreshEdgeVoiceCatalog(true)
}, { immediate: true })

watch(() => [settings.value.ttsAzureKey, settings.value.ttsAzureRegion], () => {
  if (isAzureSpeechEngine.value) {
    void refreshTTSCacheState(true)
  }
})

watch(() => [settings.value.ttsModelId, settings.value.ttsVoiceId], () => {
  void refreshTTSCacheState(true)
}, { immediate: true })

onMounted(() => {
  if (!aiStore.loaded) {
    void aiStore.init()
  }

  if (!resourcesStore.loaded) {
    void resourcesStore.init()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('openagent:tts-progress', handleTTSRuntimeProgress as EventListener)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('openagent:tts-progress', handleTTSRuntimeProgress as EventListener)
  }

  stopTTSPlayback()
})
</script>

<style lang="scss" scoped>
.ai-settings-page {
  display: grid;
  gap: 18px;
}

.page-hero,
.ai-settings-section {
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
  gap: 8px;

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.8;
    max-width: 720px;
  }
}

.page-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 30px;
  font-weight: 800;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-settings-section {
  display: grid;
  gap: 16px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 20px;
  }

  p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.summary-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.54);

  strong {
    color: var(--text-primary);
    font-size: 20px;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.summary-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
  gap: 18px;

  &:last-child {
    border-bottom: none;
  }
}

.align-start {
  align-items: flex-start;
}

.setting-label {
  .label-main {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 600;
  }

  .label-desc {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.7;
  }
}

.setting-input,
.setting-select,
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
    border-color: rgba(93, 135, 255, 0.45);
    box-shadow: 0 0 0 3px rgba(93, 135, 255, 0.12);
  }
}

.setting-input,
.setting-select {
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

.setting-input-sm {
  max-width: 160px;
}

.input-wrap,
.ai-input-stack,
.ai-model-stack,
.ai-token-stack {
  width: min(100%, 460px);
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
    background: rgba(93, 135, 255, 0.08);
    color: var(--text-primary);
  }
}

.input-wrap .setting-input {
  padding-right: 42px;
}

.ai-input-stack,
.ai-model-stack,
.ai-token-stack {
  display: grid;
  gap: 8px;
}

.ai-model-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.field-tip {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.field-tip-error {
  color: #b42318;
}

.ai-capability-panel {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.6);
}

.ai-capability-header {
  display: flex;
  align-items: center;
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

.ai-capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-capability-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.1);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;

  &.is-muted {
    background: rgba(180, 180, 180, 0.14);
    color: var(--text-secondary);
  }

  &.is-limit {
    background: rgba(255, 174, 113, 0.16);
    color: #9a3412;
  }
}

.ai-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.ai-inline-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(180, 180, 180, 0.14);
  color: var(--text-secondary);

  &.is-enabled {
    background: rgba(84, 201, 159, 0.14);
    color: #187d59;
  }

  &.is-disabled {
    background: rgba(220, 80, 80, 0.12);
    color: #b42318;
  }
}

.ai-provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ai-provider-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.46);
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
    line-height: 1.6;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(93, 135, 255, 0.28);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(93, 135, 255, 0.42);
    background: linear-gradient(135deg, rgba(93, 135, 255, 0.12), rgba(70, 196, 165, 0.1));
  }
}

.provider-card-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.12);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
}

.ai-runtime-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(96, 140, 255, 0.14), rgba(85, 198, 165, 0.1));
}

.ai-runtime-copy {
  display: grid;
  gap: 6px;

  strong {
    color: var(--text-primary);
    font-size: 15px;
  }

  p,
  small {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.range-wrap {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.range-wrap-wide {
  width: min(100%, 460px);

  input[type='range'] {
    flex: 1;
  }
}

.range-val {
  min-width: 48px;
  color: var(--text-primary);
  font-weight: 700;
  text-align: right;
}

.switch {
  position: relative;
  display: inline-flex;
  width: 52px;
  height: 30px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
}

.slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(180, 180, 180, 0.28);
  transition: background $transition-fast;

  &::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    transition: transform $transition-fast;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  }
}

.switch input:checked + .slider {
  background: rgba(93, 135, 255, 0.72);
}

.switch input:checked + .slider::before {
  transform: translateX(22px);
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;
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

.tts-preview-actions {
  justify-content: flex-start;
}

.tts-resource-stack {
  width: min(100%, 620px);
  display: grid;
  gap: 8px;
}

.tts-search-row,
.tts-custom-model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.tts-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tts-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-control-grid {
  width: min(100%, 620px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.scope-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.62);

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }
}

.scope-card-meta {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.scope-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 1100px) {
  .ai-provider-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-hero,
  .ai-runtime-banner,
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .ai-model-actions {
    grid-template-columns: 1fr;
  }

  .input-wrap,
  .ai-input-stack,
  .ai-model-stack,
  .ai-token-stack,
  .tts-resource-stack,
  .range-wrap-wide,
  .scope-control-grid {
    width: 100%;
  }

  .tts-search-row,
  .tts-custom-model-row {
    grid-template-columns: 1fr;
  }

  .scope-control-grid {
    grid-template-columns: 1fr;
  }
}
</style>