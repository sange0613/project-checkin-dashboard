import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DocumentReference, Unsubscribe } from 'firebase/firestore'
import type { AppState } from '../domain/types'
import {
  SUITE_APP_IDS,
  cleanSyncCode,
  deriveSuiteDocumentId,
  generateSyncCode,
  mergeSuiteStates,
  normalizeSuiteState,
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
const DAILY_CODE_KEY = 'calorie-tracker-v1-sync-code'
const TOOL_STORAGE_KEYS: Record<Exclude<SuiteAppId, 'dashboard'>, string> = {
  daily: 'calorie-tracker-v1',
  checklist: 'qingdan-app-state-v2',
}

type SyncMeta = Partial<Record<SuiteAppId, { fingerprint: string; updatedAt: number; updatedBy: string }>>
type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'error'

type SyncSession = {
  code: string
  document: DocumentReference
  unsubscribe?: Unsubscribe
  timer?: ReturnType<typeof setTimeout>
  ready: boolean
  disposed: boolean
}

function parseJson(raw: string | null): unknown | undefined {
  if (!raw) return undefined
  try { return JSON.parse(raw) as unknown } catch { return undefined }
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function dashboardValue(state: AppState): Omit<AppState, 'view' | 'anchorDate'> {
  const { view: _view, anchorDate: _anchorDate, ...synced } = state
  return synced
}

function isDashboardValue(value: unknown): value is Omit<AppState, 'view' | 'anchorDate'> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppState>
  return typeof candidate.title === 'string' && Array.isArray(candidate.projects) && Boolean(candidate.checkins)
    && Array.isArray(candidate.randomCategories) && Array.isArray(candidate.stageProjects)
}

function loadMeta(): SyncMeta {
  const parsed = parseJson(localStorage.getItem(SUITE_META_KEY))
  return parsed && typeof parsed === 'object' ? parsed as SyncMeta : {}
}

function saveMeta(meta: SyncMeta) {
  localStorage.setItem(SUITE_META_KEY, JSON.stringify(meta))
}

function getDeviceId(): string {
  const existing = localStorage.getItem(SUITE_DEVICE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(SUITE_DEVICE_KEY, id)
  return id
}

function readToolValue(id: Exclude<SuiteAppId, 'dashboard'>): unknown | undefined {
  return parseJson(localStorage.getItem(TOOL_STORAGE_KEYS[id]))
}

function initialCode(): string {
  return cleanSyncCode(localStorage.getItem(SUITE_CODE_KEY) || localStorage.getItem(DAILY_CODE_KEY) || '')
}

export function useSuiteSync(state: AppState, setState: Dispatch<SetStateAction<AppState>>) {
  const [codeInput, setCodeInputState] = useState(initialCode)
  const [connectedCode, setConnectedCode] = useState('')
  const [status, setStatus] = useState<SyncStatus>('local')
  const [message, setMessage] = useState('仅保存在当前浏览器')
  const [toolDataRevision, setToolDataRevision] = useState(0)
  const stateRef = useRef(state)
  const metaRef = useRef<SyncMeta>(loadMeta())
  const sessionRef = useRef<SyncSession | null>(null)
  const pushRef = useRef<() => void>(() => undefined)
  const deviceIdRef = useRef(getDeviceId())

  useEffect(() => { stateRef.current = state }, [state])

  const applySuite = useCallback((suiteValue: unknown) => {
    const suite = normalizeSuiteState(suiteValue)
    let toolsChanged = false

    for (const id of SUITE_APP_IDS) {
      const payload = suite.apps[id]
      if (!payload) continue
      const nextFingerprint = fingerprint(payload.value)
      metaRef.current[id] = { fingerprint: nextFingerprint, updatedAt: payload.updatedAt, updatedBy: payload.updatedBy }

      if (id === 'dashboard') {
        const syncedDashboard = payload.value
        if (isDashboardValue(syncedDashboard) && fingerprint(dashboardValue(stateRef.current)) !== nextFingerprint) {
          setState((current) => ({ ...current, ...syncedDashboard, view: current.view, anchorDate: current.anchorDate }))
        }
      } else {
        const storageKey = TOOL_STORAGE_KEYS[id]
        if (fingerprint(parseJson(localStorage.getItem(storageKey))) !== nextFingerprint) {
          localStorage.setItem(storageKey, JSON.stringify(payload.value))
          toolsChanged = true
        }
      }
    }

    saveMeta(metaRef.current)
    if (toolsChanged) setToolDataRevision((revision) => revision + 1)
  }, [setState])

  const collectLocalSuite = useCallback((): SuiteSyncState => {
    const values: Partial<Record<SuiteAppId, unknown>> = { dashboard: dashboardValue(stateRef.current) }
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
        meta = { fingerprint: valueFingerprint, updatedAt: Date.now(), updatedBy: deviceIdRef.current }
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
    if (session.timer) clearTimeout(session.timer)
    setStatus('syncing')
    setMessage('正在同步…')
    session.timer = setTimeout(async () => {
      if (session.disposed) return
      try {
        const { runTransaction, serverTimestamp } = await import('firebase/firestore')
        const local = collectLocalSuite()
        const merged = await runTransaction(session.document.firestore, async (transaction) => {
          const snapshot = await transaction.get(session.document)
          const remote = normalizeSuiteState(snapshot.exists() ? snapshot.data().suite : undefined)
          const next = mergeSuiteStates(remote, local)
          transaction.set(session.document, { suite: next, updatedAt: serverTimestamp() })
          return next
        })
        if (!session.disposed) {
          applySuite(merged)
          setStatus('synced')
          setMessage('已同步')
        }
      } catch (error) {
        console.error('Suite sync failed', error)
        if (!session.disposed) {
          setStatus('error')
          setMessage(navigator.onLine ? '同步失败，请重试' : '当前离线')
        }
      }
    }, 800)
  }, [applySuite, collectLocalSuite])

  useEffect(() => { pushRef.current = schedulePush }, [schedulePush])

  useEffect(() => {
    const session = sessionRef.current
    if (!session?.ready) return
    const value = dashboardValue(state)
    const nextFingerprint = fingerprint(value)
    const meta = metaRef.current.dashboard
    if (meta?.fingerprint === nextFingerprint) return
    metaRef.current.dashboard = { fingerprint: nextFingerprint, updatedAt: Date.now(), updatedBy: deviceIdRef.current }
    saveMeta(metaRef.current)
    schedulePush()
  }, [schedulePush, state])

  useEffect(() => {
    if (!connectedCode) return
    let disposed = false
    const session: SyncSession = { code: connectedCode, document: null as unknown as DocumentReference, ready: false, disposed: false }
    sessionRef.current?.unsubscribe?.()
    if (sessionRef.current?.timer) clearTimeout(sessionRef.current.timer)
    if (sessionRef.current) sessionRef.current.disposed = true
    sessionRef.current = session

    async function start() {
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
        const db = getFirestore(firebaseApp)
        session.document = doc(db, 'syncSpaces', await deriveSuiteDocumentId(connectedCode))
        const legacyDailyDocument = doc(db, 'syncSpaces', connectedCode)

        const merged = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(session.document)
          const legacyDailySnapshot = await transaction.get(legacyDailyDocument)
          let remote = normalizeSuiteState(snapshot.exists() ? snapshot.data().suite : undefined)
          const legacyDailyData = legacyDailySnapshot.exists() ? legacyDailySnapshot.data().data : undefined
          if (!remote.apps.daily && readToolValue('daily') === undefined && legacyDailyData) {
            remote = mergeSuiteStates(remote, {
              version: 1,
              apps: { daily: { value: legacyDailyData, updatedAt: 0, updatedBy: 'legacy-daily' } },
            })
          }
          const local = collectLocalSuite()
          const next = mergeSuiteStates(remote, local)
          transaction.set(session.document, { suite: next, updatedAt: serverTimestamp() })
          return next
        })
        if (disposed) return
        applySuite(merged)
        localStorage.removeItem(DAILY_CODE_KEY)
        session.ready = true
        setStatus('synced')
        setMessage('已同步')

        session.unsubscribe = onSnapshot(session.document, (snapshot) => {
          if (disposed || !snapshot.exists()) return
          const remote = normalizeSuiteState(snapshot.data().suite)
          const local = collectLocalSuite()
          const next = mergeSuiteStates(remote, local)
          applySuite(next)
          if (!suiteStatesEqual(next, remote)) schedulePush()
          else {
            setStatus('synced')
            setMessage('已同步')
          }
        }, (error) => {
          console.error('Suite sync listener failed', error)
          if (!disposed) {
            setStatus('error')
            setMessage('同步连接中断')
          }
        })
      } catch (error) {
        console.error('Suite sync connection failed', error)
        if (!disposed) {
          setStatus('error')
          setMessage(navigator.onLine ? '连接失败，请检查同步码' : '当前离线')
        }
      }
    }

    void start()
    return () => {
      disposed = true
      session.disposed = true
      session.unsubscribe?.()
      if (session.timer) clearTimeout(session.timer)
    }
  }, [applySuite, collectLocalSuite, connectedCode, schedulePush])

  useEffect(() => {
    if (!connectedCode) return
    const storageToApp = Object.fromEntries(
      Object.entries(TOOL_STORAGE_KEYS).map(([id, key]) => [key, id]),
    ) as Record<string, Exclude<SuiteAppId, 'dashboard'>>
    const onStorage = (event: StorageEvent) => {
      const id = event.key ? storageToApp[event.key] : undefined
      if (!id || !sessionRef.current?.ready) return
      const value = parseJson(event.newValue)
      if (value === undefined) return
      metaRef.current[id] = { fingerprint: fingerprint(value), updatedAt: Date.now(), updatedBy: deviceIdRef.current }
      saveMeta(metaRef.current)
      schedulePush()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [connectedCode, schedulePush])

  const connect = useCallback((rawCode = codeInput) => {
    const normalized = cleanSyncCode(rawCode)
    setCodeInputState(normalized)
    if (normalized.length < 12) {
      setStatus('error')
      setMessage('同步码至少需要 12 位')
      return
    }
    localStorage.setItem(SUITE_CODE_KEY, normalized)
    localStorage.removeItem(DAILY_CODE_KEY)
    setConnectedCode(normalized)
  }, [codeInput])

  const createAndConnect = useCallback(() => {
    const code = generateSyncCode()
    setCodeInputState(code)
    localStorage.setItem(SUITE_CODE_KEY, code)
    localStorage.removeItem(DAILY_CODE_KEY)
    setConnectedCode(code)
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(SUITE_CODE_KEY)
    localStorage.removeItem(DAILY_CODE_KEY)
    setConnectedCode('')
    setStatus('local')
    setMessage('已断开，数据仍保存在当前浏览器')
  }, [])

  useEffect(() => {
    const saved = initialCode()
    if (saved.length >= 12) setConnectedCode(saved)
  }, [])

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
  }
}
