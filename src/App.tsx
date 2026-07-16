import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Download, ExternalLink, Github, Moon, Plus, Search, Sun, Upload, X } from 'lucide-react'
import { EditableText } from './components/EditableText'
import { ProjectDialog } from './components/ProjectDialog'
import { ProjectGrid } from './components/ProjectGrid'
import { DailyRandomPanel } from './components/DailyRandomPanel'
import { RandomPromptManager } from './components/RandomPromptManager'
import { RandomHistory } from './components/RandomHistory'
import { ProjectStageBoard, StageProjectManager } from './components/ProjectStageBoard'
import { CheckinActivityHeatmap } from './components/CheckinActivityHeatmap'
import { SuiteSyncPanel } from './components/SuiteSyncPanel'
import type { AppState, Project, ViewMode } from './domain/types'
import { toDateKey } from './domain/dateRanges'
import { createStageProject } from './domain/projectStages'
import { exportState, importState } from './storage/dataTransfer'
import { createLocalCheckinRepository } from './storage/localCheckinRepository'
import { useSuiteSync } from './hooks/useSuiteSync'
import './styles.css'

const repository = createLocalCheckinRepository(window.localStorage)

const integratedTools = [
  { id: 'daily', label: '饮', name: '每日卡路里', url: 'https://sange1022.github.io/daily-calorie-tracker/' },
  { id: 'checklist', label: '清', name: '清单打卡', url: 'https://sange1022.github.io/qingdan-checklist/' },
] as const

type IntegratedToolId = typeof integratedTools[number]['id']

type IntegratedToolWorkspaceProps = {
  activeToolId: IntegratedToolId
  loadedToolIds: IntegratedToolId[]
  dataRevision: number
  onSelect: (toolId: IntegratedToolId) => void
  onClose: () => void
}

