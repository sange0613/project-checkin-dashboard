import type { AppState } from '../domain/types'

const KEY = 'project-recovery-v1'
export type RecoveryEntry = { id: string; at: number; reason: string; state: AppState }
export function readRecovery(): RecoveryEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(entry => entry?.state && Array.isArray(entry.state.projects) && typeof entry.at === 'number').slice(0, 10) : []
  } catch { return [] }
}
function content(state: AppState) {
  const { view: _view, anchorDate: _anchor, ...data } = state
  return JSON.stringify(data)
}
export function saveRecovery(state: AppState, reason: string) {
  const entries = readRecovery()
  if (entries[0] && content(entries[0].state) === content(state)) return
  // Keep the start of an editing burst, rather than ten consecutive keystrokes.
  if (reason === '修改前' && entries[0]?.reason === reason && Date.now() - entries[0].at < 60_000) return
  const entry = { id: crypto.randomUUID(), at: Date.now(), reason, state }
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...entries].slice(0, 10)))
    queueMicrotask(() => window.dispatchEvent(new Event('recovery-updated')))
  } catch {
    queueMicrotask(() => window.dispatchEvent(new Event('recovery-storage-full')))
  }
}
