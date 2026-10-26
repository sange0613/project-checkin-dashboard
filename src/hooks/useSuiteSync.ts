import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DocumentReference, Unsubscribe } from 'firebase/firestore'
import {
  applySyncStateToAppState,
  createSyncStateFromAppState,
  latestSyncTimestamp,
  normalizeSyncState,
  rebaseLocalSyncChanges,
  reconcileAppStateWithSyncState,
} from '../domain/cloudSync'
import type { AppState, SyncState } from '../domain/types'
import { saveRecovery } from '../storage/recovery'
import { recordConflicts } from '../storage/syncConflicts'
import { TOOL_STORAGE_KEYS, readToolValue } from '../sync/toolStorage'
const ACCEPTED_SYNC_KEY = 'project-suite-dashboard-accepted-v1'
import {
  SUITE_APP_IDS,
  cleanSyncCode,
  deriveSuiteDocumentId,
  generateSyncCode,
  mergeSuiteStates,
  normalizeSuiteState,
  preserveSuiteApps,
  suiteStatesEqual,
  type SuiteAppId,
  type SuiteSyncState,
} from '../sync/suiteSyncModel'

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDbLCcDs-Gk6ev2zSUT4cdYAgvpqUzSUEY',
  authDomain: 'daily-calorie-tracker-3ec47.firebaseapp.com',
  projectId: 'daily-calorie-tracker-3ec47',
  storageBucket: 'daily-calorie-tracker-3ec47.firebasestorage.app',
  messagingSenderId: '197589959166',
  appId: '1:197589959166:web:711ca2487ef48c9c42c0af',
}

const SUITE_CODE_KEY = 'project-suite-sync-code-v1'
const SUITE_DEVICE_KEY = 'project-suite-device-id-v1'
const SUITE_META_KEY = 'project-suite-sync-meta-v1'
const DASHBOARD_SYNC_KEY = 'project-suite-dashboard-sync-v2'
const DAILY_CODE_KEY = 'calorie-tracker-v1-sync-code'
const PUSH_DEBOUNCE_MS = 2_500

type SyncMeta = Partial<Record<SuiteAppId, { fingerprint: string; updatedAt: number; updatedBy: string }>>
type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'error'

type SyncSession = {
  code: string
  document: DocumentReference
  unsubscribe?: Unsubscribe
  timer?: ReturnType<typeof setTimeout>
  ready: boolean
  disposed: boolean
  uploading?: boolean
  pending?: boolean
  retryDelay?: number
}

