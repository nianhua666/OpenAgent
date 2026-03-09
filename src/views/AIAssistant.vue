<template>
  <div class="ai-page">
    <div class="ai-page-head">
      <h2 class="page-title">AI 助手</h2>

      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          对话详情
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'memory' }" @click="activeTab = 'memory'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          长期记忆
          <span class="tab-badge" v-if="aiStore.memories.length">{{ aiStore.memories.length }}</span>
        </button>
      </div>
    </div>

    <div class="ai-layout">
      <!-- 左侧：对话历史列表 -->
      <div class="ai-sidebar glass-panel">
        <div class="sidebar-header">
          <h3>历史对话</h3>
          <button class="btn btn-primary btn-sm" :disabled="aiStore.streaming" @click="startNewSession">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新对话
          </button>
        </div>

        <div class="session-list">
          <div v-if="aiStore.sortedSessions.length === 0" class="empty-hint">暂无对话记录</div>
          <div
            v-for="session in aiStore.sortedSessions"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === aiStore.activeSessionId, disabled: aiStore.streaming }"
            @click="handleSessionSelect(session.id)"
          >
            <div class="session-info">
              <span class="session-title">{{ session.title }}</span>
              <span class="session-meta">{{ formatTime(session.updatedAt) }} · {{ session.messages.length }} 条</span>
            </div>
            <button class="delete-btn" :disabled="aiStore.streaming" title="删除对话" @click.stop="deleteSession(session.id)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="sidebar-footer" v-if="aiStore.sortedSessions.length > 0">
          <button class="btn btn-secondary btn-sm" :disabled="aiStore.streaming" @click="clearAllSessions">清空所有对话</button>
        </div>
      </div>

      <!-- 右侧：对话内容 / 记忆管理 -->
      <div class="ai-main">
        <!-- 对话详情 -->
        <div v-if="activeTab === 'chat'" class="chat-panel glass-panel">
          <div v-if="!aiStore.isConfigured" class="panel-empty chat-unconfigured">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <p>当前还没有可用的 AI 服务配置。请先在设置页填写服务地址、模型和鉴权信息。</p>
            <button class="btn btn-primary btn-sm" @click="openSettingsPage">前往 AI 设置</button>
          </div>

          <template v-else>
            <div class="chat-control-strip">
              <div class="chat-runtime-toolbar">
                <button class="runtime-chip" :class="{ active: aiStore.preferences.thinkingEnabled }" @click="toggleThinkingMode">
                  思考 {{ aiStore.preferences.thinkingEnabled ? aiStore.preferences.thinkingLevel : '关闭' }}
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

              <div v-if="currentModelBadges.length || currentContextMetrics || modelLoadError" class="chat-status-strip">
                <div v-if="currentModelBadges.length" class="control-badges">
                  <span v-for="badge in currentModelBadges" :key="badge" class="control-badge">{{ badge }}</span>
                </div>
                <div v-if="currentContextMetrics" class="context-status-bar">
                  <span>上下文 {{ formatTokenCount(currentContextMetrics.estimatedInputTokens) }} / {{ formatTokenCount(currentContextMetrics.selectedContextTokens) }}</span>
                  <span>模型上限 {{ formatTokenCount(currentContextMetrics.modelMaxContextTokens) }}</span>
                  <span>输出上限 {{ formatTokenCount(currentContextMetrics.maxOutputTokens) }}</span>
                  <span v-if="currentContextMetrics.compressionCount > 0">已压缩 {{ currentContextMetrics.compressionCount }} 次</span>
                  <span v-if="aiStore.runtime.phase === 'compressing'">压缩中</span>
                </div>
                <span v-if="modelLoadError" class="control-error">{{ modelLoadError }}</span>
              </div>
            </div>

            <div ref="messagesRef" class="chat-panel-scroll">
              <details v-if="currentTask" class="task-board">
                <summary class="task-board-summary">
                  <div class="task-board-header">
                    <strong>{{ currentTask.goal }}</strong>
                    <span class="task-status" :class="`is-${currentTask.status}`">{{ taskStatusLabel(currentTask.status) }}</span>
                  </div>
                  <div class="task-board-meta">
                    <span>自动循环 {{ currentTask.iterationCount }}/{{ currentTask.maxIterations > 0 ? currentTask.maxIterations : '无限' }}</span>
                    <span v-if="currentTask.summary" class="task-board-inline-summary">{{ currentTask.summary }}</span>
                    <span v-if="currentTask.steps.length">步骤 {{ currentTask.steps.length }}</span>
                  </div>
                </summary>
                <div v-if="currentTask.summary" class="task-board-summary-text">{{ currentTask.summary }}</div>
                <div v-if="currentTask.steps.length" class="task-step-list">
                  <div v-for="step in currentTask.steps" :key="step.id" class="task-step-item" :class="`is-${step.status}`">
                    <span class="task-step-title">{{ step.title }}</span>
                    <span class="task-step-note" v-if="step.note">{{ step.note }}</span>
                  </div>
                </div>
              </details>

              <div v-if="!currentSession" class="panel-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>这里现在可以直接聊天，不必再依赖 Live2D 浮窗。你可以先从下方输入，系统会自动创建新对话。</p>
                <div class="starter-prompt-list">
                  <button class="starter-prompt" @click="applyStarterPrompt('先帮我列出当前账号类型，并说明每种类型的导入字段要求。')">查看导入结构</button>
                  <button class="starter-prompt" @click="applyStarterPrompt('帮我检查哪些账号目前还在库存里，并告诉我适合导出的下一步。')">检查可导出账号</button>
                  <button class="starter-prompt" @click="applyStarterPrompt('打开设置页，并说明 Windows MCP 当前是否已启用。')">检查控制能力</button>
                </div>
              </div>

              <template v-else>
                <div class="chat-detail-header">
                  <h3>{{ currentSession.title }}</h3>
                  <span>{{ formatTime(currentSession.createdAt) }}</span>
                </div>

                <div v-if="currentSession.summary" class="session-summary">
                  <strong>会话摘要</strong>
                  <p>{{ currentSession.summary }}</p>
                </div>

                <div class="chat-detail-messages">
                  <div
                    v-for="msg in currentSession.messages"
                    :key="msg.id"
                    class="detail-msg"
                    :class="`is-${msg.role}`"
                  >
                    <div class="msg-role-badge" :class="`is-${msg.role}`">
                      {{ roleLabel(msg.role) }}
                    </div>
                    <div class="msg-text">
                      <div v-html="renderMarkdown(msg.content)"></div>
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
                      <div v-if="msg.toolCalls?.length" class="msg-tool-list">
                        <div v-for="tc in msg.toolCalls" :key="tc.id" class="tool-item">
                          <span class="tool-name">{{ tc.name }}</span>
                          <code class="tool-args">{{ tc.arguments }}</code>
                          <div v-if="tc.result" class="tool-result">{{ tc.result }}</div>
                        </div>
                      </div>
                    </div>
                    <span class="msg-time">{{ formatDetailTime(msg.timestamp) }}</span>
                  </div>
                </div>
              </template>

              <div v-if="aiStore.streaming" class="detail-msg is-assistant is-streaming">
                <div class="msg-role-badge is-assistant">AI</div>
                <div class="msg-text">
                  <div v-html="renderMarkdown(streamingContent)"></div>
                  <details v-if="streamingReasoningContent" class="msg-reasoning is-live" open>
                    <summary>模型思考过程</summary>
                    <div v-html="renderMarkdown(streamingReasoningContent)"></div>
                  </details>
                  <div class="streaming-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-composer">
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
              <div class="chat-input-row">
                <button class="icon-btn composer-attach-btn" :disabled="aiStore.streaming" title="选择文件或图片" @click="openAttachmentPicker">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </button>
                <textarea
                  ref="inputRef"
                  v-model="inputText"
                  class="chat-input"
                  :placeholder="aiStore.streaming ? 'AI 正在回复中...' : '输入消息或直接附加图片，Enter 发送，Shift+Enter 换行'"
                  rows="1"
                  @keydown="handleKeydown"
                  @paste="handleComposerPaste"
                  @input="autoResize"
                />
                <button class="send-btn" :class="{ 'is-stop': aiStore.streaming }" :disabled="sendButtonDisabled" :title="aiStore.streaming ? '停止当前任务' : '发送消息'" @click="handlePrimaryAction">
                  <svg v-if="aiStore.streaming" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <details class="composer-control-fold">
                <summary class="composer-control-summary">
                  <span class="composer-summary-item">模型 {{ currentModelLabel }}</span>
                  <span class="composer-summary-item">附件 {{ pendingAttachments.length }}</span>
                  <span class="composer-summary-item">步数 {{ aiStore.preferences.maxAutoSteps > 0 ? aiStore.preferences.maxAutoSteps : '无限' }}</span>
                </summary>
                <div class="composer-control-content">
                  <div class="composer-model-row">
                    <span class="control-label">当前模型</span>
                    <select class="control-select" :value="aiConfig.model" @change="handleModelChange(($event.target as HTMLSelectElement).value)">
                      <option v-if="!aiConfig.model" value="">请先选择模型</option>
                      <option v-for="model in availableAiModels" :key="model.id" :value="model.name">
                        {{ model.label }}
                      </option>
                    </select>
                    <button class="btn btn-secondary btn-sm" :disabled="loadingAiModels || !canRefreshModels" @click="refreshModelOptions">
                      {{ loadingAiModels ? '刷新中...' : '刷新模型' }}
                    </button>
                  </div>
                  <div class="composer-action-row">
                    <div class="runtime-stepper">
                      <button class="stepper-btn" @click="adjustMaxAutoSteps(-1)">-</button>
                      <span>步数 {{ aiStore.preferences.maxAutoSteps > 0 ? aiStore.preferences.maxAutoSteps : '无限' }}</span>
                      <button class="stepper-btn" @click="adjustMaxAutoSteps(1)">+</button>
                    </div>
                    <button class="runtime-chip" title="按当前模型应用推荐的自动步数，用于限制单次长任务连续调用工具的轮数" @click="applyRecommendedAutoSteps">
                      推荐 {{ recommendedAutoSteps }}
                    </button>
                  </div>
                </div>
              </details>
              <div class="composer-inline-hint">支持任意文件、截图粘贴与工具生成的桌面截图，可直接附在当前会话里。</div>
            </div>
          </template>
        </div>

        <!-- 长期记忆管理 -->
        <div v-if="activeTab === 'memory'" class="memory-panel glass-panel">
          <div class="memory-header">
            <h3>长期记忆 ({{ aiStore.memories.length }})</h3>
            <div class="memory-actions">
              <button class="btn btn-primary btn-sm" @click="showAddMemory = true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                添加记忆
              </button>
              <button v-if="aiStore.memories.length > 0" class="btn btn-secondary btn-sm" @click="clearMemories">清空全部</button>
            </div>
          </div>

          <div class="memory-description">
            <p>长期记忆帮助 AI 助手记住你的偏好、重要信息和上下文。这些记忆会自动注入每次对话的系统提示中。</p>
          </div>

          <!-- 添加记忆表单 -->
          <div v-if="showAddMemory" class="memory-form">
            <textarea v-model="newMemoryContent" placeholder="输入要记住的信息..." rows="2" class="memory-input" />
            <div class="form-row">
              <select v-model="newMemoryCategory" class="memory-select">
                <option value="preference">偏好设置</option>
                <option value="fact">重要事实</option>
                <option value="context">上下文信息</option>
                <option value="instruction">操作指令</option>
              </select>
              <button class="btn btn-primary btn-sm" @click="addMemory" :disabled="!newMemoryContent.trim()">保存</button>
              <button class="btn btn-secondary btn-sm" @click="showAddMemory = false">取消</button>
            </div>
          </div>

          <div v-if="aiStore.memories.length === 0 && !showAddMemory" class="panel-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <p>暂无长期记忆。AI 会在对话中自动记录重要信息，你也可以手动添加。</p>
          </div>

          <div class="memory-list">
            <div v-for="memory in aiStore.memories" :key="memory.id" class="memory-item">
              <div class="memory-content">
                <span class="memory-category" :class="`is-${memory.category}`">{{ categoryLabel(memory.category) }}</span>
                <p v-if="editingMemoryId !== memory.id">{{ memory.content }}</p>
                <textarea
                  v-else
                  v-model="editingMemoryContent"
                  class="memory-input"
                  rows="2"
                  @keydown.enter.prevent="saveMemoryEdit(memory.id)"
                />
              </div>
              <div class="memory-meta">
                <span>{{ memory.source === 'ai' ? 'AI记录' : '手动添加' }}</span>
                <span>{{ formatTime(memory.updatedAt) }}</span>
              </div>
              <div class="memory-item-actions">
                <button v-if="editingMemoryId !== memory.id" class="icon-btn" title="编辑" @click="startEditMemory(memory)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button v-if="editingMemoryId === memory.id" class="icon-btn" title="保存" @click="saveMemoryEdit(memory.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button class="icon-btn" title="删除" @click="deleteMemory(memory.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AttachmentPreviewDialog :attachment="previewAttachment" @close="previewAttachment = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AIMemoryEntry, AIChatAttachment, AIChatMessage, AIProviderModel } from '@/types'
