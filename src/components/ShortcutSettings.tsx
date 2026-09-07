import { useState } from 'react'
import { defaultShortcuts, type Shortcut } from './ShortcutBar'

export function readShortcuts(config?: string[]): Shortcut[] {
  if (!config) return defaultShortcuts
  return config.flatMap((raw) => {
    try {
      const link = JSON.parse(raw) as Shortcut
      if (typeof link.label !== 'string' || typeof link.short !== 'string' || typeof link.href !== 'string') return []
      if (!['https:', 'http:'].includes(new URL(link.href).protocol)) return []
      return [link]
    } catch { return [] }
  })
}

export function ShortcutSettings({ links, onChange }: { links: Shortcut[]; onChange: (links: Shortcut[]) => void }) {
  const [message, setMessage] = useState('')
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') || '').trim()
    const short = String(data.get('short') || '').trim()
    try {
      const href = new URL(String(data.get('href') || '').trim())
      if (!['https:', 'http:'].includes(href.protocol)) throw new Error()
      if (!label || !short) return
      if (links.some((link) => link.href === href.href)) { setMessage('这个网址已添加'); return }
      onChange([...links, { label, short, href: href.href }])
      event.currentTarget.reset()
      setMessage('已添加')
    } catch { setMessage('请输入完整的 http 或 https 网址') }
  }
  return <details className="shortcut-settings">
    <summary>快捷入口</summary>
    <p>修改后自动保存并同步。饮、清、物等固定入口保持在前方。</p>
    {links.map((link, index) => <div className="shortcut-setting-row" key={`${index}-${JSON.stringify(link)}`}>
      <input aria-label={`入口${index + 1}文字`} maxLength={1} defaultValue={link.short} onBlur={(e) => { const short = e.target.value.trim(); if (short) onChange(links.map((v, i) => i === index ? { ...v, short, icon: undefined } : v)) }} />
      <input aria-label={`入口${index + 1}名称`} defaultValue={link.label} onBlur={(e) => { const label = e.target.value.trim(); if (label) onChange(links.map((v, i) => i === index ? { ...v, label, menuName: label } : v)) }} />
      <input aria-label={`入口${index + 1}网址`} defaultValue={link.href} onBlur={(e) => { try { const href = new URL(e.target.value.trim()); if (!['https:', 'http:'].includes(href.protocol)) throw new Error(); onChange(links.map((v, i) => i === index ? { ...v, href: href.href } : v)); setMessage('') } catch { e.target.value = link.href; setMessage('请输入完整的 http 或 https 网址') } }} />
      <button aria-label={`上移${link.label}`} disabled={index === 0} onClick={() => { const next = [...links]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>↑</button>
      <button aria-label={`下移${link.label}`} disabled={index === links.length - 1} onClick={() => { const next = [...links]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next) }}>↓</button>
      <button onClick={() => onChange(links.filter((_, i) => i !== index))} aria-label={`删除入口${link.label}`}>删除</button>
    </div>)}
    <form className="shortcut-setting-row" onSubmit={save}>
      <input name="short" aria-label="新入口文字" placeholder="字" maxLength={1} required />
      <input name="label" aria-label="新入口名称" placeholder="名称" required />
      <input name="href" aria-label="新入口网址" placeholder="https://" type="url" required />
      <button type="submit">添加</button>
    </form>
    <span role="status">{message}</span>
  </details>
}
