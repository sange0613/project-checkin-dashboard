import { createDefaultRandomCategories, normalizeRandomState, pickRandomItem } from './randomPrompts'

test('creates the three default categories', () => {
  const categories = createDefaultRandomCategories()
  expect(categories.map((category) => category.name)).toEqual(['健身', '建模', '建脑'])
  expect(categories[0].items.map((item) => item.name)).toEqual(['俯卧撑', '深蹲', '走路'])
})

test('picks a candidate using the supplied random value', () => {
  const items = createDefaultRandomCategories()[1].items
  expect(pickRandomItem(items, () => 0).name).toBe('艺术史')
  expect(pickRandomItem(items, () => 0.999).name).toBe('美食')
})

test('fills random fields without changing existing app data', () => {
  const normalized = normalizeRandomState({
    title: '项目进度',
    view: 'day',
    anchorDate: '2026-06-21T00:00:00.000Z',
    projects: [{ id: 'p1', name: '项目', createdAt: '2026-06-20', archived: false }],
    checkins: { p1: ['2026-06-21'] },
  })
  expect(normalized.projects).toHaveLength(1)
  expect(normalized.randomCategories).toHaveLength(3)
  expect(normalized.dailyRandomResults).toEqual({})
  expect(normalized.notDoingItems).toEqual(['', '', '', '', '', ''])
})
