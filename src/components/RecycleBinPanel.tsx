import { useEffect, useState } from 'react'
import { dismissRecycled, readRecycleBin, restoreRecycledTodo, type RecycleEntry } from '../storage/recycleBin'

export function RecycleBinPanel({ onRestore }: { onRestore: (entry: RecycleEntry) => void }) {
  const [, refresh] = useState(0)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const update = () => refresh(value => value + 1)
    window.addEventListener('recycle-updated', update)
    return () => window.removeEventListener('recycle-updated', update)
  }, [])
  const entries = readRecycleBin()
  return <details className="recovery-panel">
    <summary>回收站{entries.length ? ` · ${entries.length}` : ''}</summary>
    <p>记录此页面使用期间删除的项目和待办，可恢复最近 30 天、最多 100 项，保存在本机。恢复后随原同步码同步；不会替换其他内容。</p>
    {message && <p role="status">{message}</p>}
    {entries.map(entry => <div className="recovery-row" key={entry.id}>
      <span>{entry.kind === 'todo' ? '待办' : entry.kind === 'stage' ? '设计项目' : '打卡项目'} · {entry.name} · {new Date(entry.at).toLocaleDateString('zh-CN')}</span>
      <button onClick={() => { try { if (entry.kind === 'todo') restoreRecycledTodo(entry); else onRestore(entry); setMessage('已恢复，其他内容保持不变') } catch { setMessage('恢复失败，请检查浏览器存储空间后重试') } }}>恢复 {entry.name}</button>
      <button onClick={() => { if (window.confirm(`从本机回收站永久移除“${entry.name}”？`)) dismissRecycled(entry.id) }}>移除</button>
    </div>)}
    {!entries.length && <p>暂无可恢复的内容。启用后的删除会记录在这里。</p>}
  </details>
}
