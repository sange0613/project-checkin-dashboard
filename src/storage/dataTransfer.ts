import type { AppState, ViewMode } from '../domain/types'
import { normalizeRandomState } from '../domain/randomPrompts'

type BackupEnvelope = {
  version: 1
  exportedAt: string
  state: AppState
}

const views: ViewMode[] = ['day', 'week', 'month']

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  return (
    typeof state.title === 'string' &&
    typeof state.anchorDate === 'string' &&
    views.includes(state.view as ViewMode) &&
    Array.isArray(state.projects) &&
    state.projects.every((project) =>
      project &&
      typeof project.id === 'string' &&
      typeof project.name === 'string' &&
      typeof project.createdAt === 'string' &&
      typeof project.archived === 'boolean',
    ) &&
    !!state.checkins &&
    typeof state.checkins === 'object' &&
    Object.values(state.checkins).every((dates) =>
      Array.isArray(dates) && dates.every((date) => typeof date === 'string'),
    )
  )
}

export function exportState(state: AppState) {
  const backup: BackupEnvelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  }
  return JSON.stringify(backup, null, 2)
}

export function importState(content: string): AppState {
  try {
    const backup = JSON.parse(content) as Partial<BackupEnvelope>
    if (backup.version !== 1 || !isAppState(backup.state)) throw new Error()
    return normalizeRandomState(backup.state)
  } catch {
    throw new Error('备份文件格式不正确')
  }
}
