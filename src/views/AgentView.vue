<template>
  <div class="agent-view">
    <section class="agent-hero glass-panel">
      <div class="hero-main">
        <p class="hero-eyebrow">Agent Workbench</p>
        <h1>{{ currentAgent?.name || '小柔' }}</h1>
        <div class="hero-title-row">
          <span class="hero-chip is-mode">Agent</span>
          <span class="hero-chip" :class="`is-${agentRuntimeTone}`">{{ agentRuntimeStatusLabel }}</span>
          <span class="hero-chip">{{ currentAgentTypeLabel }}</span>
        </div>
        <p class="hero-subline">{{ heroSummary }}</p>
      </div>
      <div class="hero-actions">
        <button class="mode-pill active">Agent</button>
        <button class="mode-pill ghost" @click="goToIDEView">IDE</button>
        <button class="hero-link" @click="toggleAgentSidebar">{{ agentWorkbenchLayout.sidebarCollapsed ? '展开侧栏' : '收起侧栏' }}</button>
        <button class="hero-link" @click="openSettingsPage">AI 设置</button>
      </div>
    </section>

    <section class="agent-workbench-bar glass-panel">
      <div class="workbench-bar-copy">
        <span class="workbench-pill is-mode">{{ currentScopeLabel }}</span>
        <span class="workbench-pill">{{ compactSessionLabel }}</span>
        <span class="workbench-pill">{{ currentSessionAgent?.name || currentAgent?.name || '默认角色' }}</span>
        <span class="workbench-pill">{{ currentSession ? `${currentSession.messages.length} 条消息` : `${scopedSessionCount} 会话` }}</span>
        <span v-if="currentContextMetrics" class="workbench-pill">
          上下文 {{ formatCompactTokens(currentContextMetrics.estimatedInputTokens) }} / {{ formatCompactTokens(currentContextMetrics.modelMaxContextTokens) }}
        </span>
      </div>
      <div class="workbench-bar-actions">
        <button class="workbench-toggle" :class="{ active: !agentWorkbenchLayout.sidebarCollapsed }" @click="toggleAgentSidebar">侧栏</button>
        <button class="workbench-toggle" :class="{ active: selectedScope === 'main' }" @click="switchAgentScope('main')">主窗口</button>
        <button class="workbench-toggle" :class="{ active: selectedScope === 'live2d' }" @click="switchAgentScope('live2d')">Live2D</button>
        <button class="workbench-toggle" :disabled="aiStore.streaming || !aiStore.isConfigured" @click="startNewSession">新会话</button>
        <button class="workbench-toggle" :class="{ active: agentSidebarTab === 'sessions' }" @click="selectAgentSidebarTab('sessions')">会话</button>
        <button class="workbench-toggle" :class="{ active: agentSidebarTab === 'roles' }" @click="selectAgentSidebarTab('roles')">角色</button>
        <button class="workbench-toggle" :class="{ active: agentSidebarTab === 'memory' }" @click="selectAgentSidebarTab('memory')">记忆</button>
        <button class="workbench-toggle" :class="{ active: agentSidebarTab === 'resources' }" @click="selectAgentSidebarTab('resources')">资源</button>
        <button class="workbench-toggle" :class="{ active: agentSidebarTab === 'tasks' }" @click="selectAgentSidebarTab('tasks')">任务</button>
        <button class="workbench-toggle" @click="resetAgentSidebarLayout">重置栏宽</button>
      </div>
    </section>

    <div class="agent-layout" :style="agentWorkbenchStyle">
      <aside class="agent-sidebar" :class="{ 'is-collapsed': agentWorkbenchLayout.sidebarCollapsed }">
        <div class="agent-sidebar-rail glass-panel">
          <button class="sidebar-tab" :class="{ active: agentSidebarTab === 'sessions' }" @click="selectAgentSidebarTab('sessions')">会话</button>
          <button class="sidebar-tab" :class="{ active: agentSidebarTab === 'roles' }" @click="selectAgentSidebarTab('roles')">角色</button>
          <button class="sidebar-tab" :class="{ active: agentSidebarTab === 'memory' }" @click="selectAgentSidebarTab('memory')">记忆</button>
          <button class="sidebar-tab" :class="{ active: agentSidebarTab === 'resources' }" @click="selectAgentSidebarTab('resources')">资源</button>
          <button class="sidebar-tab" :class="{ active: agentSidebarTab === 'tasks' }" @click="selectAgentSidebarTab('tasks')">任务</button>
          <button class="sidebar-tab sidebar-tab--ghost" @click="toggleAgentSidebar">{{ agentWorkbenchLayout.sidebarCollapsed ? '>' : '<' }}</button>
        </div>

        <div class="agent-sidebar-panel" :class="{ 'is-hidden': agentWorkbenchLayout.sidebarCollapsed }">
          <div class="sidebar-panel-head">
            <div>
              <p class="hero-eyebrow">Workspace</p>
              <strong>{{ currentSidebarTitle }}</strong>
            </div>
            <span class="sidebar-scope">{{ selectedScope === 'live2d' ? 'Live2D' : '主窗口' }}</span>
          </div>

          <AgentSessionList
            v-if="agentSidebarTab === 'sessions'"
            :sessions="combinedSessions"
            :selected-session-id="selectedSessionId"
            :streaming="aiStore.streaming"
            :create-disabled="!aiStore.isConfigured"
            @new-session="startNewSession"
            @select-session="handleSessionSelect"
            @delete-session="deleteSession"
            @clear-sessions="clearAllSessions"
          />

          <AgentProfileManager
            v-else-if="agentSidebarTab === 'roles'"
            :agents="agentProfiles"
            :available-models="availableAiModels"
            :selected-agent-id="selectedAgentId"
            :current-agent-id="currentSessionAgentId"
            :current-scope="selectedScope"
            :current-session-has-messages="Boolean(currentSession?.messages.length)"
            :streaming="aiStore.streaming"
            @select-agent="handleSelectAgent"
            @save-agent="handleSaveAgent"
            @delete-agent="handleDeleteAgent"
          />

          <AgentMemoryPanel
            v-else-if="agentSidebarTab === 'memory'"
            :scope="selectedScope"
            :agent-id="currentSessionAgentId || selectedAgentId"
            :agent-name="currentAgent?.name"
          />

          <AgentResourcesPanel
            v-else-if="agentSidebarTab === 'resources'"
            :agent-name="currentAgent?.name"
            :mcp-enabled="Boolean(currentAgentCapabilities?.mcpEnabled)"
            :skill-enabled="Boolean(currentAgentCapabilities?.skillEnabled)"
          />

          <AgentTaskBoard v-else :task="currentTask" :plan="latestPlan" />
        </div>
      </aside>

      <button class="agent-splitter" type="button" aria-label="resize agent sidebar" @pointerdown="startAgentResize" @dblclick="resetAgentSidebarLayout" />

      <div class="agent-center">
        <div class="agent-runtime-stack">
          <AgentToolbar
            :preferences="aiStore.preferences"
            :model-load-error="modelLoadError"
            @toggle-thinking="toggleThinkingMode"
            @cycle-thinking="cycleThinkingLevel"
            @toggle-planning="togglePlanningMode"
            @toggle-memory="toggleAutoMemory"
            @open-settings="openSettingsPage"
          />

          <section v-if="showAgentRuntimeStatus" class="agent-warning glass-panel">
            <div class="agent-warning-copy">
              <strong>{{ agentRuntimeNoticeTitle }}</strong>
              <p>{{ agentRuntimeNoticeDescription }}</p>
            </div>

            <div class="agent-warning-inline">
              <span
                v-for="item in agentRuntimeChecks"
                :key="item.key"
                class="agent-warning-pill"
                :class="{ 'is-ready': item.ready, 'is-problem': !item.ready }"
              >
                {{ item.label }}: {{ item.value }}
              </span>
            </div>

            <div class="agent-warning-actions">
              <button class="warning-action is-primary" type="button" @click="openSettingsPage">打开 AI 设置</button>
              <button
                class="warning-action"
                type="button"
                :disabled="!canRefreshModels || loadingAiModels"
                @click="refreshModelOptions"
              >
                {{ loadingAiModels ? '刷新中...' : '刷新模型列表' }}
              </button>
              <button class="warning-action" type="button" @click="openSub2ApiPage">Sub2API</button>
            </div>
          </section>
        </div>

        <AgentMessageList
          ref="messageListRef"
          :scope-hint="selectedScope"
          :session="currentSession"
          :streaming="aiStore.streaming"
          :streaming-content="streamingContent"
          :streaming-reasoning-content="streamingReasoningContent"
          :playing-message-id="playingMessageId"
          :starter-prompts="starterPrompts"
          :show-voice-actions="showVoiceActions"
          :assistant-label="currentAgent?.name || 'Agent'"
          @apply-prompt="applyStarterPrompt"
          @play-message="playAssistantMessage"
        />

        <AgentInputBar
          :model-value="inputText"
          :attachments="pendingAttachments"
          :streaming="aiStore.streaming"
          :send-disabled="sendButtonDisabled"
          :current-model-label="currentModelLabel"
          :current-model-name="runtimeAiConfig.model"
          :available-models="availableAiModels"
          :loading-models="loadingAiModels"
          :can-refresh-models="canRefreshModels"
          :max-auto-steps="aiStore.preferences.maxAutoSteps"
          :recommended-auto-steps="recommendedAutoSteps"
          :capturing-screenshot="capturingScreenshot"
          @update:model-value="inputText = $event"
          @send="sendMessage"
          @stop="stopCurrentRun"
          @select-files="handleSelectedFiles"
          @capture-screenshot="captureManualScreenshot"
          @remove-attachment="removePendingAttachment"
          @refresh-models="refreshModelOptions"
          @change-model="handleModelChange"
          @step-delta="adjustMaxAutoSteps"
          @apply-recommended-steps="applyRecommendedAutoSteps"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AIChatAttachment, AIConversationScope, AIAgentProfile, AIProviderModel } from '@/types'
