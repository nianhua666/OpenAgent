<template>
  <section class="ide-assistant-panel glass-panel">
    <div class="panel-head">
      <div class="panel-copy">
        <p class="panel-eyebrow">Assistant</p>
        <h3>主Agent</h3>
      </div>

      <div class="panel-actions">
        <select class="session-select" :value="currentSession?.id || ''" :disabled="aiStore.streaming" @change="handleSessionChange(($event.target as HTMLSelectElement).value)">
          <option v-if="sessions.length === 0" value="">暂无会话</option>
          <option v-for="session in sessions" :key="session.id" :value="session.id">
            {{ session.title }}
          </option>
        </select>
        <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming" @click="startNewSession">新会话</button>
        <button class="btn btn-ghost btn-sm" @click="openIdeWorkbench">全屏</button>
      </div>
    </div>

    <div class="runtime-strip">
      <span class="runtime-pill" :class="`is-${runtimeStatusTone}`">{{ runtimeStatusText }}</span>
      <span class="runtime-pill">主Agent</span>
      <span class="runtime-pill">{{ currentModelLabel }}</span>
      <span class="runtime-pill">{{ contextSummary }}</span>
      <span v-for="badge in compactModelBadges" :key="badge" class="runtime-pill">{{ badge }}</span>
      <span v-if="modelLoadError" class="runtime-pill is-error">{{ modelLoadError }}</span>
    </div>

    <AgentMessageList
      ref="messageListRef"
      class="assistant-messages"
      :scope-hint="IDE_SCOPE"
      :session="currentSession"
      :streaming="aiStore.streaming"
      :streaming-content="streamingContent"
      :streaming-reasoning-content="streamingReasoningContent"
      :playing-message-id="playingMessageId"
      :starter-prompts="starterPrompts"
      :show-voice-actions="showVoiceActions"
      assistant-label="主Agent"
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
import { fetchAvailableModels, formatCompactTokenCount, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { cancelConversationRun, createAttachmentsFromFiles, createImageAttachmentFromDataUrl, startConversationTurn } from '@/utils/aiConversation'
import { resolveMoodAwareTtsOverrides } from '@/utils/agentMood'
import { playTextToSpeech } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'

const IDE_SCOPE = 'ide'
const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const inputText = ref('')
const pendingAttachments = ref<AIChatAttachment[]>([])
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const playingMessageId = ref('')
const capturingScreenshot = ref(false)
const modelLoadError = ref('')
const messageListRef = ref<{ scrollToBottom: () => void } | null>(null)

const starterPrompts = [
  '先基于当前工作区拆解需求，并给出下一步执行建议。',
  '先看当前已打开文件和工作区状态，再告诉我最值得做的修复项。',
]

const sessions = computed(() => aiStore.getSortedSessions(IDE_SCOPE))
const currentSession = computed<AIChatSession | null>(() => aiStore.getActiveSession(IDE_SCOPE))
const runtimeAiConfig = computed(() => aiStore.getEffectiveConfig(currentSession.value || IDE_SCOPE))
const currentAgent = computed(() => currentSession.value ? aiStore.getSessionAgent(currentSession.value) : aiStore.getSelectedAgent(IDE_SCOPE))
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
  return [...getModelCapabilityLabels(capabilities), ...getModelLimitLabels(limits)].slice(0, 4)
})
const compactModelBadges = computed(() => currentModelBadges.value.slice(0, 2))
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
  const maxContext = currentContextMetrics.value.modelMaxContextTokens || 0
  return maxContext > 0
    ? `${formatCompactTokenCount(estimated)} / ${formatCompactTokenCount(maxContext)}`
    : formatCompactTokenCount(estimated)
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
    return '模型同步中'
  }

  if (!runtimeConfigReady.value) {
    return '待补齐配置'
  }

  if (modelLoadError.value) {
    return '模型同步失败'
  }

  if (!runtimeAiConfig.value.model.trim()) {
    return '待选择模型'
  }

  return aiStore.streaming ? '对话进行中' : '已就绪'
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

  const session = aiStore.createSession(undefined, IDE_SCOPE, aiStore.getSelectedAgentId(IDE_SCOPE))
  aiStore.switchSession(session.id, IDE_SCOPE)
  scrollMessageListToBottom()
}

