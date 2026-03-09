import type { AIManagedMCPServer, AIManagedMCPServerTool, AIManagedMCPToolInspection, AIManagedSkill } from '@/types'

export const MANAGED_MCP_TOOL_PREFIX = 'managed_mcp__'

function sanitizeToken(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

export function createManagedResourceId(seed: string, fallback = 'resource') {
  return sanitizeToken(seed, fallback)
}

function normalizeSignatureToken(value: string | undefined) {
  return value?.trim().toLowerCase() || ''
}

function normalizeArgs(args: string[] | undefined) {
  return Array.isArray(args)
    ? args.map(item => String(item).trim()).filter(Boolean)
    : []
}

function normalizeEnvEntries(env?: Record<string, string>) {
  if (!env) {
    return [] as Array<[string, string]>
  }

  return Object.entries(env)
    .map(([key, value]) => [key.trim().toLowerCase(), String(value ?? '').trim()] as [string, string])
    .filter(([key, value]) => key && value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
}

function hashText(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function normalizeManagedSkillContent(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
}

export function createManagedMcpServerSignature(server: Pick<AIManagedMCPServer, 'packageName' | 'entryCommand' | 'command' | 'args' | 'cwd' | 'env'>) {
  const packageName = normalizeSignatureToken(server.packageName)
  const entryCommand = normalizeSignatureToken(server.entryCommand)

  if (packageName) {
    return `pkg:${packageName}|entry:${entryCommand || 'auto'}`
  }

  const command = normalizeSignatureToken(server.command)
  const args = normalizeArgs(server.args).join('\u001f')
  const cwd = normalizeSignatureToken(server.cwd)
  const env = normalizeEnvEntries(server.env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\u001f')

  return `cmd:${command || 'unknown'}|args:${args}|cwd:${cwd}|env:${env}`
}

export function createManagedSkillSignature(skill: Pick<AIManagedSkill, 'content'> & Partial<Pick<AIManagedSkill, 'name'>>) {
  const normalizedContent = normalizeManagedSkillContent(skill.content || '')
  if (normalizedContent) {
    return `skill:${hashText(normalizedContent)}`
  }

  return `skill-name:${sanitizeToken(skill.name || '', 'skill')}`
}

export function buildManagedMcpToolInvocationName(serverId: string, originalToolName: string) {
  return `${MANAGED_MCP_TOOL_PREFIX}${createManagedResourceId(serverId, 'server')}__${sanitizeToken(originalToolName, 'tool')}`
}

export function isManagedMcpToolInvocationName(toolName: string) {
  return toolName.startsWith(MANAGED_MCP_TOOL_PREFIX)
}

export function buildManagedMcpToolRecord(serverId: string, tool: AIManagedMCPToolInspection, updatedAt = Date.now()): AIManagedMCPServerTool {
  return {
    invocationName: buildManagedMcpToolInvocationName(serverId, tool.name),
    originalName: tool.name,
    description: tool.description?.trim() || `${tool.name}（来自托管 MCP 服务器 ${serverId}）`,
    inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
      ? tool.inputSchema
      : { type: 'object', properties: {} },
    updatedAt
  }
}
