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
          <button
            class="btn btn-ghost btn-sm"
            :class="{ 'is-active': showSearchPanel && !replaceMode }"
            :disabled="activeTab.loading || Boolean(activeTab.error)"
            @click="openSearch('find')"
          >
            查找
          </button>
          <button
            class="btn btn-ghost btn-sm"
            :class="{ 'is-active': showSearchPanel && replaceMode }"
            :disabled="activeTab.loading || Boolean(activeTab.error)"
            @click="openSearch('replace')"
          >
            替换
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="activeTab.loading" @click="$emit('save')">保存</button>
          <button class="btn btn-ghost btn-sm" @click="$emit('save-all')">全部保存</button>
        </div>
      </div>

      <div v-if="showSearchPanel && !activeTab.loading && !activeTab.error" class="editor-search-panel">
        <div class="editor-search-row">
          <label class="editor-search-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              class="editor-search-input"
              placeholder="查找"
              @keydown="handleSearchInputKeydown"
            >
          </label>

          <button
            class="editor-search-chip"
            :class="{ 'is-active': matchCase }"
            type="button"
            title="区分大小写"
            @click="matchCase = !matchCase"
          >
            Aa
          </button>

          <button
            class="editor-icon-button"
            type="button"
            title="上一个匹配"
            :disabled="!hasMatches"
            @click="navigateMatches(-1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>

          <button
            class="editor-icon-button"
            type="button"
            title="下一个匹配"
            :disabled="!hasMatches"
            @click="navigateMatches(1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <span class="editor-search-summary">{{ searchSummary }}</span>

          <button class="editor-icon-button" type="button" title="关闭查找" @click="closeSearch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div v-if="replaceMode" class="editor-search-row">
          <label class="editor-search-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <input
              v-model="replaceQuery"
              type="text"
              class="editor-search-input"
              placeholder="替换为"
              @keydown="handleReplaceInputKeydown"
            >
          </label>

          <button class="btn btn-secondary btn-sm" type="button" :disabled="!hasMatches" @click="replaceCurrentMatch">
            替换当前
          </button>
          <button class="btn btn-ghost btn-sm" type="button" :disabled="!hasMatches" @click="replaceAllMatches">
            全部替换
          </button>
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

      <div v-else class="editor-surface">
        <div ref="gutterRef" class="editor-gutter" aria-hidden="true">
          <span
            v-for="lineNumber in lineNumbers"
            :key="lineNumber"
            class="editor-gutter-line"
            :class="{ 'is-active': lineNumber === cursorLine }"
          >
            {{ lineNumber }}
          </span>
        </div>

        <textarea
          ref="textareaRef"
          class="editor-textarea"
          :value="activeTab.content"
          spellcheck="false"
          wrap="off"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          @input="handleInput"
          @keydown="handleEditorKeydown"
          @click="handleSelectionChange"
          @keyup="handleSelectionChange"
          @mouseup="handleSelectionChange"
          @select="handleSelectionChange"
          @scroll="syncGutterScroll"
        />
      </div>

      <div class="editor-footer">
        <span>{{ activeTab.language || 'Plain Text' }}</span>
        <span>{{ lineCount }} 行</span>
        <span>{{ activeTab.content.length }} 字符</span>
        <span>Ln {{ cursorLine }}, Col {{ cursorColumn }}</span>
        <span v-if="selectionLength > 0">已选 {{ selectionLength }}</span>
        <span v-if="showSearchPanel && searchQuery" class="editor-search-footer">{{ searchSummary }}</span>
        <span v-if="activeTab.content !== activeTab.savedContent" class="editor-unsaved">未保存</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type PropType } from 'vue'

interface EditorTab {
  path: string
  content: string
  savedContent: string
  language?: string
  loading: boolean
  error: string
  selectionStart?: number
  selectionEnd?: number
}

