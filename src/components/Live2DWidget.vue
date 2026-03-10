<template>
  <div
    class="live2d-widget"
    :class="{ 'is-ready': isReady }"
  >
    <div ref="containerRef" class="live2d-container"></div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Live2DCursorPoint, Live2DModelBounds } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import { resolveLive2DModelPath } from '@/utils/live2d'

const BASE_LIVE2D_SCALE = 0.12
const BOUNDS_SYNC_INTERVAL = 180
const MODEL_DOUBLE_TAP_INTERVAL = 320
const MODEL_DOUBLE_TAP_DISTANCE = 26

const emit = defineEmits<{
  ready: []
  error: [message: string]
  boundsChange: [bounds: Live2DModelBounds | null]
  modelTap: []
  pointerCaptureChange: [capturing: boolean]
}>()

interface StageDomLike {
  element?: HTMLElement
  canvasElement?: HTMLCanvasElement
}

interface PixiScaleLike {
  x: number
  y: number
  set?: (x: number, y?: number) => void
}

interface PixiAnchorLike {
  x: number
  y: number
  set?: (x: number, y?: number) => void
}

interface PixiPointerLike {
  data?: {
    originalEvent?: MouseEvent
  }
}

interface PixiDisplayLike {
  x: number
  y: number
  interactive?: boolean
  buttonMode?: boolean
  cursor?: string
  focus?: (x: number, y: number, instant?: boolean) => void
  internalModel?: {
    originalWidth?: number
    originalHeight?: number
    width?: number
    height?: number
  }
  scale?: PixiScaleLike
  anchor?: PixiAnchorLike
  on?: (event: string, handler: (payload?: unknown) => void) => void
  off?: (event: string, handler: (payload?: unknown) => void) => void
  getBounds?: () => { x: number; y: number; width: number; height: number }
}

interface Oml2dInstance {
  destroy?: () => void
  dispose?: () => void
  reloadModel?: () => Promise<void>
  onLoad?: (fn: (status: 'loading' | 'success' | 'fail') => void | Promise<void>) => void
  onStageSlideIn?: (fn: () => void | Promise<void>) => void
  stageSlideIn?: () => Promise<void>
  startTipsIdle?: () => void
  stage?: StageDomLike
  models?: {
    model?: PixiDisplayLike
    create?: () => Promise<void>
  }
  pixiApp?: {
    app?: {
      stage?: {
        children?: PixiDisplayLike[]
      }
    }
  }
}

const settingsStore = useSettingsStore()
const containerRef = ref<HTMLElement | null>(null)
const isReady = ref(false)
const stageWidth = ref(320)
const stageHeight = ref(380)
let idleCallbackId: number | null = null
let timerId: ReturnType<typeof setTimeout> | null = null
let boundsTimerId: ReturnType<typeof setInterval> | null = null
let layoutTimerId: ReturnType<typeof setTimeout> | null = null
let oml2dInstance: Oml2dInstance | null = null
let resizeObserver: ResizeObserver | null = null
let initRequestId = 0
let pointerDownPoint: { x: number; y: number } | null = null
let draggingWindow = false
let detachModelEvents: (() => void) | null = null
let lastBoundsKey = ''
let lastCursorPoint: Live2DCursorPoint | null = null
let detachCursorTracking: (() => void) | null = null
let lastTapAt = 0
let lastTapPoint: { x: number; y: number } | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function syncStageSize() {
  if (!containerRef.value) {
    return
  }

  stageWidth.value = Math.max(Math.round(containerRef.value.clientWidth), 240)
  stageHeight.value = Math.max(Math.round(containerRef.value.clientHeight), 280)
}

function clearLive2DContainer() {
  if (!containerRef.value) {
    return
  }

  containerRef.value.innerHTML = ''
}

function cleanupPointerTracking() {
  if (draggingWindow) {
    window.electronAPI?.endWindowDrag()
  }

  pointerDownPoint = null
  draggingWindow = false
  emit('pointerCaptureChange', false)
  window.removeEventListener('mousemove', handleGlobalPointerMove)
  window.removeEventListener('mouseup', handleGlobalPointerUp)
}

function clearBoundsSync() {
  if (boundsTimerId !== null) {
    globalThis.clearInterval(boundsTimerId)
    boundsTimerId = null
  }

  lastBoundsKey = ''
  emit('boundsChange', null)
}

