import { useEffect, useState, type ReactNode } from 'react'

export function CollapsibleSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const key = `project-section-${id}`
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== 'closed')
  useEffect(() => {
    const expand = (event: Event) => { if ((event as CustomEvent).detail === id) { setOpen(true); localStorage.setItem(key, 'open') } }
    window.addEventListener('open-section', expand)
    return () => window.removeEventListener('open-section', expand)
  }, [id, key])
  return <section className="collapsible-section" id={`section-${id}`}>
    <button className="section-toggle" aria-expanded={open} onClick={() => {
      setOpen(!open)
      localStorage.setItem(key, open ? 'closed' : 'open')
    }}>{title}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
    <div hidden={!open}>{children}</div>
  </section>
}
