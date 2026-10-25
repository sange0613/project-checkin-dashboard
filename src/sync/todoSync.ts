import type { VersionStamp } from '../domain/types'

export const TODO_SYNC_KEY = 'liubai-suite-sync-v1'
export const TODO_WORKSPACE_KEY = 'liubai-workspace-v2'
type Value = string | number | boolean | null | string[]
type Register = VersionStamp & { value: Value }
export type TodoSync = { version: 1; fields: Record<string, Register> }
export type TodoTask = { id: string; title: string; notes: string; status: string; due: string; sample?: boolean; createdAt?: string | null; tags?: string[]; project?: string }
export type TodoColumn = { id: string; label: string; completed?: boolean }
export type TodoBoard = { id: string; name: string; columns: TodoColumn[]; tasks: TodoTask[]; tagOptions?: string[]; projectOptions?: string[] }
export type TodoWorkspace = { boards: TodoBoard[]; activeBoardId: string }
const BASE: VersionStamp = { updatedAt: 0, updatedBy: '' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const key = (...parts: string[]) => JSON.stringify(parts)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function compare(a: Register, b: Register) {
  return a.updatedAt - b.updatedAt || a.updatedBy.localeCompare(b.updatedBy) || JSON.stringify(a.value).localeCompare(JSON.stringify(b.value))
}
function flatten(workspace: TodoWorkspace): Record<string, Value> {
  const fields: Record<string, Value> = {}
  const add = (kind: string, board: string, id: string, values: Record<string, Value>) => {
    fields[key(kind, board, id, 'exists')] = true
    for (const [field, value] of Object.entries(values)) fields[key(kind, board, id, field)] = value
  }
  workspace.boards.forEach((board, order) => {
    add('board', board.id, board.id, { name: board.name, order, tagOptions: board.tagOptions ?? [], projectOptions: board.projectOptions ?? [] })
    board.columns.forEach((column, order) => add('column', board.id, column.id, { label: column.label, completed: column.completed ?? column.id === 'done', order }))
    board.tasks.forEach((task, order) => add('task', board.id, task.id, { title: task.title, notes: task.notes, status: task.status, due: task.due, sample: task.sample === true, createdAt: task.createdAt ?? null, tags: task.tags ?? [], project: task.project ?? '', order }))
  })
  return fields
}
export function validateTodoWorkspace(value: unknown): TodoWorkspace {
  const source = object(value)
  if (!Array.isArray(source.boards) || source.boards.length > 100) throw new Error('待办看板格式不正确')
  const ids = new Set<string>()
  const boards = source.boards.map(raw => {
    const board = object(raw)
    if (typeof board.id !== 'string' || !board.id || ids.has(board.id) || typeof board.name !== 'string' || !board.name.trim() || !Array.isArray(board.columns) || !board.columns.length || board.columns.length > 30 || !Array.isArray(board.tasks) || board.tasks.length > 10000) throw new Error('待办看板格式不正确')
    ids.add(board.id)
    const cols = new Set<string>(), tasks = new Set<string>()
    for (const value of board.columns) { const col = object(value); if (typeof col.id !== 'string' || !col.id || cols.has(col.id) || typeof col.label !== 'string' || !col.label.trim()) throw new Error('待办分组格式不正确'); cols.add(col.id) }
    for (const value of board.tasks) {
      const task = object(value)
      if (typeof task.id !== 'string' || !task.id || tasks.has(task.id) || typeof task.title !== 'string' || !task.title.trim() || typeof task.notes !== 'string' || typeof task.due !== 'string' || !cols.has(String(task.status))) throw new Error('待办事项格式不正确')
      tasks.add(task.id)
      if (task.tags !== undefined && (!Array.isArray(task.tags) || !task.tags.every(v => typeof v === 'string'))) throw new Error('待办标签格式不正确')
    }
    return board as TodoBoard
  })
  return { boards, activeBoardId: typeof source.activeBoardId === 'string' && ids.has(source.activeBoardId) ? source.activeBoardId : boards[0]?.id ?? '' }
}
export function normalizeTodoSync(value: unknown, fallback: VersionStamp = BASE): TodoSync {
  const source = object(value)
  if (Array.isArray(source.boards)) {
    const workspace = validateTodoWorkspace(value)
    return { version: 1, fields: Object.fromEntries(Object.entries(flatten(workspace)).map(([key, value]) => [key, { value, ...fallback }])) }
  }
  const fields: TodoSync['fields'] = {}
  for (const [id, raw] of Object.entries(object(source.fields))) {
    let parts: unknown
    try { parts = JSON.parse(id) } catch { continue }
    if (!Array.isArray(parts) || parts.length !== 4 || !parts.every(v => typeof v === 'string') || !['board', 'column', 'task'].includes(parts[0])) continue
    const entry = object(raw), v = entry.value
    if (!(v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v) || Array.isArray(v) && v.every(item => typeof item === 'string'))) continue
    fields[id] = { value: v as Value, updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : fallback.updatedAt, updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : fallback.updatedBy }
  }
  return { version: 1, fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) }
}
export function mergeTodoSync(left: unknown, right: unknown): TodoSync {
  const a = normalizeTodoSync(left), b = normalizeTodoSync(right), fields = { ...a.fields }
  for (const [key, value] of Object.entries(b.fields)) if (!fields[key] || compare(value, fields[key]) > 0) fields[key] = value
  return { version: 1, fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) }
}
export function latestTodoTimestamp(value: TodoSync) { return Math.max(0, ...Object.values(value.fields).map(entry => entry.updatedAt)) }
export function reconcileTodoSync(base: TodoSync, before: TodoWorkspace, after: TodoWorkspace, stamp: VersionStamp): TodoSync {
  const previous = flatten(before), next = flatten(validateTodoWorkspace(after)), fields = { ...base.fields }
  const version = { ...stamp, updatedAt: Math.max(stamp.updatedAt, latestTodoTimestamp(base) + 1) }
  for (const [id, value] of Object.entries(next)) if (!same(value, previous[id])) fields[id] = { value, ...version }
  for (const id of Object.keys(previous)) if (!(id in next) && JSON.parse(id)[3] === 'exists') fields[id] = { value: false, ...version }
  return { version: 1, fields }
}
export function todoWorkspace(value: TodoSync, activeBoardId = ''): TodoWorkspace {
  const entities = new Map<string, Record<string, Value>>()
  for (const [raw, field] of Object.entries(value.fields)) {
    const [kind, board, id, name] = JSON.parse(raw) as string[]
    const entityKey = key(kind, board, id)
    const entity = entities.get(entityKey) ?? {}
    entity[name] = field.value
    entities.set(entityKey, entity)
  }
  const list = (kind: string, board?: string) => [...entities].flatMap(([raw, fields]) => {
    const [k, b, id] = JSON.parse(raw) as string[]
    return k === kind && (!board || b === board) && fields.exists === true ? [{ id, fields }] : []
  }).sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0) || a.id.localeCompare(b.id))
  const boards: TodoBoard[] = list('board').map(({ id, fields }) => {
    const columns: TodoColumn[] = list('column', id).map(({ id, fields }) => ({ id, label: String(fields.label || '待办'), completed: fields.completed === true }))
    if (!columns.length) columns.push({ id: 'todo', label: '待办', completed: false })
    const tasks: TodoTask[] = list('task', id).filter(({ fields }) => typeof fields.title === 'string' && fields.title.trim()).map(({ id, fields: f }) => ({ id, title: String(f.title), notes: String(f.notes ?? ''), status: columns.some(c => c.id === f.status) ? String(f.status) : columns[0].id, due: String(f.due ?? ''), sample: f.sample === true, createdAt: typeof f.createdAt === 'string' ? f.createdAt : null, tags: Array.isArray(f.tags) ? f.tags : [], project: String(f.project ?? '') }))
    return { id, name: String(fields.name || '我的看板'), columns, tasks, tagOptions: Array.isArray(fields.tagOptions) ? fields.tagOptions : [], projectOptions: Array.isArray(fields.projectOptions) ? fields.projectOptions : [] }
  })
  return { boards, activeBoardId: boards.some(b => b.id === activeBoardId) ? activeBoardId : boards[0]?.id ?? '' }
}
