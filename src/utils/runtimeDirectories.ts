export function joinRuntimePath(...segments: string[]) {
  return segments
    .filter(Boolean)
    .map((segment, index) => {
      const normalized = segment.replace(/\\/g, '/').trim()
      if (index === 0) {
        return normalized.replace(/\/+$/, '')
      }
      return normalized.replace(/^\/+/, '').replace(/\/+$/, '')
    })
    .filter(Boolean)
    .join('/')
}

export function sanitizeDirectorySegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

async function ensureDirectory(path: string) {
  if (!path || !window.electronAPI?.ideCreateDirectory) {
    return false
  }

  return window.electronAPI.ideCreateDirectory(path)
}

async function getAppDataPath() {
  if (!window.electronAPI?.getDataPath) {
    return ''
  }

  return (await window.electronAPI.getDataPath()) || ''
}

async function getDefaultArtifactsBaseRoot() {
  const hasDriveD = await window.electronAPI?.ideFileExists?.('D:/')
  if (hasDriveD) {
    return 'D:/OpenAgent'
  }

  const appDataPath = await getAppDataPath()
  return appDataPath ? joinRuntimePath(appDataPath, 'artifacts') : 'D:/OpenAgent'
}

export async function resolveAgentStorageLayout(agentId: string, agentName?: string, preferredRoot?: string | null) {
  const agentSegment = sanitizeDirectorySegment(agentName || agentId || 'agent', agentId || 'agent')
  const appDataPath = await getAppDataPath()
  const dataDirectory = joinRuntimePath(appDataPath, 'agents', agentSegment)
  const artifactsRoot = preferredRoot?.trim() || joinRuntimePath(await getDefaultArtifactsBaseRoot(), 'agents')
  const artifactsDirectory = joinRuntimePath(artifactsRoot, agentSegment)

  await Promise.all([
    ensureDirectory(dataDirectory),
    ensureDirectory(artifactsRoot),
    ensureDirectory(artifactsDirectory),
  ])

  return {
    dataDirectory,
    artifactsDirectory,
  }
}

export async function resolveWorkspaceStorageLayout(workspaceId: string, workspaceName: string, artifactRootPath: string) {
  const workspaceSegment = sanitizeDirectorySegment(workspaceName || workspaceId || 'workspace', workspaceId || 'workspace')
  const appDataPath = await getAppDataPath()
  const dataDirectory = joinRuntimePath(appDataPath, 'ide-workspaces', workspaceSegment)
  const normalizedArtifactRoot = artifactRootPath.trim()

  await Promise.all([
    ensureDirectory(dataDirectory),
    ensureDirectory(normalizedArtifactRoot),
  ])

  return {
    dataDirectory,
    artifactRootPath: normalizedArtifactRoot,
  }
}

export async function getSuggestedWorkspaceArtifactRoot(workspaceName: string) {
  const baseRoot = joinRuntimePath(await getDefaultArtifactsBaseRoot(), 'workspaces')
  const workspaceSegment = sanitizeDirectorySegment(workspaceName || 'workspace', 'workspace')
  const suggested = joinRuntimePath(baseRoot, workspaceSegment)
  await Promise.all([ensureDirectory(baseRoot), ensureDirectory(suggested)])
  return suggested
}
