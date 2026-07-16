import {
  type AppState,
  type RandomCategory,
  type SyncEntityKind,
  type SyncSettingValue,
  type SyncState,
  type VersionStamp,
} from './types'

const BASELINE_STAMP: VersionStamp = { updatedAt: 0, updatedBy: '' }
const ENTITY_KINDS: SyncEntityKind[] = ['projects', 'checkins', 'randomItems', 'randomResults', 'stageProjects']
const CATEGORY_IDS: RandomCategory['id'][] = ['fitness', 'modeling', 'mind']

type SyncEntity = SyncState[SyncEntityKind][number]
type SyncSetting = SyncState['settings'][string]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stageIndexValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0
  return Math.min(14, Math.max(0, value))
}

function stampFrom(value: Record<string, unknown>): VersionStamp {
  return {
    updatedAt: numberValue(value.updatedAt),
    updatedBy: stringValue(value.updatedBy),
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  )
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareVersion(left: VersionStamp, right: VersionStamp): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt
  const byDevice = compareText(left.updatedBy, right.updatedBy)
  if (byDevice !== 0) return byDevice
  return compareText(canonicalJson(left), canonicalJson(right))
}

function chooseLatest<T extends VersionStamp>(left: T | undefined, right: T | undefined): T | undefined {
  if (!left) return right
  if (!right) return left
  const versionOrder = compareVersion(left, right)
  if (versionOrder !== 0) return versionOrder > 0 ? left : right
  return compareText(canonicalJson(left), canonicalJson(right)) >= 0 ? left : right
}

function emptySyncState(): SyncState {
  return {
    schemaVersion: 2,
    projects: [],
    checkins: [],
    randomItems: [],
    randomResults: [],
    stageProjects: [],
    settings: {},
    tombstones: {
      projects: {},
      checkins: {},
      randomItems: {},
      randomResults: {},
      stageProjects: {},
    },
  }
}

function normalizeCategoryId(value: unknown): RandomCategory['id'] | undefined {
  return CATEGORY_IDS.find((id) => id === value)
}

function normalizeEntities(kind: SyncEntityKind, value: unknown): SyncEntity[] {
  if (!Array.isArray(value)) return []

  const entities: SyncEntity[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    const id = stringValue(candidate.id)
    if (!id) continue
    const stamp = stampFrom(candidate)

    if (kind === 'projects') {
      entities.push({
        id,
        name: stringValue(candidate.name),
        createdAt: stringValue(candidate.createdAt),
        archived: candidate.archived === true,
        order: numberValue(candidate.order),
        ...stamp,
      })
    } else if (kind === 'checkins') {
      const projectId = stringValue(candidate.projectId)
      const dateKey = stringValue(candidate.dateKey)
      if (projectId && dateKey) entities.push({ id, projectId, dateKey, ...stamp })
    } else if (kind === 'randomItems') {
      const categoryId = normalizeCategoryId(candidate.categoryId)
      if (categoryId) entities.push({
        id,
        categoryId,
        name: stringValue(candidate.name),
        order: numberValue(candidate.order),
        ...stamp,
      })
    } else if (kind === 'randomResults') {
      const categoryId = normalizeCategoryId(candidate.categoryId)
      const dateKey = stringValue(candidate.dateKey)
      if (categoryId && dateKey) entities.push({
        id,
        dateKey,
        categoryId,
        itemId: stringValue(candidate.itemId),
        name: stringValue(candidate.name),
        ...stamp,
      })
    } else {
      entities.push({
        id,
        name: stringValue(candidate.name),
        stageIndex: stageIndexValue(candidate.stageIndex),
        createdAt: stringValue(candidate.createdAt),
        order: numberValue(candidate.order),
        ...stamp,
      })
    }
  }

  return mergeEntityArrays([], entities)
}

function normalizeSettingValue(value: unknown): SyncSettingValue | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value]
  return undefined
}

