import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import type { TTSSynthesizePayload, TTSSynthesisResult, TTSVoiceLibraryItem } from '../src/types'
import {
  SYSTEM_TTS_ENGINE,
  SYSTEM_TTS_MODEL_ID,
  SYSTEM_TTS_VOICE_ID,
  createSystemTTSVoiceId,
  stripSystemTTSVoiceId
} from '../src/utils/ttsCatalog'

type NativeSystemVoice = {
  id: string
  name: string
  locale: string
  gender: string
}

type NativeSystemSynthesisMeta = {
  voiceId: string
  voiceName: string
  locale?: string
}

let systemTTSHandlersRegistered = false
let cachedVoices: { expiresAt: number; voices: NativeSystemVoice[] } | null = null

function createTempFilePath(extension: string) {
  return join(app.getPath('temp'), `openagent-system-tts-${Date.now()}-${randomUUID()}${extension}`)
}

function encodePowerShellCommand(script: string) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function quotePowerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function inferAccent(locale: string) {
  if (/zh-cn/i.test(locale)) {
    return '普通话'
  }

  if (/zh-tw/i.test(locale)) {
    return '繁中 / 台湾'
  }

  if (/zh-hk/i.test(locale)) {
    return '粤语 / 香港'
  }

  return locale || '系统语音'
}

function normalizeGender(gender: string): 'female' | 'male' {
  return /male/i.test(gender) && !/female/i.test(gender) ? 'male' : 'female'
}

function runPowerShell(script: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodePowerShellCommand(script)
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      reject(error)
    })

    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }

      reject(new Error(stderr.trim() || stdout.trim() || `PowerShell 执行失败，退出码 ${code ?? -1}`))
    })
  })
}

function buildVoiceListScript() {
  return String.raw`
$ErrorActionPreference = 'Stop'

function Get-WinRtVoices {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object {
    [PSCustomObject]@{
      id = $_.Id
      name = $_.DisplayName
      locale = $_.Language
      gender = $_.Gender.ToString()
    }
  })
}

function Get-SystemSpeechVoices {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    @($synth.GetInstalledVoices() | ForEach-Object {
      $voice = $_.VoiceInfo
      [PSCustomObject]@{
        id = $voice.Name
        name = $voice.Name
        locale = $voice.Culture.Name
        gender = $voice.Gender.ToString()
      }
    })
  } finally {
    $synth.Dispose()
  }
}

$voices = @()
try {
  $voices = Get-WinRtVoices
} catch {
  $voices = @()
}

if (-not $voices -or $voices.Count -eq 0) {
  $voices = Get-SystemSpeechVoices
}

@($voices) | ConvertTo-Json -Compress
`
}

