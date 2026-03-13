<template>
  <section class="ide-terminal glass-panel">
    <div class="terminal-head">
      <div>
        <p class="terminal-eyebrow">Workspace Shell</p>
        <h3>终端工作台</h3>
      </div>

      <div class="head-actions">
        <span class="terminal-status" :class="`is-${statusTone}`">{{ statusLabel }}</span>
        <button class="btn btn-secondary btn-sm" :disabled="!canCreateSession" @click="createShellTab">
          新建终端
        </button>
      </div>
    </div>

    <div class="terminal-summary">
      <span class="summary-chip">工作区：{{ workspacePath || '未打开' }}</span>
      <span class="summary-chip">当前文件：{{ activeFilePath || '未选择' }}</span>
      <span class="summary-chip">待保存：{{ dirtyCount }}</span>
      <span class="summary-chip">会话：{{ terminalTabs.length }}</span>
    </div>

    <div v-if="terminalTabs.length > 0" class="terminal-tab-strip">
      <button
        v-for="tab in terminalTabs"
        :key="tab.id"
        class="terminal-tab"
        :class="{ active: tab.id === activeTabId }"
        @click="activeTabId = tab.id"
      >
        <span class="tab-copy">
          <strong>{{ tab.title }}</strong>
          <small>{{ formatTabMeta(tab) }}</small>
        </span>
        <span class="tab-actions">
          <button
            class="tab-action"
            type="button"
            :disabled="tab.status === 'running' && tab.mode === 'command'"
            @click.stop="closeTerminalTab(tab.id)"
          >
            {{ tab.status === 'running' ? '停止' : '关闭' }}
          </button>
        </span>
      </button>
    </div>

    <div class="terminal-controls">
      <label class="command-input">
        <span>命令输入</span>
        <input
          v-model="commandInput"
          type="text"
          placeholder="例如 npm run build"
          :disabled="!canTypeIntoActiveTab"
          @input="handleCommandInput"
          @keydown.up.prevent="navigateCommandHistory('up')"
          @keydown.down.prevent="navigateCommandHistory('down')"
          @keydown.enter.exact.prevent="sendCommandToActiveTab"
        />
      </label>

      <div class="command-actions">
        <button class="btn btn-primary btn-sm" :disabled="!canSendCommand" @click="sendCommandToActiveTab">发送</button>
        <button class="btn btn-secondary btn-sm" :disabled="!canStopActiveTab" @click="stopActiveTab">{{ stopActionLabel }}</button>
        <button class="btn btn-ghost btn-sm" :disabled="!selectedTab || selectedTab.lines.length === 0" @click="copySelectedOutput">复制输出</button>
        <button class="btn btn-ghost btn-sm" :disabled="!canClearTabs" @click="clearClosedTabs">清理已结束</button>
      </div>
    </div>

    <p class="terminal-hint">
      提示：`↑/↓` 可切换最近命令；点击终端画布后可直接键入、粘贴并运行全屏命令，顶部按钮会优先中断当前 shell 命令。
    </p>

    <div v-if="scripts.length > 0" class="terminal-script-list">
      <button
        v-for="script in scripts"
        :key="script.name"
        class="script-chip"
        :disabled="!canTypeIntoActiveTab"
        @click="runPreset(script.command)"
      >
        <strong>{{ script.name }}</strong>
        <span>{{ script.command }}</span>
      </button>
    </div>

    <div ref="consoleRef" class="terminal-console" :class="{ 'terminal-console--empty': !selectedTab }" @click="focusActiveTerminal">
      <template v-if="selectedTab">
        <div class="console-headline">
          <div>
            <strong>{{ selectedTab.title }}</strong>
            <p>{{ selectedTab.cwd }}</p>
          </div>
          <span>{{ formatSessionState(selectedTab) }}</span>
        </div>

        <div v-if="supportsTerminalViewport" class="terminal-viewport-stack">
          <div
            v-for="tab in terminalTabs"
            v-show="tab.id === selectedTab.id"
            :key="`${tab.id}-viewport`"
            class="terminal-viewport-pane"
          >
            <div :ref="element => setTerminalViewportRef(tab.id, element)" class="terminal-viewport" />
          </div>
        </div>

        <template v-else>
          <pre
            v-for="line in selectedTab.lines"
            :key="line.id"
            class="console-line"
            :class="`is-${line.stream}`"
          >{{ line.text }}</pre>

          <div v-if="selectedTab.lines.length === 0" class="terminal-empty">
            <p>终端会话已经启动，等待输出。</p>
          </div>
        </template>
      </template>

      <div v-else class="terminal-empty">
        <p v-if="!supportsNativeTerminal">当前环境不支持 Electron 终端链路。</p>
        <p v-else-if="!workspacePath">先打开工作区，再创建终端会话。</p>
        <p v-else>创建一个终端标签后，就可以持续输入命令、查看输出和切换会话。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import type { IDETerminalEvent, IDETerminalSessionMode, IDETerminalStatus, IDETerminalStream } from '@/types'