function IntegratedToolWorkspace({ activeToolId, loadedToolIds, dataRevision, onSelect, onClose }: IntegratedToolWorkspaceProps) {
  const activeTool = integratedTools.find((tool) => tool.id === activeToolId) ?? integratedTools[0]

  return (
    <section className="integrated-workspace" aria-label="综合工具">
      <header className="integrated-toolbar">
        <nav className="integrated-tabs" aria-label="综合工具切换">
          {integratedTools.map((tool) => (
            <button
              type="button"
              key={`${tool.id}-${dataRevision}`}
              className={tool.id === activeToolId ? 'active' : ''}
              aria-pressed={tool.id === activeToolId}
              onClick={() => onSelect(tool.id)}
            >
              <span>{tool.label}</span>{tool.name}
            </button>
          ))}
        </nav>
        <div className="integrated-toolbar-actions">
          <a className="icon-button" href={activeTool.url} target="_blank" rel="noopener noreferrer" aria-label={`在新标签页打开${activeTool.name}`} title="在新标签页打开">
            <ExternalLink size={16} />
          </a>
          <button type="button" className="icon-button" aria-label="关闭综合工具" title="返回项目进度" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="integrated-frame-stack">
        {loadedToolIds.map((toolId) => {
          const tool = integratedTools.find((item) => item.id === toolId)
          if (!tool) return null
          return (
            <iframe
              key={tool.id}
              className="integrated-frame"
              src={tool.url}
              title={tool.name}
              hidden={tool.id !== activeToolId}
            />
          )
        })}
      </div>
    </section>
  )
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export default function App() {
  const [state, setState] = useState<AppState>(() => repository.load())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [transferMessage, setTransferMessage] = useState('')
  const [activeToolId, setActiveToolId] = useState<IntegratedToolId | null>(null)
  const [loadedToolIds, setLoadedToolIds] = useState<IntegratedToolId[]>([])
  const importInputRef = useRef<HTMLInputElement>(null)
  const suiteSync = useSuiteSync(state, setState)
  const today = useMemo(() => new Date(), [])
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const actualTheme = state.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.theme
  const anchor = new Date(state.anchorDate)

  useEffect(() => repository.save(state), [state])
  useEffect(() => { document.title = state.title }, [state.title])
  useEffect(() => { document.documentElement.dataset.theme = actualTheme }, [actualTheme])

  const update = (change: (current: AppState) => AppState) => setState((current) => change(current))
  const visibleProjects = state.projects.filter((project) =>
    !project.archived && project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const setView = (view: ViewMode) => update((current) => ({ ...current, view }))
  const moveMonth = (delta: number) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
    update((current) => ({ ...current, anchorDate: next.toISOString() }))
  }

  const createProject = (name: string) => {
    const project: Project = { id: makeId(), name, createdAt: new Date().toISOString(), archived: false }
    update((current) => ({ ...current, projects: [...current.projects, project] }))
  }

  const toggleCheckin = (projectId: string, dateKey: string) => update((current) => {
    const currentDates = new Set(current.checkins[projectId] ?? [])
    currentDates.has(dateKey) ? currentDates.delete(dateKey) : currentDates.add(dateKey)
    return { ...current, checkins: { ...current.checkins, [projectId]: [...currentDates].sort() } }
  })

  const renameProject = (projectId: string, name: string) => update((current) => ({
    ...current,
    projects: current.projects.map((project) => project.id === projectId ? { ...project, name } : project),
  }))

  const deleteProject = (projectId: string) => update((current) => {
    const checkins = { ...current.checkins }
    delete checkins[projectId]
    return { ...current, projects: current.projects.filter((project) => project.id !== projectId), checkins }
  })

  const moveProject = (projectId: string, direction: -1 | 1) => update((current) => {
    const index = current.projects.findIndex((project) => project.id === projectId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= current.projects.length) return current
    const projects = [...current.projects]
    ;[projects[index], projects[target]] = [projects[target], projects[index]]
    return { ...current, projects }
  })

  const monthTitle = `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
  const todayKey = toDateKey(today)
  const syncSummary = suiteSync.status === 'synced'
    ? '数据已同步'
    : suiteSync.status === 'syncing'
      ? '正在同步'
      : suiteSync.status === 'connecting'
        ? '正在连接'
        : suiteSync.message

  const saveRandomResult = (categoryId: AppState['randomCategories'][number]['id'], result: { itemId: string; name: string }) => update((current) => ({
    ...current,
    dailyRandomResults: {
      ...current.dailyRandomResults,
      [todayKey]: { ...current.dailyRandomResults[todayKey], [categoryId]: result },
    },
  }))

  const addRandomItem = (categoryId: AppState['randomCategories'][number]['id']) => update((current) => ({
    ...current,
    randomCategories: current.randomCategories.map((category) => category.id === categoryId
      ? { ...category, items: [...category.items, { id: makeId(), name: '新内容' }] }
      : category),
  }))

  const renameRandomItem = (categoryId: AppState['randomCategories'][number]['id'], itemId: string, name: string) => update((current) => ({
    ...current,
    randomCategories: current.randomCategories.map((category) => category.id === categoryId
      ? { ...category, items: category.items.map((item) => item.id === itemId ? { ...item, name } : item) }
      : category),
  }))

  const deleteRandomItem = (categoryId: AppState['randomCategories'][number]['id'], itemId: string) => update((current) => ({
    ...current,
    randomCategories: current.randomCategories.map((category) => category.id === categoryId && category.items.length > 1
      ? { ...category, items: category.items.filter((item) => item.id !== itemId) }
      : category),
  }))

  const addStageProject = (name: string) => update((current) => ({ ...current, stageProjects: [...current.stageProjects, createStageProject(name, makeId())] }))
  const renameStageProject = (id: string, name: string) => update((current) => ({ ...current, stageProjects: current.stageProjects.map((project) => project.id === id ? { ...project, name } : project) }))
  const setStageProjectStage = (id: string, stageIndex: number) => update((current) => ({ ...current, stageProjects: current.stageProjects.map((project) => project.id === id ? { ...project, stageIndex } : project) }))
  const deleteStageProject = (id: string) => update((current) => ({ ...current, stageProjects: current.stageProjects.filter((project) => project.id !== id) }))
  const renameStageBoard = (stageBoardTitle: string) => update((current) => ({ ...current, stageBoardTitle }))
  const renameStageLabel = (index: number, label: string) => update((current) => ({
    ...current,
    stageLabels: current.stageLabels.map((currentLabel, currentIndex) => currentIndex === index ? label : currentLabel),
  }))
  const toggleTheme = () => update((current) => ({ ...current, theme: actualTheme === 'dark' ? 'light' : 'dark' }))
  const openIntegratedTool = (toolId: IntegratedToolId) => {
    setLoadedToolIds((current) => current.includes(toolId) ? current : [...current, toolId])
    setActiveToolId(toolId)
  }

  const downloadBackup = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `项目进度备份-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setTransferMessage('数据已导出')
  }

  const loadBackup = async (file?: File) => {
    if (!file) return
    try {
      const nextState = importState(await file.text())
      if (window.confirm('导入会覆盖当前浏览器中的全部项目和打卡数据，继续吗？')) {
        setState(nextState)
        setTransferMessage('数据已导入')
      }
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : '导入失败')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <EditableText value={state.title} ariaLabel="页面标题" onSave={(title) => update((current) => ({ ...current, title }))} className="page-title" />
        <nav className="view-switcher" aria-label="时间视图">
          {([['day', '每日'], ['week', '每周'], ['month', '每月']] as const).map(([mode, label]) => (
            <button key={mode} className={state.view === mode ? 'active' : ''} aria-pressed={state.view === mode} onClick={() => setView(mode)}>{label}</button>
          ))}
        </nav>
        <div className="top-actions">
          <button type="button" className="icon-button shortcut-character" aria-label="每日卡路里" title="每日卡路里" onClick={() => openIntegratedTool('daily')}>饮</button>
          <button type="button" className="icon-button shortcut-character" aria-label="清单打卡" title="清单打卡" onClick={() => openIntegratedTool('checklist')}>清</button>
          <a className="icon-button shortcut-character" href="https://sange1022.github.io/zijian-text-layout/" target="_blank" rel="noopener noreferrer" aria-label="字间排版" title="字间排版">字</a>
          <a
            className="icon-button"
            href="https://sange1022.github.io/english-copywork-trainer/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="英语抄写"
            title="英语抄写"
          >
            <BookOpen size={17} />
          </a>
          <a className="icon-button shortcut-character" href="https://learnbuffett.com" target="_blank" rel="noopener noreferrer" aria-label="Learn Buffett" title="Learn Buffett">巴</a>
          <a className="icon-button shortcut-character" href="https://mungermodels.com" target="_blank" rel="noopener noreferrer" aria-label="Munger Models" title="Munger Models">芒</a>
          <a className="icon-button shortcut-character" href="https://gogoscrum.com" target="_blank" rel="noopener noreferrer" aria-label="GoGoScrum" title="GoGoScrum">项</a>
          <a className="icon-button shortcut-character" href="https://sange1022.github.io/xuwu-wechat-editor/" target="_blank" rel="noopener noreferrer" aria-label="公众号编辑器" title="公众号编辑器">公</a>
          <a className="icon-button shortcut-character" href="https://sange1022.github.io/xuwu-image-collage/" target="_blank" rel="noopener noreferrer" aria-label="图片拼贴" title="图片拼贴">拼</a>
          <a className="icon-button" href="https://github.com/sange1022" target="_blank" rel="noopener noreferrer" aria-label="GitHub 主页" title="GitHub 主页">
            <Github size={17} />
          </a>
          <button className="icon-button" aria-label={actualTheme === 'dark' ? '切换白天模式' : '切换夜晚模式'} onClick={toggleTheme}>
            {actualTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-button" aria-label={searchOpen ? '关闭搜索' : '搜索项目'} onClick={() => setSearchOpen((value) => !value)}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
          <button className="new-project-button" onClick={() => setDialogOpen(true)}><Plus size={16} />新项目</button>
        </div>
      </header>
      {activeToolId ? (
        <IntegratedToolWorkspace
          activeToolId={activeToolId}
          loadedToolIds={loadedToolIds}
          dataRevision={suiteSync.toolDataRevision}
          onSelect={openIntegratedTool}
          onClose={() => setActiveToolId(null)}
        />
      ) : (
        <>
          <DailyRandomPanel categories={state.randomCategories} results={state.dailyRandomResults[todayKey] ?? {}} onResult={saveRandomResult} />

          <section className="workspace">
        {searchOpen && (
          <div className="search-bar">
            <Search size={16} />
            <input type="search" aria-label="搜索项目" placeholder="搜索项目…" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          </div>
        )}

        <div className="period-toolbar">
          <div>
            <p className="eyebrow">{state.view === 'day' ? 'MONTHLY CHECK-IN' : state.view === 'week' ? 'LAST 12 WEEKS' : 'LAST 12 MONTHS'}</p>
            <h1>{state.view === 'day' ? monthTitle : state.view === 'week' ? '最近 12 周' : '最近 12 个月'}</h1>
            <p className="period-meta" role="status">{syncSummary}</p>
          </div>
          {state.view === 'day' && (
            <div className="month-navigation">
              <button className="icon-button" aria-label="上一个月" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
              <button className="today-button" onClick={() => update((current) => ({ ...current, anchorDate: today.toISOString() }))}>回到本月</button>
              <button className="icon-button" aria-label="下一个月" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
            </div>
          )}
          {state.view !== 'day' && (
            <div className="intensity-legend"><span>少</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} data-intensity={level} />)}<span>多</span></div>
          )}
        </div>

        <ProjectGrid view={state.view} anchor={anchor} today={today} projects={visibleProjects} checkins={state.checkins} onToggle={toggleCheckin} onRename={renameProject} onMove={moveProject} onDelete={deleteProject} />
        <ProjectStageBoard title={state.stageBoardTitle} labels={state.stageLabels} projects={state.stageProjects} onTitleChange={renameStageBoard} onLabelChange={renameStageLabel} onStageChange={setStageProjectStage} />
        {!visibleProjects.length && (
          <div className="empty-state">
            <div className="empty-mark">日</div>
            <h2>{query ? '没有匹配的项目' : '从第一个项目开始'}</h2>
            <p>{query ? '换一个关键词试试。' : '建立项目，然后每天轻点一下。'}</p>
            {!query && <button className="primary-button" onClick={() => setDialogOpen(true)}><Plus size={16} />添加项目</button>}
          </div>
        )}

        <footer className="footer-note">
          <div className="footer-copy">
            <span>点击格子打卡，再次点击取消</span>
            <span>标题与项目名称均可直接编辑</span>
          </div>
          <div className="data-transfer">
            {transferMessage && <span className="transfer-message" role="status">{transferMessage}</span>}
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => loadBackup(event.target.files?.[0])}
            />
            <button aria-label="导入数据" onClick={() => importInputRef.current?.click()}><Upload size={13} />导入</button>
            <button aria-label="导出数据" onClick={downloadBackup}><Download size={13} />导出</button>
          </div>
        </footer>
        <div className="bottom-panels">
          <RandomPromptManager categories={state.randomCategories} onAdd={addRandomItem} onRename={renameRandomItem} onDelete={deleteRandomItem} />
          <RandomHistory categories={state.randomCategories} history={state.dailyRandomResults} />
          <StageProjectManager projects={state.stageProjects} onAdd={addStageProject} onRename={renameStageProject} onDelete={deleteStageProject} />
        </div>
        <CheckinActivityHeatmap checkins={state.checkins} today={today} />
        <SuiteSyncPanel
          code={suiteSync.codeInput}
          connected={Boolean(suiteSync.connectedCode)}
          status={suiteSync.status}
          message={suiteSync.message}
          onCodeChange={suiteSync.setCodeInput}
          onConnect={() => suiteSync.connect()}
          onCreate={suiteSync.createAndConnect}
          onDisconnect={suiteSync.disconnect}
        />
      </section>
        </>
      )}

      <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={createProject} />
    </main>
  )
}