import AttachmentPreviewDialog from '@/components/AttachmentPreviewDialog.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { cancelConversationRun, createAttachmentsFromFiles, startConversationTurn } from '@/utils/aiConversation'
import { fetchAvailableModels, getModelCapabilityLabels, getModelLimitLabels, getRecommendedAutoSteps, inferModelCapabilities, inferModelLimits } from '@/utils/ai'
import { playTextToSpeech, stopTTSPlayback } from '@/utils/ttsPlayback'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

const router = useRouter()
const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const activeTab = ref<'chat' | 'memory'>('chat')
const showAddMemory = ref(false)
const newMemoryContent = ref('')
const newMemoryCategory = ref<AIMemoryEntry['category']>('fact')
const editingMemoryId = ref<string | null>(null)
const editingMemoryContent = ref('')
const inputText = ref('')
const pendingAttachments = ref<AIChatAttachment[]>([])
const previewAttachment = ref<AIChatAttachment | null>(null)
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const filePickerAccept = ref('')
const availableAiModels = ref<AIProviderModel[]>([])
const loadingAiModels = ref(false)
const modelLoadError = ref('')
const playingMessageId = ref('')

const aiConfig = computed(() => aiStore.config)
const currentSession = computed(() => aiStore.activeSession)
const currentTask = computed(() => aiStore.activeTask)
const streamingContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.content : ''))
const streamingReasoningContent = computed(() => (aiStore.runtime.sessionId === currentSession.value?.id ? aiStore.runtime.reasoningContent : ''))
const currentContextMetrics = computed(() => {
  if (currentSession.value) {
    if (aiStore.runtime.sessionId === currentSession.value.id && aiStore.runtime.context) {
      return aiStore.runtime.context
    }

    return aiStore.getContextMetrics(currentSession.value.id)
  }

  return aiStore.runtime.context
})
const canRefreshModels = computed(() => Boolean(aiConfig.value.baseUrl.trim()) && (aiStore.isConfigured || aiConfig.value.protocol === 'ollama-local' || aiConfig.value.protocol === 'custom'))
const currentModelMeta = computed(() => {
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
    capabilities: inferModelCapabilities(aiConfig.value.model, aiConfig.value.protocol),
    limits: inferModelLimits(aiConfig.value.model, aiConfig.value.protocol)
  } satisfies AIProviderModel
})
const currentModelBadges = computed(() => {
  return [
    ...getModelCapabilityLabels(currentModelMeta.value?.capabilities),
    ...getModelLimitLabels(currentModelMeta.value?.limits)
  ]
})
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