import AgentInputBar from '@/components/agent/AgentInputBar.vue'
import AgentMemoryPanel from '@/components/agent/AgentMemoryPanel.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentProfileManager from '@/components/agent/AgentProfileManager.vue'
import AgentResourcesPanel from '@/components/agent/AgentResourcesPanel.vue'
import AgentSessionList from '@/components/agent/AgentSessionList.vue'
import AgentTaskBoard from '@/components/agent/AgentTaskBoard.vue'
import AgentToolbar from '@/components/agent/AgentToolbar.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { fetchAvailableModels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { cancelConversationRun, createAttachmentsFromFiles, createImageAttachmentFromDataUrl, startConversationTurn } from '@/utils/aiConversation'
import { resolveMoodAwareTtsOverrides } from '@/utils/agentMood'
import { playTextToSpeech } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const route = useRoute()

const selectedScope = ref<AIConversationScope>('main')
const selectedSessionId = ref('')
const inputText = ref('')
const pendingAttachments = ref<AIChatAttachment[]>([])
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const modelLoadError = ref('')
const playingMessageId = ref('')
const capturingScreenshot = ref(false)
const agentSidebarTab = ref<'sessions' | 'roles' | 'memory' | 'resources' | 'tasks'>('sessions')
const agentWorkbenchLayout = ref({
  sidebarWidth: 320,
  sidebarCollapsed: false,
})
const messageListRef = ref<{ scrollToBottom: () => void } | null>(null)
let removeAgentResizeListeners: (() => void) | null = null

const starterPrompts = [
  '先帮我拆解需求并给出详细执行计划，暂时先不要动手，等我确认后再持续推进。',
  '从当前角色和能力边界出发，告诉我这轮任务还缺哪些上下文、风险或约束。',
  '根据当前角色的人设和能力，直接说明你现在可以替我做什么，以及哪些事情需要我确认。'
]

