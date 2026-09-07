import { applySyncStateToAppState, createSyncStateFromAppState } from '../domain/cloudSync'
import type { AppState, SyncState } from '../domain/types'

const KEY = 'project-sync-conflicts-v1'
const groups = ['projects', 'checkins', 'randomItems', 'randomResults', 'stageProjects'] as const
type Entry = Record<string, unknown> | null
export type SyncConflict = { id: string; at: number; group: typeof groups[number] | 'settings'; key: string; local: Entry; remote: Entry }
export function readConflicts(): SyncConflict[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(entry => entry && [...groups, 'settings'].includes(entry.group) && typeof entry.id === 'string' && typeof entry.key === 'string') : []
  } catch { return [] }
}
function value(entry?: object): Entry {
  if (!entry) return null
  const { updatedAt: _at, updatedBy: _by, ...data } = entry as Record<string, unknown>
  return data
}
function equal(a: Entry, b: Entry) { return JSON.stringify(a) === JSON.stringify(b) }
export function findConflicts(base: SyncState, local: SyncState, remote: SyncState): SyncConflict[] {
  const found: SyncConflict[] = []
  for (const group of [...groups, 'settings'] as const) {
    const record = (sync: SyncState): Record<string, object> => group === 'settings' ? sync.settings : Object.fromEntries(sync[group].map(item => [item.id, item]))
    const b = record(base), l = record(local), r = record(remote)
    for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
      // These aggregate compatibility fields also have per-item versions.
      if (group === 'settings' && key === 'notDoingItems') continue
      const bv = value(b[key]), lv = value(l[key]), rv = value(r[key])
      // Missing settings in older clients mean "unknown", not deletion.
      if (group === 'settings' && (!lv || !rv)) continue
      if (!equal(lv, bv) && !equal(rv, bv) && !equal(lv, rv)) {
        found.push({ id: JSON.stringify([group, key, lv, rv]), at: Date.now(), group, key, local: lv, remote: rv })
      }
    }
  }
  return found
}
export function recordConflicts(base: SyncState, local: SyncState, remote: SyncState) {
  const found = findConflicts(base, local, remote)
  if (!found.length) return
  const previous = readConflicts()
  const all = [...found.filter(item => !previous.some(old => old.id === item.id)), ...previous].slice(0, 50)
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('recovery-updated'))
  } catch { window.dispatchEvent(new Event('recovery-storage-full')) }
}
export function dismissConflict(id: string) {
  localStorage.setItem(KEY, JSON.stringify(readConflicts().filter(item => item.id !== id)))
  window.dispatchEvent(new Event('recovery-updated'))
}
export function resolveConflict(state: AppState, conflict: SyncConflict, side: 'local' | 'remote') {
  const sync = createSyncStateFromAppState(state)
  const selected = conflict[side]
  if (conflict.group === 'settings') {
    if (selected) sync.settings[conflict.key] = { ...selected, updatedAt: 0, updatedBy: 'recovery' } as SyncState['settings'][string]
    if (selected && conflict.key === 'stageLabels' && Array.isArray(selected.value)) {
      selected.value.forEach((label, index) => { sync.settings[`stageLabel:${index}`] = { value: String(label), updatedAt: 0, updatedBy: 'recovery' } })
    }
  } else {
    const items = sync[conflict.group].filter(item => item.id !== conflict.key)
    if (selected) items.push({ ...selected, updatedAt: 0, updatedBy: 'recovery' } as never)
    Object.assign(sync, { [conflict.group]: items })
  }
  return applySyncStateToAppState(state, sync)
}