function buildSynthesisScript(requestPath: string) {
  return String.raw`
$ErrorActionPreference = 'Stop'
$request = Get-Content -Raw -Encoding UTF8 -Path ${quotePowerShellLiteral(requestPath)} | ConvertFrom-Json

function Invoke-WinRtAsync([object]$Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.GetAwaiter().GetResult()
}

function Resolve-PreferredVoice($voices, [string]$requestedId, [string]$preferredLocale) {
  if ($requestedId) {
    $matched = $voices | Where-Object { $_.Id -eq $requestedId -or $_.DisplayName -eq $requestedId -or $_.Name -eq $requestedId } | Select-Object -First 1
    if ($matched) {
      return $matched
    }
  }

  if ($preferredLocale) {
    $exact = $voices | Where-Object { $_.Language -eq $preferredLocale -or $_.Culture.Name -eq $preferredLocale } | Select-Object -First 1
    if ($exact) {
      return $exact
    }

    $prefix = $preferredLocale.Split('-')[0]
    $broad = $voices | Where-Object {
      ($_.Language -and $_.Language -like ($prefix + '*')) -or
      ($_.Culture.Name -and $_.Culture.Name -like ($prefix + '*'))
    } | Select-Object -First 1
    if ($broad) {
      return $broad
    }
  }

  return $voices | Select-Object -First 1
}

function Invoke-WinRtSynthesis {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $stream = $null
  $reader = $null

  try {
    $voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
    $voice = Resolve-PreferredVoice $voices ([string]$request.voiceId) ([string]$request.preferredLocale)
    if ($voice) {
      $synth.Voice = $voice
    }

    $rate = [double]$request.speed
    if ($rate -le 0) {
      $rate = 1.0
    }

    $synth.Options.SpeakingRate = [Math]::Min([Math]::Max($rate, 0.7), 1.35)
    $stream = Invoke-WinRtAsync ($synth.SynthesizeTextToStreamAsync([string]$request.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = New-Object Windows.Storage.Streams.DataReader(([Windows.Storage.Streams.IInputStream]$stream))
    [void](Invoke-WinRtAsync ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))

    $bytes = New-Object byte[] ([int]$stream.Size)
    $reader.ReadBytes($bytes)
    [System.IO.File]::WriteAllBytes([string]$request.outputPath, $bytes)

    [PSCustomObject]@{
      voiceId = if ($voice) { $voice.Id } else { '' }
      voiceName = if ($voice) { $voice.DisplayName } else { '系统自动选择' }
      locale = if ($voice) { $voice.Language } else { [string]$request.preferredLocale }
    }
    return
  } finally {
    if ($reader) {
      $reader.DetachStream() | Out-Null
      $reader.Dispose()
    }

    if ($stream -and ($stream -is [System.IDisposable])) {
      $stream.Dispose()
    }

    if ($synth) {
      $synth.Dispose()
    }
  }
}

function Convert-ToSystemSpeechRate([double]$speed) {
  if ($speed -le 0) {
    return 0
  }

  $scaled = [Math]::Round(($speed - 1.0) * 8.0)
  return [Math]::Min([Math]::Max([int]$scaled, -10), 10)
}

function Invoke-SystemSpeechSynthesis {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

  try {
    $voices = @($synth.GetInstalledVoices())
    $voice = $null
    if ([string]$request.voiceId) {
      $voice = $voices | Where-Object { $_.VoiceInfo.Name -eq [string]$request.voiceId } | Select-Object -First 1
    }

    if (-not $voice -and [string]$request.preferredLocale) {
      $voice = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq [string]$request.preferredLocale } | Select-Object -First 1
    }

    if (-not $voice) {
      $voice = $voices | Select-Object -First 1
    }

    if ($voice) {
      $synth.SelectVoice($voice.VoiceInfo.Name)
    }

    $synth.Rate = Convert-ToSystemSpeechRate([double]$request.speed)
    $synth.SetOutputToWaveFile([string]$request.outputPath)
    $synth.Speak([string]$request.text)

    [PSCustomObject]@{
      voiceId = if ($voice) { $voice.VoiceInfo.Name } else { '' }
      voiceName = if ($voice) { $voice.VoiceInfo.Name } else { '系统自动选择' }
      locale = if ($voice) { $voice.VoiceInfo.Culture.Name } else { [string]$request.preferredLocale }
    }
    return
  } finally {
    $synth.Dispose()
  }
}

try {
  $result = Invoke-WinRtSynthesis
} catch {
  $result = Invoke-SystemSpeechSynthesis
}

$result | ConvertTo-Json -Compress
`
}

export async function listNativeSystemVoices() {
  if (process.platform !== 'win32') {
    return []
  }

  if (cachedVoices && cachedVoices.expiresAt > Date.now()) {
    return cachedVoices.voices
  }

  const output = await runPowerShell(buildVoiceListScript())
  const parsed = output ? JSON.parse(output) as NativeSystemVoice[] | NativeSystemVoice : []
  const voices = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  cachedVoices = {
    expiresAt: Date.now() + 60_000,
    voices
  }
  return voices
}

function mapNativeVoiceToLibraryItem(voice: NativeSystemVoice): TTSVoiceLibraryItem {
  return {
    id: createSystemTTSVoiceId(voice.id || voice.name),
    engine: SYSTEM_TTS_ENGINE,
    modelId: SYSTEM_TTS_MODEL_ID,
    name: voice.name,
    locale: voice.locale || 'zh-CN',
    gender: normalizeGender(voice.gender),
    accent: inferAccent(voice.locale || ''),
    description: '原生 Windows 系统语音，优先通过 WinRT / OneCore 获取。',
    sampleText: '你好，我是 OpenAgent 的系统语音助手。',
    sourceLabel: '系统语音 / Windows Native',
    sourceUrl: 'system://windows-native',
    recommended: /zh/i.test(voice.locale || '')
  }
}

