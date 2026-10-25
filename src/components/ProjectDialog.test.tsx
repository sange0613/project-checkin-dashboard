import { fireEvent, render, screen } from '@testing-library/react'
import { ProjectDialog } from './ProjectDialog'

test('Chinese composition confirmation does not submit a new project', () => {
  const create = vi.fn(), close = vi.fn()
  render(<ProjectDialog open onCreate={create} onClose={close} />)
  const name = screen.getByRole('textbox', { name: '项目名称' })
  fireEvent.change(name, { target: { value: '住宅设计' } })
  fireEvent.keyDown(name, { key: 'Enter', isComposing: true, keyCode: 229 })
  expect(create).not.toHaveBeenCalled()
  fireEvent.keyDown(name, { key: 'Enter' })
  expect(create).toHaveBeenCalledWith('住宅设计')
})
