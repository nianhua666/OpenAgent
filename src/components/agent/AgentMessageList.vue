<template>
  <section ref="scrollRef" class="agent-message-list glass-panel" @click="handleRichTextClick">
    <div v-if="!session" class="empty-state">
      <p class="empty-eyebrow">Ready</p>
      <h3>当前角色等待任务</h3>
      <p class="empty-copy">你可以让它先梳理需求、记录长期记忆、调用工具、直接控制软件或创建执行计划；Agent 模式不会继续派生子代理。</p>
      <div class="starter-list">
        <button v-for="prompt in starterPrompts" :key="prompt" class="starter-btn" @click="$emit('apply-prompt', prompt)">
          {{ prompt }}
        </button>
      </div>
    </div>

    <template v-else>
      <div class="message-head">
        <div>
          <p class="message-eyebrow">Session</p>
          <h3>{{ displaySessionTitle(session) }}</h3>
        </div>
        <div class="message-meta">
          <span class="scope-badge" :class="`is-${session.scope}`">{{ session.scope === 'live2d' ? 'Live2D' : '主窗口' }}</span>
          <span>{{ formatTime(session.createdAt) }}</span>
        </div>
      </div>

      <div v-if="session.summary" class="session-summary">
        <strong>会话摘要</strong>
        <p>{{ session.summary }}</p>
      </div>

      <div v-if="session.messages.length === 0 && !streaming" class="session-empty">
        <div class="session-empty-copy">
          <p class="empty-eyebrow">Session Ready</p>
          <h3>当前会话已就绪</h3>
          <p class="empty-copy">当前会话还没有消息。你可以直接给出需求、补充约束、让 Agent 先拆解任务，或者让它先梳理当前角色的记忆与能力边界。</p>
        </div>
        <div class="session-empty-meta">
          <span class="empty-fact">{{ displaySessionTitle(session) }}</span>
          <span class="empty-fact">{{ session.scope === 'live2d' ? 'Live2D' : '主窗口' }}</span>
          <span class="empty-fact">0 条消息</span>
        </div>
        <div class="starter-list">
          <button v-for="prompt in starterPrompts" :key="prompt" class="starter-btn" @click="$emit('apply-prompt', prompt)">
            {{ prompt }}
          </button>
        </div>
      </div>

      <div v-else class="message-stream">
        <article v-for="message in session.messages" :key="message.id" class="message-card" :class="`is-${message.role}`">
          <div class="message-role">{{ roleLabel(message.role) }}</div>
          <div class="message-body">
            <template v-if="isActivityMessage(message)">
              <div class="activity-card" :class="`is-${getActivityDisplay(message)?.tone || 'info'}`">
                <div class="activity-head">
                  <div class="activity-copy">
                    <p class="activity-title">{{ getActivityDisplay(message)?.title }}</p>
                    <p class="activity-summary">{{ getActivityDisplay(message)?.summary }}</p>
                  </div>
                  <div class="activity-badges">
                    <span v-for="badge in getActivityDisplay(message)?.badges || []" :key="`${message.id}-${badge}`" class="activity-badge">
                      {{ badge }}
                    </span>
                  </div>
                </div>
                <details v-if="getActivityDisplay(message)?.details" class="activity-details">
                  <summary>查看详情</summary>
                  <pre class="activity-pre">{{ getActivityDisplay(message)?.details }}</pre>
                </details>
              </div>
            </template>
            <template v-else>
              <div class="message-content" v-html="renderMarkdown(message.content)"></div>
              <button
                v-if="canPlayAssistantReply(message)"
                class="voice-btn"
                :class="{ active: playingMessageId === message.id }"
                @click="$emit('play-message', message)"
              >
                {{ playingMessageId === message.id ? '播放中' : '播放语音' }}
              </button>
              <details v-if="message.reasoningContent" class="message-reasoning">
                <summary>模型思考过程</summary>
                <div v-html="renderMarkdown(message.reasoningContent)"></div>
              </details>
            </template>

            <div v-if="message.attachments?.length" class="attachment-grid">
              <div v-for="attachment in message.attachments" :key="attachment.id" class="attachment-card">
                <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="attachment-image" />
                <div v-else class="file-chip">文件</div>
                <strong>{{ attachment.name }}</strong>
              </div>
            </div>

            <div v-if="message.toolCalls?.length" class="tool-list">
              <div v-for="toolCall in message.toolCalls" :key="toolCall.id" class="tool-item">
                <div class="tool-item-head">
                  <span class="tool-name">{{ toolCall.name }}</span>
                  <div class="activity-badges">
                    <span v-for="badge in getToolDisplay(toolCall).badges" :key="`${toolCall.id}-${badge}`" class="activity-badge">
                      {{ badge }}
                    </span>
                  </div>
                </div>
                <p class="tool-summary">{{ getToolDisplay(toolCall).summary }}</p>
                <details v-if="toolCall.arguments || getToolDisplay(toolCall).details" class="tool-details">
                  <summary>查看工具详情</summary>
                  <div v-if="toolCall.arguments" class="tool-detail-block">
                    <span class="tool-detail-label">参数</span>
                    <code class="tool-args">{{ toolCall.arguments }}</code>
                  </div>
                  <div v-if="getToolDisplay(toolCall).details" class="tool-detail-block">
                    <span class="tool-detail-label">结果</span>
                    <pre class="activity-pre">{{ getToolDisplay(toolCall).details }}</pre>
                  </div>
                </details>
              </div>
            </div>
          </div>
          <span class="message-time">{{ formatDetailTime(message.timestamp) }}</span>
        </article>

        <article v-if="streaming" class="message-card is-assistant is-streaming">
          <div class="message-role">{{ assistantLabel }}</div>
          <div class="message-body">
            <div class="message-content" v-html="renderMarkdown(streamingContent)"></div>
            <details v-if="streamingReasoningContent" class="message-reasoning" open>
              <summary>模型思考过程</summary>
              <div v-html="renderMarkdown(streamingReasoningContent)"></div>
            </details>
            <div class="streaming-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import dayjs from 'dayjs'
