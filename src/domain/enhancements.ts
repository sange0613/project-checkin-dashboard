import { toDateKey } from './dateRanges'
import type { AppState, RandomCategory, StageProject } from './types'

export function eligibleRandomItems(category: RandomCategory, history: AppState['dailyRandomResults'], today: string, days: number) {
  if (days <= 0) return category.items
  const start = new Date(`${today}T00:00:00`)
  start.setDate(start.getDate() - days)
  const cutoff = toDateKey(start)
  const used = new Set(Object.entries(history).filter(([date]) => date >= cutoff && date < today).map(([, results]) => results[category.id]?.itemId))
  const remaining = category.items.filter(item => !used.has(item.id))
  return remaining.length ? remaining : category.items
}

export type StageEvent = { projectId: string; name: string; label: string; at: string; action: string }
export function withStageEvent(state: AppState, before: StageProject, after: StageProject): AppState['preferences'] {
  if (before.stageIndex === after.stageIndex && Boolean(before.taskCompleted) === Boolean(after.taskCompleted)) return state.preferences ?? {}
  const event: StageEvent = { projectId: after.id, name: after.name, label: state.stageLabels[after.stageIndex] ?? '', at: new Date().toISOString(), action: after.taskCompleted ? '任务完结' : before.stageIndex !== after.stageIndex ? '进入阶段' : '重新开启' }
  return { ...state.preferences, [`stageEvent:${crypto.randomUUID()}`]: JSON.stringify(event) }
}

export function readStageEvents(state: AppState): StageEvent[] {
  return Object.entries(state.preferences ?? {}).filter(([key]) => key.startsWith('stageEvent:')).flatMap(([, value]) => {
    try { const event = JSON.parse(String(value)); return event && typeof event.at === 'string' && typeof event.name === 'string' ? [event as StageEvent] : [] } catch { return [] }
  }).sort((a, b) => b.at.localeCompare(a.at))
}