function destroyLive2DInstance() {
  cleanupPointerTracking()
  clearBoundsSync()
  detachModelEvents?.()
  detachModelEvents = null

  if (typeof oml2dInstance?.destroy === 'function') {
    oml2dInstance.destroy()
  } else if (typeof oml2dInstance?.dispose === 'function') {
    oml2dInstance.dispose()
  }

  oml2dInstance = null
  clearLive2DContainer()
}

function cancelScheduledInit() {
  if (idleCallbackId !== null && 'cancelIdleCallback' in globalThis) {
    globalThis.cancelIdleCallback(idleCallbackId)
    idleCallbackId = null
  }

  if (timerId !== null) {
    globalThis.clearTimeout(timerId)
    timerId = null
  }

  if (layoutTimerId !== null) {
    globalThis.clearTimeout(layoutTimerId)
    layoutTimerId = null
  }
}

function hasRenderableContent() {
  if (!containerRef.value) {
    return false
  }

  return containerRef.value.childElementCount > 0 || containerRef.value.innerHTML.trim().length > 0
}

function forceStageLayout(instance: Oml2dInstance) {
  const stageElement = instance.stage?.element
  const canvasElement = instance.stage?.canvasElement

  if (stageElement) {
    Object.assign(stageElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      zIndex: '1',
      background: 'transparent',
      overflow: 'visible',
      pointerEvents: 'auto'
    })
  }

  if (canvasElement) {
    Object.assign(canvasElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      background: 'transparent',
      pointerEvents: 'auto'
    })
  }
}

async function probeModelPath(modelPath: string, requestId: number) {
  try {
    const response = await fetch(modelPath)
    const text = await response.text()
    console.info('[Live2D] probe', JSON.stringify({
      requestId,
      modelPath,
      ok: response.ok,
      status: response.status,
      textLength: text.length
    }))
  } catch (error) {
    console.warn('[Live2D] probe-failed', JSON.stringify({
      requestId,
      modelPath,
      message: error instanceof Error ? error.message : String(error)
    }))
  }
}

function resolveModelDisplay(instance: Oml2dInstance): PixiDisplayLike | null {
  const directModel = instance.models?.model
  if (directModel) {
    return directModel
  }

  const stageChild = instance.pixiApp?.app?.stage?.children?.[0]
  return stageChild ?? null
}

function attachModelCreateDiagnostics(instance: Oml2dInstance, requestId: number) {
  const models = instance.models as (Oml2dInstance['models'] & { __createWrapped?: boolean }) | undefined
  if (!models?.create || models.__createWrapped) {
    return
  }

  const originalCreate = models.create.bind(models)
  models.__createWrapped = true
  models.create = async () => {
    console.info('[Live2D] create-start', JSON.stringify({ requestId }))

    try {
      await originalCreate()
      console.info('[Live2D] create-success', JSON.stringify({ requestId, hasDirectModel: !!models.model }))
    } catch (error) {
      console.warn('[Live2D] create-failed', JSON.stringify({
        requestId,
        message: error instanceof Error ? error.message : String(error)
      }))
      throw error
    }
  }
}

function readModelBounds(instance: Oml2dInstance): Live2DModelBounds | null {
  const bounds = resolveModelDisplay(instance)?.getBounds?.()
  if (!bounds) {
    return null
  }

  const normalizedBounds = {
    x: Math.max(Math.round(bounds.x), 0),
    y: Math.max(Math.round(bounds.y), 0),
    width: Math.max(Math.round(bounds.width), 0),
    height: Math.max(Math.round(bounds.height), 0)
  }

  if (!normalizedBounds.width || !normalizedBounds.height) {
    return null
  }

  return normalizedBounds
}

function applyModelFocus(instance: Oml2dInstance, point: Live2DCursorPoint, instant = false) {
  const model = resolveModelDisplay(instance)
  if (!model?.focus) {
    return
  }

  // 全屏鼠标换算到悬浮窗局部坐标后可能远超舞台范围，适度裁剪可以避免极端角度抖动。
  const focusX = clamp(point.localX, -stageWidth.value * 2, stageWidth.value * 3)
  const focusY = clamp(point.localY, -stageHeight.value * 2, stageHeight.value * 3)
  model.focus(focusX, focusY, instant)
}

