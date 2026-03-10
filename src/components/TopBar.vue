<template>
  <header class="topbar">
    <div class="topbar-drag" @dblclick="maximize"></div>
    <div class="topbar-content">
      <div class="topbar-title">
        <h2>{{ pageTitle }}</h2>
      </div>
      <div class="topbar-actions">
        <button
          v-if="aiRuntimeLabel"
          class="ai-runtime-indicator"
          :class="{ 'is-running': aiStore.streaming, 'is-compressing': aiStore.runtime.phase === 'compressing' }"
          @click="openAIPanel"
        >
          <span class="runtime-dot"></span>
          <span>{{ aiRuntimeLabel }}</span>
        </button>
        <div class="search-box" v-if="showSearch">
          <svg width="16" height="16"><use href="#icon-search"/></svg>
          <input
            ref="searchInputRef"
            type="text"
            class="search-input"
            placeholder="搜索当前页面内容..."
            v-model="searchQuery"
            @input="emitSearch"
          />
          <span class="search-shortcut">{{ shortcutLabel }}</span>
        </div>
      </div>
    </div>
    <div class="window-controls">
      <button class="win-btn" @click="minimize" title="最小化" aria-label="最小化窗口">
        <svg width="14" height="14"><use href="#icon-minimize"/></svg>
      </button>
      <button class="win-btn" @click="maximize" :title="isMax ? '还原' : '最大化'" :aria-label="isMax ? '还原窗口' : '最大化窗口'">
        <svg width="14" height="14"><use :href="isMax ? '#icon-restore' : '#icon-maximize'"/></svg>
      </button>
      <button class="win-btn win-close" @click="closeWin" title="关闭" aria-label="关闭窗口">
        <svg width="14" height="14"><use href="#icon-close"/></svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { APP_NAME } from '@/utils/appMeta'

const props = defineProps<{
  showSearch?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const route = useRoute()
const router = useRouter()
const aiStore = useAIStore()
const searchQuery = ref('')
const isMax = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const pageTitle = computed(() => {
  return (route.meta?.title as string) || APP_NAME
})

const shortcutLabel = computed(() => {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) {
    return 'Cmd + K'
  }
  return 'Ctrl + K'
})

const aiRuntimeLabel = computed(() => {
  if (!aiStore.runtime.sessionId) {
    return ''
  }

  const scopeLabel = aiStore.runtime.sessionScope === 'live2d' ? 'Live2D' : 'AI'
  const context = aiStore.runtime.context
  const usageLabel = context
    ? `${context.estimatedInputTokens.toLocaleString()}/${context.selectedContextTokens.toLocaleString()}`
    : ''

  if (aiStore.runtime.phase === 'compressing') {
    return `${scopeLabel} 压缩中${usageLabel ? ` · ${usageLabel}` : ''}`
  }

  if (aiStore.streaming) {
    return `${scopeLabel} 执行中${usageLabel ? ` · ${usageLabel}` : ''}`
  }

  return usageLabel ? `${scopeLabel} 最近上下文 · ${usageLabel}` : `${scopeLabel} 最近任务`
})

const isElectron = !!window.electronAPI

function emitSearch() {
  emit('search', searchQuery.value)
}

function focusSearch() {
  if (!props.showSearch || !searchInputRef.value) return
  searchInputRef.value.focus()
  searchInputRef.value.select()
}

function clearSearch() {
  if (!searchQuery.value) return
  searchQuery.value = ''
  emitSearch()
}

function minimize() {
  if (isElectron) window.electronAPI.minimize()
}

function maximize() {
  if (isElectron) window.electronAPI.maximize()
}

function closeWin() {
  if (isElectron) window.electronAPI.close()
}

function openAIPanel() {
  if (aiStore.runtime.sessionId) {
    aiStore.switchSession(aiStore.runtime.sessionId)
  }

  if (aiStore.runtime.sessionScope === 'live2d') {
    void router.push('/ai-settings')
    return
  }

  void router.push('/ai')
}

function handleFocusSearch() {
  focusSearch()
}

function handleClearSearch() {
  clearSearch()
}

watch(() => route.fullPath, () => {
  clearSearch()
})

watch(() => props.showSearch, (visible) => {
  if (!visible) {
    clearSearch()
  }
})

onMounted(() => {
  if (isElectron) {
    window.electronAPI.isMaximized().then(v => (isMax.value = v))
    window.electronAPI.onMaximized(v => (isMax.value = v))
  }

  window.addEventListener('app:focus-search', handleFocusSearch)
  window.addEventListener('app:clear-search', handleClearSearch)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:focus-search', handleFocusSearch)
  window.removeEventListener('app:clear-search', handleClearSearch)
})
</script>

<style lang="scss" scoped>
.topbar {
  height: $topbar-height;
  display: flex;
  align-items: center;
  background: var(--bg-topbar);
  backdrop-filter: blur(var(--glass-blur));
  border-bottom: 1px solid var(--glass-border);
  position: relative;
  z-index: $z-topbar;
  user-select: none;
  -webkit-app-region: drag;
}

.topbar-drag {
  position: absolute;
  inset: 0;
}

.topbar-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-lg;
  position: relative;
  z-index: 1;
}

.topbar-title {
  -webkit-app-region: drag;
}

.topbar-title h2 {
  font-size: $font-md;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.ai-runtime-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 200, 220, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: all $transition-fast;

  &:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  &.is-running {
    border-color: rgba(255, 170, 200, 0.36);
    color: var(--primary);
  }

  &.is-compressing {
    border-color: rgba(93, 135, 255, 0.3);
    color: #2d4f99;
  }
}

.runtime-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 6px rgba(255, 170, 200, 0.12);
}

.search-box {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  transition: all $transition-fast;
  -webkit-app-region: no-drag;

  svg {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-bg);
  }
}

.search-input {
  border: none;
  background: transparent;
  outline: none;
  color: var(--text-primary);
  font-size: $font-sm;
  width: 200px;

  &::placeholder {
    color: var(--text-muted);
  }
}

.search-shortcut {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.45);
  color: var(--text-muted);
  font-size: $font-xs;
  white-space: nowrap;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 10px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(255, 244, 248, 0.68));
  box-shadow: 0 10px 24px rgba(214, 155, 177, 0.16);
  backdrop-filter: blur(calc(var(--glass-blur) * 0.7));
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 1;
}

.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform $transition-fast, background $transition-fast, border-color $transition-fast, color $transition-fast, box-shadow $transition-fast;

  svg {
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 184, 208, 0.5);
    color: var(--text-primary);
    box-shadow: 0 8px 18px rgba(214, 155, 177, 0.18);
  }

  &:active {
    transform: translateY(0);
  }

  &.win-close {
    background: linear-gradient(135deg, rgba(255, 102, 125, 0.16), rgba(255, 140, 159, 0.28));
    color: #b4374e;
  }

  &.win-close:hover {
    background: linear-gradient(135deg, #ff6a79, #df4056);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 10px 22px rgba(223, 64, 86, 0.3);
  }
}
</style>
