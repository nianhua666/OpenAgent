<template>
  <div class="settings-page">
    <h2 class="page-title">设置</h2>

    <!-- 外观 -->
    <div class="settings-section glass-panel" v-if="showAppearanceSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-settings"/></svg>
        外观设置
      </h3>

      <div class="setting-row" v-if="showThemeSetting">
        <div class="setting-label">
          <div class="label-main">主题</div>
          <div class="label-desc">选择应用配色主题</div>
        </div>
        <div class="theme-grid">
          <button
            v-for="t in filteredThemes"
            :key="t.value"
            class="theme-btn"
            :class="{ active: settings.theme === t.value }"
            @click="updateSetting('theme', t.value)"
          >
            <span class="theme-preview" :style="{ background: t.gradient }"></span>
            <span class="theme-name">{{ t.name }}</span>
          </button>
        </div>
      </div>

      <div class="setting-row" v-if="showSidebarSetting">
        <div class="setting-label">
          <div class="label-main">侧边栏</div>
          <div class="label-desc">折叠侧边栏以获得更多空间</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.sidebarCollapsed" @change="updateSetting('sidebarCollapsed', !settings.sidebarCollapsed)" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- Live2D -->
    <div class="settings-section glass-panel" v-if="showLive2DSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-user"/></svg>
        Live2D 设置
      </h3>

      <div class="setting-row" v-if="showLive2DEnableRow">
        <div class="setting-label">
          <div class="label-main">启用 Live2D</div>
          <div class="label-desc">以独立悬浮窗形式显示 Live2D，并保持在其它软件上层</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.live2dEnabled" @change="updateSetting('live2dEnabled', !settings.live2dEnabled)" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row" v-if="settings.live2dEnabled && showLive2DCurrentModelRow">
        <div class="setting-label">
          <div class="label-main">当前模型</div>
          <div class="label-desc">{{ settings.live2dModel ? '默认 Shizuku 已随安装包内置；悬浮窗、托盘和设置页会始终共用这一套模型状态。' : '正在准备默认模型。' }}</div>
        </div>
        <div class="current-model-box" :class="{ 'is-empty': !settings.live2dModel }">
          <strong>{{ settings.live2dModelName || '未选择模型' }}</strong>
          <span class="model-source-badge" :class="`is-${settings.live2dModelSource}`">{{ sourceLabel(settings.live2dModelSource) }}</span>
        </div>
      </div>

      <div class="setting-row" v-if="settings.live2dEnabled && showLive2DScaleRow">
        <div class="setting-label">
          <div class="label-main">模型缩放</div>
          <div class="label-desc">调整 Live2D 角色大小，较大模型会同步放宽异形悬浮窗的显示范围</div>
        </div>
        <div class="range-wrap">
          <input type="range" min="0.05" max="0.45" step="0.01" :value="settings.live2dScale" @input="updateSetting('live2dScale', parseFloat(($event.target as HTMLInputElement).value))" />
          <span class="range-val">{{ (settings.live2dScale * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <template v-if="settings.live2dEnabled">
        <div class="live2d-banner" v-if="showLive2DBanner">
          <p>默认模型已经改为 Shizuku，并且直接随安装包内置，不再依赖首次联网下载。Live2D 现在会以独立异形悬浮窗运行，关闭主窗口后仍可继续显示。</p>
          <p>模型默认改为双击唤出工具按钮，空白区域不再保留整块透明点击层；拖动时仍然可以直接按住模型移动窗口。</p>
          <p>远程模型不会自动混进默认配置，只有你主动输入地址并选择下载、缓存、导入后，才会进入本地模型库；不需要的模型也可以随时删除，托盘右键也能直接切换模型。</p>
        </div>

        <div class="live2d-layout">
          <div class="live2d-card" v-if="showDefaultModelCard">
            <div class="card-head">
              <div>
                <div class="label-main">默认内置模型</div>
                <div class="label-desc">Shizuku 已从公开地址下载并随安装包打入资源目录</div>
              </div>
            </div>
            <div class="default-model-panel">
              <strong>{{ bundledDefaultModel.name }}</strong>
              <span>当前内置路径：{{ bundledDefaultModel.runtimePath }}</span>
            </div>
            <div class="inline-actions">
              <button class="btn btn-primary btn-sm" :disabled="live2dBusy || isModelActive(bundledDefaultModel)" @click="restoreBundledDefault">
                {{ isModelActive(bundledDefaultModel) ? '默认模型使用中' : '恢复默认模型' }}
              </button>
              <button class="btn btn-secondary btn-sm" @click="openLink(openSourceDefaultLink)">
                查看开源地址
              </button>
            </div>
            <p class="model-tip">默认模型来源：公开 npm 包 live2d-widget-model-shizuku，资源已解入安装包内置目录。</p>
          </div>

          <div class="live2d-card" v-if="showLocalLibraryCard">
            <div class="card-head">
              <div>
                <div class="label-main">本地模型库</div>
                <div class="label-desc">这里会展示已缓存、已导入和安装包内置的模型</div>
              </div>
            </div>

            <div v-if="filteredLocalModels.length === 0" class="desktop-tip">
              目前还没有检测到本地模型。你可以先缓存一个远程模型，或者手动导入自己的模型目录。
            </div>

            <div v-else class="model-list">
              <div class="model-row" v-for="model in filteredLocalModels" :key="model.id">
                <div class="model-main">
                  <div class="model-title-row">
                    <strong>{{ model.name }}</strong>
                    <span class="model-source-badge" :class="`is-${model.source}`">{{ sourceLabel(model.source) }}</span>
                  </div>
                  <div class="model-path" :title="model.localPath || model.runtimePath">{{ model.localPath || model.runtimePath }}</div>
                </div>
                <div class="model-actions">
                  <button class="btn btn-secondary btn-sm" :disabled="live2dBusy || isModelActive(model)" @click="selectLocalModel(model)">
                    {{ isModelActive(model) ? '当前使用中' : '使用' }}
                  </button>
                  <button v-if="canDeleteModel(model)" class="btn btn-secondary btn-sm" :disabled="live2dBusy" @click="deleteModel(model)">
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="live2d-card" v-if="showImportCard">
            <div class="card-head">
              <div>
                <div class="label-main">导入与打包</div>
                  <div class="label-desc">支持把本地模型复制到应用私有目录，也支持继续往安装包内置目录追加模型</div>
              </div>
            </div>

            <div class="inline-actions">
              <button class="btn btn-primary btn-sm" :disabled="live2dBusy" @click="importModel">导入本地模型</button>
              <button class="btn btn-secondary btn-sm" :disabled="live2dBusy" @click="refreshModelLibrary">刷新模型库</button>
            </div>

            <div class="inline-actions">
              <button class="btn btn-secondary btn-sm" :disabled="live2dBusy || !hasElectronAPI" @click="selectLive2DStoragePath">选择缓存目录</button>
              <button class="btn btn-secondary btn-sm" :disabled="live2dBusy || !settings.live2dStoragePath" @click="resetLive2DStoragePath">恢复默认目录</button>
            </div>

            <div class="path-grid" v-if="live2dPaths">
              <div class="path-card">
                <span class="path-label">本地缓存目录</span>
                <strong>{{ live2dPaths.storagePath }}</strong>
                <small>{{ live2dPaths.usingCustomStorage ? '当前使用自定义缓存目录' : '当前使用默认缓存目录' }}</small>
              </div>
              <div class="path-card">
                <span class="path-label">打包扫描目录</span>
                <strong>{{ live2dPaths.bundledPath }}</strong>
                <small>安装包内置目录为只读，不能在运行时改写</small>
              </div>
            </div>

            <div class="desktop-tip" v-else>
              浏览器预览模式下只能直接使用远程模型；本地缓存、导入和打包内置功能需要桌面版 Electron 环境。
            </div>
          </div>

          <div class="live2d-card live2d-card-wide" v-if="showRemoteCard">
            <div class="card-head">
              <div>
                <div class="label-main">远程模型</div>
                <div class="label-desc">可以先从内置远程预设一键选择，也可以自己输入公开的 model.json 或 model3.json 地址。桌面版会优先缓存到本地后再启用。</div>
              </div>
            </div>

            <div class="preset-grid" v-if="filteredRemotePresets.length">
              <div class="preset-card" v-for="preset in filteredRemotePresets" :key="preset.id">
                <div class="preset-copy">
                  <strong>{{ preset.name }}</strong>
                  <span>{{ preset.description }}</span>
                  <small>{{ preset.url }}</small>
                </div>
                <div class="model-actions">
                  <button class="btn btn-secondary btn-sm" :disabled="live2dBusy" @click="useRemotePreset(preset)">
                    直接使用
                  </button>
                  <button class="btn btn-primary btn-sm" :disabled="live2dBusy" @click="cacheRemotePreset(preset)">
                    下载并启用
                  </button>
                </div>
              </div>
            </div>

            <div class="remote-editor">
              <input class="input" v-model="customModelName" placeholder="模型显示名称（可选）" />
              <input class="input" v-model="remoteModelUrl" placeholder="https://example.com/model3.json" />
              <div class="inline-actions">
                <button class="btn btn-primary btn-sm" :disabled="live2dBusy" @click="cacheCustomModel">下载到本地并使用</button>
                <button class="btn btn-secondary btn-sm" :disabled="live2dBusy" @click="useRemoteDirectly">直接使用远程</button>
              </div>
              <p class="field-tip">桌面版会自动先缓存模型配置里引用的贴图、动作、物理、表情等资源，再切换到本地模型库中的可用版本；缓存后的模型可切换也可删除。</p>
            </div>
          </div>

          <div class="live2d-card live2d-card-wide" v-if="showReferenceCard">
            <div class="card-head">
              <div>
                <div class="label-main">参考下载地址</div>
                <div class="label-desc">我优先给你保留了官方和文档入口，方便你自行挑选并导入有授权的模型</div>
              </div>
            </div>

            <div class="reference-list">
              <button class="reference-link" v-for="link in filteredReferenceLinks" :key="link.url" @click="openLink(link.url)">
                <strong>{{ link.name }}</strong>
                <span>{{ link.description }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="settings-section glass-panel" v-if="showDesktopSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-menu"/></svg>
        桌面运行
      </h3>

      <div class="setting-row" v-if="showTraySetting">
        <div class="setting-label">
          <div class="label-main">关闭主窗口时驻留托盘</div>
          <div class="label-desc">开启后点击关闭只会隐藏主窗口，应用会继续在 Windows 右下角后台运行</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.closeToTray" @change="updateSetting('closeToTray', !settings.closeToTray)" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row" v-if="showLaunchSetting">
        <div class="setting-label">
          <div class="label-main">开机自启动</div>
          <div class="label-desc">系统登录后自动启动 {{ APP_NAME }}，和托盘菜单中的开关保持同步</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.launchAtLogin" @change="updateSetting('launchAtLogin', !settings.launchAtLogin)" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="desktop-runtime-card" v-if="showDesktopRuntimeCard">
        <p>主窗口和 Live2D 悬浮窗现在已经完全独立。你可以隐藏主窗口，仅保留悬浮窗在桌面最上层运行；也可以通过系统托盘左键快速拉起主窗口。</p>
        <p>托盘右键菜单会同步显示主窗口开关、Live2D 开关、模型选择和开机自启动，和这里的设置保持同一份状态。</p>
      </div>
    </div>

    <!-- 数据 -->
    <div class="settings-section glass-panel" v-if="showDataSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-data"/></svg>
        数据设置
      </h3>

      <div class="data-storage-card" v-if="showRuntimeDataStorageCard">
        <div class="card-head">
          <div>
            <div class="label-main">运行数据目录</div>
            <div class="label-desc">控制账号数据、AI 会话、设置、日志、MCP 临时截图和默认 Live2D 本地缓存的根目录；切换时会把当前运行数据整体迁移过去。</div>
          </div>
        </div>

        <div class="inline-actions">
          <button class="btn btn-primary btn-sm" :disabled="runtimeDataBusy || !hasElectronAPI" @click="selectRuntimeDataStoragePath">选择目录并迁移</button>
          <button class="btn btn-secondary btn-sm" :disabled="runtimeDataBusy || !hasElectronAPI || !runtimeDataStorageInfo || runtimeDataStorageInfo.usingRecommendedStorage" @click="moveRuntimeDataToRecommendedPath">一键切到推荐目录</button>
          <button class="btn btn-secondary btn-sm" :disabled="runtimeDataBusy || !hasElectronAPI || !runtimeDataStorageInfo || runtimeDataStorageInfo.mode === 'auto'" @click="resetRuntimeDataStorageMode">恢复自动策略</button>
        </div>

        <div class="path-grid" v-if="runtimeDataStorageInfo">
          <div class="path-card" :class="{ 'is-alert': runtimeDataStorageInfo.onSystemDrive }">
            <span class="path-label">当前运行根目录</span>
            <strong>{{ runtimeDataStorageInfo.activeUserDataPath }}</strong>
            <small>{{ runtimeDataStorageInfo.mode === 'custom' ? '当前由你手动指定' : '当前由自动策略管理' }} · {{ runtimeDataStorageInfo.onSystemDrive ? '仍位于系统盘，建议迁移' : '已不在系统盘' }}</small>
          </div>
          <div class="path-card">
            <span class="path-label">推荐目录</span>
            <strong>{{ runtimeDataStorageInfo.recommendedUserDataPath }}</strong>
            <small>{{ runtimeDataStorageInfo.usingRecommendedStorage ? '当前已使用推荐目录' : '可一键迁移到该目录' }}</small>
          </div>
          <div class="path-card">
            <span class="path-label">业务数据 JSON 目录</span>
            <strong>{{ runtimeDataStorageInfo.dataPath }}</strong>
            <small>账号、类型、导入导出记录、AI 会话与设置文件都会写在这里</small>
          </div>
          <div class="path-card">
            <span class="path-label">日志目录</span>
            <strong>{{ runtimeDataStorageInfo.logsPath }}</strong>
            <small>Live2D 调试日志和后续运行日志会落在这里</small>
          </div>
          <div class="path-card">
            <span class="path-label">MCP 临时截图目录</span>
            <strong>{{ runtimeDataStorageInfo.tempPath }}</strong>
            <small>桌面读屏截图、临时视觉校验文件会落在这里</small>
          </div>
          <div class="path-card">
            <span class="path-label">默认 Live2D 缓存目录</span>
            <strong>{{ runtimeDataStorageInfo.live2dDefaultStoragePath }}</strong>
            <small>仅在未单独指定 Live2D 自定义缓存目录时生效</small>
          </div>
        </div>

        <div v-if="runtimeDataStatus" class="desktop-tip">{{ runtimeDataStatus }}</div>
        <div class="desktop-tip" v-if="hasElectronAPI">说明：为了在下次启动前记住你的选择，系统盘仍会保留一个极小的路径偏好文件；真正的大体积运行数据会尽量迁移到你指定或推荐的位置。</div>
        <div class="desktop-tip" v-else>浏览器预览模式下无法切换运行数据目录；该能力仅在 Electron 桌面版生效。</div>
      </div>

      <div class="setting-row" v-if="showCurrencySetting">
        <div class="setting-label">
          <div class="label-main">货币符号</div>
          <div class="label-desc">金额显示的货币符号</div>
        </div>
        <select class="input" style="width:100px" :value="settings.currencySymbol" @change="updateSetting('currencySymbol', ($event.target as HTMLSelectElement).value)">
          <option value="¥">¥ (人民币)</option>
          <option value="$">$ (美元)</option>
          <option value="€">€ (欧元)</option>
          <option value="£">£ (英镑)</option>
          <option value="₩">₩ (韩元)</option>
        </select>
      </div>

      <div class="setting-row" v-if="showPageSizeSetting">
        <div class="setting-label">
          <div class="label-main">每页显示数</div>
          <div class="label-desc">列表的默认分页大小</div>
        </div>
        <select class="input" style="width:100px" :value="settings.defaultPageSize" @change="updateSetting('defaultPageSize', parseInt(($event.target as HTMLSelectElement).value))">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </div>
    </div>

    <div class="settings-section glass-panel" v-if="showShortcutSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-keyboard"/></svg>
        效率快捷键
      </h3>
      <div class="shortcut-list">
        <div class="shortcut-row" v-for="shortcut in filteredShortcuts" :key="shortcut.action">
          <span class="shortcut-keys">{{ shortcut.keys }}</span>
          <span class="shortcut-action">{{ shortcut.action }}</span>
        </div>
      </div>
    </div>

    <div class="settings-section glass-panel" v-if="showAIEntrySection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-ai"/></svg>
        AI 设置
      </h3>

      <div class="settings-migration-card">
        <div class="migration-copy">
          <strong>AI 配置已经迁移到独立页面</strong>
          <p>模型连接、系统提示词、Windows MCP 开关，以及托管 MCP 与 skills 的可视化管理，现已统一收口到 AI 设置页。</p>
          <small>这样可以把通用设置页保持在外观、桌面和数据配置上，减少无关逻辑混在一起。</small>
        </div>
        <div class="inline-actions">
          <button class="btn btn-primary btn-sm" @click="openAISettingsPage">前往 AI 设置</button>
          <button class="btn btn-secondary btn-sm" @click="openAIOverlayWindow">打开 AI 悬浮窗</button>
          <button class="btn btn-secondary btn-sm" @click="router.push('/ai')">打开 Agent</button>
        </div>
      </div>
    </div>

    <div class="settings-section glass-panel" v-if="showAboutSection">
      <h3 class="section-title">
        <svg width="18" height="18"><use href="#icon-note"/></svg>
        关于
      </h3>
      <div class="about-info">
        <div class="about-brand">
          <img src="/brand-mark.svg" :alt="`${APP_NAME} 图标`" class="about-icon" />
          <div>
            <p><strong>{{ APP_NAME }}</strong> v{{ APP_VERSION }}</p>
            <p>{{ APP_TAGLINE }}，统一收口账号管理、Agent 以及托管 MCP / Skills 扩展能力。</p>
          </div>
        </div>
        <div class="about-meta">
          <div class="about-row">
            <span class="meta-key">开发者</span>
            <span class="meta-value">年华</span>
          </div>
          <div class="about-row">
            <span class="meta-key">联系邮箱</span>
            <span class="meta-value">389338923@qq.com</span>
          </div>
          <div class="about-row">
            <span class="meta-key">技术栈</span>
            <span class="meta-value">Electron 29 / Vue 3 / TypeScript / Pinia / ECharts</span>
          </div>
          <div class="about-row">
            <span class="meta-key">应用定位</span>
            <span class="meta-value">桌面级账号管理、AI 协作与托管扩展工作台</span>
          </div>
        </div>
        <div class="about-actions">
          <button class="btn btn-secondary btn-sm" @click="contactDeveloper">
            联系开发者
          </button>
        </div>
      </div>
    </div>

    <div v-if="normalizedSearchQuery && !hasVisibleSection" class="empty-state glass-panel settings-empty">
      <svg width="64" height="64"><use href="#icon-search"/></svg>
      <div class="empty-title">未找到匹配设置项</div>
      <div class="empty-desc">请尝试其他搜索关键词。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Live2DLibraryItem, Live2DModelPreset, Live2DModelSource, Live2DStoragePaths, RuntimeDataStorageInfo, RuntimeDataStorageMode } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import { matchesSearchQuery, normalizeSearchQuery } from '@/utils/search'
import { showToast } from '@/utils/toast'
import { APP_FEEDBACK_SUBJECT, APP_NAME, APP_TAGLINE, APP_VERSION } from '@/utils/appMeta'
import {
  chooseDirectory,
  DEFAULT_BUNDLED_LIVE2D_MODEL,
  LIVE2D_REMOTE_MODEL_PRESETS,
  LIVE2D_REFERENCE_LINKS,
  SHIZUKU_OPEN_SOURCE_REPO,
  SHIZUKU_OPEN_SOURCE_URL,
  cacheLive2DRemoteModel,
  deleteLocalLive2DModel,
  getLive2DStoragePaths,
  guessLive2DModelName,
  importLocalLive2DModel,
  isRemoteLive2DModelUrl,
  listLocalLive2DModels,
  normalizeLive2DModelUrl
} from '@/utils/live2d'

const props = defineProps<{ searchQuery?: string }>()
const router = useRouter()
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)
const localModels = ref<Live2DLibraryItem[]>([])
const live2dPaths = ref<Live2DStoragePaths | null>(null)
const live2dBusy = ref(false)
const runtimeDataStorageInfo = ref<RuntimeDataStorageInfo | null>(null)
const runtimeDataBusy = ref(false)
const runtimeDataStatus = ref('')
const customModelName = ref('')
const remoteModelUrl = ref('')
const bundledDefaultModel = DEFAULT_BUNDLED_LIVE2D_MODEL
const openSourceDefaultLink = SHIZUKU_OPEN_SOURCE_REPO
const hasElectronAPI = typeof window !== 'undefined' && !!window.electronAPI
const normalizedSearchQuery = computed(() => normalizeSearchQuery(props.searchQuery))
const remotePresets = LIVE2D_REMOTE_MODEL_PRESETS

const themes = [
  { name: '樱花粉', value: 'sakura', gradient: 'linear-gradient(135deg, #fdf2f5, #f5a0b8)' },
  { name: '天空蓝', value: 'ocean', gradient: 'linear-gradient(135deg, #f0f5fa, #8dc1ea)' },
  { name: '暮夜紫', value: 'twilight', gradient: 'linear-gradient(135deg, #f3f0fa, #bfa0ff)' },
  { name: '翡翠绿', value: 'jade', gradient: 'linear-gradient(135deg, #f0f8f5, #72d4ad)' },
  { name: '暗夜', value: 'dark', gradient: 'linear-gradient(135deg, #1a1a2e, #0f0f1a)' }
]

const referenceLinks = LIVE2D_REFERENCE_LINKS

const shortcuts = [
  { keys: 'Ctrl / Cmd + K', action: '聚焦搜索框' },
  { keys: 'Ctrl / Cmd + 1', action: '打开账号管理首页' },
  { keys: 'Ctrl / Cmd + 2', action: '打开账号类型管理' },
  { keys: 'Ctrl / Cmd + I', action: '快速进入导入页' },
  { keys: 'Ctrl / Cmd + E', action: '快速进入导出页' },
  { keys: 'Ctrl / Cmd + ,', action: '打开设置页' },
  { keys: 'Esc', action: '清空当前搜索词' }
]

const filteredThemes = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return themes
  }

  return themes.filter(theme => matchesSearchQuery(query, theme.name, theme.value))
})

