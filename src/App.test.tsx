import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

beforeEach(() => localStorage.clear())

test('renders the default editable page title', () => {
  render(<App />)
  expect(screen.getByText('项目进度')).toBeInTheDocument()
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

test.each([
  ['Learn Buffett', 'https://learnbuffett.com'],
  ['Munger Models', 'https://mungermodels.com'],
  ['GoGoScrum', 'https://gogoscrum.com'],
  ['公众号编辑器', 'https://sange1022.github.io/xuwu-wechat-editor/'],
  ['图片拼贴', 'https://sange1022.github.io/xuwu-image-collage/'],
])('opens the %s shortcut safely in a new tab', (name, href) => {
  render(<App />)
  const link = screen.getByRole('link', { name })
  expect(link).toHaveAttribute('href', href)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('opens and switches the integrated daily checklist and layout tools', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '每日卡路里' }))
  const tools = screen.getByRole('region', { name: '综合工具' })
  expect(tools).toBeVisible()
  expect(within(tools).getByTitle('每日卡路里')).toHaveAttribute('src', 'https://sange1022.github.io/daily-calorie-tracker/')

  await user.click(screen.getByRole('button', { name: '清单打卡' }))
  expect(within(tools).getByTitle('清单打卡')).toHaveAttribute('src', 'https://sange1022.github.io/qingdan-checklist/')
  expect(within(tools).getByTitle('每日卡路里')).not.toBeVisible()

  await user.click(screen.getByRole('button', { name: '字间排版' }))
  expect(within(tools).getByTitle('字间排版')).toHaveAttribute('src', 'https://sange1022.github.io/zijian-text-layout/')
  await user.click(screen.getByRole('button', { name: '关闭综合工具' }))
  expect(screen.queryByRole('region', { name: '综合工具' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '打卡活动' })).toBeVisible()
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
  const panels = screen.getByText('管理进度项目').closest('.bottom-panels')
  const activity = screen.getByRole('region', { name: '打卡活动' })

  expect(panels).not.toBeNull()
  if (!panels) throw new Error('Bottom panels are missing')
  expect(panels.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('shows one-code sync for the dashboard and integrated tools at the bottom', () => {
  render(<App />)
  const sync = screen.getByRole('region', { name: '数据同步' })
  expect(within(sync).getByText('本页面全部数据')).toBeVisible()
  expect(within(sync).getByRole('textbox', { name: '同步码' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '连接' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '新建同步码' })).toBeVisible()
})
