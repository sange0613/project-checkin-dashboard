import type { AppState, Project, StageProject } from '../domain/types'
import { latestTodoTimestamp, normalizeTodoSync, reconcileTodoSync, todoWorkspace, TODO_SYNC_KEY, type TodoBoard, type TodoTask } from '../sync/todoSync'

const KEY = 'project-recycle-bin-v1'
const RETENTION = 30 * 86400000
export type RecycleEntry = { id: string; at: number; name: string } & (
  { kind: 'project'; project: Project; checkins: string[] } |
  { kind: 'stage'; project: StageProject } |
  { kind: 'todo'; board: TodoBoard; task: TodoTask }
)
export function readRecycleBin(): RecycleEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(entry => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.at > Date.now() - RETENTION && (entry.kind === 'todo' ? entry.board?.columns?.length && entry.task?.id : ['project', 'stage'].includes(entry.kind) && entry.project?.id)).slice(0, 100) : []
  } catch { return [] }
}
function write(entries: RecycleEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 100)))
    queueMicrotask(() => window.dispatchEvent(new Event('recycle-updated')))
    return true
  } catch { queueMicrotask(() => window.dispatchEvent(new Event('checkin-storage-error'))); return false }
}
function remember(entries: RecycleEntry[]) {
  if (!entries.length) return true
  const old = readRecycleBin(), known = new Set(old.map(entry => entry.id))
  const added = entries.filter(entry => !known.has(entry.id))
  return !added.length || write([...added, ...old])
}
export function captureProjectRemovals(before: AppState, after: AppState) {
  const entries: RecycleEntry[] = []
  const projects = new Set(after.projects.map(project => project.id)), stages = new Set(after.stageProjects.map(project => project.id))
  for (const project of before.projects) if (!projects.has(project.id)) entries.push({ id: `project:${project.id}`, kind: 'project', name: project.name, at: Date.now(), project, checkins: before.checkins[project.id] ?? [] })
  for (const project of before.stageProjects) if (!stages.has(project.id)) entries.push({ id: `stage:${project.id}`, kind: 'stage', name: project.name, at: Date.now(), project })
  return remember(entries)
}
export function captureTodoRemovals(beforeValue: unknown, afterValue: unknown) {
  const before = todoWorkspace(normalizeTodoSync(beforeValue)), after = todoWorkspace(normalizeTodoSync(afterValue))
  const remaining = new Set(after.boards.flatMap(board => board.tasks.map(task => JSON.stringify([board.id, task.id]))))
  return remember(before.boards.flatMap(board => board.tasks.filter(task => !remaining.has(JSON.stringify([board.id, task.id]))).map(task => ({ id: JSON.stringify(['todo', board.id, task.id]), kind: 'todo' as const, name: task.title, at: Date.now(), board: { ...board, tasks: [] }, task }))))
}
export function dismissRecycled(id: string) { return write(readRecycleBin().filter(entry => entry.id !== id)) }
export function restoreRecycledProject(state: AppState, entry: RecycleEntry): AppState {
  if (entry.kind === 'project') return state.projects.some(project => project.id === entry.project.id) ? state : { ...state, projects: [...state.projects, entry.project], checkins: { ...state.checkins, [entry.project.id]: [...new Set([...(state.checkins[entry.project.id] ?? []), ...entry.checkins])] } }
  if (entry.kind === 'stage') return state.stageProjects.some(project => project.id === entry.project.id) ? state : { ...state, stageProjects: [...state.stageProjects, entry.project] }
  return state
}
export function restoreRecycledTodo(entry: RecycleEntry) {
  if (entry.kind !== 'todo') return
  const base = normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY) ?? 'null'))
  const before = todoWorkspace(base), after = structuredClone(before)
  let board = after.boards.find(board => board.id === entry.board.id)
  if (!board) { board = { ...structuredClone(entry.board), tasks: [] }; after.boards.push(board) }
  if (!board.tasks.some(task => task.id === entry.task.id)) {
    if (!board.columns.some(column => column.id === entry.task.status)) board.columns.push(structuredClone(entry.board.columns.find(column => column.id === entry.task.status) ?? { id: entry.task.status, label: '恢复事项' }))
    board.tasks.push(structuredClone(entry.task))
    const value = reconcileTodoSync(base, before, after, { updatedAt: Math.max(Date.now(), latestTodoTimestamp(base) + 1), updatedBy: localStorage.getItem('project-suite-device-id-v1') ?? 'recycle-restore' })
    localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(value))
    window.dispatchEvent(new Event('suite-tools-restored'))
  }
  dismissRecycled(entry.id)
}
