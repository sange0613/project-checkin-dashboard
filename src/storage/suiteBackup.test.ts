import { createInitialState } from '../domain/types'
import { normalizeTodoSync, todoWorkspace } from '../sync/todoSync'
import { TOOL_STORAGE_KEYS } from '../sync/toolStorage'
import { exportState } from './dataTransfer'
import { exportFullBackup, parseFullBackup, restoreToolBackups } from './suiteBackup'

beforeEach(() => localStorage.clear())
const workspace = (id: string) => ({ boards: [{ id, name: id, columns: [{ id: 'todo', label: '待办' }], tasks: [{ id, title: id, notes: '', due: '', status: 'todo' }] }], activeBoardId: id })

test('exports all six subpages and imports without sync codes or device credentials', () => {
  const tools = { daily: { settings: {}, days: {} }, checklist: { templates: [], projects: [] }, wuwu: [{ id: 'chair' }], time: { '2026-10-26': [] }, text: { version: 1, entries: [] }, todo: normalizeTodoSync(workspace('original')) }
  for (const id of Object.keys(tools) as (keyof typeof tools)[]) localStorage.setItem(TOOL_STORAGE_KEYS[id], JSON.stringify(tools[id]))
  localStorage.setItem('project-suite-sync-code-v1', 'PRIVATECODE123456')
  const content = exportFullBackup(createInitialState())
  expect(content).not.toContain('PRIVATECODE123456')
  expect(parseFullBackup(content).tools).toEqual(tools)
})

test('supports the previous dashboard-only backup', () => {
  const state = createInitialState()
  expect(parseFullBackup(exportState(state))).toEqual({ state, tools: {} })
})

test.each([{ unknown: {} }, { todo: [] }, { checklist: { templates: null, projects: [] } }, { text: { entries: null } }, { todo: {} }])('rejects malformed subpage backups: %j', tools => {
  expect(() => parseFullBackup(JSON.stringify({ version: 1, state: createInitialState(), tools }))).toThrow(/备份格式/)
})

test('merges imported todo and time history without removing existing records or changing the code', () => {
  localStorage.setItem(TOOL_STORAGE_KEYS.todo, JSON.stringify(normalizeTodoSync(workspace('current'))))
  localStorage.setItem(TOOL_STORAGE_KEYS.time, JSON.stringify({ '2026-10-25': [] }))
  localStorage.setItem('project-suite-sync-code-v1', 'ORIGINALCODE123')
  const changed = vi.fn()
  window.addEventListener('suite-tools-restored', changed)
  try {
    restoreToolBackups({ todo: normalizeTodoSync(workspace('imported')), time: { '2026-10-26': [] } })
    const restored = todoWorkspace(normalizeTodoSync(JSON.parse(localStorage.getItem(TOOL_STORAGE_KEYS.todo)!)))
    expect(restored.boards.map(board => board.id).sort()).toEqual(['current', 'imported'])
    expect(JSON.parse(localStorage.getItem(TOOL_STORAGE_KEYS.time)!).days).toEqual({ '2026-10-25': [], '2026-10-26': [] })
    expect(localStorage.getItem('project-suite-sync-code-v1')).toBe('ORIGINALCODE123')
    expect(changed).toHaveBeenCalledTimes(1)
  } finally { window.removeEventListener('suite-tools-restored', changed) }
})

test('keeps newer deletion markers rather than reviving removed templates', () => {
  const entry = (updatedAt: number, deleted: boolean) => ({ id: 'a', updatedAt, updatedBy: 'device', deleted, record: { id: 'a' } })
  localStorage.setItem(TOOL_STORAGE_KEYS.text, JSON.stringify({ version: 1, entries: [entry(20, true)] }))
  restoreToolBackups({ text: { version: 1, entries: [entry(10, false)] } })
  expect(JSON.parse(localStorage.getItem(TOOL_STORAGE_KEYS.text)!).entries[0].deleted).toBe(true)
})

test('rolls back earlier subpage writes and emits no upload notification if storage is full', () => {
  const before = JSON.stringify({ settings: {}, days: {} })
  localStorage.setItem(TOOL_STORAGE_KEYS.daily, before)
  const original = Storage.prototype.setItem
  const changed = vi.fn()
  window.addEventListener('suite-tools-restored', changed)
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
    if (key === TOOL_STORAGE_KEYS.wuwu) throw new DOMException('full', 'QuotaExceededError')
    original.call(this, key, value)
  })
  try {
    expect(() => restoreToolBackups({ daily: { settings: {}, days: {} }, wuwu: [] })).toThrow('存储空间不足')
    expect(localStorage.getItem(TOOL_STORAGE_KEYS.daily)).toBe(before)
    expect(localStorage.getItem(TOOL_STORAGE_KEYS.wuwu)).toBeNull()
    expect(changed).not.toHaveBeenCalled()
  } finally { spy.mockRestore(); window.removeEventListener('suite-tools-restored', changed) }
})
