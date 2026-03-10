import { app, net, protocol } from 'electron'
import { existsSync } from 'fs'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'openagent',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const DEV_RUNTIME_ASSET_FILES: Record<string, string> = {
  'espeak-ng.wasm': join(process.cwd(), 'node_modules', 'espeak-ng', 'dist', 'espeak-ng.wasm'),
  'ort.bundle.min.mjs': join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist', 'ort.bundle.min.mjs'),
  'ort-wasm-simd-threaded.jsep.mjs': join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.jsep.mjs'),
  'ort-wasm-simd-threaded.jsep.wasm': join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.jsep.wasm'),
  'ort-wasm-simd-threaded.mjs': join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.mjs'),
  'ort-wasm-simd-threaded.wasm': join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm')
}

let runtimeAssetProtocolRegistered = false

function normalizeProtocolAssetPath(assetPath: string) {
  const normalized = assetPath.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    throw new Error('资源路径越界')
  }

  return normalized
}

function getBundledRendererDistDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'dist')
    : join(process.cwd(), 'dist')
}

function resolveRendererDistPath(assetPath: string) {
  const normalizedAssetPath = normalizeProtocolAssetPath(assetPath || 'index.html')
  const distRoot = getBundledRendererDistDir()
  const targetPath = normalize(join(distRoot, normalizedAssetPath))

  return isInsideRoot(distRoot, targetPath) && existsSync(targetPath) ? targetPath : ''
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const normalizedRoot = normalize(rootPath)
  const normalizedTarget = normalize(targetPath)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
}

function resolveRuntimeAssetPath(section: string, assetPath: string) {
  const normalizedAssetPath = normalizeProtocolAssetPath(assetPath)
  const bundledDistDir = getBundledRendererDistDir()
  const bundledSectionRoot = join(bundledDistDir, section)
  const bundledTargetPath = normalize(join(bundledSectionRoot, normalizedAssetPath))

  if (existsSync(bundledTargetPath) && isInsideRoot(bundledSectionRoot, bundledTargetPath)) {
    return bundledTargetPath
  }

  if (app.isPackaged) {
    return ''
  }

  if (section === 'models') {
    const devModelRoot = join(process.cwd(), 'build', 'tts-resources', 'models')
    const devModelPath = normalize(join(devModelRoot, normalizedAssetPath))
    return isInsideRoot(devModelRoot, devModelPath) && existsSync(devModelPath) ? devModelPath : ''
  }

  if (section === 'voices') {
    const devVoiceRoot = join(process.cwd(), 'build', 'tts-resources', 'voices')
    const devVoicePath = normalize(join(devVoiceRoot, normalizedAssetPath))
    return isInsideRoot(devVoiceRoot, devVoicePath) && existsSync(devVoicePath) ? devVoicePath : ''
  }

  if (section === 'assets') {
    const resolvedAssetPath = DEV_RUNTIME_ASSET_FILES[normalizedAssetPath]
    return resolvedAssetPath && existsSync(resolvedAssetPath) ? resolvedAssetPath : ''
  }

  return ''
}

export function registerRuntimeAssetProtocol() {
  if (runtimeAssetProtocolRegistered) {
    return
  }

  runtimeAssetProtocolRegistered = true
  protocol.handle('openagent', request => {
    const parsedUrl = new URL(request.url)
    if (parsedUrl.hostname !== 'app') {
      return new Response('Not Found', { status: 404 })
    }

    const requestPath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '') || 'index.html'
    const [section, ...segments] = requestPath.split('/')

    let targetPath = ''
    if (section && segments.length > 0 && ['assets', 'models', 'voices'].includes(section)) {
      targetPath = resolveRuntimeAssetPath(section, segments.join('/'))
    }

    if (!targetPath) {
      targetPath = resolveRendererDistPath(requestPath)
    }

    if (!targetPath || !existsSync(targetPath)) {
      return new Response('Not Found', { status: 404 })
    }

    return net.fetch(pathToFileURL(targetPath).toString())
  })
}