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
          <button class="tool-btn" title="AI 对话悬浮窗" @click="openAiOverlayWindow">
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
              <span>双击模型唤出工具按钮，按住模型即可拖动窗口。</span>
            </div>
            <button class="panel-icon-btn" @click="modelPickerVisible = false" title="关闭模型抽屉">
              <svg width="14" height="14"><use href="#icon-close"/></svg>
            </button>
          </div>

          <div class="drawer-actions">
            <button class="btn btn-primary btn-sm" @click="openMainWindow">打开主窗口</button>
            <button class="btn btn-secondary btn-sm" @click="restoreBundledDefault">恢复默认</button>
          </div>

          <div class="drawer-agent-card">
            <div class="drawer-agent-copy">
              <strong>{{ overlayAgent?.name || '小柔' }}</strong>
              <span>{{ overlayAgent?.description || 'Live2D 默认角色，会继承独立记忆、语音和工具边界。' }}</span>
            </div>
            <div v-if="overlayStatusBadges.length" class="drawer-agent-pills">
              <span v-for="badge in overlayStatusBadges" :key="badge" class="drawer-agent-pill">{{ badge }}</span>
            </div>
            <small class="drawer-agent-note">{{ overlaySpeechHint }}</small>
            <div class="drawer-agent-actions">
              <button class="btn btn-secondary btn-sm" @click="openMainWindowToAgent">打开 Agent</button>
              <button class="btn btn-secondary btn-sm" @click="openAiOverlayWindow">对话悬浮窗</button>
            </div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Live2DLibraryItem, Live2DModelBounds, Live2DModelSource, WindowShapeRect } from '@/types'
import Live2DWidget from '@/components/Live2DWidget.vue'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { showToast } from '@/utils/toast'
import { DEFAULT_BUNDLED_LIVE2D_MODEL, listLocalLive2DModels } from '@/utils/live2d'

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)
const overlayAgent = computed(() => aiStore.getSelectedAgent('live2d'))
const overlayStatusBadges = computed(() => {
  const agent = overlayAgent.value
  const capabilities = agent?.capabilities
  if (!agent || !capabilities) {
    return []
  }

  const badges = [capabilities.memoryEnabled ? '长期记忆' : '无记忆']
  if (capabilities.conversationOnly) {
    badges.push('仅对话')
  } else {
    if (capabilities.fileControlEnabled) {
      badges.push('文件控制')
    }
    if (capabilities.softwareControlEnabled) {
      badges.push('软件控制')
    }
    if (capabilities.mcpEnabled) {
      badges.push('MCP')
    }
    if (capabilities.skillEnabled) {
      badges.push('Skill')
    }
  }

  badges.push(settings.value.ttsEnabled
    ? (agent.tts.autoPlayReplies ? '自动播报' : '手动播报')
    : 'TTS 已关闭')

  return badges
})
const overlaySpeechHint = computed(() => {
  if (!settings.value.ttsEnabled) {
    return '当前全局 TTS 已关闭，Live2D 仍可继续对话，但不会自动播报回复。'
  }

  if (overlayAgent.value?.tts.autoPlayReplies) {
    return '当前角色会优先自动播报回复，适合悬浮陪伴和边聊边操作。'
  }

  return '当前角色保留手动播报，你可以在 AI 悬浮窗或主窗口按需播放语音。'
})
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
const interactionCapturing = ref(false)
let lastIgnoreMouseEvents: boolean | null = null

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

function getViewportRect(): RectLike {
  return {
    left: 0,
    top: 0,
    right: viewportSize.value.width,
    bottom: viewportSize.value.height
  }
}

function clampRectToViewport(rect: RectLike) {
  const viewport = getViewportRect()
  return {
    left: clamp(rect.left, viewport.left, viewport.right),
    top: clamp(rect.top, viewport.top, viewport.bottom),
    right: clamp(rect.right, viewport.left, viewport.right),
    bottom: clamp(rect.bottom, viewport.top, viewport.bottom)
  }
}

function toWindowShapeRect(rect: RectLike | null): WindowShapeRect | null {
  if (!rect) {
    return null
  }

  const nextRect = clampRectToViewport(rect)
  const width = Math.round(nextRect.right - nextRect.left)
  const height = Math.round(nextRect.bottom - nextRect.top)
  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    x: Math.round(nextRect.left),
    y: Math.round(nextRect.top),
    width,
    height
  }
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

  // Live2D 提示气泡和头发摆动通常会超出模型包围盒，上方额外留白可以减少被窗口形状裁掉的概率。
  const horizontalPadding = Math.max(Math.round(bounds.width * 0.08), 20)
  const topPadding = Math.max(Math.round(bounds.height * 0.3), 112)
  const bottomPadding = Math.max(Math.round(bounds.height * 0.05), 20)
  return {
    left: bounds.x - horizontalPadding,
    top: bounds.y - topPadding,
    right: bounds.x + bounds.width + horizontalPadding,
    bottom: bounds.y + bounds.height + bottomPadding
  }
}

