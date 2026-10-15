import { expect, test } from 'vitest'
import { categoryPalette, distributionSegments } from '../../time-journal/model.mjs'

test('work turns blue in the ring only after exceeding seven hours', () => {
  const color = (work: number) => distributionSegments({ work, entertainment: 0, rest: 0, unrecorded: 1440 - work }).find(segment => segment.id === 'work')?.color
  expect(color(420)).toBe('#ffffff')
  expect(color(421)).toBe('#5b9bf3')
  expect(color(419)).toBe('#ffffff')
})
test('the blue signal preserves duration, ratios, and the timeline grayscale palette', () => {
  const totals = { work: 450, entertainment: 120, rest: 480, unrecorded: 390 }
  const segments = distributionSegments(totals)
  expect(segments.find(segment => segment.id === 'work')).toMatchObject({ color: '#5b9bf3', minutes: 450, percent: 31.3 })
  expect(segments.find(segment => segment.id === 'rest')?.color).toBe('#595959')
  expect(segments.reduce((sum, segment) => sum + segment.minutes, 0)).toBe(1440)
  expect(categoryPalette(totals).find(category => category.id === 'work')?.color).toBe('#ffffff')
})

test('category brightness stays fixed regardless of which activity takes longest', () => {
  for (const totals of [
    { work: 0, entertainment: 0, rest: 0, unrecorded: 1440 },
    { work: 120, entertainment: 600, rest: 480, unrecorded: 240 },
    { work: 120, entertainment: 180, rest: 600, unrecorded: 540 },
    { work: 300, entertainment: 300, rest: 300, unrecorded: 540 },
  ]) {
    const colors = { work: '#ffffff', entertainment: '#808080', rest: '#595959' }
    expect(Object.fromEntries(categoryPalette(totals).map(category => [category.id, category.color]))).toEqual(colors)
    for (const segment of distributionSegments(totals)) {
      if (segment.id in colors) expect(segment.color).toBe(colors[segment.id as keyof typeof colors])
    }
  }
})
