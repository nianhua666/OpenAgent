<template>
  <section class="ide-terminal glass-panel">
    <div class="terminal-head">
      <div>
        <p class="terminal-eyebrow">Workspace Shell</p>
        <h3>终端面板</h3>
      </div>
      <span class="terminal-status" :class="`is-${statusTone}`">{{ statusLabel }}</span>
    </div>

    <div class="terminal-summary">
      <span class="summary-chip">工作区：{{ workspacePath || '未打开' }}</span>
      <span class="summary-chip">当前文件：{{ activeFilePath || '未选择' }}</span>
      <span class="summary-chip">待保存：{{ dirtyCount }}</span>
    </div>

    <div class="terminal-controls">
      <label class="command-input">
        <span>命令</span>
        <input
          v-model="commandInput"
          type="text"
          placeholder="例如 npm run build"
          :disabled="!supportsNativeTerminal || !workspacePath || isLaunching"
          @keydown.enter.exact.prevent="runCustomCommand"
        />
      </label>

      <div class="command-actions">
        <button class="btn btn-primary btn-sm" :disabled="!canRunCommand" @click="runCustomCommand">运行</button>
        <button class="btn btn-secondary btn-sm" :disabled="!runningSession" @click="stopRunningCommand()">停止</button>
        <button class="btn btn-ghost btn-sm" :disabled="!selectedSession || selectedSession.lines.length === 0" @click="copySelectedOutput">复制输出</button>
        <button class="btn btn-ghost btn-sm" :disabled="!terminalSessions.length || Boolean(runningSession)" @click="clearTerminalHistory">清空</button>
      </div>
    </div>

    <div v-if="scripts.length > 0" class="terminal-script-list">
      <button
        v-for="script in scripts"
        :key="script.name"
        class="script-chip"
        :disabled="!supportsNativeTerminal || !workspacePath || isLaunching || Boolean(runningSession)"
        @click="runPreset(script.command)"
      >
        <strong>{{ script.name }}</strong>
        <span>{{ script.command }}</span>
      </button>
    </div>

    <div v-if="terminalSessions.length > 0" class="terminal-session-list">
      <button
        v-for="session in terminalSessions"
        :key="session.id"
        class="session-chip"
        :class="{ active: session.id === selectedSessionId }"
        @click="selectedSessionId = session.id"
      >
        <strong>{{ session.command }}</strong>
        <span>{{ formatSessionMeta(session) }}</span>
      </button>
    </div>

    <div ref="consoleRef" class="terminal-console" :class="{ 'terminal-console--empty': !selectedSession }">
      <template v-if="selectedSession">
        <div class="console-headline">
          <strong>{{ selectedSession.command }}</strong>
          <span>{{ formatSessionState(selectedSession) }}</span>
        </div>

        <pre
          v-for="line in selectedSession.lines"
          :key="line.id"
          class="console-line"
          :class="`is-${line.stream}`"
        >{{ line.text }}</pre>

        <div v-if="selectedSession.lines.length === 0" class="terminal-empty">
          <p>命令已启动，但暂时还没有输出。</p>
        </div>
      </template>

      <div v-else class="terminal-empty">
        <p v-if="!supportsNativeTerminal">当前环境不支持 Electron 终端执行链路。</p>
        <p v-else-if="!workspacePath">先打开工作区，再运行脚本或自定义命令。</p>
        <p v-else>可以直接运行 `package.json` scripts，也可以输入任意 shell 命令。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { IDETerminalEvent, IDETerminalStatus, IDETerminalStream } from '@/types'
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

interface TerminalSessionView {
  id: string
  command: string
  cwd: string
  status: IDETerminalStatus | 'starting'
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  signal?: string | null
  error?: string
  lines: TerminalLine[]
}

const ANSI_ESCAPE_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const MAX_TERMINAL_LINES = 400
const MAX_TERMINAL_SESSIONS = 8

