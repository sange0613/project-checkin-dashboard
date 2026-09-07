import { useEffect, useRef, useState } from 'react'
import type { RandomCategory, RandomResult } from '../domain/types'
import { pickRandomItem } from '../domain/randomPrompts'

type Props = {
  categories: RandomCategory[]
  results: Partial<Record<RandomCategory['id'], RandomResult>>
  onResult: (categoryId: RandomCategory['id'], result: RandomResult) => void
  candidates?: RandomCategory[]
}

export function DailyRandomPanel({ categories, results, onResult, candidates = categories }: Props) {
  const [rolling, setRolling] = useState<Partial<Record<RandomCategory['id'], string>>>({})
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearInterval), [])

  const draw = (category: RandomCategory) => {
    if (results[category.id] || rolling[category.id]) return
    const finalItem = pickRandomItem(candidates.find(item => item.id === category.id)?.items ?? category.items)
    setRolling(current => ({ ...current, [category.id]: finalItem.name }))
    const interval = window.setInterval(() => {
      setRolling((current) => ({ ...current, [category.id]: pickRandomItem(category.items).name }))
    }, 90)
    timers.current.push(interval)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setRolling((current) => {
        const next = { ...current }
        delete next[category.id]
        return next
      })
      onResult(category.id, { itemId: finalItem.id, name: finalItem.name })
    }, 2000)
    timers.current.push(timeout)
  }

  return (
    <section className="daily-random" aria-label="今日随机内容">
      {categories.map((category) => {
        const result = results[category.id]
        const isRolling = Boolean(rolling[category.id])
        return (
          <button key={category.id} className={result ? 'locked' : ''} disabled={isRolling} aria-disabled={Boolean(result) || isRolling} onClick={() => draw(category)}>
            <small>{category.name}</small>
            <strong>{result?.name ?? rolling[category.id] ?? '点击随机'}</strong>
          </button>
        )
      })}
    </section>
  )
}