const filteredLocalModels = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return localModels.value
  }

  return localModels.value.filter(model => matchesSearchQuery(
    query,
    model.name,
    model.runtimePath,
    model.localPath,
    sourceLabel(model.source)
  ))
})

const filteredReferenceLinks = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return referenceLinks
  }

  return referenceLinks.filter(link => matchesSearchQuery(query, link.name, link.description, link.url))
})

const filteredRemotePresets = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return remotePresets
  }

  return remotePresets.filter(preset => matchesSearchQuery(query, preset.name, preset.description, preset.url, preset.referenceUrl))
})

const filteredShortcuts = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) {
    return shortcuts
  }

  return shortcuts.filter(shortcut => matchesSearchQuery(query, shortcut.keys, shortcut.action))
})

const showThemeSetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '主题', '外观设置', themes))
const showSidebarSetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '侧边栏', '折叠侧边栏', '空间'))
const showAppearanceSection = computed(() => showThemeSetting.value || showSidebarSetting.value)

const showLive2DEnableRow = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '启用 Live2D', '悬浮窗', '置顶', '模型'))
const showLive2DCurrentModelRow = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '当前模型', settings.value.live2dModelName, settings.value.live2dModel, sourceLabel(settings.value.live2dModelSource)))
const showLive2DScaleRow = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '模型缩放', settings.value.live2dScale))
const showLive2DBanner = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '默认模型', 'Shizuku', '安装包内置', '托盘'))
const showDefaultModelCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '默认内置模型', bundledDefaultModel.name, bundledDefaultModel.runtimePath, '开源地址'))
const showLocalLibraryCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '本地模型库', filteredLocalModels.value, '缓存', '导入', '删除'))
const showImportCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '导入与打包', '本地缓存目录', '自定义缓存目录', '重置默认目录', '打包扫描目录', live2dPaths.value?.storagePath, live2dPaths.value?.bundledPath, settings.value.live2dStoragePath))
const showRemoteCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '远程模型', '自定义远程模型', filteredRemotePresets.value, remoteModelUrl.value, customModelName.value, '缓存', '下载'))
const showReferenceCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '参考下载地址', filteredReferenceLinks.value, '许可'))
const showLive2DSection = computed(() => showLive2DEnableRow.value || showLive2DCurrentModelRow.value || showLive2DScaleRow.value || showLive2DBanner.value || showDefaultModelCard.value || showLocalLibraryCard.value || showImportCard.value || showRemoteCard.value || showReferenceCard.value)

const showTraySetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '关闭主窗口时驻留托盘', '托盘', '后台运行'))
const showLaunchSetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '开机自启动', '系统登录', '同步'))
const showDesktopRuntimeCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '主窗口', '悬浮窗', '系统托盘', '开机自启动'))
const showDesktopSection = computed(() => showTraySetting.value || showLaunchSetting.value || showDesktopRuntimeCard.value)

const showRuntimeDataStorageCard = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(
  normalizedSearchQuery.value,
  '运行数据目录',
  '数据迁移',
  '日志目录',
  '临时截图目录',
  '推荐目录',
  '自定义目录',
  runtimeDataStorageInfo.value?.activeUserDataPath,
  runtimeDataStorageInfo.value?.recommendedUserDataPath,
  runtimeDataStorageInfo.value?.dataPath,
  runtimeDataStorageInfo.value?.logsPath,
  runtimeDataStorageInfo.value?.tempPath,
  runtimeDataStorageInfo.value?.live2dDefaultStoragePath
))
const showCurrencySetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '货币符号', settings.value.currencySymbol, '人民币', '美元', '欧元', '英镑', '韩元'))
const showPageSizeSetting = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '每页显示数', settings.value.defaultPageSize, '分页'))
const showDataSection = computed(() => showRuntimeDataStorageCard.value || showCurrencySetting.value || showPageSizeSetting.value)