const roleLabelMap: Record<string, string> = {
  system: '系统',
  user: '用户',
  assistant: 'AI',
  tool: '工具'
}

const categoryLabelMap: Record<string, string> = {
  preference: '偏好',
  fact: '事实',
  context: '上下文',
  instruction: '指令'
}

function roleLabel(role: string) {
  return roleLabelMap[role] || role
}

function categoryLabel(category: string) {
  return categoryLabelMap[category] || category
}

function taskStatusLabel(status: string) {
  if (status === 'planning') return '规划中'
  if (status === 'running') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '已阻塞'
  return status
}

function formatTime(ts: number) {
  return dayjs(ts).format('MM/DD HH:mm')
}

function formatDetailTime(ts: number) {
  return dayjs(ts).format('HH:mm:ss')
}

function renderMarkdown(content: string): string {
  if (!content) return '<span class="text-muted">（空）</span>'
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (messagesRef.value) {
          messagesRef.value.scrollTop = messagesRef.value.scrollHeight
        }
      })
    })
  })
}

function autoResize() {
  const el = inputRef.value
  if (!el) {
    return
  }

  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
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

function applyStarterPrompt(prompt: string) {
  inputText.value = prompt
  nextTick(() => {
    autoResize()
    inputRef.value?.focus()
  })
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

function mergePendingAttachments(nextAttachments: AIChatAttachment[]) {
  pendingAttachments.value = [...pendingAttachments.value, ...nextAttachments].slice(0, 8)
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
  const nextAttachments = await createAttachmentsFromFiles(files)
  mergePendingAttachments(nextAttachments)
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
  return value.toLocaleString()
}

function formatAttachmentMeta(attachment: AIChatAttachment) {
  const sizeLabel = attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '未知大小'
  return `${attachment.mimeType || '文件'} · ${sizeLabel}`
}

function canPlayAssistantReply(message: AIChatMessage) {
  return settingsStore.settings.ttsEnabled
    && settingsStore.settings.ttsShowMainReplyButton
    && message.role === 'assistant'
    && !!message.content.trim()
}

async function playAssistantMessage(message: AIChatMessage) {
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

function startNewSession() {
  if (aiStore.streaming) {
    return
  }

  aiStore.createSession()
  scrollToBottom()
}

function handleSessionSelect(sessionId: string) {
  if (aiStore.streaming) {
    return
  }

  aiStore.switchSession(sessionId)
}

function openSettingsPage() {
  void router.push('/ai-settings')
}

async function sendMessage() {
  const text = inputText.value.trim()
  if ((!text && pendingAttachments.value.length === 0) || aiStore.streaming || !aiStore.isConfigured) {
    return
  }

  if (!aiStore.activeSession) {
    aiStore.createSession()
  }

  const sessionId = aiStore.activeSessionId
  const attachments = [...pendingAttachments.value]
  inputText.value = ''
  pendingAttachments.value = []
  autoResize()

  await startConversationTurn(
    sessionId,
    text,
    attachments,
    {
      onStream() {
        scrollToBottom()
      },
      onAfterUpdate: scrollToBottom
    }
  )
}

async function deleteSession(id: string) {
  if (aiStore.streaming) {
    return
  }

  await aiStore.deleteSession(id)
}

async function clearAllSessions() {
  if (aiStore.streaming) {
    return
  }

  if (confirm('确定要清空所有对话记录吗？此操作不可恢复。')) {
    await aiStore.clearAllSessions()
  }
}

function addMemory() {
  const content = newMemoryContent.value.trim()
  if (!content) return
  aiStore.addMemory(content, newMemoryCategory.value, 'manual')
  newMemoryContent.value = ''
  showAddMemory.value = false
}

function startEditMemory(memory: AIMemoryEntry) {
  editingMemoryId.value = memory.id
  editingMemoryContent.value = memory.content
}

function saveMemoryEdit(id: string) {
  if (editingMemoryContent.value.trim()) {
    aiStore.updateMemory(id, editingMemoryContent.value.trim())
  }
  editingMemoryId.value = null
  editingMemoryContent.value = ''
}

async function deleteMemory(id: string) {
  await aiStore.deleteMemory(id)
}

async function clearMemories() {
  if (confirm('确定要清空所有长期记忆吗？AI 将忘记之前记住的所有信息。')) {
    await aiStore.clearAllMemories()
  }
}

onMounted(() => {
  if (!aiStore.loaded) {
    void aiStore.init()
  }

  if (aiStore.runtime.running && aiStore.runtime.sessionId) {
    aiStore.switchSession(aiStore.runtime.sessionId)
  } else if (aiStore.sortedSessions[0] && !aiStore.activeSessionId) {
    aiStore.switchSession(aiStore.sortedSessions[0].id)
  }

  nextTick(() => {
    inputRef.value?.focus()
    scrollToBottom()
  })

  void refreshModelOptions()
})

watch(() => [aiConfig.value.protocol, aiConfig.value.baseUrl, aiConfig.value.apiKey], () => {
  void refreshModelOptions()
})

watch(
  () => [activeTab.value, aiStore.activeSessionId, currentSession.value?.messages.at(-1)?.id ?? '', aiStore.runtime.updatedAt],
  () => {
    if (activeTab.value === 'chat') {
      scrollToBottom()
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  stopTTSPlayback()
  // 主页面卸载时不再中止 AI 任务，允许它在后台持续执行。
})
</script>

<style lang="scss" scoped>
.ai-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  padding: $spacing-lg;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.ai-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  flex-wrap: wrap;
}

.ai-layout {
  display: grid;
  grid-template-columns: minmax(188px, 216px) minmax(0, 1fr);
  gap: $spacing-md;
  flex: 1;
  min-height: 0;
  min-height: 500px;
}

.ai-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-md;
  border-bottom: 1px solid var(--glass-border);

  h3 {
    font-size: $font-sm;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-sm;
}

.empty-hint {
  padding: $spacing-lg;
  text-align: center;
  font-size: $font-xs;
  color: var(--text-muted);
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: $border-radius-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: var(--primary-bg);
  }

  &.active {
    background: var(--primary-bg);
    border-left: 3px solid var(--primary);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.session-title {
  font-size: $font-xs;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.delete-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;

  .session-item:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(220, 80, 80, 0.1);
    color: #d44;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.sidebar-footer {
  padding: $spacing-sm;
  border-top: 1px solid var(--glass-border);
}

.ai-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.session-summary {
  display: grid;
  gap: 8px;
  margin: 0 $spacing-md $spacing-md;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.48);

  strong {
    color: var(--text-primary);
    font-size: $font-xs;
  }

  p {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.7;
    white-space: pre-line;
  }
}

.tab-bar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--glass-border);
  border-radius: $border-radius-sm;
  background: transparent;
  color: var(--text-secondary);
  font-size: $font-xs;
  font-weight: 500;
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  &:hover:not(.active) {
    background: var(--primary-bg);
  }

  .tab-badge {
    padding: 0 6px;
    border-radius: 10px;
    background: var(--primary);
    color: white;
    font-size: 10px;
    line-height: 18px;
  }
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.memory-panel {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.chat-panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 10px;
  min-height: 0;
}

.chat-control-strip {
  display: grid;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(255, 200, 220, 0.16);
  background: rgba(255, 255, 255, 0.28);
}

.chat-control-main {
  display: grid;
  gap: 8px;
}

.model-switcher {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.control-label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.control-select {
  min-width: 0;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.control-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.control-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.08);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.control-error {
  font-size: 11px;
  line-height: 1.7;
}

.control-error {
  color: #b42318;
}

.chat-runtime-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.chat-status-strip {
  display: grid;
  gap: 6px;
}

.runtime-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all $transition-fast;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  &.active {
    border-color: var(--primary);
    background: rgba(255, 170, 200, 0.16);
    color: var(--primary);
  }

  &.is-danger {
    border-color: rgba(220, 80, 80, 0.2);
    background: rgba(220, 80, 80, 0.08);
    color: #b42318;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.context-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;

  span {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(93, 135, 255, 0.08);
    color: #2d4f99;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.5;
  }
}

.runtime-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.stepper-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 170, 200, 0.12);
  color: var(--primary);
  cursor: pointer;
}

.task-board {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  padding: 0;
  border-radius: $border-radius-md;
  border: 1px solid rgba(255, 170, 200, 0.18);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 170, 200, 0.08));
  overflow: hidden;
}

