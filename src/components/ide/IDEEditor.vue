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

    <div class="editor-toolbar">
      <div class="editor-meta">
        <div class="editor-path" :title="activeTab?.path || workspaceName || '未打开文件'">
          {{ activeTab?.path || workspaceName || '未打开文件' }}
        </div>
        <div class="editor-meta-row">
          <span class="editor-meta-pill">{{ activeLanguageLabel }}</span>
          <span class="editor-meta-pill">UTF-8</span>
          <span v-if="activeTab && activeTab.content !== activeTab.savedContent" class="editor-meta-pill is-warning">未保存</span>
        </div>
      </div>

      <div class="editor-actions">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="toolbarActionsDisabled"
          @click="runEditorAction('actions.find')"
        >
          查找
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="toolbarActionsDisabled"
          @click="runEditorAction('editor.action.startFindReplaceAction')"
        >
          替换
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="!activeTab || activeTab.loading" @click="$emit('save')">保存</button>
        <button class="btn btn-ghost btn-sm" @click="$emit('save-all')">全部保存</button>
      </div>
    </div>

    <div class="editor-surface" :class="{ 'is-blocked': !activeTab || Boolean(activeTab?.error || editorInitError || activeTab?.loading) }">
      <div ref="editorHostRef" class="editor-host"></div>
      <div v-if="!activeTab" class="editor-state-overlay editor-state--empty">
        <div class="editor-empty-card">
          <span class="editor-state-eyebrow">Ready</span>
          <strong>编辑器已就绪</strong>
          <p>从左侧文件浏览器选择一个文件，或先打开一个工作区。Monaco 编辑器会在首次进入时初始化语法高亮、查找替换和基础代码提示。</p>
        </div>
      </div>
      <div v-else-if="activeTab.error || editorInitError" class="editor-state-overlay editor-state--error">
        <div class="editor-state-card">
          <span class="editor-state-eyebrow">{{ editorInitError ? '编辑器初始化失败' : '读取失败' }}</span>
          <strong>{{ editorInitError ? 'Monaco 编辑器暂时未能启动' : `暂时无法打开 ${fileName(activeTab.path)}` }}</strong>
          <p>{{ editorInitError || activeTab.error }}</p>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            @click="editorInitError ? retryEditorInitialization() : $emit('retry')"
          >
            {{ editorInitError ? '重新初始化编辑器' : '重新读取' }}
          </button>
        </div>
      </div>
      <div v-else-if="activeTab.loading" class="editor-state-overlay editor-state--loading">
        <div class="editor-state-card">
          <span class="editor-state-eyebrow">正在同步文件</span>
          <strong>{{ fileName(activeTab.path) }}</strong>
          <p>正在从工作区载入内容并初始化语法高亮。若文件较大或位于网络盘，首次读取会稍慢一点。</p>
          <div class="editor-loading-skeleton">
            <div class="editor-loading-bar is-primary"></div>
            <div class="editor-loading-bar"></div>
            <div class="editor-loading-bar is-short"></div>
          </div>
        </div>
      </div>
      <div v-else-if="initializingEditor && !editorRef" class="editor-state-overlay editor-state--initializing">
        <div class="editor-state-card">
          <span class="editor-state-eyebrow">初始化编辑器</span>
          <strong>正在装载 Monaco 编辑器内核</strong>
          <p>首次进入会加载语言服务、主题和代码提示能力。完成后会直接显示文件内容。</p>
          <div class="editor-loading-skeleton">
            <div class="editor-loading-bar is-primary"></div>
            <div class="editor-loading-bar"></div>
            <div class="editor-loading-bar is-short"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="editor-footer">
      <span>{{ activeLanguageLabel }}</span>
      <span>{{ lineCount }} 行</span>
      <span>{{ activeTab?.content.length || 0 }} 字符</span>
      <span>Ln {{ cursorLine }}, Col {{ cursorColumn }}</span>
      <span v-if="selectionLength > 0">已选 {{ selectionLength }}</span>
      <span class="editor-runtime">{{ editorRuntimeLabel }}</span>
      <span v-if="activeTab && activeTab.content !== activeTab.savedContent" class="editor-unsaved">未保存</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchPostEffect, type PropType } from 'vue'