const showShortcutSection = computed(() => filteredShortcuts.value.length > 0 || !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '效率快捷键', '搜索', '账号管理'))
const showAboutSection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, '关于', '开发者', '年华', '389338923@qq.com', 'Electron', 'Vue', 'TypeScript', APP_NAME, '账号工作台'))

const showAIEntrySection = computed(() => !normalizedSearchQuery.value || matchesSearchQuery(normalizedSearchQuery.value, 'AI', 'AI 设置', '模型', '提示词', 'MCP', 'skills', '托管扩展', '连接设置'))

const hasVisibleSection = computed(() => showAppearanceSection.value || showLive2DSection.value || showDesktopSection.value || showDataSection.value || showShortcutSection.value || showAIEntrySection.value || showAboutSection.value)

const sourceLabelMap: Record<Live2DModelSource, string> = {
  preset: '预设缓存',
  bundled: '安装包内置',
  imported: '本地导入',
  custom: '自定义缓存'
}

function updateSetting(key: string, value: unknown) {
  settingsStore.update({ [key]: value })
}

function openAISettingsPage() {
  void router.push('/ai-settings')
}

function openAIOverlayWindow() {
  if (window.electronAPI?.showAIOverlayWindow) {
    window.electronAPI.showAIOverlayWindow()
    return
  }

  void router.push('/ai')
}