.task-board-summary {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
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

.task-board[open] > .task-board-summary::after {
  content: '收起详情';
}

.task-board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }
}

.task-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;

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

.task-board-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.task-board-inline-summary {
  flex: 1 1 220px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-board-summary-text {
  padding: 0 12px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.task-step-list {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}

.task-step-item {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.7);

  &.is-in_progress {
    border-color: rgba(255, 180, 60, 0.32);
  }

  &.is-completed {
    border-color: rgba(84, 201, 159, 0.32);
  }

  &.is-blocked {
    border-color: rgba(220, 80, 80, 0.24);
  }
}

.task-step-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.task-step-note {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.chat-unconfigured {
  flex: 1;
  justify-content: center;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;

  p {
    font-size: $font-xs;
    color: var(--text-muted);
    line-height: 1.6;
  }
}

.chat-detail-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-md;
  border-bottom: 1px solid var(--glass-border);

  h3 {
    font-size: $font-md;
    font-weight: 600;
    color: var(--text-primary);
  }

  span {
    font-size: $font-xs;
    color: var(--text-muted);
  }
}

.chat-detail-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.starter-prompt-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 560px;
}

.starter-prompt {
  padding: 10px 14px;
  border: 1px solid rgba(255, 200, 220, 0.32);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-primary);
  font-size: $font-xs;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    border-color: var(--primary);
    color: var(--primary);
    transform: translateY(-1px);
  }
}

