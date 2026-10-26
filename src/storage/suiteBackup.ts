import type { AppState } from '../domain/types'
import { mergeSuiteStates, type SuiteSyncState } from '../sync/suiteSyncModel'
import { TOOL_STORAGE_KEYS, readToolValue, type ToolId } from '../sync/toolStorage'
import { exportState, importState } from './dataTransfer'

type Tools = Partial<Record<ToolId, unknown>>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
function validateTools(value: unknown): asserts value is Tools {
  if (!object(value)) throw new Error('子页面备份格式不正确')
  for (const [id, data] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(TOOL_STORAGE_KEYS, id) || !(id === 'wuwu' ? Array.isArray(data) || object(data) : object(data))) throw new Error('子页面备份格式不正确')
    if (id === 'checklist' && (!Array.isArray((data as Record<string, unknown>).templates) || !Array.isArray((data as Record<string, unknown>).projects))) throw new Error('清单备份格式不正确')
    if (id === 'text' && !Array.isArray((data as Record<string, unknown>).entries)) throw new Error('模板备份格式不正确')
    if (id === 'todo' && !object((data as Record<string, unknown>).fields) && !Array.isArray((data as Record<string, unknown>).boards)) throw new Error('待办备份格式不正确')
  }
}
export function exportFullBackup(state: AppState, storage: Storage = localStorage) {
  const tools: Tools = {}
  for (const id of Object.keys(TOOL_STORAGE_KEYS) as ToolId[]) {
    const value = readToolValue(id, storage)
    if (value !== undefined) tools[id] = value
  }
  validateTools(tools)
  return JSON.stringify({ ...JSON.parse(exportState(state)), tools }, null, 2)
}
export function parseFullBackup(content: string): { state: AppState; tools: Tools } {
  const state = importState(content)
  const tools: unknown = JSON.parse(content).tools ?? {}
  validateTools(tools)
  return { state, tools }
}
// Merge subpages conservatively: keep newer edits/deletions and add missing records.
// Only dispatch after all writes succeed, so no partial import is uploaded.
export function restoreToolBackups(tools: Tools, storage: Storage = localStorage) {
  validateTools(tools)
  const previous = new Map<string, string | null>()
  const writes = new Map<string, string>()
  for (const id of Object.keys(tools) as ToolId[]) {
    const current = readToolValue(id, storage)
    const backup: SuiteSyncState = { version: 1, apps: { [id]: { value: tools[id], updatedAt: 0, updatedBy: 'backup' } } }
    const local: SuiteSyncState = { version: 1, apps: current === undefined ? {} : { [id]: { value: current, updatedAt: 1, updatedBy: 'local' } } }
    const value = mergeSuiteStates(backup, local).apps[id]?.value
    if (value === undefined) throw new Error('子页面备份无法读取')
    const key = TOOL_STORAGE_KEYS[id]
    previous.set(key, storage.getItem(key))
    writes.set(key, JSON.stringify(value))
  }
  const changed: string[] = []
  try {
    for (const [key, value] of writes) { storage.setItem(key, value); changed.push(key) }
  } catch {
    for (const key of changed.reverse()) {
      try {
        const value = previous.get(key)
        if (value === null || value === undefined) storage.removeItem(key)
        else storage.setItem(key, value)
      } catch { /* Keep the merged records intact if storage becomes unavailable. */ }
    }
    throw new Error('存储空间不足，导入未完成，请先导出备份并释放空间。')
  }
  if (writes.size) window.dispatchEvent(new Event('suite-tools-restored'))
}