interface SearchMatch {
  start: number
  end: number
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
  (event: 'update-selection', payload: { selectionStart: number; selectionEnd: number }): void
  (event: 'save'): void
  (event: 'save-all'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const gutterRef = ref<HTMLDivElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const showSearchPanel = ref(false)
const replaceMode = ref(false)
const searchQuery = ref('')
const replaceQuery = ref('')
const matchCase = ref(false)

const activeTab = computed(() => props.tabs.find(tab => tab.path === props.activePath) ?? null)
const lineCount = computed(() => {
  if (!activeTab.value) {
    return 0
  }

  return activeTab.value.content.split(/\r?\n/).length
})
const lineNumbers = computed(() => Array.from({ length: Math.max(lineCount.value, 1) }, (_, index) => index + 1))
const selectionRange = computed(() => {
  if (!activeTab.value) {
    return { selectionStart: 0, selectionEnd: 0 }
  }

  return normalizeSelectionRange(
    activeTab.value.content,
    activeTab.value.selectionStart ?? 0,
    activeTab.value.selectionEnd ?? 0,
  )
})
const cursorState = computed(() => deriveCursorState(
  activeTab.value?.content ?? '',
  selectionRange.value.selectionStart,
  selectionRange.value.selectionEnd,
))
const cursorLine = computed(() => cursorState.value.line)
const cursorColumn = computed(() => cursorState.value.column)
const selectionLength = computed(() => cursorState.value.selectionLength)
const matches = computed(() => collectMatches(activeTab.value?.content ?? '', searchQuery.value, matchCase.value))
const hasMatches = computed(() => matches.value.length > 0)
const currentMatchIndex = computed(() => resolveCurrentMatchIndex(
  selectionRange.value.selectionStart,
  selectionRange.value.selectionEnd,
  matches.value,
))
const searchSummary = computed(() => {
  if (!showSearchPanel.value) {
    return ''
  }

  if (searchQuery.value.length === 0) {
    return '输入内容后开始查找'
  }

  if (!hasMatches.value) {
    return '0 个匹配'
  }

  if (currentMatchIndex.value >= 0) {
    return `${currentMatchIndex.value + 1} / ${matches.value.length}`
  }

  return `共 ${matches.value.length} 个匹配`
})

watch(
  () => [activeTab.value?.path ?? '', activeTab.value?.loading ?? false],
  async () => {
    await nextTick()
    if (!activeTab.value || activeTab.value.loading || activeTab.value.error) {
      return
    }

    applySelectionToTextarea(selectionRange.value.selectionStart, selectionRange.value.selectionEnd, {
      emitSelection: false,
      focus: false,
    })
    syncGutterScroll()
  },
  { immediate: true },
)

watch(
  () => searchQuery.value,
  () => {
    if (!showSearchPanel.value || searchQuery.value.length === 0 || matches.value.length === 0) {
      return
    }

    if (currentMatchIndex.value >= 0) {
      return
    }

    void nextTick(() => {
      navigateMatches(1, { focus: false })
    })
  },
)

function normalizeSelectionOffset(value: number, contentLength: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(Math.trunc(value), 0), contentLength)
}

function normalizeSelectionRange(content: string, selectionStart: number, selectionEnd: number) {
  const contentLength = content.length
  const start = normalizeSelectionOffset(selectionStart, contentLength)
  const end = normalizeSelectionOffset(selectionEnd, contentLength)

  return {
    selectionStart: Math.min(start, end),
    selectionEnd: Math.max(start, end),
  }
}

function deriveCursorState(content: string, selectionStart: number, selectionEnd: number) {
  const normalizedSelection = normalizeSelectionRange(content, selectionStart, selectionEnd)
  const leadingContent = content.slice(0, normalizedSelection.selectionStart)
  const lines = leadingContent.split(/\r?\n/)
  const activeLine = lines[lines.length - 1] ?? ''

  return {
    line: lines.length,
    column: activeLine.length + 1,
    selectionLength: normalizedSelection.selectionEnd - normalizedSelection.selectionStart,
  }
}

function collectMatches(content: string, rawQuery: string, caseSensitive: boolean) {
  if (rawQuery.length === 0) {
    return [] as SearchMatch[]
  }

  const query = rawQuery
  const source = caseSensitive ? content : content.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matchesList: SearchMatch[] = []

  let searchFrom = 0
  while (searchFrom <= source.length - needle.length) {
    const matchIndex = source.indexOf(needle, searchFrom)
    if (matchIndex === -1) {
      break
    }

    matchesList.push({
      start: matchIndex,
      end: matchIndex + query.length,
    })

    searchFrom = matchIndex + Math.max(query.length, 1)
  }

  return matchesList
}

function resolveCurrentMatchIndex(selectionStart: number, selectionEnd: number, matchesList: SearchMatch[]) {
  if (matchesList.length === 0) {
    return -1
  }

  const exactMatchIndex = matchesList.findIndex(match => match.start === selectionStart && match.end === selectionEnd)
  if (exactMatchIndex >= 0) {
    return exactMatchIndex
  }

  if (selectionStart === selectionEnd) {
    return matchesList.findIndex(match => match.start <= selectionStart && match.end > selectionStart)
  }

  return -1
}

function fileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || filePath
}

