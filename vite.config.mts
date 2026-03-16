import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const rendererRuntimeAssets = [
  {
    source: resolve(projectRoot, 'node_modules/espeak-ng/dist/espeak-ng.wasm'),
    target: 'espeak-ng.wasm'
  },
  {
    source: resolve(projectRoot, 'node_modules/onnxruntime-web/dist/ort.bundle.min.mjs'),
    target: 'ort.bundle.min.mjs'
  },
  {
    source: resolve(projectRoot, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs'),
    target: 'ort-wasm-simd-threaded.jsep.mjs'
  },
  {
    source: resolve(projectRoot, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm'),
    target: 'ort-wasm-simd-threaded.jsep.wasm'
  },
  {
    source: resolve(projectRoot, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'),
    target: 'ort-wasm-simd-threaded.mjs'
  },
  {
    source: resolve(projectRoot, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'),
    target: 'ort-wasm-simd-threaded.wasm'
  }
]

const bundledTTSAssets = [
  {
    source: resolve(projectRoot, 'build/tts-resources/models'),
    target: resolve(projectRoot, 'dist', 'models')
  },
  {
    source: resolve(projectRoot, 'build/tts-resources/voices'),
    target: resolve(projectRoot, 'dist', 'voices')
  }
]

function copyRendererRuntimeAssetsPlugin() {
  return {
    name: 'copy-renderer-runtime-assets',
    async closeBundle() {
      const targetDir = resolve(projectRoot, 'dist', 'assets')
      await mkdir(targetDir, { recursive: true })

      for (const asset of rendererRuntimeAssets) {
        if (!existsSync(asset.source)) {
          continue
        }

        await copyFileWithRetry(asset.source, resolve(targetDir, asset.target))
      }

      for (const asset of bundledTTSAssets) {
        if (!existsSync(asset.source)) {
          continue
        }

        await copyDirectory(asset.source, asset.target)
      }
    }
  }
}

async function copyDirectory(sourceDir: string, targetDir: string) {
  await mkdir(targetDir, { recursive: true })

  for (const entry of await readdir(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry)
    const targetPath = resolve(targetDir, entry)
    const entryStat = await stat(sourcePath)

    if (entryStat.isDirectory()) {
      await copyDirectory(sourcePath, targetPath)
      continue
    }

    await mkdir(resolve(targetPath, '..'), { recursive: true })
    await copyFileWithRetry(sourcePath, targetPath)
  }
}

async function copyFileWithRetry(sourcePath: string, targetPath: string, maxAttempts = 6) {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await copyFile(sourcePath, targetPath)
      return
    } catch (error) {
      lastError = error
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
      if (!['EBUSY', 'EPERM', 'ENOENT'].includes(code) || attempt >= maxAttempts) {
        throw error
      }

      await new Promise(resolvePromise => setTimeout(resolvePromise, 80 * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to copy asset: ${sourcePath}`)
}

function createManualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, '/')

  if (!normalizedId.includes('/node_modules/')) {
    return undefined
  }

  if (
    normalizedId.includes('/echarts/') ||
    normalizedId.includes('/zrender/') ||
    normalizedId.includes('/vue-echarts/')
  ) {
    return 'charts-vendor'
  }

  if (normalizedId.includes('/oh-my-live2d/')) {
    return 'live2d-vendor'
  }

  if (
    normalizedId.includes('/@xterm/xterm/') ||
    normalizedId.includes('/@xterm/addon-fit/')
  ) {
    return 'terminal-vendor'
  }

  if (normalizedId.includes('/monaco-editor/')) {
    return 'monaco-vendor'
  }

  if (
    normalizedId.includes('/@vue/') ||
    normalizedId.includes('/vue-router/') ||
    normalizedId.includes('/pinia/')
  ) {
    return 'vue-vendor'
  }

  if (
    normalizedId.includes('/dayjs/') ||
    normalizedId.includes('/uuid/') ||
    normalizedId.includes('/fuse.js/')
  ) {
    return 'utils-vendor'
  }

  return 'vendor'
}

export default defineConfig({
  plugins: [
    vue(),
    copyRendererRuntimeAssetsPlugin(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'msedge-tts', 'node-pty', /^node-pty\//]
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ])
  ],
  optimizeDeps: {
    exclude: ['kokoro-js-zh', 'espeak-ng']
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: createManualChunks
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use "@/styles/variables" as *;`
      }
    }
  }
})
