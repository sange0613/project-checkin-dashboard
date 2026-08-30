import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './domain/types'

beforeEach(() => localStorage.clear())

test('renders the default editable page title', () => {
  render(<App />)
  expect(screen.getByText('项目进度')).toBeInTheDocument()
  expect(document.querySelector('.period-meta')).toHaveTextContent('仅保存在当前浏览器')
  expect(screen.queryByText(/个项目 · 仅保存在此浏览器/)).not.toBeInTheDocument()
})

test('edits six not-doing list items below the random panel', async () => {
  const user = userEvent.setup()
  render(<App />)
  const list = screen.getByRole('region', { name: '不为清单' })
  const inputs = within(list).getAllByRole('textbox')
  expect(inputs).toHaveLength(6)
  await user.type(inputs[0], '不刷短视频')
  expect(inputs[0]).toHaveValue('不刷短视频')
})

test('sets and displays the goal progress above the random panel', async () => {
  const user = userEvent.setup()
  render(<App />)
  const progress = screen.getByRole('region', { name: '目标进度' })
  expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuetext', '0%')

  await user.click(screen.getByText('设置进度'))
  const total = screen.getByRole('spinbutton', { name: '总数' })
  const current = screen.getByRole('spinbutton', { name: '目前数字' })
  await user.clear(total)
  await user.type(total, '80')
  await user.clear(current)
  await user.type(current, '20')

  expect(within(progress).getByText('20 / 80 · 25%')).toBeVisible()
  expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuetext', '25%')
})

