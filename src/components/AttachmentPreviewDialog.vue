<template>
  <transition name="preview-fade">
    <div v-if="attachment" class="attachment-preview" @click.self="$emit('close')">
      <div class="preview-card glass-panel">
        <div class="preview-header">
          <div class="preview-copy">
            <strong>{{ attachment.name }}</strong>
            <span>{{ metaLabel }}</span>
          </div>
          <button class="preview-close" @click="$emit('close')" title="关闭预览">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="preview-body">
          <img v-if="attachment.type === 'image' && attachment.dataUrl" :src="attachment.dataUrl" :alt="attachment.name" class="preview-image" />
          <pre v-else-if="attachment.textContent" class="preview-text">{{ attachment.textContent }}</pre>
          <div v-else class="preview-empty">
            <strong>当前文件暂无可直接预览的正文</strong>
            <span>已保留文件名、类型和大小信息，模型仍可读取这些元数据。</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AIChatAttachment } from '@/types'

const props = defineProps<{
  attachment: AIChatAttachment | null
}>()

defineEmits<{
  close: []
}>()

const metaLabel = computed(() => {
  const attachment = props.attachment
  if (!attachment) {
    return ''
  }

  const metaParts = [attachment.mimeType || '未知类型']
  if (attachment.size) {
    metaParts.push(`${Math.max(1, Math.round(attachment.size / 1024))} KB`)
  }
  if (attachment.type === 'image' && attachment.width && attachment.height) {
    metaParts.push(`${attachment.width} x ${attachment.height}`)
  }
  if (attachment.truncated) {
    metaParts.push('内容已截断')
  }

  return metaParts.join(' · ')
})
</script>

<style lang="scss" scoped>
.attachment-preview {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(34, 26, 32, 0.42);
  backdrop-filter: blur(10px);
}

.preview-card {
  width: min(880px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: rgba(255, 248, 251, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.82);
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 200, 220, 0.22);
}

.preview-copy {
  display: grid;
  gap: 4px;
  min-width: 0;

  strong {
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.6;
  }
}

.preview-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: rgba(255, 200, 220, 0.18);
  color: var(--text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--primary);
    background: rgba(255, 200, 220, 0.28);
  }
}

.preview-body {
  overflow: auto;
  padding: 18px;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 170px);
  margin: 0 auto;
  border-radius: 16px;
  box-shadow: 0 18px 42px rgba(95, 69, 84, 0.18);
}

.preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.75;
  color: var(--text-primary);
}

.preview-empty {
  display: grid;
  gap: 8px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 200, 220, 0.22);

  strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.7;
  }
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.18s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .attachment-preview {
    padding: 12px;
  }

  .preview-card {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .preview-body {
    padding: 12px;
  }
}
</style>