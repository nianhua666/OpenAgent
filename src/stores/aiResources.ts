import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AIManagedMCPServer, AIManagedResourceRegistry, AIManagedSkill, AIManagedMCPToolInspection } from '@/types'
import { loadData, saveData } from '@/utils/db'
import {
  buildManagedMcpToolRecord,
  createManagedMcpServerSignature,
  createManagedResourceId,
  createManagedSkillSignature,
  normalizeManagedSkillContent
} from '@/utils/aiManagedResources'
import {
  DEFAULT_MANAGED_MCP_IDS,
  DEFAULT_MANAGED_SKILL_IDS,
  MCP_MARKETPLACE_ITEMS,
  SKILL_MARKETPLACE_ITEMS
} from '@/utils/aiResourceMarketplace'

const RESOURCE_STORE_KEY = 'ai_resources'
const DEFAULT_RESOURCE_REGISTRY: AIManagedResourceRegistry = {
  mcpServers: [],
  skills: [],
  updatedAt: 0
}

let electronResourceSyncBound = false
let defaultBootstrapTask: Promise<void> | null = null

type SkillBootstrapStore = {
  findManagedSkillBySignature: (skill: Pick<AIManagedSkill, 'content'> & Partial<Pick<AIManagedSkill, 'name'>>) => AIManagedSkill | null
  upsertManagedSkill: (skill: Partial<AIManagedSkill> & Pick<AIManagedSkill, 'name' | 'content'>) => Promise<AIManagedSkill>
}

type McpBootstrapStore = {
  findManagedMcpServerBySignature: (server: Pick<AIManagedMCPServer, 'packageName' | 'entryCommand' | 'command' | 'args' | 'cwd' | 'env'>) => AIManagedMCPServer | null
  upsertManagedMcpServer: (server: Omit<AIManagedMCPServer, 'tools'> & { tools?: AIManagedMCPToolInspection[] | AIManagedMCPServer['tools'] }) => Promise<AIManagedMCPServer>
}

function normalizeEnv(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const env = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key.trim(), typeof item === 'string' ? item : String(item ?? '')])
      .filter(([key, item]) => key && item)
  )

  return Object.keys(env).length > 0 ? env : undefined
}

function normalizeManagedSkill(skill: AIManagedSkill): AIManagedSkill {
  const now = Date.now()
  return {
    ...skill,
    id: createManagedResourceId(skill.id || skill.name, 'skill'),
    name: skill.name?.trim() || '未命名技能',
    description: skill.description?.trim() || '',
    content: normalizeManagedSkillContent(skill.content || ''),
    enabled: Boolean(skill.enabled),
    source: skill.source === 'user' ? 'user' : 'ai',
    createdAt: skill.createdAt || now,
    updatedAt: skill.updatedAt || now
  }
}

function normalizeManagedServer(server: AIManagedMCPServer): AIManagedMCPServer {
  const now = Date.now()
  const serverId = createManagedResourceId(server.id || server.name || server.packageName || server.command, 'mcp_server')
  return {
    ...server,
    id: serverId,
    name: server.name?.trim() || serverId,
    description: server.description?.trim() || '',
    enabled: Boolean(server.enabled),
    packageName: server.packageName?.trim() || undefined,
    installDirectory: server.installDirectory?.trim() || undefined,
    entryCommand: server.entryCommand?.trim() || undefined,
    command: server.command?.trim() || '',
    args: Array.isArray(server.args) ? server.args.map(item => String(item)).filter(Boolean) : [],
    env: normalizeEnv(server.env),
    cwd: server.cwd?.trim() || undefined,
    source: server.source === 'user' ? 'user' : 'ai',
    createdAt: server.createdAt || now,
    updatedAt: server.updatedAt || now,
    installedAt: server.installedAt || undefined,
    lastError: server.lastError?.trim() || undefined,
    serverInfo: server.serverInfo,
    tools: Array.isArray(server.tools)
      ? server.tools.map(tool => buildManagedMcpToolRecord(serverId, {
          name: tool.originalName || tool.invocationName,
          description: tool.description,
          inputSchema: tool.inputSchema
        }, tool.updatedAt || now))
      : []
  }
}