import { showToast } from '@/utils/toast'

const props = defineProps<{
  workspacePath: string
  activeFilePath: string
  dirtyCount: number
  scripts: Array<{ name: string; command: string }>
}>()

interface TerminalLine {
  id: string
  stream: IDETerminalStream
  text: string
  timestamp: number
}

interface TerminalTabView {
  id: string
  title: string
  cwd: string
  mode: IDETerminalSessionMode
  shell: string
  status: IDETerminalStatus | 'starting'
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  signal?: string | null
  error?: string
  lastCommand?: string
  draftInput: string
  commandHistory: string[]
  historyCursor: number
  pendingViewportChars: number
  pendingViewportChunks: string[]
  lines: TerminalLine[]
}

interface TerminalRuntime {
  terminal: Terminal
  fitAddon: FitAddon
}

const ANSI_ESCAPE_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const MAX_TERMINAL_LINES = 800
const MAX_TERMINAL_TABS = 10
const MAX_PENDING_VIEWPORT_CHARS = 240000

const commandInput = ref('')
const activeTabId = ref('')
const creatingTerminal = ref(false)
const terminalTabs = ref<TerminalTabView[]>([])
const consoleRef = ref<HTMLElement | null>(null)
const ignoredSessionIds = new Set<string>()
const terminalViewportRefs = new Map<string, HTMLDivElement>()
const terminalRuntimes = new Map<string, TerminalRuntime>()

let removeTerminalListener: (() => void) | null = null
let terminalResizeObserver: ResizeObserver | null = null
let observedViewportTabId = ''

