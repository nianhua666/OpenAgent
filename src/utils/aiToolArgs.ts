import type { AITaskStep } from '@/types'

interface ToolArgumentParseResult {
  rawText: string
  normalizedText: string
  value: unknown
  objectValue: Record<string, unknown> | null
}

const WRAPPER_KEYS = new Set(['arguments', 'args', 'input', 'params', 'parameters', 'payload', 'data'])
const SEARCH_CONTAINER_KEYS = ['target', 'window', 'options', 'payload', 'data']
const APP_PATH_ALIASES: Array<{ path: string; patterns: RegExp[] }> = [
  { path: '/accounts', patterns: [/^\/?accounts$/i, /^\/?dashboard$/i, /首页|账号管理|仪表盘|概览|总览/] },
  { path: '/types', patterns: [/^\/?types$/i, /账号类型|类型管理|类型页|类型列表/] },
  { path: '/import', patterns: [/^\/?import$/i, /导入|批量导入/] },
  { path: '/export', patterns: [/^\/?export$/i, /导出|批量导出/] },
  { path: '/records', patterns: [/^\/?records$/i, /记录|流水|明细|历史记录/] },
  { path: '/settings', patterns: [/^\/?settings$/i, /设置|配置|偏好/] },
  { path: '/ai-settings', patterns: [/^\/?ai-settings$/i, /ai设置|模型设置|托管mcp|托管skill|mcp设置/] },
  { path: '/ai', patterns: [/^\/?ai$/i, /ai|助手|智能助理/] },
  { path: '/data', patterns: [/^\/?data$/i, /数据管理|数据页|数据面板/] }
]
const KEY_COMBO_PATTERN = /^(?:ctrl|control|alt|shift|enter|tab|escape|esc|backspace|delete|up|down|left|right|home|end|pageup|pagedown|f\d{1,2}|space)(?:\s*\+\s*(?:ctrl|control|alt|shift|enter|tab|escape|esc|backspace|delete|up|down|left|right|home|end|pageup|pagedown|f\d{1,2}|space))+$/i
const SINGLE_KEY_PATTERN = /^(?:enter|tab|escape|esc|backspace|delete|up|down|left|right|home|end|pageup|pagedown|f\d{1,2}|space)$/i

