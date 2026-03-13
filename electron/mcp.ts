/**
 * Windows MCP 工具执行器
 * 提供 PowerShell 命令执行、屏幕截图、鼠标键盘模拟、窗口管理等能力
 */
import { execFile } from 'child_process'
import { screen, desktopCapturer } from 'electron'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const POWERSHELL_TIMEOUT = 30000
const POWERSHELL_MAX_BUFFER = 1024 * 1024
const RAW_COMMAND_MAX_LENGTH = 1000

type MCPExecutionResult = {
  success: boolean
  output: string
  error?: string
  data?: unknown
}

type WindowQuery = {
  id?: number
  handle?: string
  title?: string
  processName?: string
}

type KeyboardPayload = {
  text?: string
  keys?: string
  windowId?: number
  windowHandle?: string
  windowTitle?: string
  processName?: string
}

type ScreenCapturePayload = {
  region?: 'full' | 'active' | 'window'
  windowId?: number
  windowHandle?: string
  windowTitle?: string
  processName?: string
}

type WindowMatchInfo = {
  id?: number
  processName?: string
  title?: string
  handle?: string
  windowHandle?: string
}

type WindowRectInfo = {
  x: number
  y: number
  width: number
  height: number
  window?: WindowMatchInfo | null
}

// 命令黑名单，防止危险操作
const COMMAND_BLACKLIST = [
  /\b(?:powershell(?:\.exe)?|pwsh(?:\.exe)?|cmd(?:\.exe)?)\b/i,
  /\b(?:invoke-expression|iex)\b/i,
  /-encodedcommand\b/i,
  /\b(?:remove-item|del|erase|rd|rmdir)\b/i,
  /rm\s+-rf\s+(?:[\/\\]|[a-z]:)/i,
  /format\s+[a-z]:/i,
  /\b(?:diskpart|clear-disk|cipher\s+\/w|bcdedit|bootcfg)\b/i,
  /\b(?:shutdown|stop-computer|restart-computer|reboot)\b/i,
  /\b(?:reg(?:\.exe)?\s+(?:add|delete|import|restore)|schtasks(?:\.exe)?\s+\/(?:create|delete|change|run)|sc(?:\.exe)?\s+(?:config|create|delete|start|stop))\b/i,
  /\b(?:takeown|icacls|wevtutil|vssadmin|mountvol)\b/i,
  /\b(?:taskkill)\b[\s\S]*\b(?:explorer|winlogon|csrss|lsass|services|svchost)(?:\.exe)?\b/i,
  /\b(?:copy-item|move-item|rename-item|set-content|add-content|clear-content|copy|move|ren)\b[\s\S]*(?:[a-z]:\\(?:windows|program files|programdata|users\\default)|%windir%|%systemroot%)/i
]

function ensureTempDir() {
  const tempDir = join(app.getPath('userData'), 'temp')
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
}

function getTempFilePath(fileName: string) {
  return join(app.getPath('userData'), 'temp', fileName)
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max)
}

async function captureDisplayRegionToFile(filePath: string, rect: { x: number; y: number; width: number; height: number }) {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) {
    throw new Error('未找到可截取的屏幕')
  }

  const centerPoint = {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2)
  }
  const targetDisplay = screen.getDisplayNearestPoint(centerPoint)
  const maxSourceWidth = Math.max(...displays.map(display => Math.max(1, Math.round(display.bounds.width * (display.scaleFactor || 1)))))
  const maxSourceHeight = Math.max(...displays.map(display => Math.max(1, Math.round(display.bounds.height * (display.scaleFactor || 1)))))

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: maxSourceWidth,
      height: maxSourceHeight
    }
  })
  const source = sources.find(item => item.display_id === String(targetDisplay.id)) ?? sources[0]

  if (!source) {
    throw new Error('未找到目标屏幕源')
  }

  const thumbnail = source.thumbnail
  const thumbnailSize = thumbnail.getSize()
  if (!thumbnailSize.width || !thumbnailSize.height) {
    throw new Error('目标屏幕截图为空')
  }

  const scaleX = thumbnailSize.width / Math.max(targetDisplay.bounds.width, 1)
  const scaleY = thumbnailSize.height / Math.max(targetDisplay.bounds.height, 1)
  const relativeX = rect.x - targetDisplay.bounds.x
  const relativeY = rect.y - targetDisplay.bounds.y
  const cropX = clampInt(relativeX * scaleX, 0, Math.max(thumbnailSize.width - 1, 0))
  const cropY = clampInt(relativeY * scaleY, 0, Math.max(thumbnailSize.height - 1, 0))
  const cropWidth = clampInt(rect.width * scaleX, 1, Math.max(thumbnailSize.width - cropX, 1))
  const cropHeight = clampInt(rect.height * scaleY, 1, Math.max(thumbnailSize.height - cropY, 1))
  const image = thumbnail.crop({
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight
  })

  writeFileSync(filePath, image.toPNG())

  return {
    width: image.getSize().width,
    height: image.getSize().height
  }
}

