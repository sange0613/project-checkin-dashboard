type NotDoingListProps = {
  items: string[]
  onChange: (index: number, value: string) => void
}

export function NotDoingList({ items, onChange }: NotDoingListProps) {
  return (
    <section className="not-doing-list" aria-label="不为清单">
      <strong>不为清单</strong>
      {Array.from({ length: 6 }, (_, index) => (
        <label key={index}>
          <span className="visually-hidden">不为清单第 {index + 1} 条</span>
          <input
            value={items[index] ?? ''}
            maxLength={30}
            placeholder={`${index + 1}. 输入文字`}
            onChange={(event) => onChange(index, event.target.value)}
          />
        </label>
      ))}
    </section>
  )
}