const commandInput = ref('')
const isLaunching = ref(false)
const terminalSessions = ref<TerminalSessionView[]>([])
const selectedSessionId = ref('')
const consoleRef = ref<HTMLElement | null>(null)
const ignoredSessionIds = new Set<string>()

function getElectronAPI() {
  return (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI
}

const supportsNativeTerminal = computed(() => {
  const electronAPI = getElectronAPI()
  return Boolean(
    electronAPI
    && typeof electronAPI.ideRunCommand === 'function'
    && typeof electronAPI.ideCancelCommand === 'function'
    && typeof electronAPI.onIdeTerminalEvent === 'function'
  )
})
const runningSession = computed(() => terminalSessions.value.find(session => session.status === 'starting' || session.status === 'running') ?? null)
const selectedSession = computed(() => {
  return terminalSessions.value.find(session => session.id === selectedSessionId.value) ?? terminalSessions.value[0] ?? null
})
const canRunCommand = computed(() => {
  return Boolean(props.workspacePath && commandInput.value.trim() && supportsNativeTerminal.value && !isLaunching.value && !runningSession.value)
})
const statusLabel = computed(() => {
  if (!supportsNativeTerminal.value) {
    return '当前环境不可用'
  }

  if (runningSession.value) {
    return '命令执行中'
  }

  if (selectedSession.value?.status === 'failed') {
    return '最近一次执行失败'
  }

  if (selectedSession.value?.status === 'cancelled') {
    return '最近一次已取消'
  }

  return '真实 shell 已接入'
})
const statusTone = computed(() => {
  if (!supportsNativeTerminal.value) return 'blocked'
  if (runningSession.value) return 'running'
  if (selectedSession.value?.status === 'failed') return 'failed'
  return 'ready'
})

let removeTerminalListener: (() => void) | null = null

watch(
  () => props.workspacePath,
  async (nextPath, previousPath) => {
    if (nextPath === previousPath) {
      return
    }

    if (runningSession.value) {
      ignoredSessionIds.add(runningSession.value.id)
      await stopRunningCommand(false)
    }

    terminalSessions.value = []
    selectedSessionId.value = ''
    commandInput.value = ''
  },
)

const electronAPI = getElectronAPI()
if (supportsNativeTerminal.value && electronAPI) {
  removeTerminalListener = electronAPI.onIdeTerminalEvent(handleTerminalEvent)
}

onBeforeUnmount(() => {
  if (runningSession.value) {
    ignoredSessionIds.add(runningSession.value.id)
    void stopRunningCommand(false)
  }

  removeTerminalListener?.()
  removeTerminalListener = null
})

function normalizeChunk(text: string) {
  return text.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function findSession(sessionId: string) {
  return terminalSessions.value.find(session => session.id === sessionId) ?? null
}

function ensureSession(payload: {
  sessionId: string
  command: string
  cwd: string
  timestamp: number
}) {
  let session = findSession(payload.sessionId)
  if (!session) {
    session = {
      id: payload.sessionId,
      command: payload.command,
      cwd: payload.cwd,
      status: 'starting',
      startedAt: payload.timestamp,
      lines: [],
    }
    terminalSessions.value.unshift(session)
    if (!selectedSessionId.value) {
      selectedSessionId.value = session.id
    }
  }

  session.command = payload.command
  session.cwd = payload.cwd
  session.startedAt = payload.timestamp
  promoteSession(session.id)
  trimSessionHistory()
  return session
}

function promoteSession(sessionId: string) {
  const index = terminalSessions.value.findIndex(session => session.id === sessionId)
  if (index <= 0) {
    return
  }

  const [session] = terminalSessions.value.splice(index, 1)
  terminalSessions.value.unshift(session)
}

function trimSessionHistory() {
  if (terminalSessions.value.length <= MAX_TERMINAL_SESSIONS) {
    return
  }

  terminalSessions.value.splice(MAX_TERMINAL_SESSIONS)
}

function appendLine(session: TerminalSessionView, stream: IDETerminalStream, text: string, timestamp: number) {
  const normalized = normalizeChunk(text)
  if (!normalized) {
    return
  }

  session.lines.push({
    id: `${session.id}-${session.lines.length + 1}-${timestamp}`,
    stream,
    text: normalized,
    timestamp,
  })

  if (session.lines.length > MAX_TERMINAL_LINES) {
    const overflow = session.lines.length - MAX_TERMINAL_LINES
    session.lines.splice(0, overflow)
    session.lines.unshift({
      id: `${session.id}-truncated-${timestamp}`,
      stream: 'system',
      text: '[system] 早期终端输出已裁剪，避免面板占用过多内存。',
      timestamp,
    })
    if (session.lines.length > MAX_TERMINAL_LINES) {
      session.lines.splice(1, session.lines.length - MAX_TERMINAL_LINES)
    }
  }

  if (selectedSessionId.value === session.id) {
    void scrollConsoleToBottom()
  }
}

function appendSystemLine(session: TerminalSessionView, text: string) {
  appendLine(session, 'system', text, Date.now())
}

async function scrollConsoleToBottom() {
  await nextTick()
  if (consoleRef.value) {
    consoleRef.value.scrollTop = consoleRef.value.scrollHeight
  }
}

function handleTerminalEvent(event: IDETerminalEvent) {
  if (ignoredSessionIds.has(event.sessionId)) {
    if (event.type === 'exit' || event.type === 'error') {
      ignoredSessionIds.delete(event.sessionId)
    }
    return
  }

  const session = ensureSession({
    sessionId: event.sessionId,
    command: event.command,
    cwd: event.cwd,
    timestamp: event.timestamp,
  })

  if (!selectedSessionId.value) {
    selectedSessionId.value = session.id
  }

  if (event.type === 'start') {
    session.status = 'running'
    session.error = undefined
    appendSystemLine(session, `[system] 已启动命令：${event.command}`)
    return
  }

  if (event.type === 'data' && event.chunk) {
    appendLine(session, event.stream || 'stdout', event.chunk, event.timestamp)
    return
  }

  session.finishedAt = event.timestamp
  session.exitCode = typeof event.exitCode === 'number' ? event.exitCode : null
  session.signal = event.signal ?? null

  if (event.type === 'error') {
    session.status = event.status || 'failed'
    session.error = event.error || '终端执行失败'
    appendSystemLine(session, `[system] ${session.error}`)
    showToast('error', session.error)
    return
  }

  session.status = event.status || 'completed'
  if (session.status === 'completed') {
    appendSystemLine(session, `[system] 命令执行完成，退出码 ${session.exitCode ?? 0}`)
  } else if (session.status === 'cancelled') {
    appendSystemLine(session, '[system] 命令已取消')
  } else {
    appendSystemLine(session, `[system] 命令执行失败，退出码 ${session.exitCode ?? 'unknown'}`)
  }
}

async function executeCommand(command: string) {
  const electronAPI = getElectronAPI()
  if (!supportsNativeTerminal.value || !electronAPI) {
    showToast('error', '当前环境不支持真实终端执行')
    return
  }

  const normalizedCommand = command.trim()
  if (!normalizedCommand || !props.workspacePath) {
    return
  }

  isLaunching.value = true
  try {
    const result = await electronAPI.ideRunCommand({
      command: normalizedCommand,
      cwd: props.workspacePath,
    })

    const session = ensureSession({
      sessionId: result.sessionId,
      command: result.command,
      cwd: result.cwd,
      timestamp: result.startedAt,
    })

    session.status = 'running'
    selectedSessionId.value = session.id
    commandInput.value = normalizedCommand
    await scrollConsoleToBottom()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '终端命令启动失败')
  } finally {
    isLaunching.value = false
  }
}

async function runCustomCommand() {
  await executeCommand(commandInput.value)
}

async function runPreset(command: string) {
  commandInput.value = command
  await executeCommand(command)
}

async function stopRunningCommand(notify = true) {
  const electronAPI = getElectronAPI()
  if (!runningSession.value || !electronAPI) {
    return
  }

  const session = runningSession.value
  const cancelled = await electronAPI.ideCancelCommand(session.id)
  if (!cancelled) {
    showToast('error', '终止命令失败，请稍后重试')
    return
  }

  appendSystemLine(session, '[system] 已发送终止请求，等待进程退出...')
  if (notify) {
    showToast('info', '已请求停止当前终端命令')
  }
}

async function copySelectedOutput() {
  if (!selectedSession.value) {
    return
  }

  const text = selectedSession.value.lines.map(line => line.text).join('')
  if (!text) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    showToast('success', '终端输出已复制')
  } catch {
    showToast('error', '复制终端输出失败')
  }
}

