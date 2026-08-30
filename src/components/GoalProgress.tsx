import { useEffect, useState } from 'react'

type GoalProgressProps = {
  current: number
  total: number
}

type GoalProgressSettingsProps = GoalProgressProps & {
  onCurrentChange: (value: number) => void
  onTotalChange: (value: number) => void
}

export function GoalProgress({ current, total }: GoalProgressProps) {
  const percentage = Math.min(100, Math.round((current / Math.max(1, total)) * 100))

  return (
    <section className="goal-progress" aria-label="目标进度">
      <div className="goal-progress-copy">
        <span>进度</span>
        <strong>{current} / {total} · {percentage}%</strong>
      </div>
      <div className="goal-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-valuetext={`${percentage}%`}>
        <i style={{ width: `${percentage}%` }} />
      </div>
    </section>
  )
}

export function GoalProgressSettings({ current, total, onCurrentChange, onTotalChange }: GoalProgressSettingsProps) {
  const [totalDraft, setTotalDraft] = useState(String(total))
  const [currentDraft, setCurrentDraft] = useState(String(current))

  useEffect(() => setTotalDraft(String(total)), [total])
  useEffect(() => setCurrentDraft(String(current)), [current])

  return (
    <details className="bottom-panel">
      <summary>设置进度</summary>
      <div className="goal-progress-settings">
        <label>
          <span>总数</span>
          <input
            type="number"
            min={1}
            step={1}
            value={totalDraft}
            onBlur={() => { if (totalDraft === '') setTotalDraft(String(total)) }}
            onChange={(event) => {
              setTotalDraft(event.target.value)
              if (event.target.value !== '') onTotalChange(Number(event.target.value))
            }}
          />
        </label>
        <label>
          <span>目前数字</span>
          <input
            type="number"
            min={0}
            max={total}
            step={1}
            value={currentDraft}
            onBlur={() => { if (currentDraft === '') setCurrentDraft(String(current)) }}
            onChange={(event) => {
              setCurrentDraft(event.target.value)
              if (event.target.value !== '') onCurrentChange(Number(event.target.value))
            }}
          />
        </label>
      </div>
    </details>
  )
}
