import { createInitialState } from '../domain/types'
import { exportState, importState } from './dataTransfer'

test('exports and imports a valid local backup', () => {
  const state = createInitialState()
  state.title = '年度项目'
  const restored = importState(exportState(state))
  expect(restored).toEqual(state)
})

test('rejects invalid backup data', () => {
  expect(() => importState('{"hello":"world"}')).toThrow('备份文件格式不正确')
})
test.each([
  { anchorDate: 'not-a-date' }, { stageProjects: {} }, { randomCategories: [{ id: 'fitness', name: '健身', items: null }] },
  { stageProjects: [{ id: 's', name: '项目', createdAt: '2018-99-99', stageIndex: 0 }] },
  { dailyRandomResults: { '2026-10-26': { fitness: null } } }, { preferences: { bad: {} } },
  { checkins: { a: ['2026-02-31'] } }, { projects: [{ id: 'a', name: 'a', archived: false, createdAt: '' }, { id: 'a', name: 'b', archived: false, createdAt: '' }] },
])('rejects malformed optional data before replacing the current state: %j', invalid => {
  expect(() => importState(JSON.stringify({ version: 1, state: { ...createInitialState(), ...invalid } }))).toThrow('备份文件格式不正确')
})

test('includes random candidates and daily results in backups', () => {
  const state = createInitialState()
  state.randomCategories[0].items.push({ id: 'fitness-run', name: '跑步' })
  state.dailyRandomResults['2026-06-21'] = {
    fitness: { itemId: 'fitness-run', name: '跑步' },
  }

  const restored = importState(exportState(state))

  expect(restored.randomCategories[0].items.at(-1)?.name).toBe('跑步')
  expect(restored.dailyRandomResults['2026-06-21'].fitness?.name).toBe('跑步')
})
