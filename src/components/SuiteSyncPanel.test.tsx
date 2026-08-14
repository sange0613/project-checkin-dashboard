import { render, screen } from '@testing-library/react'
import { SuiteSyncPanel } from './SuiteSyncPanel'

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
