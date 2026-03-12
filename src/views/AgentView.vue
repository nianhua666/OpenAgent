<template>
  <div class="agent-view">
    <section class="agent-hero glass-panel">
      <div>
        <p class="hero-eyebrow">OpenAgent v3.0</p>
        <h1>Agent Mode</h1>
        <p class="hero-copy">主代理负责规划、调度与结果汇总，子代理负责并行分析和执行。当前界面聚焦真实任务推进，而不是聊天气泡堆叠。</p>
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
          <strong>当前尚未配置可用模型。</strong>
          <p>先在 AI 设置里填写服务地址、模型和鉴权信息，主代理才能开始执行任务。</p>
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

        <section class="sub-agent-panel glass-panel">
          <div class="side-head">
            <div>
              <p class="side-eyebrow">Delegation</p>
              <h3>子代理池</h3>
            </div>
            <span class="side-badge">{{ sessionSubAgents.length }}</span>
          </div>

          <div v-if="sessionSubAgents.length === 0" class="side-empty">
            <p>当前会话还没有委派出的子代理。启用子任务拆解后，执行中的分析师、开发者、测试代理会出现在这里。</p>
          </div>

          <div v-else class="sub-agent-list">
            <SubAgentCard v-for="agent in sessionSubAgents" :key="agent.id" :agent="agent" />
          </div>
        </section>
      </div>
    </div>

    <AgentContextBar
      :metrics="currentContextMetrics"
      :sub-agent-count="sessionSubAgents.length"
      :running-sub-agent-count="runningSubAgentCount"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AIChatAttachment, AIConversationScope, AIProviderModel } from '@/types'
import AgentContextBar from '@/components/agent/AgentContextBar.vue'
import AgentInputBar from '@/components/agent/AgentInputBar.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentSessionList from '@/components/agent/AgentSessionList.vue'
import AgentTaskBoard from '@/components/agent/AgentTaskBoard.vue'
import AgentToolbar from '@/components/agent/AgentToolbar.vue'
import SubAgentCard from '@/components/agent/SubAgentCard.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { fetchAvailableModels, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { cancelConversationRun, createAttachmentsFromFiles, startConversationTurn } from '@/utils/aiConversation'
import { playTextToSpeech } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const router = useRouter()

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
  '先分析当前任务，判断是否需要切换模型或拆出子代理。',
  '给我一个从 0 到 1 的项目执行计划，并列出关键阶段。',
  '检查最近这次会话的上下文负载和潜在瓶颈。',
]

const aiConfig = computed(() => aiStore.config)
const mainSessions = computed(() => aiStore.getSortedSessions('main'))
const live2dSessions = computed(() => aiStore.getSortedSessions('live2d'))
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
    ...mainSessions.value.map(session => ({ ...session, isPinned: false })),
  ]
})
const currentSession = computed(() => (selectedSessionId.value ? aiStore.getSessionById(selectedSessionId.value) : null))
const currentTask = computed(() => (currentSession.value ? aiStore.getLatestTaskForSession(currentSession.value.id) : null))
const sessionSubAgents = computed(() => (currentSession.value ? aiStore.getSubAgentsForSession(currentSession.value.id) : []))
const runningSubAgentCount = computed(() => sessionSubAgents.value.filter(agent => agent.status === 'running').length)
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
    limits: inferModelLimits(aiConfig.value.model, aiConfig.value.protocol),
  }
})
const currentModelBadges = computed(() => [
  ...getModelCapabilityLabels(currentModelMeta.value?.capabilities),
  ...getModelLimitLabels(currentModelMeta.value?.limits),
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

  return currentSession.value?.scope === 'live2d' || settingsStore.settings.ttsShowMainReplyButton
})

watch(
  () => [selectedSessionId.value, currentSession.value?.messages.at(-1)?.id ?? '', aiStore.runtime.updatedAt],
  () => {
    scrollMessageListToBottom()
  },
)

watch(combinedSessions, () => {
  if (!currentSession.value && combinedSessions.value.length > 0) {
    initializeSelection()
  }
})

onMounted(() => {
  aiStore.setAgentMode('agent')
  initializeSelection()
  void refreshModelOptions()
})

function initializeSelection() {
  const selected = selectedSessionId.value ? aiStore.getSessionById(selectedSessionId.value) : null
  if (selected) {
    selectedScope.value = selected.scope
    return
  }

  const fallback = aiStore.getActiveSession('main') || aiStore.getActiveSession('live2d') || combinedSessions.value[0] || null
  if (!fallback) {
    selectedSessionId.value = ''
    selectedScope.value = 'main'
    return
  }

  selectedSessionId.value = fallback.id
  selectedScope.value = fallback.scope
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
  const session = aiStore.createSession(undefined, nextScope)
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
    session = aiStore.createSession(undefined, selectedScope.value)
    selectedSessionId.value = session.id
  }

  const attachments = [...pendingAttachments.value]
  inputText.value = ''
  pendingAttachments.value = []

  await startConversationTurn(session.id, text, attachments, {
    onStream: scrollMessageListToBottom,
    onAfterUpdate: scrollMessageListToBottom,
  })
}

async function playAssistantMessage(message: { id: string; content: string }) {
  try {
    playingMessageId.value = message.id
    await playTextToSpeech(settingsStore.settings, message.content)
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
.agent-warning,
.sub-agent-panel {
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

.hero-eyebrow,
.side-eyebrow {
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
.agent-warning p,
.side-empty p {
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
.hero-link,
.side-badge {
  border-radius: 999px;
  font-size: 12px;
}

.mode-pill,
.hero-link {
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
  grid-template-columns: minmax(250px, 300px) minmax(0, 1fr) minmax(300px, 360px);
  min-height: 0;
}

.agent-center,
.agent-side,
.sub-agent-panel,
.sub-agent-list {
  display: grid;
  gap: 18px;
  min-height: 0;
}

.agent-center {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.agent-side {
  align-content: start;
}

.agent-warning {
  border: 1px solid rgba(255, 183, 3, 0.24);
}

.side-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 14px;
}

.side-badge {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  padding: 6px 10px;
}

.sub-agent-panel {
  max-height: 100%;
}

.sub-agent-list {
  overflow: auto;
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
