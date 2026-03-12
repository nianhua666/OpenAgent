/**
 * IDE 工作区管理器
 * 通过 Electron IPC 实现文件系统访问、项目结构分析与代码读写
 */

import type { IDEWorkspace, ProjectStructure, ProjectFile } from '@/types'
import { useAIStore } from '@/stores/ai'

// 语言推断映射
const EXT_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.vue': 'Vue', '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
  '.c': 'C', '.cpp': 'C++', '.h': 'C', '.hpp': 'C++', '.cs': 'C#',
  '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.kt': 'Kotlin',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'Less',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.xml': 'XML', '.md': 'Markdown', '.sql': 'SQL', '.sh': 'Shell',
  '.ps1': 'PowerShell', '.bat': 'Batch', '.dockerfile': 'Docker',
}

// 默认忽略的目录
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'venv', '.venv', 'target', 'bin', 'obj',
  '.idea', '.vscode', '.DS_Store', 'coverage', '.cache', '.turbo',
])

// 忽略的文件后缀
const IGNORE_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj', '.class',
  '.jar', '.war', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mkv', '.mov',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.lockb',
])

interface ScanOptions {
  maxDepth?: number
  maxFiles?: number
  includeHidden?: boolean
}

function getApi() {
  return window.electronAPI
}

function createWorkspaceId(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, '/').toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return `ws_${Math.abs(hash).toString(36)}`
}

function inferLanguage(filePath: string): string | undefined {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) return undefined
  const ext = filePath.slice(dotIndex).toLowerCase()
  return EXT_LANGUAGE_MAP[ext]
}

function shouldIgnoreEntry(name: string, isDir: boolean): boolean {
  if (name.startsWith('.') && name !== '.env') return true
  if (isDir) return IGNORE_DIRS.has(name)
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx !== -1) return IGNORE_EXTENSIONS.has(name.slice(dotIdx).toLowerCase())
  return false
}

/** 打开工作区：选择目录并初始化 IDEWorkspace */
export async function openWorkspace(rootPath: string): Promise<IDEWorkspace | null> {
  const api = getApi()
  if (!api) return null

  const exists = await api.ideFileExists(rootPath)
  if (!exists) return null

  const name = rootPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'workspace'

  const workspace: IDEWorkspace = {
    id: createWorkspaceId(rootPath),
    rootPath,
    name,
    createdAt: Date.now(),
  }

  // 扫描项目结构并推断语言/框架
  const structure = await scanProjectStructure(rootPath, { maxDepth: 4, maxFiles: 2000 })
  if (structure) {
    workspace.structure = structure
    workspace.language = inferPrimaryLanguage(structure)
    workspace.framework = await inferFramework(rootPath)
  }

  // 同步到 store
  const aiStore = useAIStore()
  aiStore.setIDEWorkspace(workspace)

  return workspace
}

/** 递归扫描项目结构 */
export async function scanProjectStructure(
  rootPath: string,
  options?: ScanOptions,
): Promise<ProjectStructure | null> {
  const api = getApi()
  if (!api) return null

  const maxDepth = options?.maxDepth ?? 5
  const maxFiles = options?.maxFiles ?? 3000
  const files: ProjectFile[] = []
  const languages: Record<string, number> = {}

  async function walk(currentPath: string, relativePath: string, depth: number) {
    if (depth > maxDepth || files.length >= maxFiles) return

    const entries = await api.ideListDirectory(currentPath)
    if (!entries) return

    for (const entry of entries) {
      if (files.length >= maxFiles) break
      if (shouldIgnoreEntry(entry.name, entry.isDirectory)) continue

      const fullPath = currentPath + '/' + entry.name
      const relPath = relativePath ? relativePath + '/' + entry.name : entry.name

      if (entry.isDirectory) {
        files.push({ path: relPath, type: 'directory' })
        await walk(fullPath, relPath, depth + 1)
      } else {
        const lang = inferLanguage(entry.name)
        const stat = await api.ideFileStat(fullPath)
        files.push({
          path: relPath,
          type: 'file',
          language: lang,
          size: stat?.size,
        })
        if (lang) languages[lang] = (languages[lang] || 0) + 1
      }
    }
  }

  await walk(rootPath, '', 0)

  return {
    files,
    totalFiles: files.filter(f => f.type === 'file').length,
    totalLines: 0, // 按需统计行数，全量统计代价太大
    languages,
    updatedAt: Date.now(),
  }
}

/** 读取工作区文件 */
export async function readWorkspaceFile(
  workspace: IDEWorkspace,
  relativePath: string,
): Promise<string | null> {
  const api = getApi()
  if (!api) return null
  const fullPath = joinPath(workspace.rootPath, relativePath)
  return await api.ideReadFile(fullPath)
}