function getElectronAPI() {
  return (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI
}

const supportsNativeTerminal = computed(() => {
  const electronAPI = getElectronAPI()
  return Boolean(
    electronAPI
    && typeof electronAPI.ideCreateTerminalSession === 'function'
    && typeof electronAPI.ideWriteTerminalInput === 'function'
    && typeof electronAPI.ideResizeTerminalSession === 'function'
    && typeof electronAPI.ideInterruptTerminalSession === 'function'
    && typeof electronAPI.ideCloseTerminalSession === 'function'
    && typeof electronAPI.ideCancelCommand === 'function'
    && typeof electronAPI.onIdeTerminalEvent === 'function',
  )
})
const supportsTerminalViewport = computed(() => supportsNativeTerminal.value)
const selectedTab = computed(() => terminalTabs.value.find(tab => tab.id === activeTabId.value) ?? terminalTabs.value[0] ?? null)
const canCreateSession = computed(() => {
  const activeSessionCount = terminalTabs.value.filter(tab => tab.status === 'running' || tab.status === 'starting').length
  return Boolean(supportsNativeTerminal.value && props.workspacePath && !creatingTerminal.value && activeSessionCount < MAX_TERMINAL_TABS)
})
const canTypeIntoActiveTab = computed(() => {
  return Boolean(
    supportsNativeTerminal.value
    && props.workspacePath
    && selectedTab.value
    && selectedTab.value.mode === 'shell'
    && selectedTab.value.status === 'running'
    && !creatingTerminal.value,
  )
})
const canSendCommand = computed(() => Boolean(canTypeIntoActiveTab.value && commandInput.value.trim()))
const canStopActiveTab = computed(() => Boolean(selectedTab.value && selectedTab.value.status === 'running'))
const canClearTabs = computed(() => terminalTabs.value.some(tab => tab.status !== 'running' && tab.status !== 'starting'))
const statusLabel = computed(() => {
  if (!supportsNativeTerminal.value) return '当前环境不可用'
  if (creatingTerminal.value) return '正在启动终端'
  if (selectedTab.value?.status === 'failed') return '当前会话执行失败'
  if (selectedTab.value?.status === 'cancelled') return '当前会话已停止'
  if (selectedTab.value?.status === 'running') return selectedTab.value.mode === 'shell' ? '交互终端在线' : '命令执行中'
  return '终端已就绪'
})
const statusTone = computed(() => {
  if (!supportsNativeTerminal.value) return 'blocked'
  if (selectedTab.value?.status === 'failed') return 'failed'
  if (selectedTab.value?.status === 'running' || creatingTerminal.value) return 'running'
  return 'ready'
})
const stopActionLabel = computed(() => {
  if (!selectedTab.value) {
    return '停止'
  }

  return selectedTab.value.mode === 'shell' ? '中断' : '停止'
})

watch(
  () => props.workspacePath,
  async (nextPath, previousPath) => {
    if (nextPath === previousPath) {
      return
    }

    await resetTerminalTabs()

    if (nextPath) {
      void ensureShellTab()
    }
  },
)

watch(activeTabId, async (nextTabId, previousTabId) => {
  const previousTab = previousTabId ? findTab(previousTabId) : null
  if (previousTab) {
    previousTab.draftInput = commandInput.value
  }

  const nextTab = nextTabId ? findTab(nextTabId) : selectedTab.value
  commandInput.value = nextTab?.draftInput ?? ''
  await ensureSelectedTerminalViewport()
})

onMounted(() => {
  const electronAPI = getElectronAPI()
  if (supportsNativeTerminal.value && electronAPI) {
    removeTerminalListener = electronAPI.onIdeTerminalEvent(handleTerminalEvent)
  }

  if (typeof ResizeObserver !== 'undefined') {
    terminalResizeObserver = new ResizeObserver(() => {
      const currentTab = selectedTab.value
      if (currentTab) {
        void syncTerminalViewport(currentTab.id)
      }
    })
  }

  if (props.workspacePath) {
    void ensureShellTab()
  }
})

onBeforeUnmount(() => {
  void resetTerminalTabs()
  removeTerminalListener?.()
  removeTerminalListener = null
  detachObservedViewport()
  terminalResizeObserver?.disconnect()
  terminalResizeObserver = null
  disposeAllTerminalRuntimes()
})

function normalizeChunk(text: string) {
  return text.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function normalizeViewportSystemChunk(text: string) {
  return text.replace(/\r?\n/g, '\r\n')
}

function findTab(sessionId: string) {
  return terminalTabs.value.find(tab => tab.id === sessionId) ?? null
}

function ensureTabSession(payload: {
  sessionId: string
  title: string
  cwd: string
  mode: IDETerminalSessionMode
  shell: string
  timestamp: number
}) {
  let tab = findTab(payload.sessionId)
  if (!tab) {
    tab = {
      id: payload.sessionId,
      title: payload.title,
      cwd: payload.cwd,
      mode: payload.mode,
      shell: payload.shell,
      status: 'starting',
      startedAt: payload.timestamp,
      draftInput: '',
      commandHistory: [],
      historyCursor: 0,
      pendingViewportChars: 0,
      pendingViewportChunks: [],
      lines: [],
    }
    terminalTabs.value.unshift(tab)
    trimTerminalTabs()
  }

  tab.title = payload.title
  tab.cwd = payload.cwd
  tab.mode = payload.mode
  tab.shell = payload.shell
  tab.startedAt = payload.timestamp
  tab.historyCursor = Math.min(tab.historyCursor, tab.commandHistory.length)

  if (!activeTabId.value) {
    activeTabId.value = tab.id
  }

  promoteTab(tab.id)
  return tab
}

function promoteTab(sessionId: string) {
  const index = terminalTabs.value.findIndex(tab => tab.id === sessionId)
  if (index <= 0) {
    return
  }

  const [tab] = terminalTabs.value.splice(index, 1)
  terminalTabs.value.unshift(tab)
}

function trimTerminalTabs() {
  if (terminalTabs.value.length <= MAX_TERMINAL_TABS) {
    return
  }

  const removable = terminalTabs.value
    .map((tab, index) => ({ tab, index }))
    .reverse()
    .find(item => item.tab.status !== 'running' && item.tab.status !== 'starting')

  if (removable) {
    disposeTerminalTabResources(removable.tab.id)
    terminalTabs.value.splice(removable.index, 1)
    return
  }

  const overflowTabs = terminalTabs.value.slice(MAX_TERMINAL_TABS)
  if (overflowTabs.every(tab => tab.status !== 'running' && tab.status !== 'starting')) {
    overflowTabs.forEach(tab => disposeTerminalTabResources(tab.id))
    terminalTabs.value.splice(MAX_TERMINAL_TABS)
  }
}

function appendLine(tab: TerminalTabView, stream: IDETerminalStream, text: string, timestamp: number) {
  const normalized = normalizeChunk(text)
  if (!normalized) {
    return
  }

  tab.lines.push({
    id: `${tab.id}-${tab.lines.length + 1}-${timestamp}`,
    stream,
    text: normalized,
    timestamp,
  })

  if (tab.lines.length > MAX_TERMINAL_LINES) {
    const overflow = tab.lines.length - MAX_TERMINAL_LINES
    tab.lines.splice(0, overflow)
    tab.lines.unshift({
      id: `${tab.id}-truncated-${timestamp}`,
      stream: 'system',
      text: '[system] 早期终端输出已裁剪，避免面板占用过多内存。\n',
      timestamp,
    })
    if (tab.lines.length > MAX_TERMINAL_LINES) {
      tab.lines.splice(1, tab.lines.length - MAX_TERMINAL_LINES)
    }
  }

  if (activeTabId.value === tab.id && !supportsTerminalViewport.value) {
    void scrollConsoleToBottom()
  }
}

function queueViewportChunk(tab: TerminalTabView, chunk: string) {
  if (!chunk) {
    return
  }

  const runtime = terminalRuntimes.get(tab.id)
  if (runtime) {
    runtime.terminal.write(chunk)
    return
  }

  tab.pendingViewportChunks.push(chunk)
  tab.pendingViewportChars += chunk.length

  while (tab.pendingViewportChars > MAX_PENDING_VIEWPORT_CHARS && tab.pendingViewportChunks.length > 0) {
    const removed = tab.pendingViewportChunks.shift()
    tab.pendingViewportChars -= removed?.length ?? 0
  }
}

function flushViewportBacklog(tab: TerminalTabView) {
  if (tab.pendingViewportChunks.length === 0) {
    return
  }

  const runtime = terminalRuntimes.get(tab.id)
  if (!runtime) {
    return
  }

  runtime.terminal.write(tab.pendingViewportChunks.join(''))
  tab.pendingViewportChunks = []
  tab.pendingViewportChars = 0
}

function appendSystemLine(tab: TerminalTabView, text: string) {
  const normalizedText = text.endsWith('\n') ? text : `${text}\n`
  appendLine(tab, 'system', normalizedText, Date.now())
  queueViewportChunk(tab, normalizeViewportSystemChunk(normalizedText))
}

async function scrollConsoleToBottom() {
  await nextTick()
  if (consoleRef.value) {
    consoleRef.value.scrollTop = consoleRef.value.scrollHeight
  }
}

async function ensureShellTab() {
  const existingRunningShell = terminalTabs.value.find(tab => tab.mode === 'shell' && tab.status === 'running')
  if (existingRunningShell) {
    activeTabId.value = existingRunningShell.id
    return existingRunningShell
  }

  return await createShellTab()
}

async function createShellTab() {
  const electronAPI = getElectronAPI()
  if (!supportsNativeTerminal.value || !electronAPI || !props.workspacePath) {
    return null
  }

  const activeSessionCount = terminalTabs.value.filter(tab => tab.status === 'running' || tab.status === 'starting').length
  if (activeSessionCount >= MAX_TERMINAL_TABS) {
    showToast('warning', `最多同时保留 ${MAX_TERMINAL_TABS} 个活动终端，请先关闭不再使用的会话`)
    return null
  }

  creatingTerminal.value = true
  try {
    const session = await electronAPI.ideCreateTerminalSession({
      cwd: props.workspacePath,
      title: `Terminal ${terminalTabs.value.filter(tab => tab.mode === 'shell').length + 1}`,
    })

    const tab = ensureTabSession({
      sessionId: session.sessionId,
      title: session.title,
      cwd: session.cwd,
      mode: session.mode,
      shell: session.shell,
      timestamp: session.startedAt,
    })

    tab.status = 'running'
    activeTabId.value = tab.id
    appendSystemLine(tab, `[system] 已连接交互式终端：${session.shell}`)
    await ensureSelectedTerminalViewport()
    focusTerminalTab(tab.id)
    return tab
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '终端初始化失败')
    return null
  } finally {
    creatingTerminal.value = false
  }
}

async function sendCommandToActiveTab() {
  const normalizedCommand = commandInput.value.trim()
  if (!normalizedCommand) {
    return
  }

  const currentTab = selectedTab.value
  const targetTab = !currentTab || currentTab.mode !== 'shell' || currentTab.status !== 'running'
    ? await ensureShellTab()
    : currentTab

  if (!targetTab) {
    showToast('error', '当前没有可写入的终端会话，请先创建终端')
    return
  }

  const electronAPI = getElectronAPI()
  if (!electronAPI) {
    return
  }

  const wrote = await electronAPI.ideWriteTerminalInput({
    sessionId: targetTab.id,
    input: `${normalizedCommand}\r\n`,
  })

  if (!wrote) {
    showToast('error', '命令发送失败，请重新创建终端会话')
    return
  }

  pushCommandHistory(targetTab, normalizedCommand)
  targetTab.lastCommand = normalizedCommand
  targetTab.draftInput = ''
  commandInput.value = ''
  activeTabId.value = targetTab.id
}

async function runPreset(command: string) {
  commandInput.value = command
  await sendCommandToActiveTab()
}

async function stopActiveTab() {
  const currentTab = selectedTab.value
  if (!currentTab) {
    return
  }

  const electronAPI = getElectronAPI()
  if (!electronAPI) {
    return
  }

  const stopped = currentTab.mode === 'shell'
    ? await electronAPI.ideInterruptTerminalSession(currentTab.id)
    : await electronAPI.ideCancelCommand(currentTab.id)

  if (!stopped) {
    showToast('error', currentTab.mode === 'shell' ? '中断当前命令失败，请稍后重试' : '终止终端失败，请稍后重试')
    return
  }

  appendSystemLine(
    currentTab,
    currentTab.mode === 'shell'
      ? '[system] 已发送中断信号（Ctrl+C），等待前台命令响应...'
      : '[system] 已发送停止请求，等待进程退出...',
  )
}

async function closeTerminalTab(sessionId: string) {
  const tab = findTab(sessionId)
  if (!tab) {
    return
  }

  if (tab.status === 'running') {
    ignoredSessionIds.add(sessionId)
    const electronAPI = getElectronAPI()
    const stopped = tab.mode === 'shell'
      ? await electronAPI?.ideCloseTerminalSession(sessionId)
      : await electronAPI?.ideCancelCommand(sessionId)

    if (!stopped) {
      ignoredSessionIds.delete(sessionId)
      showToast('error', '关闭终端失败，请稍后重试')
      return
    }
  }

  removeTab(sessionId)
}

function disposeTerminalRuntime(sessionId: string) {
  terminalRuntimes.get(sessionId)?.terminal.dispose()
  terminalRuntimes.delete(sessionId)
}

function disposeTerminalTabResources(sessionId: string) {
  if (observedViewportTabId === sessionId) {
    detachObservedViewport()
  }

  terminalViewportRefs.delete(sessionId)
  disposeTerminalRuntime(sessionId)
}

function removeTab(sessionId: string) {
  const currentIndex = terminalTabs.value.findIndex(tab => tab.id === sessionId)
  if (currentIndex === -1) {
    return
  }

  disposeTerminalTabResources(sessionId)
  terminalTabs.value.splice(currentIndex, 1)
  if (activeTabId.value === sessionId) {
    activeTabId.value = terminalTabs.value[currentIndex]?.id || terminalTabs.value[currentIndex - 1]?.id || terminalTabs.value[0]?.id || ''
  }
}

async function resetTerminalTabs() {
  const sessionIds = terminalTabs.value
    .filter(tab => tab.status === 'running')
    .map(tab => tab.id)

  for (const sessionId of sessionIds) {
    ignoredSessionIds.add(sessionId)
    const tab = findTab(sessionId)
    const electronAPI = getElectronAPI()
    if (tab?.mode === 'shell') {
      await electronAPI?.ideCloseTerminalSession(sessionId)
    } else {
      await electronAPI?.ideCancelCommand(sessionId)
    }
  }

  detachObservedViewport()
  disposeAllTerminalRuntimes()
  terminalViewportRefs.clear()
  terminalTabs.value = []
  activeTabId.value = ''
  commandInput.value = ''
}

function clearClosedTabs() {
  const removedTabs = terminalTabs.value.filter(tab => tab.status !== 'running' && tab.status !== 'starting')
  removedTabs.forEach(tab => disposeTerminalTabResources(tab.id))

  const runningIds = new Set(
    terminalTabs.value
      .filter(tab => tab.status === 'running' || tab.status === 'starting')
      .map(tab => tab.id),
  )

  terminalTabs.value = terminalTabs.value.filter(tab => runningIds.has(tab.id))
  if (!activeTabId.value || !runningIds.has(activeTabId.value)) {
    activeTabId.value = terminalTabs.value[0]?.id || ''
  }
}

function handleCommandInput() {
  if (!selectedTab.value) {
    return
  }

  selectedTab.value.draftInput = commandInput.value
  selectedTab.value.historyCursor = selectedTab.value.commandHistory.length
}

function pushCommandHistory(tab: TerminalTabView, command: string) {
  const lastCommand = tab.commandHistory[tab.commandHistory.length - 1]
  if (lastCommand !== command) {
    tab.commandHistory.push(command)
    if (tab.commandHistory.length > 50) {
      tab.commandHistory.splice(0, tab.commandHistory.length - 50)
    }
  }

  tab.historyCursor = tab.commandHistory.length
}

function navigateCommandHistory(direction: 'up' | 'down') {
  const tab = selectedTab.value
  if (!tab || tab.mode !== 'shell' || tab.commandHistory.length === 0) {
    return
  }

  if (direction === 'up') {
    if (tab.historyCursor === tab.commandHistory.length) {
      tab.draftInput = commandInput.value
    }
    tab.historyCursor = Math.max(tab.historyCursor - 1, 0)
    commandInput.value = tab.commandHistory[tab.historyCursor] || ''
    return
  }

  if (tab.historyCursor >= tab.commandHistory.length - 1) {
    tab.historyCursor = tab.commandHistory.length
    commandInput.value = tab.draftInput
    return
  }

  tab.historyCursor += 1
  commandInput.value = tab.commandHistory[tab.historyCursor] || ''
}

async function copySelectedOutput() {
  if (!selectedTab.value) {
    return
  }

  const content = selectedTab.value.lines.map(line => line.text).join('')
  if (!content) {
    return
  }

  try {
    await navigator.clipboard.writeText(content)
    showToast('success', '终端输出已复制')
  } catch {
    showToast('error', '复制终端输出失败')
  }
}

function handleTerminalEvent(event: IDETerminalEvent) {
  if (ignoredSessionIds.has(event.sessionId)) {
    if (event.type === 'exit' || event.type === 'error') {
      ignoredSessionIds.delete(event.sessionId)
    }
    return
  }

  const tab = ensureTabSession({
    sessionId: event.sessionId,
    title: event.title || event.command,
    cwd: event.cwd,
    mode: event.mode || 'command',
    shell: event.shell || 'shell',
    timestamp: event.timestamp,
  })

  if (event.type === 'start') {
    tab.status = 'running'
    tab.error = undefined
    return
  }

  if (event.type === 'data' && event.chunk) {
    appendLine(tab, event.stream || 'stdout', event.chunk, event.timestamp)
    queueViewportChunk(tab, event.chunk)
    return
  }

  tab.finishedAt = event.timestamp
  tab.exitCode = typeof event.exitCode === 'number' ? event.exitCode : null
  tab.signal = event.signal ?? null

  if (event.type === 'error') {
    tab.status = event.status || 'failed'
    tab.error = event.error || '终端执行失败'
    appendSystemLine(tab, `[system] ${tab.error}`)
    return
  }

  tab.status = event.status || 'completed'
  if (tab.status === 'completed') {
    appendSystemLine(tab, `[system] 会话已结束，exit ${tab.exitCode ?? 0}`)
  } else if (tab.status === 'cancelled') {
    appendSystemLine(tab, '[system] 会话已停止')
  } else {
    appendSystemLine(tab, `[system] 会话异常结束，exit ${tab.exitCode ?? 'unknown'}`)
  }
}

function buildTerminalRuntime(sessionId: string) {
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.45,
    scrollback: 3000,
    allowTransparency: true,
    theme: {
      background: '#0b1220',
      foreground: '#f8fafc',
      cursor: '#e2e8f0',
      selectionBackground: 'rgba(147, 197, 253, 0.28)',
      black: '#0f172a',
      red: '#fca5a5',
      green: '#86efac',
      yellow: '#fde68a',
      blue: '#93c5fd',
      magenta: '#f0abfc',
      cyan: '#67e8f9',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#fda4af',
      brightGreen: '#bbf7d0',
      brightYellow: '#fef3c7',
      brightBlue: '#bfdbfe',
      brightMagenta: '#f5d0fe',
      brightCyan: '#a5f3fc',
      brightWhite: '#ffffff',
    },
  })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // 直接透传键盘输入，才能覆盖 vim、top 这类依赖原始按键流的交互。
  terminal.onData(data => {
    const electronAPI = getElectronAPI()
    const tab = findTab(sessionId)
    if (!electronAPI || !tab || tab.mode !== 'shell' || tab.status !== 'running') {
      return
    }

    void electronAPI.ideWriteTerminalInput({
      sessionId,
      input: data,
    })
  })

  return {
    terminal,
    fitAddon,
  }
}

