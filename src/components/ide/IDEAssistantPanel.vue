<template>
  <section class="ide-assistant-panel glass-panel">
    <div class="panel-head">
      <div class="panel-copy">
        <p class="panel-eyebrow">Assistant</p>
        <h3>IDE Agent</h3>
      </div>

      <div class="panel-actions">
        <select class="session-select" :value="currentSession?.id || ''" :disabled="aiStore.streaming" @change="handleSessionChange(($event.target as HTMLSelectElement).value)">
          <option v-if="sessions.length === 0" value="">暂无会话</option>
          <option v-for="session in sessions" :key="session.id" :value="session.id">
            {{ session.title }}
          </option>
        </select>
        <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming" @click="startNewSession">新会话</button>
        <button class="btn btn-ghost btn-sm" @click="openAgentView">全屏</button>
      </div>
    </div>

    <div class="runtime-strip">
      <span class="runtime-pill" :class="`is-${runtimeStatusTone}`">{{ runtimeStatusText }}</span>
      <span class="runtime-pill">角色 {{ currentAgent?.name || '未选择' }}</span>
      <span class="runtime-pill">模型 {{ currentModelLabel }}</span>
      <span class="runtime-pill">上下文 {{ contextSummary }}</span>
      <span class="runtime-pill">浼氳瘽 {{ sessions.length }}</span>
      <span v-for="badge in currentModelBadges" :key="badge" class="runtime-pill">{{ badge }}</span>
      <span v-if="modelLoadError" class="runtime-pill is-error">{{ modelLoadError }}</span>
    </div>

    <AgentMessageList
      ref="messageListRef"
      class="assistant-messages"
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
      class="assistant-input"
      :model-value="inputText"
      :attachments="pendingAttachments"
      :streaming="aiStore.streaming"
      :send-disabled="sendButtonDisabled"
      :current-model-label="runtimeModelLabel"
      :current-model-name="runtimeAiConfig.model"
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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AIChatAttachment, AIChatMessage, AIChatSession, AIProviderModel } from '@/types'
import AgentInputBar from '@/components/agent/AgentInputBar.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { fetchAvailableModels, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { cancelConversationRun, createAttachmentsFromFiles, startConversationTurn } from '@/utils/aiConversation'
import { playTextToSpeech } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const inputText = ref('')
const pendingAttachments = ref<AIChatAttachment[]>([])
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const playingMessageId = ref('')
const modelLoadError = ref('')
const messageListRef = ref<{ scrollToBottom: () => void } | null>(null)

const starterPrompts = [
  '先基于当前工作区拆解需求，并给出下一步执行建议。',
  '先看当前已打开文件和工作区状态，再告诉我最值得做的修复项。',
]

