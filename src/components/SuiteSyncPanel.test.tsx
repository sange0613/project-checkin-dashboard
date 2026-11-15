import { render, screen } from '@testing-library/react'
import { SuiteSyncPanel } from './SuiteSyncPanel'

test('shows the count of edits waiting to sync even when the connection failed', () => {
  render(<SuiteSyncPanel code="TESTCODE12345" connected status="error" message="当前离线" pendingCount={3} onCodeChange={() => {}} onConnect={() => {}} onCreate={() => {}} onDisconnect={() => {}} />)
  expect(screen.getByRole('status')).toHaveTextContent('3 项修改待同步 · 当前离线')
})

test('shows when the latest sync completed', () => {
  render(
    <SuiteSyncPanel
      code=""
      connected
      status="synced"
      message="已同步"
      lastSyncedAt={Date.now()}
      onCodeChange={() => undefined}
      onConnect={() => undefined}
      onCreate={() => undefined}
      onDisconnect={() => undefined}
    />,
  )

  expect(screen.getByRole('status')).toHaveTextContent('已同步 · 刚刚')
})
