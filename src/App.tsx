import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Moon, Plus, Search, Sun, Upload, X } from 'lucide-react'
import { EditableText } from './components/EditableText'
import { ProjectDialog } from './components/ProjectDialog'
import { ProjectGrid } from './components/ProjectGrid'
import { DailyRandomPanel } from './components/DailyRandomPanel'
import { NotDoingList } from './components/NotDoingList'
import { GoalProgress, GoalProgressSettings } from './components/GoalProgress'
import { RandomPromptManager } from './components/RandomPromptManager'
import { RandomHistory } from './components/RandomHistory'
import { ProjectStageBoard } from './components/ProjectStageBoard'
import { CheckinActivityHeatmap } from './components/CheckinActivityHeatmap'
import { SuiteSyncPanel } from './components/SuiteSyncPanel'
import { ShortcutBar } from './components/ShortcutBar'
import { ShortcutSettings, readShortcuts } from './components/ShortcutSettings'
import { CollapsibleSection } from './components/CollapsibleSection'
import { RecoveryPanel } from './components/RecoveryPanel'
import { InstallPanel } from './components/InstallPanel'
import { saveRecovery } from './storage/recovery'
import { readConflicts } from './storage/syncConflicts'
import { eligibleRandomItems, readStageEvents, withStageEvent } from './domain/enhancements'
import { addStageDays, hydrateStageProject } from './domain/projectStages'
import type { AppState, Project, StageProjectDraft, ViewMode } from './domain/types'
import { toDateKey } from './domain/dateRanges'
import { exportState, importState } from './storage/dataTransfer'
import { createLocalCheckinRepository } from './storage/localCheckinRepository'
import { useSuiteSync } from '@app-sync'
import './styles.css'

const repository = createLocalCheckinRepository(window.localStorage)
const desktopLocalOnly = import.meta.env.VITE_DESKTOP_LOCAL_ONLY === 'true'

