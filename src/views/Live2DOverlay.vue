<template>
  <div class="overlay-page" :class="{ 'is-ready': modelReady }">
    <transition name="panel-fade">
      <div v-if="!modelReady && modelErrorMessage" ref="errorPanelRef" class="overlay-error glass-panel" @mousedown.stop>
        <strong>Live2D 加载失败</strong>
        <span>{{ modelErrorMessage }}</span>
        <div class="panel-actions">
          <button class="btn btn-secondary btn-sm" @click="restoreBundledDefault">恢复默认模型</button>
          <button class="btn btn-primary btn-sm" @click="openMainWindow">打开主窗口排查</button>
        </div>
      </div>
    </transition>

    <div class="overlay-scene" :class="{ 'is-hidden': !modelReady }">
      <Live2DWidget
        @ready="handleModelReady"
        @error="handleModelError"
        @bounds-change="handleModelBoundsChange"
        @model-tap="handleModelTap"
        @model-interact="handleModelInteract"
        @pointer-capture-change="handlePointerCaptureChange"
      />

      <transition name="panel-fade">
        <div
          v-if="toolVisible && modelReady"
          ref="toolboxRef"
          class="overlay-toolbox glass-panel"
          :style="toolboxStyle"
          @mousedown.stop
        >
          <button class="tool-btn" title="打开主窗口" @click="openMainWindow">
            <svg width="16" height="16"><use href="#icon-menu"/></svg>
          </button>
          <button class="tool-btn" :class="{ active: modelPickerVisible }" title="切换模型" @click="toggleModelPicker">
            <svg width="16" height="16"><use href="#icon-user"/></svg>
          </button>
          <button class="tool-btn" title="恢复默认模型" @click="restoreBundledDefault">
            <svg width="16" height="16"><use href="#icon-refresh"/></svg>
          </button>
          <button class="tool-btn" :class="{ active: aiChatVisible }" title="AI 对话" @click="toggleAiChat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="tool-btn" title="隐藏 Live2D" @click="hideLive2D">
            <svg width="16" height="16"><use href="#icon-close"/></svg>
          </button>
        </div>
      </transition>

      <transition name="panel-fade">
        <div
          v-if="modelPickerVisible && modelReady"
          ref="drawerRef"
          class="overlay-drawer glass-panel"
          :style="drawerStyle"
          @mousedown.stop
        >
          <div class="drawer-head">
            <div class="drawer-copy">
              <strong>{{ settings.live2dModelName || 'Live2D 悬浮窗' }}</strong>
              <span>点击模型弹出工具按钮，按住模型即可拖动窗口。</span>
            </div>
            <button class="panel-icon-btn" @click="modelPickerVisible = false" title="关闭模型抽屉">
              <svg width="14" height="14"><use href="#icon-close"/></svg>
            </button>
          </div>

          <div class="drawer-actions">
            <button class="btn btn-primary btn-sm" @click="openMainWindow">打开主窗口</button>
            <button class="btn btn-secondary btn-sm" @click="restoreBundledDefault">恢复默认</button>
          </div>

          <div class="panel-models" v-if="availableModels.length">
            <button
              v-for="model in availableModels"
              :key="model.id"
              class="model-chip"
              :class="{ active: isModelActive(model) }"
              @click="useModel(model)"
            >
              <span>{{ model.name }}</span>
              <small>{{ sourceLabel(model.source) }}</small>
            </button>
          </div>
        </div>
      </transition>

      <AIChatDialog
        :visible="aiChatVisible"
        ref="aiChatRef"
        scope="live2d"
        title="Live2D 陪伴对话"
        subtitle="独立长期记忆与默认语音播报"
        :style="aiChatStyle"
        @close="aiChatVisible = false"
        @drag-state-change="handleChatDragStateChange"
        @open-main="openMainWindowToAI"
        @open-settings="openMainWindowToSettings"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Live2DCursorPoint, Live2DLibraryItem, Live2DModelBounds, Live2DModelSource } from '@/types'
import Live2DWidget from '@/components/Live2DWidget.vue'
import AIChatDialog from '@/components/AIChatDialog.vue'
import { useSettingsStore } from '@/stores/settings'
import { showToast } from '@/utils/toast'
import { DEFAULT_BUNDLED_LIVE2D_MODEL, listLocalLive2DModels } from '@/utils/live2d'

