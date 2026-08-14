import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createInitialState } from '../domain/types'
import { ProjectStageBoard } from './ProjectStageBoard'

function renderBoard() {
  const state = createInitialState()
  const onCreate = vi.fn()
  const onUpdate = vi.fn()
  const onStageChange = vi.fn()
  render(
    <ProjectStageBoard
      title={state.stageBoardTitle}
      labels={state.stageLabels}
      projects={[{ id: 'stage-1', name: '住宅设计', stageIndex: 6, createdAt: '2026-08-01T00:00:00.000Z' }]}
      onTitleChange={vi.fn()}
      onLabelsChange={vi.fn()}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
      onStageChange={onStageChange}
    />,
  )
  return { onCreate, onUpdate, onStageChange }
}

test('shows the migrated portfolio summary, gantt and project stage list', () => {
  renderBoard()

  const summary = screen.getByRole('generic', { name: '项目数据总览' })
  expect(within(summary).getByRole('button', { name: /全部项目.*1.*所有项目/ })).toBeVisible()
  expect(screen.getByRole('region', { name: '项目排期' })).toBeVisible()
  const projectList = screen.getByRole('generic', { name: '阶段项目列表' })
  expect(within(projectList).getByText('住宅设计')).toBeVisible()
  expect(within(projectList).getByText('二次方案')).toBeVisible()
  expect(within(projectList).getByText('65%')).toBeVisible()
})

test('creates a detailed project from the side editor', async () => {
  const user = userEvent.setup()
  const { onCreate } = renderBoard()

  await user.click(screen.getByRole('button', { name: '新建项目' }))
  const editor = screen.getByRole('dialog', { name: '新建阶段项目' })
  await user.type(within(editor).getByRole('textbox', { name: '项目名称' }), '云栖住宅')
  await user.type(within(editor).getByRole('textbox', { name: '客户' }), '林先生')
  await user.click(within(editor).getByRole('button', { name: '保存' }))

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: '云栖住宅', client: '林先生', stageIndex: 0 }))
})

test('changes a project stage directly from the progress rail', async () => {
  const user = userEvent.setup()
  const { onStageChange } = renderBoard()

  await user.click(screen.getByRole('button', { name: '将 住宅设计 设为现场施工' }))
  expect(onStageChange).toHaveBeenCalledWith('stage-1', 13)
})

test('marks the current task complete from the project editor', async () => {
  const user = userEvent.setup()
  const { onUpdate } = renderBoard()

  await user.click(screen.getByRole('button', { name: '编辑阶段项目 住宅设计' }))
  const editor = screen.getByRole('dialog', { name: '编辑阶段项目' })
  await user.click(within(editor).getByRole('button', { name: '标记当前任务完结' }))
  await user.click(within(editor).getByRole('button', { name: '保存' }))

  expect(onUpdate).toHaveBeenCalledWith('stage-1', expect.objectContaining({ taskCompleted: true }))
})

test('adds and saves a custom stage name', async () => {
  const user = userEvent.setup()
  const state = createInitialState()
  const onLabelsChange = vi.fn()
  render(
    <ProjectStageBoard
      title={state.stageBoardTitle}
      labels={state.stageLabels}
      projects={[]}
      onTitleChange={vi.fn()}
      onLabelsChange={onLabelsChange}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onStageChange={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '编辑阶段' }))
  const editor = screen.getByRole('dialog', { name: '编辑阶段名称' })
  await user.click(within(editor).getByRole('button', { name: '添加阶段名称' }))
  await user.clear(within(editor).getByRole('textbox', { name: '阶段 16' }))
  await user.type(within(editor).getByRole('textbox', { name: '阶段 16' }), '竣工摄影')
  await user.click(within(editor).getByRole('button', { name: '保存阶段名称' }))

  expect(onLabelsChange).toHaveBeenCalledWith([...state.stageLabels, '竣工摄影'])
})
