<template>
  <transition name="chat-slide">
    <div v-if="visible" ref="rootRef" class="ai-chat-dialog" :style="dialogStyle" @mousedown.stop>
      <div class="chat-header" :class="{ 'is-window-drag-enabled': useNativeWindowDrag }" @mousedown.left="handleHeaderPointerDown">
        <div class="chat-title">
          <svg class="chat-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{{ dialogTitle }}</span>
          <span v-if="dialogSubtitle" class="dialog-subtitle">{{ dialogSubtitle }}</span>
          <span class="chat-drag-hint">拖动此栏移动</span>
          <span v-if="!aiStore.isConfigured && !props.chatOnly" class="config-hint">未配置</span>
        </div>
        <div class="chat-actions">
          <select class="agent-select" :value="selectedAgentId" :disabled="aiStore.streaming" @change="handleAgentChange(($event.target as HTMLSelectElement).value)">
            <option v-for="agent in availableAgents" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </option>
          </select>
          <button class="icon-btn" :disabled="aiStore.streaming" title="新对话" @click="startNewSession">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="icon-btn" title="关闭" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 未配置提示 -->
      <div v-if="!aiStore.isConfigured" class="chat-unconfigured">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <p v-if="props.chatOnly">当前悬浮窗仅保留对话区域。若要调整模型、网关或鉴权信息，请回到主窗口完成配置后再继续。</p>
        <p v-else>请先在<strong>主窗口 → 设置 → AI 设置</strong>中配置服务地址、模型和鉴权信息；如果使用本地 Ollama，API Key 可留空</p>
        <button v-if="!props.chatOnly" class="btn btn-primary btn-sm" @click="openSettings">前往设置</button>
        <div v-if="!props.chatOnly" class="sub2api-bridge-wrap">
          <Sub2ApiAgentBridge compact settings-mode="emit" @open-settings="openSettings" />
        </div>
      </div>

      <!-- 对话区域 -->
      <template v-else>
        <div class="chat-shell" :class="{ 'has-session-manager': showSessionManager }">
          <aside v-if="showSessionManager" class="chat-manager-panel">
            <div class="manager-head">
              <div class="manager-copy">
                <strong>会话管理</strong>
                <span>Live2D 会话会同步显示到主窗口 Agent。</span>
              </div>
              <button class="panel-icon-btn" title="主窗口查看" @click="openMainView">
                <svg width="14" height="14"><use href="#icon-menu"/></svg>
              </button>
            </div>

            <div class="manager-action-row">
              <button class="manager-action-btn" :disabled="aiStore.streaming" @click="startNewSession">新建会话</button>
              <button class="manager-action-btn is-secondary" :disabled="aiStore.streaming" @click="resetScopedSessions">清空会话</button>
            </div>

            <div class="manager-session-list">
              <div
                v-for="session in managerSessions"
                :key="session.id"
                class="manager-session-card"
                :class="{ active: session.id === scopedActiveSessionId, pinned: session.title.trim() === defaultLive2DSessionTitle }"
                role="button"
                tabindex="0"
                @click="selectSession(session.id)"
                @keydown.enter.prevent="selectSession(session.id)"
                @keydown.space.prevent="selectSession(session.id)"
              >
                <div class="manager-session-head">
                  <strong>{{ session.title }}</strong>
                  <span v-if="session.title.trim() === defaultLive2DSessionTitle" class="manager-session-pin">置顶</span>
                </div>
                <span class="manager-session-meta">{{ formatSessionMeta(session) }}</span>
                <button class="manager-session-delete" :disabled="aiStore.streaming" title="删除会话" @click.stop="deleteScopedSession(session.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div v-if="!managerSessions.length" class="manager-empty">
                <span>暂无 Live2D 会话</span>
                <small>发送第一条消息后会自动创建并同步到主窗口。</small>
              </div>
            </div>

            <div class="manager-footer">
              <button class="manager-link-btn" @click="openSettings">前往设置</button>
              <button class="manager-link-btn" @click="openMainView">主窗口查看</button>
            </div>
          </aside>

          <div class="chat-main-pane">
            <div v-if="showRuntimeChrome" class="chat-top-panel">
              <div class="agent-identity-card">
                <div class="agent-identity-copy">
                  <strong>{{ currentAgent?.name || '未选择角色' }}</strong>
                  <span>{{ currentAgent?.description || '当前会话将沿用这个角色的人设、记忆和能力边界。' }}</span>
                  <small v-if="currentSessionAgent && selectedAgent && currentSessionAgent.id !== selectedAgent.id">
                    当前会话仍绑定 {{ currentSessionAgent.name }}，新选择的 {{ selectedAgent.name }} 会用于后续新会话或空会话。
                  </small>
                </div>
                <div v-if="currentAgentCapabilityBadges.length" class="agent-capability-row">
                  <span v-for="badge in currentAgentCapabilityBadges" :key="badge" class="agent-capability-pill">{{ badge }}</span>
                </div>
              </div>

              <div class="chat-runtime-toolbar">
                <button class="runtime-chip" :class="{ active: aiStore.preferences.thinkingEnabled }" @click="toggleThinkingMode">
                  思考 {{ aiStore.preferences.thinkingEnabled ? aiStore.preferences.thinkingLevel : '关' }}
                </button>
                <button class="runtime-chip" :disabled="!aiStore.preferences.thinkingEnabled" @click="cycleThinkingLevel">
                  强度
                </button>
                <button class="runtime-chip" :class="{ active: aiStore.preferences.planningMode }" @click="togglePlanningMode">
                  规划
                </button>
                <button class="runtime-chip" :class="{ active: aiStore.preferences.autoMemory }" @click="toggleAutoMemory">
                  记忆
                </button>
              </div>

              <div v-if="currentModelBadges.length || currentContextMetrics" class="chat-status-strip">
                <div v-if="currentModelBadges.length" class="model-badge-row">
                  <span v-for="badge in currentModelBadges" :key="badge" class="model-badge">{{ badge }}</span>
                </div>
                <div v-if="currentContextMetrics" class="context-inline-status">
                  <span>总上下文 {{ formatTokenCount(currentContextMetrics.selectedContextTokens) }} / {{ formatTokenCount(currentContextMetrics.modelMaxContextTokens) }}</span>
                  <span>当前装配 {{ formatTokenCount(currentContextMetrics.estimatedInputTokens) }}</span>
                  <span>最大输出 {{ formatTokenCount(currentContextMetrics.maxOutputTokens) }}</span>
                  <span v-if="aiStore.runtime.phase === 'compressing'">压缩中</span>
                </div>
              </div>

              <div v-if="modelLoadError" class="model-load-error">{{ modelLoadError }}</div>

              <Sub2ApiAgentBridge compact settings-mode="emit" @open-settings="openSettings" />
            </div>

            <div class="chat-messages" ref="messagesRef" @click="handleRichTextClick">
              <details v-if="showRuntimeChrome && currentTask" class="task-inline-board">
                <summary class="task-inline-toggle">
                  <div class="task-inline-head">
                    <div class="task-inline-main">
                      <strong>{{ currentTask.goal }}</strong>
                    </div>
                    <span class="task-status" :class="`is-${currentTask.status}`">{{ taskStatusLabel(currentTask.status) }}</span>
                  </div>
                  <div class="task-inline-meta">
                    <span>自动循环 {{ currentTask.iterationCount }}/{{ currentTask.maxIterations > 0 ? currentTask.maxIterations : '无限' }}</span>
                    <span v-if="currentTask.summary" class="task-inline-summary">{{ currentTask.summary }}</span>
                    <span v-if="currentTask.steps.length">步骤 {{ currentTask.steps.length }}</span>
                  </div>
                </summary>
                <div v-if="currentTask.summary" class="task-inline-summary-text">{{ currentTask.summary }}</div>
                <div v-if="currentTask.steps.length" class="task-inline-step-list">
                  <div v-for="step in currentTask.steps" :key="step.id" class="task-inline-step" :class="`is-${step.status}`">
                    <span class="task-inline-step-title">{{ step.title }}</span>
                    <span v-if="step.note" class="task-inline-step-note">{{ step.note }}</span>
                  </div>
                </div>
              </details>

              <div v-if="!messages.length" class="chat-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span>点击下方输入框开始对话</span>
                <span class="chat-hint">{{ emptyHint }}</span>
              </div>
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="chat-msg"
                :class="[`is-${msg.role}`, { 'has-tool-calls': msg.toolCalls?.length }]"
              >
                <div class="msg-avatar" v-if="msg.role === 'assistant'">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M6 10v1a6 6 0 0 0 12 0v-1"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
                  </svg>
                </div>
                <div class="msg-body">
                  <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
                  <div v-if="canPlayAssistantReply(msg)" class="msg-inline-actions">
                    <button class="voice-btn" :class="{ active: playingMessageId === msg.id }" @click="playAssistantMessage(msg)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      <span>{{ playingMessageId === msg.id ? '播放中' : '播放语音' }}</span>
                    </button>
                  </div>
                  <details v-if="msg.reasoningContent" class="msg-reasoning">
                    <summary>模型思考过程</summary>
                    <div v-html="renderMarkdown(msg.reasoningContent)"></div>
                  </details>
                  <div v-if="msg.attachments?.length" class="msg-attachment-grid">
                    <button v-for="attachment in msg.attachments" :key="attachment.id" class="msg-attachment-card" @click="openAttachmentPreview(attachment)">
                      <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="msg-attachment-image" />
                      <div v-else class="msg-file-badge">文件</div>
                      <span>{{ attachment.name }}</span>
                    </button>
                  </div>
                  <div v-if="msg.toolCalls?.length" class="msg-tools">
                    <div v-for="tc in msg.toolCalls" :key="tc.id" class="tool-call-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                      </svg>
                      <span>{{ tc.name }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="aiStore.streaming" class="chat-msg is-assistant is-streaming">
                <div class="msg-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M6 10v1a6 6 0 0 0 12 0v-1"/>
                  </svg>
                </div>
                <div class="msg-body">
                  <div class="msg-content" v-html="renderMarkdown(streamingContent)"></div>
                  <details v-if="streamingReasoningContent" class="msg-reasoning is-live" open>
                    <summary>模型思考过程</summary>
                    <div v-html="renderMarkdown(streamingReasoningContent)"></div>
                  </details>
                  <div class="streaming-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-input-area">
              <input ref="fileInputRef" type="file" :accept="filePickerAccept" multiple class="hidden-file-input" @change="handleAttachmentSelection" />
              <div v-if="pendingAttachments.length" class="pending-attachment-list">
                <div v-for="attachment in pendingAttachments" :key="attachment.id" class="pending-attachment-item">
                  <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="pending-attachment-image" />
                  <div v-else class="pending-file-badge">文件</div>
                  <div class="pending-attachment-copy">
                    <strong>{{ attachment.name }}</strong>
                    <span v-if="attachment.type === 'image'">{{ attachment.width || '-' }} x {{ attachment.height || '-' }}</span>
                    <span v-else>{{ formatAttachmentMeta(attachment) }}</span>
                  </div>
                  <button class="icon-btn" title="移除图片" @click="removePendingAttachment(attachment.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="chat-composer-shell">
                <textarea
                  ref="inputRef"
                  v-model="inputText"
                  :placeholder="aiStore.streaming ? `${currentAgent?.name || '当前角色'} 正在回复中...` : '输入消息，Enter 发送，Shift+Enter 换行'"
                  class="chat-input"
                  rows="3"
                  @keydown="handleKeydown"
                  @paste="handleComposerPaste"
                  @input="autoResize"
                />
                <div class="chat-composer-toolbar">
                  <div class="chat-composer-actions">
                    <button class="toolbar-btn attach-btn attach-btn-inline" :disabled="aiStore.streaming" title="选择文件或图片" @click="openAttachmentPicker">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span>附件</span>
                    </button>
                    <button class="toolbar-btn attach-btn" :disabled="aiStore.streaming || capturingScreenshot" :title="capturingScreenshot ? '等待手动截图完成' : '手动截图'" @click="captureManualScreenshot">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 3H5a2 2 0 0 0-2 2v4"/>
                        <path d="M15 3h4a2 2 0 0 1 2 2v4"/>
                        <path d="M21 15v4a2 2 0 0 1-2 2h-4"/>
                        <path d="M3 15v4a2 2 0 0 0 2 2h4"/>
                        <rect x="7" y="7" width="10" height="10" rx="1.5"/>
                      </svg>
                      <span>{{ capturingScreenshot ? '截图中...' : '截图' }}</span>
                    </button>
                  </div>
                  <button
                    class="send-btn"
                    :class="{ 'is-stop': aiStore.streaming }"
                    :disabled="sendButtonDisabled"
                    :title="aiStore.streaming ? '停止当前任务' : '发送消息'"
                    @click="handlePrimaryAction"
                  >
                    <svg v-if="aiStore.streaming" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div v-if="showRuntimeChrome" class="chat-control-row">
                <div class="composer-model-row">
                  <span class="composer-control-label">模型</span>
                  <select class="model-select" :value="runtimeAiConfig.model" @change="handleModelChange(($event.target as HTMLSelectElement).value)">
                    <option v-if="!runtimeAiConfig.model" value="">请先选择模型</option>
                    <option v-for="model in availableAiModels" :key="model.id" :value="model.name">
                      {{ model.label }}
                    </option>
                  </select>
                  <button class="icon-btn" :disabled="loadingAiModels || !canRefreshModels" title="刷新模型" @click="refreshModelOptions">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="23 4 23 10 17 10"/>
                      <polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0114.13-3.36L23 10"/>
                      <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14"/>
                    </svg>
                  </button>
                  <span class="composer-control-value">{{ currentModelLabel }}</span>
                </div>
                <div class="composer-action-row">
                  <div class="runtime-stepper">
                    <button class="stepper-btn" @click="adjustMaxAutoSteps(-1)">-</button>
                    <span>步数 {{ aiStore.preferences.maxAutoSteps > 0 ? aiStore.preferences.maxAutoSteps : '无限' }}</span>
                    <button class="stepper-btn" @click="adjustMaxAutoSteps(1)">+</button>
                  </div>
                  <button class="runtime-chip" title="按当前模型应用推荐的自动步数，用于限制长任务连续调用工具的轮数" @click="applyRecommendedAutoSteps">
                    推荐 {{ recommendedAutoSteps }}
                  </button>
                </div>
              </div>
              <div v-if="showRuntimeChrome" class="composer-inline-hint">支持任意文件、截图粘贴与工具生成的桌面截图。</div>
            </div>
          </div>
        </div>

        <AttachmentPreviewDialog :attachment="previewAttachment" @close="previewAttachment = null" />
      </template>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { AIChatAttachment, AIChatMessage, AIChatSession, AIConversationScope, AIProviderModel } from '@/types'
import AttachmentPreviewDialog from '@/components/AttachmentPreviewDialog.vue'
import Sub2ApiAgentBridge from '@/components/Sub2ApiAgentBridge.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { cancelConversationRun, createAttachmentsFromFiles, createImageAttachmentFromDataUrl, startConversationTurn } from '@/utils/aiConversation'
import { fetchAvailableModels, formatCompactTokenCount, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { handleRichTextActivation, renderRichText as renderRichTextContent } from '@/utils/aiRichText'
import { playTextToSpeech, stopTTSPlayback } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'

const props = defineProps<{
  visible: boolean
  anchorX?: number
  anchorY?: number
  scope?: AIConversationScope
  title?: string
  subtitle?: string
  nativeWindowDrag?: boolean
  showSessionManager?: boolean
  chatOnly?: boolean
}>()

const emit = defineEmits<{
  close: []
  openSettings: []
  openMain: []
  dragStateChange: [active: boolean]
}>()

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const rootRef = ref<HTMLElement | null>(null)
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const inputText = ref('')
const pendingAttachments = ref<AIChatAttachment[]>([])
const previewAttachment = ref<AIChatAttachment | null>(null)
const filePickerAccept = ref('')
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const modelLoadError = ref('')
const playingMessageId = ref('')
const autoPlayedMessageId = ref('')
const defaultLive2DSessionTitle = 'Live2D'
const capturingScreenshot = ref(false)

const chatScope = computed(() => props.scope || 'main')
const showSessionManager = computed(() => typeof props.showSessionManager === 'boolean' ? props.showSessionManager : chatScope.value === 'live2d')
const useNativeWindowDrag = computed(() => typeof props.nativeWindowDrag === 'boolean' ? props.nativeWindowDrag : chatScope.value === 'live2d')
const showRuntimeChrome = computed(() => !props.chatOnly)
const aiConfig = computed(() => aiStore.config)
const scopedActiveSessionId = computed(() => aiStore.getActiveSessionId(chatScope.value))
const scopedSessions = computed(() => aiStore.getSortedSessions(chatScope.value))
const currentSession = computed(() => aiStore.getActiveSession(chatScope.value))
const availableAgents = computed(() => aiStore.getAgentProfiles())
const selectedAgentId = computed(() => aiStore.getSelectedAgentId(chatScope.value))
const selectedAgent = computed(() => aiStore.getSelectedAgent(chatScope.value))
const currentSessionAgent = computed(() => currentSession.value ? aiStore.getSessionAgent(currentSession.value) : null)
const currentAgent = computed(() => currentSessionAgent.value || selectedAgent.value)
const runtimeAiConfig = computed(() => aiStore.getEffectiveConfig(currentSession.value || chatScope.value))
const workspaceRoot = computed(() => aiStore.ideWorkspace?.rootPath || '')
const currentAgentCapabilities = computed(() => {
  if (currentSession.value) {
    return aiStore.getEffectiveAgentCapabilities(currentSession.value)
  }

  return currentAgent.value?.capabilities || null
})
const currentAgentCapabilityBadges = computed(() => {
  const capabilities = currentAgentCapabilities.value
  if (!capabilities) {
    return []
  }

  if (capabilities.conversationOnly) {
    return ['仅对话', capabilities.memoryEnabled ? '记忆' : '无记忆']
  }

  return [
    capabilities.memoryEnabled ? '记忆' : '无记忆',
    capabilities.fileControlEnabled ? '文件控制' : '无文件控制',
    capabilities.softwareControlEnabled ? '软件控制' : '无软件控制',
    capabilities.mcpEnabled ? 'MCP' : '无 MCP',
    capabilities.skillEnabled ? 'Skill' : '无 Skill'
  ]
})
const dialogTitle = computed(() => props.title || currentAgent.value?.name || 'Agent')
const dialogSubtitle = computed(() => props.subtitle || currentAgent.value?.description || (chatScope.value === 'live2d' ? 'Live2D 标签已绑定当前角色' : '主窗口文本对话'))
const emptyHint = computed(() => {
  if (chatScope.value === 'live2d') {
    return currentAgent.value?.name
      ? `${currentAgent.value.name} 会在这个独立会话域里陪你继续对话，并优先沿用这个角色的记忆与语音风格。`
      : '这是 Live2D 的独立对话空间，会单独保存长期记忆，并默认自动播报助手回复。'
  }

  if (currentAgentCapabilities.value?.conversationOnly) {
    return '当前角色处于仅对话模式，会专注陪聊、解释和提供建议。'
  }

  return currentAgent.value?.description || '我可以帮你查询、导入、导出账号，或控制电脑执行操作'
})
const currentTask = computed(() => aiStore.getActiveTask(chatScope.value))
const streamingContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.content : ''))
const streamingReasoningContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.reasoningContent : ''))
const currentContextMetrics = computed(() => {
  const sessionId = currentSession.value?.id
  if (!sessionId) {
    return aiStore.runtime.context
  }

  if (aiStore.runtime.sessionId === sessionId && aiStore.runtime.context) {
    return aiStore.runtime.context
  }

  return aiStore.getContextMetrics(sessionId)
})
const messages = computed(() => {
  const session = currentSession.value
  if (!session) {
    return []
  }

  return session.messages.filter(m => m.role === 'user' || m.role === 'assistant')
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
  const matchedModel = availableAiModels.value.find(model => model.name === runtimeAiConfig.value.model || model.id === runtimeAiConfig.value.model)
  if (matchedModel) {
    return matchedModel
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
  } satisfies AIProviderModel
})
const currentModelBadges = computed(() => {
  const gatewayBadges = aiConfig.value.connectionTemplate === 'sub2api-antigravity'
    ? ['Sub2API', 'Antigravity']
    : aiConfig.value.connectionTemplate === 'sub2api-gemini'
      ? ['Sub2API', 'Gemini']
    : aiConfig.value.connectionTemplate === 'sub2api-openai'
      ? ['Sub2API', 'Responses']
      : aiConfig.value.connectionTemplate === 'sub2api-claude'
        ? ['Sub2API']
      : []

  return [
    ...gatewayBadges,
    ...getModelCapabilityLabels(currentModelMeta.value?.capabilities),
    ...getModelLimitLabels(currentModelMeta.value?.limits)
  ]
})
const currentModelLabel = computed(() => currentModelMeta.value?.label || runtimeAiConfig.value.model.trim() || '未选择')
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
const dialogStyle = computed(() => ({
  width: 'min(620px, calc(100vw - 20px))',
  minHeight: 'min(480px, calc(100vh - 48px))',
  maxHeight: 'min(760px, calc(100vh - 20px))'
}))
const managerSessions = computed(() => {
  if (!showSessionManager.value) {
    return []
  }

  return [...scopedSessions.value].sort((left, right) => {
    const leftPinned = left.title.trim() === defaultLive2DSessionTitle
    const rightPinned = right.title.trim() === defaultLive2DSessionTitle
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1
    }

    return right.updatedAt - left.updatedAt
  })
})