const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)
const toolVisible = ref(false)
const modelPickerVisible = ref(false)
const modelReady = ref(false)
const availableModels = ref<Live2DLibraryItem[]>([])
const modelBounds = ref<Live2DModelBounds | null>(null)
const modelErrorMessage = ref('')
const viewportSize = ref({ width: window.innerWidth, height: window.innerHeight })
const toolboxRef = ref<HTMLElement | null>(null)
const drawerRef = ref<HTMLElement | null>(null)
const errorPanelRef = ref<HTMLElement | null>(null)
const aiChatRef = ref<InstanceType<typeof AIChatDialog> | null>(null)
const aiChatVisible = ref(false)
const chatDragCapturing = ref(false)
const lastPointerPosition = ref<{ x: number; y: number } | null>(null)
const interactionCapturing = ref(false)
let lastIgnoreMouseEvents: boolean | null = null
let detachCursorTracking: (() => void) | null = null

interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
}

const sourceLabelMap: Record<Live2DModelSource, string> = {
  preset: '预设缓存',
  bundled: '安装包内置',
  imported: '本地导入',
  custom: '自定义缓存'
}

function clamp(value: number, min: number, max: number) {
  if (max <= min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function resolvePanelDimension(desired: number, viewport: number, min: number) {
  const maxAvailable = Math.max(viewport - 24, 160)
  if (maxAvailable <= min) {
    return maxAvailable
  }

  return Math.min(desired, maxAvailable)
}

function resolveSidePanelPosition(panelWidth: number, panelHeight: number) {
  const toolLeft = parseFloat(String(toolboxStyle.value.left)) || 12
  const toolTop = parseFloat(String(toolboxStyle.value.top)) || 12
  const viewportWidth = viewportSize.value.width
  const viewportHeight = viewportSize.value.height

  const rightAnchor = toolLeft + 66
  const leftAnchor = toolLeft - panelWidth - 12
  const spaceOnLeft = toolLeft - 12
  const spaceOnRight = viewportWidth - rightAnchor - 12
  const preferLeft = spaceOnLeft >= panelWidth || spaceOnLeft >= spaceOnRight

  return {
    left: clamp(preferLeft ? leftAnchor : rightAnchor, 12, viewportWidth - panelWidth - 12),
    top: clamp(toolTop, 12, viewportHeight - panelHeight - 12)
  }
}

function setWindowMousePassthrough(ignore: boolean) {
  if (!window.electronAPI?.setWindowIgnoreMouseEvents || lastIgnoreMouseEvents === ignore) {
    return
  }

  lastIgnoreMouseEvents = ignore
  window.electronAPI.setWindowIgnoreMouseEvents(ignore)
}

function isPointInRect(point: { x: number; y: number }, rect: RectLike | null) {
  if (!rect) {
    return false
  }

  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

function getElementRect(element: Element | null | undefined): RectLike | null {
  if (!element || typeof (element as HTMLElement).getBoundingClientRect !== 'function') {
    return null
  }

  const rect = (element as HTMLElement).getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom
  }
}

function getModelRect(): RectLike | null {
  const bounds = modelBounds.value
  if (!bounds) {
    return null
  }

  const padding = 10
  return {
    left: bounds.x - padding,
    top: bounds.y - padding,
    right: bounds.x + bounds.width + padding,
    bottom: bounds.y + bounds.height + padding
  }
}

function getAiChatRect() {
  const chatInstance = aiChatRef.value as (InstanceType<typeof AIChatDialog> & {
    getRootElement?: () => HTMLElement | null
    hasBlockingOverlay?: () => boolean
  }) | null

  return getElementRect(chatInstance?.getRootElement?.() ?? null)
}

function hasAiChatBlockingOverlay() {
  const chatInstance = aiChatRef.value as (InstanceType<typeof AIChatDialog> & {
    hasBlockingOverlay?: () => boolean
  }) | null

  return chatInstance?.hasBlockingOverlay?.() ?? false
}

function syncMousePassthrough(point = lastPointerPosition.value) {
  if (!window.electronAPI?.setWindowIgnoreMouseEvents) {
    return
  }

  // 模型按下后的拖拽与点击收尾必须持续留在本窗口内，否则会在鼠标离开模型边缘时丢失交互。
  if (interactionCapturing.value) {
    setWindowMousePassthrough(false)
    return
  }

  if (chatDragCapturing.value) {
    setWindowMousePassthrough(false)
    return
  }

  if (hasAiChatBlockingOverlay()) {
    setWindowMousePassthrough(false)
    return
  }

  if (!point) {
    setWindowMousePassthrough(true)
    return
  }

  const shouldCapture = isPointInRect(point, getModelRect())
    || isPointInRect(point, getElementRect(toolboxRef.value))
    || isPointInRect(point, getElementRect(drawerRef.value))
    || isPointInRect(point, getElementRect(errorPanelRef.value))
    || isPointInRect(point, getAiChatRect())

  setWindowMousePassthrough(!shouldCapture)
}

function handleGlobalCursorPoint(point: Live2DCursorPoint) {
  lastPointerPosition.value = {
    x: point.localX,
    y: point.localY
  }
  syncMousePassthrough(lastPointerPosition.value)
}

const toolboxStyle = computed(() => {
  const width = 54
  const estimatedHeight = 286
  const bounds = modelBounds.value
  const viewportWidth = viewportSize.value.width
  const viewportHeight = viewportSize.value.height

  if (!bounds) {
    return {
      left: `${viewportWidth - width - 16}px`,
      top: `${Math.max((viewportHeight - estimatedHeight) / 2, 12)}px`
    }
  }

  const nextLeft = clamp(bounds.x + bounds.width + 12, 12, viewportWidth - width - 12)
  const nextTop = clamp(bounds.y + Math.min(bounds.height * 0.15, 48), 12, viewportHeight - estimatedHeight - 12)

  return {
    left: `${nextLeft}px`,
    top: `${nextTop}px`
  }
})

const drawerStyle = computed(() => {
  const drawerWidth = resolvePanelDimension(260, viewportSize.value.width, 220)
  const drawerHeight = resolvePanelDimension(320, viewportSize.value.height, 220)
  const placement = resolveSidePanelPosition(drawerWidth, drawerHeight)

  return {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${drawerWidth}px`,
    maxHeight: `${drawerHeight}px`
  }
})

const aiChatStyle = computed(() => {
  const chatWidth = resolvePanelDimension(760, viewportSize.value.width, 560)
  const chatHeight = resolvePanelDimension(760, viewportSize.value.height, 460)
  const placement = resolveSidePanelPosition(chatWidth, chatHeight)

  return {
    position: 'absolute' as const,
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${chatWidth}px`,
    maxHeight: `${chatHeight}px`
  }
})

function sourceLabel(source: Live2DModelSource) {
  return sourceLabelMap[source]
}

async function refreshModels() {
  availableModels.value = await listLocalLive2DModels()
}

function syncViewportSize() {
  viewportSize.value = {
    width: window.innerWidth,
    height: window.innerHeight
  }
}

function closeFloatingUi() {
  toolVisible.value = false
  modelPickerVisible.value = false
  aiChatVisible.value = false
  chatDragCapturing.value = false
  syncMousePassthrough()
}

function openMainWindow() {
  closeFloatingUi()
  window.electronAPI?.showMainWindow()
}

async function hideLive2D() {
  closeFloatingUi()
  await settingsStore.update({ live2dEnabled: false })
}

async function restoreBundledDefault() {
  await settingsStore.restoreDefaultLive2DModel()
  closeFloatingUi()
}

function isModelActive(model: Live2DLibraryItem) {
  return settings.value.live2dModel === model.runtimePath
}

async function useModel(model: Live2DLibraryItem) {
  await settingsStore.setLive2DModel(model)
  closeFloatingUi()
}

function toggleModelPicker() {
  modelPickerVisible.value = !modelPickerVisible.value
  if (modelPickerVisible.value) aiChatVisible.value = false
}

function toggleAiChat() {
  aiChatVisible.value = !aiChatVisible.value
  if (aiChatVisible.value) modelPickerVisible.value = false
  syncMousePassthrough()
}

function handleChatDragStateChange(active: boolean) {
  chatDragCapturing.value = active
  syncMousePassthrough()
}

function openMainWindowToSettings() {
  closeFloatingUi()
  window.electronAPI?.navigateMainWindow?.('/settings')
}

function openMainWindowToAI() {
  closeFloatingUi()
  window.electronAPI?.navigateMainWindow?.('/ai')
}

function handleModelReady() {
  modelErrorMessage.value = ''
  modelReady.value = true
  void refreshModels()
  syncMousePassthrough()
}

function handleModelError(message: string) {
  modelReady.value = false
  closeFloatingUi()
  modelErrorMessage.value = message
  console.warn('[Live2DOverlay] 模型加载失败:', message)
  syncMousePassthrough()
}

function handleModelBoundsChange(bounds: Live2DModelBounds | null) {
  modelBounds.value = bounds
  syncMousePassthrough()
}

function handleModelTap() {
  if (!modelReady.value) {
    return
  }

  toolVisible.value = !toolVisible.value
  if (toolVisible.value) {
    modelPickerVisible.value = false
    aiChatVisible.value = false
  } else {
    modelPickerVisible.value = false
    aiChatVisible.value = false
  }

  syncMousePassthrough()
}

function handleModelInteract(areas: string[]) {
  if (!modelReady.value) {
    return
  }

  if (areas.length > 0) {
    toolVisible.value = true
    syncMousePassthrough()
  }
}

function handlePointerCaptureChange(capturing: boolean) {
  interactionCapturing.value = capturing
  syncMousePassthrough()
}

watch([
  () => settings.value.live2dModel,
  () => settings.value.live2dScale,
  () => settings.value.live2dStoragePath
], () => {
  modelReady.value = false
  modelBounds.value = null
  closeFloatingUi()
  modelErrorMessage.value = ''
  syncMousePassthrough()
})

watch(() => [toolVisible.value, modelPickerVisible.value, aiChatVisible.value, modelReady.value, modelErrorMessage.value, modelBounds.value], () => {
  syncMousePassthrough()
}, { flush: 'post' })

onMounted(() => {
  syncViewportSize()
  window.addEventListener('resize', syncViewportSize)
  detachCursorTracking = window.electronAPI?.onLive2DCursorPoint(handleGlobalCursorPoint) ?? null
  setWindowMousePassthrough(true)
  void refreshModels()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportSize)
  detachCursorTracking?.()
  detachCursorTracking = null
  setWindowMousePassthrough(false)
})
</script>

<style lang="scss" scoped>
.overlay-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  background: transparent;
}

