const { existsSync, mkdirSync, rmSync } = require('fs')
const { join, resolve } = require('path')
const { spawn } = require('child_process')
const { tmpdir } = require('os')

const DEFAULT_ROUTES = ['/ai', '/ide']
const DEFAULT_CAPTURE_DELAY_MS = 2600

function parseArgs(argv) {
  const options = {
    outDir: join(tmpdir(), 'openagent-electron-ui'),
    delayMs: DEFAULT_CAPTURE_DELAY_MS,
    routes: [],
  }

  for (const argument of argv) {
    if (argument.startsWith('--out-dir=')) {
      options.outDir = resolve(argument.slice('--out-dir='.length))
      continue
    }

    if (argument.startsWith('--delay-ms=')) {
      const parsed = Number.parseInt(argument.slice('--delay-ms='.length), 10)
      if (Number.isFinite(parsed)) {
        options.delayMs = Math.min(Math.max(parsed, 300), 20_000)
      }
      continue
    }

    if (argument.startsWith('--route=')) {
      const route = normalizeRoute(argument.slice('--route='.length))
      if (route) {
        options.routes.push(route)
      }
    }
  }

  if (options.routes.length === 0) {
    options.routes = [...DEFAULT_ROUTES]
  }

  return options
}

function normalizeRoute(rawRoute) {
  const trimmed = String(rawRoute || '').trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^#?\/?/, '')}`
}

function toFileSlug(route) {
  return route
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root'
}

function runElectronCapture(route, outputPath, delayMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/run-electron.cjs',
        '.',
        `--main-route=${route}`,
        `--capture-main-window=${outputPath}`,
        `--capture-delay-ms=${delayMs}`,
        '--capture-quit',
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        windowsHide: false,
      },
    )

    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0 && existsSync(outputPath)) {
        resolvePromise(outputPath)
        return
      }

      rejectPromise(new Error(`Electron capture failed for ${route} with exit code ${code ?? 'unknown'}`))
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  rmSync(options.outDir, { recursive: true, force: true })
  mkdirSync(options.outDir, { recursive: true })

  const results = []
  for (const route of options.routes) {
    const outputPath = join(options.outDir, `${toFileSlug(route)}.png`)
    process.stdout.write(`[check:electron-ui] capturing ${route} -> ${outputPath}\n`)
    const capturedPath = await runElectronCapture(route, outputPath, options.delayMs)
    results.push({ route, path: capturedPath })
  }

  process.stdout.write('[check:electron-ui] captures completed\n')
  for (const result of results) {
    process.stdout.write(`- ${result.route}: ${result.path}\n`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