function isCommandSafe(command: string): boolean {
  return !COMMAND_BLACKLIST.some(pattern => pattern.test(command))
}

function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function extractTrailingJson(text: string) {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index]
    if (char !== '{' && char !== '[') {
      continue
    }

    const candidate = text.slice(index).trim()
    if (tryParseJson(candidate) !== null) {
      return candidate
    }
  }

  return ''
}

function sanitizePowerShellText(raw: string) {
  let next = String(raw || '').replace(/\uFEFF/g, '').trim()
  if (!next) {
    return ''
  }

  const jsonPayload = extractTrailingJson(next)
  if (jsonPayload) {
    return jsonPayload
  }

  if (next.includes('#< CLIXML')) {
    next = next
      .replace(/^#<\s*CLIXML\s*/i, '')
      .replace(/<Objs[\s\S]*<\/Objs>/gi, '')
      .replace(/_x000D__x000A_/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return next
}

function runPowerShellScript(script: string): Promise<MCPExecutionResult> {
  return new Promise(resolve => {
    const wrappedScript = [
      "$ProgressPreference = 'SilentlyContinue'",
      "$WarningPreference = 'SilentlyContinue'",
      "$InformationPreference = 'SilentlyContinue'",
      "$ErrorActionPreference = 'Stop'",
      "if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }",
      '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
      script.trim()
    ].join('\n')
    const encodedScript = Buffer.from(wrappedScript, 'utf16le').toString('base64')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
      {
        timeout: POWERSHELL_TIMEOUT,
        maxBuffer: POWERSHELL_MAX_BUFFER,
        windowsHide: true,
        encoding: 'buffer' as never
      } as never,
      (error, stdout, stderr) => {
        const stdoutText = sanitizePowerShellText(Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || ''))
        const stderrText = sanitizePowerShellText(Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr || ''))
        if (error) {
          resolve({ success: false, output: stdoutText || '', error: stderrText || error.message })
          return
        }

        resolve({ success: true, output: stdoutText, error: stderrText || undefined })
      }
    )
  })
}

function toPowerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function buildWindowQueryPreamble(query: WindowQuery) {
  const clauses: string[] = []

  if (typeof query.id === 'number' && Number.isFinite(query.id)) {
    clauses.push(`$windowId = ${Math.trunc(query.id)}`)
  } else {
    clauses.push('$windowId = $null')
  }

  clauses.push(`$windowHandleRaw = ${query.handle ? toPowerShellLiteral(query.handle.trim()) : '$null'}`)
  clauses.push(`$windowTitle = ${query.title ? toPowerShellLiteral(query.title.trim()) : '$null'}`)
  clauses.push(`$processName = ${query.processName ? toPowerShellLiteral(query.processName.trim()) : '$null'}`)

  clauses.push(`
function Resolve-WindowHandle([string]$value) {
  if (-not $value) { return $null }

  $trimmed = $value.Trim()
  if (-not $trimmed) {
    return $null
  }

  if ($trimmed.StartsWith('0x', [System.StringComparison]::OrdinalIgnoreCase)) {
    try {
      return [Int64]::Parse($trimmed.Substring(2), [System.Globalization.NumberStyles]::HexNumber)
    } catch {
      return $null
    }
  }

  try {
    return [Int64]$trimmed
  } catch {
    return $null
  }
}

function Normalize-MatchValue([string]$value) {
  if (-not $value) { return '' }
  return (($value.ToLowerInvariant() -replace '\\.exe$', '') -replace '[\\s\\._\\-（）()\\[\\]]+', '')
}

function Get-ProcessAliases([string]$value) {
  $normalized = Normalize-MatchValue $value
  if (-not $normalized) {
    return @()
  }

  if ($normalized -in @('wechat', 'weixin', '微信')) {
    return @('wechat', 'weixin', '微信')
  }

  return @($normalized)
}

function Find-TargetWindow {
  $candidates = @(Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowHandle -ne 0 })
  $windowHandle = Resolve-WindowHandle $windowHandleRaw

  if ($windowHandle) {
    $matchedByHandle = @($candidates | Where-Object { $_.MainWindowHandle.ToInt64() -eq $windowHandle })
    if ($matchedByHandle.Count -gt 0) {
      return $matchedByHandle | Select-Object -First 1
    }
  }

  if ($windowId) {
    $matchedById = @($candidates | Where-Object { $_.Id -eq $windowId })
    if ($matchedById.Count -gt 0) {
      return $matchedById | Select-Object -First 1
    }

    $matchedByNumericHandle = @($candidates | Where-Object { $_.MainWindowHandle.ToInt64() -eq [Int64]$windowId })
    if ($matchedByNumericHandle.Count -gt 0) {
      return $matchedByNumericHandle | Select-Object -First 1
    }
  }

  $normalizedTitle = Normalize-MatchValue $windowTitle
  $normalizedProcess = Normalize-MatchValue $processName
  $processAliases = Get-ProcessAliases $processName

  if ($processAliases.Count -gt 0) {
    $processMatches = @(
      $candidates | Where-Object {
        $candidateRaw = $_.ProcessName
        $candidateNormalized = Normalize-MatchValue $candidateRaw
        ($processAliases -contains $candidateNormalized) -or
        $candidateRaw.IndexOf($processName, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $candidateNormalized.IndexOf($normalizedProcess, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      }
    )

    if ($processMatches.Count -eq 0) {
      return $null
    }

    $candidates = $processMatches
  }

  if ($windowTitle) {
    $exactTitle = @($candidates | Where-Object { $_.MainWindowTitle.Equals($windowTitle, [System.StringComparison]::OrdinalIgnoreCase) })
    if ($exactTitle.Count -gt 0) {
      return $exactTitle | Select-Object -First 1
    }

    $normalizedExactTitle = @($candidates | Where-Object { (Normalize-MatchValue $_.MainWindowTitle) -eq $normalizedTitle })
    if ($normalizedExactTitle.Count -gt 0) {
      return $normalizedExactTitle | Select-Object -First 1
    }

    $fuzzyTitle = @(
      $candidates | Where-Object {
        $_.MainWindowTitle.IndexOf($windowTitle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        (Normalize-MatchValue $_.MainWindowTitle).IndexOf($normalizedTitle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      }
    )

    if ($fuzzyTitle.Count -eq 0) {
      return $null
    }

    $candidates = $fuzzyTitle
  }

  if (-not $windowTitle -and $processAliases.Count -eq 0) {
    return $null
  }

  return $candidates | Select-Object -First 1
}
`)

  return clauses.join('\n')
}

/** 执行 PowerShell 命令 */
export function executeCommand(command: string): Promise<MCPExecutionResult> {
  const normalizedCommand = command.trim()

  if (!normalizedCommand) {
    return Promise.resolve({ success: false, output: '', error: '命令为空' })
  }

  if (normalizedCommand.length > RAW_COMMAND_MAX_LENGTH) {
    return Promise.resolve({ success: false, output: '', error: `命令过长，最多允许 ${RAW_COMMAND_MAX_LENGTH} 个字符` })
  }

  // 原始命令只允许单行执行，复杂脚本走内部脚本执行器，避免注入与转义歧义。
  if (/[\r\n]/.test(normalizedCommand)) {
    return Promise.resolve({ success: false, output: '', error: '原始命令仅支持单行 PowerShell 语句' })
  }

  if (!isCommandSafe(normalizedCommand)) {
    return Promise.resolve({ success: false, output: '', error: '该命令被安全策略拦截' })
  }

  return runPowerShellScript(normalizedCommand)
}

