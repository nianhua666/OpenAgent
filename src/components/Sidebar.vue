<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-header">
      <div class="logo">
        <div class="logo-icon">
          <img src="/brand-mark.svg" :alt="`${APP_NAME} 图标`" class="logo-image" />
        </div>
        <div class="logo-copy" v-show="!collapsed">
          <span class="logo-text">{{ APP_NAME }}</span>
          <span class="logo-subtext">账号与 AI 工作台</span>
        </div>
      </div>
      <button class="btn-toggle" @click="toggleSidebar">
        <svg width="18" height="18"><use href="#icon-menu"/></svg>
      </button>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section">
        <div class="nav-label" v-show="!collapsed">核心功能</div>
        <router-link
          v-for="item in mainNav"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          :title="item.name"
        >
          <svg width="20" height="20"><use :href="`#icon-${item.icon}`"/></svg>
          <span v-show="!collapsed">{{ item.name }}</span>
        </router-link>
      </div>

      <div class="nav-section" v-if="accountTypes.length">
        <div class="nav-label" v-show="!collapsed">类型快捷入口</div>
        <router-link
          v-for="type in accountTypes"
          :key="type.id"
          :to="`/accounts/list/${type.id}`"
          class="nav-item"
          :class="{ active: $route.params.typeId === type.id }"
          :title="type.name"
        >
          <span class="type-dot" :style="{ background: type.color }"></span>
          <span v-show="!collapsed">{{ type.name }}</span>
          <span class="nav-badge" v-show="!collapsed">{{ getTypeCount(type.id) }}</span>
        </router-link>
      </div>

      <div class="nav-section">
        <div class="nav-label" v-show="!collapsed">系统</div>
        <router-link
          v-for="item in sysNav"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          :title="item.name"
        >
          <svg width="20" height="20"><use :href="`#icon-${item.icon}`"/></svg>
          <span v-show="!collapsed">{{ item.name }}</span>
        </router-link>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useAccountTypeStore } from '@/stores/accountType'
import { useAccountStore } from '@/stores/account'
import { APP_NAME } from '@/utils/appMeta'

const route = useRoute()
const settingsStore = useSettingsStore()
const typeStore = useAccountTypeStore()
const accountStore = useAccountStore()

const collapsed = computed(() => settingsStore.sidebarCollapsed)
const accountTypes = computed(() => typeStore.typeList)

const mainNav = [
  { name: '账号管理', path: '/accounts', icon: 'types' }
]

const sysNav = [
  { name: 'AI 助手', path: '/ai', icon: 'ai' },
  { name: 'AI 设置', path: '/ai-settings', icon: 'settings' },
  { name: '设置', path: '/settings', icon: 'settings' },
  { name: '数据管理', path: '/data', icon: 'data' }
]

function toggleSidebar() {
  settingsStore.update({ sidebarCollapsed: !collapsed.value })
}

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/')
}

function getTypeCount(typeId: string) {
  return accountStore.getInStockByType(typeId).length
}
</script>

<style lang="scss" scoped>
.sidebar {
  width: $sidebar-width;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  backdrop-filter: blur(var(--glass-blur));
  border-right: 1px solid var(--glass-border);
  transition: width $transition-base;
  z-index: $z-sidebar;
  overflow: hidden;
  -webkit-app-region: no-drag;

  &.collapsed {
    width: $sidebar-collapsed-width;
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-md;
  height: $topbar-height;
  -webkit-app-region: drag;
  user-select: none;

  .collapsed & {
    justify-content: center;
    padding: $spacing-sm;
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: $spacing-sm;

  .logo-image {
    width: 28px;
    height: 28px;
    display: block;
    filter: drop-shadow(0 6px 16px rgba(232, 120, 154, 0.28));
  }

  .logo-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo-text {
    font-size: $font-md;
    font-weight: 700;
    color: var(--primary);
    white-space: nowrap;
  }

  .logo-subtext {
    font-size: $font-xs;
    color: var(--text-muted);
    white-space: nowrap;
  }
}

.btn-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: $border-radius-sm;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: all $transition-fast;

  &:hover {
    background: var(--primary-bg);
    color: var(--primary);
  }
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 $spacing-sm;
  -webkit-app-region: no-drag;
}

.nav-section {
  margin-bottom: $spacing-md;
}

.nav-label {
  padding: $spacing-sm $spacing-sm $spacing-xs;
  font-size: $font-xs;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 9px $spacing-sm;
  margin: 2px 0;
  border-radius: $border-radius-sm;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: $font-sm;
  font-weight: 500;
  transition: all $transition-fast;
  white-space: nowrap;
  -webkit-app-region: no-drag;

  .collapsed & {
    justify-content: center;
    padding: 9px;
  }

  &:hover {
    background: var(--primary-bg);
    color: var(--primary);
  }

  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-inverse);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);

    .nav-badge {
      background: rgba(255,255,255,0.25);
      color: var(--text-inverse);
    }
  }
}

.type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nav-badge {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-bg);
  color: var(--primary);
}
</style>