.detail-msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.4);

  &.is-user {
    background: rgba(255, 200, 220, 0.08);
  }

  &.is-tool {
    background: rgba(140, 120, 255, 0.05);
  }

  &.is-streaming {
    border: 1px dashed rgba(120, 180, 255, 0.3);
  }
}

.msg-role-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;

  &.is-user {
    background: rgba(255, 170, 200, 0.2);
    color: #a04060;
  }
  &.is-assistant {
    background: rgba(120, 180, 255, 0.15);
    color: #3468b0;
  }
  &.is-system {
    background: rgba(180, 180, 180, 0.15);
    color: #666;
  }
  &.is-tool {
    background: rgba(140, 120, 255, 0.15);
    color: #5540a0;
  }
}

.msg-text {
  flex: 1;
  min-width: 0;
  font-size: $font-xs;
  line-height: 1.65;
  color: var(--text-primary);
  word-break: break-word;
  overflow-wrap: anywhere;

  :deep(code) {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.06);
    font-size: 11px;
  }
}

.msg-inline-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.voice-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(93, 135, 255, 0.18);
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.08);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform $transition-fast, background $transition-fast;

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
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(93, 135, 255, 0.06);
  border: 1px solid rgba(93, 135, 255, 0.12);

  summary {
    cursor: pointer;
    color: #2d4f99;
    font-size: 11px;
    font-weight: 700;
    user-select: none;
  }

  > div {
    margin-top: 8px;
    color: var(--text-secondary);
    line-height: 1.7;
    font-size: 11px;
  }

  &.is-live {
    background: rgba(255, 174, 113, 0.08);
    border-color: rgba(255, 174, 113, 0.16);

    summary {
      color: #9a6414;
    }
  }
}

