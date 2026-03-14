<template>
  <section class="ide-mcp-panel glass-panel">
    <div class="panel-head">
      <div>
        <p class="panel-eyebrow">Resources</p>
        <h3>MCP 列表</h3>
      </div>
      <div class="panel-actions">
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="reloadResources(true)">刷新</button>
        <button class="btn btn-ghost btn-sm" @click="openAiSettings">管理</button>
      </div>
    </div>

    <div class="panel-summary">
      <span class="summary-pill">服务器 {{ servers.length }}</span>
      <span class="summary-pill">启用 {{ enabledCount }}</span>
      <span class="summary-pill">工具 {{ toolCount }}</span>
      <span v-if="errorCount > 0" class="summary-pill is-error">异常 {{ errorCount }}</span>
    </div>

    <div v-if="loading" class="panel-empty">
      <p>正在加载 MCP 资源...</p>
    </div>

    <div v-else-if="servers.length === 0" class="panel-empty">
      <p>当前还没有托管 MCP。</p>
      <small>你可以在 AI 设置里安装或配置 MCP，IDE 左下角会同步显示可用服务器。</small>
    </div>

    <div v-else class="server-list">
      <article
        v-for="server in servers"
        :key="server.id"
        class="server-card"
        :class="{
          'is-enabled': server.enabled,
          'is-error': Boolean(server.lastError),
        }"
      >
        <div class="server-head">
          <div class="server-title">
            <span class="server-indicator" :class="statusClass(server)" />
            <strong>{{ server.name }}</strong>
          </div>
          <span class="server-pill">{{ server.tools.length }} tools</span>
        </div>

        <p class="server-copy">{{ server.description || server.command || server.packageName || '未填写说明' }}</p>

        <div class="server-meta">
          <span>{{ server.enabled ? '已启用' : '已禁用' }}</span>
          <span>{{ server.source === 'user' ? '用户配置' : 'AI / Marketplace' }}</span>
        </div>

        <div v-if="server.lastError" class="server-error">
          {{ server.lastError }}
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAIResourcesStore } from '@/stores/aiResources'

const router = useRouter()
const aiResourcesStore = useAIResourcesStore()
const loading = ref(false)

const servers = computed(() => aiResourcesStore.registry.mcpServers)
const enabledCount = computed(() => servers.value.filter(server => server.enabled).length)
const toolCount = computed(() => servers.value.reduce((total, server) => total + server.tools.length, 0))
const errorCount = computed(() => servers.value.filter(server => Boolean(server.lastError)).length)

onMounted(async () => {
  await reloadResources(false)
})

async function reloadResources(force = true) {
  if (loading.value || (!force && aiResourcesStore.loaded)) {
    return
  }

  loading.value = true
  try {
    await aiResourcesStore.init()
  } finally {
    loading.value = false
  }
}

function openAiSettings() {
  void router.push('/ai-settings')
}

function statusClass(server: { enabled: boolean; lastError?: string }) {
  if (server.lastError) {
    return 'is-error'
  }

  return server.enabled ? 'is-online' : 'is-idle'
}
</script>

<style scoped lang="scss">
.ide-mcp-panel {
  display: grid;
  gap: $spacing-sm;
  min-height: 0;
  padding: 10px;
}

.panel-head,
.server-head,
.server-title,
.panel-summary,
.panel-actions,
.server-meta {
  display: flex;
  align-items: center;
}

.panel-head,
.server-head {
  justify-content: space-between;
  gap: $spacing-sm;
}

.panel-actions {
  gap: 6px;
}

.panel-head h3,
.panel-head p,
.server-copy {
  margin: 0;
}

.panel-eyebrow {
  color: var(--text-muted);
  font-size: $font-xs;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.panel-summary,
.server-meta {
  flex-wrap: wrap;
  gap: 6px;
}

.summary-pill,
.server-pill {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: $font-xs;
  color: var(--text-secondary);
  background: rgba(15, 23, 42, 0.05);
}

.summary-pill.is-error {
  color: #ffb2aa;
  background: rgba(238, 96, 85, 0.12);
}

.server-list {
  display: grid;
  gap: $spacing-sm;
  min-height: 0;
  overflow: auto;
}

.server-card {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  border-radius: $border-radius-md;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.04);
}

.server-card.is-enabled {
  border-color: rgba(121, 195, 103, 0.26);
}

.server-card.is-error {
  border-color: rgba(238, 96, 85, 0.28);
}

.server-title {
  gap: 8px;
  min-width: 0;

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: $font-base;
  }
}

.server-indicator {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.2);
}

.server-indicator.is-online {
  background: #79c367;
  box-shadow: 0 0 0 4px rgba(121, 195, 103, 0.12);
}

.server-indicator.is-idle {
  background: rgba(255, 255, 255, 0.28);
}

.server-indicator.is-error {
  background: #ee6055;
  box-shadow: 0 0 0 4px rgba(238, 96, 85, 0.12);
}

.server-copy,
.server-meta,
.panel-empty small {
  color: var(--text-secondary);
  line-height: 1.5;
}

.server-copy {
  font-size: $font-sm;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.server-meta {
  gap: 10px;
  font-size: $font-xs;
}

.server-error {
  color: #ff8c82;
  font-size: $font-xs;
  line-height: 1.45;
}

.panel-empty {
  display: grid;
  gap: 6px;
  place-items: start;
  padding: 10px 0;

  p,
  small {
    margin: 0;
  }
}
</style>
