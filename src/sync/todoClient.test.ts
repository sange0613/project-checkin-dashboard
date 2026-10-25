import { startTodoSync } from './todoClient'
import { type TodoWorkspace } from './todoSync'

const mocked = vi.hoisted(() => ({ transaction: vi.fn(), writes: vi.fn(), firestore: vi.fn() }))
vi.mock('firebase/app', () => ({ getApps: () => [], getApp: () => ({}), initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: {} }), signInAnonymously: vi.fn() }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }), getFirestore: mocked.firestore,
  serverTimestamp: () => 0, onSnapshot: () => vi.fn(), runTransaction: mocked.transaction,
}))
let removeListeners: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); document.body.replaceChildren()
  localStorage.setItem('project-suite-sync-code-v1', 'TODOTESTCODE12345')
  mocked.writes.mockReset(); mocked.transaction.mockReset()
  mocked.firestore.mockReset(); mocked.firestore.mockReturnValue({})
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    add(type, listener, options); removeListeners.push(() => window.removeEventListener(type, listener, options))
  })
  mocked.transaction.mockImplementation(async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: mocked.writes }))
})
afterEach(() => { removeListeners.forEach(remove => remove()); removeListeners = []; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren() })
function adapter() {
  let workspace: TodoWorkspace = { boards: [{ id: 'b', name: '看板', columns: [{ id: 'todo', label: '待办' }], tasks: [{ id: 't', title: '任务', notes: '', due: '', status: 'todo' }] }], activeBoardId: 'b' }
  let listener = () => {}
  return {
    api: { read: () => structuredClone(workspace), seed: () => structuredClone(workspace), apply: (next: TodoWorkspace) => { workspace = next }, busy: () => false, subscribe: (next: () => void) => { listener = next }, status: vi.fn() },
    change: () => { workspace.boards[0].tasks[0].title = '新修改'; listener() },
    switchOnly: () => listener(),
  }
}
test('retries a transient upload failure without requiring a manual reconnect', async () => {
  mocked.transaction.mockRejectedValueOnce(new Error('temporary network failure'))
  const instance = adapter()
  await startTodoSync(instance.api)
  expect(mocked.transaction).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(10000)
  expect(mocked.transaction).toHaveBeenCalledTimes(2)
  expect(instance.api.status).toHaveBeenLastCalledWith('已同步')
})
test('uploads a newer edit even when its debounce fired during a slow request', async () => {
  let release = () => {}
  const waiting = new Promise<void>(resolve => { release = resolve })
  mocked.transaction.mockImplementationOnce(async (_db, callback) => {
    const next = await callback({ get: async () => ({ exists: () => false }), set: mocked.writes })
    await waiting
    return next
  })
  const instance = adapter()
  const started = startTodoSync(instance.api)
  for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(0)
  expect(mocked.transaction).toHaveBeenCalledTimes(1)
  instance.change()
  await vi.advanceTimersByTimeAsync(3000)
  expect(mocked.transaction).toHaveBeenCalledTimes(1)
  release(); await started
  await vi.advanceTimersByTimeAsync(5000)
  expect(mocked.transaction).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(mocked.writes.mock.calls.at(-1))).toContain('新修改')
  expect(instance.api.status).toHaveBeenLastCalledWith('已同步')
})
test('changing the active view without changing data does not upload again', async () => {
  const instance = adapter()
  await startTodoSync(instance.api)
  instance.switchOnly()
  await vi.advanceTimersByTimeAsync(10000)
  expect(mocked.transaction).toHaveBeenCalledTimes(1)
})
test('disconnect stops scheduled retries', async () => {
  mocked.transaction.mockRejectedValueOnce(new Error('temporary network failure'))
  await startTodoSync(adapter().api)
  document.querySelector<HTMLButtonElement>('[data-disconnect]')!.click()
  await vi.advanceTimersByTimeAsync(60000)
  expect(mocked.transaction).toHaveBeenCalledTimes(1)
})
test('automatically reconnects when the initial connection fails', async () => {
  mocked.firestore.mockImplementationOnce(() => { throw new Error('unavailable') })
  const instance = adapter()
  await startTodoSync(instance.api)
  expect(mocked.transaction).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(10000)
  await vi.waitFor(() => expect(mocked.transaction).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(instance.api.status).toHaveBeenLastCalledWith('已同步'))
})