.overlay-scene {
  position: absolute;
  inset: 0;
  overflow: visible;
  background: transparent;
  opacity: 1;
  transition: opacity $transition-base;

  &.is-hidden {
    opacity: 0;
  }
}

.overlay-toolbox {
  position: absolute;
  z-index: 6;
  display: grid;
  gap: 10px;
  width: 54px;
  padding: 10px 8px;
  background: rgba(255, 248, 251, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 44px rgba(95, 69, 84, 0.2);
  backdrop-filter: blur(18px);
}

.tool-btn {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--text-primary);
  cursor: pointer;
  transition: transform $transition-fast, background $transition-fast, box-shadow $transition-fast;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 10px 20px rgba(123, 88, 108, 0.16);
  }

  &.active {
    background: linear-gradient(135deg, rgba(255, 203, 220, 0.96), rgba(252, 155, 186, 0.96));
    color: #7a243f;
  }
}

.overlay-drawer {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 12px;
  width: 260px;
  max-height: 320px;
  padding: 14px;
  overflow: auto;
  background: rgba(255, 247, 250, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 48px rgba(117, 86, 106, 0.24);
  backdrop-filter: blur(20px);
}

.overlay-error {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 7;
  display: grid;
  gap: 10px;
  padding: 14px;
  background: rgba(255, 246, 246, 0.86);
  border: 1px solid rgba(240, 128, 128, 0.35);
  box-shadow: 0 18px 48px rgba(117, 86, 106, 0.18);
  backdrop-filter: blur(20px);

  strong {
    color: #b42318;
    font-size: $font-sm;
  }

  span {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.6;
    word-break: break-word;
  }
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.drawer-copy {
  display: grid;
  gap: 4px;

  strong {
    color: var(--text-primary);
    font-size: $font-base;
    line-height: 1.4;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.55;
  }
}

.panel-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform $transition-fast, background $transition-fast;

  &:hover {
    background: rgba(255, 255, 255, 0.92);
    transform: translateY(-1px);
  }
}

.panel-actions,
.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-models {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  overflow: auto;
  padding-right: 2px;
}

.model-chip {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 18px;
  border: 1px solid rgba(214, 182, 195, 0.4);
  background: rgba(255, 255, 255, 0.6);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  span {
    color: var(--text-primary);
    font-size: $font-sm;
    font-weight: 600;
  }

  small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.4;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(232, 120, 154, 0.42);
    box-shadow: 0 12px 24px rgba(171, 119, 144, 0.18);
  }

  &.active {
    border-color: rgba(232, 120, 154, 0.55);
    background: rgba(255, 236, 242, 0.88);
  }
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity $transition-fast, transform $transition-fast;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