function setTerminalViewportRef(sessionId: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLDivElement) {
    terminalViewportRefs.set(sessionId, element)
    if (sessionId === activeTabId.value) {
      void ensureSelectedTerminalViewport()
    }
    return
  }

  if (observedViewportTabId === sessionId) {
    detachObservedViewport()
  }

  terminalViewportRefs.delete(sessionId)
}

async function ensureSelectedTerminalViewport() {
  const currentTab = selectedTab.value
  if (!currentTab || !supportsTerminalViewport.value) {
    detachObservedViewport()
    return
  }

  await nextTick()
  const viewport = terminalViewportRefs.get(currentTab.id)
  if (!viewport) {
    return
  }

  let runtime = terminalRuntimes.get(currentTab.id)
  if (!runtime) {
    runtime = buildTerminalRuntime(currentTab.id)
    runtime.terminal.open(viewport)
    terminalRuntimes.set(currentTab.id, runtime)
    flushViewportBacklog(currentTab)
  }

  observeViewport(currentTab.id)
  await syncTerminalViewport(currentTab.id)
}

function observeViewport(sessionId: string) {
  if (!terminalResizeObserver) {
    return
  }

  const viewport = terminalViewportRefs.get(sessionId)
  if (!viewport) {
    detachObservedViewport()
    return
  }

  if (observedViewportTabId && observedViewportTabId !== sessionId) {
    const previousViewport = terminalViewportRefs.get(observedViewportTabId)
    if (previousViewport) {
      terminalResizeObserver.unobserve(previousViewport)
    }
  }

  terminalResizeObserver.observe(viewport)
  observedViewportTabId = sessionId
}

