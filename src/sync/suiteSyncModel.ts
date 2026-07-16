import { createSyncStateFromAppState, mergeSyncStates, normalizeSyncState } from '../domain/cloudSync'
import type { AppState, SyncState, VersionStamp } from '../domain/types'

export const SUITE_APP_IDS = ['dashboard', 'daily', 'checklist'] as const

export type SuiteAppId = typeof SUITE_APP_IDS[number]

export type VersionedPayload = {
  value: unknown
  updatedAt: number
  updatedBy: string
}

export type SuiteSyncState = {
  version: 1
  apps: Partial<Record<SuiteAppId, VersionedPayload>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isLegacyDashboardValue(value: unknown): value is AppState {
  if (!isRecord(value)) return false
  return typeof value.title === 'string'
    && Array.isArray(value.projects)
    && isRecord(value.checkins)
    && Array.isArray(value.randomCategories)
    && isRecord(value.dailyRandomResults)
    && Array.isArray(value.stageProjects)
    && typeof value.stageBoardTitle === 'string'
    && Array.isArray(value.stageLabels)
}

function stampLegacyDashboard(sync: SyncState, stampValue: VersionStamp): SyncState {
  return normalizeSyncState({
    ...sync,
    projects: sync.projects.map((entity) => ({ ...entity, ...stampValue })),
    checkins: sync.checkins.map((entity) => ({ ...entity, ...stampValue })),
    randomItems: sync.randomItems.map((entity) => ({ ...entity, ...stampValue })),
    randomResults: sync.randomResults.map((entity) => ({ ...entity, ...stampValue })),
    stageProjects: sync.stageProjects.map((entity) => ({ ...entity, ...stampValue })),
    settings: Object.fromEntries(Object.entries(sync.settings).map(([key, setting]) => [key, { ...setting, ...stampValue }])),
  })
}

function normalizeDashboardValue(value: unknown, stampValue: VersionStamp): SyncState | undefined {
  if (isRecord(value) && isRecord(value._sync) && value._sync.schemaVersion === 2) return normalizeSyncState(value._sync)
  if (isRecord(value) && value.schemaVersion === 2) return normalizeSyncState(value)
  if (isLegacyDashboardValue(value)) return stampLegacyDashboard(createSyncStateFromAppState(value), stampValue)
  return undefined
}

function normalizePayload(id: SuiteAppId, value: unknown): VersionedPayload | undefined {
  if (!isRecord(value) || !('value' in value)) return undefined
  const stampValue = {
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : '',
  }
  const normalizedValue = id === 'dashboard' ? normalizeDashboardValue(value.value, stampValue) : value.value
  if (normalizedValue === undefined) return undefined
  return {
    value: normalizedValue,
    ...stampValue,
  }
}

export function normalizeSuiteState(value: unknown): SuiteSyncState {
  const source = isRecord(value) && isRecord(value.apps) ? value.apps : {}
  const apps: SuiteSyncState['apps'] = {}
  for (const id of SUITE_APP_IDS) {
    const payload = normalizePayload(id, source[id])
    if (payload) apps[id] = payload
  }
  return { version: 1, apps }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (!isRecord(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

function comparePayloads(left: VersionedPayload, right: VersionedPayload): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt
  if (left.updatedBy !== right.updatedBy) return left.updatedBy < right.updatedBy ? -1 : 1
  const leftJson = canonicalJson(left.value)
  const rightJson = canonicalJson(right.value)
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0
}

function chooseLatest(left?: VersionedPayload, right?: VersionedPayload): VersionedPayload | undefined {
  if (!left) return right
  if (!right) return left
  return comparePayloads(left, right) >= 0 ? left : right
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function mergeById(primaryValue: unknown, secondaryValue: unknown, mergeItem?: (primary: Record<string, unknown>, secondary: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown>[] {
  const primary = array(primaryValue)
  const secondary = array(secondaryValue)
  const secondaryById = new Map(secondary.map((item) => [String(item.id || ''), item]))
  const merged = primary.map((item) => {
    const id = String(item.id || '')
    const older = secondaryById.get(id)
    secondaryById.delete(id)
    return older && mergeItem ? mergeItem(item, older) : item
  })
  return [...merged, ...secondary.filter((item) => secondaryById.has(String(item.id || '')))]
}

function mergeChecklist(primaryValue: unknown, secondaryValue: unknown): unknown {
  const primary = record(primaryValue)
  const secondary = record(secondaryValue)
  const listMerge = (newer: Record<string, unknown>, older: Record<string, unknown>) => ({
    ...older,
    ...newer,
    items: mergeById(newer.items, older.items),
  })
  const projectMerge = (newer: Record<string, unknown>, older: Record<string, unknown>) => ({
    ...older,
    ...newer,
    lists: mergeById(newer.lists, older.lists, listMerge),
  })
  return {
    ...secondary,
    ...primary,
    templates: mergeById(primary.templates, secondary.templates, listMerge),
    projects: mergeById(primary.projects, secondary.projects, projectMerge),
  }
}

function stamp(value: Record<string, unknown>): [number, string] {
  return [typeof value.updatedAt === 'number' ? value.updatedAt : 0, typeof value.updatedBy === 'string' ? value.updatedBy : '']
}

function compareStamped(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const [leftTime, leftDevice] = stamp(left)
  const [rightTime, rightDevice] = stamp(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return leftDevice < rightDevice ? -1 : leftDevice > rightDevice ? 1 : 0
}

function mergeStampedById(primaryValue: unknown, secondaryValue: unknown): Record<string, unknown>[] {
  return mergeById(primaryValue, secondaryValue, (primary, secondary) => compareStamped(primary, secondary) >= 0 ? primary : secondary)
}

function mergeStampMap(primaryValue: unknown, secondaryValue: unknown): Record<string, unknown> {
  const primary = record(primaryValue)
  const secondary = record(secondaryValue)
  return Object.fromEntries(
    [...new Set([...Object.keys(primary), ...Object.keys(secondary)])].map((id) => {
      const newer = record(primary[id])
      const older = record(secondary[id])
      return [id, compareStamped(newer, older) >= 0 ? newer : older]
    }),
  )
}

function mergeDaily(primaryValue: unknown, secondaryValue: unknown): unknown {
  const primary = record(primaryValue)
  const secondary = record(secondaryValue)
  const primaryDays = record(primary.days)
  const secondaryDays = record(secondary.days)
  const primaryMeta = record(primary.syncMeta)
  const secondaryMeta = record(secondary.syncMeta)
  const foodTombstones = mergeStampMap(primaryMeta.foodTombstones, secondaryMeta.foodTombstones)
  const rowTombstones = mergeStampMap(primaryMeta.rowTombstones, secondaryMeta.rowTombstones)
  const library = mergeStampedById(primary.library, secondary.library).filter((food) => {
    const tombstone = record(foodTombstones[String(food.id || '')])
    return !Object.keys(tombstone).length || compareStamped(food, tombstone) > 0
  })
  const days = Object.fromEntries(
    [...new Set([...Object.keys(primaryDays), ...Object.keys(secondaryDays)])].sort().map((date) => [
      date,
      mergeStampedById(primaryDays[date], secondaryDays[date]).filter((row) => {
        const tombstone = record(rowTombstones[String(row.id || '')])
        return !Object.keys(tombstone).length || compareStamped(row, tombstone) > 0
      }),
    ]),
  )
  const settingsStamp = compareStamped(record(primaryMeta.settings), record(secondaryMeta.settings)) >= 0
  const labelsStamp = compareStamped(record(primaryMeta.labels), record(secondaryMeta.labels)) >= 0
  return {
    ...secondary,
    ...primary,
    settings: settingsStamp ? primary.settings : secondary.settings,
    labels: labelsStamp ? primary.labels : secondary.labels,
    library,
    days,
    syncMeta: {
      foodTombstones,
      rowTombstones,
      settings: settingsStamp ? primaryMeta.settings : secondaryMeta.settings,
      labels: labelsStamp ? primaryMeta.labels : secondaryMeta.labels,
    },
  }
}

function mergeAppPayload(id: SuiteAppId, left: VersionedPayload, right: VersionedPayload): VersionedPayload {
  const latest = chooseLatest(left, right) as VersionedPayload
  const older = latest === left ? right : left
  let value = latest.value
  if (id === 'dashboard') value = mergeSyncStates(normalizeSyncState(latest.value), normalizeSyncState(older.value))
  else if (id === 'daily') value = mergeDaily(latest.value, older.value)
  else if (id === 'checklist') value = mergeChecklist(latest.value, older.value)
  return { ...latest, value }
}

export function mergeSuiteStates(leftValue: unknown, rightValue: unknown): SuiteSyncState {
  const left = normalizeSuiteState(leftValue)
  const right = normalizeSuiteState(rightValue)
  const apps: SuiteSyncState['apps'] = {}
  for (const id of SUITE_APP_IDS) {
    const leftPayload = left.apps[id]
    const rightPayload = right.apps[id]
    const payload = leftPayload && rightPayload ? mergeAppPayload(id, leftPayload, rightPayload) : chooseLatest(leftPayload, rightPayload)
    if (payload) apps[id] = payload
  }
  return { version: 1, apps }
}

export function suiteStatesEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(normalizeSuiteState(left)) === canonicalJson(normalizeSuiteState(right))
}

export function cleanSyncCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24)
}

export function generateSyncCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function deriveSuiteDocumentId(syncCode: string): Promise<string> {
  const bytes = new TextEncoder().encode(`project-suite:${cleanSyncCode(syncCode)}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)
}
