import { describe, expect, it } from 'vitest'
import { cleanSyncCode, mergeSuiteStates, normalizeSuiteState } from './suiteSyncModel'

describe('suite sync model', () => {
  it('cleans sync codes the same way as the calorie tracker', () => {
    expect(cleanSyncCode(' ab-cd_1234 efgh5678 ')).toBe('ABCD1234EFGH5678')
  })

  it('keeps the newest payload independently for every app', () => {
    const merged = mergeSuiteStates(
      { apps: { dashboard: { value: { title: '旧' }, updatedAt: 1, updatedBy: 'a' }, layoutEditor: { value: { title: '本地排版' }, updatedAt: 5, updatedBy: 'a' }, checklist: { value: { appName: '本地', templates: [], projects: [] }, updatedAt: 4, updatedBy: 'a' } } },
      { apps: { dashboard: { value: { title: '新' }, updatedAt: 2, updatedBy: 'b' }, layoutEditor: { value: { title: '云端排版' }, updatedAt: 2, updatedBy: 'b' }, checklist: { value: { appName: '云端', templates: [], projects: [] }, updatedAt: 3, updatedBy: 'b' } } },
    )
    expect((merged.apps.dashboard?.value as { title: string }).title).toBe('新')
    expect(merged.apps.layoutEditor?.value).toEqual({ title: '本地排版' })
    expect((merged.apps.checklist?.value as { appName: string }).appName).toBe('本地')
  })

  it('unions additions made on different devices', () => {
    const merged = mergeSuiteStates(
      {
        apps: {
          dashboard: { value: { projects: [{ id: 'one', name: '1' }], checkins: {}, randomCategories: [], dailyRandomResults: {}, stageProjects: [] }, updatedAt: 1, updatedBy: 'a' },
          daily: { value: { settings: {}, labels: {}, library: [], days: { '2026-07-16': [{ id: 'meal-one', name: '1', updatedAt: 1, updatedBy: 'a' }] }, syncMeta: {} }, updatedAt: 1, updatedBy: 'a' },
          checklist: { value: { templates: [{ id: 'list-one', name: '1', items: [] }], projects: [] }, updatedAt: 1, updatedBy: 'a' },
          layoutRecords: { value: [{ id: 'layout-one', name: '1' }], updatedAt: 1, updatedBy: 'a' },
        },
      },
      {
        apps: {
          dashboard: { value: { projects: [{ id: 'two', name: '2' }], checkins: {}, randomCategories: [], dailyRandomResults: {}, stageProjects: [] }, updatedAt: 2, updatedBy: 'b' },
          daily: { value: { settings: {}, labels: {}, library: [], days: { '2026-07-16': [{ id: 'meal-two', name: '2', updatedAt: 2, updatedBy: 'b' }] }, syncMeta: {} }, updatedAt: 2, updatedBy: 'b' },
          checklist: { value: { templates: [{ id: 'list-two', name: '2', items: [] }], projects: [] }, updatedAt: 2, updatedBy: 'b' },
          layoutRecords: { value: [{ id: 'layout-two', name: '2' }], updatedAt: 2, updatedBy: 'b' },
        },
      },
    )

    expect((merged.apps.dashboard?.value as { projects: { id: string }[] }).projects.map(({ id }) => id)).toEqual(['two', 'one'])
    expect((merged.apps.daily?.value as { days: Record<string, { id: string }[]> }).days['2026-07-16'].map(({ id }) => id)).toEqual(['meal-two', 'meal-one'])
    expect((merged.apps.checklist?.value as { templates: { id: string }[] }).templates.map(({ id }) => id)).toEqual(['list-two', 'list-one'])
    expect((merged.apps.layoutRecords?.value as { id: string }[]).map(({ id }) => id)).toEqual(['layout-two', 'layout-one'])
  })

  it('ignores malformed cloud fields', () => {
    expect(normalizeSuiteState({ apps: { dashboard: 'bad', unknown: { value: true } } })).toEqual({ version: 1, apps: {} })
  })
})