const mainSessions = computed(() => aiStore.getSortedSessions('main'))
const live2dSessions = computed(() => aiStore.getSortedSessions('live2d'))
const agentProfiles = computed(() => aiStore.getAgentProfiles().filter(agent => agent.id !== 'agent-ide-master'))
const selectedAgentId = computed(() => aiStore.getSelectedAgentId(selectedScope.value))
const combinedSessions = computed(() => {
  const pinnedLive2D = live2dSessions.value
    .map(session => ({ ...session, isPinned: session.title.trim() === 'Live2D' }))
    .sort((left, right) => {
      if ((left.isPinned || false) !== (right.isPinned || false)) {
        return left.isPinned ? -1 : 1
      }
      return right.updatedAt - left.updatedAt
    })

  return [
    ...pinnedLive2D,
    ...mainSessions.value.map(session => ({ ...session, isPinned: false }))
  ]
})
const scopedSessionCount = computed(() => aiStore.getSortedSessions(selectedScope.value).length)
const currentSession = computed(() => (selectedSessionId.value ? aiStore.getSessionById(selectedSessionId.value) : null))
const currentTask = computed(() => (currentSession.value ? aiStore.getLatestTaskForSession(currentSession.value.id) : null))
const currentSessionAgent = computed(() => currentSession.value ? aiStore.getSessionAgent(currentSession.value) : null)
const currentSessionAgentId = computed(() => currentSessionAgent.value?.id || '')
const currentAgent = computed(() => currentSessionAgent.value || aiStore.getSelectedAgent(selectedScope.value))
const currentScopeLabel = computed(() => {
  if (selectedScope.value === 'live2d') {
    return 'Live2D'
  }

  if (selectedScope.value === 'ide') {
    return 'IDE'
  }

  return '主窗口'
})
const agentWorkbenchStyle = computed(() => ({
  '--agent-sidebar-width': agentWorkbenchLayout.value.sidebarCollapsed
    ? '72px'
    : `${agentWorkbenchLayout.value.sidebarWidth}px`,
  '--agent-sidebar-splitter': agentWorkbenchLayout.value.sidebarCollapsed ? '0px' : '6px',
}))
const currentSidebarTitle = computed(() => {
  if (agentSidebarTab.value === 'sessions') {
    return '会话与角色入口'
  }

  if (agentSidebarTab.value === 'roles') {
    return '角色与能力配置'
  }

  if (agentSidebarTab.value === 'memory') {
    return '长期记忆管理'
  }

  if (agentSidebarTab.value === 'resources') {
    return '托管资源与能力边界'
  }

  return '当前任务与计划'
})
const runtimeAiConfig = computed(() => aiStore.getEffectiveConfig(currentSession.value || selectedScope.value))
const currentAgentCapabilities = computed(() => currentSession.value
  ? aiStore.getEffectiveAgentCapabilities(currentSession.value)
  : currentAgent.value?.capabilities || null)
const latestPlan = computed(() => {
  const plans = [...aiStore.projectPlans]
  if (plans.length === 0) {
    return null
  }
  return plans.sort((left, right) => right.updatedAt - left.updatedAt)[0]
})
const streamingContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.content : ''))
const streamingReasoningContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.reasoningContent : ''))
const currentContextMetrics = computed(() => {
  if (!currentSession.value) {
    return aiStore.runtime.context
  }

  if (aiStore.runtime.sessionId === currentSession.value.id && aiStore.runtime.context) {
    return aiStore.runtime.context
  }

  return aiStore.getContextMetrics(currentSession.value.id)
})
const canRefreshModels = computed(() => {
  if (!runtimeAiConfig.value.baseUrl.trim()) {
    return false
  }

  if (runtimeAiConfig.value.protocol === 'ollama-local' || runtimeAiConfig.value.protocol === 'custom') {
    return true
  }

  return runtimeAiConfig.value.apiKey.trim().length > 0
})
const apiKeyRequired = computed(() => !['ollama-local', 'custom'].includes(runtimeAiConfig.value.protocol))
const modelCatalogSummary = computed(() => {
  if (loadingAiModels.value) {
    return '读取中'
  }

  if (modelLoadError.value) {
    return '读取失败'
  }

  if (availableAiModels.value.length > 0) {
    return `${availableAiModels.value.length} 个`
  }

  return canRefreshModels.value ? '未读取' : '待配置'
})
const agentRuntimeChecks = computed(() => [
  {
    key: 'base-url',
    label: '接口地址',
    value: runtimeAiConfig.value.baseUrl.trim() || '未设置',
    note: runtimeAiConfig.value.protocol,
    ready: runtimeAiConfig.value.baseUrl.trim().length > 0,
  },
  {
    key: 'auth',
    label: '鉴权状态',
    value: apiKeyRequired.value
      ? (runtimeAiConfig.value.apiKey.trim().length > 0 ? '已提供 API Key' : '缺少 API Key')
      : '当前协议可省略',
    note: apiKeyRequired.value ? '用于远端模型列表与对话请求' : '本地 / 自托管协议',
    ready: !apiKeyRequired.value || runtimeAiConfig.value.apiKey.trim().length > 0,
  },
  {
    key: 'model',
    label: '当前模型',
    value: runtimeAiConfig.value.model.trim() || '未选择',
    note: currentAgent.value ? `角色 ${currentAgent.value.name}` : '使用全局默认配置',
    ready: runtimeAiConfig.value.model.trim().length > 0,
  },
  {
    key: 'catalog',
    label: '模型列表',
    value: modelCatalogSummary.value,
    note: modelLoadError.value || (loadingAiModels.value ? '正在拉取接口返回模型' : '用于验证前后端联调'),
    ready: availableAiModels.value.length > 0 && !modelLoadError.value,
  }
])
const agentRuntimeNoticeTitle = computed(() => {
  if (!aiStore.isConfigured) {
    return '当前角色还没有可用的运行配置'
  }

  if (modelLoadError.value) {
    return '模型列表读取失败，需要继续联调接口'
  }

  if (canRefreshModels.value && availableAiModels.value.length === 0) {
    return '当前接口尚未返回可用模型列表'
  }

  return '请继续确认 Agent 运行时联调状态'
})
const agentRuntimeNoticeDescription = computed(() => {
  if (modelLoadError.value) {
    return modelLoadError.value
  }

  if (!aiStore.isConfigured) {
    return '先补齐当前角色的接口地址、鉴权信息和模型选择，Agent 才能把角色能力边界真正映射到对话链路里。'
  }

  if (canRefreshModels.value && availableAiModels.value.length === 0) {
    return '当前角色已经具备基础连接信息，但模型目录仍未返回结果。建议先刷新模型列表，再决定是否切换到 Sub2API 或设置页继续排查。'
  }

  return '当前工作台仍建议确认一次模型目录和接口返回，避免角色切换后继续沿用旧的联调结果。'
})
const showAgentRuntimeStatus = computed(() => {
  if (!aiStore.isConfigured) {
    return true
  }

  if (modelLoadError.value) {
    return true
  }

  return canRefreshModels.value && !loadingAiModels.value && availableAiModels.value.length === 0
})
const agentRuntimeTone = computed(() => {
  if (loadingAiModels.value) {
    return 'loading'
  }

  if (!aiStore.isConfigured || (canRefreshModels.value && availableAiModels.value.length === 0)) {
    return 'warning'
  }

  if (modelLoadError.value) {
    return 'danger'
  }

  return 'ready'
})
const agentRuntimeStatusLabel = computed(() => {
  if (loadingAiModels.value) {
    return '模型目录读取中'
  }

  if (!aiStore.isConfigured) {
    return '待补齐运行配置'
  }

  if (modelLoadError.value) {
    return '模型目录读取失败'
  }

  if (canRefreshModels.value && availableAiModels.value.length === 0) {
    return '待刷新模型目录'
  }

  return '运行配置已就绪'
})
const currentModelMeta = computed(() => {
  const matched = availableAiModels.value.find(model => model.name === runtimeAiConfig.value.model || model.id === runtimeAiConfig.value.model)
  if (matched) {
    return matched
  }

  if (!runtimeAiConfig.value.model.trim()) {
    return null
  }

  return {
    id: runtimeAiConfig.value.model,
    name: runtimeAiConfig.value.model,
    label: runtimeAiConfig.value.model,
    capabilities: inferModelCapabilities(runtimeAiConfig.value.model, runtimeAiConfig.value.protocol),
    limits: inferModelLimits(runtimeAiConfig.value.model, runtimeAiConfig.value.protocol)
  }
})
const currentModelLabel = computed(() => currentModelMeta.value?.label || runtimeAiConfig.value.model.trim() || '未选择')
const currentAgentTypeLabel = computed(() => currentAgent.value?.personaType === 'emotional' ? '情绪型 Agent' : '功能型 Agent')
const compactSessionLabel = computed(() => {
  if (!currentSession.value) {
    return '等待会话'
  }

  const raw = currentSession.value.title.trim()
  if (raw.length <= 20) {
    return raw
  }

  return `${raw.slice(0, 20)}…`
})
const heroSummary = computed(() => {
  if (!currentSession.value) {
    return `${currentScopeLabel.value} 已就绪，输入后会自动创建会话并固定停靠底部输入区。`
  }

  return `${currentScopeLabel.value} 正在运行，消息区和侧栏均为独立滚动，不会再挤压输入区。`
})
const recommendedAutoSteps = computed(() => getRecommendedAutoSteps(runtimeAiConfig.value))
const sendButtonDisabled = computed(() => {
  if (aiStore.streaming) {
    return false
  }

  if (!aiStore.isConfigured) {
    return true
  }

  return !inputText.value.trim() && pendingAttachments.value.length === 0
})
const showVoiceActions = computed(() => {
  if (!settingsStore.settings.ttsEnabled) {
    return false
  }

  if (currentAgent.value?.tts.autoPlayReplies) {
    return true
  }

  return currentSession.value?.scope === 'live2d' || settingsStore.settings.ttsShowMainReplyButton
})
const validSidebarTabs = ['sessions', 'roles', 'memory', 'resources', 'tasks'] as const

