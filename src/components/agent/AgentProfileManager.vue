<template>
  <section class="agent-profile-panel glass-panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">Personas</p>
        <h3>多角色 Agent</h3>
      </div>
      <button class="panel-btn primary" :disabled="streaming" @click="startCreate">新建角色</button>
    </div>

    <p class="panel-copy">
      当前域支持切换不同角色。每个角色都可以独立设定系统提示词、长期记忆、文件控制、软件控制、MCP 与 Skill 边界，并覆盖模型、温度和默认产物目录。
    </p>

    <div class="scope-bar">
      <span class="scope-pill">{{ currentScope === 'live2d' ? 'Live2D / 悬浮窗' : '主窗口 Agent' }}</span>
      <span class="scope-hint">
        {{ currentSessionHasMessages ? '当前会话已有消息，新选择会用于后续新会话。' : '当前空会话会直接沿用新选择的角色。' }}
      </span>
    </div>

    <div class="profile-scroll-area">
      <div class="agent-list-shell">
        <div class="agent-list">
          <button
            v-for="agent in agents"
            :key="agent.id"
            class="agent-card"
            :class="{ active: selectedAgentId === agent.id, current: currentAgentId === agent.id }"
            :disabled="streaming"
            @click="$emit('select-agent', agent.id)"
          >
            <div class="agent-card-head">
              <strong>{{ agent.name }}</strong>
              <span class="agent-badge">{{ resolveBadgeLabel(agent) }}</span>
            </div>
            <p>{{ agent.description || '未填写角色说明' }}</p>
            <div class="capability-row">
              <span v-for="badge in getCapabilityBadges(agent)" :key="badge" class="capability-pill">{{ badge }}</span>
            </div>
            <div class="runtime-summary">
              <span class="runtime-pill">模型 {{ agent.preferredModel || '跟随全局' }}</span>
              <span class="runtime-pill">温度 {{ formatTemperature(agent.temperature) }}</span>
              <span class="runtime-pill">目录 {{ agent.preferredArtifactRoot ? '自定义' : '默认' }}</span>
            </div>
            <div class="agent-card-actions">
              <button class="panel-btn secondary" :disabled="streaming" @click.stop="startEdit(agent)">编辑</button>
              <button
                v-if="!agent.isBuiltin"
                class="panel-btn danger"
                :disabled="streaming"
                @click.stop="$emit('delete-agent', agent.id)"
              >
                删除
              </button>
            </div>
          </button>
        </div>
      </div>

      <div class="agent-form-shell">
        <form class="agent-form" @submit.prevent="submitDraft">
          <div class="form-head">
            <div>
              <p class="eyebrow">Editor</p>
              <h4>{{ draft.id ? '编辑角色' : '新建角色' }}</h4>
            </div>
            <div class="form-actions">
              <button v-if="isDirty" type="button" class="panel-btn secondary" @click="resetDraft">恢复</button>
              <button type="submit" class="panel-btn primary" :disabled="!canSubmit">保存</button>
            </div>
          </div>

          <label class="field">
            <span>角色名称</span>
            <input v-model.trim="draft.name" maxlength="24" type="text" placeholder="例如：小柔 / 代码审校官" />
          </label>

          <label class="field">
            <span>角色说明</span>
            <input v-model.trim="draft.description" maxlength="120" type="text" placeholder="用一句话说明这个角色适合做什么" />
          </label>

          <div class="runtime-grid">
            <label class="field">
              <span>角色类型</span>
              <select v-model="draft.personaType">
                <option v-for="item in personaOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
              <small class="field-hint">
                {{ personaOptions.find(item => item.value === draft.personaType)?.description }}
              </small>
            </label>

            <label v-if="draft.personaType === 'emotional'" class="field">
              <span>默认心情</span>
              <input v-model.number="draft.mood" type="range" min="0" max="100" step="1" />
              <small class="field-hint">当前 {{ normalizeMood(draft.mood) }} / 100。只用于内部调节语气和热情度，不在会话页直接展示。</small>
            </label>

            <div v-else class="field field--placeholder">
              <span>执行倾向</span>
              <div class="field-placeholder">功能型角色会优先严格执行需求，并尽量避免情绪表达干扰任务推进。</div>
            </div>
          </div>

          <label class="field">
            <span>系统提示词</span>
            <textarea v-model.trim="draft.systemPrompt" rows="8" placeholder="写清角色人设、语气、执行方式、能力边界和禁用事项" />
          </label>

          <div class="runtime-grid">
            <label class="field">
              <span>默认模型</span>
              <select v-model="draft.preferredModel">
                <option value="">跟随全局模型</option>
                <option v-for="model in availableModels" :key="model.id" :value="model.name">
                  {{ model.label }}
                </option>
              </select>
              <small class="field-hint">角色可覆盖全局模型；多模态任务仍可通过委派模型工具临时调用更合适的模型。</small>
            </label>

            <label class="field">
              <span>温度</span>
              <input v-model.number="draft.temperature" type="number" min="0" max="1.5" step="0.05" />
              <small class="field-hint">Agent 模式支持按角色独立控制输出风格；IDE 模式会固定为最佳开发状态。</small>
            </label>

            <label class="field">
              <span>默认产物目录</span>
              <input
                v-model.trim="draft.preferredArtifactRoot"
                type="text"
                placeholder="留空则使用 Agent 默认目录或 D:/OpenAgent"
              />
              <small class="field-hint">生成 Markdown、脚本、报告和图片时，优先写入这里；用户显式指定目录时以用户要求为准。</small>
            </label>
          </div>

          <div class="toggle-grid">
            <label v-for="toggle in capabilityToggles" :key="toggle.key" class="toggle-card">
              <div>
                <strong>{{ toggle.label }}</strong>
                <p>{{ toggle.description }}</p>
              </div>
              <input
                :checked="Boolean(draft.capabilities[toggle.key])"
                type="checkbox"
                @change="updateCapability(toggle.key, ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>

          <div class="tts-grid">
            <label class="field">
              <span>回复语音</span>
              <select :value="draft.tts.autoPlayReplies ?? false" @change="draft.tts.autoPlayReplies = ($event.target as HTMLSelectElement).value === 'true'">
                <option value="false">手动播放</option>
                <option value="true">自动播放</option>
              </select>
            </label>

            <label class="field">
              <span>TTS 情绪风格</span>
              <select v-model="draft.tts.emotionStyle">
                <option v-for="style in emotionStyles" :key="style" :value="style">{{ style }}</option>
              </select>
            </label>

            <label class="field">
              <span>TTS 情绪强度</span>
              <input v-model.number="draft.tts.emotionIntensity" type="number" min="0.2" max="2" step="0.05" />
            </label>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { AIAgentCapabilitySettings, AIAgentPersonaType, AIAgentProfile, AIConversationScope, AIProviderModel } from '@/types'