/** 截取屏幕 */
function buildWindowRectScript(query?: WindowQuery, useForegroundWindow = false) {
  const targetQuery = query || {}

  return `
${buildWindowQueryPreamble(targetQuery)}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
public class WindowCapture {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$target = $null
if (${useForegroundWindow ? '$true' : '$false'}) {
  $foregroundHandle = [WindowCapture]::GetForegroundWindow()
  if ($foregroundHandle -eq [IntPtr]::Zero) {
    [pscustomobject]@{ success = $false; message = 'foreground window not found' } | ConvertTo-Json -Compress
    exit 0
  }

  $processId = [uint32]0
  [void][WindowCapture]::GetWindowThreadProcessId($foregroundHandle, [ref]$processId)
  $target = Get-Process | Where-Object { $_.Id -eq $processId } | Select-Object -First 1
} else {
  $target = Find-TargetWindow
}

if (-not $target) {
  [pscustomobject]@{ success = $false; message = 'window not found' } | ConvertTo-Json -Compress
  exit 0
}

$rect = New-Object RECT
if (-not [WindowCapture]::GetWindowRect($target.MainWindowHandle, [ref]$rect)) {
  [pscustomobject]@{ success = $false; message = 'window rect unavailable' } | ConvertTo-Json -Compress
  exit 0
}

$width = [Math]::Max($rect.Right - $rect.Left, 1)
$height = [Math]::Max($rect.Bottom - $rect.Top, 1)
[pscustomobject]@{
  success = $true
  width = $width
  height = $height
  x = $rect.Left
  y = $rect.Top
  window = [pscustomobject]@{
    id = $target.Id
    processName = $target.ProcessName
    title = $target.MainWindowTitle
    handle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64())
    windowHandle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64())
  }
} | ConvertTo-Json -Compress
`
}

export async function captureScreen(payload: string | ScreenCapturePayload = 'full'): Promise<MCPExecutionResult> {
  const request = typeof payload === 'string' ? { region: payload as ScreenCapturePayload['region'] } : (payload || {})
  const region = request.region || 'full'

  try {
    ensureTempDir()

    if (region === 'active' || region === 'window') {
      const fileName = `screenshot_${Date.now()}.png`
      const filePath = getTempFilePath(fileName)
      const result = await runPowerShellScript(buildWindowRectScript(
        {
          id: request.windowId,
          handle: request.windowHandle,
          title: request.windowTitle,
          processName: request.processName
        },
        region === 'active'
      ))
      const parsed = tryParseJson<Record<string, unknown>>(result.output)

      if (result.error || parsed?.success === false) {
        return {
          success: false,
          output: '',
          error: result.error || String(parsed?.message || '窗口截图失败')
        }
      }

      const width = Number(parsed?.width || 0)
      const height = Number(parsed?.height || 0)
      const x = Number(parsed?.x || 0)
      const y = Number(parsed?.y || 0)
      const targetWindow = parsed?.window && typeof parsed.window === 'object' ? parsed.window as WindowMatchInfo : null

      if (width <= 0 || height <= 0) {
        return {
          success: false,
          output: '',
          error: '窗口矩形无效，无法截图'
        }
      }

      const capturedImage = await captureDisplayRegionToFile(filePath, { x, y, width, height })

      return {
        success: true,
        output: `窗口截图已保存: ${filePath}\n窗口位置: (${x}, ${y})\n分辨率: ${capturedImage.width}x${capturedImage.height}${targetWindow ? `\n目标窗口: ${String(targetWindow.title || '')}` : ''}`,
        data: {
          filePath,
          width: capturedImage.width,
          height: capturedImage.height,
          x,
          y,
          window: targetWindow
        }
      }
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })

    if (sources.length === 0) {
      return { success: false, output: '', error: '未找到可截取的屏幕' }
    }

    const source = sources[0]
    const image = source.thumbnail
    const fileName = `screenshot_${Date.now()}.png`
    const filePath = getTempFilePath(fileName)
    writeFileSync(filePath, image.toPNG())

    return {
      success: true,
      output: `截图已保存: ${filePath}\n分辨率: ${image.getSize().width}x${image.getSize().height}`,
      data: {
        filePath,
        width: image.getSize().width,
        height: image.getSize().height
      }
    }
  } catch (error) {
    return { success: false, output: '', error: (error as Error).message }
  }
}