import { formatMonacoLanguageLabel, loadIdeMonaco, resolveMonacoLanguage } from '@/utils/ideMonaco'

type MonacoModule = typeof import('monaco-editor/esm/vs/editor/editor.api')
type MonacoEditor = import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor
type MonacoModel = import('monaco-editor/esm/vs/editor/editor.api').editor.ITextModel

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
  (event: 'retry'): void
  (event: 'save'): void
  (event: 'save-all'): void
}>()

const editorHostRef = ref<HTMLDivElement | null>(null)
const monacoRef = shallowRef<MonacoModule | null>(null)
const editorRef = shallowRef<MonacoEditor | null>(null)
const modelRegistry = new Map<string, MonacoModel>()
const initializingEditor = ref(false)
const editorInitError = ref('')
const selectionLength = ref(0)
const cursorLine = ref(1)
const cursorColumn = ref(1)
let contentSyncMuted = false
let selectionSyncMuted = false
let editorInitializationPromise: Promise<void> | null = null
let editorInitializationFrame: number | null = null
let editorBootstrapTimer: number | null = null
let editorBootstrapAttempts = 0

type IDEEditorDebugState = {
  mountedAt?: number
  mounted?: boolean
  hostReady?: boolean
  hostChildCount?: number
  activePath?: string
  activeTabLoading?: boolean
  activeTabError?: string
  tabCount?: number
  initState?: string
  initStartedAt?: number
  initFinishedAt?: number
  initAttempts?: number
  editorReady?: boolean
  error?: string
}

function updateEditorDebugState(patch: Partial<IDEEditorDebugState>) {
  if (typeof window === 'undefined') {
    return
  }

  const targetWindow = window as Window & {
    __OPENAGENT_IDE_EDITOR_DEBUG__?: IDEEditorDebugState
  }

  targetWindow.__OPENAGENT_IDE_EDITOR_DEBUG__ = {
    mounted: false,
    hostReady: Boolean(editorHostRef.value),
    hostChildCount: editorHostRef.value?.childElementCount || 0,
    activePath: props.activePath,
    activeTabLoading: Boolean(activeTab.value?.loading),
    activeTabError: activeTab.value?.error || '',
    tabCount: props.tabs.length,
    initState: editorRef.value ? 'ready' : initializingEditor.value ? 'initializing' : 'idle',
    initAttempts: editorBootstrapAttempts,
    editorReady: Boolean(editorRef.value),
    error: editorInitError.value,
    ...(targetWindow.__OPENAGENT_IDE_EDITOR_DEBUG__ || {}),
    ...patch,
  }
}

const activeTab = computed(() => props.tabs.find(tab => tab.path === props.activePath) ?? null)
const activeLanguage = computed(() => resolveMonacoLanguage(activeTab.value?.language, activeTab.value?.path || ''))
const activeLanguageLabel = computed(() => formatMonacoLanguageLabel(activeLanguage.value))
const toolbarActionsDisabled = computed(() => !activeTab.value || activeTab.value.loading || Boolean(activeTab.value.error) || Boolean(editorInitError.value))
const editorRuntimeLabel = computed(() => {
  if (editorInitError.value) {
    return 'Monaco 初始化失败'
  }

  if (editorRef.value) {
    return 'Monaco'
  }

  return initializingEditor.value ? '正在装载编辑器' : '等待挂载'
})
const lineCount = computed(() => {
  if (!activeTab.value) {
    return 0
  }

  return activeTab.value.content.split(/\r?\n/).length
})

watch(
  () => props.tabs.map(tab => `${tab.path}:${tab.language || ''}`),
  () => {
    syncTabModels()
    void syncActiveEditorState()
  },
  { immediate: true },
)

watch(
  () => activeTab.value?.content ?? '',
  () => {
    syncActiveModelContent()
  },
)

watch(
  () => [activeTab.value?.selectionStart ?? 0, activeTab.value?.selectionEnd ?? 0, activeTab.value?.path ?? ''],
  () => {
    syncSelectionFromProps()
  },
)

