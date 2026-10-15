import { normalizeRecord, validateBlock } from '../../time-journal/model.mjs'
import type { VersionStamp } from '../domain/types'

export const TIME_JOURNAL_KEY = 'time-noticed.v1'
export type TimeBlock = { id: string; start: number; end: number; category: 'work' | 'entertainment' | 'rest'; title: string; [key: string]: unknown }
export type TimeJournal = { version: 2; days: Record<string, TimeBlock[]>; dayVersions: Record<string, VersionStamp> }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function version(value: unknown, fallback: VersionStamp): VersionStamp {
  const source = object(value)
  return {
    updatedAt: typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt >= 0 ? source.updatedAt : fallback.updatedAt,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy : fallback.updatedBy,
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.entries(object(value)).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
}
export function normalizeTimeJournal(value: unknown, fallback: VersionStamp = { updatedAt: 0, updatedBy: '' }): TimeJournal {
  const source = object(value)
  const sourceDays = source.version === 2 ? object(source.days) : source
  const versions = source.version === 2 ? object(source.dayVersions) : {}
  const days: TimeJournal['days'] = {}
  const dayVersions: TimeJournal['dayVersions'] = {}
  for (const date of Object.keys(sourceDays).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(sourceDays[date])) continue
    const records: TimeBlock[] = []
    for (const raw of sourceDays[date]) {
      const item = object(normalizeRecord(raw))
      if (typeof item.id !== 'string' || records.some(block => block.id === item.id)) continue
      const candidate = item as TimeBlock
      if (validateBlock(candidate, records)) continue
      records.push({ ...candidate, title: typeof item.title === 'string' ? item.title.slice(0, 60) : '' })
    }
    // Empty arrays are intentional resets; malformed nonempty days must not erase valid history.
    if (sourceDays[date].length && !records.length) continue
    days[date] = records.sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    dayVersions[date] = version(versions[date], fallback)
  }
  return { version: 2, days, dayVersions }
}
export function mergeTimeJournals(leftValue: unknown, rightValue: unknown): TimeJournal {
  const left = normalizeTimeJournal(leftValue)
  const right = normalizeTimeJournal(rightValue)
  const days: TimeJournal['days'] = {}
  const dayVersions: TimeJournal['dayVersions'] = {}
  for (const date of [...new Set([...Object.keys(left.days), ...Object.keys(right.days)])].sort()) {
    const a = left.dayVersions[date]
    const b = right.dayVersions[date]
    const compare = a && b ? a.updatedAt - b.updatedAt || (a.updatedBy < b.updatedBy ? -1 : a.updatedBy > b.updatedBy ? 1 : 0) || (canonical(left.days[date]) < canonical(right.days[date]) ? -1 : 1) : 0
    const selected = !b || (a && compare >= 0) ? left : right
    days[date] = selected.days[date]
    dayVersions[date] = selected.dayVersions[date]
  }
  return { version: 2, days, dayVersions }
}
export function updateTimeJournal(beforeValue: unknown, nextDays: TimeJournal['days'], deviceId: string, now: number, latestValue: unknown = beforeValue): TimeJournal {
  const before = normalizeTimeJournal(beforeValue)
  const next = normalizeTimeJournal(nextDays)
  const merged = mergeTimeJournals(before, latestValue)
  let updatedAt = Math.max(now, ...Object.values(merged.dayVersions).map(stamp => stamp.updatedAt + 1))
  for (const date of new Set([...Object.keys(before.days), ...Object.keys(next.days)])) {
    const records = next.days[date] || []
    if (canonical(before.days[date] || []) === canonical(records)) continue
    merged.days[date] = records
    merged.dayVersions[date] = { updatedAt: updatedAt++, updatedBy: deviceId }
  }
  return normalizeTimeJournal(merged)
}
