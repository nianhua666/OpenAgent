// 数据持久化工具 - 通过 Electron IPC 读写 JSON 文件
// 开发环境下若无 Electron 环境，退回 localStorage

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

function toSerializableData<T>(data: T): T {
  if (typeof data === 'undefined') {
    return data
  }

  return JSON.parse(JSON.stringify(data)) as T
}

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try {
    if (isElectron) {
      const data = await window.electronAPI.storeGet(key)
      return data ?? fallback
    }
    // 开发环境回退到 localStorage
    const raw = localStorage.getItem(`am_${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export async function saveData<T>(key: string, data: T): Promise<void> {
  try {
    const serialized = toSerializableData(data)
    if (isElectron) {
      await window.electronAPI.storeSet(key, serialized)
    } else {
      localStorage.setItem(`am_${key}`, JSON.stringify(serialized))
    }
  } catch (err) {
    console.error(`[DB] 保存数据失败: ${key}`, err)
  }
}

export async function exportJsonFile(name: string, data: unknown): Promise<boolean> {
  if (isElectron) {
    return window.electronAPI.exportJson(name, data)
  }
  // Web 环境下载
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export async function importJsonFile(): Promise<any> {
  if (isElectron) {
    return window.electronAPI.importJson()
  }
  // Web 环境文件选择
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result as string))
        } catch {
          resolve(null)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}
