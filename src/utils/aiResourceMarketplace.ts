import { createManagedMcpServerSignature, createManagedSkillSignature } from '@/utils/aiManagedResources'

export type MarketplaceSourceKind = 'official' | 'curated' | 'builtin' | 'remote'

export interface MarketplaceSourceInfo {
  id: string
  name: string
  description: string
  kind: MarketplaceSourceKind
  homepage?: string
}

export interface MarketplaceSourceRef extends MarketplaceSourceInfo {}

interface MCPMarketplaceSeed {
  id: string
  name: string
  description: string
  packageName?: string
  entryCommand?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  tags: string[]
  quickInstallable: boolean
  recommended?: boolean
  configurationHint?: string
}

interface SkillMarketplaceSeed {
  id: string
  name: string
  description: string
  content: string
  tags: string[]
  recommended?: boolean
}

export interface MCPMarketplaceItem extends MCPMarketplaceSeed {
  installKey: string
  sources: MarketplaceSourceRef[]
}

export interface SkillMarketplaceItem extends SkillMarketplaceSeed {
  installKey: string
  sources: MarketplaceSourceRef[]
}

interface MCPMarketplaceCatalog {
  source: MarketplaceSourceInfo
  items: MCPMarketplaceSeed[]
}

interface SkillMarketplaceCatalog {
  source: MarketplaceSourceInfo
  items: SkillMarketplaceSeed[]
}

type RemoteMcpCatalogResponse = {
  objects?: Array<{
    package?: {
      name?: string
      description?: string
      links?: {
        npm?: string
        repository?: string
      }
    }
  }>
}

type RemoteNpmPackage = NonNullable<NonNullable<RemoteMcpCatalogResponse['objects']>[number]['package']>

type RemoteSkillCatalogResponse = {
  skills?: Array<{
    id?: string
    name?: string
    description?: string
    content?: string
    tags?: string[]
    recommended?: boolean
  }>
}

const OFFICIAL_MCP_SOURCE: MarketplaceSourceInfo = {
  id: 'official-mcp-npm',
  name: 'MCP 官方源',
  description: '来自 Model Context Protocol 官方 npm 包的稳定服务器模板。',
  kind: 'official',
  homepage: 'https://github.com/modelcontextprotocol/servers'
}

const VSCODE_GALLERY_MCP_SOURCE: MarketplaceSourceInfo = {
  id: 'vscode-mcp-gallery',
  name: 'VS Code MCP 画廊',
  description: '对齐 VS Code 当前默认展示的 MCP 画廊来源，优先抓取可信发布者的可安装包。',
  kind: 'remote',
  homepage: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers'
}

const OPENAGENT_CURATED_SOURCE: MarketplaceSourceInfo = {
  id: 'openagent-curated-mcp',
  name: 'OpenAgent 精选',
  description: '经 OpenAgent 校验可安装的扩展 MCP 来源。',
  kind: 'curated',
  homepage: 'https://github.com/upstash/context7'
}

const ACCOUNT_SKILL_SOURCE: MarketplaceSourceInfo = {
  id: 'openagent-account-skills',
  name: 'OpenAgent 账号治理',
  description: '围绕账号导入导出与字段校验整理的内置技能。',
  kind: 'builtin'
}

const RUNTIME_SKILL_SOURCE: MarketplaceSourceInfo = {
  id: 'openagent-runtime-skills',
  name: 'OpenAgent 运行时治理',
  description: '约束 MCP 接入顺序与工具结果复核的内置技能。',
  kind: 'builtin'
}

const VSCODE_DOC_SKILL_SOURCE: MarketplaceSourceInfo = {
  id: 'vscode-doc-skills',
  name: 'VS Code 官方实践',
  description: '从 VS Code Copilot / MCP 官方文档提炼出的稳定治理技能。',
  kind: 'remote',
  homepage: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers'
}

const OFFICIAL_MCP_NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search?text=%40modelcontextprotocol%2Fserver-&size=24'
const VSCODE_GALLERY_MCP_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search?text=%40playwright%2Fmcp%20%40azure%2Fmcp%20mcp-proxy&size=12'
const REMOTE_SKILL_MANIFEST_URL = 'https://openagent.dev/skills/catalog.json'

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean)))
}

function mergeSources(existing: MarketplaceSourceRef[], source: MarketplaceSourceInfo) {
  if (existing.some(item => item.id === source.id)) {
    return existing
  }

  return [...existing, { ...source }]
}