/** 模拟鼠标点击（通过PowerShell调用Windows API） */
export async function mouseClick(
  x: number,
  y: number,
  button: string = 'left',
  clickType: string = 'single'
): Promise<MCPExecutionResult> {
  const downEvent = button === 'right' ? '0x0008' : button === 'middle' ? '0x0020' : '0x0002'
  const upEvent = button === 'right' ? '0x0010' : button === 'middle' ? '0x0040' : '0x0004'
  const clicks = clickType === 'double' ? 2 : 1

  // 使用 PowerShell 调用 user32.dll
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseSim {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, IntPtr dwExtraInfo);
}
"@
[MouseSim]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
for ($i = 0; $i -lt ${clicks}; $i++) {
    [MouseSim]::mouse_event(${downEvent}, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [MouseSim]::mouse_event(${upEvent}, 0, 0, 0, [IntPtr]::Zero)
    if ($i -lt ${clicks - 1}) { Start-Sleep -Milliseconds 80 }
}
Write-Output "clicked at (${Math.round(x)}, ${Math.round(y)})"
`

  return runPowerShellScript(script)
}

/** 模拟键盘输入 */
export async function keyboardInput(payload?: KeyboardPayload): Promise<MCPExecutionResult> {
  const text = payload?.text
  const keys = payload?.keys

  if (keys) {
    // 特殊按键组合
    const keyMap: Record<string, string> = {
      'enter': '{ENTER}',
      'tab': '{TAB}',
      'escape': '{ESC}',
      'backspace': '{BACKSPACE}',
      'delete': '{DELETE}',
      'up': '{UP}',
      'down': '{DOWN}',
      'left': '{LEFT}',
      'right': '{RIGHT}',
      'home': '{HOME}',
      'end': '{END}',
      'pageup': '{PGUP}',
      'pagedown': '{PGDN}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
      'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
      'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}'
    }

    // 处理组合键 ctrl+c, alt+f4 等
    const parts = keys.toLowerCase().split('+').map(k => k.trim())
    let sendKeysStr = ''
    const modifiers: string[] = []

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') { modifiers.push('^'); continue }
      if (part === 'alt') { modifiers.push('%'); continue }
      if (part === 'shift') { modifiers.push('+'); continue }
      const mapped = keyMap[part] || part
      sendKeysStr = modifiers.join('') + mapped
    }

    if (!sendKeysStr) {
      return { success: false, output: '', error: '无法识别的按键' }
    }

    const script = `
${buildWindowQueryPreamble({ id: payload?.windowId, handle: payload?.windowHandle, title: payload?.windowTitle, processName: payload?.processName })}
Add-Type -AssemblyName System.Windows.Forms
[void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyboardFocus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$target = Find-TargetWindow
if (($windowId -or $windowHandleRaw -or $windowTitle -or $processName) -and -not $target) {
  [pscustomobject]@{ success = $false; message = 'target window not found' } | ConvertTo-Json -Compress
  exit 0
}
if ($target) {
  [Microsoft.VisualBasic.Interaction]::AppActivate($target.Id) | Out-Null
  Start-Sleep -Milliseconds 150
}
[void]$null
$isForeground = if ($target) { [KeyboardFocus]::GetForegroundWindow().ToInt64() -eq $target.MainWindowHandle.ToInt64() } else { $true }
if (-not $isForeground) {
  [pscustomobject]@{ success = $false; message = 'target window focus failed' } | ConvertTo-Json -Compress
  exit 0
}
[System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr.replace(/'/g, "''")}')
$result = [pscustomobject]@{
  success = $true
  action = 'keys'
  keys = ${toPowerShellLiteral(keys)}
  target = if ($target) { [pscustomobject]@{ id = $target.Id; processName = $target.ProcessName; title = $target.MainWindowTitle; handle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64()); windowHandle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64()) } } else { $null }
}
$result | ConvertTo-Json -Compress
`
    return runPowerShellScript(script)
  }

  if (text) {
    const textBase64 = Buffer.from(text, 'utf8').toString('base64')
    const script = `
${buildWindowQueryPreamble({ id: payload?.windowId, handle: payload?.windowHandle, title: payload?.windowTitle, processName: payload?.processName })}
Add-Type -AssemblyName System.Windows.Forms
[void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyboardFocus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$target = Find-TargetWindow
if (($windowId -or $windowHandleRaw -or $windowTitle -or $processName) -and -not $target) {
  [pscustomobject]@{ success = $false; message = 'target window not found' } | ConvertTo-Json -Compress
  exit 0
}
if ($target) {
  [Microsoft.VisualBasic.Interaction]::AppActivate($target.Id) | Out-Null
  Start-Sleep -Milliseconds 180
}
$isForeground = if ($target) { [KeyboardFocus]::GetForegroundWindow().ToInt64() -eq $target.MainWindowHandle.ToInt64() } else { $true }
if (-not $isForeground) {
  [pscustomobject]@{ success = $false; message = 'target window focus failed' } | ConvertTo-Json -Compress
  exit 0
}
$textValue = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textBase64}'))
$hadClipboardText = $false
$clipboardBackup = ''
try {
  if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    $hadClipboardText = $true
    $clipboardBackup = [System.Windows.Forms.Clipboard]::GetText()
  }
} catch {}
[System.Windows.Forms.Clipboard]::SetText($textValue)
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 60
try {
  if ($hadClipboardText) {
    [System.Windows.Forms.Clipboard]::SetText($clipboardBackup)
  } else {
    [System.Windows.Forms.Clipboard]::Clear()
  }
} catch {}
$result = [pscustomobject]@{
  success = $true
  action = 'text'
  textLength = $textValue.Length
  target = if ($target) { [pscustomobject]@{ id = $target.Id; processName = $target.ProcessName; title = $target.MainWindowTitle; handle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64()); windowHandle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64()) } } else { $null }
}
$result | ConvertTo-Json -Compress
`
    return runPowerShellScript(script)
  }

  return { success: false, output: '', error: '需要提供 text 或 keys 参数' }
}

/** 列出所有窗口 */
export async function listWindows(): Promise<MCPExecutionResult> {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WindowState {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$foreground = [WindowState]::GetForegroundWindow().ToInt64()
$items = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowHandle -ne 0 } | Sort-Object @{ Expression = { if ($_.MainWindowHandle.ToInt64() -eq $foreground) { 0 } else { 1 } } }, ProcessName, MainWindowTitle | ForEach-Object {
  [pscustomobject]@{
    id = $_.Id
    processName = $_.ProcessName
    title = $_.MainWindowTitle
    handle = ('0x{0:X}' -f $_.MainWindowHandle.ToInt64())
    windowHandle = ('0x{0:X}' -f $_.MainWindowHandle.ToInt64())
    isForeground = ($_.MainWindowHandle.ToInt64() -eq $foreground)
  }
}
$items | ConvertTo-Json -Depth 4 -Compress
`
  return runPowerShellScript(script)
}

/** 聚焦指定窗口 */
export async function focusWindow(query?: WindowQuery): Promise<MCPExecutionResult> {
  if (!query || (!query.title?.trim() && !query.processName?.trim() && !query.handle?.trim() && typeof query.id !== 'number')) {
    return { success: false, output: '', error: '窗口目标为空' }
  }

  const script = `
${buildWindowQueryPreamble(query)}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$target = Find-TargetWindow
if (-not $target) {
  [pscustomobject]@{ success = $false; message = 'window not found' } | ConvertTo-Json -Compress
  exit 0
}
[WinFocus]::ShowWindow($target.MainWindowHandle, 9) | Out-Null
Start-Sleep -Milliseconds 120
[WinFocus]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 120
$isForeground = ([WinFocus]::GetForegroundWindow().ToInt64() -eq $target.MainWindowHandle.ToInt64())
[pscustomobject]@{
  success = $isForeground
  id = $target.Id
  processName = $target.ProcessName
  title = $target.MainWindowTitle
  handle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64())
  windowHandle = ('0x{0:X}' -f $target.MainWindowHandle.ToInt64())
  isForeground = $isForeground
} | ConvertTo-Json -Compress
`
  return runPowerShellScript(script)
}
