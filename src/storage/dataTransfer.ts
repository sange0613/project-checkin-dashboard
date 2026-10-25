import type { AppState, ViewMode } from '../domain/types'
import { normalizeRandomState } from '../domain/randomPrompts'

type BackupEnvelope = {
  version: 1
  exportedAt: string
  state: AppState
}

const views: ViewMode[] = ['day', 'week', 'month']
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
function dateKey(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function validExtras(state: Partial<AppState>) {
  if (state.stageProjects !== undefined && (!Array.isArray(state.stageProjects) || !state.stageProjects.every(project =>
    record(project) && typeof project.id === 'string' && typeof project.name === 'string' && typeof project.createdAt === 'string' && (!project.createdAt || Number.isFinite(Date.parse(project.createdAt))) &&
    Number.isInteger(project.stageIndex) && project.stageIndex >= 0 && project.stageIndex < 30 &&
    (['designStart', 'designEnd', 'taskStart', 'taskEnd'] as const).every(key => !project[key] || dateKey(project[key])) &&
    (['client', 'location', 'note', 'modifiedAt'] as const).every(key => project[key] === undefined || typeof project[key] === 'string') &&
    (project.taskCompleted === undefined || typeof project.taskCompleted === 'boolean'),
  ))) return false
  if (state.randomCategories !== undefined && (!Array.isArray(state.randomCategories) || !state.randomCategories.every(category =>
    record(category) && ['fitness', 'modeling', 'mind'].includes(category.id) && typeof category.name === 'string' &&
    Array.isArray(category.items) && category.items.every(item => record(item) && typeof item.id === 'string' && typeof item.name === 'string'),
  ))) return false
  if (state.dailyRandomResults !== undefined && (!record(state.dailyRandomResults) || !Object.entries(state.dailyRandomResults).every(([date, results]) =>
    dateKey(date) && record(results) && Object.entries(results).every(([id, result]) => ['fitness', 'modeling', 'mind'].includes(id) && record(result) && typeof result.itemId === 'string' && typeof result.name === 'string'),
  ))) return false
  if (state.stageLabels !== undefined && !strings(state.stageLabels)) return false
  if (state.notDoingItems !== undefined && !strings(state.notDoingItems)) return false
  if (state.shortcutConfig !== undefined && !strings(state.shortcutConfig)) return false
  if (state.stageBoardTitle !== undefined && typeof state.stageBoardTitle !== 'string') return false
  if (state.theme !== undefined && !['system', 'light', 'dark'].includes(state.theme)) return false
  if (state.preferences !== undefined && (!record(state.preferences) || !Object.values(state.preferences).every(value =>
    typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || strings(value),
  ))) return false
  return ['progressCurrent', 'progressTotal'].every(key => state[key as keyof AppState] === undefined || typeof state[key as keyof AppState] === 'number' && Number.isFinite(state[key as keyof AppState]))
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  return (
    typeof state.title === 'string' &&
    typeof state.anchorDate === 'string' && Number.isFinite(Date.parse(state.anchorDate)) &&
    views.includes(state.view as ViewMode) &&
    Array.isArray(state.projects) &&
    state.projects.every((project) =>
      project &&
      typeof project.id === 'string' &&
      typeof project.name === 'string' &&
      typeof project.createdAt === 'string' &&
      typeof project.archived === 'boolean',
    ) &&
    new Set(state.projects.map(project => project.id)).size === state.projects.length &&
    !!state.checkins &&
    typeof state.checkins === 'object' &&
    Object.values(state.checkins).every((dates) =>
      Array.isArray(dates) && dates.every(dateKey),
    ) && validExtras(state)
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