function buildMcpInstallKey(item: MCPMarketplaceSeed) {
  return createManagedMcpServerSignature({
    packageName: item.packageName,
    entryCommand: item.entryCommand,
    command: item.command || '',
    args: item.args || [],
    env: item.env,
    cwd: item.cwd
  })
}

function buildSkillInstallKey(item: SkillMarketplaceSeed) {
  return createManagedSkillSignature({
    name: item.name,
    content: item.content
  })
}

function mergeMcpMarketplaceSources(catalogs: MCPMarketplaceCatalog[]) {
  const mergedItems: MCPMarketplaceItem[] = []
  const itemMap = new Map<string, MCPMarketplaceItem>()

  catalogs.forEach(catalog => {
    catalog.items.forEach(item => {
      const installKey = buildMcpInstallKey(item)
      const existing = itemMap.get(installKey)

      if (existing) {
        existing.tags = uniqueTags([...existing.tags, ...item.tags])
        existing.recommended = existing.recommended || item.recommended
        existing.quickInstallable = existing.quickInstallable && item.quickInstallable
        existing.configurationHint = existing.configurationHint || item.configurationHint
        existing.sources = mergeSources(existing.sources, catalog.source)
        return
      }

      const nextItem: MCPMarketplaceItem = {
        ...item,
        tags: uniqueTags(item.tags),
        installKey,
        sources: [{ ...catalog.source }]
      }

      itemMap.set(installKey, nextItem)
      mergedItems.push(nextItem)
    })
  })

  return mergedItems
}

function mergeSkillMarketplaceSources(catalogs: SkillMarketplaceCatalog[]) {
  const mergedItems: SkillMarketplaceItem[] = []
  const itemMap = new Map<string, SkillMarketplaceItem>()

  catalogs.forEach(catalog => {
    catalog.items.forEach(item => {
      const installKey = buildSkillInstallKey(item)
      const existing = itemMap.get(installKey)

      if (existing) {
        existing.tags = uniqueTags([...existing.tags, ...item.tags])
        existing.recommended = existing.recommended || item.recommended
        existing.sources = mergeSources(existing.sources, catalog.source)
        return
      }

      const nextItem: SkillMarketplaceItem = {
        ...item,
        tags: uniqueTags(item.tags),
        installKey,
        sources: [{ ...catalog.source }]
      }

      itemMap.set(installKey, nextItem)
      mergedItems.push(nextItem)
    })
  })

  return mergedItems
}

function createMarketplacePackageSeed(packageName: string, description: string, sourceName: string): MCPMarketplaceSeed {
  const shortName = packageName.replace(/^@[^/]+\//, '')
  const isQuickInstallable = !/filesystem|github|brave-search|postgres|slack|google/.test(shortName)
  return {
    id: shortName.replace(/[^a-z0-9-]+/gi, '-').toLowerCase(),
    name: shortName.replace(/^server-/, '').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
    description: description || `${sourceName} 推荐的 MCP 服务器。`,
    packageName,
    entryCommand: shortName,
    tags: uniqueTags(['远程源', sourceName, ...(shortName.split('-'))]),
    quickInstallable: isQuickInstallable,
    recommended: /filesystem|memory|playwright|context7|sequential-thinking|pdf|map/.test(shortName),
    configurationHint: isQuickInstallable ? undefined : '该服务器通常需要目录、API Key 或外部服务地址。建议先“载入配置”后补齐参数再安装。'
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return null
    }

    return await response.json() as T
  } catch {
    return null
  }
}

async function fetchRemoteMcpCatalogs(): Promise<MCPMarketplaceCatalog[]> {
  const [officialResponse, vscodeGalleryResponse] = await Promise.all([
    fetchJson<RemoteMcpCatalogResponse>(OFFICIAL_MCP_NPM_SEARCH_URL),
    fetchJson<RemoteMcpCatalogResponse>(VSCODE_GALLERY_MCP_SEARCH_URL)
  ])

  const catalogs: MCPMarketplaceCatalog[] = []

  if (officialResponse?.objects?.length) {
    catalogs.push({
      source: OFFICIAL_MCP_SOURCE,
      items: officialResponse.objects
        .map(item => item.package)
        .filter((pkg): pkg is RemoteNpmPackage => Boolean(pkg?.name))
        .map(pkg => createMarketplacePackageSeed(pkg.name || '', pkg.description || '', OFFICIAL_MCP_SOURCE.name))
    })
  }

  if (vscodeGalleryResponse?.objects?.length) {
    catalogs.push({
      source: VSCODE_GALLERY_MCP_SOURCE,
      items: vscodeGalleryResponse.objects
        .map(item => item.package)
        .filter((pkg): pkg is RemoteNpmPackage => Boolean(pkg?.name))
        .map(pkg => createMarketplacePackageSeed(pkg.name || '', pkg.description || '', VSCODE_GALLERY_MCP_SOURCE.name))
    })
  }

  return catalogs
}