watch(
  () => [activeTab.value?.path ?? '', activeTab.value?.loading ?? false, activeTab.value?.error ?? ''],
  () => {
    void syncActiveEditorState()
  },
  { immediate: true },
)

onMounted(() => {
  updateEditorDebugState({
    mounted: true,
    mountedAt: Date.now(),
    initState: 'mounted',
  })
  void loadIdeMonaco().then(monaco => {
    monacoRef.value = monaco
    updateEditorDebugState({
      initState: editorRef.value ? 'ready' : 'monaco-loaded',
    })
  })
  void nextTick(() => {
    updateEditorDebugState({
      hostReady: Boolean(editorHostRef.value),
      hostChildCount: editorHostRef.value?.childElementCount || 0,
      initState: editorRef.value ? 'ready' : 'next-tick',
    })
    scheduleEditorInitialization()
    void syncActiveEditorState()
  })
  startEditorBootstrapLoop()
})

watchPostEffect(() => {
  updateEditorDebugState({
    hostReady: Boolean(editorHostRef.value),
    hostChildCount: editorHostRef.value?.childElementCount || 0,
    activePath: props.activePath,
    activeTabLoading: Boolean(activeTab.value?.loading),
    activeTabError: activeTab.value?.error || '',
    tabCount: props.tabs.length,
    initState: editorRef.value ? 'ready' : initializingEditor.value ? 'initializing' : 'idle',
    editorReady: Boolean(editorRef.value),
    error: editorInitError.value,
  })

  if (!editorHostRef.value || editorRef.value || editorInitError.value) {
    return
  }

  scheduleEditorInitialization()
})

onBeforeUnmount(() => {
  if (editorInitializationFrame !== null) {
    window.cancelAnimationFrame(editorInitializationFrame)
    editorInitializationFrame = null
  }
  stopEditorBootstrapLoop()
  for (const model of modelRegistry.values()) {
    model.dispose()
  }
  modelRegistry.clear()
  editorRef.value?.dispose()
})

function scheduleEditorInitialization() {
  if (!editorHostRef.value || editorRef.value || editorInitializationPromise || editorInitError.value) {
    return
  }

  updateEditorDebugState({
    initState: 'scheduled',
    hostReady: Boolean(editorHostRef.value),
    hostChildCount: editorHostRef.value?.childElementCount || 0,
  })

  if (editorInitializationFrame !== null) {
    window.cancelAnimationFrame(editorInitializationFrame)
  }

  editorInitializationFrame = window.requestAnimationFrame(() => {
    editorInitializationFrame = null
    if (!editorHostRef.value || editorRef.value || editorInitializationPromise || editorInitError.value) {
      return
    }

    updateEditorDebugState({
      initState: 'frame-fired',
      hostReady: Boolean(editorHostRef.value),
      hostChildCount: editorHostRef.value?.childElementCount || 0,
    })
    void initializeMonacoEditor()
  })
}

function startEditorBootstrapLoop() {
  stopEditorBootstrapLoop()
  editorBootstrapAttempts = 0
  editorBootstrapTimer = window.setInterval(() => {
    if (editorRef.value || editorInitError.value) {
      stopEditorBootstrapLoop()
      return
    }

    editorBootstrapAttempts += 1
    updateEditorDebugState({
      initAttempts: editorBootstrapAttempts,
      initState: 'bootstrap-loop',
      hostReady: Boolean(editorHostRef.value),
      hostChildCount: editorHostRef.value?.childElementCount || 0,
    })
    if (editorHostRef.value && !editorInitializationPromise) {
      void initializeMonacoEditor()
    }

    if (editorBootstrapAttempts >= 60) {
      stopEditorBootstrapLoop()
    }
  }, 120)
}

function stopEditorBootstrapLoop() {
  if (editorBootstrapTimer !== null) {
    window.clearInterval(editorBootstrapTimer)
    editorBootstrapTimer = null
  }
}