function normalizeSettings(value: unknown): SyncState['settings'] {
  if (!isRecord(value)) return {}
  const entries: [string, SyncSetting][] = []

  for (const key of Object.keys(value).sort()) {
    const candidate = value[key]
    if (!isRecord(candidate)) continue
    const settingValue = normalizeSettingValue(candidate.value)
    if (settingValue !== undefined) entries.push([key, { value: settingValue, ...stampFrom(candidate) }])
  }

  return Object.fromEntries(entries)
}

function normalizeTombstones(value: unknown): SyncState['tombstones'] {
  const result = emptySyncState().tombstones
  if (!isRecord(value)) return result

  for (const kind of ENTITY_KINDS) {
    const candidates = value[kind]
    if (!isRecord(candidates)) continue
    result[kind] = Object.fromEntries(
      Object.keys(candidates).sort().flatMap((id) => {
        const candidate = candidates[id]
        return isRecord(candidate) ? [[id, stampFrom(candidate)]] : []
      }),
    )
  }
  return result
}

export function normalizeSyncState(value: unknown): SyncState {
  const source = isRecord(value) ? value : {}
  return {
    schemaVersion: 2,
    projects: normalizeEntities('projects', source.projects) as SyncState['projects'],
    checkins: normalizeEntities('checkins', source.checkins) as SyncState['checkins'],
    randomItems: normalizeEntities('randomItems', source.randomItems) as SyncState['randomItems'],
    randomResults: normalizeEntities('randomResults', source.randomResults) as SyncState['randomResults'],
    stageProjects: normalizeEntities('stageProjects', source.stageProjects) as SyncState['stageProjects'],
    settings: normalizeSettings(source.settings),
    tombstones: normalizeTombstones(source.tombstones),
  }
}

function setting(value: SyncSettingValue): SyncSetting {
  return { value, ...BASELINE_STAMP }
}

export function createSyncStateFromAppState(state: AppState): SyncState {
  const sync = emptySyncState()
  sync.projects = state.projects.map((project, order) => ({ ...project, order, ...BASELINE_STAMP }))
  sync.checkins = Object.entries(state.checkins).flatMap(([projectId, dates]) =>
    dates.map((dateKey) => ({ id: `${projectId}:${dateKey}`, projectId, dateKey, ...BASELINE_STAMP })),
  )
  sync.randomItems = state.randomCategories.flatMap((category) =>
    category.items.map((item, order) => ({ ...item, categoryId: category.id, order, ...BASELINE_STAMP })),
  )
  sync.randomResults = Object.entries(state.dailyRandomResults).flatMap(([dateKey, results]) =>
    CATEGORY_IDS.flatMap((categoryId) => {
      const result = results[categoryId]
      return result ? [{
        id: `${dateKey}:${categoryId}`,
        dateKey,
        categoryId,
        ...result,
        ...BASELINE_STAMP,
      }] : []
    }),
  )
  sync.stageProjects = state.stageProjects.map((project, order) => ({ ...project, order, ...BASELINE_STAMP }))
  sync.settings = {
    title: setting(state.title),
    theme: setting(state.theme),
    stageBoardTitle: setting(state.stageBoardTitle),
    ...Object.fromEntries(state.stageLabels.map((label, index) => [`stageLabel:${index}`, setting(label)])),
    ...Object.fromEntries(state.randomCategories.map((category) => [`categoryName:${category.id}`, setting(category.name)])),
  }
  return normalizeSyncState(sync)
}

function mergeEntityArrays<T extends { id: string } & VersionStamp>(left: T[], right: T[]): T[] {
  const byId = new Map<string, T>()
  for (const entity of [...left, ...right]) {
    byId.set(entity.id, chooseLatest(byId.get(entity.id), entity) as T)
  }
  return [...byId.values()].sort((a, b) => compareText(a.id, b.id))
}

function mergeStampRecords(left: Record<string, VersionStamp>, right: Record<string, VersionStamp>): Record<string, VersionStamp> {
  return Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .map((id) => [id, chooseLatest(left[id], right[id]) as VersionStamp]),
  )
}

function mergeSettingRecords(left: SyncState['settings'], right: SyncState['settings']): SyncState['settings'] {
  return Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .map((key) => [key, chooseLatest(left[key], right[key]) as SyncSetting]),
  )
}

