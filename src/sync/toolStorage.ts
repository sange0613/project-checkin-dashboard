import type { SuiteAppId } from './suiteSyncModel'

export type ToolId = Exclude<SuiteAppId, 'dashboard'>
export const TOOL_STORAGE_KEYS: Record<ToolId, string> = {
  daily: 'calorie-tracker-v1', checklist: 'qingdan-app-state-v2', wuwu: 'daily-cost-items-v2',
  time: 'time-noticed.v1', text: 'zijian-layout-library-sync-v1', todo: 'liubai-suite-sync-v1',
}
export function readToolValue(id: ToolId, storage: Storage = localStorage): unknown | undefined {
  const raw = storage.getItem(TOOL_STORAGE_KEYS[id])
  if (raw) return JSON.parse(raw)
  if (id === 'text') {
    const records = JSON.parse(storage.getItem('zijian-saved-layout-records-v1') ?? 'null')
    if (Array.isArray(records) && records.length) return { version: 1, entries: records.map(record => ({ id: record.id, record, updatedAt: record.savedAt ?? 0, updatedBy: 'legacy-zijian' })) }
  }
  return undefined
}
