const { spawn } = require('child_process')

function resolveElectronBinary() {
  const electronBinary = require('electron')
  if (typeof electronBinary !== 'string' || !electronBinary.trim()) {
    throw new Error('Unable to resolve Electron binary path.')
  }

  return electronBinary
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node scripts/run-electron.cjs <entry> [...args]')
    process.exit(1)
  }

  const env = { ...process.env }
  // Ensure Electron always starts in app mode instead of inheriting a Node-only shell environment.
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(resolveElectronBinary(), args, {
    env,
    stdio: 'inherit',
    windowsHide: false,
  })

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  process.on('SIGINT', forwardSignal)
  process.on('SIGTERM', forwardSignal)

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    process.removeListener('SIGINT', forwardSignal)
    process.removeListener('SIGTERM', forwardSignal)

    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