function resolveCurrentModelScale(model: PixiDisplayLike) {
  const scaleX = typeof model.scale?.x === 'number' && Number.isFinite(model.scale.x)
    ? Math.abs(model.scale.x)
    : 0

  return Math.max(scaleX, 0.0001)
}

function resolveModelSourceSize(model: PixiDisplayLike, bounds: Live2DModelBounds) {
  const intrinsicWidth = model.internalModel?.originalWidth ?? model.internalModel?.width
  const intrinsicHeight = model.internalModel?.originalHeight ?? model.internalModel?.height

  if (
    typeof intrinsicWidth === 'number'
    && Number.isFinite(intrinsicWidth)
    && intrinsicWidth > 0
    && typeof intrinsicHeight === 'number'
    && Number.isFinite(intrinsicHeight)
    && intrinsicHeight > 0
  ) {
    return {
      width: intrinsicWidth,
      height: intrinsicHeight
    }
  }

  const currentScale = resolveCurrentModelScale(model)
  return {
    width: Math.max(bounds.width / currentScale, 1),
    height: Math.max(bounds.height / currentScale, 1)
  }
}

function emitModelBounds(instance: Oml2dInstance) {
  const bounds = readModelBounds(instance)
  if (!bounds) {
    if (lastBoundsKey) {
      lastBoundsKey = ''
      emit('boundsChange', null)
    }
    return
  }

  const nextKey = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
  if (nextKey === lastBoundsKey) {
    return
  }

  lastBoundsKey = nextKey
  emit('boundsChange', bounds)
}

function resolvePointerScreenPoint(payload?: unknown) {
  const event = (payload as PixiPointerLike | undefined)?.data?.originalEvent
  if (!event) {
    return null
  }

  return { x: event.screenX, y: event.screenY }
}

function handleGlobalPointerMove(event: MouseEvent) {
  if (!pointerDownPoint || !window.electronAPI) {
    return
  }

  const deltaX = event.screenX - pointerDownPoint.x
  const deltaY = event.screenY - pointerDownPoint.y
  if (!draggingWindow && Math.hypot(deltaX, deltaY) >= 4) {
    draggingWindow = true
    window.electronAPI.startWindowDrag(pointerDownPoint)
  }

  if (draggingWindow) {
    window.electronAPI.updateWindowDrag({ x: event.screenX, y: event.screenY })
  }
}

function handleGlobalPointerUp() {
  const releasePoint = pointerDownPoint ? { ...pointerDownPoint } : null
  const shouldToggleTools = !!releasePoint && !draggingWindow
  cleanupPointerTracking()

  if (!shouldToggleTools || !releasePoint) {
    lastTapAt = 0
    lastTapPoint = null
    return
  }

  const now = Date.now()
  const isDoubleTap = !!lastTapPoint
    && now - lastTapAt <= MODEL_DOUBLE_TAP_INTERVAL
    && Math.hypot(releasePoint.x - lastTapPoint.x, releasePoint.y - lastTapPoint.y) <= MODEL_DOUBLE_TAP_DISTANCE

  lastTapAt = now
  lastTapPoint = releasePoint

  // 拖拽和点击都发生在模型表面上，改成双击才能避免每次整理窗口位置时误弹工具面板。
  if (isDoubleTap) {
    lastTapAt = 0
    lastTapPoint = null
    emit('modelTap')
  }
}

function bindModelInteractions(instance: Oml2dInstance, requestId: number) {
  detachModelEvents?.()
  detachModelEvents = null

  const model = resolveModelDisplay(instance)
  if (!model?.on) {
    return
  }

  model.interactive = true
  model.buttonMode = true
  model.cursor = 'grab'

  const handlePointerDown = (payload?: unknown) => {
    if (requestId !== initRequestId || !window.electronAPI) {
      return
    }

    const screenPoint = resolvePointerScreenPoint(payload)
    if (!screenPoint) {
      return
    }

    pointerDownPoint = screenPoint
    draggingWindow = false
    emit('pointerCaptureChange', true)
    window.addEventListener('mousemove', handleGlobalPointerMove)
    window.addEventListener('mouseup', handleGlobalPointerUp)
  }

  model.on('pointerdown', handlePointerDown)

  detachModelEvents = () => {
    model.off?.('pointerdown', handlePointerDown)
    cleanupPointerTracking()
  }
}

