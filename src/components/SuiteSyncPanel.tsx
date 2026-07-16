import { Cloud, CloudOff, Link2, RefreshCw } from 'lucide-react'

type SuiteSyncPanelProps = {
  code: string
  connected: boolean
  status: 'local' | 'connecting' | 'syncing' | 'synced' | 'error'
  message: string
  onCodeChange: (code: string) => void
  onConnect: () => void
  onCreate: () => void
  onDisconnect: () => void
}

export function SuiteSyncPanel({ code, connected, status, message, onCodeChange, onConnect, onCreate, onDisconnect }: SuiteSyncPanelProps) {
  return (
    <section className="suite-sync-section" aria-label="数据同步">
      <div className="suite-sync-heading">
        <div>
          <p className="eyebrow">ONE CODE · ALL DATA</p>
          <h2>数据同步</h2>
          <p>项目、饮食与清单数据</p>
        </div>
        <span className="suite-sync-status" data-status={status} role="status">
          {status === 'syncing' || status === 'connecting' ? <RefreshCw size={14} className="spin" /> : connected ? <Cloud size={14} /> : <CloudOff size={14} />}
          {message}
        </span>
      </div>
      <div className="suite-sync-controls">
        <label>
          <span className="visually-hidden">同步码</span>
          <input value={code} onChange={(event) => onCodeChange(event.target.value)} placeholder="输入同步码" maxLength={24} autoCapitalize="characters" spellCheck={false} />
        </label>
        <button type="button" className="primary-button" onClick={onConnect}><Link2 size={14} />{connected ? '重新连接' : '连接'}</button>
        <button type="button" className="ghost-button" onClick={onCreate}>新建同步码</button>
        {connected ? <button type="button" className="suite-disconnect" onClick={onDisconnect}>断开</button> : null}
      </div>
      <p className="suite-sync-note">在其他设备输入同一同步码，即可自动保持最新。</p>
    </section>
  )
}