function normalizeRegistry(data: AIManagedResourceRegistry | null | undefined): AIManagedResourceRegistry {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_RESOURCE_REGISTRY }
  }

  return {
    mcpServers: Array.isArray(data.mcpServers) ? data.mcpServers.map(normalizeManagedServer).filter(server => server.command) : [],
    skills: Array.isArray(data.skills) ? data.skills.map(normalizeManagedSkill).filter(skill => skill.content) : [],
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0
  }
}

async function bootstrapDefaultSkills(registryStore: SkillBootstrapStore) {
  const defaultSkills = SKILL_MARKETPLACE_ITEMS.filter(item => DEFAULT_MANAGED_SKILL_IDS.includes(item.id))

  for (const skill of defaultSkills) {
    if (registryStore.findManagedSkillBySignature({ name: skill.name, content: skill.content })) {
      continue
    }

    await registryStore.upsertManagedSkill({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      enabled: true,
      source: 'ai'
    })
  }
}

function buildDefaultCommandArgs(packageName: string) {
  return ['-y', packageName]
}

async function bootstrapDefaultMcpServers(registryStore: McpBootstrapStore) {
  if (typeof window === 'undefined' || !window.electronAPI?.mcpInspectManagedServer) {
    return
  }

  const defaultServers = MCP_MARKETPLACE_ITEMS.filter(item => DEFAULT_MANAGED_MCP_IDS.includes(item.id))

  for (const item of defaultServers) {
    if (registryStore.findManagedMcpServerBySignature({
      packageName: item.packageName,
      entryCommand: item.entryCommand,
      command: item.command || 'npx',
      args: item.args?.length ? item.args : buildDefaultCommandArgs(item.packageName || ''),
      env: item.env,
      cwd: item.cwd
    })) {
      continue
    }

    const serverId = createManagedResourceId(item.id || item.name, 'mcp_server')
    const now = Date.now()
    let command = item.command || 'npx'
    let args = item.args?.length ? item.args : buildDefaultCommandArgs(item.packageName || '')
    let installDirectory: string | undefined
    let installedAt: number | undefined
    let inspectionError = ''
    let tools: AIManagedMCPServer['tools'] = []
    let serverInfo: AIManagedMCPServer['serverInfo'] = undefined
    let enabled = false

    try {
      if (window.electronAPI.mcpInstallManagedPackage && item.packageName) {
        const installResult = await window.electronAPI.mcpInstallManagedPackage({
          serverId,
          packageName: item.packageName,
          entryCommand: item.entryCommand,
          args: item.args || []
        })

        if (installResult.success) {
          command = installResult.command
          args = installResult.args
          installDirectory = installResult.installDirectory
          installedAt = now
        } else if (installResult.error) {
          inspectionError = installResult.error
        }
      }

      const inspection = await window.electronAPI.mcpInspectManagedServer({
        command,
        args,
        env: item.env,
        cwd: item.cwd || installDirectory
      })

      tools = inspection.tools.map(tool => buildManagedMcpToolRecord(serverId, tool, now))
      serverInfo = inspection.serverInfo
      inspectionError = inspection.error || inspectionError
      enabled = inspection.success
    } catch (error) {
      inspectionError = error instanceof Error ? error.message : '默认 MCP 服务器初始化失败'
    }

    await registryStore.upsertManagedMcpServer({
      id: serverId,
      name: item.name,
      description: item.description,
      enabled,
      packageName: item.packageName,
      installDirectory,
      entryCommand: item.entryCommand,
      command,
      args,
      env: item.env,
      cwd: item.cwd || installDirectory,
      source: 'ai',
      createdAt: now,
      updatedAt: now,
      installedAt,
      lastError: inspectionError || undefined,
      serverInfo,
      tools
    })
  }
}

