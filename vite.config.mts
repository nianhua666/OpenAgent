import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
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
    closeBundle() {
      const targetDir = resolve(projectRoot, 'dist', 'assets')
      mkdirSync(targetDir, { recursive: true })

      for (const asset of rendererRuntimeAssets) {
        if (!existsSync(asset.source)) {
          continue
        }

        copyFileSync(asset.source, resolve(targetDir, asset.target))
      }

      for (const asset of bundledTTSAssets) {
        if (!existsSync(asset.source)) {
          continue
        }

        copyDirectorySync(asset.source, asset.target)
      }
    }
  }
}

function copyDirectorySync(sourceDir: string, targetDir: string) {
  mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry)
    const targetPath = resolve(targetDir, entry)
    const entryStat = statSync(sourcePath)

    if (entryStat.isDirectory()) {
      copyDirectorySync(sourcePath, targetPath)
      continue
    }

    mkdirSync(resolve(targetPath, '..'), { recursive: true })
    copyFileSync(sourcePath, targetPath)
  }
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
              external: ['electron']
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