function createSkillSeedFromDoc(id: string, name: string, description: string, content: string, tags: string[], recommended = false): SkillMarketplaceSeed {
  return {
    id,
    name,
    description,
    content,
    tags: uniqueTags(tags),
    recommended
  }
}

function buildFallbackRemoteSkillCatalog(): SkillMarketplaceCatalog {
  return {
    source: VSCODE_DOC_SKILL_SOURCE,
    items: [
      createSkillSeedFromDoc(
        'vscode-mcp-trust-review',
        'MCP 信任与来源复核',
        '接入远程或本地 MCP 前，先复核来源、权限范围和是否真的需要安装。',
        '适用场景：准备安装或启用新的 MCP 服务器时。\n必须执行：先说明来源、发布者、用途、所需权限与风险，再决定是否安装；对需要本地执行代码的服务器，优先提醒用户确认可信度。\n禁止事项：禁止在未说明来源和权限影响前直接启用陌生 MCP。\n输出要求：给出“来源是否可信、需要哪些权限、是否建议启用”的结论。',
        ['MCP', '信任', '安全', '官方实践'],
        true
      ),
      createSkillSeedFromDoc(
        'vscode-mcp-sandbox-review',
        'MCP 沙箱与权限边界',
        '优先说明 MCP 的文件系统与网络边界，避免工具越权。',
        '适用场景：托管 MCP 需要读写文件、访问网络或接入第三方 API 时。\n必须执行：先说明本地执行边界、目录范围、网络访问范围以及是否支持沙箱；若是 Windows 环境，要明确当前无法依赖 VS Code 的本地沙箱机制。\n禁止事项：禁止把高风险 MCP 直接当作默认万能工具。\n输出要求：列出目录范围、网络范围、鉴权方式和风险提示。',
        ['MCP', '沙箱', '权限', '官方实践']
      ),
      createSkillSeedFromDoc(
        'vscode-customization-governance',
        'Chat Customization 治理规范',
        '把长效规则沉淀为 Skill，而不是混在一次性上下文中。',
        '适用场景：需要把稳定规则写成 Skill 或 Instructions 时。\n必须执行：区分一次性上下文和长期规则；长期规则进入 Skill，任务临时信息留在对话或会话态。\n禁止事项：禁止把凭据、一次性需求、与当前任务强耦合的临时文本写入长期 Skill。\n输出要求：说明为什么该规则适合沉淀，以及会影响哪些任务。',
        ['Skill', '治理', '官方实践']
      )
    ]
  }
}

async function fetchRemoteSkillCatalogs(): Promise<SkillMarketplaceCatalog[]> {
  const remoteManifest = await fetchJson<RemoteSkillCatalogResponse>(REMOTE_SKILL_MANIFEST_URL)
  const catalogs: SkillMarketplaceCatalog[] = []

  if (remoteManifest?.skills?.length) {
    catalogs.push({
      source: {
        id: 'openagent-remote-skills',
        name: 'OpenAgent 远程 Skill 源',
        description: '远程同步的 Skill 目录，可随版本独立更新。',
        kind: 'remote',
        homepage: REMOTE_SKILL_MANIFEST_URL
      },
      items: remoteManifest.skills
        .filter(skill => skill.name && skill.content)
        .map(skill => ({
          id: skill.id || String(skill.name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, '-'),
          name: skill.name || '未命名远程 Skill',
          description: skill.description || '远程同步 Skill',
          content: skill.content || '',
          tags: uniqueTags(skill.tags || ['远程源']),
          recommended: Boolean(skill.recommended)
        }))
    })
  }

  catalogs.push(buildFallbackRemoteSkillCatalog())
  return catalogs
}