watch(
  () => [selectedSessionId.value, currentSession.value?.messages.at(-1)?.id ?? '', aiStore.runtime.updatedAt],
  () => {
    scrollMessageListToBottom()
  }
)

watch(combinedSessions, () => {
  if (!currentSession.value && combinedSessions.value.length > 0) {
    initializeSelection()
  }
})

watch(
  () => [route.query.sessionId, route.query.scope, route.query.panel],
  () => {
    initializeSelection()
  }
)

watch(
  () => [selectedScope.value, selectedSessionId.value, agentSidebarTab.value],
  () => {
    syncAgentWorkbenchRoute()
  }
)

watch(
  () => [runtimeAiConfig.value.baseUrl, runtimeAiConfig.value.apiKey, runtimeAiConfig.value.protocol, currentSessionAgentId.value],
  () => {
    void refreshModelOptions()
  }
)

onMounted(async () => {
  aiStore.setAgentMode('agent')
  if (!aiStore.loaded) {
    await aiStore.init()
  }
  loadAgentWorkbenchLayout()
  initializeSelection()
  void refreshModelOptions()
})

onBeforeUnmount(() => {
  removeAgentResizeListeners?.()
})

function getRequestedScope(): AIConversationScope | null {
  return route.query.scope === 'live2d' || route.query.scope === 'main'
    ? route.query.scope
    : null
}

function getRequestedSidebarTab() {
  if (typeof route.query.panel !== 'string') {
    return null
  }

  return validSidebarTabs.includes(route.query.panel as (typeof validSidebarTabs)[number])
    ? route.query.panel as (typeof validSidebarTabs)[number]
    : null
}

function initializeSelection() {
  const requestedPanel = getRequestedSidebarTab()
  if (requestedPanel) {
    agentSidebarTab.value = requestedPanel
    ensureSidebarWidthForTab(requestedPanel)
  }

  const requestedSessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
  if (requestedSessionId) {
    const session = aiStore.getSessionById(requestedSessionId)
    if (session) {
      selectedScope.value = session.scope
      selectedSessionId.value = session.id
      aiStore.switchSession(session.id, session.scope)
      return
    }
  }

  const requestedScope = getRequestedScope()
  if (requestedScope) {
    const scopedFallback = aiStore.getActiveSession(requestedScope) || aiStore.getSortedSessions(requestedScope)[0] || null
    if (scopedFallback) {
      selectedScope.value = scopedFallback.scope
      selectedSessionId.value = scopedFallback.id
      aiStore.switchSession(scopedFallback.id, scopedFallback.scope)
      return
    }
  }

  const selected = selectedSessionId.value ? aiStore.getSessionById(selectedSessionId.value) : null
  if (selected) {
    selectedScope.value = selected.scope
    return
  }

  const fallback = aiStore.getActiveSession('main') || aiStore.getActiveSession('live2d') || combinedSessions.value[0] || null
  if (!fallback) {
    selectedSessionId.value = ''
    selectedScope.value = requestedScope || 'main'
    return
  }

  selectedSessionId.value = fallback.id
  selectedScope.value = fallback.scope
  aiStore.switchSession(fallback.id, fallback.scope)
}

function syncAgentWorkbenchRoute() {
  const nextSessionId = selectedSessionId.value || ''
  const nextScope = selectedScope.value === 'live2d' ? 'live2d' : 'main'
  const nextPanel = agentSidebarTab.value === 'sessions' ? '' : agentSidebarTab.value
  const currentSessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
  const currentScope = typeof route.query.scope === 'string' ? route.query.scope : ''
  const currentPanel = typeof route.query.panel === 'string' ? route.query.panel : ''

  if (
    currentSessionId === nextSessionId
    && currentScope === nextScope
    && currentPanel === nextPanel
  ) {
    return
  }

  const nextQuery = {
    ...route.query,
    scope: nextScope,
  } as Record<string, string>

  if (nextSessionId) {
    nextQuery.sessionId = nextSessionId
  } else {
    delete nextQuery.sessionId
  }

  if (nextPanel) {
    nextQuery.panel = nextPanel
  } else {
    delete nextQuery.panel
  }

  void router.replace({
    path: route.path,
    query: nextQuery,
  })
}

function scrollMessageListToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      messageListRef.value?.scrollToBottom()
    })
  })
}

function formatCompactTokens(value?: number) {
  if (!Number.isFinite(value) || typeof value !== 'number' || value <= 0) {
    return '-'
  }

  if (value >= 1_000_000) {
    const compact = value / 1_000_000
    return `${compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)}m`
  }

  if (value >= 1_000) {
    const compact = value / 1_000
    return `${compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)}k`
  }

  return String(Math.round(value))
}

function applyStarterPrompt(prompt: string) {
  inputText.value = prompt
}

async function refreshModelOptions() {
  if (!canRefreshModels.value) {
    availableAiModels.value = []
    return
  }

  loadingAiModels.value = true
  modelLoadError.value = ''

  try {
    availableAiModels.value = await fetchAvailableModels(runtimeAiConfig.value)
  } catch (error) {
    availableAiModels.value = []
    modelLoadError.value = error instanceof Error ? error.message : '模型列表读取失败'
  } finally {
    loadingAiModels.value = false
  }
}

async function handleModelChange(modelName: string) {
  const nextModel = modelName.trim()
  if (!nextModel || nextModel === runtimeAiConfig.value.model) {
    return
  }

  const previousRecommended = recommendedAutoSteps.value
  if (currentAgent.value) {
    await aiStore.upsertAgentProfile({
      ...currentAgent.value,
      preferredModel: nextModel
    })
    showToast('success', `已为角色 ${currentAgent.value.name} 切换模型：${nextModel}`)
  } else {
    await aiStore.updateConfig({ model: nextModel })
  }

  if (aiStore.preferences.maxAutoSteps === previousRecommended) {
    await aiStore.updatePreferences({ maxAutoSteps: getRecommendedAutoSteps(aiStore.getEffectiveConfig(currentSession.value || selectedScope.value)) })
  }
}

async function toggleThinkingMode() {
  await aiStore.updatePreferences({ thinkingEnabled: !aiStore.preferences.thinkingEnabled })
}

async function cycleThinkingLevel() {
  if (!aiStore.preferences.thinkingEnabled) {
    return
  }

  const levels = ['low', 'medium', 'high'] as const
  const currentLevel = aiStore.preferences.thinkingLevel === 'off' ? 'medium' : aiStore.preferences.thinkingLevel
  const index = levels.indexOf(currentLevel as (typeof levels)[number])
  const nextLevel = levels[(index + 1) % levels.length]
  await aiStore.updatePreferences({ thinkingLevel: nextLevel })
}

async function togglePlanningMode() {
  await aiStore.updatePreferences({ planningMode: !aiStore.preferences.planningMode })
}

async function toggleAutoMemory() {
  await aiStore.updatePreferences({ autoMemory: !aiStore.preferences.autoMemory })
}

async function adjustMaxAutoSteps(delta: number) {
  const current = aiStore.preferences.maxAutoSteps
  if (current === 0 && delta > 0) {
    await aiStore.updatePreferences({ maxAutoSteps: 8 })
    return
  }

  const nextValue = current + delta
  await aiStore.updatePreferences({ maxAutoSteps: nextValue <= 0 ? 0 : nextValue })
}

async function applyRecommendedAutoSteps() {
  await aiStore.updatePreferences({ maxAutoSteps: recommendedAutoSteps.value })
}

function mergePendingAttachments(nextAttachments: AIChatAttachment[]) {
  pendingAttachments.value = [...pendingAttachments.value, ...nextAttachments].slice(0, 8)
}

async function handleSelectedFiles(files: File[]) {
  mergePendingAttachments(await createAttachmentsFromFiles(files))
}

function removePendingAttachment(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(attachment => attachment.id !== attachmentId)
}

function buildScreenshotAttachmentName() {
  const timestamp = new Date()
  const stamp = [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
    '-',
    String(timestamp.getHours()).padStart(2, '0'),
    String(timestamp.getMinutes()).padStart(2, '0'),
    String(timestamp.getSeconds()).padStart(2, '0'),
  ].join('')

  return `手动截图-${stamp}.png`
}

async function captureManualScreenshot() {
  if (capturingScreenshot.value || aiStore.streaming) {
    return
  }

  if (!window.electronAPI?.captureUserScreenshot) {
    showToast('error', '当前环境不支持系统手动截图')
    return
  }

  capturingScreenshot.value = true
  try {
    const result = await window.electronAPI.captureUserScreenshot()
    if (!result.success || !result.dataUrl) {
      if (!result.cancelled) {
        showToast('error', result.error || '手动截图失败')
      }
      return
    }

    const attachment = await createImageAttachmentFromDataUrl(result.dataUrl, {
      name: buildScreenshotAttachmentName(),
      source: 'user'
    })
    mergePendingAttachments([attachment])
    showToast('success', '截图已添加到输入框上方')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '手动截图失败')
  } finally {
    capturingScreenshot.value = false
  }
}

function stopCurrentRun() {
  cancelConversationRun(aiStore.runtime.sessionId)
}

function startNewSession() {
  if (aiStore.streaming || !aiStore.isConfigured) {
    return
  }

  const nextScope = currentSession.value?.scope || selectedScope.value
  const session = aiStore.createSession(undefined, nextScope, aiStore.getSelectedAgentId(nextScope))
  selectedScope.value = session.scope
  selectedSessionId.value = session.id
  scrollMessageListToBottom()
}

function switchAgentScope(scope: AIConversationScope) {
  if (selectedScope.value === scope && currentSession.value?.scope === scope) {
    return
  }

  selectedScope.value = scope
  const fallback = aiStore.getActiveSession(scope) || aiStore.getSortedSessions(scope)[0] || null
  if (!fallback) {
    selectedSessionId.value = ''
    return
  }

  selectedSessionId.value = fallback.id
  aiStore.switchSession(fallback.id, scope)
  scrollMessageListToBottom()
}

