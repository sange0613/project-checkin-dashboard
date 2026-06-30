import { describe, expect, it } from 'vitest'
import {
  formatActivityTooltip,
  getActivityDates,
  getActivityIntensity,
  getActivityMonthLabels,
  getActivityValues,
  getDailyCheckinTotals,
} from './activityHeatmap'

describe('activity heatmap aggregation', () => {
  it('builds 53 complete Monday-based weeks spanning the latest twelve calendar months', () => {
    const dates = getActivityDates(new Date(2026, 6, 1))

    expect(dates).toHaveLength(371)
    expect(dates[0].key).toBe('2025-07-28')
    expect(dates.at(-1)?.key).toBe('2026-08-02')
    expect(dates[0].date.getDay()).toBe(1)
    expect(dates.at(-1)?.date.getDay()).toBe(0)
    expect(dates.find((item) => item.key === '2026-07-01')?.isFuture).toBe(false)
    expect(dates.find((item) => item.key === '2026-07-02')?.isFuture).toBe(true)
  })

  it('counts total project check-ins for each date', () => {
    expect(getDailyCheckinTotals({
      a: ['2026-06-29'],
      b: ['2026-06-29', '2026-06-30'],
    })).toEqual({ '2026-06-29': 2, '2026-06-30': 1 })
  })

  it('calculates daily, natural-week, and week-to-date cumulative values', () => {
    const dates = getActivityDates(new Date(2026, 6, 5))
    const totals = { '2026-06-29': 2, '2026-06-30': 1, '2026-07-02': 3 }

    expect(getActivityValues(dates, totals, 'daily')['2026-07-02']).toBe(3)
    expect(getActivityValues(dates, totals, 'weekly')['2026-06-29']).toBe(6)
    expect(getActivityValues(dates, totals, 'weekly')['2026-07-05']).toBe(6)
    expect(getActivityValues(dates, totals, 'cumulative')['2026-06-29']).toBe(2)
    expect(getActivityValues(dates, totals, 'cumulative')['2026-06-30']).toBe(3)
    expect(getActivityValues(dates, totals, 'cumulative')['2026-07-02']).toBe(6)
  })

  it('maps zero to no activity and positive values into four relative levels', () => {
    const values = [0, 1, 2, 4, 8]
    expect(getActivityIntensity(0, values)).toBe(0)
    expect(getActivityIntensity(1, values)).toBe(1)
    expect(getActivityIntensity(8, values)).toBe(4)
    expect(getActivityIntensity(5, [0, 5, 5])).toBe(4)
  })

  it('formats mode-specific hover text', () => {
    const date = new Date(2026, 6, 1)
    expect(formatActivityTooltip(date, 6, 'daily')).toBe('2026年7月1日 打卡 6 次')
    expect(formatActivityTooltip(date, 12, 'weekly')).toBe('2026年7月1日所在周 共打卡 12 次')
    expect(formatActivityTooltip(date, 8, 'cumulative')).toBe('截至 2026年7月1日 当周累计打卡 8 次')
  })

  it('shows only the latest twelve month labels', () => {
    const labels = getActivityMonthLabels(getActivityDates(new Date(2026, 6, 1)))

    expect(labels).toHaveLength(12)
    expect(labels[0].label).toBe('8月')
    expect(labels.at(-1)?.label).toBe('7月')
  })
})
