import { execFile } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { AIManagedMCPPackageInstallResult, AIManagedMCPServerInspection, MCPToolResult } from '../src/types'

type ManagedMcpLaunchPayload = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

type ManagedMcpToolCallPayload = ManagedMcpLaunchPayload & {
  toolName: string
  arguments?: Record<string, unknown>
}

type ManagedMcpInstallPayload = {
  serverId: string
  packageName: string
  entryCommand?: string
  args?: string[]
}

const MANAGED_MCP_INSTALL_ROOT = join(app.getPath('userData'), 'managed-mcp')
const INSTALL_TIMEOUT = 180000
const MCP_REQUEST_TIMEOUT = 45000

function ensureManagedMcpInstallRoot() {
  if (!existsSync(MANAGED_MCP_INSTALL_ROOT)) {
    mkdirSync(MANAGED_MCP_INSTALL_ROOT, { recursive: true })
  }
}

function resolveManagedInstallDirectory(serverId: string) {
  ensureManagedMcpInstallRoot()
  return join(MANAGED_MCP_INSTALL_ROOT, serverId)
}

function normalizeLaunchArgs(args: unknown) {
  return Array.isArray(args) ? args.map(item => String(item)).filter(Boolean) : []
}

function normalizeLaunchEnv(env: unknown) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return undefined
  }

  const nextEnv = Object.fromEntries(
    Object.entries(env as Record<string, unknown>)
      .map(([key, value]) => [key.trim(), typeof value === 'string' ? value : String(value ?? '')])
      .filter(([key, value]) => key && value)
  )

  return Object.keys(nextEnv).length > 0 ? nextEnv : undefined
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function inferEntryCommand(packageName: string) {
  return packageName.split('/').filter(Boolean).pop() || packageName
}

async function withManagedMcpClient<T>(payload: ManagedMcpLaunchPayload, runner: (client: Client, stderrOutput: () => string) => Promise<T>) {
  if (!payload.command?.trim()) {
    throw new Error('MCP 服务器启动命令为空')
  }

  const transport = new StdioClientTransport({
    command: payload.command.trim(),
    args: normalizeLaunchArgs(payload.args),
    env: normalizeLaunchEnv(payload.env),
    cwd: payload.cwd?.trim() || undefined,
    stderr: 'pipe'
  })

  let stderrBuffer = ''
  const stderrStream = transport.stderr
  stderrStream?.on('data', (chunk) => {
    stderrBuffer += chunk.toString()
  })

  const client = new Client({
    name: 'OpenAgent',
    version: app.getVersion()
  })

  try {
    await client.connect(transport, { timeout: MCP_REQUEST_TIMEOUT })
    return await runner(client, () => stderrBuffer.trim())
  } finally {
    await client.close().catch(() => undefined)
  }
}

function formatToolContent(content: unknown) {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map(item => {
      if (!item || typeof item !== 'object') {
        return String(item ?? '')
      }

      const record = item as Record<string, unknown>
      if (record.type === 'text' && typeof record.text === 'string') {
        return record.text
      }

      return JSON.stringify(record)
    })
    .filter(Boolean)
    .join('\n')
}

export async function inspectManagedMcpServer(payload: ManagedMcpLaunchPayload): Promise<AIManagedMCPServerInspection> {
  try {
    return await withManagedMcpClient(payload, async (client, getStderr) => {
      const tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> = []
      let cursor: string | undefined

      do {
        const result = await client.listTools(cursor ? { cursor } : undefined, { timeout: MCP_REQUEST_TIMEOUT })
        tools.push(...(result.tools ?? []).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown> | undefined
        })))
        cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
      } while (cursor)

      const stderr = getStderr()
      return {
        success: true,
        tools,
        serverInfo: client.getServerVersion(),
        output: stderr ? `服务器已连接。\n${stderr}` : '服务器已连接。'
      }
    })
  } catch (error) {
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : 'MCP 服务器探测失败'
    }
  }
}

export async function callManagedMcpTool(payload: ManagedMcpToolCallPayload): Promise<MCPToolResult> {
  try {
    return await withManagedMcpClient(payload, async (client, getStderr) => {
      const result = await client.callTool({
        name: payload.toolName,
        arguments: payload.arguments || {}
      }, undefined, {
        timeout: MCP_REQUEST_TIMEOUT
      })

      const textOutput = formatToolContent(result.content)
      const output = textOutput || JSON.stringify(result.structuredContent ?? result, null, 2)
      const errorMessage = result.isError ? textOutput || '托管 MCP 工具执行失败' : undefined

      return {
        success: !result.isError,
        output,
        error: errorMessage,
        data: {
          structuredContent: result.structuredContent,
          content: result.content,
          stderr: getStderr() || undefined
        }
      }
    })
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : '托管 MCP 工具执行失败'
    }
  }
}

export function installManagedMcpPackage(payload: ManagedMcpInstallPayload): Promise<AIManagedMCPPackageInstallResult> {
  return new Promise(resolve => {
    if (!payload.serverId?.trim() || !payload.packageName?.trim()) {
      resolve({
        success: false,
        command: '',
        args: [],
        installDirectory: '',
        output: '',
        error: '缺少 serverId 或 packageName'
      })
      return
    }

    const installDirectory = resolveManagedInstallDirectory(payload.serverId.trim())
    mkdirSync(installDirectory, { recursive: true })

    execFile(
      getNpmCommand(),
      ['install', '--prefix', installDirectory, payload.packageName.trim()],
      {
        timeout: INSTALL_TIMEOUT,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        const entryCommand = (payload.entryCommand?.trim() || inferEntryCommand(payload.packageName.trim()))
        const launchArgs = ['exec', '--prefix', installDirectory, '--', entryCommand, ...normalizeLaunchArgs(payload.args)]
        if (error) {
          resolve({
            success: false,
            command: getNpmCommand(),
            args: launchArgs,
            installDirectory,
            output: stdout || '',
            error: stderr || error.message
          })
          return
        }

        resolve({
          success: true,
          command: getNpmCommand(),
          args: launchArgs,
          installDirectory,
          output: [stdout, stderr].filter(Boolean).join('\n').trim()
        })
      }
    )
  })
}