.msg-attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.msg-attachment-card {
  display: grid;
  gap: 6px;
  width: 128px;
  padding: 8px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-primary);
  font-size: 11px;
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
  height: 88px;
  object-fit: cover;
  border-radius: 10px;
}

.msg-file-badge,
.pending-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(93, 135, 255, 0.14), rgba(255, 174, 113, 0.14));
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
}

.msg-file-badge {
  width: 100%;
  height: 88px;
}

.msg-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
}

.msg-tool-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-item {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(140, 120, 255, 0.06);
  font-size: 11px;
}

.tool-name {
  font-weight: 600;
  color: #5540a0;
}

.tool-args {
  display: block;
  margin-top: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  font-size: 10px;
  word-break: break-all;
  line-height: 1.4;
}

.tool-result {
  margin-top: 4px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-composer {
  display: grid;
  gap: 6px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.46);
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
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.pending-attachment-image {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
}

.pending-file-badge {
  width: 48px;
  height: 48px;
}

.pending-attachment-copy {
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: 12px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}

.chat-input-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: flex-end;
}

.composer-attach-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--text-secondary);
  align-self: stretch;
}

.composer-control-fold {
  border: 1px solid rgba(255, 200, 220, 0.2);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.64);
  overflow: hidden;
}

.composer-control-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 9px 12px;
  cursor: pointer;
  list-style: none;
  user-select: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: '展开控制';
    margin-left: auto;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
  }
}

