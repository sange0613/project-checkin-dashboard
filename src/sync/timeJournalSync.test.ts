import { describe, expect, it } from 'vitest'
import { mergeTimeJournals, normalizeTimeJournal, updateTimeJournal, type TimeBlock } from './timeJournalSync'

const block: TimeBlock = { id: 'one', start: 540, end: 600, category: 'work', title: '' }
describe('time journal persistence', () => {
  it('migrates raw records without losing legacy categories or notes', () => {
    const journal = normalizeTimeJournal({ '2026-10-13': [{ ...block, category: 'study', title: '阅读' }] })
    expect(journal.days['2026-10-13'][0]).toMatchObject({ category: 'work', originalCategory: 'study', originalTitle: '阅读', title: '学习 · 阅读' })
  })
  it('does not interpret a malformed day as an intentional reset', () => {
    const merged = mergeTimeJournals(
      { '2026-10-13': [block] },
      { version: 2, days: { '2026-10-13': [{ invalid: true }] }, dayVersions: { '2026-10-13': { updatedAt: 100, updatedBy: 'b' } } },
    )
    expect(merged.days['2026-10-13']).toEqual([block])
  })
  it('stamps only changed dates and preserves history received since the last render', () => {
    expect(updateTimeJournal).toBeTypeOf('function')
    const before = normalizeTimeJournal({ '2026-10-13': [block] }, { updatedAt: 10, updatedBy: 'a' })
    const latest = normalizeTimeJournal({ '2026-10-14': [{ ...block, id: 'remote' }] }, { updatedAt: 20, updatedBy: 'b' })
    const next = updateTimeJournal(before, { ...before.days, '2026-10-15': [block] }, 'a', 30, latest)
    expect(next.days['2026-10-14']).toEqual([{ ...block, id: 'remote' }])
    expect(next.dayVersions['2026-10-13']).toEqual({ updatedAt: 10, updatedBy: 'a' })
    expect(next.dayVersions['2026-10-15']).toEqual({ updatedAt: 30, updatedBy: 'a' })
  })
  it('reset and undo create newer versions even if the local clock moved backwards', () => {
    expect(updateTimeJournal).toBeTypeOf('function')
    const before = normalizeTimeJournal({ '2026-10-13': [block] }, { updatedAt: 100, updatedBy: 'b' })
    const reset = updateTimeJournal(before, { '2026-10-13': [] }, 'a', 10)
    expect(reset.dayVersions['2026-10-13'].updatedAt).toBe(101)
    expect(mergeTimeJournals(reset, before).days['2026-10-13']).toEqual([])
    const undo = updateTimeJournal(reset, before.days, 'a', 20)
    expect(undo.dayVersions['2026-10-13'].updatedAt).toBe(102)
    expect(mergeTimeJournals(reset, undo).days['2026-10-13']).toEqual([block])
  })
  it('does not create new versions merely by viewing unchanged data', () => {
    expect(updateTimeJournal).toBeTypeOf('function')
    const before = normalizeTimeJournal({ '2026-10-13': [block] }, { updatedAt: 100, updatedBy: 'a' })
    expect(updateTimeJournal(before, before.days, 'b', 200)).toEqual(before)
  })
})