async function initializeMonacoEditor() {
  if (editorRef.value) {
    updateEditorDebugState({
      initState: 'ready',
      editorReady: true,
      hostChildCount: editorHostRef.value?.childElementCount || 0,
    })
    return
  }

  if (editorInitializationPromise) {
    await editorInitializationPromise
    return
  }

  editorInitializationPromise = (async () => {
    await nextTick()
    if (!editorHostRef.value) {
      updateEditorDebugState({
        initState: 'host-missing-after-tick',
        hostReady: false,
        hostChildCount: 0,
      })
      return
    }

    initializingEditor.value = true
    editorInitError.value = ''
    updateEditorDebugState({
      initState: 'starting',
      initStartedAt: Date.now(),
      hostReady: true,
      hostChildCount: editorHostRef.value.childElementCount,
      error: '',
    })

    try {
      const monaco = await loadIdeMonaco()
      monacoRef.value = monaco
      updateEditorDebugState({
        initState: 'monaco-ready',
        hostReady: Boolean(editorHostRef.value),
        hostChildCount: editorHostRef.value?.childElementCount || 0,
      })

      if (!editorHostRef.value || editorRef.value) {
        updateEditorDebugState({
          initState: editorRef.value ? 'already-ready' : 'host-missing-before-create',
          hostReady: Boolean(editorHostRef.value),
          hostChildCount: editorHostRef.value?.childElementCount || 0,
        })
        return
      }

      const editor = monaco.editor.create(editorHostRef.value, {
        value: '',
        language: 'plaintext',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        renderLineHighlight: 'gutter',
        wordWrap: 'off',
        fontFamily: 'Cascadia Code, Consolas, SFMono-Regular, monospace',
        fontSize: 13,
        lineHeight: 20,
        tabSize: 2,
        insertSpaces: true,
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: 'currentDocument',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        stickyScroll: { enabled: false },
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        contextmenu: true,
        overviewRulerLanes: 0,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      })

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => emit('save-all'))

      editor.onDidChangeModelContent(() => {
        if (contentSyncMuted) {
          return
        }

        const model = editor.getModel()
        if (!model || !activeTab.value) {
          return
        }

        emit('update-content', model.getValue())
      })

      editor.onDidChangeCursorSelection(event => {
        const model = editor.getModel()
        if (!model) {
          return
        }

        const selectionStart = model.getOffsetAt(event.selection.getStartPosition())
        const selectionEnd = model.getOffsetAt(event.selection.getEndPosition())
        updateCursorState(model.getValue(), selectionStart, selectionEnd)

        if (selectionSyncMuted) {
          return
        }

        emit('update-selection', { selectionStart, selectionEnd })
      })

      editorRef.value = editor
      console.info('[IDEEditor] Monaco editor created')
      updateEditorDebugState({
        initState: 'created',
        initFinishedAt: Date.now(),
        hostReady: true,
        hostChildCount: editorHostRef.value.childElementCount,
        editorReady: true,
      })
      syncTabModels()
      await syncActiveEditorState()
    } catch (error) {
      console.error('Failed to initialize Monaco editor:', error)
      editorInitError.value = error instanceof Error ? error.message : '未知错误'
      updateEditorDebugState({
        initState: 'failed',
        initFinishedAt: Date.now(),
        error: editorInitError.value,
        editorReady: false,
        hostReady: Boolean(editorHostRef.value),
        hostChildCount: editorHostRef.value?.childElementCount || 0,
      })
    } finally {
      initializingEditor.value = false
      editorInitializationPromise = null
      updateEditorDebugState({
        initState: editorRef.value ? 'ready' : editorInitError.value ? 'failed' : 'idle',
        editorReady: Boolean(editorRef.value),
        error: editorInitError.value,
        hostReady: Boolean(editorHostRef.value),
        hostChildCount: editorHostRef.value?.childElementCount || 0,
      })
    }
  })()

  await editorInitializationPromise
}

function buildModelUri(monaco: MonacoModule, filePath: string) {
  const normalizedPath = filePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
  return monaco.Uri.parse(`file:///openagent-workspace/${normalizedPath}`)
}

function getOrCreateModel(tab: EditorTab) {
  const monaco = monacoRef.value
  if (!monaco) {
    return null
  }

  const existingModel = modelRegistry.get(tab.path)
  if (existingModel) {
    const language = resolveMonacoLanguage(tab.language, tab.path)
    if (existingModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(existingModel, language)
    }
    return existingModel
  }

  const model = monaco.editor.createModel(
    tab.content,
    resolveMonacoLanguage(tab.language, tab.path),
    buildModelUri(monaco, tab.path),
  )
  modelRegistry.set(tab.path, model)
  return model
}

