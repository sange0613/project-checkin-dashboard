import { toDateKey } from './dateRanges'

export type ActivityMode = 'daily' | 'weekly' | 'cumulative'

export type ActivityDate = {
  date: Date
  key: string
  weekIndex: number
  dayIndex: number
  isFuture: boolean
}

export type ActivityMonthLabel = {
  key: string
  label: string
  weekIndex: number
}

function calendarDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonday(date: Date) {
  const result = calendarDate(date)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  return result
}

export function getActivityDates(today: Date): ActivityDate[] {
  const current = calendarDate(today)
  const firstVisibleMonth = new Date(current.getFullYear(), current.getMonth() - 11, 1)
  const start = startOfMonday(firstVisibleMonth)

  return Array.from({ length: 53 * 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      key: toDateKey(date),
      weekIndex: Math.floor(index / 7),
      dayIndex: index % 7,
      isFuture: date.getTime() > current.getTime(),
    }
  })
}

export function getDailyCheckinTotals(checkins: Record<string, string[]>) {
  const totals: Record<string, number> = {}
  for (const dates of Object.values(checkins)) {
    for (const key of new Set(dates)) totals[key] = (totals[key] ?? 0) + 1
  }
  return totals
}

export function getActivityValues(
  dates: ActivityDate[],
  dailyTotals: Record<string, number>,
  mode: ActivityMode,
) {
  if (mode === 'daily') {
    return Object.fromEntries(dates.map(({ key, isFuture }) => [key, isFuture ? 0 : dailyTotals[key] ?? 0]))
  }

  const values: Record<string, number> = {}
  for (let start = 0; start < dates.length; start += 7) {
    const week = dates.slice(start, start + 7)
    const weekTotal = week.reduce((sum, item) => sum + (item.isFuture ? 0 : dailyTotals[item.key] ?? 0), 0)
    let cumulative = 0
    for (const item of week) {
      if (!item.isFuture) cumulative += dailyTotals[item.key] ?? 0
      values[item.key] = item.isFuture ? 0 : mode === 'weekly' ? weekTotal : cumulative
    }
  }
  return values
}

export function getActivityIntensity(value: number, values: number[]) {
  if (value <= 0) return 0
  const nonZero = values.filter((item) => item > 0).sort((a, b) => a - b)
  if (!nonZero.length) return 0
  const rank = nonZero.filter((item) => item <= value).length / nonZero.length
  return Math.max(1, Math.min(4, Math.ceil(rank * 4)))
}

export function getActivityMonthLabels(dates: ActivityDate[]): ActivityMonthLabel[] {
  const labels: ActivityMonthLabel[] = []
  const current = [...dates].reverse().find((item) => !item.isFuture)?.date
  if (!current) return labels
  const firstMonthIndex = current.getFullYear() * 12 + current.getMonth() - 11
  const currentMonthIndex = current.getFullYear() * 12 + current.getMonth()
  let previousMonth = -1
  for (const item of dates) {
    const month = item.date.getMonth()
    if (month === previousMonth) continue
    previousMonth = month
    const monthIndex = item.date.getFullYear() * 12 + month
    if (monthIndex < firstMonthIndex || monthIndex > currentMonthIndex) continue
    labels.push({
      key: `${item.date.getFullYear()}-${month + 1}`,
      label: `${month + 1}月`,
      weekIndex: item.weekIndex,
    })
  }
  return labels
}

export function formatActivityTooltip(date: Date, value: number, mode: ActivityMode) {
  const label = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  if (mode === 'weekly') return `${label}所在周 共打卡 ${value} 次`
  if (mode === 'cumulative') return `截至 ${label} 当周累计打卡 ${value} 次`
  return `${label} 打卡 ${value} 次`
}