function normalizeRawText(rawArgs: unknown) {
  if (typeof rawArgs === 'string') {
    return rawArgs.trim()
  }

  if (rawArgs === null || typeof rawArgs === 'undefined') {
    return ''
  }

  if (typeof rawArgs === 'object') {
    try {
      return JSON.stringify(rawArgs)
    } catch {
      return String(rawArgs)
    }
  }

  return String(rawArgs).trim()
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```(?:json|javascript|js|ts|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function normalizeJsonishText(text: string) {
  return stripCodeFence(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[：]/g, ':')
    .replace(/[，]/g, ',')
    .replace(/[【]/g, '[')
    .replace(/[】]/g, ']')
    .replace(/[｛]/g, '{')
    .replace(/[｝]/g, '}')
    .trim()
}

function extractBalancedJsonSegment(text: string) {
  const startIndex = text.search(/[\[{]/)
  if (startIndex < 0) {
    return ''
  }

  const stack: string[] = []
  let inDouble = false
  let inSingle = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]

    if ((inDouble || inSingle) && escaped) {
      escaped = false
      continue
    }

    if ((inDouble || inSingle) && char === '\\') {
      escaped = true
      continue
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble
      continue
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle
      continue
    }

    if (inDouble || inSingle) {
      continue
    }

    if (char === '{' || char === '[') {
      stack.push(char)
      continue
    }

    if (char === '}' || char === ']') {
      const last = stack.pop()
      if (!last) {
        return ''
      }

      const matched = (last === '{' && char === '}') || (last === '[' && char === ']')
      if (!matched) {
        return ''
      }

      if (stack.length === 0) {
        return text.slice(startIndex, index + 1).trim()
      }
    }
  }

  return ''
}

function replaceSingleQuotedStrings(text: string) {
  let result = ''
  let index = 0
  let inDouble = false
  let escaped = false

  while (index < text.length) {
    const char = text[index]

    if (inDouble) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inDouble = false
      }
      index += 1
      continue
    }

    if (char === '"') {
      inDouble = true
      result += char
      index += 1
      continue
    }

    if (char !== "'") {
      result += char
      index += 1
      continue
    }

    let cursor = index + 1
    let segment = ''
    let closed = false

    while (cursor < text.length) {
      const current = text[cursor]
      if (current === '\\' && cursor + 1 < text.length) {
        segment += text[cursor + 1]
        cursor += 2
        continue
      }

      if (current === "'") {
        closed = true
        cursor += 1
        break
      }

      segment += current
      cursor += 1
    }

    if (!closed) {
      result += char
      index += 1
      continue
    }

    result += JSON.stringify(segment)
    index = cursor
  }

  return result
}

function quoteBareKeys(text: string) {
  return text.replace(/([{,]\s*)([A-Za-z_\u4e00-\u9fa5][\w\-\u4e00-\u9fa5]*)(\s*:)/g, '$1"$2"$3')
}

function removeTrailingCommas(text: string) {
  return text.replace(/,\s*([}\]])/g, '$1')
}

function buildJsonCandidates(text: string) {
  const normalized = normalizeJsonishText(text)
  const candidates = new Set<string>()

  const pushCandidate = (value: string) => {
    const next = value.trim()
    if (next) {
      candidates.add(next)
    }
  }

  pushCandidate(normalized)
  const extracted = extractBalancedJsonSegment(normalized)
  if (extracted) {
    pushCandidate(extracted)
  }

  for (const candidate of [...candidates]) {
    const replacedSingleQuotes = replaceSingleQuotedStrings(candidate)
    pushCandidate(replacedSingleQuotes)
    pushCandidate(removeTrailingCommas(candidate))
    pushCandidate(removeTrailingCommas(replacedSingleQuotes))
    pushCandidate(quoteBareKeys(candidate))
    pushCandidate(removeTrailingCommas(quoteBareKeys(replacedSingleQuotes)))
  }

  return [...candidates]
}

function tryParseJsonCandidates(text: string) {
  for (const candidate of buildJsonCandidates(text)) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // 继续尝试更宽松的候选字符串。
    }
  }

  return null
}

function unwrapArgumentValue(value: unknown): unknown {
  let current = value

  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return current
    }

    const record = current as Record<string, unknown>
    const entries = Object.entries(record)
    if (entries.length !== 1) {
      return current
    }

    const [key, nextValue] = entries[0]
    if (!WRAPPER_KEYS.has(key.toLowerCase())) {
      return current
    }

    current = nextValue
  }

  return current
}

function toPlainObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function collectSearchRecords(record: Record<string, unknown>) {
  const records = [record]

  for (const key of SEARCH_CONTAINER_KEYS) {
    const nested = toPlainObject(record[key])
    if (nested) {
      records.push(nested)
    }
  }

  return records
}

function findValue(record: Record<string, unknown>, keys: string[]) {
  const normalizedKeys = new Set(keys.map(key => key.toLowerCase()))

  for (const candidate of collectSearchRecords(record)) {
    for (const [key, value] of Object.entries(candidate)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        return value
      }
    }
  }

  return undefined
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  const value = findValue(record, keys)
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  const value = findValue(record, keys)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return undefined
}

function parseBooleanText(raw: string) {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (/^(true|1|yes|on|enable|enabled|show|visible|open|开启|启用|显示|打开)$/i.test(normalized)) {
    return true
  }

  if (/^(false|0|no|off|disable|disabled|hide|hidden|close|关闭|禁用|隐藏)$/i.test(normalized)) {
    return false
  }

  return undefined
}

function pickBoolean(record: Record<string, unknown>, keys: string[]) {
  const value = findValue(record, keys)
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    return parseBooleanText(value)
  }

  return undefined
}

function pickArray(record: Record<string, unknown>, keys: string[]) {
  const value = findValue(record, keys)
  return Array.isArray(value) ? value : undefined
}

function pickObject(record: Record<string, unknown>, keys: string[]) {
  const value = findValue(record, keys)
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const next = value.map(item => String(item ?? '').trim()).filter(Boolean)
  return next.length > 0 ? next : undefined
}

function normalizeFieldKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function normalizeAppPath(raw: string) {
  const normalized = raw.trim()
  if (!normalized) {
    return ''
  }

  for (const item of APP_PATH_ALIASES) {
    if (item.patterns.some(pattern => pattern.test(normalized))) {
      return item.path
    }
  }

  return normalized.startsWith('/') ? normalized : ''
}

function normalizeTaskStatus(raw: string) {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) {
    return ''
  }

  if (normalized === 'planning' || normalized === 'running' || normalized === 'completed' || normalized === 'blocked') {
    return normalized
  }

  if (['pending', 'todo', 'plan'].includes(normalized)) {
    return 'planning'
  }

  if (['in_progress', 'progress', 'doing'].includes(normalized)) {
    return 'running'
  }

  if (['done', 'finish', 'finished', 'success'].includes(normalized)) {
    return 'completed'
  }

  if (['failed', 'stopped', 'stop', 'pause'].includes(normalized)) {
    return 'blocked'
  }

  return ''
}

function normalizeTaskStepStatus(raw: string): AITaskStep['status'] {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'pending' || normalized === 'in_progress' || normalized === 'completed' || normalized === 'blocked') {
    return normalized
  }

  if (normalized === 'running' || normalized === 'doing') {
    return 'in_progress'
  }

  if (normalized === 'done' || normalized === 'finished' || normalized === 'success') {
    return 'completed'
  }

  if (normalized === 'failed' || normalized === 'stopped') {
    return 'blocked'
  }

  return 'pending'
}

function normalizeTaskSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index): AITaskStep | null => {
      if (typeof item === 'string') {
        const title = item.trim()
        return title
          ? { id: `task-step-${index + 1}`, title, status: index === 0 ? 'in_progress' : 'pending' }
          : null
      }

      const record = toPlainObject(item)
      if (!record) {
        return null
      }

      const title = pickString(record, ['title', 'name', 'step', 'content'])
      if (!title) {
        return null
      }

      return {
        id: pickString(record, ['id']) || `task-step-${index + 1}`,
        title,
        status: normalizeTaskStepStatus(pickString(record, ['status', 'state']) || (index === 0 ? 'in_progress' : 'pending')),
        note: pickString(record, ['note', 'summary', 'detail', 'reason']) || undefined
      }
    })
    .filter((step): step is AITaskStep => Boolean(step))
}

function normalizeRememberCategory(raw: string) {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'preference' || normalized === 'fact' || normalized === 'context' || normalized === 'instruction') {
    return normalized
  }

  return 'fact'
}

function normalizeScreenRegion(raw: string) {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) {
    return ''
  }

  if (['full', 'screen', 'entire', 'all', '整屏', '全屏'].includes(normalized)) {
    return 'full'
  }

  if (['active', 'foreground', 'current', '当前窗口', '前台窗口', '活动窗口'].includes(normalized)) {
    return 'active'
  }

  if (['window', 'target', '指定窗口'].includes(normalized)) {
    return 'window'
  }

  return ''
}

function parseCoordinatePair(raw: string) {
  const matches = raw.match(/-?\d+(?:\.\d+)?/g) || []
  if (matches.length < 2) {
    return null
  }

  const x = Number(matches[0])
  const y = Number(matches[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return { x, y }
}

function normalizeFieldDefinitions(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const fields = value
    .map((item, index) => {
      if (typeof item === 'string') {
        const label = item.trim()
        if (!label) {
          return null
        }

        return {
          key: normalizeFieldKey(label) || `field_${index + 1}`,
          name: label,
          required: false
        }
      }

      const record = toPlainObject(item)
      if (!record) {
        return null
      }

      const name = pickString(record, ['name', 'label', 'title'])
      const key = normalizeFieldKey(pickString(record, ['key', 'id', 'field'])) || normalizeFieldKey(name) || `field_${index + 1}`
      if (!name && !key) {
        return null
      }

      return {
        key,
        name: name || key,
        required: pickBoolean(record, ['required', 'must']) ?? false
      }
    })
    .filter((field): field is { key: string; name: string; required: boolean } => Boolean(field))

  return fields.length > 0 ? fields : undefined
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const next = value
    .map(item => {
      if (typeof item === 'string') {
        return item.trim()
      }

      if (typeof item === 'number' && Number.isFinite(item)) {
        return String(item)
      }

      return ''
    })
    .filter(Boolean)

  return next.length > 0 ? next : undefined
}

function compactObject(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (typeof value === 'undefined' || value === null) {
        return false
      }

      if (typeof value === 'string') {
        return value.trim().length > 0
      }

      if (Array.isArray(value)) {
        return value.length > 0
      }

      return true
    })
  )
}

function parseToolArgumentValue(rawArgs: unknown): ToolArgumentParseResult {
  const rawText = normalizeRawText(rawArgs)

  if (rawArgs && typeof rawArgs === 'object') {
    const unwrapped = unwrapArgumentValue(rawArgs)
    return {
      rawText,
      normalizedText: rawText,
      value: unwrapped,
      objectValue: toPlainObject(unwrapped)
    }
  }

  if (!rawText) {
    return {
      rawText: '',
      normalizedText: '',
      value: {},
      objectValue: {}
    }
  }

  const normalizedText = normalizeJsonishText(rawText)
  const parsedValue = tryParseJsonCandidates(normalizedText)
  const value = unwrapArgumentValue(parsedValue ?? rawText)

  return {
    rawText,
    normalizedText,
    value,
    objectValue: toPlainObject(value)
  }
}

function buildWindowTargetArgs(record: Record<string, unknown>, rawText: string) {
  const windowId = pickNumber(record, ['windowId', 'id'])
  const windowHandle = pickString(record, ['windowHandle', 'handle'])
  const windowTitle = pickString(record, ['windowTitle', 'title', 'window'])
  const processName = pickString(record, ['processName', 'process', 'app'])

  if (typeof windowId !== 'undefined' || windowHandle || windowTitle || processName) {
    return compactObject({
      id: windowId,
      windowId,
      windowHandle,
      title: windowTitle,
      windowTitle,
      processName
    })
  }

  if (/^0x[0-9a-f]+$/i.test(rawText)) {
    return { windowHandle: rawText }
  }

  if (/^\d+$/.test(rawText)) {
    return { id: Number(rawText), windowId: Number(rawText) }
  }

  if (/\.exe$/i.test(rawText)) {
    return { processName: rawText.replace(/\.exe$/i, '') }
  }

  return rawText ? { title: rawText, windowTitle: rawText } : {}
}

export function coerceToolArguments(toolName: string, rawArgs: unknown): Record<string, unknown> {
  const parsed = parseToolArgumentValue(rawArgs)
  const base = parsed.objectValue ? { ...parsed.objectValue } : {}
  const rawText = typeof parsed.value === 'string' ? parsed.value.trim() : parsed.rawText
  const fallbackRawText = typeof parsed.value === 'string' ? parsed.value.trim() : (parsed.objectValue ? '' : parsed.rawText)

  switch (toolName) {
    case 'query_accounts':
      return compactObject({
        typeId: pickString(base, ['typeId', 'type', 'accountTypeId']),
        status: pickString(base, ['status', 'state']),
        keyword: pickString(base, ['keyword', 'query', 'search', 'text', 'value']) || fallbackRawText,
        limit: pickNumber(base, ['limit', 'count', 'top'])
      })

    case 'import_accounts': {
      const accounts = pickArray(base, ['accounts', 'items', 'rows', 'records', 'list', 'data'])
        ?? (Array.isArray(parsed.value) ? parsed.value : undefined)

      return compactObject({
        typeId: pickString(base, ['typeId', 'type', 'accountTypeId']),
        accounts,
        source: pickString(base, ['source', 'from', 'origin']),
        totalCost: pickNumber(base, ['totalCost', 'cost', 'price'])
      })
    }

    case 'export_accounts': {
      const accountIds = normalizeIdArray(pickArray(base, ['accountIds', 'ids', 'selectedIds', 'items', 'accounts']) ?? parsed.value)

      return compactObject({
        typeId: pickString(base, ['typeId', 'type', 'accountTypeId']),
        accountIds,
        destination: pickString(base, ['destination', 'target', 'to']),
        totalProfit: pickNumber(base, ['totalProfit', 'profit'])
      })
    }

    case 'create_account_type':
      return compactObject({
        name: pickString(base, ['name', 'title', 'typeName']) || fallbackRawText,
        color: pickString(base, ['color']),
        fields: normalizeFieldDefinitions(pickArray(base, ['fields', 'columns', 'schema', 'items']) ?? parsed.value),
        importSeparator: pickString(base, ['importSeparator']),
        exportSeparator: pickString(base, ['exportSeparator']),
        accountSeparator: pickString(base, ['accountSeparator']),
        exportAccountSeparator: pickString(base, ['exportAccountSeparator'])
      })

    case 'navigate_app':
      return compactObject({
        path: normalizeAppPath(pickString(base, ['path', 'route', 'page', 'url']) || fallbackRawText)
      })

    case 'set_live2d_enabled': {
      const enabled = pickBoolean(base, ['enabled', 'show', 'visible']) ?? parseBooleanText(fallbackRawText)
      return compactObject({ enabled })
    }

    case 'update_task_plan': {
      const steps = normalizeTaskSteps(pickArray(base, ['steps', 'plan', 'todos', 'tasks']) ?? parsed.value)
      return compactObject({
        goal: pickString(base, ['goal', 'objective', 'target', 'task']),
        status: normalizeTaskStatus(pickString(base, ['status', 'state'])),
        summary: pickString(base, ['summary', 'note', 'progress', 'content']) || (!steps.length ? fallbackRawText : ''),
        maxIterations: pickNumber(base, ['maxIterations', 'maxAutoSteps', 'iterations', 'stepsLimit']),
        steps
      })
    }

    case 'complete_task':
      return compactObject({
        summary: pickString(base, ['summary', 'result', 'content', 'text']) || fallbackRawText
      })

    case 'remember':
      return compactObject({
        content: pickString(base, ['content', 'text', 'memory', 'note', 'value']) || fallbackRawText,
        category: normalizeRememberCategory(pickString(base, ['category', 'type', 'kind']) || 'fact')
      })

    case 'get_managed_ai_resources':
      return {}

    case 'install_mcp_server':
      return compactObject({
        id: pickString(base, ['id', 'serverId']),
        name: pickString(base, ['name', 'title']),
        description: pickString(base, ['description', 'summary']),
        packageName: pickString(base, ['packageName', 'package', 'npmPackage']),
        entryCommand: pickString(base, ['entryCommand', 'bin', 'binary']),
        command: pickString(base, ['command', 'cmd']),
        args: normalizeStringArray(pickArray(base, ['args', 'arguments', 'commandArgs']) ?? parsed.value),
        env: pickObject(base, ['env', 'environment']),
        cwd: pickString(base, ['cwd', 'workingDirectory']),
        enabled: pickBoolean(base, ['enabled', 'active'])
      })

    case 'set_mcp_server_enabled':
      return compactObject({
        serverId: pickString(base, ['serverId', 'id', 'name']) || fallbackRawText,
        enabled: pickBoolean(base, ['enabled', 'active']) ?? parseBooleanText(fallbackRawText)
      })

    case 'remove_mcp_server':
    case 'refresh_mcp_server_tools':
      return compactObject({
        serverId: pickString(base, ['serverId', 'id', 'name']) || fallbackRawText
      })

    case 'upsert_ai_skill':
      return compactObject({
        skillId: pickString(base, ['skillId', 'id']),
        name: pickString(base, ['name', 'title']) || fallbackRawText,
        description: pickString(base, ['description', 'summary']),
        content: pickString(base, ['content', 'text', 'instruction']) || fallbackRawText,
        enabled: pickBoolean(base, ['enabled', 'active'])
      })

    case 'set_ai_skill_enabled':
      return compactObject({
        skillId: pickString(base, ['skillId', 'id', 'name']) || fallbackRawText,
        enabled: pickBoolean(base, ['enabled', 'active']) ?? parseBooleanText(fallbackRawText)
      })

    case 'remove_ai_skill':
      return compactObject({
        skillId: pickString(base, ['skillId', 'id', 'name']) || fallbackRawText
      })

    case 'execute_command':
      return compactObject({
        command: pickString(base, ['command', 'cmd', 'script', 'text', 'value']) || fallbackRawText,
        reason: pickString(base, ['reason', 'purpose'])
      })

    case 'read_screen': {
      const region = normalizeScreenRegion(pickString(base, ['region', 'capture', 'mode']) || fallbackRawText)
      const target = buildWindowTargetArgs(base, region ? '' : fallbackRawText)
      const hasTarget = Boolean(target.windowId || target.id || target.windowHandle || target.windowTitle || target.title || target.processName)

      return compactObject({
        region: region || (hasTarget ? 'window' : ''),
        windowId: target.windowId,
        windowHandle: target.windowHandle,
        title: target.title,
        windowTitle: target.windowTitle,
        processName: target.processName
      })
    }

    case 'mouse_click': {
      const coordinates = parseCoordinatePair(fallbackRawText)
      const button = pickString(base, ['button', 'mouseButton']) || (/右键|right/i.test(fallbackRawText) ? 'right' : /中键|middle/i.test(fallbackRawText) ? 'middle' : '')
      const clickType = pickString(base, ['clickType', 'type']) || (/双击|double/i.test(fallbackRawText) ? 'double' : '')

      return compactObject({
        x: pickNumber(base, ['x']) ?? coordinates?.x,
        y: pickNumber(base, ['y']) ?? coordinates?.y,
        button,
        clickType
      })
    }

    case 'keyboard_input': {
      const normalizedRaw = fallbackRawText.trim()
      const hasKeyCombo = KEY_COMBO_PATTERN.test(normalizedRaw) || SINGLE_KEY_PATTERN.test(normalizedRaw)
      return compactObject({
        text: pickString(base, ['text', 'content', 'input', 'value']) || (!hasKeyCombo ? normalizedRaw : ''),
        keys: pickString(base, ['keys', 'key', 'shortcut']) || (hasKeyCombo ? normalizedRaw : ''),
        ...buildWindowTargetArgs(base, '')
      })
    }

    case 'focus_window':
      return compactObject(buildWindowTargetArgs(base, fallbackRawText))

    default:
      if (parsed.objectValue) {
        return compactObject(parsed.objectValue)
      }

      if (Array.isArray(parsed.value)) {
        return { items: parsed.value }
      }

      return rawText ? { value: rawText } : {}
  }
}

export function stringifyToolArguments(toolName: string, rawArgs: unknown) {
  const normalized = coerceToolArguments(toolName, rawArgs)
  if (Object.keys(normalized).length > 0) {
    return JSON.stringify(normalized)
  }

  const rawText = normalizeRawText(rawArgs)
  return rawText ? JSON.stringify({ value: rawText }) : '{}'
}