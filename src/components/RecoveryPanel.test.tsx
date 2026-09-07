import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryPanel } from './RecoveryPanel'
import { createInitialState } from '../domain/types'
import { saveRecovery } from '../storage/recovery'
import { recordConflicts, readConflicts } from '../storage/syncConflicts'
import { createSyncStateFromAppState } from '../domain/cloudSync'

beforeEach(() => localStorage.clear())
test('restores a snapshot with explicit resets for newer preferences', async () => {
  const initial = createInitialState()
  saveRecovery(initial, '手动快照')
  const restore = vi.fn()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<RecoveryPanel state={{ ...initial, title: '新标题', preferences: { 'pin:a': true } }} onRestore={restore} />)
  await userEvent.click(screen.getByText('历史与冲突'))
  await userEvent.click(screen.getByRole('button', { name: '恢复' }))
  expect(restore.mock.calls[0][0]).toMatchObject({ title: initial.title, preferences: { 'pin:a': false } })
  confirm.mockRestore()
})
test('offers both conflict values and applies only the chosen field', async () => {
  const initial = createInitialState()
  recordConflicts(createSyncStateFromAppState(initial), createSyncStateFromAppState({ ...initial, title: '电脑' }), createSyncStateFromAppState({ ...initial, title: '手机' }))
  const restore = vi.fn()
  render(<RecoveryPanel state={{ ...initial, title: '电脑', progressCurrent: 9 }} onRestore={restore} />)
  await userEvent.click(screen.getByText(/历史与冲突/))
  await userEvent.click(screen.getByRole('button', { name: '采用另一设备' }))
  expect(restore.mock.calls[0][0]).toMatchObject({ title: '手机', progressCurrent: 9 })
  expect(readConflicts()).toHaveLength(0)
})