let pointerDownPoint: { x: number; y: number } | null = null
let draggingWindow = false

defineExpose({
  getRootElement: () => rootRef.value,
  hasBlockingOverlay: () => Boolean(previewAttachment.value)
})

function formatSessionMeta(session: AIChatSession) {
  const stamp = new Date(session.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${stamp} · ${session.messages.length} 条`
}

function openMainView() {
  emit('openMain')
}

function selectSession(sessionId: string) {
  if (aiStore.streaming) {
    return
  }

  aiStore.switchSession(sessionId, chatScope.value)
  scrollToBottom()
}

async function handleAgentChange(agentId: string) {
  if (aiStore.streaming) {
    return
  }

  const targetAgent = await aiStore.selectAgent(chatScope.value, agentId)
  if (!targetAgent) {
    return
  }

  if (currentSession.value && currentSession.value.messages.length === 0) {
    await aiStore.assignSessionAgent(currentSession.value.id, targetAgent.id)
    return
  }

  if (currentSession.value) {
    showToast('info', `已将默认角色切换为 ${targetAgent.name}，当前会话仍保持原角色。`)
  }
}

async function ensureScopedSession() {
  const existingActive = aiStore.getActiveSession(chatScope.value)
  if (existingActive) {
    return existingActive
  }

  const fallbackSession = scopedSessions.value[0]
  if (fallbackSession) {
    aiStore.switchSession(fallbackSession.id, chatScope.value)
    return fallbackSession
  }

  return aiStore.createSession(
    chatScope.value === 'live2d' ? defaultLive2DSessionTitle : undefined,
    chatScope.value,
    aiStore.getSelectedAgentId(chatScope.value)
  )
}

async function deleteScopedSession(sessionId: string) {
  if (aiStore.streaming) {
    return
  }

  await aiStore.deleteSession(sessionId)
  if (props.visible && chatScope.value === 'live2d') {
    await ensureScopedSession()
  }
}

async function resetScopedSessions() {
  if (aiStore.streaming) {
    return
  }

  const targetLabel = chatScope.value === 'live2d' ? 'Live2D 会话' : '当前对话域'
  if (!confirm(`确定要清空${targetLabel}的全部聊天记录吗？此操作不可恢复。`)) {
    return
  }

  await aiStore.clearAllSessions(chatScope.value)
  inputText.value = ''
  pendingAttachments.value = []
  previewAttachment.value = null
  autoResize()

  if (props.visible && chatScope.value === 'live2d') {
    await ensureScopedSession()
  }
}

function renderMarkdown(content: string): string {
  return renderRichTextContent(content)
}

function handleRichTextClick(event: MouseEvent) {
  void handleRichTextActivation(event, { workspaceRoot: workspaceRoot.value })
}

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      }
    })
  })
}

function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 132) + 'px'
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (aiStore.streaming) {
      stopCurrentRun()
      return
    }

    void sendMessage()
  }
}

function handlePrimaryAction() {
  if (aiStore.streaming) {
    stopCurrentRun()
    return
  }

  void sendMessage()
}

function taskStatusLabel(status: string) {
  if (status === 'planning') return '规划中'
  if (status === 'running') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '已阻塞'
  return status
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
    await aiStore.updatePreferences({ maxAutoSteps: getRecommendedAutoSteps(aiStore.getEffectiveConfig(currentSession.value || chatScope.value)) })
  }
}

function mergePendingAttachments(nextAttachments: AIChatAttachment[]) {
  pendingAttachments.value = [...pendingAttachments.value, ...nextAttachments].slice(0, 8)
}

function buildScreenshotAttachmentName() {
  const stamp = new Date()
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `截图-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`
}

async function handleAttachmentSelection(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length === 0) {
    return
  }

  const nextAttachments = await createAttachmentsFromFiles(files)
  mergePendingAttachments(nextAttachments)
  target.value = ''
}

function removePendingAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter(attachment => attachment.id !== id)
}

function openAttachmentPicker() {
  filePickerAccept.value = ''
  fileInputRef.value?.click()
}

function openAttachmentPreview(attachment: AIChatAttachment) {
  previewAttachment.value = attachment
}

async function handleComposerPaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items || [])
  const files = items
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (files.length === 0) {
    return
  }

  event.preventDefault()
  mergePendingAttachments(await createAttachmentsFromFiles(files))
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
    mergePendingAttachments([attachment])
    showToast('success', '截图已加入输入框')
    nextTick(() => inputRef.value?.focus())
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '截图失败')
  } finally {
    capturingScreenshot.value = false
  }
}

async function toggleThinkingMode() {
  await aiStore.updatePreferences({ thinkingEnabled: !aiStore.preferences.thinkingEnabled })
}

async function cycleThinkingLevel() {
  if (!aiStore.preferences.thinkingEnabled) {
    return
  }

  const levelOrder = ['low', 'medium', 'high'] as const
  const currentIndex = levelOrder.indexOf(aiStore.preferences.thinkingLevel === 'off' ? 'medium' : aiStore.preferences.thinkingLevel as 'low' | 'medium' | 'high')
  const nextLevel = levelOrder[(currentIndex + 1) % levelOrder.length]
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

function stopCurrentRun() {
  cancelConversationRun(aiStore.runtime.sessionId)
}

function formatTokenCount(value: number) {
  return formatCompactTokenCount(value)
}

function formatAttachmentMeta(attachment: AIChatAttachment) {
  const sizeLabel = attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '未知大小'
  return `${attachment.mimeType || '文件'} · ${sizeLabel}`
}

function startNewSession() {
  if (aiStore.streaming) return

  aiStore.createSession(undefined, chatScope.value, aiStore.getSelectedAgentId(chatScope.value))
  scrollToBottom()
}

function openSettings() {
  emit('openSettings')
}

function cleanupDragTracking() {
  window.removeEventListener('mousemove', handleGlobalPointerMove)
  window.removeEventListener('mouseup', handleGlobalPointerUp)

  if (draggingWindow) {
    window.electronAPI?.endWindowDrag()
  }

  pointerDownPoint = null
  draggingWindow = false
  emit('dragStateChange', false)
}

function handleGlobalPointerMove(event: MouseEvent) {
  if (!pointerDownPoint || !window.electronAPI) {
    return
  }

  const deltaX = event.screenX - pointerDownPoint.x
  const deltaY = event.screenY - pointerDownPoint.y
  if (!draggingWindow && Math.hypot(deltaX, deltaY) >= 4) {
    draggingWindow = true
    window.electronAPI.startWindowDrag(pointerDownPoint)
  }

  if (draggingWindow) {
    window.electronAPI.updateWindowDrag({ x: event.screenX, y: event.screenY })
  }
}

function handleGlobalPointerUp() {
  cleanupDragTracking()
}

function handleHeaderPointerDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!window.electronAPI || !target) {
    return
  }

  if (target.closest('button, input, select, textarea, a, summary')) {
    return
  }

  if (useNativeWindowDrag.value) {
    return
  }

  pointerDownPoint = { x: event.screenX, y: event.screenY }
  draggingWindow = false
  emit('dragStateChange', true)
  window.addEventListener('mousemove', handleGlobalPointerMove)
  window.addEventListener('mouseup', handleGlobalPointerUp)
}

async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingAttachments.value.length === 0) || aiStore.streaming || !aiStore.isConfigured) {
    return
  }

  const session = currentSession.value || await ensureScopedSession()
  const attachments = [...pendingAttachments.value]
  inputText.value = ''
  pendingAttachments.value = []
  autoResize()

  await startConversationTurn(
    session.id,
    text,
    attachments,
    {
      onStream() {
        scrollToBottom()
      },
      onAfterUpdate() {
        scrollToBottom()
      }
    }
  )
}

function shouldAutoPlayReplies() {
  if (!settingsStore.settings.ttsEnabled) {
    return false
  }

  if (typeof currentAgent.value?.tts.autoPlayReplies === 'boolean') {
    return currentAgent.value.tts.autoPlayReplies
  }

  return chatScope.value === 'live2d' && settingsStore.settings.ttsAutoPlayLive2D
}

function shouldShowReplyVoiceButton() {
  if (!settingsStore.settings.ttsEnabled) {
    return false
  }

  return chatScope.value === 'live2d' || settingsStore.settings.ttsShowMainReplyButton
}

function canPlayAssistantReply(message: AIChatMessage) {
  return message.role === 'assistant' && !!message.content.trim() && shouldShowReplyVoiceButton()
}

async function playAssistantMessage(message: AIChatMessage) {
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

async function autoPlayLatestAssistantMessage() {
  const latestMessage = [...messages.value].reverse().find(message => message.role === 'assistant' && message.content.trim())
  if (!latestMessage || autoPlayedMessageId.value === latestMessage.id || !shouldAutoPlayReplies()) {
    return
  }

  autoPlayedMessageId.value = latestMessage.id
  await playAssistantMessage(latestMessage)
}

watch(() => props.visible, (val) => {
  if (val) {
    void ensureScopedSession()

    nextTick(() => {
      inputRef.value?.focus()
      autoResize()
      scrollToBottom()
    })
    void refreshModelOptions()
    return
  }

  previewAttachment.value = null
  playingMessageId.value = ''
  stopTTSPlayback()
  cleanupDragTracking()
})

watch(() => [aiConfig.value.protocol, aiConfig.value.baseUrl, aiConfig.value.apiKey], () => {
  if (props.visible) {
    void refreshModelOptions()
  }
})

watch(
  () => [scopedActiveSessionId.value, messages.value.at(-1)?.id ?? '', aiStore.runtime.updatedAt, props.visible],
  () => {
    if (props.visible) {
      scrollToBottom()
    }
  },
  { flush: 'post' }
)

watch(
  () => [props.visible, aiStore.streaming, messages.value.at(-1)?.id ?? '', chatScope.value],
  ([visible, streamingNow]) => {
    if (visible && !streamingNow) {
      void autoPlayLatestAssistantMessage()
    }
  },
  { flush: 'post' }
)

onMounted(() => {
  if (!aiStore.loaded) {
    void aiStore.init()
  }

  if (aiStore.runtime.running && aiStore.runtime.sessionId && aiStore.resolveSessionScope(aiStore.runtime.sessionId) === chatScope.value && scopedActiveSessionId.value !== aiStore.runtime.sessionId) {
    aiStore.switchSession(aiStore.runtime.sessionId, chatScope.value)
  } else if (scopedSessions.value[0] && !scopedActiveSessionId.value) {
    aiStore.switchSession(scopedSessions.value[0].id, chatScope.value)
  } else if (chatScope.value === 'live2d' && !scopedActiveSessionId.value) {
    void ensureScopedSession()
  }

  if (props.visible) {
    void refreshModelOptions()
  }
})

onBeforeUnmount(() => {
  cleanupDragTracking()
  stopTTSPlayback()
  // 悬浮聊天窗卸载时不再中止后台 AI 任务。
})
</script>

<style lang="scss" scoped>
.ai-chat-dialog {
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 24px);
  border-radius: 16px;
  background: rgba(255, 248, 251, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 60px rgba(95, 69, 84, 0.25), 0 0 0 1px rgba(255, 200, 220, 0.2);
  backdrop-filter: blur(24px);
  overflow: hidden;
}

.chat-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  flex: 1;
  min-height: 0;

  &.has-session-manager {
    grid-template-columns: 200px minmax(0, 1fr);
  }
}

.chat-manager-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  min-width: 0;
  padding: 12px 10px;
  border-right: 1px solid rgba(255, 200, 220, 0.2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 244, 248, 0.7));
}

.manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.manager-copy {
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: 12px;
  }

  span {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.5;
  }
}

.panel-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.96);
    color: var(--primary);
  }
}

.manager-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.manager-action-btn,
.manager-link-btn {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(255, 200, 220, 0.24);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(255, 140, 180, 0.45);
    color: var(--primary);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
}

.manager-action-btn.is-secondary,
.manager-link-btn {
  background: rgba(255, 248, 251, 0.86);
}

.manager-session-list {
  display: grid;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.manager-session-card {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 10px 36px 10px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 200, 220, 0.18);
  background: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 140, 180, 0.38);
    box-shadow: 0 12px 24px rgba(171, 119, 144, 0.12);
  }

  &.active {
    border-color: rgba(255, 140, 180, 0.45);
    background: rgba(255, 237, 243, 0.86);
  }

  &.pinned {
    box-shadow: inset 0 0 0 1px rgba(255, 170, 200, 0.16);
  }
}

.manager-session-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-size: 12px;
  }
}

.manager-session-pin {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 170, 200, 0.16);
  color: var(--primary);
  font-size: 10px;
  font-weight: 700;
}

.manager-session-meta {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.manager-session-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 200, 220, 0.2);
    color: var(--primary);
  }
}

.manager-empty {
  display: grid;
  gap: 4px;
  padding: 14px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.5);
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;

  small {
    font-size: 10px;
  }
}

.manager-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.chat-main-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 200, 220, 0.25);
  background: rgba(255, 255, 255, 0.4);
  cursor: move;
}

.chat-header.is-window-drag-enabled {
  -webkit-app-region: drag;
}

.chat-header.is-window-drag-enabled .icon-btn,
.chat-header.is-window-drag-enabled .agent-select {
  -webkit-app-region: no-drag;
}

.chat-header button {
  cursor: pointer;
}

.chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);

  .chat-icon {
    color: var(--primary);
  }

  .config-hint {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 180, 60, 0.15);
    color: #b47c20;
  }

  .dialog-subtitle {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(93, 135, 255, 0.08);
    color: #2d4f99;
  }
}

.chat-drag-hint {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 170, 200, 0.12);
  color: var(--primary);
}

.chat-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  -webkit-app-region: no-drag;
}

.agent-select {
  min-width: 104px;
  border: 1px solid rgba(255, 200, 220, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 700;
  padding: 6px 10px;
  outline: none;
}

.agent-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 200, 220, 0.25);
    color: var(--primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.chat-unconfigured {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
  text-align: center;

  p {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
  }
}

.sub2api-bridge-wrap {
  width: 100%;
}

.chat-top-panel {
  display: grid;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255, 200, 220, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 248, 251, 0.28));
}

.agent-identity-card {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 200, 220, 0.2);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.58);
}

.agent-identity-copy {
  display: grid;
  gap: 4px;
}

.agent-identity-copy strong {
  font-size: 13px;
  color: var(--text-primary);
}

.agent-identity-copy span,
.agent-identity-copy small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.agent-capability-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-capability-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 246, 250, 0.92);
  border: 1px solid rgba(255, 200, 220, 0.22);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
}

.model-select {
  min-width: 0;
  border: 1px solid rgba(255, 200, 220, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.76);
  color: var(--text-primary);
  font-size: 12px;
  padding: 8px 10px;
  outline: none;

  &:focus {
    border-color: rgba(255, 140, 180, 0.45);
  }
}

.model-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.model-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 244, 248, 0.92);
  border: 1px solid rgba(255, 200, 220, 0.24);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.model-load-error {
  color: #b42318;
  font-size: 11px;
  line-height: 1.5;
}

.chat-runtime-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.runtime-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid rgba(255, 200, 220, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: rgba(255, 140, 180, 0.45);
    color: var(--primary);
  }

  &.active {
    border-color: rgba(255, 140, 180, 0.45);
    background: rgba(255, 170, 200, 0.15);
    color: var(--primary);
  }

  &.is-danger {
    border-color: rgba(220, 80, 80, 0.24);
    background: rgba(220, 80, 80, 0.08);
    color: #b42318;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.chat-status-strip {
  display: grid;
  gap: 6px;
}

.context-inline-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;

  span {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(93, 135, 255, 0.08);
    color: #2d4f99;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.5;
  }
}

.task-inline-board {
  display: grid;
  gap: 8px;
  margin: 0 0 10px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 170, 200, 0.18);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 170, 200, 0.08));
  overflow: hidden;
}

.task-inline-toggle {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: '展开详情';
    justify-self: start;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
  }
}

.task-inline-board[open] > .task-inline-toggle::after {
  content: '收起详情';
}

.task-inline-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.task-inline-main {
  display: grid;
  gap: 2px;

  strong {
    color: var(--text-primary);
    font-size: 12px;
  }
}

.task-inline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.task-inline-summary {
  color: inherit;
  flex: 1 1 180px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-inline-summary-text {
  padding: 0 10px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.55;
}

.task-inline-step-list {
  display: grid;
  gap: 6px;
  padding: 0 10px 10px;
}

.task-inline-step {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.75);

  &.is-in_progress {
    border-color: rgba(255, 180, 60, 0.32);
  }

  &.is-completed {
    border-color: rgba(84, 201, 159, 0.3);
  }

  &.is-blocked {
    border-color: rgba(220, 80, 80, 0.24);
  }
}

.task-inline-step-title {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 700;
}

.task-inline-step-note {
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.5;
}

.task-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;

  &.is-planning {
    background: rgba(93, 135, 255, 0.12);
    color: #2d4f99;
  }

  &.is-running {
    background: rgba(255, 180, 60, 0.15);
    color: #9a6414;
  }

  &.is-completed {
    background: rgba(84, 201, 159, 0.16);
    color: #187d59;
  }

  &.is-blocked {
    background: rgba(220, 80, 80, 0.12);
    color: #b42318;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 9px;
  min-height: 260px;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;

  span {
    font-size: 12px;
    color: var(--text-muted);
  }

  .chat-hint {
    font-size: 11px;
    opacity: 0.7;
  }
}

.chat-msg {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  &.is-user {
    flex-direction: row-reverse;

    .msg-body {
      align-items: flex-end;
    }

    .msg-content {
      background: linear-gradient(135deg, rgba(255, 170, 200, 0.3), rgba(255, 140, 180, 0.2));
      border-radius: 14px 14px 4px 14px;
    }
  }

  &.is-assistant {
    .msg-content {
      background: rgba(255, 255, 255, 0.65);
      border-radius: 14px 14px 14px 4px;
    }
  }

  &.is-streaming .msg-content {
    min-height: 20px;
  }
}

.msg-avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255, 180, 210, 0.4), rgba(200, 160, 255, 0.3));
  color: var(--primary);
  flex-shrink: 0;
}

.msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
}

.msg-inline-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg-content {
  padding: 8px 12px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-primary);
  word-break: break-word;
  overflow-wrap: anywhere;

  :deep(code) {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.06);
    font-size: 11.5px;
    font-family: 'Consolas', monospace;
  }

  :deep(strong) {
    font-weight: 600;
  }
}

:deep(.oa-rich-link) {
  color: color-mix(in srgb, var(--primary) 78%, white 16%);
  text-decoration: underline;
  text-underline-offset: 2px;
}

:deep(.oa-rich-link.is-path) {
  color: #2c7cff;
}

:deep(.oa-rich-muted) {
  color: var(--text-muted);
}

.voice-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid rgba(93, 135, 255, 0.2);
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.08);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(93, 135, 255, 0.14);
  }

  &.active {
    background: rgba(255, 170, 200, 0.18);
    border-color: rgba(255, 140, 180, 0.28);
    color: var(--primary);
  }
}

.msg-reasoning {
  width: 100%;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 200, 220, 0.22);
  background: rgba(255, 255, 255, 0.55);
  color: var(--text-secondary);
  font-size: 11.5px;
  line-height: 1.6;

  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--text-primary);
  }

  &.is-live {
    border-color: rgba(93, 135, 255, 0.2);
    background: rgba(93, 135, 255, 0.06);
  }
}

.msg-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.msg-attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.msg-attachment-card {
  display: grid;
  gap: 6px;
  width: 112px;
  padding: 8px;
  border: 1px solid rgba(255, 200, 220, 0.26);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-primary);
  font-size: 10px;
  text-align: left;
  cursor: pointer;

  span {
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.5;
  }
}

.msg-attachment-image {
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
}

.msg-file-badge,
.pending-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(93, 135, 255, 0.14), rgba(255, 174, 113, 0.14));
  color: #2d4f99;
  font-size: 10px;
  font-weight: 700;
}

.msg-file-badge {
  width: 100%;
  height: 72px;
}

.tool-call-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(140, 120, 255, 0.1);
  color: #6b52ae;
  font-size: 10px;
  font-weight: 500;
}

.streaming-indicator {
  display: flex;
  gap: 3px;
  padding: 4px 0;

  span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--primary);
    opacity: 0.4;
    animation: chat-dot-bounce 1.2s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}

@keyframes chat-dot-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.1); }
}

.chat-input-area {
  display: grid;
  gap: 8px;
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(255, 200, 220, 0.2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 247, 250, 0.96));
}

.hidden-file-input {
  display: none;
}

.pending-attachment-list {
  display: grid;
  gap: 6px;
}

.pending-attachment-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(255, 200, 220, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.68);
}

.pending-attachment-image {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 8px;
}

.pending-file-badge {
  width: 44px;
  height: 44px;
}

.pending-attachment-copy {
  display: grid;
  gap: 2px;

  strong {
    color: var(--text-primary);
    font-size: 11px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  span {
    color: var(--text-muted);
    font-size: 10px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}

.chat-composer-shell {
  display: grid;
  gap: 10px;
  padding: 10px 12px 8px;
  border-radius: 16px;
  border: 1px solid rgba(255, 200, 220, 0.24);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.chat-composer-toolbar,
.chat-composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-composer-toolbar {
  justify-content: space-between;
}

.composer-model-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chat-control-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
}

.composer-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.runtime-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid rgba(255, 200, 220, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.74);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.stepper-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 170, 200, 0.14);
  color: var(--primary);
  cursor: pointer;
}

.chat-input {
  border: 1px solid rgba(255, 200, 220, 0.3);
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 12.5px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
  max-height: 132px;

  &:focus {
    border-color: var(--primary);
  }

  &::placeholder {
    color: var(--text-muted);
    font-size: 11.5px;
  }
}

.toolbar-btn {
  min-height: 36px;
  width: auto;
  padding: 0 12px;
  gap: 6px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.98);
  border: 1px solid rgba(203, 213, 225, 0.7);
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(244, 114, 182, 0.32);
  color: var(--primary);
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.attach-btn-inline {
  align-self: stretch;
}

.composer-control-label {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.composer-control-value {
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.composer-inline-hint {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.send-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(var(--primary-rgb, 232 120 154), 0.35);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.is-stop {
    background: linear-gradient(135deg, #ff8f6b, #d34b5a);
  }
}

.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.chat-slide-enter-from,
.chat-slide-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

@media (max-width: 640px) {
  .ai-chat-dialog {
    border-radius: 14px;
  }

  .chat-header,
  .chat-input-area,
  .chat-top-panel {
    padding-left: 10px;
    padding-right: 10px;
  }

  .msg-body {
    max-width: 90%;
  }

  .task-inline-board {
    align-items: stretch;
  }

  .task-inline-toggle,
  .task-inline-summary-text,
  .task-inline-step-list,
  .chat-messages {
    padding-left: 10px;
    padding-right: 10px;
  }

  .composer-model-row {
    width: 100%;
  }

  .task-inline-head {
    flex-direction: column;
  }
}

@media (max-width: 780px) {
  .chat-shell.has-session-manager {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-manager-panel {
    grid-template-rows: auto auto auto auto;
    border-right: none;
    border-bottom: 1px solid rgba(255, 200, 220, 0.2);
  }

  .manager-session-list {
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, 1fr);
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
  }

  .chat-control-row,
  .chat-composer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .chat-composer-actions {
    width: 100%;
  }

  .toolbar-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
