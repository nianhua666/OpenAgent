/// <reference types="vite/client" />

import type { AIManagedMCPPackageInstallResult, AIManagedMCPServerInspection, AppSettings, IDETerminalEvent, IDETerminalInputRequest, IDETerminalResizeRequest, IDETerminalRunRequest, IDETerminalRunResult, IDETerminalSessionCreateRequest, IDETerminalSessionInfo, IDETerminalSessionSnapshot, Live2DCursorPoint, Live2DMouthState, Live2DLibraryItem, Live2DRemoteModelRequest, Live2DStoragePaths, MCPToolResult, RuntimeDataStorageInfo, RuntimeDataStorageMode, Sub2ApiDesktopAccessResult, Sub2ApiDesktopManagedConfig, Sub2ApiDesktopRuntimeConfig, Sub2ApiDesktopSetupProfile, Sub2ApiRuntimeState, Sub2ApiSetupActionResult, Sub2ApiSetupDatabaseConfig, Sub2ApiSetupDiagnostics, Sub2ApiSetupRedisConfig, TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem, UserScreenshotCaptureResult, WindowShapeRect } from './types'

interface ElectronAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  startWindowDrag: (pointer: { x: number; y: number }) => void
  updateWindowDrag: (pointer: { x: number; y: number }) => void
  endWindowDrag: () => void
  setWindowIgnoreMouseEvents: (ignore: boolean) => void
  setWindowShapeRects: (rects: WindowShapeRect[]) => void
  showMainWindow: () => void
  navigateMainWindow: (hashPath?: string) => void
  hideMainWindow: () => void
  toggleMainWindow: () => void
  showAIOverlayWindow: () => void
  hideAIOverlayWindow: () => void
  closeAIOverlayWindow: () => void
  toggleAIOverlayWindow: () => void
  showLive2DWindow: () => void
  hideLive2DWindow: () => void
  toggleLive2DWindow: () => void
  onLive2DCursorPoint: (callback: (point: Live2DCursorPoint) => void) => (() => void)
  sendLive2DMouthState: (payload: Live2DMouthState) => void
  onLive2DMouthState: (callback: (payload: Live2DMouthState) => void) => (() => void)
  isMaximized: () => Promise<boolean>
  onMaximized: (callback: (maximized: boolean) => void) => void
  onSettingsChanged: (callback: (settings: AppSettings) => void) => void
  onStoreChanged: (callback: (key: string, data: unknown) => void) => (() => void)
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, data: unknown) => Promise<boolean>
  exportJson: (name: string, data: unknown) => Promise<boolean>
  importJson: () => Promise<any>
  chooseDirectory: (title: string, defaultPath?: string) => Promise<string | null>
  listLive2DModels: () => Promise<Live2DLibraryItem[]>
  cacheLive2DRemoteModel: (payload: Live2DRemoteModelRequest) => Promise<Live2DLibraryItem | null>
  deleteLive2DModel: (runtimePath: string) => Promise<boolean>
  importLive2DModel: () => Promise<Live2DLibraryItem | null>
  resolveLive2DPath: (runtimePath: string) => Promise<string>
  getLive2DPaths: () => Promise<Live2DStoragePaths>
  listSystemTTSVoices: () => Promise<TTSVoiceLibraryItem[]>
  synthesizeSystemTTS: (payload: TTSSynthesizePayload) => Promise<TTSSynthesisResult>
  listAzureTTSVoices: () => Promise<TTSVoiceLibraryItem[]>
  synthesizeAzureTTS: (payload: TTSSynthesizePayload) => Promise<TTSSynthesisResult>
  listEdgeTTSVoices: () => Promise<TTSVoiceLibraryItem[]>
  synthesizeEdgeTTS: (payload: TTSSynthesizePayload) => Promise<TTSSynthesisResult>
  getDataPath: () => Promise<string>
  getRuntimeDataStorageInfo: () => Promise<RuntimeDataStorageInfo>
  switchRuntimeDataStorage: (payload: { mode: RuntimeDataStorageMode; targetPath?: string }) => Promise<RuntimeDataStorageInfo>
  readImageAsDataUrl: (filePath: string) => Promise<string | null>
  captureUserScreenshot: () => Promise<UserScreenshotCaptureResult>
  sub2ApiGetRuntimeState: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => Promise<Sub2ApiRuntimeState>
  sub2ApiStartRuntime: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => Promise<Sub2ApiRuntimeState>
  sub2ApiStopRuntime: () => Promise<Sub2ApiRuntimeState>
  sub2ApiRestartRuntime: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => Promise<Sub2ApiRuntimeState>
  sub2ApiInspectSetup: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => Promise<Sub2ApiSetupDiagnostics>
  sub2ApiTestSetupDatabase: (payload: Sub2ApiSetupDatabaseConfig, config?: Partial<Sub2ApiDesktopRuntimeConfig>) => Promise<Sub2ApiSetupActionResult>
  sub2ApiTestSetupRedis: (payload: Sub2ApiSetupRedisConfig, config?: Partial<Sub2ApiDesktopRuntimeConfig>) => Promise<Sub2ApiSetupActionResult>
  sub2ApiInstallSetup: (payload: Sub2ApiDesktopSetupProfile, config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>) => Promise<Sub2ApiSetupActionResult>
  sub2ApiEnsureDesktopAccess: (config?: Partial<Sub2ApiDesktopRuntimeConfig>, managedConfig?: Partial<Sub2ApiDesktopManagedConfig>, currentApiKey?: string) => Promise<Sub2ApiDesktopAccessResult>
  sub2ApiChooseBinary: (defaultPath?: string) => Promise<string | null>
  openExternal: (url: string) => void
  openPath: (targetPath: string) => Promise<boolean>
  // IDE 文件系统
  ideReadFile: (filePath: string, encoding?: string) => Promise<string | null>
  ideWriteFile: (filePath: string, content: string, encoding?: string) => Promise<boolean>
  ideCreateDirectory: (dirPath: string) => Promise<boolean>
  ideListDirectory: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean }> | null>
  ideFileExists: (filePath: string) => Promise<boolean>
  ideFileStat: (filePath: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean; modifiedAt: number } | null>
  ideRenameEntry: (fromPath: string, toPath: string) => Promise<boolean>
  ideCopyEntry: (fromPath: string, toPath: string) => Promise<boolean>
  ideDeleteEntry: (entryPath: string) => Promise<boolean>
  ideCreateTerminalSession: (payload: IDETerminalSessionCreateRequest) => Promise<IDETerminalSessionInfo>
  ideWriteTerminalInput: (payload: IDETerminalInputRequest) => Promise<boolean>
  ideResizeTerminalSession: (payload: IDETerminalResizeRequest) => Promise<boolean>
  ideInterruptTerminalSession: (sessionId: string) => Promise<boolean>
  ideCloseTerminalSession: (sessionId: string) => Promise<boolean>
  ideRunCommand: (payload: IDETerminalRunRequest) => Promise<IDETerminalRunResult>
  ideCancelCommand: (sessionId: string) => Promise<boolean>
  ideGetTerminalSessionSnapshot: (sessionId: string) => Promise<IDETerminalSessionSnapshot | null>
  onIdeTerminalEvent: (callback: (payload: IDETerminalEvent) => void) => (() => void)
  // MCP 工具
  mcpExecuteCommand: (command: string) => Promise<MCPToolResult>
  mcpCaptureScreen: (payload: { region?: 'full' | 'active' | 'window'; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => Promise<MCPToolResult>
  mcpMouseClick: (x: number, y: number, button: string, clickType: string) => Promise<MCPToolResult>
  mcpKeyboardInput: (payload: { text?: string; keys?: string; windowId?: number; windowHandle?: string; windowTitle?: string; processName?: string }) => Promise<MCPToolResult>
  mcpListWindows: () => Promise<MCPToolResult>
  mcpFocusWindow: (payload: { id?: number; windowHandle?: string; title?: string; processName?: string }) => Promise<MCPToolResult>
  mcpInspectManagedServer: (payload: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }) => Promise<AIManagedMCPServerInspection>
  mcpCallManagedTool: (payload: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string; toolName: string; arguments?: Record<string, unknown> }) => Promise<MCPToolResult>
  mcpInstallManagedPackage: (payload: { serverId: string; packageName: string; entryCommand?: string; args?: string[] }) => Promise<AIManagedMCPPackageInstallResult>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
