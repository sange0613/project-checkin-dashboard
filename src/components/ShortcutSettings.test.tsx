import { readShortcuts } from './ShortcutSettings'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { shortcutEntries, sortShortcuts, defaultShortcuts, migrateAccountUrl } from './ShortcutBar'

beforeEach(() => localStorage.clear())
test('orders integrated tools and external links together and persists after reload', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await user.click(screen.getByText('快捷入口', { selector: 'summary' }))
  await user.click(screen.getByRole('button', { name: '前移 清 · 清单打卡' }))
  expect(document.querySelector('.top-actions')?.firstElementChild).toHaveAttribute('aria-label', '清单打卡')
  unmount()
  render(<App />)
  expect(document.querySelector('.top-actions')?.firstElementChild).toHaveAttribute('aria-label', '清单打卡')
  expect(JSON.parse(localStorage.getItem('project-checkins')!).state.preferences.shortcutOrder.slice(0, 2)).toEqual(['checklist', 'daily'])
})
test('keeps unlisted new links and permits GitHub to move to the front', () => {
  const entries = shortcutEntries(defaultShortcuts)
  const sorted = sortShortcuts(entries, ['github', defaultShortcuts[0].href, 'daily'])
  expect(sorted.slice(0, 3).map(entry => entry.id)).toEqual(['github', defaultShortcuts[0].href, 'daily'])
  expect(sorted).toHaveLength(entries.length)
})

test('migrates saved old-account links and ordering without changing custom sites', () => {
  const old = 'https://sange1022.github.io/image-to-pdf-studio/?v=1#lesson'
  const links = readShortcuts([JSON.stringify({ label: '英语', short: '词', href: old, hidden: true })])
  expect(links[0]).toEqual({ label: '英语', short: '词', href: 'https://sange0613.github.io/image-to-pdf-studio/?v=1#lesson', hidden: true })
  expect(sortShortcuts([{ id: 'daily' }, { id: links[0].href }], [old])[0].id).toBe(links[0].href)
  expect(migrateAccountUrl('https://sange1022.github.io.example.com/tool')).toBe('https://sange1022.github.io.example.com/tool')
  expect(migrateAccountUrl('https://github.com/sange10220/tool')).toBe('https://github.com/sange10220/tool')
  expect(migrateAccountUrl('https://example.com/sange1022')).toBe('https://example.com/sange1022')
})

test('keeps unselected sites usable on the old account, including previously rewritten settings', () => {
  const old = 'https://sange1022.github.io/english-vocabulary-study/?v=2#lesson'
  const rewritten = old.replace('sange1022', 'sange0613')
  expect(migrateAccountUrl(old)).toBe(old)
  expect(migrateAccountUrl(rewritten)).toBe(old)
  const links = readShortcuts([JSON.stringify({ label: '词', short: '词', href: rewritten })])
  expect(links[0].href).toBe(old)
  expect(sortShortcuts([{ id: 'daily' }, { id: old }], [rewritten])[0].id).toBe(old)
})
