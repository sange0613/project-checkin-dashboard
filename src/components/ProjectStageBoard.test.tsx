import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInitialState } from '../domain/types'
import { ProjectStageBoard } from './ProjectStageBoard'

test('shows a compact mobile overview before the detailed stage grid', async () => {
  const user = userEvent.setup()
  const state = createInitialState()
  render(
    <ProjectStageBoard
      title={state.stageBoardTitle}
      labels={state.stageLabels}
      projects={[{ id: 'stage-1', name: '住宅设计', stageIndex: 6, createdAt: '2026-08-01T00:00:00.000Z' }]}
      onTitleChange={() => undefined}
      onLabelChange={() => undefined}
      onStageChange={() => undefined}
    />,
  )

  expect(document.querySelector('.stage-mobile-project')).toHaveTextContent('住宅设计二次方案65%')
  await user.click(screen.getByRole('button', { name: '展开详细阶段' }))
  expect(document.querySelector('.stage-scroll')).toHaveAttribute('data-mobile-expanded', 'true')
})
