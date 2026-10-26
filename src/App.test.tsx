import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialState } from './domain/types'
import { exportFullBackup } from './storage/suiteBackup'
import { TOOL_STORAGE_KEYS } from './sync/toolStorage'

beforeEach(() => localStorage.clear())

test('imports a unified backup while retaining the existing sync code', async () => {
  const restored = createInitialState()
  restored.title = '统一备份恢复'
  localStorage.setItem(TOOL_STORAGE_KEYS.time, JSON.stringify({ '2026-10-26': [] }))
  const content = exportFullBackup(restored)
  localStorage.clear()
  const { container } = render(<App />)
  // Set after mount so this test never starts an actual cloud connection.
  localStorage.setItem('project-suite-sync-code-v1', 'KEEPORIGINAL1234')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const file = new File([content], 'unified.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => content })
  try {
    await userEvent.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file)
    expect(screen.getByRole('button', { name: '统一备份恢复' })).toBeVisible()
    expect(JSON.parse(localStorage.getItem(TOOL_STORAGE_KEYS.time)!).days).toEqual({ '2026-10-26': [] })
    expect(localStorage.getItem('project-suite-sync-code-v1')).toBe('KEEPORIGINAL1234')
    expect(screen.getByText('统一备份已导入，同步码保持不变')).toBeVisible()
  } finally { confirm.mockRestore() }
})

test('does not import subpages if the dashboard cannot be saved', async () => {
  const next = createInitialState()
  next.title = '不应覆盖'
  localStorage.setItem(TOOL_STORAGE_KEYS.time, JSON.stringify({ '2026-10-26': [] }))
  const content = exportFullBackup(next)
  localStorage.clear()
  const { container } = render(<App />)
  const original = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
    if (key === 'project-checkins' && value.includes('不应覆盖')) throw new DOMException('full', 'QuotaExceededError')
    original.call(this, key, value)
  })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const file = new File([content], 'full.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => content })
  try {
    await userEvent.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file)
    expect(screen.queryByRole('button', { name: '不应覆盖' })).not.toBeInTheDocument()
    expect(localStorage.getItem(TOOL_STORAGE_KEYS.time)).toBeNull()
    expect(screen.getByText('无法保存导入数据，请先导出备份并检查浏览器存储空间。')).toBeVisible()
  } finally { storage.mockRestore(); confirm.mockRestore() }
})

test('moves projects by the visible order even when hidden rows lie between them', async () => {
  const state = createInitialState()
  state.projects = [
    { id: 'a', name: '甲', createdAt: '', archived: false },
    { id: 'b', name: '隐藏项', createdAt: '', archived: true },
    { id: 'c', name: '丙', createdAt: '', archived: false },
  ]
  localStorage.setItem('project-checkins', JSON.stringify({ version: 1, state }))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '上移 丙' }))
  expect(screen.getAllByTestId('project-name').map(item => item.textContent)).toEqual(['丙', '甲'])
  await userEvent.click(screen.getByRole('button', { name: '置顶 甲' }))
  expect(screen.getByRole('button', { name: '下移 甲' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '上移 丙' })).toBeDisabled()
})

test('keeps the page usable and exposes backup export when primary storage is full', async () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  try {
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent(/保存|存储空间/)
    expect(within(screen.getByRole('alert')).getByRole('button', { name: '导出备份' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '新项目' }))
    await userEvent.type(screen.getByRole('textbox', { name: '项目名称' }), '未保存项目')
    await userEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(screen.getByTestId('project-name')).toHaveTextContent('未保存项目')
  } finally { spy.mockRestore() }
})

test('places the daily summary immediately above the period toolbar', () => {
  render(<App />)
  const summary = screen.getByRole('navigation', { name: '今日摘要' })
  expect(summary.parentElement).toHaveClass('workspace')
  expect(summary.nextElementSibling).toHaveClass('period-toolbar')
  expect(within(summary).getAllByRole('button')).toHaveLength(4)
})

test('pins hides restores and filters checkin projects', async () => {
  const initial = createInitialState()
  initial.projects = [{ id: 'a', name: '甲', archived: false, createdAt: '' }, { id: 'b', name: '乙', archived: false, createdAt: '' }]
  localStorage.setItem('project-checkins', JSON.stringify({ version: 1, state: initial }))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '置顶 乙' }))
  expect(screen.getAllByTestId('project-name')[0]).toHaveTextContent('乙')
  await userEvent.click(screen.getByRole('button', { name: '隐藏 乙' }))
  expect(screen.getAllByTestId('project-row')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: '已隐藏' }))
  await userEvent.click(screen.getByRole('button', { name: '恢复显示 乙' }))
  await userEvent.click(screen.getByRole('button', { name: '全部' }))
  expect(screen.getAllByTestId('project-row')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: '今天未打卡' }))
  expect(screen.getAllByTestId('project-row')).toHaveLength(2)
})

test('remembers section collapse on this device', async () => {
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '今日随机' }))
  expect(screen.getByRole('button', { name: '今日随机' })).toHaveAttribute('aria-expanded', 'false')
  unmount()
  render(<App />)
  expect(screen.getByRole('button', { name: '今日随机' })).toHaveAttribute('aria-expanded', 'false')
})

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
  expect(link).toHaveAttribute('href', 'https://github.com/sange0613')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('places the synced tools first with daily at the front', () => {
  render(<App />)
  const actions = document.querySelector('.top-actions')
  expect(actions).not.toBeNull()
  expect(Array.from(actions?.children ?? []).slice(0, 6).map((item) => item.getAttribute('aria-label')))
    .toEqual(['每日卡路里', '清单打卡', '物品日均成本', '时间记录', '待办看板', '字间排版'])
})