test('opens on the current month even when the saved month is stale', () => {
  const saved = { ...createInitialState(), anchorDate: '2025-01-01T00:00:00.000Z' }
  localStorage.setItem('project-checkins', JSON.stringify({ version: 1, state: saved }))
  render(<App />)
  const now = new Date()
  expect(screen.getByRole('heading', { name: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月` })).toBeVisible()
})

test('edits the title and creates a project', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByText('项目进度'))
  await user.clear(screen.getByRole('textbox', { name: '页面标题' }))
  await user.type(screen.getByRole('textbox', { name: '页面标题' }), '六月计划{Enter}')
  expect(screen.getByText('六月计划')).toBeVisible()

  await user.click(screen.getByRole('button', { name: '新项目' }))
  await user.type(screen.getByRole('textbox', { name: '项目名称' }), '官网重构')
  await user.click(screen.getByRole('button', { name: '创建' }))
  expect(screen.getByText('官网重构')).toBeVisible()
})

test('switches between daily weekly and monthly views', async () => {
  const user = userEvent.setup()
  render(<App />)
  const timeViews = within(screen.getByRole('navigation', { name: '时间视图' }))
  await user.click(timeViews.getByRole('button', { name: '每周' }))
  expect(screen.getAllByTestId('period-header')).toHaveLength(12)
  await user.click(timeViews.getByRole('button', { name: '每月' }))
  expect(screen.getAllByTestId('period-header')).toHaveLength(12)
})

test('opens the English copywork shortcut safely in a new tab', () => {
  render(<App />)
  const link = screen.getByRole('link', { name: '英语抄写' })
  expect(link).toHaveAttribute('href', 'https://sange1022.github.io/english-copywork-trainer/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('opens the GitHub profile shortcut safely in a new tab', () => {
  render(<App />)
  const link = screen.getByRole('link', { name: 'GitHub 主页' })
  expect(link).toHaveAttribute('href', 'https://github.com/sange1022')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('places the synced tools first with daily at the front', () => {
  render(<App />)
  const actions = document.querySelector('.top-actions')
  expect(actions).not.toBeNull()
  expect(Array.from(actions?.children ?? []).slice(0, 4).map((item) => item.getAttribute('aria-label')))
    .toEqual(['每日卡路里', '清单打卡', '物品日均成本', '字间排版'])
})

test.each([
  ['Learn Buffett', 'https://learnbuffett.com'],
  ['Munger Models', 'https://mungermodels.com'],
  ['GoGoScrum', 'https://gogoscrum.com'],
  ['公众号编辑器', 'https://sange1022.github.io/xuwu-wechat-editor/'],
  ['图片拼贴', 'https://sange1022.github.io/xuwu-image-collage/'],
  ['平面图制作', 'https://sange1022.github.io/floor-plan-maker/'],
  ['构', 'https://sange1022.github.io/qf-07-9a6c3e21/'],
  ['间', 'https://sange1022.github.io/random-planar-composition/'],
  ['海', 'https://sange1022.github.io/contour-text-studio/?v=5787e7a'],
  ['词', 'https://sange1022.github.io/english-vocabulary-study/'],
])('opens the %s shortcut safely in a new tab', (name, href) => {
  render(<App />)
  const link = screen.getByRole('link', { name })
  expect(link).toHaveAttribute('href', href)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('opens and switches the integrated daily, checklist, and item cost tools', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '每日卡路里' }))
  const tools = screen.getByRole('region', { name: '综合工具' })
  expect(tools).toBeVisible()
  expect(within(tools).getByTitle('每日卡路里')).toHaveAttribute('src', 'https://sange1022.github.io/daily-calorie-tracker/')

  await user.click(screen.getByRole('button', { name: '清单打卡' }))
  expect(within(tools).getByTitle('清单打卡')).toHaveAttribute('src', 'https://sange1022.github.io/qingdan-checklist/')
  expect(within(tools).getByTitle('每日卡路里')).not.toBeVisible()

  await user.click(screen.getByRole('button', { name: '物品日均成本' }))
  expect(within(tools).getByTitle('物品日均成本')).toHaveAttribute('src', 'https://sange1022.github.io/wuwu/')
  expect(within(tools).getByTitle('清单打卡')).not.toBeVisible()

  await user.click(screen.getByRole('button', { name: '关闭综合工具' }))
  expect(screen.queryByRole('region', { name: '综合工具' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '打卡活动' })).toBeVisible()
})

test('opens the layout tool in its original standalone page', () => {
  render(<App />)
  const link = screen.getByRole('link', { name: '字间排版' })
  expect(link).toHaveAttribute('href', 'https://sange1022.github.io/zijian-text-layout/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('does not show the removed xhs trend radar shortcut', () => {
  render(<App />)
  expect(screen.queryByRole('link', { name: '小红书趋势雷达' })).not.toBeInTheDocument()
})

test('moves projects up and down and exposes delete directly', async () => {
  const user = userEvent.setup()
  render(<App />)

  for (const name of ['项目一', '项目二']) {
    await user.click(screen.getByRole('button', { name: '新项目' }))
    await user.type(screen.getByRole('textbox', { name: '项目名称' }), name)
    await user.click(screen.getByRole('button', { name: '创建' }))
  }

  const namesBefore = screen.getAllByTestId('project-name').map((item) => item.textContent)
  expect(namesBefore).toEqual(['项目一', '项目二'])

  await user.click(screen.getByRole('button', { name: '上移 项目二' }))
  const namesAfter = screen.getAllByTestId('project-name').map((item) => item.textContent)
  expect(namesAfter).toEqual(['项目二', '项目一'])
  expect(screen.getByRole('button', { name: '删除 项目二' })).toBeVisible()
})

test('shows quiet import and export controls in the footer', () => {
  render(<App />)
  expect(screen.getByRole('button', { name: '导入数据' })).toBeVisible()
  expect(screen.getByRole('button', { name: '导出数据' })).toBeVisible()
})

test('shows the activity heatmap after the bottom management panels', () => {
  render(<App />)
  const panels = screen.getByText('管理随机内容').closest('.bottom-panels')
  const activity = screen.getByRole('region', { name: '打卡活动' })

  expect(panels).not.toBeNull()
  if (!panels) throw new Error('Bottom panels are missing')
  expect(panels.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByText('管理进度项目')).not.toBeInTheDocument()
})

test('keeps sync settings collapsed until requested', async () => {
  const user = userEvent.setup()
  render(<App />)
  const sync = screen.getByRole('region', { name: '数据同步' })
  expect(within(sync).queryByRole('textbox', { name: '同步码' })).not.toBeInTheDocument()
  await user.click(within(sync).getByRole('button', { name: '展开同步设置' }))
  expect(within(sync).getByText('项目、饮食、清单与物品数据')).toBeVisible()
  expect(within(sync).getByRole('textbox', { name: '同步码' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '连接' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '新建同步码' })).toBeVisible()
  await user.click(within(sync).getByRole('button', { name: '收起同步设置' }))
  expect(within(sync).queryByRole('textbox', { name: '同步码' })).not.toBeInTheDocument()
})