const sessions = computed(() => aiStore.getSortedSessions('main'))
const currentSession = computed<AIChatSession | null>(() => aiStore.getActiveSession('main'))
const runtimeAiConfig = computed(() => aiStore.getEffectiveConfig(currentSession.value || 'main'))
const currentAgent = computed(() => currentSession.value ? aiStore.getSessionAgent(currentSession.value) : aiStore.getSelectedAgent('main'))
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
  } satisfies AIProviderModel
})
const currentModelLabel = computed(() => currentModelMeta.value?.label || runtimeAiConfig.value.model || '未配置')
const currentModelBadges = computed(() => {
  const meta = currentModelMeta.value
  if (!meta) {
    return []
  }

  const capabilities = meta.capabilities || inferModelCapabilities(meta.name, runtimeAiConfig.value.protocol)
  const limits = meta.limits || inferModelLimits(meta.name, runtimeAiConfig.value.protocol)
  return [...getModelCapabilityLabels(capabilities), ...getModelLimitLabels(limits)]
})
const runtimeModelLabel = computed(() => currentModelMeta.value?.label || runtimeAiConfig.value.model || 'Unconfigured')
const recommendedAutoSteps = computed(() => getRecommendedAutoSteps(runtimeAiConfig.value))
const showVoiceActions = computed(() => Boolean(settingsStore.settings.ttsShowMainReplyButton || currentAgent.value?.tts.autoPlayReplies))
const runtimeConfigReady = computed(() => {
  if (!runtimeAiConfig.value.baseUrl.trim()) {
    return false
  }

  if (runtimeAiConfig.value.protocol === 'ollama-local' || runtimeAiConfig.value.protocol === 'custom') {
    return true
  }

  return runtimeAiConfig.value.apiKey.trim().length > 0
})
const canRefreshModels = computed(() => {
  return runtimeConfigReady.value
})
const sendButtonDisabled = computed(() => {
  return (!inputText.value.trim() && pendingAttachments.value.length === 0) || aiStore.streaming || !runtimeConfigReady.value
})
const contextSummary = computed(() => {
  if (!currentContextMetrics.value) {
    return '待装配'
  }

  const estimated = currentContextMetrics.value.estimatedInputTokens || 0
  const selected = currentContextMetrics.value.selectedContextTokens || 0
  return `${selected}/${estimated}`
})
const runtimeStatusLabel = computed(() => {
  if (loadingAiModels.value) {
    return '姝ｅ湪鍚屾'
  }

  if (!runtimeConfigReady.value) {
    return '寰呰ˉ榻愰厤缃?'
  }

  if (modelLoadError.value) {
    return '妯″瀷鍚屾澶辫触'
  }

  if (!runtimeAiConfig.value.model.trim()) {
    return '寰呴€夋嫨妯″瀷'
  }

  return aiStore.streaming ? '姝ｅ湪鍥炲簲' : '宸插氨缁?'
})
const runtimeStatusTone = computed(() => {
  if (loadingAiModels.value || aiStore.streaming) {
    return 'running'
  }

  if (!runtimeConfigReady.value) {
    return 'warning'
  }

  if (modelLoadError.value) {
    return 'error'
  }

  return 'ready'
})
const runtimeStatusText = computed(() => {
  if (loadingAiModels.value) {
    return 'Syncing'
  }

  if (!runtimeConfigReady.value) {
    return 'Needs Config'
  }

  if (modelLoadError.value) {
    return 'Model Sync Failed'
  }

  if (!runtimeAiConfig.value.model.trim()) {
    return 'Select Model'
  }

  return aiStore.streaming ? 'Responding' : 'Ready'
})

watch(() => aiStore.runtime.sessionId, () => {
  if (aiStore.runtime.sessionId === currentSession.value?.id) {
    scrollMessageListToBottom()
  }
})

watch(
  () => [runtimeAiConfig.value.baseUrl, runtimeAiConfig.value.apiKey, runtimeAiConfig.value.protocol, currentAgent.value?.id || ''],
  () => {
    if (!runtimeConfigReady.value) {
      availableAiModels.value = []
      modelLoadError.value = ''
      return
    }

    void refreshModelOptions()
  },
)

onMounted(() => {
  void refreshModelOptions()

  if (!currentSession.value && runtimeConfigReady.value) {
    startNewSession()
  }
})

function scrollMessageListToBottom() {
  void nextTick(() => {
    messageListRef.value?.scrollToBottom()
  })
}

function startNewSession() {
  if (!runtimeConfigReady.value || aiStore.streaming) {
    return
  }

  const session = aiStore.createSession(undefined, 'main', aiStore.getSelectedAgentId('main'))
  aiStore.switchSession(session.id, 'main')
  scrollMessageListToBottom()
}

function handleSessionChange(sessionId: string) {
  if (!sessionId || aiStore.streaming) {
    return
  }

  aiStore.switchSession(sessionId, 'main')
  scrollMessageListToBottom()
}

function applyStarterPrompt(prompt: string) {
  inputText.value = prompt
}

