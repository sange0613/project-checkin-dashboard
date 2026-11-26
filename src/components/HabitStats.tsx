import { useState } from 'react'
import { getMonthDays, getWeekPeriods, toDateKey } from '../domain/dateRanges'
import type { Project } from '../domain/types'

type Period = 'week' | 'month' | 'year'

export function HabitStats({ projects, checkins, today }: { projects: Project[]; checkins: Record<string, string[]>; today: Date }) {
  const [period, setPeriod] = useState<Period>('week')
  const todayKey = toDateKey(today)
  const year = today.getFullYear()
  const month = today.getMonth()
  const dates = period === 'year'
    ? Array.from({ length: 12 }, (_, index) => getMonthDays(new Date(year, index, 1))).flat().map(day => day.key)
    : period === 'month' ? getMonthDays(today).map(day => day.key) : getWeekPeriods(today).at(-1)!.dateKeys
  const range = new Set(dates)
  const counts = new Map<string, number>()
  const habits = projects.map(project => {
    const days = [...new Set(checkins[project.id])].filter(date => date <= todayKey && range.has(date))
    for (const date of days) counts.set(date, (counts.get(date) ?? 0) + 1)
    return { ...project, count: days.length }
  }).sort((a, b) => b.count - a.count)
  const bars = period === 'year'
    ? Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1}月`, count: getMonthDays(new Date(year, index, 1)).reduce((sum, day) => sum + (counts.get(day.key) ?? 0), 0) }))
    : dates.map((date, index) => ({ label: period === 'week' ? '一二三四五六日'[index] : String(index + 1), count: counts.get(date) ?? 0 }))
  const barMax = Math.max(1, ...bars.map(bar => bar.count))
  const elapsed = Math.max(1, dates.filter(date => date <= todayKey).length)
  const dateLabel = period === 'year' ? `${year}年` : period === 'month' ? `${year}年${month + 1}月` : `${dates[0]} 至 ${dates.at(-1)}`

  return <div className="habit-stats">
    <div className="habit-stat-period" role="group" aria-label="统计范围">
      {([['week', '周'], ['month', '月'], ['year', '年']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
    </div>
    <p className="habit-stat-date">{dateLabel}</p>
    <div className="habit-stat-metrics">
      <div><span>打卡总次数</span><strong>{habits.reduce((sum, habit) => sum + habit.count, 0)} <small>次</small></strong></div>
      <div><span>有打卡的天数</span><strong>{counts.size} <small>天</small></strong></div>
    </div>
    <section className="habit-stat-chart" aria-label="打卡分布">
      <h3>打卡分布</h3>
      <div className="habit-stat-bars" data-period={period} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map(({ label, count }, index) => <div key={label} title={`${label} · ${count} 次`} aria-label={`${label}，${count} 次`} role="img">
          <div className="habit-stat-bar"><i style={{ height: `${count / barMax * 100}%` }} /></div>
          <span aria-hidden="true">{period !== 'month' || index === 0 || (index + 1) % 5 === 0 ? label : ''}</span>
        </div>)}
      </div>
    </section>
    <h3>按习惯</h3>
    <div className="habit-cards">
      {habits.map(habit => <article className="habit-stat-item" key={habit.id}>
        <div><strong>{habit.name}</strong><span>{habit.count} 次</span></div>
        <progress aria-label={`${habit.name}打卡天数`} value={habit.count} max={elapsed} />
      </article>)}
    </div>
    {!habits.length && <p className="habit-empty">暂无习惯可统计。</p>}
  </div>
}