export const MCP_MARKETPLACE_SOURCES: MCPMarketplaceCatalog[] = [
  {
    source: OFFICIAL_MCP_SOURCE,
    items: [
      {
        id: 'filesystem',
        name: '文件系统工作台',
        description: '让 AI 在指定目录中读写、搜索和整理文件，适合导入模板和本地资料加工。',
        packageName: '@modelcontextprotocol/server-filesystem',
        entryCommand: 'mcp-server-filesystem',
        args: ['D:/YourWorkspace'],
        tags: ['文件系统', '目录访问', '需配置'],
        quickInstallable: false,
        recommended: true,
        configurationHint: '需要至少提供一个可访问目录。点击“载入配置”后，把启动参数改成你自己的目录。'
      },
      {
        id: 'memory',
        name: '会话记忆缓存',
        description: '提供额外的外部记忆容器，适合跨回合暂存中间结果和结构化上下文。',
        packageName: '@modelcontextprotocol/server-memory',
        entryCommand: 'mcp-server-memory',
        tags: ['记忆', '缓存', '上下文'],
        quickInstallable: true,
        recommended: true
      },
      {
        id: 'github',
        name: 'GitHub 仓库助手',
        description: '适合检索 issue、PR 和代码仓库元数据，但需要先提供 GitHub Token。',
        packageName: '@modelcontextprotocol/server-github',
        entryCommand: 'mcp-server-github',
        env: {
          GITHUB_TOKEN: '<YOUR_GITHUB_TOKEN>'
        },
        tags: ['GitHub', '代码托管', '需凭据'],
        quickInstallable: false,
        configurationHint: '需要先填写 GITHUB_TOKEN。点击“载入配置”后，把环境变量换成真实令牌再接入。'
      },
      {
        id: 'puppeteer',
        name: '浏览器采集助手',
        description: '使用 Puppeteer 驱动浏览器，适合网页浏览、页面抓取和交互式采集。',
        packageName: '@modelcontextprotocol/server-puppeteer',
        entryCommand: 'mcp-server-puppeteer',
        tags: ['浏览器', '网页抓取', '自动化'],
        quickInstallable: true,
        recommended: true
      },
      {
        id: 'brave-search',
        name: 'Brave 搜索助手',
        description: '适合做网页检索与摘要，但需要先配置 Brave Search API Key。',
        packageName: '@modelcontextprotocol/server-brave-search',
        entryCommand: 'mcp-server-brave-search',
        env: {
          BRAVE_API_KEY: '<YOUR_BRAVE_API_KEY>'
        },
        tags: ['搜索', '网页检索', '需凭据'],
        quickInstallable: false,
        configurationHint: '需要先填写 BRAVE_API_KEY。点击“载入配置”后，把环境变量换成真实密钥再接入。'
      },
      {
        id: 'sequential-thinking',
        name: 'Sequential Thinking',
        description: '适合多步推理、计划拆解和复杂问题分析。',
        packageName: '@modelcontextprotocol/server-sequential-thinking',
        entryCommand: 'mcp-server-sequential-thinking',
        tags: ['推理', '规划', '问题分解'],
        quickInstallable: true,
        recommended: true
      }
    ]
  },
  {
    source: OPENAGENT_CURATED_SOURCE,
    items: [
      {
        id: 'context7',
        name: 'Context7 文档助手',
        description: '适合拉取最新依赖文档与代码示例，补足模型知识时效性。',
        packageName: '@upstash/context7-mcp',
        entryCommand: 'context7-mcp',
        tags: ['文档', '依赖库', '研发效率'],
        quickInstallable: true,
        recommended: true
      },
      {
        id: 'playwright',
        name: 'Playwright MCP',
        description: '对齐 VS Code 官方快速开始推荐，适合浏览器自动化、截图与页面交互。',
        packageName: '@playwright/mcp',
        entryCommand: 'playwright-mcp',
        tags: ['浏览器', '自动化', '官方实践'],
        quickInstallable: true,
        recommended: true
      }
    ]
  }
]

