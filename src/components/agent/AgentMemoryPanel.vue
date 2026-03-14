<template>
  <section class="agent-memory-panel glass-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Memory</p>
        <h3>长期记忆</h3>
      </div>
      <span class="memory-badge">{{ filteredMemories.length }}</span>
    </div>

    <p class="panel-copy">
      当前展示 {{ targetLabel }} 的长期记忆。这里适合保存稳定偏好、约束、工作习惯和持续目标，避免切模型或切会话后上下文丢失。
    </p>

    <form class="memory-form" @submit.prevent="submitMemory">
      <div class="form-row">
        <select v-model="draftCategory" class="memory-select">
          <option value="instruction">指令</option>
          <option value="preference">偏好</option>
          <option value="fact">事实</option>
          <option value="context">上下文</option>
        </select>
        <button class="panel-btn primary" type="submit" :disabled="!draftContent.trim()">
          {{ editingMemoryId ? '保存' : '添加' }}
        </button>
      </div>
      <textarea
        v-model.trim="draftContent"
        class="memory-input"
        rows="4"
        :placeholder="agentId ? `记录 ${targetLabel} 的稳定信息` : '记录当前 Agent 域的稳定信息'"
      />
    </form>

    <div v-if="filteredMemories.length === 0" class="memory-empty">
      <p>当前还没有长期记忆。</p>
      <small>比如用户偏好、项目约束、固定输出格式、默认目录或沟通方式，都适合写在这里。</small>
    </div>

    <div v-else class="memory-list">
      <article v-for="memory in filteredMemories" :key="memory.id" class="memory-card">
        <div class="memory-card-head">
          <span class="memory-category">{{ categoryLabel(memory.category) }}</span>
          <small>{{ formatTime(memory.updatedAt) }}</small>
        </div>
        <p>{{ memory.content }}</p>
        <div class="memory-card-actions">
          <button class="panel-btn secondary" type="button" @click="startEdit(memory)">编辑</button>
          <button class="panel-btn danger" type="button" @click="removeMemory(memory.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import type { AIMemoryEntry, AIConversationScope } from '@/types'
import { useAIStore } from '@/stores/ai'
import { showToast } from '@/utils/toast'

const props = defineProps<{
  scope: AIConversationScope
  agentId?: string
  agentName?: string
}>()

const aiStore = useAIStore()

const draftContent = ref('')
const draftCategory = ref<AIMemoryEntry['category']>('instruction')
const editingMemoryId = ref('')

const filteredMemories = computed(() => {
  return aiStore.getMemories(props.scope)
    .filter(memory => {
      if (!props.agentId) {
        return !memory.agentId
      }

      return !memory.agentId || memory.agentId === props.agentId
    })
})

const targetLabel = computed(() => props.agentName || (props.scope === 'live2d' ? 'Live2D Agent' : '当前 Agent'))

watch(
  () => props.agentId,
  () => {
    resetDraft()
  },
)

function categoryLabel(category: AIMemoryEntry['category']) {
  const labelMap: Record<AIMemoryEntry['category'], string> = {
    instruction: '指令',
    preference: '偏好',
    fact: '事实',
    context: '上下文',
  }
  return labelMap[category]
}

function formatTime(timestamp: number) {
  return dayjs(timestamp).format('MM/DD HH:mm')
}

function resetDraft() {
  editingMemoryId.value = ''
  draftContent.value = ''
  draftCategory.value = 'instruction'
}

function startEdit(memory: AIMemoryEntry) {
  editingMemoryId.value = memory.id
  draftContent.value = memory.content
  draftCategory.value = memory.category
}

function submitMemory() {
  if (!draftContent.value.trim()) {
    return
  }

  if (editingMemoryId.value) {
    aiStore.updateMemory(editingMemoryId.value, draftContent.value.trim())
    showToast('success', '长期记忆已更新')
    resetDraft()
    return
  }

  aiStore.addMemory(
    draftContent.value.trim(),
    draftCategory.value,
    'manual',
    props.scope,
    props.agentId,
  )
  showToast('success', '长期记忆已添加')
  resetDraft()
}

async function removeMemory(memoryId: string) {
  await aiStore.deleteMemory(memoryId)
  if (editingMemoryId.value === memoryId) {
    resetDraft()
  }
  showToast('success', '长期记忆已删除')
}
</script>

<style scoped>
.agent-memory-panel {
  display: grid;
  gap: 12px;
  min-height: 0;
  padding: 14px;
}

.panel-head,
.memory-card-head,
.memory-card-actions,
.form-row {
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

h3,
p,
small {
  margin: 0;
}

.panel-copy,
.memory-card p,
.memory-empty small {
  color: var(--text-secondary);
  line-height: 1.55;
}

.memory-badge,
.memory-category {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 11px;
}

.memory-form,
.memory-empty,
.memory-list {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.memory-select,
.memory-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font: inherit;
}

.memory-select {
  max-width: 120px;
  min-height: 32px;
  padding: 0 10px;
}

.memory-input {
  min-height: 96px;
  padding: 10px 12px;
  resize: vertical;
}

.memory-list {
  overflow: auto;
}

.memory-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-btn {
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
}

.panel-btn.primary {
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 90%, white 10%), #ff9f1c);
  color: #111;
  font-weight: 700;
}

.panel-btn.secondary,
.panel-btn.danger {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}
</style>
