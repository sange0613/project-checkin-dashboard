import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckinActivityHeatmap } from './CheckinActivityHeatmap'

const checkins = {
  a: ['2026-06-29'],
  b: ['2026-06-29', '2026-06-30'],
}

test('renders the daily activity grid and shows the count on hover', async () => {
  const user = userEvent.setup()
  render(<CheckinActivityHeatmap checkins={checkins} today={new Date(2026, 6, 1)} />)

  expect(screen.getByRole('region', { name: '打卡活动' })).toBeVisible()
  expect(screen.getByRole('button', { name: '每日' })).toHaveAttribute('aria-pressed', 'true')

  const cell = screen.getByRole('button', { name: '2026年6月29日 打卡 2 次' })
  await user.hover(cell)
  expect(screen.getByRole('tooltip')).toHaveTextContent('2026年6月29日 打卡 2 次')
})

test('switches to weekly and cumulative values without changing the calendar layout', async () => {
  const user = userEvent.setup()
  render(<CheckinActivityHeatmap checkins={checkins} today={new Date(2026, 6, 1)} />)

  await user.click(screen.getByRole('button', { name: '每周' }))
  expect(screen.getByRole('button', { name: '每周' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '2026年6月29日所在周 共打卡 3 次' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '累计' }))
  expect(screen.getByRole('button', { name: '累计' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '截至 2026年6月30日 当周累计打卡 3 次' })).toBeVisible()
  expect(screen.getAllByTestId('activity-cell')).toHaveLength(371)

  await user.click(screen.getByRole('button', { name: '截至 2026年7月1日 当周累计打卡 3 次' }))
  expect(screen.getByRole('tooltip')).toHaveClass('align-end')
})