test.each([
  ['Learn Buffett', 'https://learnbuffett.com'],
  ['Munger Models', 'https://mungermodels.com'],
  ['GoGoScrum', 'https://gogoscrum.com'],
  ['公众号编辑器', 'https://sange0613.github.io/xuwu-wechat-editor/'],
  ['图片拼贴', 'https://sange0613.github.io/xuwu-image-collage/'],
  ['图片转 PDF', 'https://sange0613.github.io/image-to-pdf-studio/'],
  ['图片水印', 'https://sange0613.github.io/image-watermark-web/'],
  ['配色工具', 'https://sange0613.github.io/shise-palette/'],
  ['平面图制作', 'https://sange0613.github.io/floor-plan-maker/'],
  ['构', 'https://sange1022.github.io/qf-07-9a6c3e21/'],
  ['间', 'https://sange1022.github.io/random-planar-composition/'],
  ['海', 'https://sange1022.github.io/contour-text-studio/?v=5787e7a'],
  ['词', 'https://sange1022.github.io/english-vocabulary-study/'],
])('opens the %s shortcut safely in a new tab', async (name, href) => {
  render(<App />)
  let link = screen.queryByRole('link', { name })
  if (!link) {
    await userEvent.click(screen.getByRole('button', { name: '更多工具' }))
    link = screen.getAllByRole('menuitem').find(item => item.getAttribute('href') === href) as HTMLAnchorElement
  }
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
  expect(within(tools).getByTitle('每日卡路里')).toHaveAttribute('src', 'https://sange0613.github.io/daily-calorie-tracker/')

  await user.click(screen.getByRole('button', { name: '清单打卡' }))
  expect(within(tools).getByTitle('清单打卡')).toHaveAttribute('src', 'https://sange0613.github.io/qingdan-checklist/')
  expect(within(tools).getByTitle('每日卡路里')).not.toBeVisible()

  await user.click(screen.getByRole('button', { name: '物品日均成本' }))
  expect(within(tools).getByTitle('物品日均成本')).toHaveAttribute('src', 'https://sange0613.github.io/wuwu/')
  expect(within(tools).getByTitle('清单打卡')).not.toBeVisible()

  await user.click(screen.getByRole('button', { name: '关闭综合工具' }))
  expect(screen.queryByRole('region', { name: '综合工具' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '打卡活动' })).toBeVisible()
})

test('opens the local time journal inside the dashboard and returns to projects', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '时间记录' }))
  const tools = screen.getByRole('region', { name: '综合工具' })
  const frame = within(tools).getByTitle('时间记录')
  expect(import.meta.env.VITE_JOURNAL_VERSION).toBeTruthy()
  expect(frame).toHaveAttribute('src', `${import.meta.env.BASE_URL}time-journal/index.html?v=${import.meta.env.VITE_JOURNAL_VERSION}`)
  expect(within(tools).getByRole('link', { name: '在新标签页打开时间记录' })).toHaveAttribute('href', `${import.meta.env.BASE_URL}time-journal/index.html?v=${import.meta.env.VITE_JOURNAL_VERSION}`)
  await user.click(within(tools).getByRole('button', { name: '关闭综合工具' }))
  expect(screen.getByRole('region', { name: '打卡活动' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '时间记录' }))
  expect(within(screen.getByRole('region', { name: '综合工具' })).getByTitle('时间记录')).toHaveAttribute('src', `${import.meta.env.BASE_URL}time-journal/index.html?v=${import.meta.env.VITE_JOURNAL_VERSION}`)
})

test('opens the layout tool inside the integrated workspace for suite synchronization', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '字间排版' }))
  expect(within(screen.getByRole('region', { name: '综合工具' })).getByTitle('字间排版')).toHaveAttribute('src', 'https://sange0613.github.io/zijian-text-layout/records/?suite=1')
})

test('exposes the original sync code settings inside the todo workspace', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '待办看板' }))
  const tools = screen.getByRole('region', { name: '综合工具' })
  await userEvent.click(within(tools).getByRole('button', { name: '展开同步设置' }))
  expect(within(tools).getByRole('textbox', { name: '同步码' })).toBeVisible()
  expect(within(tools).getByRole('button', { name: '连接' })).toBeVisible()
})

test('opens the packaged time journal from the standalone document without separate files', async () => {
  const payload = document.createElement('script')
  payload.id = 'standalone-time-journal'
  payload.type = 'application/json'
  payload.textContent = JSON.stringify('<html><body>内置时间记录</body></html>')
  document.body.append(payload)
  try {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '时间记录' }))
    const tools = screen.getByRole('region', { name: '综合工具' })
    expect(within(tools).getByTitle('时间记录')).toHaveAttribute('srcdoc', '<html><body>内置时间记录</body></html>')
    expect(within(tools).queryByRole('link', { name: '在新标签页打开时间记录' })).not.toBeInTheDocument()
  } finally { payload.remove() }
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
  expect(within(sync).getByText('项目、饮食、清单、物品、时间记录、模板与待办')).toBeVisible()
  expect(within(sync).getByRole('textbox', { name: '同步码' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '连接' })).toBeVisible()
  expect(within(sync).getByRole('button', { name: '新建同步码' })).toBeVisible()
  await user.click(within(sync).getByRole('button', { name: '收起同步设置' }))
  expect(within(sync).queryByRole('textbox', { name: '同步码' })).not.toBeInTheDocument()
})
