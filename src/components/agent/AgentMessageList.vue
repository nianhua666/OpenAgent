<template>
  <section ref="scrollRef" class="agent-message-list glass-panel">
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
          <h3>{{ session.title }}</h3>
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

      <div class="message-stream">
        <article v-for="message in session.messages" :key="message.id" class="message-card" :class="`is-${message.role}`">
          <div class="message-role">{{ roleLabel(message.role) }}</div>
          <div class="message-body">
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
            <div v-if="message.attachments?.length" class="attachment-grid">
              <div v-for="attachment in message.attachments" :key="attachment.id" class="attachment-card">
                <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="attachment-image" />
                <div v-else class="file-chip">文件</div>
                <strong>{{ attachment.name }}</strong>
              </div>
            </div>
            <div v-if="message.toolCalls?.length" class="tool-list">
              <div v-for="toolCall in message.toolCalls" :key="toolCall.id" class="tool-item">
                <span class="tool-name">{{ toolCall.name }}</span>
                <code class="tool-args">{{ toolCall.arguments }}</code>
                <div v-if="toolCall.result" class="tool-result">{{ toolCall.result }}</div>
              </div>
            </div>
          </div>
          <span class="message-time">{{ formatDetailTime(message.timestamp) }}</span>
        </article>

        <article v-if="streaming" class="message-card is-assistant is-streaming">
          <div class="message-role">AI</div>
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
import type { AIChatMessage, AIChatSession } from '@/types'

const props = defineProps<{
  session: AIChatSession | null
  streaming: boolean
  streamingContent: string
  streamingReasoningContent: string
  playingMessageId: string
  starterPrompts: string[]
  showVoiceActions: boolean
}>()

defineEmits<{
  (e: 'apply-prompt', prompt: string): void
  (e: 'play-message', message: AIChatMessage): void
}>()

const scrollRef = ref<HTMLElement | null>(null)

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
    assistant: 'AI',
    tool: '工具',
  }
  return labels[role]
}

function canPlayAssistantReply(message: AIChatMessage) {
  return props.showVoiceActions && message.role === 'assistant' && !!message.content.trim()
}

function renderMarkdown(content: string) {
  if (!content) {
    return '<span class="muted">（空）</span>'
  }

  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}
</script>

<style scoped>
.agent-message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 18px;
}

.empty-state,
.message-head,
.message-stream,
.message-card,
.attachment-grid,
.tool-list {
  display: grid;
  gap: 14px;
}

.empty-state {
  align-content: center;
  justify-items: start;
  min-height: 320px;
}

.empty-eyebrow,
.message-eyebrow {
  color: var(--text-muted);
  font-size: 12px;
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
.tool-result {
  color: var(--text-secondary);
  line-height: 1.7;
}

.starter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.starter-btn,
.voice-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 10px 14px;
}

.message-head {
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto;
}

.message-meta {
  align-items: center;
  display: flex;
  gap: 10px;
}

.scope-badge {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 6px 10px;
}

.scope-badge.is-live2d {
  background: rgba(65, 196, 255, 0.14);
  color: #85d7ff;
}

.scope-badge.is-main {
  background: rgba(255, 166, 43, 0.14);
  color: #ffd08a;
}

.session-summary,
.message-card,
.tool-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  padding: 14px;
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
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
  min-width: 52px;
  padding: 8px 10px;
}

.message-body {
  display: grid;
  gap: 12px;
}

.message-content :deep(code),
.tool-args {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 2px 6px;
}

.message-time {
  color: var(--text-muted);
  font-size: 12px;
}

.message-reasoning {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  padding: 10px 12px;
}

.attachment-grid {
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}

.attachment-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: grid;
  gap: 8px;
  padding: 10px;
}

.attachment-image {
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  object-fit: cover;
  width: 100%;
}

.file-chip {
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
  min-height: 84px;
}

.tool-name {
  color: #ffd08a;
  font-size: 12px;
  font-weight: 700;
}

.tool-list {
  gap: 10px;
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
}
</style>
