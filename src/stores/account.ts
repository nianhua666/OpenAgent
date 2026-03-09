import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Account, ImportBatch, ExportBatch } from '@/types'
import { loadData, saveData } from '@/utils/db'
import { genId } from '@/utils/helpers'

let electronAccountStoreSyncBound = false

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const importBatches = ref<ImportBatch[]>([])
  const exportBatches = ref<ExportBatch[]>([])
  const loaded = ref(false)

  function applyAccountsSnapshot(snapshot: Account[] | null | undefined) {
    accounts.value = Array.isArray(snapshot) ? snapshot : []
  }

  function applyImportBatchesSnapshot(snapshot: ImportBatch[] | null | undefined) {
    importBatches.value = Array.isArray(snapshot) ? snapshot : []
  }

  function applyExportBatchesSnapshot(snapshot: ExportBatch[] | null | undefined) {
    exportBatches.value = Array.isArray(snapshot) ? snapshot : []
  }

  function bindElectronAccountSync() {
    if (electronAccountStoreSyncBound || !window.electronAPI?.onStoreChanged) {
      return
    }

    electronAccountStoreSyncBound = true
    window.electronAPI.onStoreChanged((key, data) => {
      if (key === 'accounts') {
        applyAccountsSnapshot(data as Account[])
        return
      }

      if (key === 'importBatches') {
        applyImportBatchesSnapshot(data as ImportBatch[])
        return
      }

      if (key === 'exportBatches') {
        applyExportBatchesSnapshot(data as ExportBatch[])
      }
    })
  }

  async function init() {
    applyAccountsSnapshot(await loadData<Account[]>('accounts', []))
    applyImportBatchesSnapshot(await loadData<ImportBatch[]>('importBatches', []))
    applyExportBatchesSnapshot(await loadData<ExportBatch[]>('exportBatches', []))
    bindElectronAccountSync()
    loaded.value = true
  }

  async function saveAll() {
    await Promise.all([
      saveData('accounts', accounts.value),
      saveData('importBatches', importBatches.value),
      saveData('exportBatches', exportBatches.value)
    ])
  }

  /** 批量导入账号 */
  async function importAccounts(
    typeId: string,
    accountDataList: Record<string, string>[],
    source: string,
    totalCost: number
  ): Promise<ImportBatch> {
    const batchId = genId()
    const now = Date.now()
    const costPerAccount = accountDataList.length > 0 ? totalCost / accountDataList.length : 0

    const newAccounts: Account[] = accountDataList.map(data => ({
      id: genId(),
      typeId,
      data,
      notes: '',
      source,
      cost: Math.round(costPerAccount * 100) / 100,
      status: 'in_stock' as const,
      importTime: now,
      importBatchId: batchId
    }))

    const batch: ImportBatch = {
      id: batchId,
      typeId,
      source,
      totalCost,
      count: newAccounts.length,
      time: now
    }

    accounts.value.push(...newAccounts)
    importBatches.value.push(batch)
    await saveAll()
    return batch
  }

  /** 批量导出（标记为已导出） */
  async function exportAccounts(
    typeId: string,
    accountIds: string[],
    destination: string,
    totalProfit: number
  ): Promise<ExportBatch> {
    const batchId = genId()
    const now = Date.now()
    const exportableAccounts = accounts.value.filter(account =>
      account.typeId === typeId &&
      account.status === 'in_stock' &&
      accountIds.includes(account.id)
    )

    if (exportableAccounts.length === 0) {
      throw new Error('没有可导出的在库账号')
    }

    const profitPerAccount = totalProfit / exportableAccounts.length

    exportableAccounts.forEach(account => {
      account.status = 'exported'
      account.exportRecord = {
        destination,
        profit: Math.round(profitPerAccount * 100) / 100,
        exportTime: now,
        exportBatchId: batchId
      }
    })

    const batch: ExportBatch = {
      id: batchId,
      typeId,
      destination,
      totalProfit,
      count: exportableAccounts.length,
      accountIds: exportableAccounts.map(account => account.id),
      time: now
    }

    exportBatches.value.push(batch)
    await saveAll()
    return batch
  }

  /** 更新单个账号备注 */
  async function updateNote(accountId: string, notes: string) {
    const acc = accounts.value.find(a => a.id === accountId)
    if (acc) {
      acc.notes = notes
      await saveData('accounts', accounts.value)
    }
  }

  /** 删除账号 */
  async function deleteAccounts(ids: string[]) {
    const idSet = new Set(ids)
    accounts.value = accounts.value.filter(a => !idSet.has(a.id))
    await saveData('accounts', accounts.value)
  }

  /** 删除类型时同步清理批次记录，避免记录页残留脏数据 */
  async function removeTypeData(typeId: string) {
    accounts.value = accounts.value.filter(account => account.typeId !== typeId)
    importBatches.value = importBatches.value.filter(batch => batch.typeId !== typeId)
    exportBatches.value = exportBatches.value.filter(batch => batch.typeId !== typeId)
    await saveAll()
  }

  /** 获取某类型的账号列表 */
  function getByType(typeId: string): Account[] {
    return accounts.value.filter(a => a.typeId === typeId)
  }

  /** 获取某类型的在库账号 */
  function getInStockByType(typeId: string): Account[] {
    return accounts.value.filter(a => a.typeId === typeId && a.status === 'in_stock')
  }

  // 加载所有数据（用于 JSON 导出）
  function getAllData() {
    return {
      accounts: accounts.value,
      importBatches: importBatches.value,
      exportBatches: exportBatches.value
    }
  }

  // 导入所有数据（从 JSON 恢复）
  async function setAllData(data: {
    accounts: Account[]
    importBatches: ImportBatch[]
    exportBatches: ExportBatch[]
  }) {
    accounts.value = data.accounts || []
    importBatches.value = data.importBatches || []
    exportBatches.value = data.exportBatches || []
    await saveAll()
  }

  // 获取某类型的导入批次
  function getImportBatchesByType(typeId: string): ImportBatch[] {
    return importBatches.value.filter(b => b.typeId === typeId)
  }

  // 获取某类型的导出批次
  function getExportBatchesByType(typeId: string): ExportBatch[] {
    return exportBatches.value.filter(b => b.typeId === typeId)
  }

  return {
    accounts,
    importBatches,
    exportBatches,
    loaded,
    init,
    saveAll,
    importAccounts,
    exportAccounts,
    updateNote,
    deleteAccounts,
    removeTypeData,
    getByType,
    getInStockByType,
    getAllData,
    setAllData,
    getImportBatchesByType,
    getExportBatchesByType
  }
})
