import { createInitialState, normalizeNotDoingItems, normalizeProgressValue, normalizeStageLabels, type AppState, type RandomCategory, type RandomPromptItem } from './types'

export function createDefaultRandomCategories(): RandomCategory[] {
  return createInitialState().randomCategories
}

export function pickRandomItem(items: RandomPromptItem[], random = Math.random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

export function normalizeRandomState(state: Partial<AppState>): AppState {
  const initial = createInitialState()
  return {
    ...initial,
    ...state,
    projects: state.projects ?? initial.projects,
    checkins: state.checkins ?? initial.checkins,
    randomCategories: state.randomCategories?.length ? state.randomCategories : initial.randomCategories,
    dailyRandomResults: state.dailyRandomResults ?? {},
    notDoingItems: normalizeNotDoingItems(state.notDoingItems),
    progressTotal: normalizeProgressValue(state.progressTotal, initial.progressTotal, 1),
    progressCurrent: Math.min(
      normalizeProgressValue(state.progressCurrent, initial.progressCurrent),
      normalizeProgressValue(state.progressTotal, initial.progressTotal, 1),
    ),
    stageProjects: state.stageProjects ?? [],
    stageBoardTitle: state.stageBoardTitle ?? initial.stageBoardTitle,
    stageLabels: normalizeStageLabels(state.stageLabels),
    theme: state.theme ?? 'system',
  }
}
