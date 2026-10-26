import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { createInitialState, type AppState } from '../domain/types'
import { useSuiteSync } from './useSuiteSync'
import { createSyncStateFromAppState } from '../domain/cloudSync'
import { normalizeTimeJournal, type TimeJournal } from '../sync/timeJournalSync'
import { normalizeTodoSync, todoWorkspace, TODO_SYNC_KEY } from '../sync/todoSync'

const firestoreMock = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}))

vi.mock('../sync/suiteSyncModel', async importOriginal => ({
  ...await importOriginal<typeof import('../sync/suiteSyncModel')>(),
  deriveSuiteDocumentId: async (code: string) => `test-${code}`,
}))

vi.mock('firebase/app', () => ({
  getApp: vi.fn(),
  getApps: () => [],
  initializeApp: () => ({ name: 'project-suite-sync' }),
}))

vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: {} }),
  signInAnonymously: vi.fn(),
}))

vi.mock('firebase/firestore', () => {
  const db = { name: 'test-db' }
  return {
    doc: (_db: unknown, ...parts: string[]) => ({ firestore: db, path: parts.join('/') }),
    getFirestore: () => db,
    onSnapshot: (...args: unknown[]) => firestoreMock.onSnapshot(...args),
    runTransaction: firestoreMock.runTransaction,
    serverTimestamp: () => 'server-time',
  }
})

beforeEach(() => {
  localStorage.clear()
  firestoreMock.runTransaction.mockReset()
  firestoreMock.onSnapshot.mockReset().mockReturnValue(vi.fn())
})

test('automatically reconnects after the first connection transaction fails', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'FIRSTRETRY12345')
  firestoreMock.runTransaction.mockRejectedValueOnce(new Error('temporary network failure')).mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: vi.fn() }))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  try {
    await vi.waitFor(async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }); expect(result.current.status).toBe('error') })
    expect(result.current.message).toContain('自动重连')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.status).toBe('synced')
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(2)
    expect(result.current.connectedCode).toBe('FIRSTRETRY12345')
  } finally { unmount(); vi.useRealTimers(); error.mockRestore() }
})

test('cancels connection retries when disconnected and does not retry permission errors', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'STOPRETRY123456')
  firestoreMock.runTransaction.mockRejectedValue(new Error('temporary'))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  try {
    await vi.waitFor(async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }); expect(result.current.status).toBe('error') })
    act(() => result.current.disconnect())
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('local')
    firestoreMock.runTransaction.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    act(() => result.current.connect('PERMISSION123456'))
    await vi.waitFor(async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }); expect(result.current.status).toBe('error') })
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(2)
    expect(result.current.message).toContain('权限')
  } finally { unmount(); vi.useRealTimers(); error.mockRestore() }
})

test('reconnects a failed listener without waiting for a new browser online event', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'LISTENER1234567')
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: vi.fn() }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  try {
    act(() => firestoreMock.onSnapshot.mock.calls[0][2](new Error('connection interrupted')))
    expect(result.current.status).toBe('error')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.current.status).toBe('synced')
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(2)
  } finally { unmount(); vi.useRealTimers(); error.mockRestore() }
})

test('failed sync-code persistence shows a warning without changing the current code', () => {
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
    if (key === 'project-suite-sync-code-v1') throw new DOMException('full', 'QuotaExceededError')
    original.call(this, key, value)
  })
  try {
    act(() => result.current.createAndConnect())
    expect(result.current.codeInput).toBe('')
    expect(result.current.connectedCode).toBe('')
    expect(result.current.message).toContain('同步码未能保存')
    act(() => result.current.connect('UNSAVEDCODE1234'))
    expect(result.current.connectedCode).toBe('')
    expect(result.current.status).toBe('error')
    expect(localStorage.getItem('project-suite-sync-code-v1')).toBeNull()
  } finally { unmount(); spy.mockRestore() }
})

test('uploads restored subpages with the existing code and refreshes integrated tools', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'RESTORETOOLS1234')
  const writes: any[] = []
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: (_doc: unknown, value: unknown) => writes.push(value) }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  vi.useFakeTimers()
  try {
    act(() => {
      localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(normalizeTodoSync({ boards: [{ id: 'b', name: '导入', columns: [{ id: 'todo', label: '待办' }], tasks: [] }], activeBoardId: 'b' })))
      window.dispatchEvent(new Event('suite-tools-restored'))
    })
    expect(result.current.toolDataRevision).toBeGreaterThan(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(result.current.status).toBe('synced')
    expect(writes.at(-1).suite.apps.todo).toBeDefined()
    expect(result.current.connectedCode).toBe('RESTORETOOLS1234')
  } finally { unmount(); vi.useRealTimers() }
})

