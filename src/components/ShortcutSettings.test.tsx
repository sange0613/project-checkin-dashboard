import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { shortcutEntries, sortShortcuts, defaultShortcuts } from './ShortcutBar'

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
