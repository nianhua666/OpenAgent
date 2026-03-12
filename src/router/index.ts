import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/live2d-overlay',
    name: 'Live2DOverlay',
    component: () => import('@/views/Live2DOverlay.vue'),
    meta: { title: 'Live2D 悬浮窗', overlay: true }
  },
  {
    path: '/',
    redirect: '/accounts'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    redirect: '/accounts'
  },
  {
    path: '/accounts',
    name: 'AccountManagement',
    component: () => import('@/views/AccountManagement.vue'),
    meta: { title: '账号管理' }
  },
  {
    path: '/types',
    name: 'AccountTypes',
    component: () => import('@/views/AccountTypes.vue'),
    meta: { title: '账号类型管理' }
  },
  {
    path: '/accounts/list/:typeId',
    name: 'AccountList',
    component: () => import('@/views/AccountList.vue'),
    meta: { title: '账号列表' }
  },
  {
    path: '/import/:typeId?',
    name: 'Import',
    component: () => import('@/views/ImportAccounts.vue'),
    meta: { title: '导入账号' }
  },
  {
    path: '/export/:typeId?',
    name: 'Export',
    component: () => import('@/views/ExportAccounts.vue'),
    meta: { title: '导出账号' }
  },
  {
    path: '/records',
    name: 'Records',
    component: () => import('@/views/Records.vue'),
    meta: { title: '操作记录' }
  },
  {
    path: '/day-detail/:typeId/:date',
    name: 'DayDetail',
    redirect: '/records'
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/ai-settings',
    name: 'AISettings',
    component: () => import('@/views/AISettings.vue'),
    meta: { title: 'AI 设置' }
  },
  {
    path: '/sub2api',
    name: 'Sub2ApiSettings',
    component: () => import('@/views/Sub2ApiSettings.vue'),
    meta: { title: 'Sub2API' }
  },
  {
    path: '/sub2api-console',
    name: 'Sub2ApiConsole',
    component: () => import('@/views/Sub2ApiConsole.vue'),
    meta: { title: 'Sub2API 后台' }
  },
  {
    path: '/ai',
    name: 'AIAssistant',
    component: () => import('@/views/AIAssistant.vue'),
    meta: { title: 'AI 助手' }
  },
  {
    path: '/data',
    name: 'DataManage',
    component: () => import('@/views/DataManage.vue'),
    meta: { title: '数据管理' }
  }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