test('reports storage-full errors from remote subpages without crashing or repeatedly reconnecting', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'FULLSTORAGE12345')
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: vi.fn() }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  const original = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
    if (key === TODO_SYNC_KEY) throw new DOMException('full', 'QuotaExceededError')
    original.call(this, key, value)
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  try {
    act(() => firestoreMock.onSnapshot.mock.calls[0][1]({ exists: () => true, data: () => ({ suite: { version: 1, apps: { todo: { value: { version: 1, fields: {} }, updatedAt: 1, updatedBy: 'remote' } } } }) }))
    expect(result.current.status).toBe('error')
    expect(result.current.message).toContain('释放浏览器空间')
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(1)
  } finally { unmount(); vi.useRealTimers(); storage.mockRestore(); error.mockRestore() }
})

test('retries a failed dashboard upload without discarding the local edit', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'RETRYDASHBOARD123')
  const writes: any[] = []
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: (_doc: unknown, value: unknown) => writes.push(value) }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return { sync: useSuiteSync(state, setState), setState } })
  await waitFor(() => expect(result.current.sync.status).toBe('synced'))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers()
  try {
    firestoreMock.runTransaction.mockRejectedValueOnce(new Error('temporary failure'))
    act(() => result.current.setState(current => ({ ...current, title: '等待上传的修改' })))
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(result.current.sync.status).toBe('error')
    await act(async () => { await vi.advanceTimersByTimeAsync(12500) })
    expect(result.current.sync.status).toBe('synced')
    expect(JSON.stringify(writes.at(-1))).toContain('等待上传的修改')
  } finally { unmount(); vi.useRealTimers(); errors.mockRestore() }
})

test('serializes dashboard uploads while preserving a click made during the request', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'QUEUEDASHBOARD123')
  const writes: any[] = []
  const transaction = async (_db: unknown, callback: any) => callback({ get: async () => ({ exists: () => false }), set: (_doc: unknown, value: unknown) => writes.push(value) })
  firestoreMock.runTransaction.mockImplementation(transaction)
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return { sync: useSuiteSync(state, setState), setState } })
  await waitFor(() => expect(result.current.sync.status).toBe('synced'))
  let release = () => {}
  const waiting = new Promise<void>(resolve => { release = resolve })
  vi.useFakeTimers()
  try {
    firestoreMock.runTransaction.mockImplementationOnce(async (db, callback) => { const next = await transaction(db, callback); await waiting; return next })
    act(() => result.current.setState(current => ({ ...current, title: '第一次修改' })))
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    act(() => result.current.setState(current => ({ ...current, title: '第二次修改' })))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(2)
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(2500) })
    expect(firestoreMock.runTransaction).toHaveBeenCalledTimes(3)
    expect(result.current.sync.status).toBe('synced')
    expect(JSON.stringify(writes.at(-1))).toContain('第二次修改')
  } finally { release(); unmount(); vi.useRealTimers() }
})

test('merges todo data into the shared code and keeps other app payloads', async () => {
  const workspace = (id: string) => ({ boards: [{ id, name: id, columns: [{ id: 'todo', label: '待办' }], tasks: [{ id, title: id, notes: '', due: '', status: 'todo' }] }], activeBoardId: id })
  localStorage.setItem('project-suite-sync-code-v1', 'TODOSYNCQA123')
  localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(normalizeTodoSync(workspace('local'))))
  const writes: any[] = []
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ suite: { version: 1, apps: { todo: { value: normalizeTodoSync(workspace('remote')), updatedAt: 1, updatedBy: 'b' }, text: { value: { version: 1, entries: [{ id: 'template' }] }, updatedAt: 1, updatedBy: 'b' } } } }) }),
    set: (_document: unknown, value: unknown) => writes.push(value),
  }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  const imported = todoWorkspace(JSON.parse(localStorage.getItem(TODO_SYNC_KEY)!))
  expect(imported.boards.map(board => board.id).sort()).toEqual(['local', 'remote'])
  expect(writes[0].suite.apps.text.value.entries[0].id).toBe('template')
  unmount()
})

