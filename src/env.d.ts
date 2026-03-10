/// <reference types="vite/client" />

import type { AIManagedMCPPackageInstallResult, AIManagedMCPServerInspection, AppSettings, Live2DCursorPoint, Live2DLibraryItem, Live2DRemoteModelRequest, Live2DStoragePaths, MCPToolResult, RuntimeDataStorageInfo, RuntimeDataStorageMode, TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem, WindowShapeRect } from './types'

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
  showLive2DWindow: () => void
  hideLive2DWindow: () => void
  toggleLive2DWindow: () => void
  onLive2DCursorPoint: (callback: (point: Live2DCursorPoint) => void) => (() => void)
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
  openExternal: (url: string) => void
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