function detachObservedViewport() {
  if (!terminalResizeObserver || !observedViewportTabId) {
    observedViewportTabId = ''
    return
  }

  const viewport = terminalViewportRefs.get(observedViewportTabId)
  if (viewport) {
    terminalResizeObserver.unobserve(viewport)
  }

  observedViewportTabId = ''
}

async function syncTerminalViewport(sessionId: string) {
  const runtime = terminalRuntimes.get(sessionId)
  if (!runtime) {
    return
  }

  await nextTick()

  try {
    runtime.fitAddon.fit()
  } catch {
    return
  }

  const tab = findTab(sessionId)
  if (!tab || tab.mode !== 'shell' || tab.status !== 'running') {
    return
  }

  const electronAPI = getElectronAPI()
  if (!electronAPI?.ideResizeTerminalSession || runtime.terminal.cols <= 0 || runtime.terminal.rows <= 0) {
    return
  }

  await electronAPI.ideResizeTerminalSession({
    sessionId,
    cols: runtime.terminal.cols,
    rows: runtime.terminal.rows,
  })
}

function focusTerminalTab(sessionId: string) {
  terminalRuntimes.get(sessionId)?.terminal.focus()
}

function focusActiveTerminal() {
  const currentTab = selectedTab.value
  if (!currentTab) {
    return
  }

  focusTerminalTab(currentTab.id)
}

