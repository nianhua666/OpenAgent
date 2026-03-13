const { spawn } = require('node:child_process')
const http = require('node:http')

const HOST = process.env.OPENAGENT_SMOKE_HOST || '127.0.0.1'
const PORT = Number(process.env.OPENAGENT_SMOKE_PORT || 41731)
const BASE_URL = `http://${HOST}:${PORT}`
const ROUTES = ['/', '/ai', '/ide', '/ai-overlay', '/sub2api']
const PREVIEW_READY_TIMEOUT_MS = 20_000
const PREVIEW_POLL_INTERVAL_MS = 400
const PREVIEW_SHUTDOWN_TIMEOUT_MS = 5_000
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let previewProcess = null
let shuttingDown = false

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function log(message) {
  process.stdout.write(`[smoke:routes] ${message}\n`)
}

function requestRoute(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${BASE_URL}${pathname}`, response => {
      response.resume()
      resolve(response.statusCode || 0)
    })

    request.on('error', reject)
    request.setTimeout(3_000, () => {
      request.destroy(new Error(`request timeout: ${pathname}`))
    })
  })
}

async function waitForPreviewServer() {
  const startedAt = Date.now()

  while (Date.now() - startedAt < PREVIEW_READY_TIMEOUT_MS) {
    try {
      const statusCode = await requestRoute('/')
      if (statusCode >= 200 && statusCode < 500) {
        return
      }
    } catch {}

    await sleep(PREVIEW_POLL_INTERVAL_MS)
  }

  throw new Error(`preview server did not become ready within ${PREVIEW_READY_TIMEOUT_MS}ms`)
}

function startPreviewServer() {
  const command = process.platform === 'win32' ? 'cmd.exe' : NPM_COMMAND
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort']
    : ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort']

  previewProcess = spawn(
    command,
    args,
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    },
  )

  previewProcess.stdout.on('data', chunk => {
    const text = String(chunk).trim()
    if (text) {
      log(text)
    }
  })

  previewProcess.stderr.on('data', chunk => {
    const text = String(chunk).trim()
    if (text) {
      log(text)
    }
  })

  previewProcess.on('exit', code => {
    if (!shuttingDown && code !== 0) {
      log(`preview server exited unexpectedly with code ${code}`)
    }
  })
}

function killProcessTree(pid) {
  return new Promise(resolve => {
    if (!pid) {
      resolve()
      return
    }

    if (process.platform !== 'win32') {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
      resolve()
      return
    }

    const killer = spawn(
      'taskkill',
      ['/pid', String(pid), '/t', '/f'],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    )

    killer.on('exit', () => resolve())
    killer.on('error', () => resolve())
  })
}

async function stopPreviewServer() {
  if (!previewProcess || previewProcess.exitCode !== null) {
    return
  }

  shuttingDown = true
  await killProcessTree(previewProcess.pid)

  const startedAt = Date.now()
  while (previewProcess.exitCode === null && Date.now() - startedAt < PREVIEW_SHUTDOWN_TIMEOUT_MS) {
    await sleep(100)
  }

  if (previewProcess.exitCode === null) {
    await killProcessTree(previewProcess.pid)
  }
}

async function run() {
  startPreviewServer()
  await waitForPreviewServer()

  for (const route of ROUTES) {
    const statusCode = await requestRoute(route)
    if (statusCode < 200 || statusCode >= 400) {
      throw new Error(`route ${route} returned ${statusCode}`)
    }
    log(`OK ${route} -> ${statusCode}`)
  }

  log('route smoke checks passed')
}

async function main() {
  const cleanup = async () => {
    await stopPreviewServer()
  }

  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(130))
  })
  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(143))
  })

  try {
    await run()
    await cleanup()
  } catch (error) {
    log(error instanceof Error ? error.message : 'unknown failure')
    await cleanup()
    process.exitCode = 1
  }
}

void main()
