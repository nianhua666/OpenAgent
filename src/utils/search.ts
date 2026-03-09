export function normalizeSearchQuery(value?: string | null) {
  return value?.trim().toLowerCase() ?? ''
}

function appendSearchValue(target: string[], value: unknown) {
  if (value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach(item => appendSearchValue(target, item))
    return
  }

  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(item => appendSearchValue(target, item))
    return
  }

  const text = String(value).trim().toLowerCase()
  if (text) {
    target.push(text)
  }
}

export function matchesSearchQuery(query: string, ...values: unknown[]) {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) {
    return true
  }

  const textParts: string[] = []
  values.forEach(value => appendSearchValue(textParts, value))
  const haystack = textParts.join(' ')
  return normalizedQuery.split(/\s+/g).filter(Boolean).every(term => haystack.includes(term))
}