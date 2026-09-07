import { createInitialState } from './types'
import { eligibleRandomItems, readStageEvents, withStageEvent } from './enhancements'
import { applySyncStateToAppState, createSyncStateFromAppState, mergeSyncStates } from './cloudSync'
import { findConflicts, resolveConflict } from '../storage/syncConflicts'
import { readRecovery, saveRecovery } from '../storage/recovery'

beforeEach(() => localStorage.clear())
test('avoids recent random items and falls back when all were used', () => {
  const category = createInitialState().randomCategories[0]
  const history = { '2026-09-06': { fitness: { itemId: category.items[0].id, name: category.items[0].name } } }
  expect(eligibleRandomItems(category, history, '2026-09-07', 7)).toHaveLength(2)
  expect(eligibleRandomItems(category, history, '2026-09-07', 0)).toHaveLength(3)
  expect(eligibleRandomItems({ ...category, items: category.items.slice(0, 1) }, history, '2026-09-07', 7)).toHaveLength(1)
})
test('stores ten recoverable snapshots without view-only duplicates', () => {
  const initial = createInitialState()
  for (let i = 0; i < 12; i++) saveRecovery({ ...initial, title: String(i) }, 'test')
  expect(readRecovery()).toHaveLength(10)
  saveRecovery({ ...initial, title: '11', view: 'week' }, 'test')
  expect(readRecovery()).toHaveLength(10)
  expect(readRecovery()[0].state.title).toBe('11')
})
test('independent preferences merge across devices including false values', () => {
  const initial = createInitialState()
  const left = createSyncStateFromAppState({ ...initial, preferences: { 'pin:a': true, randomAvoidDays: 7 } })
  const right = createSyncStateFromAppState({ ...initial, preferences: { 'pin:b': false } })
  expect(applySyncStateToAppState(initial, mergeSyncStates(left, right)).preferences).toEqual({ 'pin:a': true, 'pin:b': false, randomAvoidDays: 7 })
})
test('records task completion and synchronizes stage history', () => {
  const initial = createInitialState()
  const project = { id: 'a', name: '住宅', stageIndex: 1, createdAt: '' }
  const preferences = withStageEvent(initial, project, { ...project, taskCompleted: true })
  const restored = applySyncStateToAppState(initial, createSyncStateFromAppState({ ...initial, preferences }))
  expect(readStageEvents(restored)[0]).toMatchObject({ name: '住宅', action: '任务完结', label: '设计定金' })
})
test('detects same-field conflicts and restores chosen value without touching other fields', () => {
  const initial = createInitialState()
  const base = createSyncStateFromAppState(initial)
  const local = createSyncStateFromAppState({ ...initial, title: '本机' })
  const remote = createSyncStateFromAppState({ ...initial, title: '另一台' })
  const conflicts = findConflicts(base, local, remote)
  expect(conflicts).toHaveLength(1)
  expect(resolveConflict({ ...initial, title: '本机', progressCurrent: 42 }, conflicts[0], 'remote')).toMatchObject({ title: '另一台', progressCurrent: 42 })
  expect(findConflicts(base, base, remote)).toHaveLength(0)
})
test('preserves deletion versus editing as a resolvable conflict', () => {
  const initial = { ...createInitialState(), projects: [{ id: 'p', name: '原项目', archived: false, createdAt: '' }] }
  const base = createSyncStateFromAppState(initial)
  const local = createSyncStateFromAppState({ ...initial, projects: [] })
  const remote = createSyncStateFromAppState({ ...initial, projects: [{ ...initial.projects[0], name: '改名' }] })
  const conflicts = findConflicts(base, local, remote)
  expect(conflicts).toHaveLength(1)
  expect(resolveConflict(initial, conflicts[0], 'local').projects).toHaveLength(0)
  expect(resolveConflict(initial, conflicts[0], 'remote').projects[0].name).toBe('改名')
})