export const SKILL_MARKETPLACE_SOURCES: SkillMarketplaceCatalog[] = [
  {
    source: ACCOUNT_SKILL_SOURCE,
    items: [
      {
        id: 'account-import-review',
        name: '账号导入复核规范',
        description: '在导入前强制对齐类型字段、分隔规则和必填项，避免脏数据进入库中。',
        tags: ['导入', '校验', '账号管理'],
        recommended: true,
        content: '适用场景：用户要求批量导入账号时。\n必须执行：先读取账号类型字段与分隔规则，再把原始文本整理成字段对象数组；必填字段缺失时禁止导入。\n禁止事项：禁止跳过字段映射校验，禁止把展示文本直接当作结构化数据写入。\n输出要求：导入前先总结目标类型、字段映射、条数以及可选来源/成本信息，再等待用户确认。'
      },
      {
        id: 'account-export-review',
        name: '账号导出复核规范',
        description: '确保导出目标来自在库账号，并在导出前后给出清晰确认和结果摘要。',
        tags: ['导出', '确认', '账号管理'],
        recommended: true,
        content: '适用场景：用户要求批量导出账号时。\n必须执行：先查询在库账号并核对真实账号 ID，再执行导出；若用户提供去处或利润信息则一并复核，没有则明确为未记录。\n禁止事项：禁止凭展示文本拼接账号 ID，禁止在未确认目标账号前直接导出。\n输出要求：导出前说明类型、条数、去处/利润是否留空，导出后总结成功数量与剩余在库数量。'
      }
    ]
  },
  {
    source: RUNTIME_SKILL_SOURCE,
    items: [
      {
        id: 'managed-mcp-safety',
        name: '托管 MCP 安全顺序',
        description: '约束外部 MCP 的安装、启用和调用顺序，避免绕开本地业务规则。',
        tags: ['MCP', '安全', '外部工具'],
        recommended: true,
        content: '适用场景：需要新增或使用托管 MCP 服务器时。\n必须执行：先确认内置账号工具无法满足需求，再说明新增 MCP 的用途；安装后先做健康检查，确认能启动且能返回工具列表后再启用。\n禁止事项：禁止让外部 MCP 直接替代本地账号导入导出规则，禁止在健康检查失败时继续启用服务器。\n输出要求：说明服务器名称、用途、健康检查结果和实际暴露的工具数量。'
      },
      {
        id: 'result-round-review',
        name: '工具回合结果复核',
        description: '强化每轮工具调用后的结果审查，避免原地重复执行。',
        tags: ['复核', '规划', 'AI 执行'],
        recommended: true,
        content: '适用场景：一轮工具执行结束后。\n必须执行：判断结果是否真正推进任务；如果没有推进，就给出阻塞原因并调整计划，而不是继续原样重复调用工具。\n禁止事项：禁止在相同参数和相同结果下连续重试，禁止把失败结果当作成功推进。\n输出要求：明确写出“已推进/未推进”、原因和下一步动作。'
      }
    ]
  }
]

let remoteMcpMarketplaceItemsCache: MCPMarketplaceItem[] | null = null
let remoteSkillMarketplaceItemsCache: SkillMarketplaceItem[] | null = null

export const MCP_MARKETPLACE_ITEMS: MCPMarketplaceItem[] = mergeMcpMarketplaceSources(MCP_MARKETPLACE_SOURCES)

export const SKILL_MARKETPLACE_ITEMS: SkillMarketplaceItem[] = mergeSkillMarketplaceSources(SKILL_MARKETPLACE_SOURCES)

export async function listMcpMarketplaceItems(forceRefresh = false) {
  if (!forceRefresh && remoteMcpMarketplaceItemsCache) {
    return mergeMcpMarketplaceSources([
      ...MCP_MARKETPLACE_SOURCES,
      {
        source: { ...VSCODE_GALLERY_MCP_SOURCE },
        items: remoteMcpMarketplaceItemsCache.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          packageName: item.packageName,
          entryCommand: item.entryCommand,
          command: item.command,
          args: item.args,
          env: item.env,
          cwd: item.cwd,
          tags: item.tags,
          quickInstallable: item.quickInstallable,
          recommended: item.recommended,
          configurationHint: item.configurationHint
        }))
      }
    ])
  }

  const remoteCatalogs = await fetchRemoteMcpCatalogs()
  remoteMcpMarketplaceItemsCache = mergeMcpMarketplaceSources(remoteCatalogs)
  return mergeMcpMarketplaceSources([...MCP_MARKETPLACE_SOURCES, ...remoteCatalogs])
}

export async function listSkillMarketplaceItems(forceRefresh = false) {
  if (!forceRefresh && remoteSkillMarketplaceItemsCache) {
    return mergeSkillMarketplaceSources([
      ...SKILL_MARKETPLACE_SOURCES,
      {
        source: { ...VSCODE_DOC_SKILL_SOURCE },
        items: remoteSkillMarketplaceItemsCache.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          content: item.content,
          tags: item.tags,
          recommended: item.recommended
        }))
      }
    ])
  }

  const remoteCatalogs = await fetchRemoteSkillCatalogs()
  remoteSkillMarketplaceItemsCache = mergeSkillMarketplaceSources(remoteCatalogs)
  return mergeSkillMarketplaceSources([...SKILL_MARKETPLACE_SOURCES, ...remoteCatalogs])
}

export const DEFAULT_MANAGED_SKILL_IDS = [
  'account-import-review',
  'managed-mcp-safety',
  'result-round-review',
  'account-export-review'
]

export const DEFAULT_MANAGED_MCP_IDS = [
  'context7'
]