function handleSessionSelect(sessionId: string) {
  if (aiStore.streaming) {
    return
  }

  const session = aiStore.getSessionById(sessionId)
  if (!session) {
    return
  }

  selectedScope.value = session.scope
  selectedSessionId.value = session.id
  aiStore.switchSession(session.id, session.scope)
}

async function deleteSession(sessionId: string) {
  if (aiStore.streaming) {
    return
  }

  await aiStore.deleteSession(sessionId)
  if (selectedSessionId.value === sessionId) {
    initializeSelection()
  }
}

async function clearAllSessions() {
  if (aiStore.streaming) {
    return
  }

  const scope = currentSession.value?.scope || selectedScope.value
  const label = scope === 'live2d' ? 'Live2D 会话' : '主窗口会话'
  if (confirm(`确定要清空${label}吗？此操作不可恢复。`)) {
    await aiStore.clearAllSessions(scope)
    initializeSelection()
  }
}

async function handleSelectAgent(agentId: string) {
  const targetAgent = await aiStore.selectAgent(selectedScope.value, agentId)
  if (!targetAgent) {
    return
  }

  if (currentSession.value && currentSession.value.messages.length === 0) {
    await aiStore.assignSessionAgent(currentSession.value.id, targetAgent.id)
    return
  }

  if (currentSession.value) {
    showToast('info', `已切换默认角色为 ${targetAgent.name}，当前会话仍保持原角色。`)
  }
}

async function handleSaveAgent(profile: Omit<AIAgentProfile, 'createdAt' | 'updatedAt'> & Partial<Pick<AIAgentProfile, 'createdAt' | 'updatedAt'>>) {
  const saved = await aiStore.upsertAgentProfile(profile)
  await handleSelectAgent(saved.id)
  showToast('success', `已保存角色：${saved.name}`)
}

async function handleDeleteAgent(agentId: string) {
  const target = aiStore.getAgentProfile(agentId)
  if (!target) {
    return
  }

  if (!confirm(`确定删除角色“${target.name}”吗？`)) {
    return
  }

  const removed = await aiStore.removeAgentProfile(agentId)
  if (removed) {
    showToast('success', `已删除角色：${target.name}`)
  }
}

function loadAgentWorkbenchLayout() {
  try {
    const raw = window.localStorage.getItem('openagent.agent.workbench-layout')
    if (!raw) {
      return
    }

    const parsed = JSON.parse(raw) as Partial<typeof agentWorkbenchLayout.value>
    agentWorkbenchLayout.value.sidebarWidth = clampAgentSidebarWidth(parsed.sidebarWidth, 320)
    agentWorkbenchLayout.value.sidebarCollapsed = parsed.sidebarCollapsed === true
  } catch {
    // 忽略损坏的本地布局缓存，避免阻塞 Agent 页启动
  }
}

function persistAgentWorkbenchLayout() {
  window.localStorage.setItem('openagent.agent.workbench-layout', JSON.stringify(agentWorkbenchLayout.value))
}

function clampAgentSidebarWidth(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(440, Math.max(260, Math.round(value)))
}

function toggleAgentSidebar() {
  agentWorkbenchLayout.value.sidebarCollapsed = !agentWorkbenchLayout.value.sidebarCollapsed
  persistAgentWorkbenchLayout()
}

function resetAgentSidebarLayout() {
  agentWorkbenchLayout.value.sidebarCollapsed = false
  agentWorkbenchLayout.value.sidebarWidth = 320
  persistAgentWorkbenchLayout()
}

function selectAgentSidebarTab(tab: 'sessions' | 'roles' | 'memory' | 'resources' | 'tasks') {
  agentSidebarTab.value = tab
  if (agentWorkbenchLayout.value.sidebarCollapsed) {
    agentWorkbenchLayout.value.sidebarCollapsed = false
  }
  ensureSidebarWidthForTab(tab)
  persistAgentWorkbenchLayout()
}

function ensureSidebarWidthForTab(tab: 'sessions' | 'roles' | 'memory' | 'resources' | 'tasks') {
  if (tab !== 'roles') {
    return
  }

  if (agentWorkbenchLayout.value.sidebarWidth < 320) {
    agentWorkbenchLayout.value.sidebarWidth = 320
  }
}

function startAgentResize(event: PointerEvent) {
  if (window.innerWidth <= 960) {
    return
  }

  event.preventDefault()
  removeAgentResizeListeners?.()

  const startX = event.clientX
  const startWidth = agentWorkbenchLayout.value.sidebarWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handlePointerMove = (moveEvent: PointerEvent) => {
    agentWorkbenchLayout.value.sidebarCollapsed = false
    agentWorkbenchLayout.value.sidebarWidth = clampAgentSidebarWidth(startWidth + (moveEvent.clientX - startX), startWidth)
  }

  const stopResize = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persistAgentWorkbenchLayout()
    removeAgentResizeListeners = null
  }

  removeAgentResizeListeners = stopResize
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

function openSettingsPage() {
  void router.push('/ai-settings')
}

function openSub2ApiPage() {
  void router.push('/sub2api')
}

function goToIDEView() {
  void router.push('/ide')
}

async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingAttachments.value.length === 0) || aiStore.streaming || !aiStore.isConfigured) {
    return
  }

  let session = currentSession.value
  if (!session) {
    session = aiStore.createSession(undefined, selectedScope.value, aiStore.getSelectedAgentId(selectedScope.value))
    selectedSessionId.value = session.id
  }

  const attachments = [...pendingAttachments.value]
  inputText.value = ''
  pendingAttachments.value = []

  await startConversationTurn(session.id, text, attachments, {
    onStream: scrollMessageListToBottom,
    onAfterUpdate: scrollMessageListToBottom
  })
}

async function playAssistantMessage(message: { id: string; content: string }) {
  try {
    playingMessageId.value = message.id
    await playTextToSpeech(settingsStore.settings, message.content, resolveMoodAwareTtsOverrides(currentAgent.value))
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '语音播放失败')
  } finally {
    if (playingMessageId.value === message.id) {
      playingMessageId.value = ''
    }
  }
}
</script>

<style scoped>
.agent-view {
  --agent-accent: var(--primary);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 4px;
  box-sizing: border-box;
  border-radius: 18px;
  border: 1px solid rgba(100, 116, 139, 0.22);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--agent-accent) 14%, transparent), transparent 18%),
    radial-gradient(circle at top right, rgba(15, 23, 42, 0.06), transparent 22%),
    linear-gradient(180deg, rgba(239, 244, 250, 0.98), rgba(219, 228, 240, 0.97));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    0 12px 26px rgba(15, 23, 42, 0.08);
}