function syncGutterScroll() {
  if (!textareaRef.value || !gutterRef.value) {
    return
  }

  gutterRef.value.scrollTop = textareaRef.value.scrollTop
}

function emitSelectionFromTextarea(target: HTMLTextAreaElement | null) {
  if (!target) {
    return
  }

  const normalizedSelection = normalizeSelectionRange(
    target.value,
    target.selectionStart,
    target.selectionEnd,
  )
  emit('update-selection', normalizedSelection)
}

function applySelectionToTextarea(
  selectionStart: number,
  selectionEnd: number,
  options?: { focus?: boolean; emitSelection?: boolean },
) {
  const textarea = textareaRef.value
  const currentTab = activeTab.value
  if (!textarea || !currentTab) {
    return
  }

  const normalizedSelection = normalizeSelectionRange(currentTab.content, selectionStart, selectionEnd)
  textarea.setSelectionRange(normalizedSelection.selectionStart, normalizedSelection.selectionEnd)
  if (options?.focus ?? false) {
    textarea.focus()
  }
  if (options?.emitSelection ?? true) {
    emit('update-selection', normalizedSelection)
  }
}

function focusSearchField() {
  void nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  })
}

function openSearch(mode: 'find' | 'replace') {
  showSearchPanel.value = true
  replaceMode.value = mode === 'replace'
  focusSearchField()
}

function closeSearch() {
  showSearchPanel.value = false
  replaceMode.value = false
  textareaRef.value?.focus()
}

function getTargetMatchIndex(direction: 1 | -1) {
  if (matches.value.length === 0) {
    return -1
  }

  if (currentMatchIndex.value >= 0) {
    return (currentMatchIndex.value + direction + matches.value.length) % matches.value.length
  }

  if (direction > 0) {
    const nextMatchIndex = matches.value.findIndex(match => match.start >= selectionRange.value.selectionEnd)
    return nextMatchIndex >= 0 ? nextMatchIndex : 0
  }

  for (let index = matches.value.length - 1; index >= 0; index -= 1) {
    if (matches.value[index].end <= selectionRange.value.selectionStart) {
      return index
    }
  }

  return matches.value.length - 1
}

function navigateMatches(direction: 1 | -1, options?: { focus?: boolean }) {
  const nextMatchIndex = getTargetMatchIndex(direction)
  if (nextMatchIndex < 0) {
    return
  }

  const nextMatch = matches.value[nextMatchIndex]
  applySelectionToTextarea(nextMatch.start, nextMatch.end, { focus: options?.focus ?? false })
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null
  emit('update-content', target?.value || '')
  emitSelectionFromTextarea(target)
}

function handleSelectionChange(event: Event) {
  emitSelectionFromTextarea(event.target as HTMLTextAreaElement | null)
}

function replaceCurrentMatch() {
  if (!activeTab.value || matches.value.length === 0) {
    return
  }

  const nextMatchIndex = currentMatchIndex.value >= 0 ? currentMatchIndex.value : getTargetMatchIndex(1)
  if (nextMatchIndex < 0) {
    return
  }

  const targetMatch = matches.value[nextMatchIndex]
  const nextContent = `${activeTab.value.content.slice(0, targetMatch.start)}${replaceQuery.value}${activeTab.value.content.slice(targetMatch.end)}`
  const nextSelectionStart = targetMatch.start
  const nextSelectionEnd = targetMatch.start + replaceQuery.value.length

  emit('update-content', nextContent)
  emit('update-selection', {
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  })

  void nextTick(() => {
    applySelectionToTextarea(nextSelectionStart, nextSelectionEnd, { emitSelection: false, focus: false })
  })
}