import { genId } from '@/utils/helpers'

type EditableAgentProfile = {
  id: string
  name: string
  description: string
  systemPrompt: string
  personaType: AIAgentPersonaType
  mood?: number
  preferredModel: string
  temperature: number
  preferredArtifactRoot: string
  capabilities: AIAgentCapabilitySettings
  tts: {
    autoPlayReplies?: boolean
    emotionStyle?: AIAgentProfile['tts']['emotionStyle']
    emotionIntensity?: number
  }
  isBuiltin?: boolean
}

const props = defineProps<{
  agents: AIAgentProfile[]
  availableModels: AIProviderModel[]
  selectedAgentId: string
  currentAgentId?: string
  currentScope: AIConversationScope
  currentSessionHasMessages: boolean
  streaming: boolean
}>()

const emit = defineEmits<{
  (e: 'select-agent', agentId: string): void
  (e: 'save-agent', profile: EditableAgentProfile): void
  (e: 'delete-agent', agentId: string): void
}>()

const emotionStyles = ['auto', 'neutral', 'assistant', 'affectionate', 'chat', 'cheerful', 'gentle', 'friendly'] as const

const capabilityToggles = [
  { key: 'conversationOnly', label: '仅对话', description: '关闭所有外部工具，只保留对话和可选记忆。' },
  { key: 'memoryEnabled', label: '长期记忆', description: '允许记录稳定偏好、习惯和长期目标。' },
  { key: 'fileControlEnabled', label: '文件控制', description: '允许读取、搜索和修改当前工作区文件。' },
  { key: 'softwareControlEnabled', label: '软件控制', description: '允许控制 OpenAgent、Live2D 与桌面软件。' },
  { key: 'mcpEnabled', label: 'MCP', description: '允许使用托管 MCP 工具与桌面级 MCP 能力。' },
  { key: 'skillEnabled', label: 'Skill', description: '允许使用托管 Skill 扩展提示与规则。' },
] as const satisfies Array<{ key: keyof AIAgentCapabilitySettings; label: string; description: string }>

