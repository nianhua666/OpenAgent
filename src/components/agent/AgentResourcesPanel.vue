<template>
  <section class="agent-resources-panel glass-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Resources</p>
        <h3>MCP / Skill</h3>
      </div>
      <button class="panel-btn secondary" :disabled="loading" @click="reloadResources(true)">
        {{ loading ? '刷新中' : '刷新' }}
      </button>
    </div>

    <p class="panel-copy">
      当前面板用于确认 {{ agentName || '当前角色' }} 的托管资源边界。这里展示的是工作台内可用的 MCP 服务、Skill 规则与角色授权状态，方便在对话前快速确认“当前角色是否能调这些能力”。
    </p>

    <div class="status-grid">
      <article class="status-card" :class="{ 'is-disabled': !mcpEnabled }">
        <div class="status-card-head">
          <strong>MCP</strong>
          <span class="status-pill" :class="mcpEnabled ? 'is-enabled' : 'is-disabled'">{{ mcpEnabled ? '已授权' : '已禁用' }}</span>
        </div>
        <p>{{ enabledServerCount }} 个已启用服务，{{ errorServerCount }} 个异常</p>
      </article>

      <article class="status-card" :class="{ 'is-disabled': !skillEnabled }">
        <div class="status-card-head">
          <strong>Skill</strong>
          <span class="status-pill" :class="skillEnabled ? 'is-enabled' : 'is-disabled'">{{ skillEnabled ? '已授权' : '已禁用' }}</span>
        </div>
        <p>{{ enabledSkillCount }} 个已启用技能，{{ registry.skills.length }} 个总条目</p>
      </article>
    </div>

    <div class="resource-section">
      <div class="section-head">
        <strong>托管 MCP</strong>
        <span class="section-meta">{{ enabledServerCount }}/{{ registry.mcpServers.length }}</span>
      </div>

      <div v-if="registry.mcpServers.length === 0" class="panel-empty">
        <p>当前还没有托管 MCP。</p>
        <small>你可以在 AI 设置里安装或配置 MCP，再回到这里检查角色是否允许调用。</small>
      </div>

      <div v-else class="resource-list">
        <article
          v-for="server in visibleServers"
          :key="server.id"
          class="resource-card"
          :class="{ 'is-error': Boolean(server.lastError), 'is-disabled': !server.enabled }"
        >
          <div class="resource-card-head">
            <strong>{{ server.name }}</strong>
            <span class="status-dot" :class="server.lastError ? 'is-error' : server.enabled ? 'is-enabled' : 'is-idle'" />
          </div>
          <p>{{ server.description || server.command || '未填写说明' }}</p>
          <div class="resource-meta">
            <span>{{ server.tools.length }} tools</span>
            <span>{{ server.source === 'user' ? '手动配置' : 'AI / Marketplace' }}</span>
          </div>
          <small v-if="server.lastError" class="resource-error">{{ server.lastError }}</small>
        </article>
      </div>
    </div>

    <div class="resource-section">
      <div class="section-head">
        <strong>托管 Skill</strong>
        <span class="section-meta">{{ enabledSkillCount }}/{{ registry.skills.length }}</span>
      </div>

      <div v-if="registry.skills.length === 0" class="panel-empty">
        <p>当前还没有托管 Skill。</p>
        <small>把稳定规则、代码规范或产品约束做成 Skill，会比一次性塞进会话上下文更稳。</small>
      </div>

      <div v-else class="resource-list">
        <article
          v-for="skill in visibleSkills"
          :key="skill.id"
          class="resource-card"
          :class="{ 'is-disabled': !skill.enabled }"
        >
          <div class="resource-card-head">
            <strong>{{ skill.name }}</strong>
            <span class="status-pill" :class="skill.enabled ? 'is-enabled' : 'is-disabled'">{{ skill.enabled ? '启用' : '停用' }}</span>
          </div>
          <p>{{ skill.description || '未填写说明' }}</p>
          <div class="resource-meta">
            <span>{{ skill.source === 'user' ? '手动录入' : 'AI 安装' }}</span>
            <span>{{ formatTime(skill.updatedAt) }}</span>
          </div>
        </article>
      </div>
    </div>

    <div class="panel-foot">
      <button class="panel-btn secondary" @click="openAiSettings()">AI 设置</button>
      <button class="panel-btn primary" @click="openAiSettings('resources')">管理资源</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { useAIResourcesStore } from '@/stores/aiResources'

const props = defineProps<{
  agentName?: string
  mcpEnabled: boolean
  skillEnabled: boolean
}>()

const router = useRouter()
const resourcesStore = useAIResourcesStore()
const loading = ref(false)

const registry = computed(() => resourcesStore.registry)
const enabledServerCount = computed(() => resourcesStore.enabledManagedMcpServers.length)
const errorServerCount = computed(() => registry.value.mcpServers.filter(server => Boolean(server.lastError)).length)
const enabledSkillCount = computed(() => resourcesStore.enabledSkills.length)
const visibleServers = computed(() => registry.value.mcpServers.slice(0, 4))
const visibleSkills = computed(() => registry.value.skills.slice(0, 4))

onMounted(async () => {
  await reloadResources(false)
})

async function reloadResources(force = true) {
  if (loading.value || (!force && resourcesStore.loaded)) {
    return
  }

  loading.value = true
  try {
    await resourcesStore.init()
  } finally {
    loading.value = false
  }
}

function openAiSettings(section?: string) {
  void router.push({
    path: '/ai-settings',
    query: section ? { section } : undefined,
  })
}

function formatTime(timestamp: number) {
  return dayjs(timestamp).format('MM/DD HH:mm')
}
</script>

<style scoped lang="scss">
.agent-resources-panel {
  display: grid;
  gap: 10px;
  min-height: 0;
  padding: 10px;
}

.panel-head,
.status-card-head,
.section-head,
.panel-foot,
.resource-card-head,
.resource-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.eyebrow,
h3,
p,
small {
  margin: 0;
}

.eyebrow {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.panel-copy,
.status-card p,
.resource-card p,
.panel-empty small,
.resource-meta {
  color: var(--text-secondary);
  line-height: 1.5;
}

.status-grid,
.resource-list,
.resource-section {
  display: grid;
  gap: 8px;
  min-height: 0;
}

.status-card,
.resource-card {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.status-card.is-disabled,
.resource-card.is-disabled {
  opacity: 0.72;
}

.resource-card.is-error {
  border-color: rgba(238, 96, 85, 0.28);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.status-pill.is-enabled {
  color: #79c367;
  background: rgba(121, 195, 103, 0.12);
}

.status-pill.is-disabled {
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}

.status-dot.is-enabled {
  background: #79c367;
}

.status-dot.is-idle {
  background: rgba(255, 255, 255, 0.35);
}

.status-dot.is-error {
  background: #ee6055;
}

.section-meta {
  color: var(--text-muted);
  font-size: 11px;
}

.resource-meta {
  flex-wrap: wrap;
  font-size: 11px;
}

.resource-error {
  color: #ff9d94;
}

.panel-empty {
  display: grid;
  gap: 4px;
  padding: 4px 0;

  p,
  small {
    margin: 0;
  }
}

.panel-btn {
  min-height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
}

.panel-btn.primary {
  background: linear-gradient(135deg, color-mix(in srgb, var(--agent-accent) 86%, white 14%), rgba(255, 176, 59, 0.9));
  color: #101010;
  font-weight: 700;
}

.panel-btn.secondary {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.panel-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