function syncTabModels() {
  const nextPaths = new Set(props.tabs.map(tab => tab.path))

  for (const [path, model] of modelRegistry.entries()) {
    if (!nextPaths.has(path)) {
      model.dispose()
      modelRegistry.delete(path)
    }
  }

  for (const tab of props.tabs) {
    getOrCreateModel(tab)
  }
}

function syncModelContent(model: MonacoModel, content: string) {
  if (model.getValue() === content) {
    return
  }

  contentSyncMuted = true
  model.setValue(content)
  contentSyncMuted = false
}

async function syncActiveEditorState() {
  updateEditorDebugState({
    activePath: props.activePath,
    activeTabLoading: Boolean(activeTab.value?.loading),
    activeTabError: activeTab.value?.error || '',
    tabCount: props.tabs.length,
    initState: editorRef.value ? 'syncing' : editorInitializationPromise ? 'waiting-init' : 'sync-requested',
  })

  if (!editorRef.value) {
    await initializeMonacoEditor()
  }

  const editor = editorRef.value
  if (!editor || editorInitError.value) {
    updateEditorDebugState({
      initState: editorInitError.value ? 'sync-blocked-by-error' : 'sync-no-editor',
      editorReady: Boolean(editor),
      error: editorInitError.value,
    })
    return
  }

  if (!activeTab.value || activeTab.value.loading || activeTab.value.error) {
    editor.setModel(null)
    updateEditorDebugState({
      initState: !activeTab.value ? 'no-active-tab' : activeTab.value.loading ? 'active-tab-loading' : 'active-tab-error',
      editorReady: true,
      hostChildCount: editorHostRef.value?.childElementCount || 0,
    })
    return
  }

  const model = getOrCreateModel(activeTab.value)
  if (!model) {
    return
  }

  syncModelContent(model, activeTab.value.content)

  if (editor.getModel() !== model) {
    editor.setModel(model)
  }

  applySelectionToEditor(activeTab.value.selectionStart ?? 0, activeTab.value.selectionEnd ?? 0)
  updateCursorState(activeTab.value.content, activeTab.value.selectionStart ?? 0, activeTab.value.selectionEnd ?? 0)

  await nextTick()
  editor.layout()
  updateEditorDebugState({
    initState: 'active-model-ready',
    editorReady: true,
    hostChildCount: editorHostRef.value?.childElementCount || 0,
  })
}

function syncActiveModelContent() {
  const editor = editorRef.value
  if (!editor || !activeTab.value || activeTab.value.loading || activeTab.value.error) {
    return
  }

  const model = getOrCreateModel(activeTab.value)
  if (!model) {
    return
  }

  syncModelContent(model, activeTab.value.content)
  updateCursorState(activeTab.value.content, activeTab.value.selectionStart ?? 0, activeTab.value.selectionEnd ?? 0)
}

function syncSelectionFromProps() {
  if (!editorRef.value || !activeTab.value || activeTab.value.loading || activeTab.value.error) {
    return
  }

  applySelectionToEditor(activeTab.value.selectionStart ?? 0, activeTab.value.selectionEnd ?? 0)
}

function updateCursorState(content: string, selectionStart: number, selectionEnd: number) {
  const normalizedSelection = normalizeSelectionRange(content, selectionStart, selectionEnd)
  const leadingContent = content.slice(0, normalizedSelection.selectionStart)
  const lines = leadingContent.split(/\r?\n/)
  const activeLine = lines[lines.length - 1] ?? ''

  cursorLine.value = lines.length
  cursorColumn.value = activeLine.length + 1
  selectionLength.value = normalizedSelection.selectionEnd - normalizedSelection.selectionStart
}

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