.agent-view :deep(.glass-panel) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(241, 245, 249, 0.97));
  border-color: rgba(100, 116, 139, 0.22);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(16px);
}

.agent-hero,
.agent-warning {
  padding: 7px 9px;
}

.agent-hero,
.agent-workbench-bar {
  -webkit-app-region: drag;
  user-select: none;
  -webkit-user-select: none;
}

.agent-hero :is(button, select, input, textarea, a),
.agent-workbench-bar :is(button, select, input, textarea, a) {
  -webkit-app-region: no-drag;
}

.agent-hero {
  align-items: center;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--agent-accent) 22%, transparent), transparent 26%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(237, 243, 249, 0.92));
  display: flex;
  gap: 8px;
  justify-content: space-between;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  min-height: 64px;
}

.hero-eyebrow {
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.16em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

h1,
h3,
p {
  margin: 0;
}

h1 {
  font-size: clamp(18px, 1.8vw, 22px);
}

.hero-main {
  display: grid;
  gap: 3px;
}

.hero-title-row,
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.hero-chip,
.sidebar-scope {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.74);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #334155;
  font-size: 11px;
}

.hero-chip.is-mode {
  background: color-mix(in srgb, var(--agent-accent) 24%, rgba(255, 255, 255, 0.06));
  color: var(--text-primary);
}

.hero-chip.is-ready,
.workbench-pill.is-ready {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(187, 247, 208, 0.16));
  color: #166534;
}

.hero-chip.is-warning,
.workbench-pill.is-warning {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.2), rgba(254, 240, 138, 0.18));
  color: #854d0e;
}

.hero-chip.is-danger,
.workbench-pill.is-danger {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.2), rgba(254, 202, 202, 0.16));
  color: #991b1b;
}

.hero-chip.is-loading,
.workbench-pill.is-loading {
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(191, 219, 254, 0.18));
  color: #1d4ed8;
}

.hero-subline,
.agent-warning p {
  color: var(--text-secondary);
  line-height: 1.45;
  max-width: 920px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-pill,
.hero-link {
  border-radius: 999px;
  font-size: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 26px;
  padding: 0 9px;
}

.mode-pill {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(148, 163, 184, 0.22);
  color: #475569;
}

.mode-pill.active {
  background: color-mix(in srgb, var(--agent-accent) 18%, rgba(255, 255, 255, 0.9));
  color: color-mix(in srgb, var(--agent-accent) 82%, #334155 18%);
  border-color: color-mix(in srgb, var(--agent-accent) 28%, rgba(148, 163, 184, 0.24));
}

.hero-link {
  background: transparent;
  color: #475569;
  cursor: pointer;
}

.agent-workbench-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 6px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(238, 243, 248, 0.9));
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.05);
}

.workbench-bar-copy,
.workbench-bar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.workbench-bar-copy {
  flex: 1 1 auto;
  min-width: 0;
}

.workbench-bar-actions {
  flex: 0 0 auto;
  justify-content: flex-end;
  overflow-x: auto;
  scrollbar-width: thin;
}

.workbench-pill {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  max-width: 180px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.74);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #334155;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-pill.is-mode {
  background: color-mix(in srgb, var(--agent-accent) 18%, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
}

.workbench-toggle {
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #475569;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.workbench-toggle.active {
  background: color-mix(in srgb, var(--agent-accent) 16%, rgba(255, 255, 255, 0.92));
  border-color: color-mix(in srgb, var(--agent-accent) 34%, rgba(148, 163, 184, 0.2));
  color: var(--text-primary);
}

.agent-layout {
  display: grid;
  grid-template-columns: var(--agent-sidebar-width) var(--agent-sidebar-splitter) minmax(0, 1fr);
  gap: 6px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.agent-sidebar,
.agent-sidebar-panel,
.agent-center {
  gap: 6px;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
}

.agent-sidebar,
.agent-sidebar-panel {
  display: grid;
}

.agent-sidebar-panel,
.agent-center {
  overflow: hidden;
}

.agent-sidebar-panel {
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  min-height: 0;
}

.agent-sidebar {
  grid-column: 1;
  grid-template-columns: 52px minmax(0, 1fr);
}

.agent-sidebar.is-collapsed {
  grid-template-columns: 1fr;
}

.agent-sidebar-rail {
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 5px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(238, 243, 248, 0.94));
}

.sidebar-tab {
  position: relative;
  min-height: 30px;
  padding: 0 7px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.sidebar-tab.active {
  background: color-mix(in srgb, var(--agent-accent) 24%, rgba(255, 255, 255, 0.05));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--agent-accent) 26%, rgba(255, 255, 255, 0.12));
  color: var(--text-primary);
}

.sidebar-tab.active::after {
  content: '';
  position: absolute;
  left: -3px;
  top: 7px;
  width: 3px;
  height: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--agent-accent), color-mix(in srgb, var(--agent-accent) 76%, white 24%));
}

.sidebar-tab--ghost {
  margin-top: auto;
}

.agent-sidebar-panel.is-hidden,
.agent-sidebar.is-collapsed + .agent-splitter {
  display: none;
}

.sidebar-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 4px 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.agent-splitter {
  border: none;
  padding: 0;
  background: transparent;
  cursor: col-resize;
  position: relative;
}

.agent-splitter::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  opacity: 0;
  transition: opacity 0.18s ease, background 0.18s ease;
}

.agent-splitter:hover::before,
.agent-splitter:focus-visible::before {
  opacity: 1;
  background: color-mix(in srgb, var(--agent-accent) 58%, rgba(255, 255, 255, 0.1));
}

.agent-center {
  grid-column: 3;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}

.agent-runtime-stack {
  display: grid;
  gap: 6px;
  min-height: 0;
}

:deep(.agent-message-list) {
  min-height: 0;
  overflow: auto;
  box-sizing: border-box;
}

:deep(.agent-input-bar) {
  align-self: stretch;
  min-height: fit-content;
  box-sizing: border-box;
}

.agent-warning {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(255, 183, 3, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 251, 235, 0.96), rgba(255, 247, 220, 0.92));
}

.agent-warning-copy {
  display: grid;
  gap: 2px;
}

.agent-warning-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-warning-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(100, 116, 139, 0.16);
  background: rgba(255, 255, 255, 0.82);
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}

.agent-warning-pill.is-ready {
  border-color: rgba(34, 197, 94, 0.18);
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.88), rgba(220, 252, 231, 0.72));
  color: #166534;
}