function readWavMetadata(buffer: Buffer) {
  const mimeType = 'audio/wav'
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return { mimeType }
  }

  let sampleRate: number | undefined
  let byteRate: number | undefined
  let dataSize: number | undefined

  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const chunkDataOffset = offset + 8
    const paddedChunkSize = chunkSize + (chunkSize % 2)

    if (chunkDataOffset > buffer.length) {
      break
    }

    if (chunkId === 'fmt ' && chunkDataOffset + 12 <= buffer.length) {
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4)
      byteRate = buffer.readUInt32LE(chunkDataOffset + 8)
    }

    if (chunkId === 'data') {
      dataSize = Math.min(chunkSize, buffer.length - chunkDataOffset)
      if (sampleRate && byteRate) {
        break
      }
    }

    offset = chunkDataOffset + paddedChunkSize
  }

  const durationMs = typeof byteRate === 'number' && byteRate > 0 && typeof dataSize === 'number'
    ? Math.round((dataSize / byteRate) * 1000)
    : undefined

  return {
    mimeType,
    sampleRate,
    durationMs
  }
}

export async function synthesizeNativeSystemSpeech(payload: TTSSynthesizePayload): Promise<TTSSynthesisResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      engine: SYSTEM_TTS_ENGINE,
      modelId: SYSTEM_TTS_MODEL_ID,
      voiceId: payload.voiceId || SYSTEM_TTS_VOICE_ID,
      voiceName: '系统自动选择',
      mimeType: 'audio/wav',
      error: '当前平台暂不支持原生 Windows 系统语音'
    }
  }

  const outputPath = createTempFilePath('.wav')
  const requestPath = createTempFilePath('.json')

  try {
    writeFileSync(requestPath, JSON.stringify({
      text: payload.text,
      voiceId: stripSystemTTSVoiceId(payload.voiceId),
      preferredLocale: 'zh-CN',
      speed: payload.speed,
      outputPath
    }), 'utf-8')

    const output = await runPowerShell(buildSynthesisScript(requestPath))
    const meta = JSON.parse(output) as NativeSystemSynthesisMeta
    const audioBuffer = readFileSync(outputPath)
    const wavMeta = readWavMetadata(audioBuffer)

    return {
      success: true,
      engine: SYSTEM_TTS_ENGINE,
      modelId: SYSTEM_TTS_MODEL_ID,
      voiceId: createSystemTTSVoiceId(meta.voiceId || stripSystemTTSVoiceId(payload.voiceId) || SYSTEM_TTS_VOICE_ID),
      voiceName: meta.voiceName || '系统自动选择',
      mimeType: wavMeta.mimeType,
      audioBase64: audioBuffer.toString('base64'),
      sampleRate: wavMeta.sampleRate,
      durationMs: wavMeta.durationMs
    }
  } catch (error) {
    return {
      success: false,
      engine: SYSTEM_TTS_ENGINE,
      modelId: SYSTEM_TTS_MODEL_ID,
      voiceId: payload.voiceId || SYSTEM_TTS_VOICE_ID,
      voiceName: '系统自动选择',
      mimeType: 'audio/wav',
      error: error instanceof Error ? error.message : '系统语音生成失败'
    }
  } finally {
    rmSync(requestPath, { force: true })
    rmSync(outputPath, { force: true })
  }
}

export function registerSystemTTSHandlers() {
  if (systemTTSHandlersRegistered) {
    return
  }

  systemTTSHandlersRegistered = true

  ipcMain.handle('tts:listSystemVoices', async () => {
    const voices = await listNativeSystemVoices()
    return voices.map(mapNativeVoiceToLibraryItem)
  })

  ipcMain.handle('tts:synthesizeSystem', async (_event, payload: TTSSynthesizePayload) => {
    return synthesizeNativeSystemSpeech(payload)
  })
}