function sourceLabel(source: Live2DModelSource) {
  return sourceLabelMap[source]
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isModelActive(model: Live2DLibraryItem) {
  return settings.value.live2dModel === model.runtimePath
}

function canDeleteModel(model: Live2DLibraryItem) {
  return model.source !== 'bundled'
}

async function restoreBundledDefault() {
  await settingsStore.restoreDefaultLive2DModel()
  showToast('success', '已恢复默认内置模型 Shizuku')
}

async function refreshModelLibrary() {
  if (!window.electronAPI) {
    localModels.value = []
    live2dPaths.value = null
    return
  }

  const [models, paths] = await Promise.all([
    listLocalLive2DModels(),
    getLive2DStoragePaths()
  ])

  localModels.value = models
  live2dPaths.value = paths
}

async function refreshRuntimeDataStorageInfo() {
  if (!window.electronAPI?.getRuntimeDataStorageInfo) {
    runtimeDataStorageInfo.value = null
    runtimeDataStatus.value = ''
    return
  }

  runtimeDataStorageInfo.value = await window.electronAPI.getRuntimeDataStorageInfo()
}

async function applyRuntimeDataStorageSwitch(mode: RuntimeDataStorageMode, targetPath?: string, successMessage?: string) {
  if (!window.electronAPI?.switchRuntimeDataStorage) {
    showToast('warning', '只有桌面版支持切换运行数据目录')
    return
  }

  runtimeDataBusy.value = true

  try {
    runtimeDataStorageInfo.value = await window.electronAPI.switchRuntimeDataStorage({ mode, targetPath })
    runtimeDataStatus.value = `迁移完成，当前运行根目录：${runtimeDataStorageInfo.value.activeUserDataPath}`
    await refreshModelLibrary()
    showToast('success', successMessage || '运行数据目录已迁移并切换')
  } catch (error) {
    const message = getErrorMessage(error, '切换运行数据目录失败')
    runtimeDataStatus.value = message
    showToast('error', message)
  } finally {
    runtimeDataBusy.value = false
  }
}

async function selectRuntimeDataStoragePath() {
  if (!window.electronAPI) {
    showToast('warning', '只有桌面版支持切换运行数据目录')
    return
  }

  runtimeDataBusy.value = true

  try {
    const selectedPath = await chooseDirectory(
      '选择运行数据目录',
      runtimeDataStorageInfo.value?.customUserDataPath || runtimeDataStorageInfo.value?.activeUserDataPath || undefined
    )

    if (!selectedPath) {
      return
    }

    runtimeDataBusy.value = false
    await applyRuntimeDataStorageSwitch('custom', selectedPath, '运行数据目录已迁移到你指定的位置')
  } catch (error) {
    const message = getErrorMessage(error, '选择运行数据目录失败')
    runtimeDataStatus.value = message
    showToast('error', message)
  } finally {
    runtimeDataBusy.value = false
  }
}

async function moveRuntimeDataToRecommendedPath() {
  await applyRuntimeDataStorageSwitch('auto', undefined, '已切换到自动推荐的运行数据目录')
}

async function resetRuntimeDataStorageMode() {
  await applyRuntimeDataStorageSwitch('auto', undefined, '已恢复自动运行数据目录策略')
}

async function selectLive2DStoragePath() {
  if (!window.electronAPI) {
    showToast('warning', '只有桌面版支持自定义缓存目录')
    return
  }

  live2dBusy.value = true

  try {
    const selectedPath = await chooseDirectory('选择 Live2D 缓存目录', live2dPaths.value?.storagePath || settings.value.live2dStoragePath || undefined)
    if (!selectedPath) {
      return
    }

    await settingsStore.update({ live2dStoragePath: selectedPath })
    await refreshModelLibrary()
    showToast('success', 'Live2D 缓存目录已切换')
  } catch (error) {
    showToast('error', getErrorMessage(error, '切换缓存目录失败'))
  } finally {
    live2dBusy.value = false
  }
}

async function resetLive2DStoragePath() {
  live2dBusy.value = true

  try {
    await settingsStore.update({ live2dStoragePath: '' })
    await refreshModelLibrary()
    showToast('success', '已恢复默认缓存目录')
  } catch (error) {
    showToast('error', getErrorMessage(error, '恢复默认缓存目录失败'))
  } finally {
    live2dBusy.value = false
  }
}

async function selectLocalModel(model: Live2DLibraryItem) {
  await settingsStore.setLive2DModel(model)
  showToast('success', `已切换到 ${model.name}`)
}

async function deleteModel(model: Live2DLibraryItem) {
  if (!window.electronAPI) {
    showToast('warning', '只有桌面版支持删除本地模型')
    return
  }

  if (!window.confirm(`确定删除模型“${model.name}”吗？`)) {
    return
  }

  live2dBusy.value = true

  try {
    const deleted = await deleteLocalLive2DModel(model.runtimePath)
    if (!deleted) {
      throw new Error('模型删除失败，目标可能已经不存在。')
    }

    if (isModelActive(model)) {
      await settingsStore.restoreDefaultLive2DModel()
    }

    await refreshModelLibrary()
    showToast('success', `${model.name} 已删除`)
  } catch (error) {
    showToast('error', getErrorMessage(error, '删除模型失败'))
  } finally {
    live2dBusy.value = false
  }
}

async function importModel() {
  if (!window.electronAPI) {
    showToast('warning', '只有桌面版支持导入本地 Live2D 模型')
    return
  }

  live2dBusy.value = true

  try {
    const importedModel = await importLocalLive2DModel()
    if (!importedModel) {
      return
    }

    await settingsStore.setLive2DModel(importedModel)
    await refreshModelLibrary()
    showToast('success', `${importedModel.name} 已导入并启用`)
  } catch (error) {
    showToast('error', getErrorMessage(error, '导入模型失败'))
  } finally {
    live2dBusy.value = false
  }
}

async function cacheCustomModel() {
  const normalizedUrl = normalizeLive2DModelUrl(remoteModelUrl.value)
  if (!isRemoteLive2DModelUrl(normalizedUrl)) {
    showToast('warning', '请输入完整的 http 或 https 模型地址')
    return
  }

  const modelName = customModelName.value.trim() || guessLive2DModelName(normalizedUrl)
  live2dBusy.value = true

  try {
    if (window.electronAPI) {
      const cachedModel = await cacheLive2DRemoteModel({
        id: `custom-${modelName}`,
        name: modelName,
        url: normalizedUrl,
        fallbackUrls: [],
        source: 'custom',
        referenceUrl: normalizedUrl
      })

      if (!cachedModel) {
        throw new Error('自定义远程模型缓存失败。')
      }

      await settingsStore.setLive2DModel(cachedModel)
      await refreshModelLibrary()
      showToast('success', `${modelName} 已下载到本地并启用`)
      return
    }

    await settingsStore.update({
      live2dModel: normalizedUrl,
      live2dModelName: modelName,
      live2dModelSource: 'custom'
    })
    showToast('info', '当前为浏览器预览模式，已直接使用远程模型地址')
  } catch (error) {
    showToast('error', getErrorMessage(error, '远程模型缓存失败'))
  } finally {
    live2dBusy.value = false
  }
}

async function useRemotePreset(preset: Live2DModelPreset) {
  live2dBusy.value = true

  try {
    await settingsStore.update({
      live2dEnabled: true,
      live2dModel: preset.url,
      live2dModelName: preset.name,
      live2dModelSource: 'preset'
    })
    remoteModelUrl.value = preset.url
    customModelName.value = preset.name
    await refreshModelLibrary()
    showToast('success', hasElectronAPI ? `${preset.name} 已缓存并启用` : `已切换到远程预设 ${preset.name}`)
  } catch (error) {
    showToast('error', getErrorMessage(error, `${preset.name} 启用失败`))
  } finally {
    live2dBusy.value = false
  }
}

async function cacheRemotePreset(preset: Live2DModelPreset) {
  live2dBusy.value = true

  try {
    const cachedModel = await cacheLive2DRemoteModel({
      id: preset.id,
      name: preset.name,
      url: preset.url,
      fallbackUrls: preset.fallbackUrls,
      source: 'preset',
      referenceUrl: preset.referenceUrl
    })

    if (!cachedModel) {
      throw new Error('预设模型下载失败')
    }

    await settingsStore.setLive2DModel(cachedModel)
    remoteModelUrl.value = preset.url
    customModelName.value = preset.name
    await refreshModelLibrary()
    showToast('success', `${preset.name} 已下载到本地并启用`)
  } catch (error) {
    showToast('error', getErrorMessage(error, `${preset.name} 下载失败`))
  } finally {
    live2dBusy.value = false
  }
}

async function useRemoteDirectly() {
  const normalizedUrl = normalizeLive2DModelUrl(remoteModelUrl.value)
  if (!isRemoteLive2DModelUrl(normalizedUrl)) {
    showToast('warning', '请输入完整的 http 或 https 模型地址')
    return
  }

  live2dBusy.value = true

  try {
    await settingsStore.update({
      live2dModel: normalizedUrl,
      live2dModelName: customModelName.value.trim() || guessLive2DModelName(normalizedUrl),
      live2dModelSource: 'custom'
    })
    await refreshModelLibrary()
    showToast('success', hasElectronAPI ? '桌面版已自动缓存远程模型并启用' : '已切换到远程模型，建议随后缓存到本地以便离线使用')
  } catch (error) {
    showToast('error', getErrorMessage(error, '远程模型启用失败'))
  } finally {
    live2dBusy.value = false
  }
}

function openLink(url: string) {
  if (window.electronAPI) {
    window.electronAPI.openExternal(url)
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function contactDeveloper() {
  const mailtoLink = 'mailto:389338923@qq.com?subject=' + encodeURIComponent(APP_FEEDBACK_SUBJECT)
  if (window.electronAPI) {
    window.electronAPI.openExternal(mailtoLink)
  } else {
    window.location.href = mailtoLink
  }
}

onMounted(() => {
  remoteModelUrl.value = (settings.value.live2dModelSource === 'custom' || settings.value.live2dModelSource === 'preset') && isRemoteLive2DModelUrl(settings.value.live2dModel)
    ? settings.value.live2dModel
    : SHIZUKU_OPEN_SOURCE_URL
  customModelName.value = (settings.value.live2dModelSource === 'custom' || settings.value.live2dModelSource === 'preset') ? settings.value.live2dModelName : ''
  void refreshModelLibrary()
  void refreshRuntimeDataStorageInfo()
})
</script>

<style lang="scss" scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  max-width: 780px;
}

.settings-empty {
  display: grid;
  place-items: center;
  text-align: center;
  gap: $spacing-sm;
  padding: 48px 24px;
}

.page-title {
  font-size: $font-xl;
  font-weight: 700;
}

.settings-migration-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: $border-radius-md;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(96, 140, 255, 0.12), rgba(85, 198, 165, 0.1));
}