test('preserves cloud data belonging to a newer app version', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'FORWARDCOMPAT123')
  const future = { value: { records: ['keep'] }, updatedAt: 10, updatedBy: 'newer' }
  const writes: any[] = []
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ suite: { version: 1, apps: { future } } }) }),
    set: (_document: unknown, value: unknown) => writes.push(value),
  }))
  const { result, unmount } = renderHook(() => { const [state, setState] = useState(createInitialState()); return useSuiteSync(state, setState) })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  expect(writes[0].suite.apps.future).toEqual(future)
  unmount()
})

test('synchronizes local and remote layout templates using the existing suite document', async () => {
  localStorage.setItem('project-suite-sync-code-v1', 'LAYOUTSYNCQA12')
  localStorage.setItem('zijian-layout-library-sync-v1', JSON.stringify({ version: 1, entries: [{ id: 'local', record: { id: 'local' }, updatedAt: 10, updatedBy: 'a' }] }))
  const writes: unknown[] = []
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ suite: { apps: { text: { value: { version: 1, entries: [{ id: 'remote', record: { id: 'remote' }, updatedAt: 20, updatedBy: 'b' }] }, updatedAt: 20, updatedBy: 'b' } } } }) }),
    set: (_document: unknown, value: unknown) => writes.push(value),
  }))
  const { result, unmount } = renderHook(() => {
    const [state, setState] = useState(createInitialState())
    return useSuiteSync(state, setState)
  })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  expect(JSON.parse(localStorage.getItem('zijian-layout-library-sync-v1')!).entries.map((entry: { id: string }) => entry.id).sort()).toEqual(['local', 'remote'])
  expect(writes).toHaveLength(1)
  unmount()
})

test('uploads existing time history and receives other dates with the original suite code', async () => {
  const block = { id: 'local', start: 0, end: 60, category: 'work', title: '' }
  const remote = { id: 'remote', start: 0, end: 120, category: 'rest', title: '' }
  const writes: { suite: { apps: { time?: { value: TimeJournal } } } }[] = []
  localStorage.setItem('project-suite-sync-code-v1', 'TIMEJOURNALQA12')
  localStorage.setItem('time-noticed.v1', JSON.stringify({ '2026-10-13': [block] }))
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async (document: { path: string }) => ({
      exists: () => document.path !== 'syncSpaces/TIMEJOURNALQA12',
      data: () => ({ suite: { apps: { time: { value: normalizeTimeJournal({ '2026-10-14': [remote] }), updatedAt: 10, updatedBy: 'other' } } } }),
    }),
    set: (_document: unknown, value: typeof writes[number]) => writes.push(value),
  }))
  const { result, unmount } = renderHook(() => {
    const [state, setState] = useState(createInitialState())
    return useSuiteSync(state, setState)
  })
  await waitFor(() => expect(result.current.status).toBe('synced'))
  expect(writes[0].suite.apps.time?.value.days['2026-10-13']).toEqual([block])
  expect(writes[0].suite.apps.time?.value.days['2026-10-14']).toEqual([remote])
  expect(JSON.parse(localStorage.getItem('time-noticed.v1') || '{}').days['2026-10-14']).toEqual([remote])
  unmount()
})

test('does not overwrite an iframe time edit while the initial connection is in flight', async () => {
  let release = () => {}
  let collected = () => {}
  const waiting = new Promise<void>(resolve => { release = resolve })
  const collection = new Promise<void>(resolve => { collected = resolve })
  let count = 0
  firestoreMock.runTransaction.mockImplementation(async (_db, callback) => {
    const result = await callback({ get: async () => ({ exists: () => false, data: () => ({}) }), set: () => {} })
    if (++count === 1) { collected(); await waiting }
    return result
  })
  localStorage.setItem('project-suite-sync-code-v1', 'TIMEJOURNALQA12')
  localStorage.setItem('time-noticed.v1', JSON.stringify(normalizeTimeJournal({ '2026-10-15': [] })))
  const { result, unmount } = renderHook(() => {
    const [state, setState] = useState(createInitialState())
    return useSuiteSync(state, setState)
  })
  await collection
  const edited = normalizeTimeJournal({ '2026-10-15': [{ id: 'new', start: 0, end: 60, category: 'work', title: '' }] }, { updatedAt: Date.now(), updatedBy: 'iframe' })
  act(() => {
    localStorage.setItem('time-noticed.v1', JSON.stringify(edited))
    window.dispatchEvent(new StorageEvent('storage', { key: 'time-noticed.v1', newValue: JSON.stringify(edited), storageArea: localStorage }))
  })
  release()
  await waitFor(() => expect(result.current.status).toBe('syncing'))
  expect(JSON.parse(localStorage.getItem('time-noticed.v1') || '{}')).toEqual(edited)
  unmount()
})

