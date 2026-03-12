<template>
  <section class="ide-editor glass-panel">
    <div class="editor-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        class="editor-tab"
        :class="{ 'is-active': tab.path === activePath }"
        @click="$emit('select-tab', tab.path)"
      >
        <span class="editor-tab-name">{{ fileName(tab.path) }}</span>
        <span v-if="tab.content !== tab.savedContent" class="editor-tab-dirty"></span>
        <button class="editor-tab-close" title="关闭标签" @click.stop="$emit('close-tab', tab.path)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </button>
      <div v-if="tabs.length === 0" class="editor-tab-placeholder">{{ workspaceName || '未打开工作区' }}</div>
    </div>

    <div v-if="!activeTab" class="editor-empty">
      <strong>编辑器已就绪</strong>
      <p>从左侧文件浏览器选择一个文件，或先打开一个工作区。</p>
    </div>

    <template v-else>
      <div class="editor-toolbar">
        <div class="editor-path">{{ activeTab.path }}</div>
        <div class="editor-actions">
          <button class="btn btn-secondary btn-sm" :disabled="activeTab.loading" @click="$emit('save')">保存</button>
          <button class="btn btn-ghost btn-sm" @click="$emit('save-all')">全部保存</button>
        </div>
      </div>

      <div v-if="activeTab.error" class="editor-error">
        <strong>文件读取失败</strong>
        <p>{{ activeTab.error }}</p>
      </div>

      <div v-else-if="activeTab.loading" class="editor-loading">
        <div class="editor-loading-bar"></div>
        <span>正在读取文件...</span>
      </div>

      <textarea
        v-else
        class="editor-textarea"
        :value="activeTab.content"
        spellcheck="false"
        @input="handleInput"
        @keydown="handleEditorKeydown"
      />

      <div class="editor-footer">
        <span>{{ activeTab.language || 'Plain Text' }}</span>
        <span>{{ lineCount }} 行</span>
        <span>{{ activeTab.content.length }} 字符</span>
        <span v-if="activeTab.content !== activeTab.savedContent" class="editor-unsaved">未保存</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'

interface EditorTab {
  path: string
  content: string
  savedContent: string
  language?: string
  loading: boolean
  error: string
}

const props = defineProps({
  tabs: {
    type: Array as PropType<EditorTab[]>,
    default: () => [],
  },
  activePath: {
    type: String,
    default: '',
  },
  workspaceName: {
    type: String,
    default: '',
  },
})

const emit = defineEmits<{
  (event: 'select-tab', path: string): void
  (event: 'close-tab', path: string): void
  (event: 'update-content', content: string): void
  (event: 'save'): void
  (event: 'save-all'): void
}>()

const activeTab = computed(() => props.tabs.find(tab => tab.path === props.activePath) ?? null)
const lineCount = computed(() => {
  if (!activeTab.value) {
    return 0
  }

  return activeTab.value.content.split(/\r?\n/).length
})

function fileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || filePath
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null
  emit('update-content', target?.value || '')
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save')
  }
}
</script>

<style lang="scss" scoped>
.ide-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 42px;
  padding: $spacing-sm;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
}

.editor-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  padding: 8px 10px;
  border: none;
  border-radius: $border-radius-sm;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;

  &.is-active {
    background: var(--primary-bg);
    color: var(--primary);
  }
}

.editor-tab-name,
.editor-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--warning);
  flex-shrink: 0;
}

.editor-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.editor-tab-placeholder {
  color: var(--text-muted);
  font-size: $font-sm;
  padding: 0 $spacing-sm;
}

.editor-toolbar,
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  color: var(--text-muted);
  font-size: $font-xs;
}

.editor-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.editor-actions {
  display: flex;
  gap: $spacing-sm;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: $spacing-md;
  border: none;
  background: rgba(255, 255, 255, 0.42);
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
  line-height: 1.7;
  resize: none;
  outline: none;
}

.editor-empty,
.editor-error,
.editor-loading {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: $spacing-sm;
  padding: $spacing-xl;
  color: var(--text-secondary);
}

.editor-loading-bar {
  width: 160px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.28), var(--primary-bg), rgba(255, 255, 255, 0.28));
  animation: pulse 1.2s ease-in-out infinite;
}

.editor-unsaved {
  color: var(--warning);
  font-weight: 700;
}

@keyframes pulse {
  0%, 100% { opacity: 0.45; transform: scaleX(0.95); }
  50% { opacity: 1; transform: scaleX(1); }
}
</style>