function buildWindowShapeRects() {
  if (interactionCapturing.value) {
    const viewportRect = toWindowShapeRect(getViewportRect())
    return viewportRect ? [viewportRect] : []
  }

  return [
    toWindowShapeRect(getModelRect()),
    toWindowShapeRect(getElementRect(toolboxRef.value)),
    toWindowShapeRect(getElementRect(drawerRef.value)),
    toWindowShapeRect(getElementRect(errorPanelRef.value))
  ].filter((item): item is WindowShapeRect => Boolean(item))
}

function syncOverlayWindowInteractivity() {
  if (!window.electronAPI?.setWindowIgnoreMouseEvents || !window.electronAPI?.setWindowShapeRects) {
    return
  }

  const shapeRects = buildWindowShapeRects()
  if (shapeRects.length === 0) {
    const viewportRect = toWindowShapeRect(getViewportRect())
    if (viewportRect) {
      window.electronAPI.setWindowShapeRects([viewportRect])
    }
    setWindowMousePassthrough(true)
    return
  }

  window.electronAPI.setWindowShapeRects(shapeRects)
  setWindowMousePassthrough(false)
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

  syncOverlayWindowInteractivity()
}

function closeFloatingUi() {
  toolVisible.value = false
  modelPickerVisible.value = false
  syncOverlayWindowInteractivity()
}

function openMainWindow() {
  closeFloatingUi()
  window.electronAPI?.showMainWindow()
}

function openMainWindowToAgent() {
  closeFloatingUi()
  const sessionId = aiStore.getActiveSessionId('live2d')
  const targetPath = sessionId
    ? `/ai?scope=live2d&sessionId=${encodeURIComponent(sessionId)}`
    : '/ai?scope=live2d'

  if (window.electronAPI?.navigateMainWindow) {
    window.electronAPI.navigateMainWindow(targetPath)
    return
  }

  window.location.hash = targetPath
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
}

function openAiOverlayWindow() {
  closeFloatingUi()
  if (window.electronAPI?.showAIOverlayWindow) {
    window.electronAPI.showAIOverlayWindow()
    return
  }

  window.electronAPI?.navigateMainWindow?.('/ai?scope=live2d')
}

function handleModelReady() {
  modelErrorMessage.value = ''
  modelReady.value = true
  void refreshModels()
  syncOverlayWindowInteractivity()
}

function handleModelError(message: string) {
  modelReady.value = false
  closeFloatingUi()
  modelErrorMessage.value = message
  console.warn('[Live2DOverlay] 模型加载失败:', message)
  syncOverlayWindowInteractivity()
}

function handleModelBoundsChange(bounds: Live2DModelBounds | null) {
  modelBounds.value = bounds
  syncOverlayWindowInteractivity()
}

function handleModelTap() {
  if (!modelReady.value) {
    return
  }

  toolVisible.value = !toolVisible.value
  if (toolVisible.value) {
    modelPickerVisible.value = false
  } else {
    modelPickerVisible.value = false
  }

  syncOverlayWindowInteractivity()
}

function handlePointerCaptureChange(capturing: boolean) {
  interactionCapturing.value = capturing
  syncOverlayWindowInteractivity()
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
  syncOverlayWindowInteractivity()
})

watch(() => [toolVisible.value, modelPickerVisible.value, modelReady.value, modelErrorMessage.value, modelBounds.value, interactionCapturing.value], () => {
  syncOverlayWindowInteractivity()
}, { flush: 'post' })

onMounted(() => {
  if (!aiStore.loaded) {
    void aiStore.init()
  }
  syncViewportSize()
  window.addEventListener('resize', syncViewportSize)
  setWindowMousePassthrough(true)
  const viewportRect = toWindowShapeRect(getViewportRect())
  if (viewportRect) {
    window.electronAPI?.setWindowShapeRects?.([viewportRect])
  }
  void refreshModels()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportSize)
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

.drawer-agent-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background:
    radial-gradient(circle at top right, rgba(255, 195, 215, 0.24), transparent 34%),
    rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.78);
}

.drawer-agent-copy {
  display: grid;
  gap: 4px;
}

.drawer-agent-copy span,
.drawer-agent-note {
  color: var(--text-secondary);
  line-height: 1.5;
}

.drawer-agent-pills,
.drawer-agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.drawer-agent-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #7d324d;
  font-size: 11px;
  font-weight: 700;
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
