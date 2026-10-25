import { describe, expect, test } from 'vitest'
import { normalizeTodoSync, mergeTodoSync, reconcileTodoSync, todoWorkspace, type TodoWorkspace } from './todoSync'

const original: TodoWorkspace = { boards: [{ id: 'b', name: '工作', columns: [{ id: 'todo', label: '待办' }, { id: 'done', label: '完成', completed: true }], tasks: [{ id: 'a', title: '任务甲', notes: '', status: 'todo', due: '' }, { id: 'b', title: '任务乙', notes: '', status: 'todo', due: '' }] }], activeBoardId: 'b' }
const edit = (change: (workspace: TodoWorkspace) => void) => { const copy = structuredClone(original); change(copy); return copy }
const stamp = { updatedAt: 100, updatedBy: 'a' }
describe('todo per-field synchronization', () => {
  test('imports all boards columns and tasks without changing IDs or contents', () => {
    const result = todoWorkspace(normalizeTodoSync(original), 'b')
    expect(result.boards[0].tasks.map(task => task.title)).toEqual(['任务甲', '任务乙'])
    expect(result.boards[0].columns[1]).toMatchObject({ id: 'done', label: '完成', completed: true })
  })
  test('merges independent edits to different fields of the same task', () => {
    const base = normalizeTodoSync(original)
    const left = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks[0].title = '电脑修改' }), stamp)
    const right = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks[0].status = 'done' }), { ...stamp, updatedBy: 'b' })
    const merged = mergeTodoSync(left, right)
    expect(todoWorkspace(merged).boards[0].tasks[0]).toMatchObject({ title: '电脑修改', status: 'done' })
    expect(mergeTodoSync(left, right)).toEqual(mergeTodoSync(right, left))
    expect(mergeTodoSync(merged, right)).toEqual(merged)
  })
  test('deletions persist when another device sends stale data or an offline edit', () => {
    const base = normalizeTodoSync(original)
    const removed = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks.shift() }), stamp)
    const offline = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks[0].title = '离线编辑' }), { updatedAt: 200, updatedBy: 'b' })
    expect(todoWorkspace(mergeTodoSync(removed, offline)).boards[0].tasks.map(t => t.id)).toEqual(['b'])
    const undo = reconcileTodoSync(removed, todoWorkspace(removed), original, { updatedAt: 300, updatedBy: 'a' })
    expect(todoWorkspace(mergeTodoSync(undo, removed)).boards[0].tasks).toHaveLength(2)
  })
  test('reconciles a saved draft over incoming updates without replacing other fields', () => {
    const base = normalizeTodoSync(original)
    const remote = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks[1].title = '远端'; w.boards[0].name = '新看板名' }), stamp)
    const local = reconcileTodoSync(remote, original, edit(w => { w.boards[0].tasks[0].notes = '未保存草稿' }), { updatedAt: 200, updatedBy: 'b' })
    expect(todoWorkspace(local).boards[0]).toMatchObject({ name: '新看板名', tasks: [{ notes: '未保存草稿' }, { title: '远端' }] })
  })
  test('keeps new tasks from both devices and makes removed columns safe', () => {
    const base = normalizeTodoSync(original)
    const left = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks.push({ id: 'c', title: '电脑新增', notes: '', status: 'todo', due: '' }) }), stamp)
    const right = reconcileTodoSync(base, original, edit(w => { w.boards[0].tasks.push({ id: 'd', title: '手机新增', notes: '', status: 'done', due: '' }) }), { updatedAt: 200, updatedBy: 'b' })
    expect(todoWorkspace(mergeTodoSync(left, right)).boards[0].tasks).toHaveLength(4)
    const withoutColumn = todoWorkspace(right)
    withoutColumn.boards[0].columns.pop()
    withoutColumn.boards[0].tasks.forEach(task => { task.status = 'todo' })
    const removedColumn = reconcileTodoSync(right, todoWorkspace(right), withoutColumn, { updatedAt: 300, updatedBy: 'a' })
    expect(todoWorkspace(mergeTodoSync(right, removedColumn)).boards[0].tasks.find(t => t.id === 'd')?.status).toBe('todo')
  })
})