.migration-copy {
  display: grid;
  gap: 6px;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  p,
  small {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.settings-section {
  padding: $spacing-lg;
}

.section-title {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-md;
  font-weight: 600;
  margin-bottom: $spacing-lg;
  color: var(--text-primary);

  svg { color: var(--primary); }
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-md 0;
  border-bottom: 1px solid var(--border);
  gap: $spacing-lg;

  &:last-child { border-bottom: none; }
}

.setting-label {
  .label-main { font-size: $font-base; font-weight: 500; color: var(--text-primary); }
  .label-desc { font-size: $font-xs; color: var(--text-muted); margin-top: 2px; }
}

.setting-input-wrap {
  flex: 1;
  max-width: 360px;
}

.setting-input,
.setting-select,
.setting-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-primary);
  font-size: $font-sm;
  transition: border-color $transition-fast, box-shadow $transition-fast;

  &:focus {
    outline: none;
    border-color: rgba(93, 135, 255, 0.45);
    box-shadow: 0 0 0 3px rgba(93, 135, 255, 0.12);
  }
}

.setting-input,
.setting-select {
  min-height: 40px;
  padding: 0 12px;
}

.setting-textarea {
  min-height: 110px;
  padding: 12px;
  resize: vertical;
}

.setting-input-sm {
  max-width: 140px;
}