function parseJson(raw: string | null): unknown | undefined {
  if (!raw) return undefined
  try { return JSON.parse(raw) as unknown } catch { return undefined }
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function dashboardViewValue(state: AppState): Omit<AppState, 'view' | 'anchorDate'> {
  const { view: _view, anchorDate: _anchorDate, ...synced } = state
  return synced
}

function loadDashboardSync(state: AppState): SyncState {
  const saved = parseJson(localStorage.getItem(DASHBOARD_SYNC_KEY))
  return saved ? normalizeSyncState(saved) : createSyncStateFromAppState(state)
}

function saveDashboardSync(sync: SyncState) {
  saveMetadata(DASHBOARD_SYNC_KEY, sync)
}

function saveMetadata(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch { queueMicrotask(() => window.dispatchEvent(new Event('checkin-storage-error'))) }
}

function suiteForCloud(suite: SuiteSyncState, currentState: AppState): SuiteSyncState {
  const dashboard = suite.apps.dashboard
  if (!dashboard) return suite
  const sync = normalizeSyncState(dashboard.value)
  return {
    ...suite,
    apps: {
      ...suite.apps,
      dashboard: {
        ...dashboard,
        value: {
          ...dashboardViewValue(applySyncStateToAppState(currentState, sync)),
          _sync: sync,
        },
      },
    },
  }
}

function loadMeta(): SyncMeta {
  const parsed = parseJson(localStorage.getItem(SUITE_META_KEY))
  return parsed && typeof parsed === 'object' ? parsed as SyncMeta : {}
}

function saveMeta(meta: SyncMeta) {
  saveMetadata(SUITE_META_KEY, meta)
}

function getDeviceId(): string {
  const existing = localStorage.getItem(SUITE_DEVICE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  try { localStorage.setItem(SUITE_DEVICE_KEY, id) } catch { /* Continue with this session's device ID. */ }
  return id
}

function initialCode(): string {
  return cleanSyncCode(localStorage.getItem(SUITE_CODE_KEY) || localStorage.getItem(DAILY_CODE_KEY) || '')
}

export function useSuiteSync(state: AppState, setState: Dispatch<SetStateAction<AppState>>) {
  const [codeInput, setCodeInputState] = useState(initialCode)
  const [connectedCode, setConnectedCode] = useState('')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [status, setStatus] = useState<SyncStatus>('local')
  const [message, setMessage] = useState('仅保存在当前浏览器')
  const [toolDataRevision, setToolDataRevision] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<number>()
  const [initialMeta] = useState(loadMeta)
  const [initialDashboardSync] = useState(() => loadDashboardSync(state))
  const [deviceId] = useState(getDeviceId)
  const stateRef = useRef(state)
  const metaRef = useRef<SyncMeta>(initialMeta)
  const dashboardSyncRef = useRef<SyncState>(initialDashboardSync)
  const [initialAcceptedSync] = useState(() => {
    const saved = parseJson(localStorage.getItem(ACCEPTED_SYNC_KEY))
    return saved ? normalizeSyncState(saved) : initialDashboardSync
  })
  const acceptedDashboardSyncRef = useRef<SyncState>(initialAcceptedSync)
  const sessionRef = useRef<SyncSession | null>(null)
  const deviceIdRef = useRef(deviceId)
  const localRevisionRef = useRef(0)
  const acceptedRevisionRef = useRef(0)

  // Keep the latest click/edit visible to snapshot callbacks before passive effects run.
  useLayoutEffect(() => { stateRef.current = state }, [state])

  const applySuite = useCallback((suiteValue: unknown) => {
    const suite = normalizeSuiteState(suiteValue)
    let toolsChanged = false

    for (const id of SUITE_APP_IDS) {
      const payload = suite.apps[id]
      if (!payload) continue

      if (id === 'dashboard') {
        const syncedDashboard = normalizeSyncState(payload.value)
        const nextFingerprint = fingerprint(syncedDashboard)
        metaRef.current[id] = { fingerprint: nextFingerprint, updatedAt: payload.updatedAt, updatedBy: payload.updatedBy }
        dashboardSyncRef.current = syncedDashboard
        acceptedDashboardSyncRef.current = syncedDashboard
        saveMetadata(ACCEPTED_SYNC_KEY, syncedDashboard)
        saveDashboardSync(syncedDashboard)
        setState((current) => {
          const next = applySyncStateToAppState(current, syncedDashboard)
          if (fingerprint(dashboardViewValue(current)) !== fingerprint(dashboardViewValue(next))) saveRecovery(current, '同步前')
          return fingerprint(dashboardViewValue(current)) === fingerprint(dashboardViewValue(next)) ? current : next
        })
      } else {
        const nextFingerprint = fingerprint(payload.value)
        metaRef.current[id] = { fingerprint: nextFingerprint, updatedAt: payload.updatedAt, updatedBy: payload.updatedBy }
        const storageKey = TOOL_STORAGE_KEYS[id]
        if (fingerprint(parseJson(localStorage.getItem(storageKey))) !== nextFingerprint) {
          try { localStorage.setItem(storageKey, JSON.stringify(payload.value)) }
          catch {
            window.dispatchEvent(new Event('checkin-storage-error'))
            throw Object.assign(new Error('本机数据保存失败'), { code: 'local-storage-full' })
          }
          toolsChanged = true
        }
      }
    }

    saveMeta(metaRef.current)
    if (toolsChanged) setToolDataRevision((revision) => revision + 1)
  }, [setState])

  const collectLocalSuite = useCallback((): SuiteSyncState => {
    const dashboardSync = reconcileAppStateWithSyncState(
      dashboardSyncRef.current,
      stateRef.current,
      {
        updatedAt: Math.max(Date.now(), latestSyncTimestamp(dashboardSyncRef.current) + 1),
        updatedBy: deviceIdRef.current,
      },
    )
    dashboardSyncRef.current = dashboardSync
    saveDashboardSync(dashboardSync)
    const values: Partial<Record<SuiteAppId, unknown>> = { dashboard: dashboardSync }
    for (const id of Object.keys(TOOL_STORAGE_KEYS) as Exclude<SuiteAppId, 'dashboard'>[]) {
      const value = readToolValue(id)
      if (value !== undefined) values[id] = value
    }

    const apps: SuiteSyncState['apps'] = {}
    for (const id of SUITE_APP_IDS) {
      const value = values[id]
      if (value === undefined) continue
      const valueFingerprint = fingerprint(value)
      let meta = metaRef.current[id]

      if (!meta || meta.fingerprint !== valueFingerprint) {
        meta = {
          fingerprint: valueFingerprint,
          updatedAt: Math.max(Date.now(), (meta?.updatedAt ?? 0) + 1),
          updatedBy: deviceIdRef.current,
        }
        metaRef.current[id] = meta
      }
      apps[id] = { value, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy }
    }
    saveMeta(metaRef.current)
    return { version: 1, apps }
  }, [])

  const schedulePush = useCallback(() => {
    const session = sessionRef.current
    if (!session?.ready || session.disposed) return
    if (session.uploading) { session.pending = true; return }
    if (session.timer) clearTimeout(session.timer)
    setStatus('syncing')
    setMessage('正在同步…')
    session.timer = setTimeout(async () => {
      if (session.disposed) return
      session.timer = undefined
      session.uploading = true
      session.pending = false
      let failed = false
      const collectedRevision = localRevisionRef.current
      try {
        const { runTransaction, serverTimestamp } = await import('firebase/firestore')
        const local = collectLocalSuite()
        const merged = await runTransaction(session.document.firestore, async (transaction) => {
          const snapshot = await transaction.get(session.document)
          const rawSuite = snapshot.exists() ? snapshot.data().suite : undefined
          const remote = normalizeSuiteState(rawSuite)
          const localDashboard = local.apps.dashboard
          const remoteDashboard = remote.apps.dashboard
          if (localDashboard && remoteDashboard) {
            recordConflicts(acceptedDashboardSyncRef.current, normalizeSyncState(localDashboard.value), normalizeSyncState(remoteDashboard.value))
            localDashboard.value = rebaseLocalSyncChanges(
              acceptedDashboardSyncRef.current,
              normalizeSyncState(localDashboard.value),
              normalizeSyncState(remoteDashboard.value),
              deviceIdRef.current,
            )
            localDashboard.updatedAt = Math.max(localDashboard.updatedAt, remoteDashboard.updatedAt + 1)
            localDashboard.updatedBy = deviceIdRef.current
          }
          const next = mergeSuiteStates(remote, local)
          transaction.set(session.document, { suite: preserveSuiteApps(suiteForCloud(next, stateRef.current), rawSuite), updatedAt: serverTimestamp() })
          return next
        })
        if (!session.disposed) {
          // A newer click happened while this transaction was in flight.
          // Never paint the older transaction result over that local state.
          if (localRevisionRef.current !== collectedRevision) {
            session.pending = true
            return
          }
          acceptedRevisionRef.current = collectedRevision
          applySuite(merged)
          setStatus('synced')
          setMessage('已同步')
          setLastSyncedAt(Date.now())
          session.pending = false
          session.retryDelay = 5000
        }
      } catch (error) {
        failed = true
        console.error('Suite sync failed', error)
        if (!session.disposed) {
          const storageFull = (error as { code?: string })?.code === 'local-storage-full'
          setStatus('error')
          setMessage(storageFull ? '本机保存失败，请先导出备份并释放浏览器空间后重试' : navigator.onLine ? '同步失败，正在自动重试' : '当前离线')
          session.retryDelay = Math.min((session.retryDelay ?? 5000) * 2, 60000)
          if (navigator.onLine && !storageFull) session.timer = setTimeout(() => { session.timer = undefined; schedulePush() }, session.retryDelay)
        }
      } finally {
        session.uploading = false
        if (!failed && session.pending && !session.disposed) schedulePush()
      }
    }, PUSH_DEBOUNCE_MS)
  }, [applySuite, collectLocalSuite])

  useLayoutEffect(() => {
    const session = sessionRef.current
    const value = reconcileAppStateWithSyncState(
      dashboardSyncRef.current,
      state,
      {
        updatedAt: Math.max(Date.now(), latestSyncTimestamp(dashboardSyncRef.current) + 1),
        updatedBy: deviceIdRef.current,
      },
    )
    const nextFingerprint = fingerprint(value)
    const meta = metaRef.current.dashboard
    if (meta?.fingerprint === nextFingerprint) return
    dashboardSyncRef.current = value
    saveDashboardSync(value)
    metaRef.current.dashboard = { fingerprint: nextFingerprint, updatedAt: Date.now(), updatedBy: deviceIdRef.current }
    saveMeta(metaRef.current)
    localRevisionRef.current += 1
    if (session?.ready) schedulePush()
  }, [schedulePush, state])

  useEffect(() => {
    if (!connectedCode) return
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryDelay = 5000
    const session: SyncSession = { code: connectedCode, document: null as unknown as DocumentReference, ready: false, disposed: false }
    sessionRef.current?.unsubscribe?.()
    if (sessionRef.current?.timer) clearTimeout(sessionRef.current.timer)
    if (sessionRef.current) sessionRef.current.disposed = true
    sessionRef.current = session

    function retryConnection(error: unknown) {
      if (disposed) return
      session.ready = false
      if (session.timer) { clearTimeout(session.timer); session.timer = undefined }
      if (retryTimer) clearTimeout(retryTimer)
      setStatus('error')
      const code = (error as { code?: string })?.code ?? ''
      const permanent = ['local-storage-full', 'permission-denied', 'invalid-argument', 'resource-exhausted', 'auth/operation-not-allowed', 'auth/invalid-api-key'].includes(code)
      setMessage(code === 'local-storage-full' ? '本机保存失败，请先导出备份并释放浏览器空间后重试' : !navigator.onLine ? '当前离线，联网后自动重连' : permanent ? '同步连接失败，请检查同步码或权限后重试' : '同步连接失败，正在自动重连…')
      if (navigator.onLine && !permanent) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          if (disposed) return
          if (session.uploading) { retryConnection(error); return }
          session.unsubscribe?.()
          void start()
        }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 60000)
      }
    }

    async function start() {
      if (disposed) return
      setStatus('connecting')
      setMessage('正在连接…')
      try {
        const [{ getApp, getApps, initializeApp }, { getAuth, signInAnonymously }, { doc, getFirestore, onSnapshot, runTransaction, serverTimestamp }] = await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('firebase/firestore'),
        ])
        const firebaseApp = getApps().some((app) => app.name === 'project-suite-sync')
          ? getApp('project-suite-sync')
          : initializeApp(FIREBASE_CONFIG, 'project-suite-sync')
        const auth = getAuth(firebaseApp)
        if (!auth.currentUser) await signInAnonymously(auth)
        if (disposed) return
        const db = getFirestore(firebaseApp)
        session.document = doc(db, 'syncSpaces', await deriveSuiteDocumentId(connectedCode))
        const legacyDailyDocument = doc(db, 'syncSpaces', connectedCode)
        if (disposed) return

        const connectionResult = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(session.document)
          const legacyDailySnapshot = await transaction.get(legacyDailyDocument)
          const rawSuite = snapshot.exists() ? snapshot.data().suite : undefined
          let remote = normalizeSuiteState(rawSuite)
          const legacyDailyData = legacyDailySnapshot.exists() ? legacyDailySnapshot.data().data : undefined
          if (!remote.apps.daily && readToolValue('daily') === undefined && legacyDailyData) {
            remote = mergeSuiteStates(remote, {
              version: 1,
              apps: { daily: { value: legacyDailyData, updatedAt: 0, updatedBy: 'legacy-daily' } },
            })
          }
          const collectedRevision = localRevisionRef.current
          const local = collectLocalSuite()
          const localDashboard = local.apps.dashboard
          const remoteDashboard = remote.apps.dashboard
          if (localDashboard && remoteDashboard) {
            recordConflicts(acceptedDashboardSyncRef.current, normalizeSyncState(localDashboard.value), normalizeSyncState(remoteDashboard.value))
            localDashboard.value = rebaseLocalSyncChanges(
              acceptedDashboardSyncRef.current,
              normalizeSyncState(localDashboard.value),
              normalizeSyncState(remoteDashboard.value),
              deviceIdRef.current,
            )
            localDashboard.updatedAt = Math.max(localDashboard.updatedAt, remoteDashboard.updatedAt + 1)
            localDashboard.updatedBy = deviceIdRef.current
          }
          const next = mergeSuiteStates(remote, local)
          transaction.set(session.document, { suite: preserveSuiteApps(suiteForCloud(next, stateRef.current), rawSuite), updatedAt: serverTimestamp() })
          return { next, collectedRevision }
        })
        if (disposed) return
        try { localStorage.removeItem(DAILY_CODE_KEY) } catch { /* Legacy code is harmless when retained. */ }
        session.ready = true
        if (localRevisionRef.current === connectionResult.collectedRevision) {
          acceptedRevisionRef.current = connectionResult.collectedRevision
          applySuite(connectionResult.next)
          setStatus('synced')
          setMessage('已同步')
          setLastSyncedAt(Date.now())
        } else {
          // The user edited during the initial network request; keep it visible
          // and immediately upload it instead of applying the older response.
          schedulePush()
        }
        retryDelay = 5000

        session.unsubscribe = onSnapshot(session.document, (snapshot) => {
          try {
            if (disposed || !snapshot.exists()) return
            // Never accept a snapshot while any local edit is still unacknowledged.
            // A time-based guard fails on slow mobile connections.
            if (localRevisionRef.current !== acceptedRevisionRef.current) {
              schedulePush()
              return
            }
            const remote = normalizeSuiteState(snapshot.data().suite)
            const local = collectLocalSuite()
            const next = mergeSuiteStates(remote, local)
            applySuite(next)
            if (!suiteStatesEqual(next, remote)) schedulePush()
            else {
              setStatus('synced')
              setMessage('已同步')
              setLastSyncedAt(Date.now())
            }
          } catch (error) {
            console.error('Suite sync data could not be saved', error)
            retryConnection(error)
          }
        }, (error) => {
          console.error('Suite sync listener failed', error)
          retryConnection(error)
        })
      } catch (error) {
        console.error('Suite sync connection failed', error)
        retryConnection(error)
      }
    }

    void start()
    return () => {
      disposed = true
      session.disposed = true
      session.unsubscribe?.()
      if (session.timer) clearTimeout(session.timer)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [applySuite, collectLocalSuite, connectedCode, connectionAttempt, schedulePush])

  useEffect(() => {
    if (!connectedCode) return
    const storageToApp = Object.fromEntries(
      Object.entries(TOOL_STORAGE_KEYS).map(([id, key]) => [key, id]),
    ) as Record<string, Exclude<SuiteAppId, 'dashboard'>>
    const onStorage = (event: StorageEvent) => {
      const id = event.key ? storageToApp[event.key] : undefined
      if (!id || !sessionRef.current || sessionRef.current.disposed) return
      const value = parseJson(event.newValue)
      if (value === undefined) return
      const previousMeta = metaRef.current[id]
      metaRef.current[id] = {
        fingerprint: fingerprint(value),
        updatedAt: Math.max(Date.now(), (previousMeta?.updatedAt ?? 0) + 1),
        updatedBy: deviceIdRef.current,
      }
      saveMeta(metaRef.current)
      localRevisionRef.current += 1
      schedulePush()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [connectedCode, schedulePush])

  useEffect(() => {
    const restored = () => {
      // Invalidate once for the whole import, not once per subpage.
      localRevisionRef.current += 1
      setToolDataRevision(revision => revision + 1)
      schedulePush()
    }
    window.addEventListener('suite-tools-restored', restored)
    return () => window.removeEventListener('suite-tools-restored', restored)
  }, [schedulePush])

  const storeCode = useCallback((code: string) => {
    try {
      localStorage.setItem(SUITE_CODE_KEY, code)
      try { localStorage.removeItem(DAILY_CODE_KEY) } catch { /* The saved suite code takes precedence. */ }
      return true
    } catch {
      setStatus('error')
      setMessage('同步码未能保存，请先导出备份，再检查浏览器存储空间或隐私设置。')
      window.dispatchEvent(new Event('checkin-storage-error'))
      return false
    }
  }, [])

  const connect = useCallback((rawCode = codeInput) => {
    const normalized = cleanSyncCode(rawCode)
    setCodeInputState(normalized)
    if (normalized.length < 12) {
      setStatus('error')
      setMessage('同步码至少需要 12 位')
      return
    }
    if (!storeCode(normalized)) return
    if (normalized === connectedCode) setConnectionAttempt((attempt) => attempt + 1)
    else setConnectedCode(normalized)
  }, [codeInput, connectedCode, storeCode])

  const createAndConnect = useCallback(() => {
    const code = generateSyncCode()
    if (!storeCode(code)) return
    setCodeInputState(code)
    setConnectedCode(code)
  }, [storeCode])

  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(DAILY_CODE_KEY)
      localStorage.removeItem(SUITE_CODE_KEY)
    } catch {
      setStatus('error')
      setMessage('无法保存断开设置，请检查浏览器隐私设置后重试。')
      return
    }
    setConnectedCode('')
    setStatus('local')
    setMessage('已断开，数据仍保存在当前浏览器')
  }, [])

  useEffect(() => {
    const saved = initialCode()
    if (saved.length >= 12) setConnectedCode(saved)
  }, [])

  useEffect(() => {
    const reconnectWhenOnline = () => {
      if (connectedCode && status === 'error') setConnectionAttempt((attempt) => attempt + 1)
    }
    window.addEventListener('online', reconnectWhenOnline)
    return () => window.removeEventListener('online', reconnectWhenOnline)
  }, [connectedCode, status])

  return {
    codeInput,
    setCodeInput: (value: string) => setCodeInputState(cleanSyncCode(value)),
    connectedCode,
    status,
    message,
    connect,
    createAndConnect,
    disconnect,
    toolDataRevision,
    lastSyncedAt,
  }
}
