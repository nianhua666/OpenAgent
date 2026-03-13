function escapeHtml(content: string) {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(content: string) {
  return escapeHtml(content).replace(/`/g, '&#96;')
}

function joinTargetPath(basePath: string, relativePath: string) {
  const normalizedBase = basePath.replace(/[\\/]+$/, '')
  const normalizedRelative = relativePath.replace(/^[\\/]+/, '')
  return `${normalizedBase}/${normalizedRelative}`
}

function isUrlTarget(target: string) {
  return /^(https?:\/\/|mailto:)/i.test(target)
}

function isAbsolutePathTarget(target: string) {
  return /^[a-z]:[\\/]/i.test(target) || /^\/[^/]/.test(target)
}

function stripPathLocationSuffix(target: string) {
  return target
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '')
}

function normalizePathTarget(target: string) {
  return stripPathLocationSuffix(target.trim()).replace(/\//g, '\\')
}

function classifyTarget(target: string) {
  return isUrlTarget(target) ? 'url' : 'path'
}

function buildSpecialTargetPattern() {
  const urlPattern = String.raw`(?:https?:\/\/|mailto:)[^\s<>"']+`
  const windowsPathPattern = String.raw`[A-Za-z]:\\[^\s<>"']+`
  const unixLikePattern = String.raw`(?:\.{1,2}[\\/]|~[\\/]|\/[A-Za-z0-9._-])[^\s<>"']*`
  const relativeFilePattern = String.raw`(?:[A-Za-z0-9._-]+[\\/])*[A-Za-z0-9._-]+\.(?:md|txt|json|ya?ml|ts|tsx|js|jsx|vue|css|scss|less|html|py|ps1|cmd|bat|sh|sql|java|go|rs|c|cpp|h|hpp)(?:(?::\d+(?::\d+)?)|(?:#L\d+(?:C\d+)?))?`
  return new RegExp(`(${urlPattern}|${windowsPathPattern}|${unixLikePattern}|${relativeFilePattern})`, 'gi')
}

const SPECIAL_TARGET_PATTERN = buildSpecialTargetPattern()

function linkifySpecialTargets(content: string) {
  SPECIAL_TARGET_PATTERN.lastIndex = 0

  return content.replace(SPECIAL_TARGET_PATTERN, rawMatch => {
    const target = rawMatch.trim()
    const kind = classifyTarget(target)
    const escapedTarget = escapeAttribute(target)
    return `<a href="#" class="oa-rich-link is-${kind}" data-rich-kind="${kind}" data-rich-target="${escapedTarget}">${escapeHtml(target)}</a>`
  })
}

export function renderRichText(content: string) {
  if (!content) {
    return '<span class="oa-rich-muted">（空）</span>'
  }

  const codeTokens: string[] = []
  let nextContent = escapeHtml(content).replace(/`([^`]+)`/g, (_match, inlineCode: string) => {
    const token = `__OA_RICH_CODE_${codeTokens.length}__`
    codeTokens.push(`<code>${escapeHtml(inlineCode)}</code>`)
    return token
  })

  nextContent = nextContent
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\*])\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1<em>$2</em>')

  nextContent = linkifySpecialTargets(nextContent)
    .replace(/\n/g, '<br>')

  codeTokens.forEach((tokenHtml, index) => {
    nextContent = nextContent.replace(`__OA_RICH_CODE_${index}__`, tokenHtml)
  })

  return nextContent
}

async function resolveLocalTarget(target: string, workspaceRoot?: string) {
  const normalized = normalizePathTarget(target)
  if (!normalized) {
    return ''
  }

  if (isAbsolutePathTarget(normalized)) {
    return normalized
  }

  if (workspaceRoot) {
    return normalizePathTarget(joinTargetPath(workspaceRoot, normalized))
  }

  return ''
}

export async function handleRichTextActivation(event: MouseEvent, options?: { workspaceRoot?: string }) {
  const clickedElement = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('a[data-rich-target]')
    : null

  if (!clickedElement) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()

  const target = clickedElement.dataset.richTarget || ''
  const kind = clickedElement.dataset.richKind || classifyTarget(target)

  if (kind === 'url') {
    window.electronAPI?.openExternal?.(target)
    return true
  }

  const resolvedTarget = await resolveLocalTarget(target, options?.workspaceRoot)
  if (!resolvedTarget || !window.electronAPI?.openPath) {
    return false
  }

  return window.electronAPI.openPath(resolvedTarget)
}
