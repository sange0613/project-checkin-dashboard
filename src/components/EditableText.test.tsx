import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditableText } from './EditableText'

test('preserves the current draft when a synchronized value arrives during editing', async () => {
  const save = vi.fn()
  const { rerender } = render(<EditableText value="原名" ariaLabel="名称" onSave={save} />)
  await userEvent.click(screen.getByRole('button'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '本机草稿' } })
  rerender(<EditableText value="另一设备的名称" ariaLabel="名称" onSave={save} />)
  expect(screen.getByRole('textbox')).toHaveValue('本机草稿')
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true, keyCode: 229 })
  expect(save).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(save).toHaveBeenCalledWith('本机草稿')
})
test('blank values return to the last value and escape does not save a draft', async () => {
  const save = vi.fn()
  render(<EditableText value="原名" ariaLabel="名称" onSave={save} />)
  await userEvent.click(screen.getByRole('button'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } })
  fireEvent.blur(screen.getByRole('textbox'))
  expect(screen.getByRole('button')).toHaveTextContent('原名')
  await userEvent.click(screen.getByRole('button'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '取消的草稿' } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toHaveTextContent('原名')
})