.composer-control-fold[open] > .composer-control-summary::after {
  content: '收起控制';
}

.composer-summary-item {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
}

.composer-control-content {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
}

.composer-model-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.composer-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chat-input {
  width: 100%;
  min-height: 42px;
  max-height: 140px;
  padding: 10px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  font-size: $font-xs;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  outline: none;
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus {
    border-color: rgba(120, 180, 255, 0.4);
    box-shadow: 0 0 0 3px rgba(120, 180, 255, 0.1);
  }
}

.composer-inline-hint {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.send-btn {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #ff9bb7, #78b4ff);
  color: white;
  cursor: pointer;
  transition: transform $transition-fast, box-shadow $transition-fast, opacity $transition-fast;
  box-shadow: 0 12px 28px rgba(120, 180, 255, 0.22);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  &.is-stop {
    background: linear-gradient(135deg, #ff8f6b, #d34b5a);
    box-shadow: 0 12px 28px rgba(211, 75, 90, 0.22);
  }
}

.streaming-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(120, 180, 255, 0.8);
    animation: aiPulse 1s infinite ease-in-out;
  }

  span:nth-child(2) {
    animation-delay: 0.15s;
  }

  span:nth-child(3) {
    animation-delay: 0.3s;
  }
}

/* 记忆管理 */
.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-md;

  h3 {
    font-size: $font-md;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.memory-actions {
  display: flex;
  gap: 8px;
}

.memory-description {
  margin-bottom: $spacing-md;

  p {
    font-size: $font-xs;
    color: var(--text-secondary);
    line-height: 1.6;
  }
}

.memory-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin-bottom: $spacing-md;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid var(--glass-border);
}

