<template>
  <section class="agent-toolbar glass-panel">
    <div class="toolbar-main">
      <div>
        <p class="eyebrow">Runtime</p>
        <h3>运行偏好</h3>
      </div>

      <div class="toolbar-actions">
        <button class="chip" :class="{ active: preferences.thinkingEnabled }" @click="$emit('toggle-thinking')">
          思考 {{ preferences.thinkingEnabled ? preferences.thinkingLevel : '关闭' }}
        </button>
        <button class="chip" :disabled="!preferences.thinkingEnabled" @click="$emit('cycle-thinking')">强度</button>
        <button class="chip" :class="{ active: preferences.planningMode }" @click="$emit('toggle-planning')">规划</button>
        <button class="chip" :class="{ active: preferences.autoMemory }" @click="$emit('toggle-memory')">记忆</button>
        <button class="settings-link" @click="$emit('open-settings')">AI 设置</button>
      </div>
    </div>

    <div v-if="modelLoadError" class="toolbar-meta">
      <span class="error-text">{{ modelLoadError }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { AIChatPreferences } from '@/types'

defineProps<{
  preferences: AIChatPreferences
  modelLoadError: string
}>()

defineEmits<{
  (e: 'toggle-thinking'): void
  (e: 'cycle-thinking'): void
  (e: 'toggle-planning'): void
  (e: 'toggle-memory'): void
  (e: 'open-settings'): void
}>()
</script>

<style scoped>
.agent-toolbar {
  display: grid;
  gap: 8px;
  padding: 10px;
}

.toolbar-main {
  align-items: start;
  display: flex;
  gap: 10px;
  justify-content: space-between;
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

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip,
.settings-link {
  border-radius: 999px;
  font-size: 11px;
}

.chip {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  cursor: pointer;
  min-height: 28px;
  padding: 0 10px;
}

.chip.active {
  background: linear-gradient(135deg, rgba(255, 166, 43, 0.18), rgba(255, 209, 102, 0.16));
  border-color: rgba(255, 196, 0, 0.3);
  color: var(--text-primary);
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.toolbar-meta {
  display: flex;
  align-items: center;
}

.error-text {
  color: #ff8d8d;
  font-size: 11px;
  line-height: 1.55;
}

.settings-link {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  cursor: pointer;
  min-height: 28px;
  padding: 0 10px;
}

@media (max-width: 960px) {
  .toolbar-main {
    flex-direction: column;
  }
}
</style>