function clearTerminalHistory() {
  terminalSessions.value = []
  selectedSessionId.value = ''
}

function formatSessionMeta(session: TerminalSessionView) {
  const exitSummary = session.status === 'running' || session.status === 'starting'
    ? '运行中'
    : session.status === 'completed'
      ? `退出 ${session.exitCode ?? 0}`
      : session.status === 'cancelled'
        ? '已取消'
        : `失败 ${session.exitCode ?? 'unknown'}`

  return `${new Date(session.startedAt).toLocaleTimeString()} · ${exitSummary}`
}

function formatSessionState(session: TerminalSessionView) {
  const duration = session.finishedAt
    ? ` · ${(Math.max(session.finishedAt - session.startedAt, 0) / 1000).toFixed(1)}s`
    : ''

  if (session.status === 'running' || session.status === 'starting') {
    return `执行中${duration}`
  }

  if (session.status === 'completed') {
    return `已完成 · exit ${session.exitCode ?? 0}${duration}`
  }

  if (session.status === 'cancelled') {
    return `已取消${duration}`
  }

  return `执行失败 · exit ${session.exitCode ?? 'unknown'}${duration}`
}
</script>

<style lang="scss" scoped>
.ide-terminal {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  min-height: 280px;
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

.terminal-script-list,
.terminal-session-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: $spacing-sm;
}

