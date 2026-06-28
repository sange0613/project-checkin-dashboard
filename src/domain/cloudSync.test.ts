import { describe, expect, it } from 'vitest'
import {
  applySyncStateToAppState,
  createSyncStateFromAppState,
  mergeSyncStates,
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
})
