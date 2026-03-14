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

    <div class="composer-shell">
      <div class="composer-main">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          class="message-input"
          :style="{ height: `${textareaHeight}px` }"
          :placeholder="streaming ? '当前角色正在回复中...' : '输入需求、代码任务或控制指令，Enter 发送，Shift+Enter 换行'"
          rows="1"
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
        />

        <button class="send-btn composer-send-btn" :class="{ stop: streaming }" :disabled="effectiveSendDisabled" @click="handlePrimaryAction">
          {{ streaming ? '停止' : '发送' }}
        </button>
      </div>

      <div class="composer-footer">
        <div class="composer-primary-actions">
          <button class="toolbar-btn attach-btn" :disabled="streaming" @click="fileInputRef?.click()">附件</button>
          <button class="toolbar-btn screenshot-btn" :disabled="streaming || capturingScreenshot" @click="$emit('capture-screenshot')">
            {{ capturingScreenshot ? '截图中...' : '截图' }}
          </button>
        </div>

        <div class="controls-row">
          <div class="model-row">
            <span class="control-label">模型</span>
            <select class="control-select" :value="currentModelName" @change="$emit('change-model', ($event.target as HTMLSelectElement).value)">
              <option v-if="!currentModelName" value="">请先选择模型</option>
              <option v-for="model in availableModels" :key="model.id" :value="model.name">{{ model.label }}</option>
            </select>
            <button class="control-btn" :disabled="loadingModels || !canRefreshModels" @click="$emit('refresh-models')">
              {{ loadingModels ? '刷新中...' : '刷新模型' }}
            </button>
          </div>

          <div class="step-row">
            <span class="control-label">步数</span>
            <button class="step-btn" @click="$emit('step-delta', -1)">-</button>
            <span class="step-value">{{ maxAutoSteps > 0 ? maxAutoSteps : '无限' }}</span>
            <button class="step-btn" @click="$emit('step-delta', 1)">+</button>
            <button class="control-btn" @click="$emit('apply-recommended-steps')">推荐 {{ recommendedAutoSteps }}</button>
          </div>
        </div>
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
  capturingScreenshot: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'select-files', files: File[]): void
  (e: 'capture-screenshot'): void
  (e: 'remove-attachment', attachmentId: string): void
  (e: 'refresh-models'): void
  (e: 'change-model', modelName: string): void
  (e: 'step-delta', delta: number): void
  (e: 'apply-recommended-steps'): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const MIN_INPUT_HEIGHT = 48
const MAX_INPUT_HEIGHT = 120
const textareaHeight = ref(MIN_INPUT_HEIGHT)

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

  const currentValue = element.value.trim()
  if (!currentValue) {
    textareaHeight.value = MIN_INPUT_HEIGHT
    return
  }

  element.style.height = 'auto'
  textareaHeight.value = Math.min(Math.max(element.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT)
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
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  justify-content: flex-start;
  min-height: fit-content;
  overflow: hidden;
  box-sizing: border-box;
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
  gap: 8px;
}

.attachment-pill {
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 7px 9px;
}

.attachment-thumb,
.attachment-file {
  border-radius: 8px;
  flex: 0 0 38px;
  height: 38px;
  object-fit: cover;
  width: 38px;
}

.attachment-file {
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 11px;
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
  font-size: 11px;
}

.toolbar-btn,
.send-btn,
.control-btn,
.step-btn,
.remove-btn {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 10px;
  min-height: 28px;
  padding: 0 10px;
}

.toolbar-btn,
.control-btn,
.step-btn,
.remove-btn {
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  display: inline-flex;
  gap: 6px;
  justify-content: center;
}

.composer-shell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
}

.composer-main,
.composer-footer,
.composer-primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composer-main {
  align-items: flex-end;
}

.composer-footer {
  justify-content: space-between;
  gap: 10px 14px;
  flex-wrap: wrap;
}

.composer-primary-actions {
  flex: 0 0 auto;
}

.send-btn {
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 92%, white 8%), #ff9f1c);
  color: #111;
  font-weight: 700;
}

.composer-send-btn {
  flex: 0 0 auto;
  min-width: 68px;
  min-height: 44px;
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
  border-radius: 14px;
  color: var(--text-primary);
}

.message-input {
  align-self: stretch;
  flex: 1 1 auto;
  min-height: 48px;
  max-height: 120px;
  overflow: auto;
  padding: 8px 10px;
  resize: none;
  width: 100%;
  line-height: 1.55;
}

.control-select {
  min-height: 30px;
  padding: 0 9px;
}

.controls-row {
  align-items: center;
  justify-content: flex-end;
  gap: 10px 14px;
  min-height: 28px;
  flex: 1 1 auto;
}

.model-row,
.step-row {
  align-items: center;
  gap: 6px;
}

.model-row {
  min-width: 0;
  flex: 1 1 320px;
}

.control-label {
  color: var(--text-muted);
  font-size: 11px;
  flex: 0 0 auto;
}

.step-row {
  flex: 0 0 auto;
}

.step-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 11px;
}

.control-select {
  min-width: 180px;
  flex: 1 1 220px;
  max-width: min(320px, 48vw);
}

@media (max-width: 960px) {
  .composer-main {
    align-items: stretch;
    flex-direction: column;
  }

  .composer-send-btn {
    width: 100%;
    min-height: 36px;
  }

  .controls-row {
    align-items: stretch;
    flex-direction: column;
    justify-content: flex-start;
  }

  .model-row,
  .step-row {
    width: 100%;
  }

  .step-row {
    justify-content: space-between;
  }
}
</style>
