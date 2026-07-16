import { describe, expect, it } from 'vitest'
import { createSyncStateFromAppState, reconcileAppStateWithSyncState } from '../domain/cloudSync'
import { createInitialState, type SyncState } from '../domain/types'
import { cleanSyncCode, mergeSuiteStates, normalizeSuiteState } from './suiteSyncModel'

describe('suite sync model', () => {
  it('cleans sync codes the same way as the calorie tracker', () => {
    expect(cleanSyncCode(' ab-cd_1234 efgh5678 ')).toBe('ABCD1234EFGH5678')
  })

  it('keeps the newest payload independently for every app', () => {
    const olderDashboard = { ...createInitialState(), title: '旧' }
    const newerDashboard = { ...createInitialState(), title: '新' }
    const merged = mergeSuiteStates(
      { apps: { dashboard: { value: olderDashboard, updatedAt: 1, updatedBy: 'a' }, checklist: { value: { appName: '本地', templates: [], projects: [] }, updatedAt: 4, updatedBy: 'a' } } },
      { apps: { dashboard: { value: newerDashboard, updatedAt: 2, updatedBy: 'b' }, checklist: { value: { appName: '云端', templates: [], projects: [] }, updatedAt: 3, updatedBy: 'b' } } },
    )
    expect((merged.apps.dashboard?.value as SyncState).settings.title.value).toBe('新')
    expect((merged.apps.checklist?.value as { appName: string }).appName).toBe('本地')
  })

  it('unions additions made on different devices', () => {
    const firstDashboard = {
      ...createInitialState(),
      projects: [{ id: 'one', name: '1', createdAt: '2026-07-01', archived: false }],
    }
    const secondDashboard = {
      ...createInitialState(),
      projects: [{ id: 'two', name: '2', createdAt: '2026-07-02', archived: false }],
    }
    const merged = mergeSuiteStates(
      {
        apps: {
          dashboard: { value: firstDashboard, updatedAt: 1, updatedBy: 'a' },
          daily: { value: { settings: {}, labels: {}, library: [], days: { '2026-07-16': [{ id: 'meal-one', name: '1', updatedAt: 1, updatedBy: 'a' }] }, syncMeta: {} }, updatedAt: 1, updatedBy: 'a' },
          checklist: { value: { templates: [{ id: 'list-one', name: '1', items: [] }], projects: [] }, updatedAt: 1, updatedBy: 'a' },
        },
      },
      {
        apps: {
          dashboard: { value: secondDashboard, updatedAt: 2, updatedBy: 'b' },
          daily: { value: { settings: {}, labels: {}, library: [], days: { '2026-07-16': [{ id: 'meal-two', name: '2', updatedAt: 2, updatedBy: 'b' }] }, syncMeta: {} }, updatedAt: 2, updatedBy: 'b' },
          checklist: { value: { templates: [{ id: 'list-two', name: '2', items: [] }], projects: [] }, updatedAt: 2, updatedBy: 'b' },
        },
      },
    )

    expect((merged.apps.dashboard?.value as SyncState).projects.map(({ id }) => id)).toEqual(['one', 'two'])
    expect((merged.apps.daily?.value as { days: Record<string, { id: string }[]> }).days['2026-07-16'].map(({ id }) => id)).toEqual(['meal-two', 'meal-one'])
    expect((merged.apps.checklist?.value as { templates: { id: string }[] }).templates.map(({ id }) => id)).toEqual(['list-two', 'list-one'])
  })

  it('drops legacy layout data from the unified sync document', () => {
    expect(normalizeSuiteState({ apps: {
      layoutEditor: { value: { title: '排版内容' }, updatedAt: 1, updatedBy: 'a' },
      layoutRecords: { value: [{ id: 'one' }], updatedAt: 1, updatedBy: 'a' },
    } })).toEqual({ version: 1, apps: {} })
  })

  it('does not restore a dashboard project deleted on a newer device', () => {
    const before = {
      ...createInitialState(),
      projects: [{ id: 'project-a', name: '项目', createdAt: '2026-07-01', archived: false }],
    }
    const older = createSyncStateFromAppState(before)
    const deleted = reconcileAppStateWithSyncState(
      older,
      { ...before, projects: [] },
      { updatedAt: 20, updatedBy: 'new-device' },
    )
    const merged = mergeSuiteStates(
      { apps: { dashboard: { value: older, updatedAt: 10, updatedBy: 'old-device' } } },
      { apps: { dashboard: { value: deleted, updatedAt: 20, updatedBy: 'new-device' } } },
    )

    expect((merged.apps.dashboard?.value as SyncState).projects).toEqual([])
    expect((merged.apps.dashboard?.value as SyncState).tombstones.projects['project-a']).toEqual({
      updatedAt: 20,
      updatedBy: 'new-device',
    })
  })

  it('ignores malformed cloud fields', () => {
    expect(normalizeSuiteState({ apps: { dashboard: 'bad', unknown: { value: true } } })).toEqual({ version: 1, apps: {} })
    expect(normalizeSuiteState({ apps: { dashboard: { value: true, updatedAt: 9, updatedBy: 'bad' } } })).toEqual({ version: 1, apps: {} })
  })
})
