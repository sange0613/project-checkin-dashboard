import { useMemo, useState } from 'react'
import {
  formatActivityTooltip,
  getActivityDates,
  getActivityIntensity,
  getActivityMonthLabels,
  getActivityValues,
  getDailyCheckinTotals,
  type ActivityMode,
} from '../domain/activityHeatmap'

type Props = {
  checkins: Record<string, string[]>
  today: Date
}

const MODES: { id: ActivityMode; label: string }[] = [
  { id: 'daily', label: '每日' },
  { id: 'weekly', label: '每周' },
  { id: 'cumulative', label: '累计' },
]

export function CheckinActivityHeatmap({ checkins, today }: Props) {
  const [mode, setMode] = useState<ActivityMode>('daily')
  const [activeCell, setActiveCell] = useState<{ key: string; left: number; top: number } | null>(null)
  const dates = useMemo(() => getActivityDates(today), [today])
  const dailyTotals = useMemo(() => getDailyCheckinTotals(checkins), [checkins])
  const values = useMemo(() => getActivityValues(dates, dailyTotals, mode), [dailyTotals, dates, mode])
  const valueList = useMemo(() => dates.filter((item) => !item.isFuture).map((item) => values[item.key] ?? 0), [dates, values])
  const monthLabels = useMemo(() => getActivityMonthLabels(dates), [dates])
  const activeDate = activeCell ? dates.find((item) => item.key === activeCell.key) : undefined
  const activeTooltip = activeDate ? formatActivityTooltip(activeDate.date, values[activeDate.key] ?? 0, mode) : ''
  const showTooltip = (key: string, element: HTMLButtonElement) => {
    setActiveCell({ key, left: element.offsetLeft, top: element.offsetTop })
  }

  return (
    <section className="activity-section" aria-label="打卡活动">
      <div className="activity-heading">
        <h2>打卡活动</h2>
        <div className="activity-modes" aria-label="活动统计方式">
          {MODES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={mode === item.id ? 'active' : ''}
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="activity-scroll">
        <div className="activity-calendar">
          <div className="activity-grid-wrap">
            <div className="activity-grid" role="grid" aria-label={`${MODES.find((item) => item.id === mode)?.label}打卡热力图`}>
              {dates.map((item) => {
                const value = values[item.key] ?? 0
                const tooltip = formatActivityTooltip(item.date, value, mode)
                return (
                  <button
                    type="button"
                    key={item.key}
                    className="activity-cell"
                    data-testid="activity-cell"
                    data-date={item.key}
                    data-intensity={getActivityIntensity(value, valueList)}
                    data-future={item.isFuture || undefined}
                    aria-label={tooltip}
                    disabled={item.isFuture}
                    onMouseEnter={(event) => showTooltip(item.key, event.currentTarget)}
                    onMouseLeave={() => setActiveCell(null)}
                    onFocus={(event) => showTooltip(item.key, event.currentTarget)}
                    onBlur={() => setActiveCell(null)}
                  />
                )
              })}
            </div>
            {activeDate && (
              <div
                className={`activity-tooltip${activeDate.weekIndex >= 47 ? ' align-end' : ''}`}
                role="tooltip"
                style={{ left: `${activeCell?.left ?? 0}px`, top: `${(activeCell?.top ?? 0) - 45}px` }}
              >
                {activeTooltip}
              </div>
            )}
          </div>
          <div className="activity-months" aria-hidden="true">
            {monthLabels.map((item) => <span key={item.key} style={{ gridColumn: item.weekIndex + 1 }}>{item.label}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}