const personaOptions: Array<{ value: AIAgentPersonaType; label: string; description: string }> = [
  {
    value: 'functional',
    label: '功能型 Agent',
    description: '以执行任务、严格服从需求和稳定推进结果为主，不靠情绪表达主导对话。'
  },
  {
    value: 'emotional',
    label: '情绪型 Agent',
    description: '保留鲜明人设与情绪温度，但仍需优先完成用户目标。'
  }
]

const draft = reactive<EditableAgentProfile>(createDraft())
const initialSignature = ref('')
const canSubmit = computed(() => draft.name.trim().length > 0 && draft.systemPrompt.trim().length > 0)
const isDirty = computed(() => initialSignature.value !== currentDraftSignature())

watch(
  () => props.agents,
  agents => {
    const source = agents.find(agent => agent.id === draft.id) || agents.find(agent => agent.id === props.selectedAgentId) || agents[0]
    if (source && !draft.name.trim() && !draft.systemPrompt.trim()) {
      applyAgentToDraft(source)
    }
  },
  { immediate: true },
)

watch(
  () => draft.personaType,
  type => {
    if (type === 'emotional') {
      draft.mood = normalizeMood(draft.mood)
      return
    }

    draft.mood = undefined
  }
)

function createDraft(agent?: AIAgentProfile): EditableAgentProfile {
  return {
    id: agent?.id || '',
    name: agent?.name || '',
    description: agent?.description || '',
    systemPrompt: agent?.systemPrompt || '',
    personaType: agent?.personaType || 'functional',
    mood: agent?.personaType === 'emotional' ? agent.mood ?? 72 : undefined,
    preferredModel: agent?.preferredModel || '',
    temperature: typeof agent?.temperature === 'number' ? agent.temperature : 0.7,
    preferredArtifactRoot: agent?.preferredArtifactRoot || '',
    capabilities: {
      conversationOnly: agent?.capabilities.conversationOnly ?? false,
      memoryEnabled: agent?.capabilities.memoryEnabled ?? true,
      fileControlEnabled: agent?.capabilities.fileControlEnabled ?? false,
      softwareControlEnabled: agent?.capabilities.softwareControlEnabled ?? true,
      mcpEnabled: agent?.capabilities.mcpEnabled ?? true,
      skillEnabled: agent?.capabilities.skillEnabled ?? true,
    },
    tts: {
      autoPlayReplies: agent?.tts.autoPlayReplies ?? false,
      emotionStyle: agent?.tts.emotionStyle || 'auto',
      emotionIntensity: agent?.tts.emotionIntensity ?? 1,
    },
    isBuiltin: agent?.isBuiltin,
  }
}