function disposeAllTerminalRuntimes() {
  terminalRuntimes.forEach(runtime => runtime.terminal.dispose())
  terminalRuntimes.clear()
}

function formatTabMeta(tab: TerminalTabView) {
  const suffix = tab.mode === 'shell'
    ? tab.status === 'running'
      ? '交互'
      : '已结束'
    : tab.status === 'running'
      ? '执行中'
      : `exit ${tab.exitCode ?? 'unknown'}`

  return `${tab.shell} · ${suffix}`
}

function formatSessionState(tab: TerminalTabView) {
  const duration = tab.finishedAt
    ? ` · ${(Math.max(tab.finishedAt - tab.startedAt, 0) / 1000).toFixed(1)}s`
    : ''

  if (tab.status === 'running' || tab.status === 'starting') {
    return tab.mode === 'shell'
      ? `交互终端在线${duration}`
      : `命令执行中${duration}`
  }

  if (tab.status === 'completed') {
    return `已完成 · exit ${tab.exitCode ?? 0}${duration}`
  }

  if (tab.status === 'cancelled') {
    return `已停止${duration}`
  }

  return `执行失败 · exit ${tab.exitCode ?? 'unknown'}${duration}`
}
</script>

<style lang="scss" scoped>
.ide-terminal {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  min-height: 320px;
  padding: $spacing-md;
}