.input-wrap,
.ai-input-stack,
.ai-model-stack,
.ai-token-stack {
  width: min(100%, 420px);
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.toggle-visibility-btn {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  &:hover {
    background: rgba(93, 135, 255, 0.08);
    color: var(--text-primary);
  }
}

.input-wrap .setting-input {
  padding-right: 42px;
}

.ai-input-stack,
.ai-model-stack,
.ai-token-stack {
  display: grid;
  gap: 8px;
}

.ai-model-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.ai-capability-panel {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.52);
}

.ai-capability-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    color: var(--text-muted);
    font-size: 11px;
  }
}

.ai-capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-capability-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.1);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;

  &.is-muted {
    background: rgba(180, 180, 180, 0.14);
    color: var(--text-secondary);
  }

  &.is-limit {
    background: rgba(255, 174, 113, 0.16);
    color: #9a3412;
  }
}

.ai-sync-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: $border-radius-md;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.48);
}

.ai-sync-copy {
  display: grid;
  gap: 6px;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  p {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.7;
  }
}

.ai-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.ai-inline-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(180, 180, 180, 0.14);
  color: var(--text-secondary);

  &.is-enabled {
    background: rgba(84, 201, 159, 0.14);
    color: #187d59;
  }

  &.is-disabled {
    background: rgba(220, 80, 80, 0.12);
    color: #b42318;
  }
}

.ai-provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.ai-provider-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: $border-radius-md;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.46);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  small {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.6;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(93, 135, 255, 0.28);
    box-shadow: $shadow-card;
  }

  &.active {
    border-color: rgba(93, 135, 255, 0.42);
    background: linear-gradient(135deg, rgba(93, 135, 255, 0.12), rgba(70, 196, 165, 0.1));
  }
}

.provider-card-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(93, 135, 255, 0.12);
  color: #2d4f99;
  font-size: 11px;
  font-weight: 700;
}

.ai-runtime-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 16px;
  border-radius: $border-radius-md;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, rgba(96, 140, 255, 0.14), rgba(85, 198, 165, 0.1));
}

.ai-runtime-copy {
  display: grid;
  gap: 6px;

  strong {
    color: var(--text-primary);
    font-size: $font-base;
  }

  p,
  small {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.ai-context-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.ai-context-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: $border-radius-md;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.42);

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    color: var(--primary);
    font-size: $font-sm;
    font-weight: 700;
  }

  small {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.7;
  }
}

.field-tip-error {
  color: #b42318;
}

.current-model-box {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: $spacing-sm;
  flex-wrap: wrap;
  text-align: right;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  &.is-empty strong {
    color: var(--text-muted);
    font-weight: 500;
  }
}

