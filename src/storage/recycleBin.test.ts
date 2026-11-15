import { createInitialState } from '../domain/types'
import { mergeTodoSync, normalizeTodoSync, reconcileTodoSync, todoWorkspace, TODO_SYNC_KEY } from '../sync/todoSync'
import { captureProjectRemovals, captureTodoRemovals, dismissRecycled, readRecycleBin, restoreRecycledProject, restoreRecycledTodo } from './recycleBin'

beforeEach(() => localStorage.clear())
const workspace = () => ({ boards: [{ id: 'board', name: '看板', columns: [{ id: 'todo', label: '待办' }], tasks: [{ id: 'a', title: '甲事项', notes: '备注', due: '', status: 'todo' }, { id: 'b', title: '乙事项', notes: '', due: '', status: 'todo' }] }], activeBoardId: 'board' })

test('restores only the deleted project and its checkins, not an entire historical dashboard', () => {
  const before = createInitialState()
  before.projects = [{ id: 'a', name: '甲', archived: false, createdAt: '' }, { id: 'b', name: '乙', archived: false, createdAt: '' }]
  before.checkins = { a: ['2026-11-15'], b: [] }
  const after = { ...before, title: '保留新标题', projects: [before.projects[1]], checkins: { b: ['2026-11-15'] } }
  expect(captureProjectRemovals(before, after)).toBe(true)
  const entry = readRecycleBin()[0]
  const restored = restoreRecycledProject(after, entry)
  expect(restored.title).toBe('保留新标题')
  expect(restored.checkins).toEqual({ a: ['2026-11-15'], b: ['2026-11-15'] })
  expect(restored.projects).toHaveLength(2)
  expect(restoreRecycledProject(restored, entry)).toBe(restored)
})

test('retains design project details and deduplicates repeated deletion notifications', () => {
  const before = createInitialState()
  before.stageProjects = [{ id: 's', name: '设计项目', stageIndex: 3, createdAt: '', note: '保留备注', taskCompleted: true }]
  const after = { ...before, stageProjects: [] }
  captureProjectRemovals(before, after)
  captureProjectRemovals(before, after)
  expect(readRecycleBin()).toHaveLength(1)
  expect(restoreRecycledProject(after, readRecycleBin()[0]).stageProjects).toEqual(before.stageProjects)
  dismissRecycled(readRecycleBin()[0].id)
  expect(readRecycleBin()).toEqual([])
})

test('restores one todo with a newer stamp without reverting unrelated edits or duplicating tasks', () => {
  const before = workspace(), after = workspace()
  after.boards[0].tasks.shift()
  const base = normalizeTodoSync(before)
  const removed = reconcileTodoSync(base, before, after, { updatedAt: Date.now() + 100000, updatedBy: 'remote' })
  captureTodoRemovals(base, removed)
  localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(removed))
  const entry = readRecycleBin()[0]
  restoreRecycledTodo(entry)
  const restored = normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY)!))
  const merged = todoWorkspace(mergeTodoSync(restored, removed))
  expect(merged.boards[0].tasks.map(task => task.title).sort()).toEqual(['乙事项', '甲事项'].sort())
  expect(merged.boards[0].tasks.find(task => task.id === 'a')?.notes).toBe('备注')
  restoreRecycledTodo(entry)
  expect(todoWorkspace(normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY)!))).boards[0].tasks).toHaveLength(2)
  expect(readRecycleBin()).toEqual([])
})

test('can restore a single task after its whole board was deleted', () => {
  const base = normalizeTodoSync(workspace())
  const removed = reconcileTodoSync(base, workspace(), { boards: [], activeBoardId: '' }, { updatedAt: 100, updatedBy: 'device' })
  captureTodoRemovals(base, removed)
  localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(removed))
  restoreRecycledTodo(readRecycleBin()[0])
  const after = todoWorkspace(normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY)!)))
  expect(after.boards[0].columns[0].label).toBe('待办')
  expect(after.boards[0].tasks).toHaveLength(1)
  expect(readRecycleBin()).toHaveLength(1)
})

test('does not offer entries older than thirty days and handles corrupt storage safely', () => {
  localStorage.setItem('project-recycle-bin-v1', '{invalid')
  expect(readRecycleBin()).toEqual([])
  const before = createInitialState()
  before.projects = [{ id: 'a', name: '甲', archived: false, createdAt: '' }]
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 31 * 86400000)
  captureProjectRemovals(before, { ...before, projects: [] })
  clock.mockRestore()
  expect(readRecycleBin()).toEqual([])
})

test('reports a failed recycle write so local deletion can be cancelled', () => {
  const before = createInitialState()
  before.projects = [{ id: 'a', name: '甲', archived: false, createdAt: '' }]
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  try { expect(captureProjectRemovals(before, { ...before, projects: [] })).toBe(false) }
  finally { spy.mockRestore() }
})