function currentDraftSignature() {
  return JSON.stringify({
    id: draft.id,
    name: draft.name,
    description: draft.description,
    systemPrompt: draft.systemPrompt,
    personaType: draft.personaType,
    mood: draft.mood,
    preferredModel: draft.preferredModel,
    temperature: draft.temperature,
    preferredArtifactRoot: draft.preferredArtifactRoot,
    capabilities: draft.capabilities,
    tts: draft.tts,
    isBuiltin: draft.isBuiltin,
  })
}

function syncInitialSignature() {
  initialSignature.value = currentDraftSignature()
}

function applyAgentToDraft(agent: AIAgentProfile) {
  Object.assign(draft, createDraft(agent))
  syncInitialSignature()
}

function startCreate() {
  Object.assign(draft, createDraft())
  syncInitialSignature()
}

function startEdit(agent: AIAgentProfile) {
  applyAgentToDraft(agent)
}

function resetDraft() {
  const source = props.agents.find(agent => agent.id === draft.id) || props.agents.find(agent => agent.id === props.selectedAgentId)
  Object.assign(draft, createDraft(source))
  syncInitialSignature()
}

function updateCapability(key: keyof AIAgentCapabilitySettings, enabled: boolean) {
  draft.capabilities[key] = enabled
  if (key === 'conversationOnly' && enabled) {
    draft.capabilities.fileControlEnabled = false
    draft.capabilities.softwareControlEnabled = false
    draft.capabilities.mcpEnabled = false
    draft.capabilities.skillEnabled = false
  }
}

function submitDraft() {
  if (!canSubmit.value) {
    return
  }

  const profile: EditableAgentProfile = {
    id: draft.id || `agent-${genId()}`,
    name: draft.name.trim(),
    description: draft.description.trim(),
    systemPrompt: draft.systemPrompt.trim(),
    personaType: draft.personaType,
    mood: draft.personaType === 'emotional' ? normalizeMood(draft.mood) : undefined,
    preferredModel: draft.preferredModel.trim(),
    temperature: normalizeTemperature(draft.temperature),
    preferredArtifactRoot: draft.preferredArtifactRoot.trim(),
    capabilities: {
      conversationOnly: draft.capabilities.conversationOnly,
      memoryEnabled: draft.capabilities.memoryEnabled,
      fileControlEnabled: draft.capabilities.conversationOnly ? false : draft.capabilities.fileControlEnabled,
      softwareControlEnabled: draft.capabilities.conversationOnly ? false : draft.capabilities.softwareControlEnabled,
      mcpEnabled: draft.capabilities.conversationOnly ? false : draft.capabilities.mcpEnabled,
      skillEnabled: draft.capabilities.conversationOnly ? false : draft.capabilities.skillEnabled,
    },
    tts: {
      autoPlayReplies: draft.tts.autoPlayReplies,
      emotionStyle: draft.tts.emotionStyle,
      emotionIntensity: draft.tts.emotionIntensity,
    },
    isBuiltin: draft.isBuiltin,
  }

  emit('save-agent', profile)
  Object.assign(draft, createDraft(profile as AIAgentProfile))
  syncInitialSignature()
}

function normalizeTemperature(value: number) {
  if (!Number.isFinite(value)) {
    return 0.7
  }

  return Math.min(Math.max(Number(value), 0), 1.5)
}

function normalizeMood(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 72
  }

  return Math.min(Math.max(Math.round(Number(value)), 0), 100)
}

function formatTemperature(value?: number) {
  return normalizeTemperature(typeof value === 'number' ? value : 0.7).toFixed(2)
}

function resolveBadgeLabel(agent: AIAgentProfile) {
  if (agent.isDefault) {
    return '默认'
  }

  return agent.isBuiltin ? '内置' : '自定义'
}