export const useAIResourcesStore = defineStore('aiResources', () => {
  const registry = ref<AIManagedResourceRegistry>({ ...DEFAULT_RESOURCE_REGISTRY })
  const loaded = ref(false)

  function findManagedMcpServerBySignature(server: Pick<AIManagedMCPServer, 'packageName' | 'entryCommand' | 'command' | 'args' | 'cwd' | 'env'>) {
    const signature = createManagedMcpServerSignature(server)
    return registry.value.mcpServers.find(item => createManagedMcpServerSignature(item) === signature) ?? null
  }

  function findManagedSkillBySignature(skill: Pick<AIManagedSkill, 'content'> & Partial<Pick<AIManagedSkill, 'name'>>) {
    const signature = createManagedSkillSignature(skill)
    return registry.value.skills.find(item => createManagedSkillSignature(item) === signature) ?? null
  }

  function bindElectronResourceSync() {
    if (electronResourceSyncBound || !window.electronAPI?.onStoreChanged) {
      return
    }

    electronResourceSyncBound = true
    window.electronAPI.onStoreChanged((key, data) => {
      if (key === RESOURCE_STORE_KEY) {
        registry.value = normalizeRegistry(data as AIManagedResourceRegistry)
      }
    })
  }

  async function persistRegistry() {
    registry.value = {
      ...registry.value,
      updatedAt: Date.now()
    }
    await saveData(RESOURCE_STORE_KEY, registry.value)
  }

  function getRegistryExportData() {
    return normalizeRegistry(registry.value)
  }

  function ensureDefaultResourcesBootstrap() {
    if (defaultBootstrapTask) {
      return defaultBootstrapTask
    }

    // 默认技能与托管 MCP 属于可选增强能力，不应该阻塞主界面首屏启动。
    defaultBootstrapTask = (async () => {
      await bootstrapDefaultSkills(store)
      await bootstrapDefaultMcpServers(store)
    })()
      .catch(error => {
        console.error('[AIResources] 默认资源引导失败', error)
      })
      .finally(() => {
        defaultBootstrapTask = null
      })

    return defaultBootstrapTask
  }

  async function init() {
    registry.value = normalizeRegistry(await loadData<AIManagedResourceRegistry>(RESOURCE_STORE_KEY, DEFAULT_RESOURCE_REGISTRY))
    bindElectronResourceSync()
    loaded.value = true
    void ensureDefaultResourcesBootstrap()
  }

  async function upsertManagedMcpServer(server: Omit<AIManagedMCPServer, 'tools'> & { tools?: AIManagedMCPToolInspection[] | AIManagedMCPServer['tools'] }) {
    const now = Date.now()
    const requestedId = createManagedResourceId(server.id || server.name || server.packageName || server.command, 'mcp_server')
    const existing = registry.value.mcpServers.find(item => item.id === requestedId) || findManagedMcpServerBySignature(server)
    const serverId = existing?.id || requestedId
    const nextTools = Array.isArray(server.tools)
      ? server.tools.map(tool => buildManagedMcpToolRecord(serverId, {
          name: 'originalName' in tool ? tool.originalName : tool.name,
          description: tool.description,
          inputSchema: 'inputSchema' in tool ? tool.inputSchema : {}
        }, now))
      : existing?.tools || []

    const nextServer = normalizeManagedServer({
      ...(existing ?? {
        id: serverId,
        name: server.name,
        description: server.description,
        enabled: server.enabled,
        command: server.command,
        args: server.args,
        env: server.env,
        cwd: server.cwd,
        source: server.source,
        createdAt: now,
        tools: []
      }),
      ...server,
      id: serverId,
      source: server.source === 'user' ? 'user' : existing?.source || 'ai',
      tools: nextTools,
      updatedAt: now,
      installedAt: server.installedAt ?? existing?.installedAt,
      lastError: server.lastError ?? existing?.lastError,
      serverInfo: server.serverInfo ?? existing?.serverInfo
    } as AIManagedMCPServer)

    if (existing) {
      Object.assign(existing, nextServer)
    } else {
      registry.value.mcpServers.unshift(nextServer)
    }

    await persistRegistry()
    return nextServer
  }

  async function setManagedMcpServerEnabled(serverId: string, enabled: boolean) {
    const target = registry.value.mcpServers.find(server => server.id === serverId)
    if (!target) {
      return null
    }

    target.enabled = enabled
    target.updatedAt = Date.now()
    await persistRegistry()
    return target
  }

  async function removeManagedMcpServer(serverId: string) {
    const previousLength = registry.value.mcpServers.length
    registry.value.mcpServers = registry.value.mcpServers.filter(server => server.id !== serverId)
    if (registry.value.mcpServers.length === previousLength) {
      return false
    }

    await persistRegistry()
    return true
  }

  async function upsertManagedSkill(skill: Partial<AIManagedSkill> & Pick<AIManagedSkill, 'name' | 'content'>) {
    const now = Date.now()
    const requestedId = createManagedResourceId(skill.id || skill.name, 'skill')
    const existing = registry.value.skills.find(item => item.id === requestedId) || findManagedSkillBySignature(skill)
    const skillId = existing?.id || requestedId
    const nextSkill = normalizeManagedSkill({
      id: skillId,
      name: skill.name,
      description: skill.description || existing?.description || '',
      content: skill.content,
      enabled: typeof skill.enabled === 'boolean' ? skill.enabled : existing?.enabled ?? true,
      source: skill.source === 'user' ? 'user' : existing?.source || 'ai',
      createdAt: existing?.createdAt || now,
      updatedAt: now
    })

    if (existing) {
      Object.assign(existing, nextSkill)
    } else {
      registry.value.skills.unshift(nextSkill)
    }

    await persistRegistry()
    return nextSkill
  }

  async function setManagedSkillEnabled(skillId: string, enabled: boolean) {
    const target = registry.value.skills.find(skill => skill.id === skillId)
    if (!target) {
      return null
    }

    target.enabled = enabled
    target.updatedAt = Date.now()
    await persistRegistry()
    return target
  }

  async function removeManagedSkill(skillId: string) {
    const previousLength = registry.value.skills.length
    registry.value.skills = registry.value.skills.filter(skill => skill.id !== skillId)
    if (registry.value.skills.length === previousLength) {
      return false
    }

    await persistRegistry()
    return true
  }

  async function importRegistryData(snapshot: AIManagedResourceRegistry | null | undefined) {
    registry.value = normalizeRegistry(snapshot)
    await persistRegistry()
    return registry.value
  }

  function getManagedMcpServer(serverId: string) {
    return registry.value.mcpServers.find(server => server.id === serverId) ?? null
  }

  function findManagedMcpTool(invocationName: string) {
    for (const server of registry.value.mcpServers) {
      const tool = server.tools.find(item => item.invocationName === invocationName)
      if (tool) {
        return { server, tool }
      }
    }

    return null
  }

  const enabledManagedMcpServers = computed(() => registry.value.mcpServers.filter(server => server.enabled))
  const enabledManagedMcpTools = computed(() => enabledManagedMcpServers.value.flatMap(server => server.tools.map(tool => ({ server, tool }))))
  const enabledSkills = computed(() => registry.value.skills.filter(skill => skill.enabled))

  const store = {
    registry,
    loaded,
    enabledManagedMcpServers,
    enabledManagedMcpTools,
    enabledSkills,
    init,
    upsertManagedMcpServer,
    setManagedMcpServerEnabled,
    removeManagedMcpServer,
    upsertManagedSkill,
    setManagedSkillEnabled,
    removeManagedSkill,
    getRegistryExportData,
    importRegistryData,
    getManagedMcpServer,
    findManagedMcpTool,
    findManagedMcpServerBySignature,
    findManagedSkillBySignature
  }

  return store
})