.terminal-head,
.terminal-summary,
.terminal-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.terminal-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.terminal-status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: $font-xs;
  font-weight: 700;

  &.is-ready {
    background: rgba(35, 153, 90, 0.14);
    color: #1d7f4e;
  }

  &.is-running {
    background: rgba(34, 109, 246, 0.14);
    color: #1e5cf0;
  }

  &.is-failed,
  &.is-blocked {
    background: rgba(201, 53, 44, 0.12);
    color: #b7352b;
  }
}

.terminal-summary,
.terminal-hint,
.summary-chip,
.tab-copy small,
.script-chip span {
  color: var(--text-muted);
  font-size: $font-xs;
}

.terminal-hint {
  line-height: 1.6;
}

.summary-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-tab-strip,
.command-actions,
.tab-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
}

.terminal-tab-strip {
  overflow-x: auto;
  padding-bottom: 2px;
}

.terminal-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-xs;
  min-width: 220px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.5);
  color: var(--text-primary);
  text-align: left;
  transition: transform $transition-fast, border-color $transition-fast, background $transition-fast;

  &.active {
    border-color: var(--border-active);
    background: rgba(58, 96, 255, 0.08);
    transform: translateY(-1px);
  }
}

.tab-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;

  strong,
  small,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tab-action,
.script-chip,
.command-input input {
  font-family: 'Cascadia Code', 'Consolas', monospace;
}