function startBoundsSync(instance: Oml2dInstance, requestId: number) {
  clearBoundsSync()
  emitModelBounds(instance)

  boundsTimerId = globalThis.setInterval(() => {
    if (requestId !== initRequestId) {
      clearBoundsSync()
      return
    }

    forceStageLayout(instance)
    emitModelBounds(instance)
  }, BOUNDS_SYNC_INTERVAL)
}

async function waitForModelInstance(instance: Oml2dInstance, requestId: number) {
  const startTime = Date.now()
  let lastSnapshotSecond = -1

  while (requestId === initRequestId && Date.now() - startTime < 6000) {
    const model = resolveModelDisplay(instance)
    if (model) {
      return model
    }

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
    if (elapsedSeconds !== lastSnapshotSecond) {
      lastSnapshotSecond = elapsedSeconds
      console.info('[Live2D] model-wait', JSON.stringify({
        requestId,
        elapsedSeconds,
        hasDirectModel: !!instance.models?.model,
        stageChildren: instance.pixiApp?.app?.stage?.children?.length ?? 0
      }))
    }

    await new Promise(resolve => globalThis.setTimeout(resolve, 80))
  }

  throw new Error('Live2D 模型实例尚未就绪')
}

async function applyModelLayout(instance: Oml2dInstance, requestId: number) {
  const model = await waitForModelInstance(instance, requestId)
  if (requestId !== initRequestId) {
    return
  }

  forceStageLayout(instance)
  model.anchor?.set?.(0.5, 1)

  const initialBounds = readModelBounds(instance)
  const horizontalPadding = Math.max(Math.round(stageWidth.value * 0.05), 16)
  const topPadding = Math.max(Math.round(stageHeight.value * 0.16), 72)
  const bottomPadding = Math.max(Math.round(stageHeight.value * 0.04), 20)
  const userScaleRatio = settingsStore.settings.live2dScale / BASE_LIVE2D_SCALE

  let finalScale = settingsStore.settings.live2dScale
  if (initialBounds) {
    // 布局刷新可能在同一模型实例上多次发生，必须先还原到未缩放尺寸再计算，否则会在不同缩放值之间来回震荡。
    const sourceSize = resolveModelSourceSize(model, initialBounds)
    const sourceWidth = sourceSize.width
    const sourceHeight = sourceSize.height
    const fitWidth = (stageWidth.value - horizontalPadding * 2) / sourceWidth
    const fitHeight = (stageHeight.value - topPadding - bottomPadding) / sourceHeight
    const fitScale = Math.min(fitWidth, fitHeight)
    finalScale = Math.max(fitScale * userScaleRatio, 0.01)
  }

  model.scale?.set?.(finalScale, finalScale)
  model.x = Math.round(stageWidth.value * 0.5)
  model.y = Math.round(stageHeight.value - bottomPadding)

  if (lastCursorPoint) {
    applyModelFocus(instance, lastCursorPoint, true)
  }

  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
  if (requestId !== initRequestId) {
    return
  }

  const adjustedBounds = readModelBounds(instance)
  if (adjustedBounds) {
    const rightLimit = stageWidth.value - horizontalPadding
    const leftLimit = horizontalPadding
    const topLimit = topPadding
    const bottomLimit = stageHeight.value - 10

    const overflowRight = adjustedBounds.x + adjustedBounds.width - rightLimit
    const overflowLeft = leftLimit - adjustedBounds.x
    const overflowTop = topLimit - adjustedBounds.y
    const overflowBottom = adjustedBounds.y + adjustedBounds.height - bottomLimit

    if (overflowRight > 0) {
      model.x -= overflowRight
    } else if (overflowLeft > 0) {
      model.x += overflowLeft
    }

    if (overflowBottom > 0) {
      model.y -= overflowBottom
    } else if (overflowTop > 0) {
      model.y += overflowTop
    }
  }

  console.info('[Live2D] layout', {
    requestId,
    stageWidth: stageWidth.value,
    stageHeight: stageHeight.value,
    finalScale,
    initialBounds,
    adjustedBounds: readModelBounds(instance)
  })

  emitModelBounds(instance)
}