function removeDeleted<T extends { id: string } & VersionStamp>(entities: T[], tombstones: Record<string, VersionStamp>): T[] {
  return entities.filter((entity) => {
    const tombstone = tombstones[entity.id]
    return !tombstone || compareVersion(entity, tombstone) > 0
  })
}

export function mergeSyncStates(left: SyncState, right: SyncState): SyncState {
  const normalizedLeft = normalizeSyncState(left)
  const normalizedRight = normalizeSyncState(right)
  const tombstones = emptySyncState().tombstones
  for (const kind of ENTITY_KINDS) {
    tombstones[kind] = mergeStampRecords(normalizedLeft.tombstones[kind], normalizedRight.tombstones[kind])
  }

  return normalizeSyncState({
    schemaVersion: 2,
    projects: removeDeleted(mergeEntityArrays(normalizedLeft.projects, normalizedRight.projects), tombstones.projects),
    checkins: removeDeleted(mergeEntityArrays(normalizedLeft.checkins, normalizedRight.checkins), tombstones.checkins),
    randomItems: removeDeleted(mergeEntityArrays(normalizedLeft.randomItems, normalizedRight.randomItems), tombstones.randomItems),
    randomResults: removeDeleted(mergeEntityArrays(normalizedLeft.randomResults, normalizedRight.randomResults), tombstones.randomResults),
    stageProjects: removeDeleted(mergeEntityArrays(normalizedLeft.stageProjects, normalizedRight.stageProjects), tombstones.stageProjects),
    settings: mergeSettingRecords(normalizedLeft.settings, normalizedRight.settings),
    tombstones,
  })
}

function withoutVersion<T extends VersionStamp>(value: T): Omit<T, keyof VersionStamp> {
  const { updatedAt: _updatedAt, updatedBy: _updatedBy, ...content } = value
  return content
}

function reconcileEntities<T extends { id: string } & VersionStamp>(
  previous: T[],
  current: T[],
  previousTombstones: Record<string, VersionStamp>,
  changeStamp: VersionStamp,
): { entities: T[]; tombstones: Record<string, VersionStamp> } {
  const previousById = new Map(previous.map((entity) => [entity.id, entity]))
  const currentIds = new Set(current.map((entity) => entity.id))
  const tombstones = { ...previousTombstones }
  const entities = current.map((entity) => {
    const older = previousById.get(entity.id)
    if (older && canonicalJson(withoutVersion(older)) === canonicalJson(withoutVersion(entity))) return older
    return { ...entity, ...changeStamp }
  })

  for (const entity of previous) {
    if (currentIds.has(entity.id)) continue
    tombstones[entity.id] = chooseLatest(tombstones[entity.id], changeStamp) as VersionStamp
  }

  return { entities, tombstones }
}

export function reconcileAppStateWithSyncState(
  previousValue: SyncState,
  currentState: AppState,
  changeStamp: VersionStamp,
): SyncState {
  const previous = normalizeSyncState(previousValue)
  const current = createSyncStateFromAppState(currentState)
  const projects = reconcileEntities(previous.projects, current.projects, previous.tombstones.projects, changeStamp)
  const checkins = reconcileEntities(previous.checkins, current.checkins, previous.tombstones.checkins, changeStamp)
  const randomItems = reconcileEntities(previous.randomItems, current.randomItems, previous.tombstones.randomItems, changeStamp)
  const randomResults = reconcileEntities(previous.randomResults, current.randomResults, previous.tombstones.randomResults, changeStamp)
  const stageProjects = reconcileEntities(previous.stageProjects, current.stageProjects, previous.tombstones.stageProjects, changeStamp)
  const settings = Object.fromEntries(Object.entries(current.settings).map(([key, settingValue]) => {
    const older = previous.settings[key]
    return [key, older && canonicalJson(older.value) === canonicalJson(settingValue.value)
      ? older
      : { ...settingValue, ...changeStamp }]
  }))

  return mergeSyncStates(normalizeSyncState({
    schemaVersion: 2,
    projects: projects.entities,
    checkins: checkins.entities,
    randomItems: randomItems.entities,
    randomResults: randomResults.entities,
    stageProjects: stageProjects.entities,
    settings,
    tombstones: {
      projects: projects.tombstones,
      checkins: checkins.tombstones,
      randomItems: randomItems.tombstones,
      randomResults: randomResults.tombstones,
      stageProjects: stageProjects.tombstones,
    },
  }), emptySyncState())
}

