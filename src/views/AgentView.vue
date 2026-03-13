<template>
  <div class="agent-view">
    <section class="agent-hero glass-panel">
      <div>
        <p class="hero-eyebrow">OpenAgent v3.0</p>
        <h1>Agent Mode</h1>
        <p class="hero-copy">
          这里现在是多角色 Agent 工作台。主窗口和 Live2D / 悬浮窗都可以绑定不同角色，每个角色都能独立定义提示词、长期记忆、文件控制、软件控制、MCP 与 Skill 边界。
        </p>
      </div>
      <div class="hero-actions">
        <button class="mode-pill active">Agent</button>
        <button class="mode-pill ghost" @click="goToIDEView">IDE</button>
        <button class="hero-link" @click="openSettingsPage">AI 设置</button>
      </div>
    </section>

    <div class="agent-layout">
      <AgentSessionList
        :sessions="combinedSessions"
        :selected-session-id="selectedSessionId"
        :streaming="aiStore.streaming"
        :create-disabled="!aiStore.isConfigured"
        @new-session="startNewSession"
        @select-session="handleSessionSelect"
        @delete-session="deleteSession"
        @clear-sessions="clearAllSessions"
      />

      <div class="agent-center">
        <AgentToolbar
          :preferences="aiStore.preferences"
          :model-label="currentModelLabel"
          :model-badges="currentModelBadges"
          :model-load-error="modelLoadError"
          @toggle-thinking="toggleThinkingMode"
          @cycle-thinking="cycleThinkingLevel"
          @toggle-planning="togglePlanningMode"
          @toggle-memory="toggleAutoMemory"
          @open-settings="openSettingsPage"
        />

        <section v-if="!aiStore.isConfigured" class="agent-warning glass-panel">
          <strong>当前还没有可用模型配置。</strong>
          <p>先在 AI 设置里补齐服务地址、模型和鉴权信息，角色能力边界才会落到真实对话链路里。</p>
        </section>

        <AgentMessageList
          ref="messageListRef"
          :session="currentSession"
          :streaming="aiStore.streaming"
          :streaming-content="streamingContent"
          :streaming-reasoning-content="streamingReasoningContent"
          :playing-message-id="playingMessageId"
          :starter-prompts="starterPrompts"
          :show-voice-actions="showVoiceActions"
          @apply-prompt="applyStarterPrompt"
          @play-message="playAssistantMessage"
        />

        <AgentInputBar
          :model-value="inputText"
          :attachments="pendingAttachments"
          :streaming="aiStore.streaming"
          :send-disabled="sendButtonDisabled"
          :current-model-label="currentModelLabel"
          :current-model-name="aiConfig.model"
          :available-models="availableAiModels"
          :loading-models="loadingAiModels"
          :can-refresh-models="canRefreshModels"
          :max-auto-steps="aiStore.preferences.maxAutoSteps"
          :recommended-auto-steps="recommendedAutoSteps"
          @update:model-value="inputText = $event"
          @send="sendMessage"
          @stop="stopCurrentRun"
          @select-files="handleSelectedFiles"
          @remove-attachment="removePendingAttachment"
          @refresh-models="refreshModelOptions"
          @change-model="handleModelChange"
          @step-delta="adjustMaxAutoSteps"
          @apply-recommended-steps="applyRecommendedAutoSteps"
        />
      </div>

      <div class="agent-side">
        <AgentTaskBoard :task="currentTask" :plan="latestPlan" />
        <AgentProfileManager
          :agents="agentProfiles"
          :selected-agent-id="selectedAgentId"
          :current-agent-id="currentSessionAgentId"
          :current-scope="selectedScope"
          :current-session-has-messages="Boolean(currentSession?.messages.length)"
          :streaming="aiStore.streaming"
          @select-agent="handleSelectAgent"
          @save-agent="handleSaveAgent"
          @delete-agent="handleDeleteAgent"
        />
      </div>
    </div>

    <AgentContextBar
      :metrics="currentContextMetrics"
      :agent-count="agentProfiles.length"
      :current-agent-name="currentAgent?.name || ''"
      :memory-enabled="Boolean(currentAgentCapabilities?.memoryEnabled)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AIChatAttachment, AIConversationScope, AIAgentProfile, AIProviderModel } from '@/types'
import AgentContextBar from '@/components/agent/AgentContextBar.vue'
import AgentInputBar from '@/components/agent/AgentInputBar.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentProfileManager from '@/components/agent/AgentProfileManager.vue'
import AgentSessionList from '@/components/agent/AgentSessionList.vue'
import AgentTaskBoard from '@/components/agent/AgentTaskBoard.vue'
import AgentToolbar from '@/components/agent/AgentToolbar.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { fetchAvailableModels, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { cancelConversationRun, createAttachmentsFromFiles, startConversationTurn } from '@/utils/aiConversation'
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
const messageListRef = ref<{ scrollToBottom: () => void } | null>(null)

const starterPrompts = [
  '先帮我拆解需求并给出详细执行计划，暂时先不要动手，等我确认后再持续推进。',
  '从当前角色和能力边界出发，告诉我这轮任务还缺哪些上下文、风险或约束。',
  '根据当前角色的人设和能力，直接说明你现在可以替我做什么，以及哪些事情需要我确认。'
]