function replaceAllMatches() {
  if (!activeTab.value || matches.value.length === 0) {
    return
  }

  const nextContentParts: string[] = []
  let lastIndex = 0
  for (const match of matches.value) {
    nextContentParts.push(activeTab.value.content.slice(lastIndex, match.start))
    nextContentParts.push(replaceQuery.value)
    lastIndex = match.end
  }
  nextContentParts.push(activeTab.value.content.slice(lastIndex))

  const nextSelectionStart = matches.value[0]?.start ?? 0
  const nextSelectionEnd = nextSelectionStart + replaceQuery.value.length

  emit('update-content', nextContentParts.join(''))
  emit('update-selection', {
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  })

  void nextTick(() => {
    applySelectionToTextarea(nextSelectionStart, nextSelectionEnd, { emitSelection: false, focus: false })
  })
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save')
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openSearch('find')
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
    event.preventDefault()
    openSearch('replace')
    return
  }

  if (event.key === 'F3') {
    event.preventDefault()
    navigateMatches(event.shiftKey ? -1 : 1, { focus: false })
    return
  }

  if (event.key === 'Escape' && showSearchPanel.value) {
    event.preventDefault()
    closeSearch()
  }
}

function handleSearchInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    navigateMatches(event.shiftKey ? -1 : 1, { focus: false })
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearch()
  }
}

function handleReplaceInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    replaceCurrentMatch()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearch()
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
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  color: var(--text-muted);
  font-size: $font-xs;
}

.editor-toolbar {
  justify-content: space-between;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.editor-actions .btn.is-active {
  background: rgba(var(--primary-rgb, 232 120 154), 0.12);
  color: var(--primary);
}

.editor-search-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  background: rgba(255, 255, 255, 0.52);
}

.editor-search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
}

.editor-search-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  padding: 0 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-secondary);
}

.editor-search-input {
  width: 100%;
  min-width: 0;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  outline: none;
  font-size: $font-sm;
}

.editor-search-chip,
.editor-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.editor-search-chip.is-active {
  border-color: rgba(var(--primary-rgb, 232 120 154), 0.22);
  background: rgba(var(--primary-rgb, 232 120 154), 0.12);
  color: var(--primary);
}

.editor-icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.editor-search-summary {
  min-width: 72px;
  font-size: $font-xs;
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.editor-surface {
  display: flex;
  flex: 1;
  min-height: 0;
  background: rgba(255, 255, 255, 0.42);
}

.editor-gutter {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 0;
  min-width: 58px;
  padding: $spacing-md 10px $spacing-md $spacing-md;
  overflow: hidden;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(14, 25, 42, 0.04);
  color: var(--text-muted);
  font-family: 'Cascadia Code', 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
  line-height: 1.7;
  user-select: none;
}

.editor-gutter-line {
  display: block;
  width: 100%;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.editor-gutter-line.is-active {
  color: var(--primary);
  font-weight: 700;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: $spacing-md;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Consolas', 'SFMono-Regular', monospace;
  font-size: 13px;
  line-height: 1.7;
  resize: none;
  outline: none;
  tab-size: 2;
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

.editor-footer {
  flex-wrap: wrap;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.editor-search-footer {
  color: var(--primary);
  font-weight: 700;
}

.editor-unsaved {
  margin-left: auto;
  color: var(--warning);
  font-weight: 700;
}

@media (max-width: 960px) {
  .editor-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .editor-actions {
    justify-content: flex-start;
  }

  .editor-search-summary {
    width: 100%;
  }

  .editor-gutter {
    min-width: 48px;
    padding-left: 10px;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 0.45; transform: scaleX(0.95); }
  50% { opacity: 1; transform: scaleX(1); }
}
</style>
