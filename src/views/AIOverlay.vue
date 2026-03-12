<template>
  <div class="ai-overlay-page">
    <div class="overlay-backdrop"></div>
    <div class="overlay-shell">
      <div class="overlay-toolbar">
        <span class="overlay-badge">Live2D 共用会话</span>
        <div class="overlay-toolbar-actions">
          <button class="overlay-toolbar-btn" @click="openMainWindowToAI">主窗口</button>
          <button class="overlay-toolbar-btn" @click="openMainWindowToSettings">AI 设置</button>
        </div>
      </div>

      <AIChatDialog
        visible
        scope="live2d"
        title="AI 对话悬浮窗"
        subtitle="独立窗口，自动沿用 Live2D 会话与语音"
        :native-window-drag="false"
        :show-session-manager="false"
        :style="chatStyle"
        @close="closeOverlayWindow"
        @open-main="openMainWindowToAI"
        @open-settings="openMainWindowToSettings"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AIChatDialog from '@/components/AIChatDialog.vue'
import { useAIStore } from '@/stores/ai'

const router = useRouter()
const aiStore = useAIStore()

const chatStyle = computed(() => ({
  position: 'relative' as const,
  inset: '0',
  width: '100%',
  height: '100%',
  minHeight: '100%',
  maxHeight: '100%'
}))

function closeOverlayWindow() {
  if (window.electronAPI?.closeAIOverlayWindow) {
    window.electronAPI.closeAIOverlayWindow()
    return
  }

  if (window.electronAPI?.hideAIOverlayWindow) {
    window.electronAPI.hideAIOverlayWindow()
    return
  }

  void router.push('/ai')
}

function openMainWindowToAI() {
  const sessionId = aiStore.getActiveSessionId('live2d')
  const targetPath = sessionId
    ? `/ai?scope=live2d&sessionId=${encodeURIComponent(sessionId)}`
    : '/ai?scope=live2d'

  if (window.electronAPI?.navigateMainWindow) {
    window.electronAPI.navigateMainWindow(targetPath)
    return
  }

  void router.push(targetPath)
}

function openMainWindowToSettings() {
  if (window.electronAPI?.navigateMainWindow) {
    window.electronAPI.navigateMainWindow('/ai-settings')
    return
  }

  void router.push('/ai-settings')
}
</script>

<style lang="scss" scoped>
.ai-overlay-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(255, 214, 229, 0.82), transparent 40%),
    radial-gradient(circle at bottom right, rgba(255, 236, 198, 0.72), transparent 38%),
    linear-gradient(160deg, #fff8fb 0%, #fff1f6 56%, #fff9ef 100%);
}

.overlay-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 246, 251, 0.38)),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.14) 0 10px, rgba(255, 255, 255, 0) 10px 20px);
  opacity: 0.88;
}

.overlay-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 8px;
}

.overlay-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px 0;
}

.overlay-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.overlay-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border: 1px solid rgba(125, 50, 77, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #7d324d;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 248, 251, 0.96);
    border-color: rgba(125, 50, 77, 0.22);
  }
}

.overlay-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 205, 219, 0.96), rgba(255, 232, 190, 0.96));
  color: #7d324d;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
</style>