.script-chip,
.session-chip {
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

  strong,
  span {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: $font-sm;
  }

  span {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: $font-xs;
    color: var(--text-secondary);
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--border-active);
    background: rgba(255, 255, 255, 0.8);
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
}

.session-chip.active {
  border-color: rgba(34, 109, 246, 0.4);
  background: rgba(34, 109, 246, 0.08);
}

.terminal-console {
  display: flex;
  min-height: 220px;
  max-height: 360px;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  border: 1px solid rgba(14, 20, 32, 0.3);
  border-radius: $border-radius-md;
  background:
    linear-gradient(180deg, rgba(17, 23, 35, 0.98), rgba(9, 13, 21, 0.98)),
    radial-gradient(circle at top right, rgba(53, 103, 255, 0.16), transparent 32%);
  padding: 12px;
  color: #dbe5ff;
  font-family: 'Cascadia Code', 'Consolas', monospace;

  &--empty {
    justify-content: center;
  }
}

.console-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(219, 229, 255, 0.12);
  color: #f7f9ff;
  font-size: $font-xs;
}

.console-line {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: $font-xs;

  &.is-stdout {
    color: #dbe5ff;
  }

  &.is-stderr {
    color: #ffb0a8;
  }

  &.is-system {
    color: #9ec2ff;
  }
}

.terminal-empty {
  color: rgba(219, 229, 255, 0.76);
  line-height: 1.7;
}

@media (max-width: 960px) {
  .terminal-controls {
    align-items: stretch;
  }

  .command-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .terminal-console {
    max-height: 300px;
  }
}
</style>
