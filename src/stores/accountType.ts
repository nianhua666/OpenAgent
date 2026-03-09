import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AccountType } from '@/types'
import { loadData, saveData } from '@/utils/db'
import { genId } from '@/utils/helpers'

let electronAccountTypeSyncBound = false

export const useAccountTypeStore = defineStore('accountType', () => {
  const types = ref<AccountType[]>([])
  const loaded = ref(false)

  function applyTypesSnapshot(snapshot: AccountType[] | null | undefined) {
    types.value = Array.isArray(snapshot) ? snapshot : []
  }

  function bindElectronTypeSync() {
    if (electronAccountTypeSyncBound || !window.electronAPI?.onStoreChanged) {
      return
    }

    electronAccountTypeSyncBound = true
    window.electronAPI.onStoreChanged((key, data) => {
      if (key === 'accountTypes') {
        applyTypesSnapshot(data as AccountType[])
      }
    })
  }

  async function init() {
    applyTypesSnapshot(await loadData<AccountType[]>('accountTypes', []))
    bindElectronTypeSync()
    loaded.value = true
  }

  async function save() {
    await saveData('accountTypes', types.value)
  }

  async function addType(data: Omit<AccountType, 'id' | 'createdAt' | 'updatedAt'>): Promise<AccountType> {
    const now = Date.now()
    const type: AccountType = {
      ...data,
      id: genId(),
      createdAt: now,
      updatedAt: now
    }
    types.value.push(type)
    await save()
    return type
  }

  async function updateType(id: string, data: Partial<AccountType>) {
    const idx = types.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      types.value[idx] = { ...types.value[idx], ...data, updatedAt: Date.now() }
      await save()
    }
  }

  async function removeType(id: string) {
    types.value = types.value.filter(t => t.id !== id)
    await save()
  }

  function getType(id: string): AccountType | undefined {
    return types.value.find(t => t.id === id)
  }

  const typeList = computed(() => types.value)
  const typeCount = computed(() => types.value.length)

  return {
    types,
    loaded,
    typeList,
    typeCount,
    init,
    save,
    addType,
    updateType,
    removeType,
    getType
  }
})