test('preserves pending edits after a reload using the last acknowledged checkpoint', async () => {
  const base = createInitialState()
  const remote = createSyncStateFromAppState({ ...base, title: '另一设备的新标题' })
  remote.settings.title.updatedAt = Date.now() + 10000
  remote.settings.title.updatedBy = 'remote'
  localStorage.setItem('project-suite-dashboard-accepted-v1', JSON.stringify(createSyncStateFromAppState(base)))
  localStorage.setItem('project-suite-sync-code-v1', 'SYNCFIXTEST12')
  firestoreMock.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: {
    get: () => Promise<unknown>; set: () => void
  }) => Promise<unknown>) => callback({
    get: async () => ({ exists: () => true, data: () => ({ suite: { version: 1, apps: { dashboard: { value: remote, updatedAt: Date.now() + 10000, updatedBy: 'remote' } } } }) }),
    set: () => {},
  }))
  const { result, unmount } = renderHook(() => {
    const [state, setState] = useState({ ...base, title: '离线修改尚未上传' })
    const sync = useSuiteSync(state, setState)
    return { state, sync }
  })
  await waitFor(() => expect(result.current.sync.status).toBe('synced'))
  expect(result.current.state.title).toBe('离线修改尚未上传')
  expect(JSON.parse(localStorage.getItem('project-sync-conflicts-v1') ?? '[]')).toHaveLength(1)
  unmount()
})

test.each([undefined, ['{"label":"测试","short":"测","href":"https://example.com"}']])(
  'connects with JSON-safe cloud data when shortcut settings are %s', async (shortcutConfig) => {
    const writes: unknown[] = []
    function assertDefined(value: unknown) {
      if (value === undefined) throw new Error('Unsupported field value: undefined')
      if (value && typeof value === 'object') Object.values(value).forEach(assertDefined)
    }
    firestoreMock.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: {
      get: () => Promise<{ exists: () => boolean; data: () => Record<string, never> }>
      set: (document: unknown, value: unknown) => void
    }) => Promise<unknown>) => callback({
      get: async () => ({ exists: () => false, data: () => ({}) }),
      set: (_document, value) => { assertDefined(value); writes.push(value) },
    }))
    localStorage.setItem('project-suite-sync-code-v1', 'SYNCFIXTEST12')
    const { result, unmount } = renderHook(() => {
      const [state, setState] = useState<AppState>(() => ({
        ...createInitialState(), ...(shortcutConfig ? { shortcutConfig } : {}),
      }))
      return useSuiteSync(state, setState)
    })
    await waitFor(() => expect(result.current.status).toBe('synced'))
    expect(writes.length).toBeGreaterThan(0)
    if (shortcutConfig) expect(JSON.stringify(writes)).toContain('example.com')
    unmount()
  },
)

test('does not apply an older connection result over an edit made while it was in flight', async () => {
  let releaseFirstTransaction = () => {}
  let markFirstCollectionComplete = () => {}
  const firstTransactionReleased = new Promise<void>((resolve) => { releaseFirstTransaction = resolve })
  const firstCollectionComplete = new Promise<void>((resolve) => { markFirstCollectionComplete = resolve })
  let transactionCount = 0

  firestoreMock.runTransaction.mockImplementation(async (_db: unknown, callback: (transaction: {
    get: () => Promise<{ exists: () => boolean; data: () => Record<string, never> }>
    set: () => void
  }) => Promise<unknown>) => {
    const result = await callback({
      get: async () => ({ exists: () => false, data: () => ({}) }),
      set: () => {},
    })
    transactionCount += 1
    if (transactionCount === 1) {
      markFirstCollectionComplete()
      await firstTransactionReleased
    }
    return result
  })

  localStorage.setItem('project-suite-sync-code-v1', 'SYNCFIXTEST12')
  const { result, unmount } = renderHook(() => {
    const [state, setState] = useState<AppState>(createInitialState())
    const sync = useSuiteSync(state, setState)
    return { state, setState, sync }
  })

  await firstCollectionComplete
  act(() => {
    result.current.setState((current) => ({
      ...current,
      notDoingItems: ['刚刚输入的新内容', ...current.notDoingItems.slice(1)],
    }))
  })
  expect(result.current.state.notDoingItems[0]).toBe('刚刚输入的新内容')

  releaseFirstTransaction()
  await waitFor(() => expect(result.current.sync.status).toBe('syncing'))
  expect(result.current.state.notDoingItems[0]).toBe('刚刚输入的新内容')
  unmount()
})