.tab-action {
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-secondary);
  font-size: $font-xs;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.terminal-controls {
  align-items: flex-end;
}

.command-input {
  display: flex;
  flex: 1;
  min-width: 260px;
  flex-direction: column;
  gap: 6px;

  span {
    color: var(--text-muted);
    font-size: $font-xs;
    font-weight: 700;
  }

  input {
    width: 100%;
    min-height: 40px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: $border-radius-sm;
    background: rgba(255, 255, 255, 0.72);
    color: var(--text-primary);
    font-size: $font-sm;

    &:focus {
      border-color: var(--border-active);
      outline: none;
      box-shadow: 0 0 0 3px rgba(58, 96, 255, 0.12);
    }
  }
}

.terminal-script-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: $spacing-sm;
}

.script-chip {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.5);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, background $transition-fast;

  &:hover:enabled {
    transform: translateY(-1px);
    border-color: var(--border-active);
    background: rgba(255, 255, 255, 0.72);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.terminal-console {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  max-height: 360px;
  overflow: hidden;
  padding: $spacing-md;
  border-radius: $border-radius-sm;
  background:
    linear-gradient(180deg, rgba(10, 15, 26, 0.96), rgba(14, 20, 35, 0.98)),
    radial-gradient(circle at top right, rgba(72, 149, 239, 0.18), transparent 38%);
  color: #f8fafc;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.terminal-console--empty,
.terminal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-empty {
  min-height: 160px;
  text-align: center;
  color: rgba(226, 232, 240, 0.76);

  p {
    max-width: 420px;
    line-height: 1.8;
  }
}

.console-headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
  padding-bottom: $spacing-sm;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);

  strong {
    display: block;
    margin-bottom: 4px;
  }

  p {
    color: rgba(226, 232, 240, 0.72);
    font-size: 12px;
  }

  span {
    color: rgba(191, 219, 254, 0.92);
    font-size: 12px;
    white-space: nowrap;
  }
}

.terminal-viewport-stack,
.terminal-viewport-pane,
.terminal-viewport {
  min-height: 0;
  flex: 1;
  height: 100%;
}

.terminal-viewport-stack {
  display: flex;
  flex: 1;
  min-height: 0;
}

.terminal-viewport-pane {
  display: flex;
  flex: 1;
}

.terminal-viewport {
  min-height: 240px;
  cursor: text;
}

.console-line {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;

  &.is-stdout {
    color: #f8fafc;
  }

  &.is-stderr {
    color: #fca5a5;
  }

  &.is-system {
    color: #93c5fd;
  }
}

:deep(.xterm) {
  height: 100%;
}

:deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:deep(.xterm-screen) {
  width: 100% !important;
}

@media (max-width: 960px) {
  .terminal-tab {
    min-width: 180px;
  }

  .terminal-console {
    max-height: 320px;
  }
}
</style>
