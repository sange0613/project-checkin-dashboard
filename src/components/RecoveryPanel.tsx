import { useEffect, useState } from 'react'
import type { AppState } from '../domain/types'
import { readRecovery, saveRecovery } from '../storage/recovery'
import { dismissConflict, readConflicts, resolveConflict } from '../storage/syncConflicts'
import { defaultShortcuts } from './ShortcutBar'

export function RecoveryPanel({ state, onRestore }: { state: AppState; onRestore: (state: AppState) => void }) {
  const [, refresh] = useState(0)
  const [warning, setWarning] = useState('')
  useEffect(() => {
    const update = () => refresh(n => n + 1)
    const full = () => setWarning('浏览器存储空间不足，历史版本未能保存，请先导出数据。')
    window.addEventListener('recovery-updated', update)
    window.addEventListener('recovery-storage-full', full)
    return () => { window.removeEventListener('recovery-updated', update); window.removeEventListener('recovery-storage-full', full) }
  }, [])
  const entries = readRecovery(), conflicts = readConflicts()
  return <details className="recovery-panel" id="recovery-panel">
    <summary>历史与冲突{conflicts.length > 0 ? ` · ${conflicts.length} 项待确认` : ''}</summary>
    <p>最近 10 个项目看板版本保存在本机浏览器，不含饮、清、物的数据或同步码。恢复会作为新修改同步到其他设备。</p>
    {warning && <p role="alert">{warning}</p>}
    <button onClick={() => saveRecovery(state, '手动快照')}>保存当前版本</button>
    {conflicts.map(conflict => <article key={conflict.id} className="conflict-item">
      <strong>同一内容被同时修改 · {conflict.group === 'settings' ? conflict.key : (conflict.local?.name ?? conflict.remote?.name ?? conflict.key) as string}</strong>
      <div className="conflict-choices">{(['local', 'remote'] as const).map(side => <div key={side}>
        <small>{side === 'local' ? '本机修改' : '另一设备'}</small>
        <pre>{conflict[side] ? JSON.stringify(conflict[side], null, 2) : '已删除'}</pre>
        <button onClick={() => { saveRecovery(state, '解决冲突前'); onRestore(resolveConflict(state, conflict, side)); dismissConflict(conflict.id) }}>采用{side === 'local' ? '本机' : '另一设备'}</button>
      </div>)}</div>
    </article>)}
    {entries.map(entry => <div className="recovery-row" key={entry.id}>
      <span>{new Date(entry.at).toLocaleString('zh-CN')} · {entry.reason} · {entry.state.projects.length} 个打卡项目</span>
      <button onClick={() => { if (window.confirm('恢复这个版本会替换当前看板内容并同步到其他设备，当前内容将先备份。继续吗？')) {
        saveRecovery(state, '恢复前'); onRestore({ ...entry.state,
          preferences: { ...Object.fromEntries(Object.keys(state.preferences ?? {}).map(key => [key, key === 'randomAvoidDays' ? 7 : false])), ...entry.state.preferences },
          shortcutConfig: entry.state.shortcutConfig ?? defaultShortcuts.map(link => JSON.stringify(link)),
          view: state.view, anchorDate: state.anchorDate })
      } }}>恢复</button>
    </div>)}
    {!entries.length && <p>尚无历史版本，修改或同步前将自动保存。</p>}
  </details>
}
