import { describe, expect, it } from 'vitest'
import {
  applySyncStateToAppState,
  createSyncStateFromAppState,
  latestSyncTimestamp,
  mergeSyncStates,
  normalizeSyncState,
  reconcileAppStateWithSyncState,
  syncStatesEqual,
} from './cloudSync'
import { createInitialState, type AppState } from './types'

function state(overrides: Partial<AppState>): AppState {
  return { ...createInitialState(), ...overrides }
}

describe('canonical cloud sync merge', () => {
  it('unions unique projects and preserves same-name projects with different IDs', () => {
    const leftState = state({
      projects: [{ id: 'project-a', name: '同名项目', createdAt: '2026-06-01', archived: false }],
    })
    const rightState = state({
      projects: [{ id: 'project-b', name: '同名项目', createdAt: '2026-06-02', archived: false }],
    })

    const merged = mergeSyncStates(
      createSyncStateFromAppState(leftState),
      createSyncStateFromAppState(rightState),
    )
    const visible = applySyncStateToAppState(leftState, merged)

    expect(visible.projects.map(({ id }) => id)).toEqual(['project-a', 'project-b'])
    expect(visible.projects.map(({ name }) => name)).toEqual(['同名项目', '同名项目'])
  })

  it('normalizes stage indices to integers within the board range', () => {
    const sync = normalizeSyncState({
      stageProjects: [
        { id: 'low', name: '低', stageIndex: -2, createdAt: '', order: 0, updatedAt: 0, updatedBy: '' },
        { id: 'high', name: '高', stageIndex: 20, createdAt: '', order: 1, updatedAt: 0, updatedBy: '' },
        { id: 'fraction', name: '小数', stageIndex: 1.5, createdAt: '', order: 2, updatedAt: 0, updatedBy: '' },
      ],
    })

    expect(sync.stageProjects.map(({ stageIndex }) => stageIndex)).toEqual([0, 14, 0])
  })

  it('materializes all stage label positions without compacting sparse settings', () => {
    const current = createInitialState()
    const sync = normalizeSyncState({
      settings: {
        'stageLabel:2': { value: '云端第三阶段', updatedAt: 1, updatedBy: 'device-a' },
      },
    })

    const visible = applySyncStateToAppState(current, sync)

    expect(visible.stageLabels).toHaveLength(15)
    expect(visible.stageLabels[0]).toBe(current.stageLabels[0])
    expect(visible.stageLabels[1]).toBe(current.stageLabels[1])
    expect(visible.stageLabels[2]).toBe('云端第三阶段')
    expect(visible.stageLabels[14]).toBe(current.stageLabels[14])
  })

  it('keeps the current theme when a sync setting is invalid', () => {
    const current = state({ theme: 'dark' })
    const sync = normalizeSyncState({
      settings: { theme: { value: 'neon', updatedAt: 1, updatedBy: 'device-a' } },
    })

    expect(applySyncStateToAppState(current, sync).theme).toBe('dark')
  })

  it('safely materializes __proto__ check-in and date keys as own properties', () => {
    const sync = normalizeSyncState({
      checkins: [{
        id: '__proto__:2026-06-22',
        projectId: '__proto__',
        dateKey: '2026-06-22',
        updatedAt: 0,
        updatedBy: '',
      }],
      randomResults: [{
        id: '__proto__:fitness',
        dateKey: '__proto__',
        categoryId: 'fitness',
        itemId: 'safe-item',
        name: '安全结果',
        updatedAt: 0,
        updatedBy: '',
      }],
    })

    const visible = applySyncStateToAppState(createInitialState(), sync)

    expect(Object.getPrototypeOf(visible.checkins)).toBe(Object.prototype)
    expect(Object.hasOwn(visible.checkins, '__proto__')).toBe(true)
    expect(visible.checkins.__proto__).toEqual(['2026-06-22'])
    expect(Object.getPrototypeOf(visible.dailyRandomResults)).toBe(Object.prototype)
    expect(Object.hasOwn(visible.dailyRandomResults, '__proto__')).toBe(true)
    expect(visible.dailyRandomResults.__proto__).toEqual({
      fitness: { itemId: 'safe-item', name: '安全结果' },
    })
  })

  it('compares normalized states and reports the latest entity, setting, or tombstone timestamp', () => {
    const left = normalizeSyncState({
      projects: [
        { id: 'b', name: '乙', createdAt: '', archived: false, order: 1, updatedAt: 3, updatedBy: 'a' },
        { id: 'a', name: '甲', createdAt: '', archived: false, order: 0, updatedAt: 2, updatedBy: 'a' },
      ],
      settings: { title: { value: '标题', updatedAt: 8, updatedBy: 'a' } },
      tombstones: { checkins: { removed: { updatedAt: 13, updatedBy: 'a' } } },
    })
    const right = normalizeSyncState({
      projects: [...left.projects].reverse(),
      settings: left.settings,
      tombstones: left.tombstones,
    })

    expect(syncStatesEqual(left, right)).toBe(true)
    expect(latestSyncTimestamp(left)).toBe(13)
  })

  it('uses canonical JSON to deterministically break equal version-stamp ties', () => {
    const left = normalizeSyncState({
      projects: [{ id: 'same', name: '甲', createdAt: '', archived: false, order: 0, updatedAt: 5, updatedBy: 'same' }],
    })
    const right = normalizeSyncState({
      projects: [{ id: 'same', name: '乙', createdAt: '', archived: false, order: 0, updatedAt: 5, updatedBy: 'same' }],
    })

    expect(mergeSyncStates(left, right)).toEqual(mergeSyncStates(right, left))
    expect(mergeSyncStates(left, right).projects[0].name).toBe('甲')
  })

  it('unions unique check-ins, prompt items, daily results, and stage projects', () => {
    const leftState = state({
      projects: [{ id: 'project-a', name: '甲', createdAt: '2026-06-01', archived: false }],
      checkins: { 'project-a': ['2026-06-20'] },
      randomCategories: [
        { id: 'fitness', name: '健身 A', items: [{ id: 'fitness-a', name: '俯卧撑' }] },
        { id: 'modeling', name: '建模', items: [] },
        { id: 'mind', name: '建脑', items: [] },
      ],
      dailyRandomResults: {
        '2026-06-20': { fitness: { itemId: 'fitness-a', name: '俯卧撑' } },
      },
      stageProjects: [{ id: 'stage-a', name: '阶段甲', stageIndex: 1, createdAt: '2026-06-01' }],
    })
    const rightState = state({
      projects: [{ id: 'project-b', name: '乙', createdAt: '2026-06-02', archived: false }],
      checkins: { 'project-b': ['2026-06-21'] },
      randomCategories: [
        { id: 'fitness', name: '健身 B', items: [{ id: 'fitness-b', name: '深蹲' }] },
        { id: 'modeling', name: '建模', items: [] },
        { id: 'mind', name: '建脑', items: [] },
      ],
      dailyRandomResults: {
        '2026-06-21': { fitness: { itemId: 'fitness-b', name: '深蹲' } },
      },
      stageProjects: [{ id: 'stage-b', name: '阶段乙', stageIndex: 2, createdAt: '2026-06-02' }],
    })

    const merged = mergeSyncStates(
      createSyncStateFromAppState(leftState),
      createSyncStateFromAppState(rightState),
    )
    const visible = applySyncStateToAppState(leftState, merged)

    expect(visible.checkins).toEqual({
      'project-a': ['2026-06-20'],
      'project-b': ['2026-06-21'],
    })
    expect(visible.randomCategories.find(({ id }) => id === 'fitness')?.items.map(({ id }) => id))
      .toEqual(['fitness-a', 'fitness-b'])
    expect(visible.dailyRandomResults).toEqual({
      '2026-06-20': { fitness: { itemId: 'fitness-a', name: '俯卧撑' } },
      '2026-06-21': { fitness: { itemId: 'fitness-b', name: '深蹲' } },
    })
    expect(visible.stageProjects.map(({ id }) => id)).toEqual(['stage-a', 'stage-b'])
  })

  it('materializes ordered collections while preserving local view and anchor date', () => {
    const current = state({ view: 'month', anchorDate: '2026-04-03T00:00:00.000Z' })
    const source = state({
      view: 'day',
      anchorDate: '2026-01-01T00:00:00.000Z',
      projects: [
        { id: 'project-z', name: '先', createdAt: '2026-06-01', archived: false },
        { id: 'project-a', name: '后', createdAt: '2026-06-02', archived: false },
      ],
      randomCategories: [
        { id: 'fitness', name: '健身', items: [{ id: 'item-z', name: '先' }, { id: 'item-a', name: '后' }] },
        { id: 'modeling', name: '建模', items: [] },
        { id: 'mind', name: '建脑', items: [] },
      ],
    })

    const visible = applySyncStateToAppState(current, createSyncStateFromAppState(source))

    expect(visible.projects.map(({ id }) => id)).toEqual(['project-z', 'project-a'])
    expect(visible.randomCategories[0].items.map(({ id }) => id)).toEqual(['item-z', 'item-a'])
    expect(visible.view).toBe('month')
    expect(visible.anchorDate).toBe('2026-04-03T00:00:00.000Z')
  })

  it('keeps project and check-in deletions when merged with an older device', () => {
    const before = state({
      projects: [{ id: 'project-a', name: '项目', createdAt: '2026-07-01', archived: false }],
      checkins: { 'project-a': ['2026-07-16'] },
    })
    const olderRemote = reconcileAppStateWithSyncState(
      createSyncStateFromAppState(before),
      before,
      { updatedAt: 10, updatedBy: 'device-old' },
    )
    const after = state({ projects: [], checkins: {} })
    const deleted = reconcileAppStateWithSyncState(
      olderRemote,
      after,
      { updatedAt: 20, updatedBy: 'device-new' },
    )
    const merged = mergeSyncStates(olderRemote, deleted)
    const visible = applySyncStateToAppState(after, merged)

    expect(visible.projects).toEqual([])
    expect(visible.checkins).toEqual({})
    expect(merged.tombstones.projects['project-a']).toEqual({ updatedAt: 20, updatedBy: 'device-new' })
    expect(merged.tombstones.checkins['project-a:2026-07-16']).toEqual({ updatedAt: 20, updatedBy: 'device-new' })
  })

  it('keeps deleted prompt items and stage projects deleted after merging', () => {
    const before = state({
      randomCategories: [
        { id: 'fitness', name: '健身', items: [{ id: 'pushup', name: '俯卧撑' }] },
        { id: 'modeling', name: '建模', items: [] },
        { id: 'mind', name: '建脑', items: [] },
      ],
      stageProjects: [{ id: 'stage-a', name: '设计项目', stageIndex: 2, createdAt: '2026-07-01' }],
    })
    const olderRemote = reconcileAppStateWithSyncState(
      createSyncStateFromAppState(before),
      before,
      { updatedAt: 10, updatedBy: 'device-old' },
    )
    const after = state({
      randomCategories: [
        { id: 'fitness', name: '健身', items: [] },
        { id: 'modeling', name: '建模', items: [] },
        { id: 'mind', name: '建脑', items: [] },
      ],
      stageProjects: [],
    })
    const deleted = reconcileAppStateWithSyncState(
      olderRemote,
      after,
      { updatedAt: 20, updatedBy: 'device-new' },
    )
    const visible = applySyncStateToAppState(after, mergeSyncStates(olderRemote, deleted))

    expect(visible.randomCategories[0].items).toEqual([])
    expect(visible.stageProjects).toEqual([])
  })
})
