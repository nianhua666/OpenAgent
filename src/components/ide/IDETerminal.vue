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
          @keydown.enter.exact.prevent="sendCommandToActiveTab"
        />
      </label>

      <div class="command-actions">
        <button class="btn btn-primary btn-sm" :disabled="!canSendCommand" @click="sendCommandToActiveTab">发送</button>
        <button class="btn btn-secondary btn-sm" :disabled="!canStopActiveTab" @click="stopActiveTab">停止</button>
        <button class="btn btn-ghost btn-sm" :disabled="!selectedTab || selectedTab.lines.length === 0" @click="copySelectedOutput">复制输出</button>
        <button class="btn btn-ghost btn-sm" :disabled="!canClearTabs" @click="clearClosedTabs">清理已结束</button>
      </div>
    </div>

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

    <div ref="consoleRef" class="terminal-console" :class="{ 'terminal-console--empty': !selectedTab }">
      <template v-if="selectedTab">
        <div class="console-headline">
          <div>
            <strong>{{ selectedTab.title }}</strong>
            <p>{{ selectedTab.cwd }}</p>
          </div>
          <span>{{ formatSessionState(selectedTab) }}</span>
        </div>

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

      <div v-else class="terminal-empty">
        <p v-if="!supportsNativeTerminal">当前环境不支持 Electron 终端链路。</p>
        <p v-else-if="!workspacePath">先打开工作区，再创建终端会话。</p>
        <p v-else>创建一个终端标签后，就可以持续输入命令、查看输出和切换会话。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { IDETerminalEvent, IDETerminalSessionInfo, IDETerminalSessionMode, IDETerminalStatus, IDETerminalStream } from '@/types'
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
  lines: TerminalLine[]
}

const ANSI_ESCAPE_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const MAX_TERMINAL_LINES = 800
const MAX_TERMINAL_TABS = 10

const commandInput = ref('')
const activeTabId = ref('')
const creatingTerminal = ref(false)
const terminalTabs = ref<TerminalTabView[]>([])
const consoleRef = ref<HTMLElement | null>(null)
const ignoredSessionIds = new Set<string>()

function getElectronAPI() {
  return (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI
}

const supportsNativeTerminal = computed(() => {
  const electronAPI = getElectronAPI()
  return Boolean(
    electronAPI
    && typeof electronAPI.ideCreateTerminalSession === 'function'
    && typeof electronAPI.ideWriteTerminalInput === 'function'
    && typeof electronAPI.ideCloseTerminalSession === 'function'
    && typeof electronAPI.ideCancelCommand === 'function'
    && typeof electronAPI.onIdeTerminalEvent === 'function'
  )
})
const selectedTab = computed(() => terminalTabs.value.find(tab => tab.id === activeTabId.value) ?? terminalTabs.value[0] ?? null)
const canCreateSession = computed(() => Boolean(supportsNativeTerminal.value && props.workspacePath && !creatingTerminal.value))
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

let removeTerminalListener: (() => void) | null = null

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

onMounted(() => {
  const electronAPI = getElectronAPI()
  if (supportsNativeTerminal.value && electronAPI) {
    removeTerminalListener = electronAPI.onIdeTerminalEvent(handleTerminalEvent)
  }

  if (props.workspacePath) {
    void ensureShellTab()
  }
})

onBeforeUnmount(() => {
  void resetTerminalTabs()
  removeTerminalListener?.()
  removeTerminalListener = null
})

function normalizeChunk(text: string) {
  return text.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
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
    terminalTabs.value.splice(removable.index, 1)
    return
  }

  terminalTabs.value.splice(MAX_TERMINAL_TABS)
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

  if (activeTabId.value === tab.id) {
    void scrollConsoleToBottom()
  }
}

function appendSystemLine(tab: TerminalTabView, text: string) {
  appendLine(tab, 'system', text.endsWith('\n') ? text : `${text}\n`, Date.now())
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

  targetTab.lastCommand = normalizedCommand
  appendSystemLine(targetTab, `$ ${normalizedCommand}`)
  commandInput.value = ''
  activeTabId.value = targetTab.id
}

async function runPreset(command: string) {
  commandInput.value = command
  await sendCommandToActiveTab()
}

async function stopActiveTab() {
  if (!selectedTab.value) {
    return
  }

  const electronAPI = getElectronAPI()
  if (!electronAPI) {
    return
  }

  const stopped = selectedTab.value.mode === 'shell'
    ? await electronAPI.ideCloseTerminalSession(selectedTab.value.id)
    : await electronAPI.ideCancelCommand(selectedTab.value.id)

  if (!stopped) {
    showToast('error', '终止终端失败，请稍后重试')
    return
  }

  appendSystemLine(selectedTab.value, '[system] 已发送停止请求，等待进程退出...')
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

function removeTab(sessionId: string) {
  const currentIndex = terminalTabs.value.findIndex(tab => tab.id === sessionId)
  if (currentIndex === -1) {
    return
  }

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

  terminalTabs.value = []
  activeTabId.value = ''
  commandInput.value = ''
}

function clearClosedTabs() {
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

.terminal-summary {
  color: var(--text-muted);
  font-size: $font-xs;
}

.summary-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-tab-strip {
  display: flex;
  gap: $spacing-xs;
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
  text-align: left;
  color: var(--text-primary);
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
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--text-muted);
  }
}

.tab-actions {
  display: flex;
  align-items: center;
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
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: $font-sm;

    &:focus {
      border-color: var(--border-active);
      outline: none;
      box-shadow: 0 0 0 3px rgba(58, 96, 255, 0.12);
    }
  }
}

.command-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  flex-wrap: wrap;
}

.terminal-script-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: $spacing-sm;
}

.script-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
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

  strong,
  span {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--text-muted);
    font-size: $font-xs;
  }
}

.terminal-console {
  min-height: 240px;
  max-height: 360px;
  overflow: auto;
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

.terminal-console--empty {
  display: flex;
  align-items: center;
  justify-content: center;
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

.terminal-empty {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: rgba(226, 232, 240, 0.76);

  p {
    max-width: 420px;
    line-height: 1.8;
  }
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