.agent-warning-pill.is-problem {
  border-color: rgba(245, 158, 11, 0.22);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.94), rgba(254, 243, 199, 0.8));
  color: #854d0e;
}

.agent-warning-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.warning-action {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.64);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.warning-action.is-primary {
  border-color: rgba(245, 158, 11, 0.26);
  background: linear-gradient(135deg, rgba(255, 214, 102, 0.9), rgba(255, 183, 77, 0.82));
  color: #5c2b00;
}

.warning-action:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

:deep(.agent-session-list),
:deep(.agent-profile-panel),
:deep(.agent-memory-panel),
:deep(.agent-resources-panel),
:deep(.agent-task-board) {
  height: 100%;
  box-sizing: border-box;
}

:deep(.agent-session-list),
:deep(.agent-profile-panel),
:deep(.agent-memory-panel),
:deep(.agent-resources-panel),
:deep(.agent-task-board),
:deep(.agent-toolbar),
:deep(.agent-message-list),
:deep(.agent-input-bar) {
  border-radius: 12px;
}

:deep(.agent-message-list),
:deep(.agent-input-bar) {
  box-shadow: none;
}

:deep(.agent-toolbar),
:deep(.agent-session-list),
:deep(.agent-profile-panel),
:deep(.agent-memory-panel),
:deep(.agent-resources-panel),
:deep(.agent-task-board),
:deep(.agent-message-list),
:deep(.agent-input-bar) {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 246, 250, 0.95));
  border: 1px solid rgba(100, 116, 139, 0.18);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}

:deep(.agent-session-list),
:deep(.agent-profile-panel),
:deep(.agent-resources-panel),
:deep(.agent-task-board),
:deep(.agent-toolbar),
:deep(.agent-message-list),
:deep(.agent-input-bar) {
  padding: 8px;
}

:deep(.agent-profile-panel),
:deep(.agent-memory-panel),
:deep(.agent-resources-panel),
:deep(.agent-task-board) {
  min-height: 0;
  overflow: auto;
  align-content: start;
}

:deep(.agent-profile-panel) {
  overflow: hidden;
}

:deep(.agent-profile-panel .profile-scroll-area) {
  min-height: 0;
  overflow: hidden;
  padding-bottom: 12px;
}

:deep(.agent-session-list .session-card),
:deep(.agent-profile-panel .agent-card),
:deep(.agent-message-list .message-card),
:deep(.agent-message-list .session-summary),
:deep(.agent-message-list .attachment-card),
:deep(.agent-message-list .tool-item),
:deep(.agent-memory-panel .memory-card),
:deep(.agent-task-board .task-step),
:deep(.agent-task-board .phase-item),
:deep(.agent-task-board .plan-next-task) {
  border-radius: 12px;
}

:deep(.agent-session-list .session-card) {
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.92));
  border-color: rgba(100, 116, 139, 0.16);
}

:deep(.agent-session-list .session-card.active) {
  background: linear-gradient(180deg, rgba(224, 234, 255, 0.96), rgba(239, 246, 255, 0.92));
  border-color: color-mix(in srgb, var(--agent-accent) 28%, rgba(148, 163, 184, 0.22));
  box-shadow: 0 10px 18px color-mix(in srgb, var(--agent-accent) 16%, rgba(15, 23, 42, 0.08));
}

:deep(.agent-message-list .session-summary) {
  background: linear-gradient(180deg, rgba(236, 242, 249, 0.9), rgba(228, 236, 245, 0.76));
  border: 1px solid rgba(100, 116, 139, 0.16);
}

:deep(.agent-message-list .message-card.is-assistant),
:deep(.agent-message-list .message-card.is-streaming) {
  background: linear-gradient(180deg, rgba(244, 248, 255, 0.96), rgba(236, 243, 252, 0.86));
  border: 1px solid rgba(148, 163, 184, 0.16);
}

:deep(.agent-message-list .message-card.is-user) {
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.94), rgba(254, 243, 199, 0.82));
  border: 1px solid rgba(245, 158, 11, 0.18);
}

:deep(.agent-toolbar h3),
:deep(.agent-session-list h3),
:deep(.agent-profile-panel h3),
:deep(.agent-message-list h3) {
  font-size: 16px;
}

:deep(.agent-toolbar .chip),
:deep(.agent-session-list .action-btn),
:deep(.agent-session-list .delete-btn),
:deep(.agent-profile-panel .panel-btn),
:deep(.agent-memory-panel .panel-btn),
:deep(.agent-task-board .board-badge),
:deep(.agent-message-list .starter-btn),
:deep(.agent-message-list .voice-btn) {
  min-height: 24px;
  padding: 0 9px;
  font-size: 10px;
}

:deep(.agent-toolbar),
:deep(.agent-session-list),
:deep(.agent-profile-panel),
:deep(.agent-message-list),
:deep(.agent-input-bar),
:deep(.agent-task-board) {
  gap: 8px;
}

:deep(.agent-input-bar .message-input) {
  min-height: 40px;
  border-radius: 10px;
  padding: 9px 11px;
}

:deep(.agent-input-bar .composer-shell) {
  gap: 7px;
}

:deep(.agent-input-bar .composer-footer) {
  align-items: flex-end;
}

:deep(.agent-input-bar .controls-row) {
  justify-content: flex-end;
}

:deep(.agent-input-bar .attachment-pill) {
  border-radius: 10px;
  padding: 7px 9px;
}

:deep(.agent-profile-panel .field input),
:deep(.agent-profile-panel .field textarea),
:deep(.agent-profile-panel .field select),
:deep(.agent-memory-panel .memory-input),
:deep(.agent-memory-panel .memory-select) {
  border-radius: 12px;
}

:deep(.agent-profile-panel .field textarea) {
  min-height: 118px;
}

@media (max-width: 1280px) {
  .agent-layout {
    grid-template-columns: minmax(232px, 280px) var(--agent-sidebar-splitter) minmax(0, 1fr);
  }
}

@media (max-width: 960px) {
  .agent-hero,
  .agent-workbench-bar {
    flex-direction: column;
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .agent-layout {
    grid-template-columns: 1fr;
  }

  .agent-sidebar {
    grid-template-columns: 1fr;
  }

  .agent-sidebar-rail {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .sidebar-tab--ghost {
    margin-top: 0;
  }

  .agent-splitter {
    display: none;
  }

  .agent-center {
    grid-column: 1;
  }
}
</style>