function settingString(sync: SyncState, key: string, fallback: string): string {
  const value = sync.settings[key]?.value
  return typeof value === 'string' ? value : fallback
}

function themeSetting(sync: SyncState, fallback: AppState['theme']): AppState['theme'] {
  const value = sync.settings.theme?.value
  return value === 'system' || value === 'light' || value === 'dark' ? value : fallback
}

export function applySyncStateToAppState(current: AppState, syncValue: SyncState): AppState {
  const sync = normalizeSyncState(syncValue)
  const projects = [...sync.projects]
    .sort((a, b) => a.order - b.order || compareText(a.id, b.id))
    .map(({ updatedAt: _updatedAt, updatedBy: _updatedBy, order: _order, ...project }) => project)
  const checkinsByProject = new Map<string, Set<string>>()
  for (const { projectId, dateKey } of sync.checkins) {
    const dates = checkinsByProject.get(projectId) ?? new Set<string>()
    dates.add(dateKey)
    checkinsByProject.set(projectId, dates)
  }
  const checkins = Object.fromEntries(
    [...checkinsByProject].map(([projectId, dates]) => [projectId, [...dates].sort()]),
  ) as AppState['checkins']
  const randomCategories = CATEGORY_IDS.map((categoryId) => {
    const currentCategory = current.randomCategories.find(({ id }) => id === categoryId)
    const items = sync.randomItems
      .filter((item) => item.categoryId === categoryId)
      .sort((a, b) => a.order - b.order || compareText(a.id, b.id))
      .map(({ updatedAt: _updatedAt, updatedBy: _updatedBy, order: _order, categoryId: _categoryId, ...item }) => item)
    return {
      id: categoryId,
      name: settingString(sync, `categoryName:${categoryId}`, currentCategory?.name ?? categoryId),
      items,
    }
  })
  const resultsByDate = new Map<string, AppState['dailyRandomResults'][string]>()
  for (const { dateKey, categoryId, itemId, name } of sync.randomResults) {
    resultsByDate.set(dateKey, {
      ...resultsByDate.get(dateKey),
      [categoryId]: { itemId, name },
    })
  }
  const dailyRandomResults = Object.fromEntries(resultsByDate) as AppState['dailyRandomResults']
  const stageProjects = [...sync.stageProjects]
    .sort((a, b) => a.order - b.order || compareText(a.id, b.id))
    .map(({ updatedAt: _updatedAt, updatedBy: _updatedBy, order: _order, ...project }) => project)
  const stageLabels = Array.from({ length: 15 }, (_, index) =>
    settingString(sync, `stageLabel:${index}`, current.stageLabels[index] ?? ''),
  )

  return {
    ...current,
    title: settingString(sync, 'title', current.title),
    projects,
    checkins,
    randomCategories,
    dailyRandomResults,
    stageProjects,
    stageBoardTitle: settingString(sync, 'stageBoardTitle', current.stageBoardTitle),
    stageLabels,
    theme: themeSetting(sync, current.theme),
    view: current.view,
    anchorDate: current.anchorDate,
  }
}

export function syncStatesEqual(left: SyncState, right: SyncState): boolean {
  return canonicalJson(normalizeSyncState(left)) === canonicalJson(normalizeSyncState(right))
}

export function latestSyncTimestamp(syncValue: SyncState): number {
  const sync = normalizeSyncState(syncValue)
  const timestamps = [
    ...ENTITY_KINDS.flatMap((kind) => sync[kind].map(({ updatedAt }) => updatedAt)),
    ...Object.values(sync.settings).map(({ updatedAt }) => updatedAt),
    ...ENTITY_KINDS.flatMap((kind) => Object.values(sync.tombstones[kind]).map(({ updatedAt }) => updatedAt)),
  ]
  return Math.max(0, ...timestamps)
}