function getCapabilityBadges(agent: AIAgentProfile) {
  const agentType = agent.personaType === 'emotional' ? '情绪型' : '功能型'
  if (agent.capabilities.conversationOnly) {
    return [agentType, '仅对话', agent.capabilities.memoryEnabled ? '记忆' : '无记忆']
  }

  return [
    agentType,
    agent.capabilities.memoryEnabled ? '记忆' : '无记忆',
    agent.capabilities.fileControlEnabled ? '文件' : '无文件',
    agent.capabilities.softwareControlEnabled ? '软件' : '无软件',
    agent.capabilities.mcpEnabled ? 'MCP' : '无 MCP',
    agent.capabilities.skillEnabled ? 'Skill' : '无 Skill',
  ]
}
</script>

<style scoped>
.agent-profile-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  min-height: 0;
  overflow: hidden;
}

.profile-scroll-area {
  display: grid;
  gap: 10px;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  padding-bottom: 10px;
  align-content: start;
}

.agent-list-shell,
.agent-form-shell {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.agent-list-shell {
  max-height: min(32vh, 280px);
}

.panel-head,
.scope-bar,
.form-head,
.form-actions,
.agent-card-head,
.agent-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h3,
h4,
p {
  margin: 0;
}

h3 {
  font-size: 15px;
}

h4 {
  font-size: 13px;
}

.panel-copy,
.scope-hint,
.agent-card p,
.toggle-card p,
.field-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.scope-bar {
  align-items: flex-start;
}

.scope-pill,
.agent-badge,
.capability-pill,
.runtime-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.scope-pill {
  padding: 5px 9px;
  background: rgba(255, 185, 88, 0.16);
  color: #ffd59a;
}

.agent-list {
  display: grid;
  gap: 8px;
  align-content: start;
}

.agent-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background:
    radial-gradient(circle at top right, rgba(255, 166, 43, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  color: var(--text-primary);
  cursor: pointer;
  display: grid;
  gap: 6px;
  padding: 10px;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.agent-card:hover:not(:disabled),
.agent-card.active {
  border-color: color-mix(in srgb, var(--primary) 72%, white 12%);
  box-shadow: 0 12px 22px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.agent-card.current {
  border-color: rgba(255, 183, 3, 0.45);
}

.agent-badge {
  padding: 3px 7px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.capability-row,
.runtime-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.capability-pill,
.runtime-pill {
  padding: 3px 7px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.agent-form {
  display: grid;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 12px;
  align-content: start;
}

.field {
  display: grid;
  gap: 5px;
}

.form-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 4px;
  background: linear-gradient(180deg, rgba(245, 248, 251, 0.96), rgba(245, 248, 251, 0.72));
  backdrop-filter: blur(12px);
}

.field span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font: inherit;
  padding: 8px 10px;
  outline: none;
}

.field textarea {
  min-height: 132px;
  resize: vertical;
}

.field--placeholder {
  align-content: start;
}

.field-placeholder {
  min-height: 42px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px dashed rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.field input:focus,
.field textarea:focus,
.field select:focus {
  border-color: color-mix(in srgb, var(--primary) 70%, white 10%);
}

.field-hint {
  font-size: 11px;
}

.toggle-grid,
.tts-grid,
.runtime-grid {
  display: grid;
  gap: 8px;
}

.toggle-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tts-grid,
.runtime-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.toggle-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.toggle-card strong {
  display: block;
  margin-bottom: 4px;
}

.toggle-card input {
  margin-top: 4px;
}

.panel-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
  min-height: 28px;
  padding: 0 10px;
}

.panel-btn.primary {
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 92%, white 8%), #ff9f1c);
  color: #111;
  font-weight: 700;
}

.panel-btn.secondary,
.panel-btn.danger {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.panel-btn.danger {
  color: #ff9ca3;
}

.panel-btn:disabled,
.agent-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 960px) {
  .toggle-grid,
  .tts-grid,
  .runtime-grid {
    grid-template-columns: 1fr;
  }

  .scope-bar,
  .form-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
