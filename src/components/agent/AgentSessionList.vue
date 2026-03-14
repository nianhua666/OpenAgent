<template>
  <aside class="agent-session-list glass-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Conversations</p>
        <h3>会话调度台</h3>
      </div>
      <button class="action-btn primary" :disabled="streaming || createDisabled" @click="$emit('new-session')">
        新对话
      </button>
    </div>

    <div v-if="sessions.length === 0" class="panel-empty">
      <p>还没有会话。直接发消息，系统会自动创建首个任务会话。</p>
    </div>

    <div v-else class="session-scroll">
      <button
        v-for="session in sessions"
        :key="session.id"
        class="session-card"
        :class="{ active: session.id === selectedSessionId }"
        :disabled="streaming"
        @click="$emit('select-session', session.id)"
      >
        <div class="session-card-head">
          <span class="session-title">{{ resolveSessionTitle(session) }}</span>
          <span class="session-badge" :class="`is-${session.scope}`">{{ session.scope === 'live2d' ? 'Live2D' : '主窗口' }}</span>
        </div>
        <p class="session-agent">{{ resolveAgentName(session) }}</p>
        <p class="session-meta">{{ formatTime(session.updatedAt) }} · {{ session.messages.length }} 条消息</p>
        <p v-if="session.summary" class="session-summary">{{ session.summary }}</p>
        <p v-else class="session-summary muted">{{ fallbackSummary(session) }}</p>
        <div class="session-card-foot">
          <span v-if="session.isPinned" class="pin-tag">置顶</span>
          <button class="delete-btn" :disabled="streaming" @click.stop="$emit('delete-session', session.id)">移除</button>
        </div>
      </button>
    </div>

    <div class="panel-foot" v-if="sessions.length > 0">
      <button class="action-btn secondary" :disabled="streaming" @click="$emit('clear-sessions')">清空当前域</button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { AIChatSession } from '@/types'
import { useAIStore } from '@/stores/ai'

type SessionListItem = AIChatSession & {
  isPinned?: boolean
}

const props = defineProps<{
  sessions: SessionListItem[]
  selectedSessionId: string
  streaming: boolean
  createDisabled?: boolean
}>()

defineEmits<{
  (e: 'new-session'): void
  (e: 'select-session', sessionId: string): void
  (e: 'delete-session', sessionId: string): void
  (e: 'clear-sessions'): void
}>()

const sessions = computed(() => props.sessions)
const aiStore = useAIStore()

function formatTime(timestamp: number) {
  return dayjs(timestamp).format('MM/DD HH:mm')
}

function fallbackSummary(session: AIChatSession) {
  const lastMessage = [...session.messages].reverse().find(message => message.role !== 'system')
  if (!lastMessage?.content.trim()) {
    return '等待新的任务指令'
  }

  return lastMessage.content.trim().slice(0, 72)
}

function resolveAgentName(session: AIChatSession) {
  return aiStore.getSessionAgent(session)?.name || '默认角色'
}

function resolveSessionTitle(session: AIChatSession) {
  if (session.scope === 'live2d' && /^live2d(?:\s*对话|\s+\d+)?$/i.test(session.title.trim())) {
    return resolveAgentName(session)
  }

  return session.title
}
</script>

<style scoped>
.agent-session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 10px;
}

.panel-head,
.panel-foot,
.session-card-head,
.session-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h3 {
  margin: 0;
  font-size: 15px;
}

.session-scroll {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.session-card {
  border: 1px solid color-mix(in srgb, var(--border-color) 64%, rgba(148, 163, 184, 0.24));
  background:
    radial-gradient(circle at top right, rgba(255, 166, 43, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(242, 246, 250, 0.76));
  border-radius: 12px;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.session-card:hover:not(:disabled),
.session-card.active {
  border-color: color-mix(in srgb, var(--primary) 70%, white 10%);
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.14);
  transform: translateY(-1px);
}

.session-card.active {
  background:
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(239, 245, 252, 0.88));
}

.session-title {
  font-size: 13px;
  font-weight: 700;
}

.session-badge,
.pin-tag {
  border-radius: 999px;
  font-size: 10px;
  padding: 3px 7px;
}

.session-badge {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.session-badge.is-live2d {
  background: rgba(65, 196, 255, 0.14);
  color: #85d7ff;
}

.session-badge.is-main {
  background: rgba(255, 166, 43, 0.14);
  color: #ffd08a;
}

.pin-tag {
  background: rgba(255, 196, 0, 0.14);
  color: #ffcf5c;
}

.session-agent,
.session-meta,
.session-summary,
.panel-empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.session-agent {
  color: var(--text-muted);
  font-size: 11px;
}

.muted {
  color: var(--text-muted);
}

.action-btn,
.delete-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
  min-height: 28px;
  padding: 0 10px;
}

.action-btn.primary {
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 92%, white 8%), #ff9f1c);
  color: #111;
  font-weight: 700;
}

.action-btn.secondary,
.delete-btn {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.action-btn:disabled,
.delete-btn:disabled,
.session-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 960px) {
  .agent-session-list {
    padding: 10px;
  }
}
</style>
