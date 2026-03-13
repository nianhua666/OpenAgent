import { contextBridge, ipcRenderer } from 'electron'
import type { AIManagedMCPPackageInstallResult, AIManagedMCPServerInspection, IDETerminalEvent, IDETerminalInputRequest, IDETerminalResizeRequest, IDETerminalRunRequest, IDETerminalRunResult, IDETerminalSessionCreateRequest, IDETerminalSessionInfo, IDETerminalSessionSnapshot, Live2DCursorPoint, Live2DMouthState, Sub2ApiDesktopAccessResult, Sub2ApiDesktopManagedConfig, Sub2ApiDesktopRuntimeConfig, Sub2ApiDesktopSetupProfile, Sub2ApiSetupDatabaseConfig, Sub2ApiSetupRedisConfig, WindowShapeRect } from '../src/types'

// 安全地向渲染进程暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  startWindowDrag: (pointer: { x: number; y: number }) => ipcRenderer.send('window:startDrag', pointer),
  updateWindowDrag: (pointer: { x: number; y: number }) => ipcRenderer.send('window:updateDrag', pointer),
  endWindowDrag: () => ipcRenderer.send('window:endDrag'),
  setWindowIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('window:setIgnoreMouseEvents', ignore),
  setWindowShapeRects: (rects: WindowShapeRect[]) => ipcRenderer.send('window:setShapeRects', rects),
  showMainWindow: () => ipcRenderer.send('app:showMainWindow'),
  navigateMainWindow: (hashPath?: string) => ipcRenderer.send('app:navigateMainWindow', hashPath),
  hideMainWindow: () => ipcRenderer.send('app:hideMainWindow'),
  toggleMainWindow: () => ipcRenderer.send('app:toggleMainWindow'),
  showAIOverlayWindow: () => ipcRenderer.send('app:showAIOverlayWindow'),
  hideAIOverlayWindow: () => ipcRenderer.send('app:hideAIOverlayWindow'),
  closeAIOverlayWindow: () => ipcRenderer.send('app:closeAIOverlayWindow'),
  toggleAIOverlayWindow: () => ipcRenderer.send('app:toggleAIOverlayWindow'),
  showLive2DWindow: () => ipcRenderer.send('app:showLive2DWindow'),
  hideLive2DWindow: () => ipcRenderer.send('app:hideLive2DWindow'),
  toggleLive2DWindow: () => ipcRenderer.send('app:toggleLive2DWindow'),
  onLive2DCursorPoint: (callback: (point: Live2DCursorPoint) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, point: Live2DCursorPoint) => callback(point)
    ipcRenderer.on('live2d:cursorPoint', listener)

    return () => {
      ipcRenderer.removeListener('live2d:cursorPoint', listener)
    }
  },
  sendLive2DMouthState: (payload: Live2DMouthState) => ipcRenderer.send('live2d:mouthState', payload),
  onLive2DMouthState: (callback: (payload: Live2DMouthState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Live2DMouthState) => callback(payload)
    ipcRenderer.on('live2d:mouthState', listener)

    return () => {
      ipcRenderer.removeListener('live2d:mouthState', listener)
    }
  },
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximized', (_event, val) => callback(val))
  },
  onSettingsChanged: (callback: (settings: unknown) => void) => {
    ipcRenderer.on('settings:changed', (_event, settings) => callback(settings))
  },
  onStoreChanged: (callback: (key: string, data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, key: string, data: unknown) => callback(key, data)
    ipcRenderer.on('store:changed', listener)

    return () => {
      ipcRenderer.removeListener('store:changed', listener)
    }
  },

  // 数据存储
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, data: unknown) => ipcRenderer.invoke('store:set', key, data),

  // 文件对话框
  exportJson: (name: string, data: unknown) => ipcRenderer.invoke('dialog:exportJson', name, data),
  importJson: () => ipcRenderer.invoke('dialog:importJson'),
  chooseDirectory: (title: string, defaultPath?: string) => ipcRenderer.invoke('dialog:chooseDirectory', title, defaultPath),
  listLive2DModels: () => ipcRenderer.invoke('live2d:listModels'),
  cacheLive2DRemoteModel: (payload: unknown) => ipcRenderer.invoke('live2d:cacheRemoteModel', payload),
  deleteLive2DModel: (runtimePath: string) => ipcRenderer.invoke('live2d:deleteModel', runtimePath),
  importLive2DModel: () => ipcRenderer.invoke('live2d:importModel'),
  resolveLive2DPath: (runtimePath: string) => ipcRenderer.invoke('live2d:resolvePath', runtimePath),
  getLive2DPaths: () => ipcRenderer.invoke('live2d:getPaths'),
  listSystemTTSVoices: () => ipcRenderer.invoke('tts:listSystemVoices'),
  synthesizeSystemTTS: (payload: unknown) => ipcRenderer.invoke('tts:synthesizeSystem', payload),
  listAzureTTSVoices: () => ipcRenderer.invoke('tts:listAzureVoices'),
  synthesizeAzureTTS: (payload: unknown) => ipcRenderer.invoke('tts:synthesizeAzure', payload),
  listEdgeTTSVoices: () => ipcRenderer.invoke('tts:listEdgeVoices'),
  synthesizeEdgeTTS: (payload: unknown) => ipcRenderer.invoke('tts:synthesizeEdge', payload),

  // 系统
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
  getRuntimeDataStorageInfo: () => ipcRenderer.invoke('app:getRuntimeDataStorageInfo'),
  switchRuntimeDataStorage: (payload: { mode: 'auto' | 'custom'; targetPath?: string }) => ipcRenderer.invoke('app:switchRuntimeDataStorage', payload),
  readImageAsDataUrl: (filePath: string) => ipcRenderer.invoke('file:readImageAsDataUrl', filePath),
  sub2ApiGetRuntimeState: (config?: unknown, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => ipcRenderer.invoke('sub2api:getRuntimeState', config, managedConfig),
  sub2ApiStartRuntime: (config?: unknown, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => ipcRenderer.invoke('sub2api:startRuntime', config, managedConfig),
  sub2ApiStopRuntime: () => ipcRenderer.invoke('sub2api:stopRuntime'),
  sub2ApiRestartRuntime: (config?: unknown, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => ipcRenderer.invoke('sub2api:restartRuntime', config, managedConfig),
  sub2ApiInspectSetup: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => ipcRenderer.invoke('sub2api:inspectSetup', config, managedConfig),
  sub2ApiTestSetupDatabase: (payload: Sub2ApiSetupDatabaseConfig, config?: Partial<Sub2ApiDesktopRuntimeConfig>) => ipcRenderer.invoke('sub2api:testSetupDatabase', payload, config),
  sub2ApiTestSetupRedis: (payload: Sub2ApiSetupRedisConfig, config?: Partial<Sub2ApiDesktopRuntimeConfig>) => ipcRenderer.invoke('sub2api:testSetupRedis', payload, config),
  sub2ApiInstallSetup: (payload: Sub2ApiDesktopSetupProfile, config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => ipcRenderer.invoke('sub2api:installSetup', payload, config, managedConfig),
  sub2ApiEnsureDesktopAccess: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>, currentApiKey?: string) => ipcRenderer.invoke('sub2api:ensureDesktopAccess', config, managedConfig, currentApiKey) as Promise<Sub2ApiDesktopAccessResult>,
  sub2ApiChooseBinary: (defaultPath?: string) => ipcRenderer.invoke('dialog:chooseFile', {
    title: '选择 Sub2API 本地网关可执行文件',
    defaultPath,
    filters: [
      { name: '可执行文件', extensions: ['exe', 'cmd', 'bat'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }),
  openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath) as Promise<boolean>,

  // IDE 文件系统
  ideReadFile: (filePath: string, encoding?: string) => ipcRenderer.invoke('ide:readFile', filePath, encoding),
  ideWriteFile: (filePath: string, content: string, encoding?: string) => ipcRenderer.invoke('ide:writeFile', filePath, content, encoding),
  ideCreateDirectory: (dirPath: string) => ipcRenderer.invoke('ide:createDirectory', dirPath),
  ideListDirectory: (dirPath: string) => ipcRenderer.invoke('ide:listDirectory', dirPath),
  ideFileExists: (filePath: string) => ipcRenderer.invoke('ide:fileExists', filePath),
  ideFileStat: (filePath: string) => ipcRenderer.invoke('ide:fileStat', filePath),
  ideRenameEntry: (fromPath: string, toPath: string) => ipcRenderer.invoke('ide:renameEntry', fromPath, toPath) as Promise<boolean>,
  ideCopyEntry: (fromPath: string, toPath: string) => ipcRenderer.invoke('ide:copyEntry', fromPath, toPath) as Promise<boolean>,
  ideDeleteEntry: (entryPath: string) => ipcRenderer.invoke('ide:deleteEntry', entryPath) as Promise<boolean>,
  ideCreateTerminalSession: (payload: IDETerminalSessionCreateRequest) => ipcRenderer.invoke('ide:createTerminalSession', payload) as Promise<IDETerminalSessionInfo>,
  ideWriteTerminalInput: (payload: IDETerminalInputRequest) => ipcRenderer.invoke('ide:writeTerminalInput', payload) as Promise<boolean>,
  ideResizeTerminalSession: (payload: IDETerminalResizeRequest) => ipcRenderer.invoke('ide:resizeTerminalSession', payload) as Promise<boolean>,
  ideInterruptTerminalSession: (sessionId: string) => ipcRenderer.invoke('ide:interruptTerminalSession', sessionId) as Promise<boolean>,
  ideCloseTerminalSession: (sessionId: string) => ipcRenderer.invoke('ide:closeTerminalSession', sessionId) as Promise<boolean>,
  ideRunCommand: (payload: IDETerminalRunRequest) => ipcRenderer.invoke('ide:runCommand', payload) as Promise<IDETerminalRunResult>,
  ideCancelCommand: (sessionId: string) => ipcRenderer.invoke('ide:cancelCommand', sessionId) as Promise<boolean>,
  ideGetTerminalSessionSnapshot: (sessionId: string) => ipcRenderer.invoke('ide:getTerminalSessionSnapshot', sessionId) as Promise<IDETerminalSessionSnapshot | null>,
  onIdeTerminalEvent: (callback: (payload: IDETerminalEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: IDETerminalEvent) => callback(payload)
    ipcRenderer.on('ide:terminal:event', listener)

    return () => {
      ipcRenderer.removeListener('ide:terminal:event', listener)
    }
  },

  // MCP 工具
  mcpExecuteCommand: (command: string) => ipcRenderer.invoke('mcp:executeCommand', command),
  mcpCaptureScreen: (payload: { region?: 'full' | 'active' | 'window'; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => ipcRenderer.invoke('mcp:captureScreen', payload),
  mcpMouseClick: (x: number, y: number, button: string, clickType: string) => ipcRenderer.invoke('mcp:mouseClick', x, y, button, clickType),
  mcpKeyboardInput: (payload: { text?: string; keys?: string; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => ipcRenderer.invoke('mcp:keyboardInput', payload),
  mcpListWindows: () => ipcRenderer.invoke('mcp:listWindows'),
  mcpFocusWindow: (payload: { id?: number; windowHandle?: string; title?: string; processName?: string }) => ipcRenderer.invoke('mcp:focusWindow', payload),
  mcpInspectManagedServer: (payload: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }) => ipcRenderer.invoke('mcp:inspectManagedServer', payload) as Promise<AIManagedMCPServerInspection>,
  mcpCallManagedTool: (payload: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string; toolName: string; arguments?: Record<string, unknown> }) => ipcRenderer.invoke('mcp:callManagedTool', payload),
  mcpInstallManagedPackage: (payload: { serverId: string; packageName: string; entryCommand?: string; args?: string[] }) => ipcRenderer.invoke('mcp:installManagedPackage', payload) as Promise<AIManagedMCPPackageInstallResult>
})