import type { AIActivityDisplay } from '@/utils/aiMessagePresentation'
import type { AIChatMessage, AIChatSession, AIToolCall } from '@/types'
import { handleRichTextActivation, renderRichText as renderRichTextContent } from '@/utils/aiRichText'
import { getActivityMessageDisplay, getToolCallDisplay } from '@/utils/aiMessagePresentation'
import { useAIStore } from '@/stores/ai'

const props = defineProps<{
  session: AIChatSession | null
  streaming: boolean
  streamingContent: string
  streamingReasoningContent: string
  playingMessageId: string
  starterPrompts: string[]
  showVoiceActions: boolean
  assistantLabel?: string
}>()

defineEmits<{
  (e: 'apply-prompt', prompt: string): void
  (e: 'play-message', message: AIChatMessage): void
}>()

const scrollRef = ref<HTMLElement | null>(null)
const aiStore = useAIStore()

defineExpose({
  scrollToBottom,
})

function scrollToBottom() {
  if (!scrollRef.value) {
    return
  }

  scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

function formatTime(timestamp: number) {
  return dayjs(timestamp).format('MM/DD HH:mm')
}

function formatDetailTime(timestamp: number) {
  return dayjs(timestamp).format('HH:mm:ss')
}

function roleLabel(role: AIChatMessage['role']) {
  const labels: Record<AIChatMessage['role'], string> = {
    system: '系统',
    user: '用户',
    assistant: props.assistantLabel?.trim() || 'Agent',
    tool: '工具',
  }
  return labels[role]
}

function displaySessionTitle(session: AIChatSession) {
  if (
    session.scope === 'live2d'
    && /^live2d(?:\s*对话|\s+\d+)?$/i.test(session.title.trim())
  ) {
    return props.assistantLabel?.trim() || '当前会话'
  }

  return session.title
}

function canPlayAssistantReply(message: AIChatMessage) {
  return props.showVoiceActions && message.role === 'assistant' && !!message.content.trim()
}

function isActivityMessage(message: AIChatMessage) {
  return message.role === 'system' || message.role === 'tool'
}

function getActivityDisplay(message: AIChatMessage): AIActivityDisplay | null {
  return getActivityMessageDisplay(message)
}

function getToolDisplay(toolCall: AIToolCall) {
  return getToolCallDisplay(toolCall)
}

function renderMarkdown(content: string) {
  return renderRichTextContent(content)
}

function handleRichTextClick(event: MouseEvent) {
  void handleRichTextActivation(event, {
    workspaceRoot: aiStore.ideWorkspace?.rootPath || ''
  })
}
</script>

<style scoped>
.agent-message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.empty-state,
.message-head,
.message-stream,
.message-card,
.attachment-grid,
.tool-list {
  display: grid;
  gap: 10px;
}

.empty-state {
  align-content: center;
  justify-items: start;
  min-height: 240px;
}

.session-empty {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 14px;
  min-height: 220px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 14px;
  background:
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.16), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(240, 246, 252, 0.88));
}

.session-empty-copy {
  display: grid;
  gap: 6px;
}

