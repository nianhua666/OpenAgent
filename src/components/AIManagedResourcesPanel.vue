<template>
  <div class="managed-resource-panel">
    <div class="resource-summary-grid">
      <div class="resource-summary-card">
        <span class="summary-label">托管 MCP 服务器</span>
        <strong>{{ resourcesStore.registry.mcpServers.length }}</strong>
        <small>已启用 {{ resourcesStore.enabledManagedMcpServers.length }} 个，当前暴露 {{ enabledToolCount }} 个工具。</small>
      </div>
      <div class="resource-summary-card">
        <span class="summary-label">统一 Skills</span>
        <strong>{{ resourcesStore.registry.skills.length }}</strong>
        <small>已启用 {{ resourcesStore.enabledSkills.length }} 个，可直接注入 AI 系统提示词。</small>
      </div>
      <div class="resource-summary-card" :class="{ 'is-disabled': !supportsManagedMcp }">
        <span class="summary-label">运行环境</span>
        <strong>{{ supportsManagedMcp ? '桌面版可用' : '浏览器预览' }}</strong>
        <small>{{ supportsManagedMcp ? '支持商城安装、健康检查、刷新和调用托管 MCP。' : '预览环境只能管理 skills，MCP 安装与调用需要 Electron。' }}</small>
      </div>
    </div>

    <div class="marketplace-toolbar">
      <label class="field-block toolbar-search">
        <span>资源搜索</span>
        <input v-model="marketplaceSearchQuery" class="resource-input" placeholder="搜索 MCP、Skill、包名、标签、工具名或错误信息" />
      </label>
      <div class="toolbar-actions">
        <div class="toolbar-status-group">
          <span class="marketplace-source-pill is-builtin">内置 {{ MCP_MARKETPLACE_ITEMS.length + SKILL_MARKETPLACE_ITEMS.length }}</span>
          <span class="marketplace-source-pill is-remote">远程 {{ mcpMarketplaceSourceCount + skillMarketplaceSourceCount }}</span>
        </div>
        <div class="resource-actions">
          <button class="btn btn-secondary btn-sm" :disabled="loadingMarketplace || refreshingMarketplace" @click="refreshMarketplaceCatalogs">
            {{ loadingMarketplace || refreshingMarketplace ? '刷新中...' : '刷新远程源' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="marketplaceStatus || marketplaceLoadError" class="resource-tip compact-tip">
      <p v-if="marketplaceStatus">{{ marketplaceStatus }}</p>
      <p v-if="marketplaceLoadError">{{ marketplaceLoadError }}</p>
    </div>

    <div class="resource-panel-tabs">
      <button class="resource-panel-tab" :class="{ active: activePanel === 'marketplace' }" @click="activePanel = 'marketplace'">资源商城</button>
      <button class="resource-panel-tab" :class="{ active: activePanel === 'mcp' }" @click="activePanel = 'mcp'">MCP 管理</button>
      <button class="resource-panel-tab" :class="{ active: activePanel === 'skills' }" @click="activePanel = 'skills'">Skill 管理</button>
    </div>

    <div v-if="activePanel === 'marketplace'" class="resource-grid marketplace-grid-layout">
      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>MCP 商城</h3>
            <p>预置常用托管 MCP 模板，当前聚合 {{ mcpMarketplaceSourceCount }} 个来源。相同包或相同命令模板会自动合并，已安装项不会重复安装。</p>
          </div>
          <span class="resource-badge">{{ filteredMcpMarketplace.length }}</span>
        </div>

        <div v-if="filteredMcpMarketplace.length === 0" class="resource-empty">
          <strong>当前没有匹配的 MCP 商城项</strong>
          <span>请尝试更换搜索词，或直接使用下方手动接入表单。</span>
        </div>

        <div v-else class="resource-scroll-area">
          <div class="marketplace-card-grid">
            <article v-for="item in filteredMcpMarketplace" :key="item.id" class="marketplace-card">
              <div class="marketplace-card-head">
                <div>
                  <div class="title-row">
                    <strong>{{ item.name }}</strong>
                    <span v-if="item.recommended" class="status-pill is-enabled">推荐</span>
                    <span v-if="isInstalledMcpMarketplaceItem(item)" class="status-pill is-disabled">已安装</span>
                  </div>
                  <p>{{ item.description }}</p>
                </div>
              </div>

              <div class="marketplace-source-row">
                <span v-for="source in item.sources" :key="source.id" class="marketplace-source-pill" :class="`is-${source.kind}`">{{ source.name }}</span>
              </div>

              <div class="marketplace-tag-grid">
                <span v-for="tag in item.tags" :key="tag" class="marketplace-tag">{{ tag }}</span>
              </div>

              <div class="marketplace-meta-grid">
                <div>
                  <span class="meta-label">接入方式</span>
                  <strong>{{ item.quickInstallable ? '一键安装' : '填充模板' }}</strong>
                </div>
                <div>
                  <span class="meta-label">入口</span>
                  <strong>{{ item.packageName || item.command || '模板' }}</strong>
                </div>
                <div>
                  <span class="meta-label">来源</span>
                  <strong>{{ renderMarketplaceSources(item.sources) }}</strong>
                </div>
                <div>
                  <span class="meta-label">状态</span>
                  <strong>{{ isInstalledMcpMarketplaceItem(item) ? '已安装' : '可安装' }}</strong>
                </div>
              </div>

              <div v-if="item.configurationHint" class="resource-tip compact-tip">
                <p>{{ item.configurationHint }}</p>
              </div>

              <div class="resource-actions">
                <button class="btn btn-primary btn-sm" :disabled="isInstalledMcpMarketplaceItem(item) || installingMarketplaceMcpId === item.id || serverSubmitting" @click="installMarketplaceMcp(item)">
                  {{ isInstalledMcpMarketplaceItem(item) ? '已安装' : installingMarketplaceMcpId === item.id ? '处理中...' : item.quickInstallable ? '一键安装' : '填充模板' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="fillServerFormFromMarketplace(item, { switchPanel: true, focusField: true })">载入配置</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>Skill 商城</h3>
            <p>把长期稳定规则做成可复用技能，当前聚合 {{ skillMarketplaceSourceCount }} 个来源。相同内容的技能只保留一份，避免重复注入系统提示词。</p>
          </div>
          <span class="resource-badge">{{ filteredSkillMarketplace.length }}</span>
        </div>

        <div v-if="filteredSkillMarketplace.length === 0" class="resource-empty">
          <strong>当前没有匹配的 Skill 商城项</strong>
          <span>请尝试更换搜索词，或直接在下方手动新建技能。</span>
        </div>

        <div v-else class="resource-scroll-area">
          <div class="marketplace-card-grid">
            <article v-for="item in filteredSkillMarketplace" :key="item.id" class="marketplace-card">
              <div class="marketplace-card-head">
                <div>
                  <div class="title-row">
                    <strong>{{ item.name }}</strong>
                    <span v-if="item.recommended" class="status-pill is-enabled">推荐</span>
                    <span v-if="isInstalledSkillMarketplaceItem(item)" class="status-pill is-disabled">已安装</span>
                  </div>
                  <p>{{ item.description }}</p>
                </div>
              </div>

              <div class="marketplace-source-row">
                <span v-for="source in item.sources" :key="source.id" class="marketplace-source-pill" :class="`is-${source.kind}`">{{ source.name }}</span>
              </div>

              <div class="marketplace-tag-grid">
                <span v-for="tag in item.tags" :key="tag" class="marketplace-tag">{{ tag }}</span>
              </div>

              <div class="marketplace-meta-grid">
                <div>
                  <span class="meta-label">来源</span>
                  <strong>{{ renderMarketplaceSources(item.sources) }}</strong>
                </div>
                <div>
                  <span class="meta-label">状态</span>
                  <strong>{{ isInstalledSkillMarketplaceItem(item) ? '已安装' : '可安装' }}</strong>
                </div>
              </div>

              <div class="skill-preview-box">
                <span class="meta-label">技能预览</span>
                <p>{{ truncateText(item.content, 160) }}</p>
              </div>

              <div class="resource-actions">
                <button class="btn btn-primary btn-sm" :disabled="isInstalledSkillMarketplaceItem(item) || installingMarketplaceSkillId === item.id || savingSkill" @click="installMarketplaceSkill(item)">
                  {{ isInstalledSkillMarketplaceItem(item) ? '已安装' : installingMarketplaceSkillId === item.id ? '安装中...' : '一键安装' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="fillSkillFormFromMarketplace(item)">载入编辑区</button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="activePanel === 'mcp'" ref="mcpPanelRef" class="resource-grid">
      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>托管 MCP 服务器</h3>
            <p>统一登记外部 MCP 服务，控制启停、健康检查、刷新工具列表，并把它们暴露给 AI 作为补充能力。</p>
          </div>
          <span class="resource-badge">{{ filteredServers.length }} / {{ resourcesStore.registry.mcpServers.length }}</span>
        </div>

        <div class="resource-mode-switch">
          <button class="mode-btn" :class="{ active: serverMode === 'package' }" @click="serverMode = 'package'">安装 npm MCP</button>
          <button class="mode-btn" :class="{ active: serverMode === 'command' }" @click="serverMode = 'command'">登记现有命令</button>
        </div>

        <div class="resource-form-grid">
          <label class="field-block">
            <span>显示名称</span>
            <input ref="serverNameInputRef" v-model="serverForm.name" class="resource-input" placeholder="例如 文件系统工具箱" />
          </label>
          <label class="field-block">
            <span>服务器 ID</span>
            <input v-model="serverForm.id" class="resource-input" placeholder="可留空，默认按名称或包名生成" />
          </label>
          <label class="field-block field-block-wide">
            <span>用途说明</span>
            <input v-model="serverForm.description" class="resource-input" placeholder="说明它适合解决什么问题" />
          </label>

          <template v-if="serverMode === 'package'">
            <label class="field-block field-block-wide">
              <span>npm 包名</span>
              <input v-model="serverForm.packageName" class="resource-input" placeholder="例如 @modelcontextprotocol/server-filesystem" :disabled="!supportsManagedMcp" />
            </label>
            <label class="field-block">
              <span>入口命令</span>
              <input v-model="serverForm.entryCommand" class="resource-input" placeholder="未知时可保持为空" :disabled="!supportsManagedMcp" />
            </label>
          </template>

          <template v-else>
            <label class="field-block field-block-wide">
              <span>启动命令</span>
              <input v-model="serverForm.command" class="resource-input" placeholder="例如 node、uvx 或 npx" :disabled="!supportsManagedMcp" />
            </label>
          </template>

          <label class="field-block field-block-wide">
            <span>启动参数</span>
            <textarea v-model="serverForm.argsText" class="resource-textarea" rows="4" placeholder="每行一个参数，例如&#10;--root&#10;D:/AllDocument" :disabled="!supportsManagedMcp"></textarea>
          </label>
          <label class="field-block field-block-wide">
            <span>环境变量</span>
            <textarea v-model="serverForm.envText" class="resource-textarea" rows="4" placeholder="每行一个 KEY=VALUE，例如&#10;API_KEY=sk-xxx" :disabled="!supportsManagedMcp"></textarea>
          </label>
          <label class="field-block field-block-wide">
            <span>工作目录</span>
            <input v-model="serverForm.cwd" class="resource-input" placeholder="可选；命令需要固定工作目录时填写" :disabled="!supportsManagedMcp" />
          </label>
        </div>

        <label class="inline-checkbox">
          <input v-model="serverForm.enabled" type="checkbox" />
          <span>健康检查成功后立即启用此服务器</span>
        </label>

        <div class="resource-tip">
          <p>账号管理相关能力始终以内置工具为准。外部 MCP 适合补充文件系统、网页抓取或其它扩展场景。</p>
          <p v-if="serverSubmitStatus">{{ serverSubmitStatus }}</p>
        </div>

        <div class="resource-actions">
          <button class="btn btn-primary btn-sm" :disabled="submitServerDisabled" @click="submitServerForm">
            {{ serverSubmitting ? '处理中...' : serverMode === 'package' ? '安装并健康检查' : '登记并健康检查' }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="serverSubmitting" @click="resetServerForm">重置表单</button>
        </div>
      </section>

      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>服务器清单</h3>
            <p>统一查看每个服务器的启用状态、工具数量、健康检查结果、上次错误和详细启动命令。</p>
          </div>
        </div>

        <div v-if="filteredServers.length === 0" class="resource-empty">
          <strong>当前没有匹配的托管 MCP 服务器</strong>
          <span>你可以先通过商城选型，或通过左侧表单安装 npm MCP 包、登记本地命令。</span>
        </div>

        <div v-else class="resource-scroll-area">
          <div class="resource-list">
          <article v-for="server in filteredServers" :key="server.id" class="resource-list-item">
            <div class="resource-item-head">
              <div>
                <div class="title-row">
                  <strong>{{ server.name }}</strong>
                  <span class="status-pill" :class="{ 'is-enabled': server.enabled, 'is-disabled': !server.enabled }">
                    {{ server.enabled ? '已启用' : '已停用' }}
                  </span>
                </div>
                <p>{{ server.description || '未填写用途说明' }}</p>
              </div>
              <div class="item-actions">
                <button class="btn btn-secondary btn-sm" :disabled="checkingServerId === server.id || !supportsManagedMcp" @click="runHealthCheck(server)">
                  {{ checkingServerId === server.id ? '检查中...' : '健康检查' }}
                </button>
                <button class="btn btn-secondary btn-sm" :disabled="refreshingServerId === server.id || !supportsManagedMcp" @click="refreshServer(server)">
                  {{ refreshingServerId === server.id ? '刷新中...' : '刷新工具' }}
                </button>
                <button class="btn btn-secondary btn-sm" :disabled="togglingServerId === server.id" @click="toggleServer(server)">
                  {{ server.enabled ? '停用' : '启用' }}
                </button>
                <button class="btn btn-secondary btn-sm btn-danger" :disabled="removingServerId === server.id" @click="removeServer(server)">
                  {{ removingServerId === server.id ? '移除中...' : '移除' }}
                </button>
              </div>
            </div>

            <div class="resource-meta-grid">
              <div>
                <span class="meta-label">服务器 ID</span>
                <strong>{{ server.id }}</strong>
              </div>
              <div>
                <span class="meta-label">来源</span>
                <strong>{{ server.source === 'ai' ? 'AI 安装' : '手动录入' }}</strong>
              </div>
              <div>
                <span class="meta-label">工具数量</span>
                <strong>{{ server.tools.length }}</strong>
              </div>
              <div>
                <span class="meta-label">版本</span>
                <strong>{{ server.serverInfo?.version || '未知' }}</strong>
              </div>
            </div>

            <div class="resource-command-box">
              <span class="meta-label">启动命令</span>
              <code>{{ renderCommand(server) }}</code>
            </div>

            <div v-if="server.packageName || server.cwd || server.installDirectory" class="resource-extra-grid">
              <div v-if="server.packageName">
                <span class="meta-label">npm 包</span>
                <strong>{{ server.packageName }}</strong>
              </div>
              <div v-if="server.cwd">
                <span class="meta-label">工作目录</span>
                <strong>{{ server.cwd }}</strong>
              </div>
              <div v-if="server.installDirectory">
                <span class="meta-label">安装目录</span>
                <strong>{{ server.installDirectory }}</strong>
              </div>
            </div>

            <div v-if="server.env && Object.keys(server.env).length" class="resource-command-box">
              <span class="meta-label">环境变量</span>
              <code>{{ renderEnv(server.env) }}</code>
            </div>

            <div v-if="getServerHealthReport(server.id)" class="resource-health-box" :class="{ 'is-success': getServerHealthReport(server.id)?.success, 'is-error': !getServerHealthReport(server.id)?.success }">
              <div class="health-head">
                <div>
                  <span class="meta-label">最近健康检查</span>
                  <strong>{{ getServerHealthReport(server.id)?.success ? '服务器可用' : '检查失败' }}</strong>
                </div>
                <small>{{ formatDateTime(getServerHealthReport(server.id)?.checkedAt || 0) }}</small>
              </div>
              <p>{{ getServerHealthReport(server.id)?.message }}</p>
              <div v-if="getServerHealthReport(server.id)?.toolNames.length" class="health-tool-grid">
                <span v-for="toolName in getServerHealthReport(server.id)?.toolNames" :key="toolName" class="marketplace-tag">{{ toolName }}</span>
              </div>
              <pre v-if="getServerHealthReport(server.id)?.output" class="health-output">{{ getServerHealthReport(server.id)?.output }}</pre>
            </div>

            <div v-if="server.lastError" class="resource-error-box">
              <span class="meta-label">最近错误</span>
              <p>{{ server.lastError }}</p>
            </div>

            <details class="tool-list-box" :open="server.tools.length > 0">
              <summary>工具列表 {{ server.tools.length }} 个</summary>
              <div v-if="server.tools.length === 0" class="resource-empty-inline">当前没有探测到工具，请检查服务器命令和运行环境。</div>
              <div v-else class="tool-chip-grid">
                <div v-for="tool in server.tools" :key="tool.invocationName" class="tool-chip-card">
                  <strong>{{ tool.originalName }}</strong>
                  <span>{{ tool.invocationName }}</span>
                  <small>{{ tool.description }}</small>
                </div>
              </div>
            </details>
          </article>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="resource-grid">
      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>统一 Skills</h3>
            <p>把稳定、可复用的规则写成技能，统一注入系统提示词，减少模型在弱上下文下的漂移。</p>
          </div>
          <span class="resource-badge">{{ filteredSkills.length }} / {{ resourcesStore.registry.skills.length }}</span>
        </div>

        <div class="resource-form-grid">
          <label class="field-block">
            <span>技能名称</span>
            <input v-model="skillForm.name" class="resource-input" placeholder="例如 账号导入复核规范" />
          </label>
          <label class="field-block">
            <span>技能 ID</span>
            <input v-model="skillForm.id" class="resource-input" placeholder="可留空，默认按名称生成" />
          </label>
          <label class="field-block field-block-wide">
            <span>用途说明</span>
            <input v-model="skillForm.description" class="resource-input" placeholder="说明这个技能会约束什么行为" />
          </label>
          <label class="field-block field-block-wide">
            <span>技能内容</span>
            <textarea v-model="skillForm.content" class="resource-textarea" rows="8" placeholder="写入稳定、可复用的规则，不要把一次性上下文塞进技能。"></textarea>
          </label>
        </div>

        <label class="inline-checkbox">
          <input v-model="skillForm.enabled" type="checkbox" />
          <span>保存后立即启用此技能</span>
        </label>

        <div class="resource-tip">
          <p>推荐把规则写成“何时使用、必须验证什么、禁止做什么”的形式，避免模糊描述。</p>
        </div>

        <div class="resource-actions">
          <button class="btn btn-primary btn-sm" :disabled="saveSkillDisabled" @click="submitSkillForm">
            {{ savingSkill ? '保存中...' : editingSkillId ? '更新技能' : '新增技能' }}
          </button>
          <button class="btn btn-secondary btn-sm" :disabled="savingSkill" @click="resetSkillForm">重置表单</button>
        </div>
      </section>

      <section class="resource-card glass-panel">
        <div class="resource-card-head">
          <div>
            <h3>技能清单</h3>
            <p>启用后的技能会并入 AI 系统提示词，适合固化账号导入、MCP 安全顺序和结果复核规则。</p>
          </div>
        </div>

        <div v-if="filteredSkills.length === 0" class="resource-empty">
          <strong>当前没有匹配的技能</strong>
          <span>你可以先从商城一键安装，或录入导入规范、验证顺序、输出模板等长期规则。</span>
        </div>

        <div v-else class="resource-scroll-area">
          <div class="resource-list">
          <article v-for="skill in filteredSkills" :key="skill.id" class="resource-list-item">
            <div class="resource-item-head">
              <div>
                <div class="title-row">
                  <strong>{{ skill.name }}</strong>
                  <span class="status-pill" :class="{ 'is-enabled': skill.enabled, 'is-disabled': !skill.enabled }">
                    {{ skill.enabled ? '已启用' : '已停用' }}
                  </span>
                </div>
                <p>{{ skill.description || '未填写用途说明' }}</p>
              </div>
              <div class="item-actions">
                <button class="btn btn-secondary btn-sm" @click="startEditSkill(skill)">编辑</button>
                <button class="btn btn-secondary btn-sm" :disabled="togglingSkillId === skill.id" @click="toggleSkill(skill)">
                  {{ skill.enabled ? '停用' : '启用' }}
                </button>
                <button class="btn btn-secondary btn-sm btn-danger" :disabled="removingSkillId === skill.id" @click="removeSkill(skill)">
                  {{ removingSkillId === skill.id ? '移除中...' : '移除' }}
                </button>
              </div>
            </div>

            <div class="resource-meta-grid">
              <div>
                <span class="meta-label">技能 ID</span>
                <strong>{{ skill.id }}</strong>
              </div>
              <div>
                <span class="meta-label">来源</span>
                <strong>{{ skill.source === 'ai' ? 'AI 安装' : '手动录入' }}</strong>
              </div>
              <div>
                <span class="meta-label">更新时间</span>
                <strong>{{ formatDateTime(skill.updatedAt) }}</strong>
              </div>
            </div>

            <div class="skill-content-box">
              <span class="meta-label">技能内容</span>
              <p>{{ skill.content }}</p>
            </div>
          </article>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import type { AIManagedMCPServer, AIManagedMCPServerInspection, AIManagedSkill } from '@/types'
import { useAIResourcesStore } from '@/stores/aiResources'
import { createManagedMcpServerSignature, createManagedResourceId, createManagedSkillSignature } from '@/utils/aiManagedResources'
import {
  MCP_MARKETPLACE_ITEMS,
  SKILL_MARKETPLACE_ITEMS,
  listMcpMarketplaceItems,
  listSkillMarketplaceItems,
  type MCPMarketplaceItem,
  type MarketplaceSourceRef,
  type SkillMarketplaceItem
} from '@/utils/aiResourceMarketplace'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'

type ServerHealthReport = {
  success: boolean
  message: string
  output: string
  toolNames: string[]
  checkedAt: number
}

const props = defineProps<{ searchQuery?: string }>()

const resourcesStore = useAIResourcesStore()
const supportsManagedMcp = typeof window !== 'undefined' && Boolean(window.electronAPI?.mcpInspectManagedServer)
const marketplaceSearchQuery = ref('')
const normalizedQuery = computed(() => [normalizeSearchQuery(props.searchQuery), normalizeSearchQuery(marketplaceSearchQuery.value)].filter(Boolean).join(' '))
const mcpMarketplaceItems = ref<MCPMarketplaceItem[]>(MCP_MARKETPLACE_ITEMS)
const skillMarketplaceItems = ref<SkillMarketplaceItem[]>(SKILL_MARKETPLACE_ITEMS)
const activePanel = ref<'marketplace' | 'mcp' | 'skills'>('marketplace')
const mcpPanelRef = ref<HTMLElement | null>(null)
const serverNameInputRef = ref<HTMLInputElement | null>(null)
const loadingMarketplace = ref(false)
const refreshingMarketplace = ref(false)
const marketplaceStatus = ref('')
const marketplaceLoadError = ref('')
const mcpMarketplaceSourceCount = computed(() => new Set(mcpMarketplaceItems.value.flatMap(item => item.sources.map(source => source.id))).size)
const skillMarketplaceSourceCount = computed(() => new Set(skillMarketplaceItems.value.flatMap(item => item.sources.map(source => source.id))).size)

const serverMode = ref<'package' | 'command'>('package')
const serverSubmitting = ref(false)
const serverSubmitStatus = ref('')
const refreshingServerId = ref('')
const checkingServerId = ref('')
const togglingServerId = ref('')
const removingServerId = ref('')
const installingMarketplaceMcpId = ref('')
const installingMarketplaceSkillId = ref('')

const skillForm = reactive({
  id: '',
  name: '',
  description: '',
  content: '',
  enabled: true
})
const editingSkillId = ref('')
const savingSkill = ref(false)
const togglingSkillId = ref('')
const removingSkillId = ref('')

const serverForm = reactive({
  id: '',
  name: '',
  description: '',
  packageName: '',
  entryCommand: '',
  command: '',
  argsText: '',
  envText: '',
  cwd: '',
  enabled: true
})

const serverHealthReports = reactive<Record<string, ServerHealthReport>>({})

const installedMcpMarketplaceKeys = computed(() => new Set(resourcesStore.registry.mcpServers.map(server => createManagedMcpServerSignature(server))))
const installedSkillMarketplaceKeys = computed(() => new Set(resourcesStore.registry.skills.map(skill => createManagedSkillSignature(skill))))

const filteredServers = computed(() => {
  const query = normalizedQuery.value
  return resourcesStore.registry.mcpServers.filter(server => matchesSearchQuery(
    query,
    '托管',
    'mcp',
    server.id,
    server.name,
    server.description,
    server.packageName,
    server.command,
    server.args,
    server.serverInfo,
    server.tools,
    server.lastError
  ))
})

const filteredSkills = computed(() => {
  const query = normalizedQuery.value
  return resourcesStore.registry.skills.filter(skill => matchesSearchQuery(
    query,
    'skill',
    '技能',
    skill.id,
    skill.name,
    skill.description,
    skill.content
  ))
})

const filteredMcpMarketplace = computed(() => {
  const query = normalizedQuery.value
  return mcpMarketplaceItems.value.filter(item => matchesSearchQuery(
    query,
    'mcp',
    '商城',
    item.id,
    item.name,
    item.description,
    item.packageName,
    item.entryCommand,
    item.sources,
    item.tags,
    item.configurationHint
  ))
})

const filteredSkillMarketplace = computed(() => {
  const query = normalizedQuery.value
  return skillMarketplaceItems.value.filter(item => matchesSearchQuery(
    query,
    'skill',
    '商城',
    item.id,
    item.name,
    item.description,
    item.content,
    item.sources,
    item.tags
  ))
})

const enabledToolCount = computed(() => resourcesStore.enabledManagedMcpTools.length)
const submitServerDisabled = computed(() => {
  if (serverSubmitting.value || !supportsManagedMcp || !serverForm.name.trim()) {
    return true
  }

  if (serverMode.value === 'package') {
    return !serverForm.packageName.trim()
  }

  return !serverForm.command.trim()
})
const saveSkillDisabled = computed(() => savingSkill.value || !skillForm.name.trim() || !skillForm.content.trim())

function parseLineList(text: string) {
  return text
    .split(/\r?\n/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseEnvText(text: string) {
  const lines = parseLineList(text)
  if (lines.length === 0) {
    return { value: undefined as Record<string, string> | undefined }
  }

  const env: Record<string, string> = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      return { error: `环境变量第 ${index + 1} 行格式错误，必须写成 KEY=VALUE` }
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (!key) {
      return { error: `环境变量第 ${index + 1} 行缺少键名` }
    }

    env[key] = value
  }

  return { value: env }
}

function renderCommand(server: AIManagedMCPServer) {
  return [server.command, ...server.args].join(' ').trim()
}

function renderEnv(env: Record<string, string>) {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')
}

function renderEnvText(env?: Record<string, string>) {
  return env ? Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') : ''
}

function formatDateTime(value: number) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '未记录'
}

function truncateText(text: string, maxLength = 220) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function renderMarketplaceSources(sources: MarketplaceSourceRef[]) {
  return sources.map(source => source.name).join(' / ')
}

function isInstalledMcpMarketplaceItem(item: MCPMarketplaceItem) {
  return installedMcpMarketplaceKeys.value.has(item.installKey)
}

function isInstalledSkillMarketplaceItem(item: SkillMarketplaceItem) {
  return installedSkillMarketplaceKeys.value.has(item.installKey)
}

function getServerHealthReport(serverId: string) {
  return serverHealthReports[serverId]
}

function createHealthReport(inspection: AIManagedMCPServerInspection): ServerHealthReport {
  const toolNames = inspection.tools.map(tool => tool.name)
  return {
    success: inspection.success,
    message: inspection.success
      ? `服务器可以正常启动，并返回 ${toolNames.length} 个工具。`
      : inspection.error || '服务器启动失败，未能返回工具列表。',
    output: truncateText(inspection.output || inspection.error || '', 360),
    toolNames,
    checkedAt: Date.now()
  }
}

function resetServerForm() {
  serverMode.value = 'package'
  serverForm.id = ''
  serverForm.name = ''
  serverForm.description = ''
  serverForm.packageName = ''
  serverForm.entryCommand = ''
  serverForm.command = ''
  serverForm.argsText = ''
  serverForm.envText = ''
  serverForm.cwd = ''
  serverForm.enabled = true
  serverSubmitStatus.value = ''
}

function resetSkillForm() {
  editingSkillId.value = ''
  skillForm.id = ''
  skillForm.name = ''
  skillForm.description = ''
  skillForm.content = ''
  skillForm.enabled = true
}

function jumpToMcpManagement(focusField = false) {
  activePanel.value = 'mcp'
  void nextTick(() => {
    mcpPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (focusField) {
      serverNameInputRef.value?.focus()
      serverNameInputRef.value?.select()
    }
  })
}

function fillServerFormFromMarketplace(item: MCPMarketplaceItem, options: { switchPanel?: boolean; focusField?: boolean } = {}) {
  serverMode.value = item.packageName ? 'package' : 'command'
  serverForm.id = item.id
  serverForm.name = item.name
  serverForm.description = item.description
  serverForm.packageName = item.packageName || ''
  serverForm.entryCommand = item.entryCommand || ''
  serverForm.command = item.command || ''
  serverForm.argsText = (item.args || []).join('\n')
  serverForm.envText = renderEnvText(item.env)
  serverForm.cwd = item.cwd || ''
  serverForm.enabled = true
  serverSubmitStatus.value = item.configurationHint || `已加载 ${item.name} 的接入模板，可继续补充参数后安装。`

  if (options.switchPanel) {
    jumpToMcpManagement(Boolean(options.focusField))
  }
}

function fillSkillFormFromMarketplace(item: SkillMarketplaceItem) {
  editingSkillId.value = ''
  skillForm.id = item.id
  skillForm.name = item.name
  skillForm.description = item.description
  skillForm.content = item.content
  skillForm.enabled = true
}

async function ensureStoreReady() {
  if (!resourcesStore.loaded) {
    await resourcesStore.init()
  }
}

async function loadMarketplaceCatalogs(forceRefresh = false) {
  if (forceRefresh) {
    refreshingMarketplace.value = true
  } else {
    loadingMarketplace.value = true
  }

  marketplaceLoadError.value = ''

  try {
    const [nextMcpItems, nextSkillItems] = await Promise.all([
      listMcpMarketplaceItems(forceRefresh),
      listSkillMarketplaceItems(forceRefresh)
    ])

    mcpMarketplaceItems.value = nextMcpItems
    skillMarketplaceItems.value = nextSkillItems
    marketplaceStatus.value = `已同步 ${mcpMarketplaceSourceCount.value} 个 MCP 来源与 ${skillMarketplaceSourceCount.value} 个 Skill 来源。`
  } catch (error) {
    marketplaceLoadError.value = error instanceof Error ? error.message : '远程商城同步失败，已回退到内置目录。'
  } finally {
    loadingMarketplace.value = false
    refreshingMarketplace.value = false
  }
}

async function refreshMarketplaceCatalogs() {
  await loadMarketplaceCatalogs(true)
}

async function registerManagedServer(payload: {
  id: string
  name: string
  description: string
  packageName?: string
  entryCommand?: string
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
}) {
  if (!supportsManagedMcp) {
    showToast('warning', '当前环境不支持托管 MCP，请在桌面版中使用该功能')
    return
  }

  await ensureStoreReady()
  serverSubmitting.value = true
  serverSubmitStatus.value = ''

  try {
    const serverId = createManagedResourceId(
      payload.id.trim() || payload.name.trim() || payload.packageName?.trim() || payload.command.trim(),
      'mcp_server'
    )
    const duplicatedServer = resourcesStore.findManagedMcpServerBySignature({
      packageName: payload.packageName?.trim() || undefined,
      entryCommand: payload.entryCommand?.trim() || undefined,
      command: payload.command.trim(),
      args: payload.args,
      env: payload.env,
      cwd: payload.cwd?.trim() || undefined
    })

    if (duplicatedServer && duplicatedServer.id !== serverId) {
      serverSubmitStatus.value = `服务器 ${duplicatedServer.name} 已存在，无需重复安装。`
      showToast('info', `服务器 ${duplicatedServer.name} 已存在，无需重复安装`)
      return
    }

    const existingServer = resourcesStore.getManagedMcpServer(serverId)
    const now = Date.now()
    const createdAt = existingServer?.createdAt || now
    let command = payload.command.trim()
    let launchArgs = payload.args
    let installDirectory = existingServer?.installDirectory
    let installedAt = existingServer?.installedAt

    if (serverMode.value === 'package') {
      const installResult = await window.electronAPI.mcpInstallManagedPackage({
        serverId,
        packageName: payload.packageName?.trim() || '',
        entryCommand: payload.entryCommand?.trim() || undefined,
        args: payload.args
      })

      if (!installResult.success) {
        throw new Error(installResult.error || '托管 MCP 包安装失败')
      }

      command = installResult.command
      launchArgs = installResult.args
      installDirectory = installResult.installDirectory
      installedAt = now
    }

    const inspection = await window.electronAPI.mcpInspectManagedServer({
      command,
      args: launchArgs,
      env: payload.env,
      cwd: payload.cwd?.trim() || installDirectory || undefined
    })

    await resourcesStore.upsertManagedMcpServer({
      id: serverId,
      name: payload.name.trim(),
      description: payload.description.trim(),
      enabled: inspection.success ? payload.enabled : false,
      packageName: serverMode.value === 'package' ? payload.packageName?.trim() || undefined : existingServer?.packageName,
      installDirectory,
      entryCommand: serverMode.value === 'package' ? payload.entryCommand?.trim() || undefined : existingServer?.entryCommand,
      command,
      args: launchArgs,
      env: payload.env,
      cwd: payload.cwd?.trim() || installDirectory || undefined,
      source: 'user',
      createdAt,
      updatedAt: now,
      installedAt,
      lastError: inspection.error,
      serverInfo: inspection.serverInfo,
      tools: inspection.tools
    })

    serverHealthReports[serverId] = createHealthReport(inspection)

    if (!inspection.success) {
      serverSubmitStatus.value = '服务器已登记，但健康检查失败；已自动保持停用，请修正命令后重新检查。'
      showToast('warning', inspection.error || '服务器健康检查失败')
      return
    }

    serverSubmitStatus.value = `服务器 ${payload.name.trim()} 已接入，并通过健康检查，返回 ${inspection.tools.length} 个工具。`
    showToast('success', `服务器 ${payload.name.trim()} 已接入`)
    resetServerForm()
  } catch (error) {
    const message = error instanceof Error ? error.message : '托管 MCP 服务器接入失败'
    serverSubmitStatus.value = message
    showToast('error', message)
  } finally {
    serverSubmitting.value = false
  }
}

async function submitServerForm() {
  const envParseResult = parseEnvText(serverForm.envText)
  if (envParseResult.error) {
    showToast('warning', envParseResult.error)
    return
  }

  const args = parseLineList(serverForm.argsText)
  await registerManagedServer({
    id: serverForm.id,
    name: serverForm.name,
    description: serverForm.description,
    packageName: serverForm.packageName,
    entryCommand: serverForm.entryCommand,
    command: serverForm.command,
    args,
    env: envParseResult.value,
    cwd: serverForm.cwd,
    enabled: serverForm.enabled
  })
}

async function syncExistingServer(server: AIManagedMCPServer, intent: 'refresh' | 'health') {
  const inspection = await window.electronAPI.mcpInspectManagedServer({
    command: server.command,
    args: server.args,
    env: server.env,
    cwd: server.cwd
  })

  await resourcesStore.upsertManagedMcpServer({
    ...server,
    enabled: inspection.success ? server.enabled : false,
    updatedAt: Date.now(),
    lastError: inspection.error,
    serverInfo: inspection.serverInfo,
    tools: inspection.tools
  })

  serverHealthReports[server.id] = createHealthReport(inspection)

  if (!inspection.success) {
    showToast('warning', inspection.error || `服务器 ${server.name} ${intent === 'health' ? '健康检查' : '刷新'}失败`)
    return
  }

  showToast('success', intent === 'health' ? `服务器 ${server.name} 健康检查通过` : `服务器 ${server.name} 的工具列表已刷新`)
}

async function refreshServer(server: AIManagedMCPServer) {
  if (!supportsManagedMcp) {
    showToast('warning', '当前环境不支持刷新托管 MCP 服务器')
    return
  }

  refreshingServerId.value = server.id
  try {
    await syncExistingServer(server, 'refresh')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '刷新托管 MCP 服务器失败')
  } finally {
    refreshingServerId.value = ''
  }
}

async function runHealthCheck(server: AIManagedMCPServer) {
  if (!supportsManagedMcp) {
    showToast('warning', '当前环境不支持托管 MCP 健康检查')
    return
  }

  checkingServerId.value = server.id
  try {
    await syncExistingServer(server, 'health')
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '托管 MCP 健康检查失败')
  } finally {
    checkingServerId.value = ''
  }
}

async function installMarketplaceMcp(item: MCPMarketplaceItem) {
  if (!supportsManagedMcp) {
    showToast('warning', '当前环境不支持托管 MCP 安装，请在桌面版中使用')
    return
  }

  await ensureStoreReady()

  if (isInstalledMcpMarketplaceItem(item)) {
    showToast('info', `${item.name} 已安装，无需重复安装`)
    return
  }

  fillServerFormFromMarketplace(item, {
    switchPanel: !item.quickInstallable,
    focusField: !item.quickInstallable
  })

  if (!item.quickInstallable) {
    showToast('info', item.configurationHint || `已加载 ${item.name} 模板，请按你的环境修正参数后再安装。`)
    return
  }

  const envParseResult = parseEnvText(serverForm.envText)
  if (envParseResult.error) {
    showToast('warning', envParseResult.error)
    return
  }

  installingMarketplaceMcpId.value = item.id
  try {
    await registerManagedServer({
      id: item.id,
      name: item.name,
      description: item.description,
      packageName: item.packageName,
      entryCommand: item.entryCommand,
      command: item.command || '',
      args: item.args || [],
      env: envParseResult.value,
      cwd: item.cwd,
      enabled: true
    })
  } finally {
    installingMarketplaceMcpId.value = ''
  }
}

async function toggleServer(server: AIManagedMCPServer) {
  togglingServerId.value = server.id
  try {
    await resourcesStore.setManagedMcpServerEnabled(server.id, !server.enabled)
    showToast('success', server.enabled ? `已停用 ${server.name}` : `已启用 ${server.name}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '切换托管 MCP 状态失败')
  } finally {
    togglingServerId.value = ''
  }
}

async function removeServer(server: AIManagedMCPServer) {
  if (!window.confirm(`确定移除托管 MCP 服务器“${server.name}”吗？`)) {
    return
  }

  removingServerId.value = server.id
  try {
    await resourcesStore.removeManagedMcpServer(server.id)
    delete serverHealthReports[server.id]
    showToast('success', `已移除 ${server.name}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '移除托管 MCP 服务器失败')
  } finally {
    removingServerId.value = ''
  }
}

function startEditSkill(skill: AIManagedSkill) {
  editingSkillId.value = skill.id
  skillForm.id = skill.id
  skillForm.name = skill.name
  skillForm.description = skill.description
  skillForm.content = skill.content
  skillForm.enabled = skill.enabled
}

async function installMarketplaceSkill(item: SkillMarketplaceItem) {
  await ensureStoreReady()

  if (isInstalledSkillMarketplaceItem(item)) {
    showToast('info', `${item.name} 已安装，无需重复安装`)
    return
  }

  installingMarketplaceSkillId.value = item.id

  try {
    await resourcesStore.upsertManagedSkill({
      id: item.id,
      name: item.name,
      description: item.description,
      content: item.content,
      enabled: true,
      source: 'user'
    })
    showToast('success', `技能 ${item.name} 已安装`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '安装技能失败')
  } finally {
    installingMarketplaceSkillId.value = ''
  }
}

async function submitSkillForm() {
  await ensureStoreReady()
  savingSkill.value = true

  try {
    const duplicatedSkill = resourcesStore.findManagedSkillBySignature({
      name: skillForm.name.trim(),
      content: skillForm.content.trim()
    })

    if (duplicatedSkill && duplicatedSkill.id !== editingSkillId.value) {
      showToast('info', `技能 ${duplicatedSkill.name} 已存在，无需重复保存`)
      return
    }

    await resourcesStore.upsertManagedSkill({
      id: skillForm.id.trim() || undefined,
      name: skillForm.name.trim(),
      description: skillForm.description.trim(),
      content: skillForm.content.trim(),
      enabled: skillForm.enabled,
      source: 'user'
    })

    showToast('success', editingSkillId.value ? `技能 ${skillForm.name.trim()} 已更新` : `技能 ${skillForm.name.trim()} 已创建`)
    resetSkillForm()
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '保存技能失败')
  } finally {
    savingSkill.value = false
  }
}

async function toggleSkill(skill: AIManagedSkill) {
  togglingSkillId.value = skill.id
  try {
    await resourcesStore.setManagedSkillEnabled(skill.id, !skill.enabled)
    showToast('success', skill.enabled ? `已停用 ${skill.name}` : `已启用 ${skill.name}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '切换技能状态失败')
  } finally {
    togglingSkillId.value = ''
  }
}

async function removeSkill(skill: AIManagedSkill) {
  if (!window.confirm(`确定移除技能“${skill.name}”吗？`)) {
    return
  }

  removingSkillId.value = skill.id
  try {
    await resourcesStore.removeManagedSkill(skill.id)
    if (editingSkillId.value === skill.id) {
      resetSkillForm()
    }
    showToast('success', `已移除 ${skill.name}`)
  } catch (error) {
    showToast('error', error instanceof Error ? error.message : '移除技能失败')
  } finally {
    removingSkillId.value = ''
  }
}

onMounted(() => {
  void Promise.all([
    ensureStoreReady(),
    loadMarketplaceCatalogs()
  ])
})
</script>

<style lang="scss" scoped>
.managed-resource-panel {
  display: grid;
  gap: 16px;
  min-height: 0;
}

.resource-panel-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.resource-panel-tab {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  color: var(--text-secondary);
  font-weight: 700;
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    border-color: transparent;
    color: var(--text-inverse);
  }
}

.marketplace-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.toolbar-search {
  min-width: 0;
}

.toolbar-actions,
.toolbar-status-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.resource-summary-card,
.resource-card {
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.54);
}

.resource-summary-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;

  strong {
    color: var(--text-primary);
    font-size: 24px;
    line-height: 1;
  }

  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }

  &.is-disabled strong {
    color: var(--text-secondary);
  }
}

.summary-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.resource-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 16px;
}

.marketplace-grid-layout {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.resource-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
}

.resource-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > div {
    min-width: 0;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 18px;
  }

  p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.7;
  }
}

.resource-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.12);
  color: #2d4f99;
  font-size: 12px;
  font-weight: 700;
}

.resource-mode-switch {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid var(--border);
  width: fit-content;
}

.mode-btn {
  min-height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse);
  }
}

.resource-form-grid,
.resource-meta-grid,
.resource-extra-grid,
.marketplace-meta-grid {
  display: grid;
  gap: 12px;
}

.resource-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.resource-meta-grid,
.marketplace-meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.resource-extra-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.field-block {
  display: grid;
  gap: 8px;

  span {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }
}

.field-block-wide {
  grid-column: 1 / -1;
}

.resource-input,
.resource-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: var(--text-primary);
  padding: 12px 14px;
}

.resource-textarea {
  resize: vertical;
  min-height: 108px;
  line-height: 1.7;
}

.inline-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}

.resource-tip {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(93, 135, 255, 0.08);

  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.compact-tip {
  padding: 10px 12px;
}

.resource-actions,
.item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-empty,
.resource-empty-inline {
  display: grid;
  gap: 6px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(247, 248, 252, 0.82);
  color: var(--text-secondary);
}

.resource-list {
  display: grid;
  gap: 14px;
}

.resource-scroll-area {
  min-height: 0;
  max-height: min(62vh, 720px);
  overflow: auto;
  padding-right: 4px;
}

.resource-list-item,
.marketplace-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.72);
  min-width: 0;
}

.resource-item-head,
.marketplace-card-head,
.title-row,
.health-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > div {
    min-width: 0;
  }
}

.title-row {
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.marketplace-source-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.marketplace-card-head p,
.resource-item-head p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-secondary);

  &.is-enabled {
    background: rgba(92, 201, 167, 0.16);
    color: #247355;
  }

  &.is-disabled {
    background: rgba(190, 198, 214, 0.28);
    color: #647089;
  }
}

.meta-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.resource-meta-grid > div,
.resource-extra-grid > div,
.marketplace-meta-grid > div,
.tool-chip-card {
  min-width: 0;
}

.resource-meta-grid strong,
.resource-extra-grid strong,
.marketplace-meta-grid strong,
.title-row strong {
  display: block;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.resource-command-box,
.skill-preview-box,
.skill-content-box,
.resource-health-box,
.resource-error-box {
  padding: 14px;
  border-radius: 16px;
  background: rgba(247, 248, 252, 0.86);
}

.resource-command-box code,
.health-output {
  display: block;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text-primary);
}

.resource-health-box {
  display: grid;
  gap: 10px;

  &.is-success {
    background: rgba(92, 201, 167, 0.14);
  }

  &.is-error {
    background: rgba(230, 83, 108, 0.12);
  }

  p,
  small {
    margin: 0;
    color: var(--text-secondary);
  }

  strong {
    color: var(--text-primary);
  }
}

.health-tool-grid,
.tool-chip-grid,
.marketplace-card-grid,
.marketplace-tag-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.marketplace-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.marketplace-tag,
.marketplace-source-pill,
.tool-chip-card {
  border-radius: 999px;
}

.marketplace-tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  background: rgba(93, 135, 255, 0.1);
  color: #2d4f99;
  font-size: 12px;
  font-weight: 600;
}

.marketplace-source-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;

  &.is-official {
    background: rgba(92, 201, 167, 0.16);
    color: #247355;
  }

  &.is-curated {
    background: rgba(246, 178, 76, 0.2);
    color: #94610d;
  }

  &.is-builtin {
    background: rgba(93, 135, 255, 0.12);
    color: #2d4f99;
  }
}

.tool-chip-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);

  strong,
  span,
  small {
    color: var(--text-primary);
  }

  span {
    font-size: 12px;
    color: var(--primary);
  }

  small {
    color: var(--text-secondary);
    line-height: 1.6;
  }
}

.tool-list-box summary {
  cursor: pointer;
  color: var(--text-primary);
  font-weight: 600;
}

.resource-error-box p,
.skill-preview-box p,
.skill-content-box p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.8;
  white-space: pre-wrap;
}

@media (max-width: 1280px) {
  .resource-summary-grid,
  .resource-grid,
  .marketplace-grid-layout,
  .marketplace-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .marketplace-toolbar,
  .resource-summary-grid,
  .resource-grid,
  .marketplace-grid-layout,
  .resource-form-grid,
  .resource-meta-grid,
  .resource-extra-grid,
  .marketplace-meta-grid,
  .marketplace-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-card-head,
  .resource-item-head,
  .marketplace-card-head,
  .health-head,
  .toolbar-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