const aiConfig = computed(() => aiStore.config)
const mainSessions = computed(() => aiStore.getSortedSessions('main'))
const live2dSessions = computed(() => aiStore.getSortedSessions('live2d'))
const agentProfiles = computed(() => aiStore.getAgentProfiles())
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
const currentSession = computed(() => (selectedSessionId.value ? aiStore.getSessionById(selectedSessionId.value) : null))
const currentTask = computed(() => (currentSession.value ? aiStore.getLatestTaskForSession(currentSession.value.id) : null))
const currentSessionAgent = computed(() => currentSession.value ? aiStore.getSessionAgent(currentSession.value) : null)
const currentSessionAgentId = computed(() => currentSessionAgent.value?.id || '')
const currentAgent = computed(() => currentSessionAgent.value || aiStore.getSelectedAgent(selectedScope.value))
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
  if (!aiConfig.value.baseUrl.trim()) {
    return false
  }

  if (aiConfig.value.protocol === 'ollama-local' || aiConfig.value.protocol === 'custom') {
    return true
  }

  return aiConfig.value.apiKey.trim().length > 0
})
const currentModelMeta = computed(() => {
  const matched = availableAiModels.value.find(model => model.name === aiConfig.value.model)
  if (matched) {
    return matched
  }

  if (!aiConfig.value.model.trim()) {
    return null
  }

  return {
    id: aiConfig.value.model,
    name: aiConfig.value.model,
    label: aiConfig.value.model,
    capabilities: inferModelCapabilities(aiConfig.value.model, aiConfig.value.protocol),
    limits: inferModelLimits(aiConfig.value.model, aiConfig.value.protocol)
  }
})
const currentModelBadges = computed(() => [
  ...getModelCapabilityLabels(currentModelMeta.value?.capabilities),
  ...getModelLimitLabels(currentModelMeta.value?.limits)
])
const currentModelLabel = computed(() => currentModelMeta.value?.label || aiConfig.value.model.trim() || '未选择')
const recommendedAutoSteps = computed(() => getRecommendedAutoSteps(aiConfig.value))
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
  () => [route.query.sessionId, route.query.scope],
  () => {
    initializeSelection()
  }
)

onMounted(async () => {
  aiStore.setAgentMode('agent')
  if (!aiStore.loaded) {
    await aiStore.init()
  }
  initializeSelection()
  void refreshModelOptions()
})

function getRequestedScope(): AIConversationScope | null {
  return route.query.scope === 'live2d' || route.query.scope === 'main'
    ? route.query.scope
    : null
}

function initializeSelection() {
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

function scrollMessageListToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      messageListRef.value?.scrollToBottom()
    })
  })
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
    availableAiModels.value = await fetchAvailableModels(aiConfig.value)
  } catch (error) {
    availableAiModels.value = []
    modelLoadError.value = error instanceof Error ? error.message : '模型列表读取失败'
  } finally {
    loadingAiModels.value = false
  }
}

async function handleModelChange(modelName: string) {
  const nextModel = modelName.trim()
  if (!nextModel || nextModel === aiConfig.value.model) {
    return
  }

  const previousRecommended = recommendedAutoSteps.value
  await aiStore.updateConfig({ model: nextModel })

  if (aiStore.preferences.maxAutoSteps === previousRecommended) {
    await aiStore.updatePreferences({ maxAutoSteps: getRecommendedAutoSteps(aiStore.config) })
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

async function handleSelectedFiles(files: File[]) {
  const nextAttachments = await createAttachmentsFromFiles(files)
  pendingAttachments.value = [...pendingAttachments.value, ...nextAttachments].slice(0, 8)
}

function removePendingAttachment(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(attachment => attachment.id !== attachmentId)
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

function openSettingsPage() {
  void router.push('/ai-settings')
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
    await playTextToSpeech(settingsStore.settings, message.content, {
      emotionStyle: currentAgent.value?.tts.emotionStyle,
      emotionIntensity: currentAgent.value?.tts.emotionIntensity
    })
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
  --agent-accent: #ffb703;
  display: grid;
  gap: 18px;
  min-height: 100%;
}

.agent-hero,
.agent-warning {
  padding: 18px;
}

.agent-hero {
  align-items: start;
  background:
    radial-gradient(circle at top right, rgba(255, 183, 3, 0.22), transparent 32%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

.hero-eyebrow {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

h1,
h3,
p {
  margin: 0;
}

h1 {
  font-size: clamp(28px, 3vw, 40px);
}

.hero-copy,
.agent-warning p {
  color: var(--text-secondary);
  line-height: 1.7;
  margin-top: 10px;
  max-width: 760px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.mode-pill,
.hero-link {
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 14px;
}

.mode-pill {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.mode-pill.active {
  background: linear-gradient(135deg, rgba(255, 183, 3, 0.22), rgba(255, 209, 102, 0.18));
  color: var(--text-primary);
}

.hero-link {
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.agent-layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(250px, 300px) minmax(0, 1fr) minmax(320px, 380px);
  min-height: 0;
}

.agent-center,
.agent-side {
  display: grid;
  gap: 18px;
  min-height: 0;
}

.agent-center {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.agent-warning {
  border: 1px solid rgba(255, 183, 3, 0.24);
}

@media (max-width: 1280px) {
  .agent-layout {
    grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  }

  .agent-side {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .agent-hero,
  .agent-layout,
  .agent-side {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .hero-actions {
    justify-content: flex-start;
  }
}
</style>
