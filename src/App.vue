<template>
  <div v-if="ready" class="app-root">
    <SvgIcons />
    <template v-if="isOverlayRoute">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </template>
    <div v-else class="app-shell">
      <Sidebar />
      <div class="app-main">
        <TopBar :show-search="showSearch" @search="onSearch" />
        <div class="page-content">
          <router-view v-slot="{ Component }">
            <transition name="page" mode="out-in">
              <component :is="Component" :search-query="searchQuery" />
            </transition>
          </router-view>
        </div>
      </div>
    </div>
    <ToastContainer />
  </div>
  <div v-else class="loading-screen">
    <div class="loading-spinner"></div>
    <p>正在加载...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SvgIcons from '@/components/SvgIcons.vue'
import Sidebar from '@/components/Sidebar.vue'
import TopBar from '@/components/TopBar.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { useAIStore } from '@/stores/ai'
import { useSub2ApiStore } from '@/stores/sub2api'
import { showToast } from '@/utils/toast'

const settingsStore = useSettingsStore()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()
const aiStore = useAIStore()
const sub2ApiStore = useSub2ApiStore()
const route = useRoute()
const router = useRouter()

const ready = ref(false)
const searchQuery = ref('')
const isOverlayRoute = computed(() => route.meta?.overlay === true)

watch(isOverlayRoute, (overlayMode) => {
  document.documentElement.setAttribute('data-window-mode', overlayMode ? 'overlay' : 'main')
}, { immediate: true })

const showSearch = computed(() => !isOverlayRoute.value)

function onSearch(q: string) {
  searchQuery.value = q
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false

  const tagName = element.tagName.toLowerCase()
  return element.isContentEditable || ['input', 'textarea', 'select'].includes(tagName)
}

function focusSearchBox() {
  window.dispatchEvent(new Event('app:focus-search'))
}

function clearSearchBox() {
  window.dispatchEvent(new Event('app:clear-search'))
}

function buildTypeAwarePath(basePath: string) {
  const typeId = typeof route.params.typeId === 'string' ? route.params.typeId : ''
  return typeId ? `${basePath}/${typeId}` : basePath
}

function handleGlobalHotkey(event: KeyboardEvent) {
  if (event.key === 'Escape' && showSearch.value) {
    clearSearchBox()
    return
  }

  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return
  }

  const key = event.key.toLowerCase()
  if (isEditableTarget(event.target) && key !== 'k') {
    return
  }

  switch (key) {
    case 'k':
      event.preventDefault()
      if (showSearch.value) {
        focusSearchBox()
      } else {
        router.push('/records').then(() => focusSearchBox())
      }
      break
    case '1':
      event.preventDefault()
      router.push('/accounts')
      break
    case '2':
      event.preventDefault()
      router.push('/types')
      break
    case 'i':
      event.preventDefault()
      router.push(buildTypeAwarePath('/import'))
      break
    case 'e':
      event.preventDefault()
      router.push(buildTypeAwarePath('/export'))
      break
    case ',':
      event.preventDefault()
      router.push('/settings')
      break
  }
}

function showHotkeyHintOnce() {
  if (localStorage.getItem('am_hotkey_tip_seen')) {
    return
  }

  localStorage.setItem('am_hotkey_tip_seen', '1')
  showToast('info', '快捷键：Ctrl/Cmd + K 搜索，Ctrl/Cmd + 1 账号管理，Ctrl/Cmd + I 导入，Ctrl/Cmd + E 导出', 5200)
}

onMounted(async () => {
  const initTasks: Array<Promise<unknown>> = [
    settingsStore.init(),
    aiStore.init(),
    sub2ApiStore.init(),
    typeStore.init(),
    accountStore.init()
  ]

  await Promise.all(initTasks)
  ready.value = true

  if (!isOverlayRoute.value) {
    window.addEventListener('keydown', handleGlobalHotkey)
    showHotkeyHintOnce()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalHotkey)
})
</script>

<style lang="scss" scoped>
.app-root {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  -webkit-app-region: no-drag;
}

.page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: $spacing-lg;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
  -webkit-app-region: no-drag;
}

.loading-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-md;
  color: var(--text-secondary);
  background: var(--bg-gradient);

  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