async function recoverModelLayout(instance: Oml2dInstance, requestId: number) {
  if (!instance.reloadModel) {
    return false
  }

  console.info('[Live2D] reload-fallback', JSON.stringify({ requestId }))

  try {
    await instance.reloadModel()
  } catch (error) {
    console.warn('[Live2D] reload-fallback-failed', JSON.stringify({
      requestId,
      message: error instanceof Error ? error.message : String(error)
    }))
    return false
  }

  if (requestId !== initRequestId) {
    return false
  }

  bindModelInteractions(instance, requestId)
  await applyModelLayout(instance, requestId)
  startBoundsSync(instance, requestId)
  console.info('[Live2D] reload-fallback-ready', JSON.stringify({ requestId }))
  return true
}

function scheduleLayoutRefresh() {
  if (layoutTimerId !== null) {
    globalThis.clearTimeout(layoutTimerId)
  }

  layoutTimerId = globalThis.setTimeout(() => {
    layoutTimerId = null

    if (!oml2dInstance || !isReady.value) {
      return
    }

    const instance = oml2dInstance
    const requestId = initRequestId
    void applyModelLayout(instance, requestId)
      .then(() => {
        if (instance !== oml2dInstance || requestId !== initRequestId) {
          return
        }

        if (lastCursorPoint) {
          applyModelFocus(instance, lastCursorPoint, true)
        }
        startBoundsSync(instance, requestId)
      })
      .catch((error) => {
        if (requestId !== initRequestId) {
          return
        }

        console.warn('[Live2D] 布局刷新失败:', error)
      })
  }, 90)
}

function waitForLive2DReady(instance: Oml2dInstance, requestId: number) {
  return new Promise<void>((resolve, reject) => {
    let modelLoaded = false
    let stageVisible = false
    let settled = false

    const finalize = () => {
      if (settled || requestId !== initRequestId || !stageVisible) {
        return
      }

      const rendered = hasRenderableContent()
      const hasModelDisplay = !!resolveModelDisplay(instance)
      if (!rendered && !modelLoaded && !hasModelDisplay) {
        return
      }

      settled = true
      console.info('[Live2D] ready', JSON.stringify({
        requestId,
        modelLoaded,
        rendered,
        hasModelDisplay
      }))
      globalThis.clearTimeout(timeoutId)
      globalThis.clearInterval(pollTimerId)
      resolve()
    }

    const pollTimerId = globalThis.setInterval(() => {
      if (settled || requestId !== initRequestId) {
        globalThis.clearInterval(pollTimerId)
        return
      }

      finalize()
    }, 180)

    const timeoutId = globalThis.setTimeout(() => {
      if (settled || requestId !== initRequestId) {
        return
      }

      settled = true
      globalThis.clearInterval(pollTimerId)
      reject(new Error('Live2D 模型加载超时'))
    }, 12000)

    instance.onLoad?.((status) => {
      console.info('[Live2D] onLoad', { status, requestId })
      if (settled || requestId !== initRequestId) {
        return
      }

      if (status === 'fail') {
        settled = true
        globalThis.clearTimeout(timeoutId)
        globalThis.clearInterval(pollTimerId)
        reject(new Error('Live2D 模型资源加载失败'))
        return
      }

      if (status === 'success') {
        modelLoaded = true
        finalize()
      }
    })

    instance.onStageSlideIn?.(() => {
      console.info('[Live2D] onStageSlideIn', { requestId })
      if (settled || requestId !== initRequestId) {
        return
      }

      stageVisible = true
      finalize()
    })
  })
}

