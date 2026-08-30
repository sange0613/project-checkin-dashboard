import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import { createInitialState, type AppState } from '../domain/types'
import { useSuiteSync } from './useSuiteSync'

const firestoreMock = vi.hoisted(() => ({
  runTransaction: vi.fn(),
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
    onSnapshot: () => vi.fn(),
    runTransaction: firestoreMock.runTransaction,
    serverTimestamp: () => 'server-time',
  }
})

beforeEach(() => {
  localStorage.clear()
  firestoreMock.runTransaction.mockReset()
})

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