/** 写入工作区文件（自动创建目录） */
export async function writeWorkspaceFile(
  workspace: IDEWorkspace,
  relativePath: string,
  content: string,
): Promise<boolean> {
  const api = getApi()
  if (!api) return false
  const fullPath = joinPath(workspace.rootPath, relativePath)
  return await api.ideWriteFile(fullPath, content)
}

/** 检查工作区文件是否存在 */
export async function workspaceFileExists(
  workspace: IDEWorkspace,
  relativePath: string,
): Promise<boolean> {
  const api = getApi()
  if (!api) return false
  const fullPath = joinPath(workspace.rootPath, relativePath)
  return await api.ideFileExists(fullPath)
}

/** 按 glob 模式搜索工作区文件（基于已扫描的结构） */
export function searchFiles(
  workspace: IDEWorkspace,
  pattern: string,
): ProjectFile[] {
  if (!workspace.structure) return []

  const lowerPattern = pattern.toLowerCase()
  const isGlob = /[*?[\]{}]/.test(pattern)

  if (isGlob) {
    const regex = globToRegex(lowerPattern)
    return workspace.structure.files.filter(f => regex.test(f.path.toLowerCase()))
  }

  // 简单子串匹配
  return workspace.structure.files.filter(f => f.path.toLowerCase().includes(lowerPattern))
}

/** 创建工作区目录 */
export async function createWorkspaceDirectory(
  workspace: IDEWorkspace,
  relativePath: string,
): Promise<boolean> {
  const api = getApi()
  if (!api) return false
  const fullPath = joinPath(workspace.rootPath, relativePath)
  return await api.ideCreateDirectory(fullPath)
}

/** 刷新工作区结构缓存 */
export async function refreshWorkspaceStructure(workspace: IDEWorkspace): Promise<void> {
  const structure = await scanProjectStructure(workspace.rootPath, { maxDepth: 4, maxFiles: 2000 })
  if (structure) {
    workspace.structure = structure
    const aiStore = useAIStore()
    aiStore.updateIDEWorkspaceStructure(structure)
  }
}

// ========== 内部工具函数 ==========

function joinPath(base: string, relative: string): string {
  // 规范化路径分隔符
  const normalized = relative.replace(/\\/g, '/')
  const baseNorm = base.replace(/\\/g, '/').replace(/\/$/, '')
  return baseNorm + '/' + normalized.replace(/^\//, '')
}

function inferPrimaryLanguage(structure: ProjectStructure): string | undefined {
  let maxCount = 0
  let primary: string | undefined
  for (const [lang, count] of Object.entries(structure.languages)) {
    if (count > maxCount) {
      maxCount = count
      primary = lang
    }
  }
  return primary
}

async function inferFramework(rootPath: string): Promise<string | undefined> {
  const api = getApi()
  if (!api) return undefined

  // 读取 package.json 推断前端框架
  const pkgContent = await api.ideReadFile(rootPath + '/package.json')
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['next']) return 'Next.js'
      if (allDeps['nuxt'] || allDeps['nuxt3']) return 'Nuxt'
      if (allDeps['vue']) return 'Vue'
      if (allDeps['react']) return 'React'
      if (allDeps['@angular/core']) return 'Angular'
      if (allDeps['svelte']) return 'Svelte'
      if (allDeps['electron']) return 'Electron'
      if (allDeps['express']) return 'Express'
      if (allDeps['fastify']) return 'Fastify'
    } catch { /* 忽略解析错误 */ }
  }

  // Python 框架
  const reqTxt = await api.ideReadFile(rootPath + '/requirements.txt')
  if (reqTxt) {
    const lower = reqTxt.toLowerCase()
    if (lower.includes('django')) return 'Django'
    if (lower.includes('fastapi')) return 'FastAPI'
    if (lower.includes('flask')) return 'Flask'
  }

  // Go 框架
  const goMod = await api.ideReadFile(rootPath + '/go.mod')
  if (goMod) {
    if (goMod.includes('gin-gonic')) return 'Gin'
    if (goMod.includes('fiber')) return 'Fiber'
    return 'Go'
  }

  // Rust 框架
  const cargoToml = await api.ideReadFile(rootPath + '/Cargo.toml')
  if (cargoToml) {
    if (cargoToml.includes('actix')) return 'Actix'
    if (cargoToml.includes('axum')) return 'Axum'
    return 'Rust'
  }

  return undefined
}

/** 简单 glob → 正则转换 */
function globToRegex(glob: string): RegExp {
  let regex = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        regex += '.*'
        i++ // 跳过第二个 *
        if (glob[i + 1] === '/') i++ // 跳过 /
      } else {
        regex += '[^/]*'
      }
    } else if (ch === '?') {
      regex += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      regex += '\\' + ch
    } else {
      regex += ch
    }
  }
  return new RegExp('^' + regex + '$')
}
