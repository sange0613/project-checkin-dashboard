import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onSave: (value: string) => void
  ariaLabel: string
  className?: string
}

export function EditableText({ value, onSave, ariaLabel, className = '' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const save = () => {
    if (cancelled.current) return
    const next = draft.trim()
    if (next && next !== value) onSave(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`editable-input ${className}`}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') { event.preventDefault(); save() }
          if (event.key === 'Escape') {
            cancelled.current = true
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button className={`editable-label ${className}`} onClick={() => { cancelled.current = false; setDraft(value); setEditing(true) }}>
      {value}
    </button>
  )
}
