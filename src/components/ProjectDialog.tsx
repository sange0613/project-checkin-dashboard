import { useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function ProjectDialog({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  if (!open) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <p className="dialog-kicker">NEW PROJECT</p>
          <h2 id="dialog-title">添加一个项目</h2>
        </div>
        <label>
          <span>项目名称</span>
          <input aria-label="项目名称" autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose() }} placeholder="例如：作品集更新" />
        </label>
        <div className="dialog-actions">
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={submit} disabled={!name.trim()}>创建</button>
        </div>
      </section>
    </div>
  )
}