.live2d-banner {
  display: grid;
  gap: 8px;
  margin-top: $spacing-md;
  padding: 14px 16px;
  border-radius: $border-radius-md;
  background: linear-gradient(135deg, rgba(88, 164, 255, 0.12), rgba(255, 174, 113, 0.12));
  border: 1px solid var(--border);

  p {
    font-size: $font-sm;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.desktop-runtime-card {
  display: grid;
  gap: 8px;
  margin-top: $spacing-md;
  padding: 14px 16px;
  border-radius: $border-radius-md;
  background: linear-gradient(135deg, rgba(107, 129, 255, 0.12), rgba(84, 201, 159, 0.12));
  border: 1px solid var(--border);

  p {
    font-size: $font-sm;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.data-storage-card {
  display: grid;
  gap: 12px;
  margin-top: $spacing-md;
  padding: 16px;
  border-radius: $border-radius-md;
  background: linear-gradient(135deg, rgba(84, 201, 159, 0.1), rgba(93, 135, 255, 0.1));
  border: 1px solid var(--border);
}

.live2d-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $spacing-md;
  margin-top: $spacing-md;
}

.live2d-card {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  padding: 16px;
  border-radius: $border-radius-md;
  background: var(--bg-input);
  border: 1px solid var(--border);
}

.live2d-card-wide {
  grid-column: 1 / -1;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.model-list {
  display: grid;
  gap: 10px;
}

.default-model-panel {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid var(--border);

  strong {
    color: var(--text-primary);
    font-size: $font-base;
  }

  span {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.7;
    word-break: break-all;
  }
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid var(--border);
}

.model-main {
  min-width: 0;
  flex: 1;
}

.model-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }
}

.model-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.model-path {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.55;
  word-break: break-all;
}

.model-source-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;

  &.is-preset {
    color: #155e75;
    background: rgba(103, 232, 249, 0.16);
    border-color: rgba(8, 145, 178, 0.2);
  }

  &.is-bundled {
    color: #9a3412;
    background: rgba(253, 186, 116, 0.18);
    border-color: rgba(234, 88, 12, 0.2);
  }

  &.is-imported {
    color: #166534;
    background: rgba(134, 239, 172, 0.18);
    border-color: rgba(22, 163, 74, 0.2);
  }

  &.is-custom {
    color: #5b21b6;
    background: rgba(196, 181, 253, 0.18);
    border-color: rgba(124, 58, 237, 0.2);
  }
}

.inline-actions {
  display: flex;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.path-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.path-card {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid var(--border);

  &.is-alert {
    border-color: rgba(234, 88, 12, 0.26);
    background: rgba(255, 237, 213, 0.34);
  }

  strong {
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.6;
    word-break: break-all;
  }

  small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
}

.path-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.remote-editor {
  display: grid;
  gap: 10px;
}

.preset-grid {
  display: grid;
  gap: 10px;
}

.preset-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid var(--border);
}

.preset-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.6;
  }

  small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
    word-break: break-all;
  }
}

.field-tip,
.model-tip,
.desktop-tip {
  color: var(--text-muted);
  font-size: $font-xs;
  line-height: 1.7;
}

.reference-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.reference-link {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 14px;
  border-radius: $border-radius-sm;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.38);
  text-align: left;
  cursor: pointer;
  transition: transform $transition-fast, border-color $transition-fast, box-shadow $transition-fast;

  strong {
    color: var(--text-primary);
    font-size: $font-sm;
  }

  span {
    color: var(--text-secondary);
    font-size: $font-xs;
    line-height: 1.6;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(93, 135, 255, 0.35);
    box-shadow: $shadow-card;
  }
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;

  p {
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.about-brand {
  display: flex;
  align-items: center;
  gap: $spacing-md;
}

.about-icon {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.about-meta {
  display: grid;
  gap: 10px;
}

.about-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: $spacing-md;
  padding: 10px 12px;
  border-radius: $border-radius-sm;
  background: var(--bg-input);
  border: 1px solid var(--border);
}

.meta-key {
  color: var(--text-muted);
  font-size: $font-sm;
}

.meta-value {
  color: var(--text-primary);
  font-size: $font-sm;
  word-break: break-all;
}

.shortcut-list {
  display: grid;
  gap: 10px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: 148px 1fr;
  gap: $spacing-md;
  align-items: center;
  padding: 12px 14px;
  border-radius: $border-radius-sm;
  background: var(--bg-input);
  border: 1px solid var(--border);
}

.shortcut-keys {
  display: inline-flex;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--primary-bg);
  color: var(--primary);
  font-size: $font-xs;
  font-weight: 700;
}

.shortcut-action {
  color: var(--text-secondary);
  font-size: $font-sm;
}

.about-actions {
  display: flex;
  justify-content: flex-end;
}

/* 主题选择 */
.theme-grid {
  display: flex;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 2px solid transparent;
  border-radius: $border-radius-md;
  background: transparent;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover { border-color: var(--border); }
  &.active {
    border-color: var(--primary);
    .theme-name { color: var(--primary); font-weight: 600; }
  }

  .theme-preview {
    width: 48px;
    height: 32px;
    border-radius: 8px;
    box-shadow: $shadow-card;
  }

  .theme-name {
    font-size: $font-xs;
    color: var(--text-secondary);
  }
}

/* 开关 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;

  input { opacity: 0; width: 0; height: 0; }

  .slider {
    position: absolute;
    inset: 0;
    background: var(--border);
    border-radius: 24px;
    cursor: pointer;
    transition: all $transition-fast;

    &::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 3px;
      top: 3px;
      background: white;
      border-radius: 50%;
      transition: transform $transition-fast;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
  }

  input:checked + .slider {
    background: var(--primary);

    &::before {
      transform: translateX(20px);
    }
  }
}

/* 范围滑块 */
.range-wrap {
  display: flex;
  align-items: center;
  gap: $spacing-sm;

  input[type="range"] {
    width: 120px;
    accent-color: var(--primary);
  }

  .range-val {
    font-size: $font-sm;
    color: var(--text-secondary);
    min-width: 36px;
  }
}

.about-info {
  p {
    font-size: $font-sm;
    color: var(--text-secondary);
    margin-bottom: $spacing-xs;

    strong { color: var(--text-primary); }
  }
}

@media (max-width: 960px) {
  .live2d-layout,
  .path-grid,
  .reference-list,
  .ai-context-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .settings-migration-card,
  .setting-row,
  .model-row,
  .shortcut-row,
  .about-row {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: flex-start;
  }

  .setting-row {
    align-items: stretch;
  }

  .current-model-box {
    justify-content: flex-start;
    text-align: left;
  }

  .ai-provider-grid,
  .ai-model-actions {
    grid-template-columns: 1fr;
  }

  .ai-runtime-banner {
    flex-direction: column;
  }

  .ai-sync-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .ai-toggle-group {
    width: 100%;
    justify-content: space-between;
  }

  .inline-actions {
    width: 100%;

    .btn {
      width: 100%;
    }
  }

  .model-actions {
    width: 100%;

    .btn {
      flex: 1;
    }
  }
}
</style>
