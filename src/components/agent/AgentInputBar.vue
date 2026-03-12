<template>
  <section class="agent-input-bar glass-panel">
    <input ref="fileInputRef" type="file" multiple class="hidden-file-input" @change="handleFileSelection" />

    <div v-if="attachments.length" class="attachment-pending-list">
      <div v-for="attachment in attachments" :key="attachment.id" class="attachment-pill">
        <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="attachment-thumb" />
        <div v-else class="attachment-file">文件</div>
        <div class="attachment-copy">
          <strong>{{ attachment.name }}</strong>
          <span>{{ attachment.type === 'image' ? `${attachment.width || '-'} x ${attachment.height || '-'}` : formatAttachmentMeta(attachment) }}</span>
        </div>
        <button class="remove-btn" @click="$emit('remove-attachment', attachment.id)">移除</button>
      </div>
    </div>

    <div class="input-row">
      <button class="attach-btn" :disabled="streaming" @click="fileInputRef?.click()">附件</button>
      <textarea
        ref="textareaRef"
        :value="modelValue"
        class="message-input"
        :placeholder="streaming ? 'AI 正在回复中...' : '输入任务、代码需求或调度指令，Enter 发送，Shift+Enter 换行'"
        rows="1"
        @input="handleInput"
        @keydown="handleKeydown"
        @paste="handlePaste"
      />
      <button class="send-btn" :class="{ stop: streaming }" :disabled="effectiveSendDisabled" @click="handlePrimaryAction">
        {{ streaming ? '停止' : '发送' }}
      </button>
    </div>

    <div class="controls-row">
      <div class="model-row">
        <span class="control-label">模型 {{ currentModelLabel }}</span>
        <select class="control-select" :value="currentModelName" @change="$emit('change-model', ($event.target as HTMLSelectElement).value)">
          <option v-if="!currentModelName" value="">请先选择模型</option>
          <option v-for="model in availableModels" :key="model.id" :value="model.name">{{ model.label }}</option>
        </select>
        <button class="control-btn" :disabled="loadingModels || !canRefreshModels" @click="$emit('refresh-models')">
          {{ loadingModels ? '刷新中...' : '刷新模型' }}
        </button>
      </div>

      <div class="step-row">
        <button class="step-btn" @click="$emit('step-delta', -1)">-</button>
        <span>步数 {{ maxAutoSteps > 0 ? maxAutoSteps : '无限' }}</span>
        <button class="step-btn" @click="$emit('step-delta', 1)">+</button>
        <button class="control-btn" @click="$emit('apply-recommended-steps')">推荐 {{ recommendedAutoSteps }}</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { AIChatAttachment, AIProviderModel } from '@/types'

const props = defineProps<{
  modelValue: string
  attachments: AIChatAttachment[]
  streaming: boolean
  sendDisabled: boolean
  currentModelLabel: string
  currentModelName: string
  availableModels: AIProviderModel[]
  loadingModels: boolean
  canRefreshModels: boolean
  maxAutoSteps: number
  recommendedAutoSteps: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'select-files', files: File[]): void
  (e: 'remove-attachment', attachmentId: string): void
  (e: 'refresh-models'): void
  (e: 'change-model', modelName: string): void
  (e: 'step-delta', delta: number): void
  (e: 'apply-recommended-steps'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const effectiveSendDisabled = computed(() => (props.streaming ? false : props.sendDisabled))

watch(() => props.modelValue, () => {
  void nextTick(autoResize)
})

onMounted(() => {
  autoResize()
})

function autoResize() {
  const element = textareaRef.value
  if (!element) {
    return
  }

  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 140)}px`
}

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  autoResize()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  handlePrimaryAction()
}

function handlePrimaryAction() {
  if (props.streaming) {
    emit('stop')
    return
  }

  emit('send')
}

function handleFileSelection(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (files.length > 0) {
    emit('select-files', files)
  }
  target.value = ''
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (files.length === 0) {
    return
  }

  event.preventDefault()
  emit('select-files', files)
}

function formatAttachmentMeta(attachment: AIChatAttachment) {
  const sizeLabel = attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : '未知大小'
  return `${attachment.mimeType || '文件'} · ${sizeLabel}`
}
</script>

<style scoped>
.agent-input-bar {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.hidden-file-input {
  display: none;
}

.attachment-pending-list,
.controls-row,
.model-row,
.step-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.attachment-pill {
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: flex;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
}

.attachment-thumb,
.attachment-file {
  border-radius: 12px;
  flex: 0 0 52px;
  height: 52px;
  object-fit: cover;
  width: 52px;
}

.attachment-file {
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
}

.attachment-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.attachment-copy strong,
.attachment-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-copy span {
  color: var(--text-muted);
  font-size: 12px;
}

.input-row {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.attach-btn,
.send-btn,
.control-btn,
.step-btn,
.remove-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  padding: 10px 14px;
}

.attach-btn,
.control-btn,
.step-btn,
.remove-btn {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.send-btn {
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 92%, white 8%), #ff9f1c);
  color: #111;
  font-weight: 700;
}

.send-btn.stop {
  background: rgba(255, 95, 95, 0.18);
  color: #ffd6d6;
}

.attach-btn:disabled,
.send-btn:disabled,
.control-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.message-input,
.control-select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  color: var(--text-primary);
}

.message-input {
  min-height: 56px;
  padding: 14px 16px;
  resize: none;
  width: 100%;
}

.control-select {
  padding: 10px 12px;
}

.controls-row {
  align-items: center;
  justify-content: space-between;
}

.model-row,
.step-row {
  align-items: center;
}

.control-label {
  color: var(--text-muted);
  font-size: 12px;
}

@media (max-width: 960px) {
  .input-row {
    grid-template-columns: 1fr;
  }

  .controls-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