const integratedTools = [
  { id: 'daily', label: '饮', name: '每日卡路里', url: 'https://sange1022.github.io/daily-calorie-tracker/' },
  { id: 'checklist', label: '清', name: '清单打卡', url: 'https://sange1022.github.io/qingdan-checklist/' },
  { id: 'wuwu', label: '物', name: '物品日均成本', url: 'https://sange1022.github.io/wuwu/' },
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
  const [state, setState] = useState<AppState>(() => ({ ...repository.load(), anchorDate: new Date().toISOString() }))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState<'all' | 'unchecked' | 'archived'>('all')
  const [stageFilterRequest, setStageFilterRequest] = useState<{ filter: 'active' | 'dueSoon'; at: number }>()
  const [clock, setClock] = useState(() => Date.now())
  const [online, setOnline] = useState(navigator.onLine)
  const [conflictCount, setConflictCount] = useState(() => readConflicts().length)
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000)
    const connection = () => setOnline(navigator.onLine)
    const conflicts = () => setConflictCount(readConflicts().length)
    window.addEventListener('online', connection); window.addEventListener('offline', connection)
    window.addEventListener('recovery-updated', conflicts)
    return () => { clearInterval(timer); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('recovery-updated', conflicts) }
  }, [])
  const [transferMessage, setTransferMessage] = useState('')
  const [undo, setUndo] = useState<{ before: AppState; after: AppState } | null>(null)
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 12000); return () => clearTimeout(timer) }, [undo])
  const [activeToolId, setActiveToolId] = useState<IntegratedToolId | null>(null)
  const [loadedToolIds, setLoadedToolIds] = useState<IntegratedToolId[]>([])
  const importInputRef = useRef<HTMLInputElement>(null)
  const suiteSync = useSuiteSync(state, setState)
  const currentDay = toDateKey(new Date(clock))
  const today = useMemo(() => new Date(`${currentDay}T12:00:00`), [currentDay])
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const actualTheme = state.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.theme
  const anchor = new Date(state.anchorDate)

  useEffect(() => repository.save(state), [state])
  useEffect(() => { document.title = state.title }, [state.title])
  useEffect(() => { document.documentElement.dataset.theme = actualTheme }, [actualTheme])

  const update = (change: (current: AppState) => AppState) => {
    setState((current) => {
      const next = change(current)
      const keys = Object.keys(next) as (keyof AppState)[]
      if (keys.some((key) => key !== 'view' && key !== 'anchorDate' && JSON.stringify(current[key]) !== JSON.stringify(next[key]))) {
        const before = next.shortcutConfig && !current.shortcutConfig
          ? { ...current, shortcutConfig: readShortcuts().map((link) => JSON.stringify(link)) }
          : current
        setUndo({ before, after: next })
        saveRecovery(current, '修改前')
      }
      return next
    })
  }
  const undoLastChange = () => {
    if (!undo) return
    setState((current) => {
      saveRecovery(current, '撤销前')
      const next = { ...current }
      for (const key of Object.keys(undo.after) as (keyof AppState)[]) {
        if (JSON.stringify(undo.before[key]) !== JSON.stringify(undo.after[key]) && JSON.stringify(current[key]) === JSON.stringify(undo.after[key])) {
          Object.assign(next, { [key]: undo.before[key] })
        }
      }
      return next
    })
    setUndo(null)
  }
  const visibleProjects = state.projects.filter((project) =>
    (projectFilter === 'archived' ? project.archived : !project.archived) &&
    (projectFilter !== 'unchecked' || !(state.checkins[project.id] ?? []).includes(currentDay)) &&
    project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ).sort((a, b) => Number(Boolean(state.preferences?.[`pin:${b.id}`])) - Number(Boolean(state.preferences?.[`pin:${a.id}`])))
  const setPreference = (key: string, value: string | number | boolean) => update(current => ({ ...current, preferences: { ...current.preferences, [key]: value } }))
  const showCheckins = (filter: 'all' | 'unchecked') => {
    setProjectFilter(filter); setQuery('')
    update(current => ({ ...current, view: 'day', anchorDate: today.toISOString() }))
    document.getElementById('checkin-projects')?.scrollIntoView?.({ behavior: 'smooth' })
  }
  const showStages = (filter: 'active' | 'dueSoon') => {
    window.dispatchEvent(new CustomEvent('open-section', { detail: 'stages' }))
    setStageFilterRequest({ filter, at: Date.now() })
    requestAnimationFrame(() => document.getElementById('section-stages')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }
  const stages = state.stageProjects.map(hydrateStageProject)
  const pendingCount = stages.filter(p => !p.taskCompleted && p.taskStart <= currentDay && p.taskEnd >= currentDay).length
  const dueCount = stages.filter(p => !p.taskCompleted && p.taskEnd >= currentDay && p.taskEnd <= addStageDays(currentDay, 7)).length
  const todayCount = state.projects.filter(p => (state.checkins[p.id] ?? []).includes(currentDay)).length

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

  const updateNotDoingItem = (index: number, value: string) => update((current) => ({
    ...current,
    notDoingItems: current.notDoingItems.map((item, itemIndex) => itemIndex === index ? value.slice(0, 30) : item),
  }))

  const updateProgressTotal = (value: number) => update((current) => {
    const progressTotal = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
    return { ...current, progressTotal, progressCurrent: Math.min(current.progressCurrent, progressTotal) }
  })

  const updateProgressCurrent = (value: number) => update((current) => ({
    ...current,
    progressCurrent: Number.isFinite(value) ? Math.min(current.progressTotal, Math.max(0, Math.round(value))) : 0,
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
  const lastSyncLabel = suiteSync.lastSyncedAt
    ? Date.now() - suiteSync.lastSyncedAt < 60_000
      ? '刚刚'
      : `${Math.max(1, Math.floor((Date.now() - suiteSync.lastSyncedAt) / 60_000))} 分钟前`
    : ''
  const syncSummary = desktopLocalOnly
    ? '仅保存在当前电脑'
    : !online ? '离线 · 修改已保存在本机，联网后同步'
    : suiteSync.status === 'synced'
    ? `数据已同步${lastSyncLabel ? ` · ${lastSyncLabel}` : ''}`
    : suiteSync.status === 'syncing'
      ? '有修改待上传 · 正在同步'
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

  const addStageProject = (draft: StageProjectDraft) => update((current) => ({
    ...current,
    stageProjects: [...current.stageProjects, { ...draft, id: makeId(), createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }],
  }))
  const updateStageProject = (id: string, draft: StageProjectDraft) => update((current) => ({
    ...current,
    preferences: current.stageProjects.find(p => p.id === id) ? withStageEvent(current, current.stageProjects.find(p => p.id === id)!, { ...current.stageProjects.find(p => p.id === id)!, ...draft }) : current.preferences ?? {},
    stageProjects: current.stageProjects.map((project) => project.id === id
      ? { ...project, ...draft, modifiedAt: new Date().toISOString() }
      : project),
  }))
  const setStageProjectStage = (id: string, stageIndex: number) => update((current) => current.stageProjects.find(p => p.id === id)?.stageIndex === stageIndex ? current : ({
    ...current,
    preferences: current.stageProjects.find(p => p.id === id) ? withStageEvent(current, current.stageProjects.find(p => p.id === id)!, { ...current.stageProjects.find(p => p.id === id)!, stageIndex, taskCompleted: false }) : current.preferences ?? {},
    stageProjects: current.stageProjects.map((project) => project.id === id
      ? { ...project, stageIndex, taskCompleted: false, modifiedAt: new Date().toISOString() }
      : project),
  }))
  const deleteStageProject = (id: string) => update((current) => ({ ...current, stageProjects: current.stageProjects.filter((project) => project.id !== id) }))
  const renameStageBoard = (stageBoardTitle: string) => update((current) => ({ ...current, stageBoardTitle }))
  const renameStageLabels = (stageLabels: string[]) => update((current) => ({ ...current, stageLabels }))
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
        saveRecovery(state, '导入前')
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
          <ShortcutBar onOpenIntegratedTool={openIntegratedTool} links={readShortcuts(state.shortcutConfig)} />
          <button className="icon-button" aria-label={actualTheme === 'dark' ? '切换白天模式' : '切换夜晚模式'} onClick={toggleTheme}>
            {actualTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-button" aria-label={searchOpen ? '关闭搜索' : '搜索项目'} onClick={() => setSearchOpen((value) => !value)}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>
          <button className="new-project-button" aria-label="新项目" onClick={() => setDialogOpen(true)}><Plus size={16} /><span>新项目</span></button>
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
          <GoalProgress current={state.progressCurrent} total={state.progressTotal} />
          <CollapsibleSection id="random" title="今日随机">
            <DailyRandomPanel categories={state.randomCategories} candidates={state.randomCategories.map(category => ({ ...category, items: eligibleRandomItems(category, state.dailyRandomResults, todayKey, Number(state.preferences?.randomAvoidDays ?? 7)) }))} results={state.dailyRandomResults[todayKey] ?? {}} onResult={saveRandomResult} />
          </CollapsibleSection>
          <nav className="today-summary" aria-label="今日摘要">
            <button onClick={() => showCheckins('all')}>今日打卡 {todayCount}</button>
            <button onClick={() => showCheckins('unchecked')}>未打卡 {state.projects.filter(p => !p.archived && !(state.checkins[p.id] ?? []).includes(todayKey)).length}</button>
            <button onClick={() => showStages('active')}>待推进 {pendingCount}</button>
            <button onClick={() => showStages('dueSoon')}>7天内到期 {dueCount}</button>
          </nav>
          <CollapsibleSection id="not-doing" title="不为清单"><NotDoingList items={state.notDoingItems} onChange={updateNotDoingItem} /></CollapsibleSection>

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
            <p className="period-meta" role="status"><span className="sync-dot" data-pending={suiteSync.status === 'syncing' || !online} />{syncSummary}{conflictCount > 0 && <button onClick={() => { const panel = document.getElementById('recovery-panel') as HTMLDetailsElement; if (panel) { panel.open = true; panel.scrollIntoView?.({ behavior: 'smooth' }) } }}> · {conflictCount} 项冲突待确认</button>}</p>
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

        <div id="checkin-projects" className="project-filter" aria-label="打卡筛选">{([['all', '全部'], ['unchecked', '今天未打卡'], ['archived', '已隐藏']] as const).map(([value, label]) => <button key={value} aria-pressed={projectFilter === value} onClick={() => setProjectFilter(value)}>{label}</button>)}</div>
        <ProjectGrid view={state.view} anchor={anchor} today={today} projects={visibleProjects} checkins={state.checkins} onToggle={toggleCheckin} onRename={renameProject} onMove={moveProject} onDelete={deleteProject} pinnedIds={state.projects.filter(p => state.preferences?.[`pin:${p.id}`]).map(p => p.id)} onPin={id => setPreference(`pin:${id}`, !state.preferences?.[`pin:${id}`])} onArchive={id => update(current => ({ ...current, projects: current.projects.map(p => p.id === id ? { ...p, archived: !p.archived } : p) }))} onReorder={(from, to) => update(current => { const projects = [...current.projects]; const item = projects.find(p => p.id === from); if (!item) return current; const rest = projects.filter(p => p.id !== from); rest.splice(rest.findIndex(p => p.id === to), 0, item); return { ...current, projects: rest } })} />
        <CollapsibleSection id="stages" title="阶段与排期">
        <ProjectStageBoard
          filterRequest={stageFilterRequest}
          title={state.stageBoardTitle}
          labels={state.stageLabels}
          projects={state.stageProjects}
          onTitleChange={renameStageBoard}
          onLabelsChange={renameStageLabels}
          onCreate={addStageProject}
          onUpdate={updateStageProject}
          onDelete={deleteStageProject}
          onStageChange={setStageProjectStage}
        />
        </CollapsibleSection>
        {!visibleProjects.length && (
          <div className="empty-state">
            <div className="empty-mark">日</div>
            <h2>{state.projects.length ? '当前筛选下没有项目' : '从第一个项目开始'}</h2>
            <p>{state.projects.length ? '可切换“全部”或“已隐藏”查看。' : '建立项目，然后每天轻点一下。'}</p>
            {!state.projects.length && <button className="primary-button" onClick={() => setDialogOpen(true)}><Plus size={16} />添加项目</button>}
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
          <RecoveryPanel state={state} onRestore={next => update(() => next)} />
          {!desktopLocalOnly && <InstallPanel />}
          <details className="enhancement-settings"><summary>随机规则与阶段历史</summary>
            <label>避免重复 <select aria-label="随机避免重复" value={Number(state.preferences?.randomAvoidDays ?? 7)} onChange={e => setPreference('randomAvoidDays', Number(e.target.value))}><option value={0}>仅当天一次</option><option value={7}>最近七天尽量不重复</option></select></label>
            <p>候选全部用过时重新随机；每日每类仍只可抽取一次。</p>
            <h3>阶段历史</h3><p>从本次更新开始记录进入阶段、任务完结及重新开启的时间，记录随同步码同步。</p>
            {readStageEvents(state).map((event, index) => <div className="recovery-row" key={`${event.at}-${index}`}>{event.name} · {event.label} · {event.action} · {new Date(event.at).toLocaleString('zh-CN')}</div>)}
          </details>
          <ShortcutSettings links={readShortcuts(state.shortcutConfig)} onChange={(links) => update((current) => ({ ...current, shortcutConfig: links.map((link) => JSON.stringify(link)) }))} />
          <GoalProgressSettings current={state.progressCurrent} total={state.progressTotal} onCurrentChange={updateProgressCurrent} onTotalChange={updateProgressTotal} />
          <RandomPromptManager categories={state.randomCategories} onAdd={addRandomItem} onRename={renameRandomItem} onDelete={deleteRandomItem} />
          <RandomHistory categories={state.randomCategories} history={state.dailyRandomResults} />
        </div>
        <CollapsibleSection id="activity" title="打卡活动"><CheckinActivityHeatmap checkins={state.checkins} today={today} /></CollapsibleSection>
        {!desktopLocalOnly ? <SuiteSyncPanel
          code={suiteSync.codeInput}
          connected={Boolean(suiteSync.connectedCode)}
          status={suiteSync.status}
            message={suiteSync.message}
            lastSyncedAt={suiteSync.lastSyncedAt}
          onCodeChange={suiteSync.setCodeInput}
          onConnect={() => suiteSync.connect()}
          onCreate={suiteSync.createAndConnect}
          onDisconnect={suiteSync.disconnect}
        /> : null}
      </section>
        </>
      )}

      <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={createProject} />
      {undo && <div className="undo-toast" role="status"><span>已保存修改</span><button onClick={undoLastChange}>撤销</button><button aria-label="关闭撤销提示" onClick={() => setUndo(null)}>×</button></div>}
    </main>
  )
}
