import { latestTodoTimestamp, mergeTodoSync, normalizeTodoSync, reconcileTodoSync, todoWorkspace, TODO_SYNC_KEY, type TodoWorkspace, type TodoSync } from './todoSync'
import { cleanSyncCode, deriveSuiteDocumentId } from './suiteSyncModel'

type Adapter = {
  read: () => TodoWorkspace
  seed: () => TodoWorkspace
  apply: (workspace: TodoWorkspace) => void
  busy: () => boolean
  subscribe: (listener: () => void) => void
  status: (message: string) => void
}
const CODE_KEY = 'project-suite-sync-code-v1'
const DEVICE_KEY = 'project-suite-device-id-v1'
const PREFIX = 'liubai-suite:'
function readSync(): TodoSync {
  try { return normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY) ?? 'null')) } catch { return normalizeTodoSync(undefined) }
}
function trustedParent(): string | undefined {
  if (parent === window || !new URLSearchParams(location.search).has('suite')) return
  try {
    const url = new URL(document.referrer)
    if ((url.origin === 'https://sange0613.github.io' && url.pathname.startsWith('/project-checkin-dashboard/')) || (['localhost', '127.0.0.1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol))) return url.origin
  } catch { /* Standalone page or no referrer: use direct sync. */ }
}

export async function startTodoSync(api: Adapter) {
  const device = localStorage.getItem(DEVICE_KEY) || crypto.randomUUID()
  localStorage.setItem(DEVICE_KEY, device)
  let sync = readSync()
  let visible = api.seed()
  const seeded = normalizeTodoSync(api.seed())
  sync = mergeTodoSync(sync, seeded)
  let revision = 0, uploading = false, needsPush = false, generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined
  let session: { db: import('firebase/firestore').Firestore; document: import('firebase/firestore').DocumentReference } | undefined
  const parentOrigin = trustedParent()
  const save = () => {
    localStorage.setItem(TODO_SYNC_KEY, JSON.stringify(sync))
    window.dispatchEvent(new CustomEvent('todo-sync-updated'))
  }
  const paint = () => {
    if (api.busy()) return
    const next = todoWorkspace(sync, api.read().activeBoardId)
    if (!next.boards.length) return
    if (JSON.stringify(next) !== JSON.stringify(api.read())) api.apply(next)
    visible = api.read()
  }
  const payload = () => parent.postMessage({ type: PREFIX + 'change', value: sync }, parentOrigin!)
  const schedule = () => {
    if (parentOrigin) { payload(); api.status('有修改待同步'); return }
    if (!session) { api.status('已保存在本机 · 输入同步码后自动同步'); return }
    needsPush = true
    if (timer) clearTimeout(timer)
    api.status(navigator.onLine ? '有修改待上传' : '离线 · 已保存在本机')
    timer = setTimeout(() => void push(), 2500)
  }
  const push = async () => {
    if (!session || uploading) return
    const token = generation, active = session, currentRevision = revision
    uploading = true; needsPush = false
    api.status('正在同步')
    try {
      const { runTransaction, serverTimestamp } = await import('firebase/firestore')
      const pending = sync
      const merged = await runTransaction(active.db, async transaction => {
        const snapshot = await transaction.get(active.document)
        const data = snapshot.exists() ? snapshot.data() : {}
        const suite = data.suite && typeof data.suite === 'object' ? data.suite : { version: 1, apps: {} }
        const remote = suite.apps?.todo
        const next = mergeTodoSync(remote?.value, pending)
        transaction.set(active.document, { ...data, suite: { ...suite, version: 1, apps: { ...suite.apps, todo: { value: next, updatedAt: Math.max(Date.now(), remote?.updatedAt + 1 || 0), updatedBy: device } } }, updatedAt: serverTimestamp() })
        return next
      })
      if (token !== generation) return
      sync = mergeTodoSync(sync, merged); save(); paint()
      if (revision !== currentRevision) needsPush = true
      api.status(needsPush ? '有修改待上传' : '已同步')
    } catch {
      if (token === generation) { needsPush = true; api.status(navigator.onLine ? '同步失败 · 可点击重新连接' : '离线 · 已保存在本机') }
    } finally {
      uploading = false
      if (token === generation && needsPush && revision !== currentRevision) schedule()
    }
  }
  api.subscribe(() => {
    const next = api.read()
    sync = reconcileTodoSync(mergeTodoSync(sync, readSync()), visible, next, { updatedAt: Math.max(Date.now(), latestTodoTimestamp(sync) + 1), updatedBy: device })
    visible = next
    revision++; save(); paint(); schedule()
  })
  // Apply delayed remote updates after editing closes, without resetting a draft.
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { paint() }))
  window.addEventListener('dragend', () => paint())
  window.addEventListener('storage', event => {
    if (event.key === TODO_SYNC_KEY) { sync = mergeTodoSync(sync, readSync()); paint() }
    if (event.key === CODE_KEY && !parentOrigin) void connect(event.newValue ?? '')
  })
  window.addEventListener('online', () => { if (needsPush) schedule() })
  if (parentOrigin) {
    window.addEventListener('message', event => {
      if (event.source !== parent || event.origin !== parentOrigin || event.data?.type !== PREFIX + 'state') return
      const received = normalizeTodoSync(event.data.value)
      sync = mergeTodoSync(sync, received); save(); paint()
      api.status(event.data.message || '已接入项目同步')
      if (JSON.stringify(sync.fields) !== JSON.stringify(received.fields)) payload()
    })
    parent.postMessage({ type: PREFIX + 'ready', value: sync }, parentOrigin)
    api.status('正在连接项目同步')
    return
  }

  const panel = document.createElement('details')
  panel.className = 'todo-suite-controls'
  panel.innerHTML = '<summary>数据同步</summary><p>使用项目进度页面的同一同步码，待办即可自动保持最新。</p><form><input aria-label="待办同步码" placeholder="输入同步码" minlength="12" maxlength="24" autocomplete="off" autocapitalize="characters" required><button type="submit">连接 / 重试</button><button type="button" data-disconnect>断开</button></form><p>同步码请自行保存；离线修改会先保存在本机。</p>'
  const style = document.createElement('style')
  style.textContent = '.todo-suite-controls{margin:12px 32px;color:#888;font-size:12px}.todo-suite-controls summary{cursor:pointer}.todo-suite-controls p{line-height:1.7}.todo-suite-controls form{display:flex;gap:8px;flex-wrap:wrap}.todo-suite-controls input,.todo-suite-controls button{font:inherit;color:inherit;background:transparent;border:1px solid #8885;border-radius:6px;padding:9px}.todo-suite-controls input{font-size:16px;letter-spacing:.06em}'
  document.head.append(style); document.body.append(panel)
  const input = panel.querySelector('input')!
  input.value = localStorage.getItem(CODE_KEY) ?? ''
  async function connect(raw: string) {
    const code = cleanSyncCode(raw)
    generation++; unsubscribe?.(); unsubscribe = undefined; session = undefined
    if (timer) clearTimeout(timer)
    if (!code) { api.status('已保存在本机'); return }
    if (code.length < 12) { api.status('同步码至少需要 12 位'); return }
    localStorage.setItem(CODE_KEY, code); input.value = code
    api.status('正在连接同步码')
    const token = generation
    try {
      const [{ getApp, getApps, initializeApp }, { getAuth, signInAnonymously }, { doc, getFirestore, onSnapshot }] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
      const name = 'liubai-suite-sync'
      const app = getApps().some(app => app.name === name) ? getApp(name) : initializeApp({ apiKey: 'AIzaSyDbLCcDs-Gk6ev2zSUT4cdYAgvpqUzSUEY', authDomain: 'daily-calorie-tracker-3ec47.firebaseapp.com', projectId: 'daily-calorie-tracker-3ec47', appId: '1:197589959166:web:711ca2487ef48c9c42c0af' }, name)
      const auth = getAuth(app)
      if (!auth.currentUser) await signInAnonymously(auth)
      if (token !== generation) return
      const db = getFirestore(app), document = doc(db, 'syncSpaces', await deriveSuiteDocumentId(code))
      if (token !== generation) return
      session = { db, document }
      unsubscribe = onSnapshot(document, snapshot => {
        if (token !== generation || !snapshot.exists()) return
        const remote = normalizeTodoSync(snapshot.data().suite?.apps?.todo?.value)
        sync = mergeTodoSync(sync, remote); save(); paint()
        if (JSON.stringify(sync.fields) !== JSON.stringify(remote.fields)) schedule()
        else if (!uploading && !needsPush) api.status('已同步')
      }, () => { if (token === generation) api.status('连接中断 · 点击重新连接') })
      await push()
    } catch { if (token === generation) api.status(navigator.onLine ? '连接失败 · 点击重新连接' : '离线 · 已保存在本机') }
  }
  panel.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); void connect(input.value) })
  panel.querySelector('[data-disconnect]')!.addEventListener('click', () => { localStorage.removeItem(CODE_KEY); input.value = ''; void connect('') })
  save(); paint()
  await connect(input.value)
}