async function initLive2D() {
  const runtimeModelPath = settingsStore.settings.live2dModel?.trim()
  if (!containerRef.value || !runtimeModelPath) {
    return
  }

  syncStageSize()
  isReady.value = false
  const requestId = ++initRequestId
  const modelPath = await resolveLive2DModelPath(runtimeModelPath)
  console.info('[Live2D] 初始化', JSON.stringify({
    runtimeModelPath,
    modelPath,
    scale: settingsStore.settings.live2dScale,
    storagePath: settingsStore.settings.live2dStoragePath,
    stageWidth: stageWidth.value,
    stageHeight: stageHeight.value,
    requestId
  }))

  try {
    await probeModelPath(modelPath, requestId)
    const { loadOml2d } = await import('oh-my-live2d')
    destroyLive2DInstance()
    localStorage.setItem('OML2D_STATUS', 'active')

    const stageStyle = {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
      background: 'transparent',
      overflow: 'visible'
    } as const

    const instance = loadOml2d({
      sayHello: false,
      initialStatus: 'active',
      mobileDisplay: true,
      transitionTime: 240,
      stageStyle,
      models: [{
        path: modelPath,
        scale: BASE_LIVE2D_SCALE,
        mobileScale: BASE_LIVE2D_SCALE,
        anchor: [0.5, 1],
        position: [Math.round(stageWidth.value * 0.5), Math.round(stageHeight.value * 0.94)],
        mobilePosition: [Math.round(stageWidth.value * 0.5), Math.round(stageHeight.value * 0.94)],
        mobileStageStyle: stageStyle,
        stageStyle
      }],
      menus: {
        disable: true,
        items: []
      },
      statusBar: {
        disable: true
      },
      tips: {
        idleTips: {
          wordTheDay: false
        },
        welcomeTips: {
          message: {
            daybreak: '早上好~新的一天开始了！',
            morning: '上午好~今天也要加油哦！',
            noon: '中午好~记得休息一下~',
            afternoon: '下午好~来杯茶吧~',
            dusk: '傍晚好~辛苦了一天呢！',
            night: '晚上好~别太晚睡哦~',
            lateNight: '深夜了，注意身体，早点休息哦~'
          }
        }
      },
      parentElement: containerRef.value
    }) as Oml2dInstance

    oml2dInstance = instance
    attachModelCreateDiagnostics(instance, requestId)
    forceStageLayout(instance)
    console.info('[Live2D] instance', JSON.stringify({
      requestId,
      hasModels: !!instance.models,
      hasDirectModel: !!instance.models?.model,
      stageChildren: instance.pixiApp?.app?.stage?.children?.length ?? 0
    }))

    const readyPromise = waitForLive2DReady(instance, requestId)
    await readyPromise

    if (requestId !== initRequestId) {
      return
    }

    isReady.value = true
    emit('ready')

    try {
      bindModelInteractions(instance, requestId)
      await applyModelLayout(instance, requestId)
      startBoundsSync(instance, requestId)
    } catch (error) {
      if (requestId !== initRequestId) {
        return
      }

      const recovered = await recoverModelLayout(instance, requestId)
      if (!recovered) {
        console.warn('[Live2D] 模型增强未完成:', error)
      }
    }

    instance.startTipsIdle?.()
  } catch (err) {
    if (requestId !== initRequestId) {
      return
    }

    isReady.value = false
    clearBoundsSync()
    console.warn('[Live2D] 加载失败:', err)
    emit('error', err instanceof Error ? err.message : 'Live2D 模型加载失败')
  }
}

function scheduleInitLive2D() {
  cancelScheduledInit()

  if ('requestIdleCallback' in globalThis) {
    idleCallbackId = globalThis.requestIdleCallback(() => {
      void initLive2D()
    }, { timeout: 1200 })
    return
  }

  timerId = globalThis.setTimeout(() => {
    void initLive2D()
  }, 160)
}

watch(
  [
    () => settingsStore.settings.live2dModel,
    () => settingsStore.settings.live2dScale,
    () => settingsStore.settings.live2dStoragePath
  ],
  async () => {
    cancelScheduledInit()
    destroyLive2DInstance()
    isReady.value = false
    await nextTick()
    scheduleInitLive2D()
  }
)

onMounted(() => {
  detachCursorTracking = window.electronAPI?.onLive2DCursorPoint((point) => {
    lastCursorPoint = point

    if (!oml2dInstance || !isReady.value) {
      return
    }

    applyModelFocus(oml2dInstance, point)
  }) ?? null

  syncStageSize()
  resizeObserver = new ResizeObserver(() => {
    syncStageSize()
    scheduleLayoutRefresh()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  scheduleInitLive2D()
})

onUnmounted(() => {
  initRequestId += 1
  cancelScheduledInit()
  detachCursorTracking?.()
  detachCursorTracking = null
  resizeObserver?.disconnect()
  resizeObserver = null
  destroyLive2DInstance()
})
</script>

<style lang="scss" scoped>
.live2d-widget {
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
  opacity: 0;
  transition: opacity $transition-base;

  &.is-ready {
    opacity: 1;
  }
}

.live2d-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>