async function refreshModelOptions() {
  if (!canRefreshModels.value || loadingAiModels.value) {
    if (!canRefreshModels.value) {
      availableAiModels.value = []
      modelLoadError.value = ''
    }
    return
  }

  loadingAiModels.value = true
  modelLoadError.value = ''
  try {
    const models = await fetchAvailableModels(runtimeAiConfig.value)
    availableAiModels.value = models
  } catch (error) {
    modelLoadError.value = error instanceof Error ? error.message : '模型刷新失败'
  } finally {
    loadingAiModels.value = false
  }
}

async function handleSelectedFiles(files: File[]) {
  try {
    const attachments = await createAttachmentsFromFiles(files)
    pendingAttachments.value = [...pendingAttachments.value, ...attachments]
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '附件处理失败')
  }
}

function removePendingAttachment(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(attachment => attachment.id !== attachmentId)
}

async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingAttachments.value.length === 0) || aiStore.streaming || !runtimeConfigReady.value) {
    return
  }

  let session = currentSession.value
  if (!session) {
    session = aiStore.createSession(undefined, 'main', aiStore.getSelectedAgentId('main'))
    aiStore.switchSession(session.id, 'main')
  }

  const attachments = [...pendingAttachments.value]
  inputText.value = ''
  pendingAttachments.value = []

  await startConversationTurn(session.id, text, attachments, {
    onStream: scrollMessageListToBottom,
    onAfterUpdate: scrollMessageListToBottom,
  })
}

async function playAssistantMessage(message: AIChatMessage) {
  try {
    playingMessageId.value = message.id
    await playTextToSpeech(settingsStore.settings, message.content, {
      emotionStyle: currentAgent.value?.tts.emotionStyle,
      emotionIntensity: currentAgent.value?.tts.emotionIntensity,
    })
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '语音播放失败')
  } finally {
    if (playingMessageId.value === message.id) {
      playingMessageId.value = ''
    }
  }
}

function stopCurrentRun() {
  cancelConversationRun(currentSession.value?.id)
}

function adjustMaxAutoSteps(delta: number) {
  const current = aiStore.preferences.maxAutoSteps || 0
  const next = current <= 0
    ? Math.max(1, recommendedAutoSteps.value + delta)
    : Math.min(Math.max(current + delta, 1), 24)

  aiStore.updatePreferences({ maxAutoSteps: next })
}

function applyRecommendedAutoSteps() {
  aiStore.updatePreferences({ maxAutoSteps: recommendedAutoSteps.value })
}

function handleModelChange(modelName: string) {
  aiStore.updateConfig({ model: modelName })
}

function openAgentView() {
  void router.push('/ai')
}
</script>

<style scoped lang="scss">
.ide-assistant-panel {
  display: grid;
  gap: $spacing-sm;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
  padding: 10px;
}

.panel-head,
.panel-actions,
.runtime-strip {
  display: flex;
  align-items: center;
}

.panel-head {
  justify-content: space-between;
  gap: $spacing-sm;
}

.panel-copy {
  min-width: 0;
}

.panel-eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.panel-copy h3 {
  margin: 0;
  font-size: $font-lg;
}

.panel-actions,
.runtime-strip {
  flex-wrap: wrap;
  gap: 6px;
}

.session-select {
  min-width: 0;
  max-width: 180px;
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-primary);
  font: inherit;
}

.runtime-pill {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  font-size: $font-xs;
}

.runtime-pill.is-error {
  background: rgba(238, 96, 85, 0.12);
  color: #ff8c82;
}

.runtime-pill.is-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #b9770e;
}

.runtime-pill.is-running {
  background: rgba(37, 99, 235, 0.14);
  color: #2563eb;
}

.runtime-pill.is-ready {
  background: rgba(34, 197, 94, 0.14);
  color: #15803d;
}

.assistant-messages,
.assistant-input {
  min-height: 0;
}

:deep(.agent-message-list) {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

:deep(.agent-input-bar) {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
</style>