.memory-input {
  width: 100%;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: $font-xs;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-primary);
  outline: none;

  &:focus {
    border-color: var(--primary);
  }
}

.memory-select {
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: $font-xs;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-primary);
  outline: none;
}

.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.memory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 200, 220, 0.12);
  transition: border-color $transition-fast;

  &:hover {
    border-color: var(--primary);

    .memory-item-actions {
      opacity: 1;
    }
  }
}

.memory-content {
  display: flex;
  flex-direction: column;
  gap: 4px;

  p {
    font-size: $font-xs;
    color: var(--text-primary);
    line-height: 1.5;
  }
}

.memory-category {
  display: inline-block;
  width: fit-content;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;

  &.is-preference {
    background: rgba(255, 180, 60, 0.12);
    color: #b47c20;
  }
  &.is-fact {
    background: rgba(80, 160, 255, 0.12);
    color: #2060b0;
  }
  &.is-context {
    background: rgba(100, 200, 150, 0.12);
    color: #208060;
  }
  &.is-instruction {
    background: rgba(160, 100, 240, 0.12);
    color: #6030b0;
  }
}

.memory-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
}

.memory-item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 200, 220, 0.2);
    color: var(--primary);
  }
}

@keyframes aiPulse {
  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.45;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 960px) {
  .ai-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .ai-sidebar {
    min-height: 260px;
  }

  .ai-main {
    min-height: 680px;
  }

  .ai-page-head {
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .ai-page {
    padding: $spacing-md;
  }

  .ai-page-head {
    flex-direction: column;
    align-items: stretch;
  }

  .model-switcher,
  .composer-model-row {
    grid-template-columns: 1fr auto;
  }

  .control-label {
    grid-column: 1 / -1;
  }

  .chat-control-strip {
    padding-left: 12px;
    padding-right: 12px;
  }

  .task-board-summary {
    padding-left: 10px;
    padding-right: 10px;
  }

  .chat-panel-scroll,
  .task-board-summary-text,
  .task-step-list,
  .chat-composer {
    padding-left: 10px;
    padding-right: 10px;
  }

  .chat-input-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .composer-control-summary {
    align-items: flex-start;
  }

  .send-btn {
    width: 42px;
  }
}
</style>