function handleSessionChange(sessionId: string) {
  if (!sessionId || aiStore.streaming) {
    return
  }

  aiStore.switchSession(sessionId, IDE_SCOPE)
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

function buildScreenshotAttachmentName() {
  const stamp = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `截图-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`
}

async function captureManualScreenshot() {
  if (capturingScreenshot.value || aiStore.streaming) {
    return
  }

  const capture = window.electronAPI?.captureUserScreenshot
  if (!capture) {
    showToast('error', '当前环境不支持手动截图')
    return
  }

  capturingScreenshot.value = true
  try {
    const result = await capture()
    if (result.cancelled) {
      return
    }

    if (!result.success || !result.dataUrl) {
      throw new Error(result.error || '截图失败')
    }

    const attachment = await createImageAttachmentFromDataUrl(result.dataUrl, {
      name: buildScreenshotAttachmentName(),
      source: 'user'
    })
    pendingAttachments.value = [...pendingAttachments.value, attachment].slice(0, 8)
    showToast('success', '截图已加入 IDE 对话输入框')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '截图失败')
  } finally {
    capturingScreenshot.value = false
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
    session = aiStore.createSession(undefined, IDE_SCOPE, aiStore.getSelectedAgentId(IDE_SCOPE))
    aiStore.switchSession(session.id, IDE_SCOPE)
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
    await playTextToSpeech(settingsStore.settings, message.content, resolveMoodAwareTtsOverrides(currentAgent.value))
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
  const ideAgent = aiStore.getSelectedAgent(IDE_SCOPE) || currentAgent.value
  if (!ideAgent) {
    aiStore.updateConfig({ model: modelName })
    return
  }

  void aiStore.upsertAgentProfile({
    ...ideAgent,
    preferredModel: modelName,
  })
}

function openIdeWorkbench() {
  void router.push('/ide')
}
</script>

<style scoped lang="scss">
.ide-assistant-panel {
  display: grid;
  gap: $spacing-sm;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
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
  flex-wrap: wrap;
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
  font-size: 16px;
}

.panel-actions,
.runtime-strip {
  flex-wrap: wrap;
  gap: 6px;
}

.panel-actions {
  justify-content: flex-end;
}

.runtime-strip {
  max-height: 46px;
  overflow: auto;
  scrollbar-width: thin;
}

.session-select {
  min-width: 0;
  max-width: 188px;
  min-height: 28px;
  padding: 5px 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 7px;
  background: rgba(244, 247, 250, 0.96);
  color: var(--text-primary);
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-pill {
  padding: 2px 7px;
  border-radius: 7px;
  background: rgba(226, 232, 240, 0.92);
  color: #516274;
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
  min-height: 0;
}

:deep(.agent-input-bar) {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  max-height: min(34vh, 210px);
  overflow: visible;
}

:deep(.agent-input-bar .composer-main),
:deep(.agent-input-bar .composer-footer),
:deep(.agent-input-bar .controls-row) {
  align-items: stretch;
  flex-direction: column;
}

:deep(.agent-input-bar .composer-shell) {
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.99), rgba(241, 245, 250, 0.99));
  border: 1px solid rgba(148, 163, 184, 0.14);
}

:deep(.agent-input-bar .message-input) {
  min-height: 60px;
  background: rgba(255, 255, 255, 0.94);
}

:deep(.agent-input-bar .composer-send-btn),
:deep(.agent-input-bar .model-row),
:deep(.agent-input-bar .step-row),
:deep(.agent-input-bar .control-select) {
  width: 100%;
  max-width: none;
}

:deep(.agent-input-bar .step-row) {
  justify-content: space-between;
}
</style>
