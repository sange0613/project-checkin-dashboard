import { act, fireEvent, render, screen } from '@testing-library/react'
import { DailyRandomPanel } from './DailyRandomPanel'
import '../styles.css'

test('keeps locked random results out of the browser disabled-text color path', () => {
  document.documentElement.dataset.theme = 'dark'
  render(
    <DailyRandomPanel
      categories={[{ id: 'fitness', name: '健身', items: [{ id: 'walk', name: '走路' }] }]}
      results={{ fitness: { itemId: 'walk', name: '走路' } }}
      onResult={() => undefined}
    />,
  )

  const button = screen.getByRole('button', { name: '健身 走路' })
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).not.toBeDisabled()
  expect(button).toHaveClass('locked')
  delete document.documentElement.dataset.theme
})
test('empty synchronized categories do not crash when drawing', () => {
  render(<DailyRandomPanel categories={[{ id: 'fitness', name: '健身', items: [] }]} results={{}} onResult={vi.fn()} />)
  expect(screen.getByRole('button', { name: '健身 请先添加内容' })).toBeDisabled()
})
test('a result received while rolling is not overwritten by the local delayed draw', () => {
  vi.useFakeTimers()
  const categories = [{ id: 'fitness' as const, name: '健身', items: [{ id: 'walk', name: '走路' }] }]
  const onResult = vi.fn()
  const { rerender, unmount } = render(<DailyRandomPanel categories={categories} results={{}} onResult={onResult} />)
  fireEvent.click(screen.getByRole('button'))
  rerender(<DailyRandomPanel categories={categories} results={{ fitness: { itemId: 'pushup', name: '俯卧撑' } }} onResult={onResult} />)
  act(() => vi.advanceTimersByTime(2100))
  expect(onResult).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toHaveTextContent('俯卧撑')
  unmount(); vi.useRealTimers()
})
