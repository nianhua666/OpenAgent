const { existsSync, mkdirSync, rmSync } = require('fs')
const { join } = require('path')
const { spawn } = require('child_process')
const { tmpdir } = require('os')

const DEFAULT_CHROME_PATH = process.env.CHROME_PATH || 'C:\\Users\\年华\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'

function resolveChromePath() {
  return existsSync(DEFAULT_CHROME_PATH) ? DEFAULT_CHROME_PATH : ''
}

function runScenario(name, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const child = spawn(resolveChromePath(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const startedAt = Date.now()

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      child.kill('SIGTERM')
      resolve({
        name,
        ok: true,
        mode: 'running',
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    }, timeoutMs)

    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve({
        name,
        ok: false,
        mode: 'error',
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
      })
    })

    child.on('exit', (code, signal) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve({
        name,
        ok: false,
        mode: 'exit',
        code,
        signal,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}

async function main() {
  const chromePath = resolveChromePath()
  if (!chromePath) {
    console.error('[check:chrome-automation] Chrome executable not found. Set CHROME_PATH and retry.')
    process.exit(1)
  }

  const tempProfile = join(tmpdir(), 'openagent-chrome-automation-check')
  rmSync(tempProfile, { recursive: true, force: true })
  mkdirSync(tempProfile, { recursive: true })

  const scenarios = [
    {
      name: 'plain',
      args: ['about:blank'],
    },
    {
      name: 'remote-debugging',
      args: ['--remote-debugging-port=0', 'about:blank'],
    },
    {
      name: 'remote-debugging-temp-profile',
      args: [`--user-data-dir=${tempProfile}`, '--remote-debugging-port=0', 'about:blank'],
    },
  ]

  const results = []
  for (const scenario of scenarios) {
    process.stdout.write(`[check:chrome-automation] running ${scenario.name}\n`)
    results.push(await runScenario(scenario.name, scenario.args))
  }

  rmSync(tempProfile, { recursive: true, force: true })

  process.stdout.write(`[check:chrome-automation] chrome=${chromePath}\n`)
  for (const result of results) {
    process.stdout.write(`${result.name}: ${result.ok ? 'running' : `failed (${result.mode}${typeof result.code === 'number' ? ` code=${result.code}` : ''}${result.signal ? ` signal=${result.signal}` : ''})`} duration=${result.durationMs}ms\n`)
    if (result.stderr) {
      process.stdout.write(`stderr: ${result.stderr}\n`)
    }
  }

  const remoteDebugFailure = results.find(result => result.name === 'remote-debugging')
  if (!remoteDebugFailure?.ok) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