function applySelectionToEditor(selectionStart: number, selectionEnd: number) {
  const editor = editorRef.value
  const model = editor?.getModel()
  if (!editor || !model) {
    return
  }

  const normalizedSelection = normalizeSelectionRange(model.getValue(), selectionStart, selectionEnd)
  const startPosition = model.getPositionAt(normalizedSelection.selectionStart)
  const endPosition = model.getPositionAt(normalizedSelection.selectionEnd)

  selectionSyncMuted = true
  editor.setSelection({
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: endPosition.lineNumber,
    endColumn: endPosition.column,
  })
  selectionSyncMuted = false
}

async function runEditorAction(actionId: string) {
  const editor = editorRef.value
  if (!editor) {
    return
  }

  await editor.getAction(actionId)?.run()
  editor.focus()
}

async function retryEditorInitialization() {
  editorInitError.value = ''
  editorRef.value?.dispose()
  editorRef.value = null
  await initializeMonacoEditor()
}

function fileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || filePath
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
  gap: 1px;
  min-height: 34px;
  padding: 0 8px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(233, 239, 246, 0.99), rgba(226, 233, 242, 0.99));
}

.editor-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 6px 6px 0 0;
  background: rgba(15, 23, 42, 0.045);
  color: #64748b;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  &.is-active {
    background: rgba(255, 255, 255, 0.99);
    border-color: rgba(148, 163, 184, 0.14);
    box-shadow: inset 0 2px 0 #3b82f6, 0 -1px 0 rgba(255, 255, 255, 0.7);
    color: var(--text-primary);
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

  &:hover {
    background: rgba(148, 163, 184, 0.14);
  }
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
  gap: 8px;
  padding: 8px 10px;
  color: var(--text-muted);
  font-size: $font-xs;
}

.editor-toolbar {
  justify-content: space-between;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(244, 247, 251, 0.94));
}

.editor-meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.editor-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.editor-meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  background: rgba(226, 232, 240, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: #516274;
  white-space: nowrap;
}

.editor-meta-pill.is-warning {
  background: rgba(245, 158, 11, 0.14);
  color: #9a3412;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.editor-surface,
.editor-empty,
.editor-state {
  flex: 1;
  min-height: 0;
}

.editor-surface {
  position: relative;
  display: flex;
  padding: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(249, 251, 253, 1)),
    rgba(15, 23, 42, 0.01);

  &.is-blocked .editor-host {
    opacity: 0.16;
  }
}

.editor-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 1));
}

.editor-state-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: linear-gradient(180deg, rgba(251, 253, 255, 0.86), rgba(251, 253, 255, 0.68));
  backdrop-filter: blur(8px);
}

.editor-state--initializing {
  pointer-events: none;
}

.editor-empty,
.editor-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}

.editor-empty-card,
.editor-state-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(100%, 560px);
  padding: 18px 20px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.72));
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  color: var(--text-secondary);
}

.editor-state--error .editor-state-card {
  border-color: rgba(248, 113, 113, 0.22);
  background: linear-gradient(180deg, rgba(255, 245, 245, 0.94), rgba(255, 255, 255, 0.76));
}

.editor-empty-card strong,
.editor-state-card strong {
  color: var(--text-primary);
}

.editor-state-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.editor-loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.editor-loading-bar {
  width: min(100%, 360px);
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.16), rgba(var(--primary-rgb, 232 120 154), 0.14), rgba(255, 255, 255, 0.16));
  animation: pulse 1.2s ease-in-out infinite;
}

.editor-loading-bar.is-primary {
  width: min(100%, 420px);
}

.editor-loading-bar.is-short {
  width: min(100%, 240px);
}

.editor-footer {
  flex-wrap: wrap;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(237, 242, 248, 0.96), rgba(229, 236, 245, 0.99));
}

.editor-runtime {
  margin-left: auto;
  color: #516274;
  font-weight: 700;
}

.editor-unsaved {
  color: var(--warning);
  font-weight: 700;
}

:deep(.monaco-editor),
:deep(.monaco-editor-background),
:deep(.monaco-editor .margin) {
  background: transparent !important;
}

:deep(.monaco-editor .overflow-guard) {
  border-radius: 0 0 10px 10px;
}

@media (max-width: 960px) {
  .editor-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .editor-actions {
    justify-content: flex-start;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 0.45; transform: scaleX(0.95); }
  50% { opacity: 1; transform: scaleX(1); }
}
</style>