.session-empty-copy h3 {
  font-size: 18px;
}

.session-empty-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-fact {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #334155;
  font-size: 11px;
}

.empty-eyebrow,
.message-eyebrow {
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.14em;
  margin: 0;
  text-transform: uppercase;
}

h3,
p {
  margin: 0;
}

.empty-copy,
.session-summary p,
.tool-summary,
.activity-summary {
  color: #475569;
  line-height: 1.55;
}

.starter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.starter-btn,
.voice-btn {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  color: #334155;
  cursor: pointer;
  font-size: 11px;
  padding: 7px 11px;
}

.message-head {
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
}

.message-meta {
  align-items: center;
  display: flex;
  gap: 8px;
}

.scope-badge {
  background: rgba(226, 232, 240, 0.8);
  border-radius: 999px;
  color: #334155;
  font-size: 11px;
  padding: 4px 8px;
}

.scope-badge.is-live2d {
  background: rgba(186, 230, 253, 0.86);
  color: #0c4a6e;
}

.scope-badge.is-main {
  background: rgba(254, 240, 138, 0.78);
  color: #854d0e;
}

.session-summary,
.message-card {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  padding: 12px;
}

.message-card {
  align-items: start;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.message-card.is-user {
  border-color: rgba(255, 166, 43, 0.2);
}

.message-card.is-assistant,
.message-card.is-streaming {
  border-color: rgba(65, 196, 255, 0.16);
}

.message-role {
  align-items: center;
  background: rgba(226, 232, 240, 0.8);
  border-radius: 999px;
  color: #334155;
  display: inline-flex;
  font-size: 11px;
  justify-content: center;
  min-width: 46px;
  padding: 6px 8px;
}

.message-body {
  display: grid;
  gap: 10px;
}

.activity-card,
.tool-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(248, 250, 252, 0.92);
}

.activity-card.is-success {
  border-color: rgba(34, 197, 94, 0.2);
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.92), rgba(248, 250, 252, 0.96));
}

.activity-card.is-warning {
  border-color: rgba(245, 158, 11, 0.22);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.92), rgba(248, 250, 252, 0.96));
}

.activity-card.is-danger {
  border-color: rgba(239, 68, 68, 0.2);
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.92), rgba(248, 250, 252, 0.96));
}

.activity-head,
.tool-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.activity-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.activity-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.activity-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.activity-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #334155;
  font-size: 10px;
  font-weight: 600;
}

.activity-details,
.tool-details {
  display: grid;
  gap: 8px;
}

.activity-details summary,
.tool-details summary {
  cursor: pointer;
  color: #475569;
  font-size: 11px;
}

.activity-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #334155;
  font-size: 11px;
  line-height: 1.55;
}

.message-content :deep(code),
.tool-args {
  background: rgba(226, 232, 240, 0.78);
  border-radius: 8px;
  color: #0f172a;
  padding: 2px 6px;
}

:deep(.oa-rich-link) {
  color: #8fd0ff;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:deep(.oa-rich-link.is-path) {
  color: #ffd08a;
}

:deep(.oa-rich-muted) {
  color: var(--text-muted);
}

.message-time {
  color: var(--text-muted);
  font-size: 11px;
}

.message-reasoning {
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  padding: 8px 10px;
}

.attachment-grid {
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.attachment-card {
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 12px;
  display: grid;
  gap: 6px;
  padding: 8px;
}

.attachment-image {
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  object-fit: cover;
  width: 100%;
}

.file-chip {
  align-items: center;
  background: rgba(226, 232, 240, 0.84);
  border-radius: 10px;
  color: #334155;
  display: inline-flex;
  font-size: 11px;
  justify-content: center;
  min-height: 72px;
}

.tool-name {
  color: #9a3412;
  font-size: 12px;
  font-weight: 700;
}

.tool-list {
  gap: 8px;
}

.tool-detail-block {
  display: grid;
  gap: 6px;
}

.tool-detail-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}

.streaming-indicator {
  display: flex;
  gap: 6px;
}

.streaming-indicator span {
  animation: blink 1s infinite ease-in-out;
  background: #ffd166;
  border-radius: 999px;
  display: block;
  height: 8px;
  width: 8px;
}

.streaming-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

.muted {
  color: var(--text-muted);
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.2;
    transform: scale(0.85);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 960px) {
  .message-card {
    grid-template-columns: 1fr;
  }

  .message-time {
    justify-self: end;
  }

  .activity-head,
  .tool-item-head {
    flex-direction: column;
  }

  .activity-badges {
    justify-content: flex-start;
  }
}
</style>
