import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, CalendarDays, Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import {
  PROJECT_STAGES,
  addStageDays,
  createStageProjectDraft,
  hydrateStageProject,
  stagePercent,
  stageDayDiff,
  toStageDate,
} from '../domain/projectStages'
import { DEFAULT_STAGE_LABELS, type StageProject, type StageProjectDraft } from '../domain/types'
import { EditableText } from './EditableText'

type Props = {
  title: string
  labels: string[]
  projects: StageProject[]
  onTitleChange: (title: string) => void
  onLabelsChange: (labels: string[]) => void
  onCreate: (draft: StageProjectDraft) => void
  onUpdate: (id: string, draft: StageProjectDraft) => void
  onDelete: (id: string) => void
  onStageChange: (id: string, stageIndex: number) => void
}

type Filter = 'all' | 'active' | 'dueSoon' | 'complete'
type Sort = 'updated' | 'progress' | 'designStart' | 'taskEnd'
type SortDirection = 'asc' | 'desc'

function isPendingProject(project: ReturnType<typeof hydrateStageProject>, today: string) {
  return !project.taskCompleted && project.taskStart <= today && project.taskEnd >= today
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(`${value}T00:00:00`))
}

function dateRange(start: string, end: string) {
  const length = Math.max(1, Math.min(730, stageDayDiff(start, end) + 1))
  return Array.from({ length }, (_, index) => addStageDays(start, index))
}

function ProjectGantt({ projects, labels }: { projects: StageProject[]; labels: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hydratedProjects = useMemo(() => projects.map(hydrateStageProject), [projects])
  const today = toStageDate(new Date())
  const chart = useMemo(() => {
    if (!hydratedProjects.length) return null
    const starts = [today, ...hydratedProjects.map((project) => project.designStart)].sort()
    const ends = [today, ...hydratedProjects.map((project) => project.designEnd)].sort()
    const start = starts[0]
    const end = ends.at(-1) ?? start
    return { start, end, days: dateRange(start, end) }
  }, [hydratedProjects, today])

  const dayWidth = 24
  const labelWidth = 168
  const todayIndex = chart?.days.indexOf(today) ?? -1
  const todayScrollLeft = () => Math.max(0, labelWidth + todayIndex * dayWidth - (scrollRef.current?.clientWidth ?? 0) / 2)

  useEffect(() => {
    if (!scrollRef.current || todayIndex < 0) return
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ left: todayScrollLeft() }))
    return () => cancelAnimationFrame(frame)
  }, [todayIndex, chart?.start, chart?.end])

  if (!chart) return <div className="stage-gantt-empty">添加项目后显示排期甘特图</div>
  const chartWidth = chart.days.length * dayWidth
  const locateToday = () => {
    if (!scrollRef.current || todayIndex < 0) return
    scrollRef.current.scrollTo({ left: todayScrollLeft(), behavior: 'smooth' })
  }

  return (
    <section className="stage-gantt-section" aria-label="项目排期">
      <div className="stage-gantt-heading">
        <div><h3>项目排期</h3><p>浅色为设计周期，深色为当前任务</p></div>
        <div><span>{shortDate(chart.start)} — {shortDate(chart.end)}</span><button type="button" onClick={locateToday}><CalendarDays size={14} />定位今天</button></div>
      </div>
      <div className="stage-gantt-scroll" ref={scrollRef}>
        <div className="stage-gantt" style={{ width: labelWidth + chartWidth }}>
          <div className="stage-gantt-dates" style={{ paddingLeft: labelWidth }}>
            {chart.days.map((date) => {
              const value = new Date(`${date}T00:00:00`)
              const isMonth = value.getDate() === 1 || date === chart.start
              return <span key={date} data-weekend={value.getDay() === 0 || value.getDay() === 6 || undefined} data-today={date === today || undefined} title={date} style={{ width: dayWidth }}>{isMonth ? `${value.getMonth() + 1}月` : value.getDate()}</span>
            })}
          </div>
          {todayIndex >= 0 ? <i className="stage-gantt-today" style={{ left: labelWidth + todayIndex * dayWidth + dayWidth / 2 }} /> : null}
          {hydratedProjects.map((project) => {
            const designLeft = labelWidth + stageDayDiff(chart.start, project.designStart) * dayWidth
            const designWidth = Math.max(dayWidth, (stageDayDiff(project.designStart, project.designEnd) + 1) * dayWidth)
            const taskLeft = labelWidth + stageDayDiff(chart.start, project.taskStart) * dayWidth
            const taskWidth = Math.max(dayWidth, (stageDayDiff(project.taskStart, project.taskEnd) + 1) * dayWidth)
            return (
              <div className="stage-gantt-row" key={project.id}>
                <div className="stage-gantt-project" style={{ width: labelWidth }}><i /><span><strong>{project.name}</strong><small>{labels[project.stageIndex]}</small></span></div>
                <div className="stage-gantt-grid" style={{ left: labelWidth, width: chartWidth, backgroundSize: `${dayWidth}px 100%` }} />
                <div className="stage-design-bar" title={`设计周期 ${project.designStart} 至 ${project.designEnd}`} style={{ left: designLeft, width: designWidth }} />
                <div className="stage-task-bar" data-completed={project.taskCompleted || undefined} title={`当前任务 ${project.taskStart} 至 ${project.taskEnd}${project.taskCompleted ? '（已完结）' : ''}`} style={{ left: taskLeft, width: taskWidth }}><span>{labels[project.stageIndex]}{project.taskCompleted ? ' · 已完结' : ''}</span></div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StageRail({ project, labels, onChange }: { project: StageProject; labels: string[]; onChange: (stageIndex: number) => void }) {
  return (
    <div className="stage-portfolio-rail" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} data-completed={project.taskCompleted || undefined} aria-label={`${project.name} 当前阶段：${labels[project.stageIndex]}${project.taskCompleted ? '，当前任务已完结' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
      <span />
      {labels.map((label, index) => (
        <button
          type="button"
          key={`${index}-${label}`}
          className={index < project.stageIndex ? 'done' : index === project.stageIndex ? 'current' : ''}
          aria-label={`将 ${project.name} 设为${labels[index]}`}
          title={`${index + 1}. ${labels[index]}`}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(index) }}
        >
          {index === project.stageIndex ? <i>{index + 1}</i> : null}
        </button>
      ))}
    </div>
  )
}

function ProjectEditor({ project, labels, onClose, onSave, onDelete }: { project?: StageProject; labels: string[]; onClose: () => void; onSave: (draft: StageProjectDraft) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState(() => createStageProjectDraft(project))
  const update = <K extends keyof StageProjectDraft>(key: K, value: StageProjectDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const datesValid = draft.designStart <= draft.designEnd && draft.taskStart <= draft.taskEnd
  const canSave = Boolean(draft.name.trim()) && datesValid
  const percent = stagePercent(draft.stageIndex)

  return (
    <div className="stage-drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="stage-editor" role="dialog" aria-modal="true" aria-label={project ? '编辑阶段项目' : '新建阶段项目'}>
        <header><div><h2>{project ? '编辑项目' : '新建项目'}</h2><p>{project?.name || '录入一个新的设计项目'}</p></div><button type="button" aria-label="关闭阶段项目编辑" onClick={onClose}><X size={19} /></button></header>
        <div className="stage-editor-form">
          <label><span>项目名称</span><input autoFocus value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="例如：云栖住宅" /></label>
          <div className="stage-field-pair">
            <label><span>客户</span><input value={draft.client} onChange={(event) => update('client', event.target.value)} placeholder="客户称呼" /></label>
            <label><span>地点</span><input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="城市 / 区域" /></label>
          </div>
          <fieldset><legend>设计周期</legend><label><span>开始日期</span><input type="date" value={draft.designStart} onChange={(event) => update('designStart', event.target.value)} /></label><label><span>结束日期</span><input type="date" min={draft.designStart} value={draft.designEnd} onChange={(event) => update('designEnd', event.target.value)} /></label></fieldset>
          <label><span>当前阶段</span><div className="stage-select-wrap"><select value={draft.stageIndex} onChange={(event) => update('stageIndex', Number(event.target.value))}>{labels.map((label, index) => <option key={`${index}-${label}`} value={index}>{index + 1}. {label}</option>)}</select><ChevronDown size={16} /></div></label>
          <div className="stage-editor-progress" data-completed={draft.taskCompleted || undefined}><div><strong>{percent}%</strong><span>{labels[draft.stageIndex]}</span></div><div><i style={{ width: `${percent}%` }} /></div></div>
          <fieldset><legend>当前任务周期</legend><label><span>开始日期</span><input type="date" value={draft.taskStart} onChange={(event) => update('taskStart', event.target.value)} /></label><label><span>结束日期</span><input type="date" min={draft.taskStart} value={draft.taskEnd} onChange={(event) => update('taskEnd', event.target.value)} /></label></fieldset>
          <button type="button" className="stage-task-complete-toggle" data-active={draft.taskCompleted || undefined} aria-pressed={draft.taskCompleted} onClick={() => update('taskCompleted', !draft.taskCompleted)}><Check size={15} />{draft.taskCompleted ? '当前任务已完结' : '标记当前任务完结'}</button>
          {!datesValid ? <p className="stage-date-error">结束日期不能早于开始日期</p> : null}
          <label><span>备注</span><textarea rows={5} value={draft.note} onChange={(event) => update('note', event.target.value.slice(0, 200))} placeholder="记录下一步或待确认事项" /><small>{draft.note.length}/200</small></label>
        </div>
        <footer><button type="button" className="primary-button" disabled={!canSave} onClick={() => onSave({ ...draft, name: draft.name.trim() })}><Check size={16} />保存</button>{onDelete ? <button type="button" className="stage-delete-button" onClick={onDelete}><Trash2 size={15} />删除项目</button> : null}</footer>
      </aside>
    </div>
  )
}

function StageNameEditor({ labels, onClose, onSave }: { labels: string[]; onClose: () => void; onSave: (labels: string[]) => void }) {
  const [draft, setDraft] = useState(labels)
  const valid = draft.every((label) => label.trim())
  return (
    <div className="stage-drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="stage-editor stage-name-editor" role="dialog" aria-modal="true" aria-label="编辑阶段名称">
        <header><div><h2>编辑阶段</h2><p>修改后应用到全部项目</p></div><button type="button" aria-label="关闭阶段名称编辑" onClick={onClose}><X size={19} /></button></header>
        <div className="stage-name-editor-list">
          {draft.map((label, index) => <label key={index}><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`阶段 ${index + 1}`} value={label} onChange={(event) => setDraft((current) => current.map((item, currentIndex) => currentIndex === index ? event.target.value.slice(0, 16) : item))} /><small>{stagePercent(index)}%</small></label>)}
          {draft.length < 30 ? <button type="button" className="stage-name-add" onClick={() => setDraft((current) => [...current, `新阶段 ${current.length + 1}`])}><Plus size={14} />添加阶段名称</button> : null}
        </div>
        <footer><button type="button" className="primary-button" disabled={!valid} onClick={() => onSave(draft.map((label) => label.trim()))}><Check size={16} />保存阶段名称</button><button type="button" className="ghost-button" onClick={() => setDraft((current) => current.map((label, index) => DEFAULT_STAGE_LABELS[index] ?? PROJECT_STAGES[index]?.shortName ?? label))}>恢复默认名称</button></footer>
      </aside>
    </div>
  )
}

export function ProjectStageBoard({ title, labels, projects, onTitleChange, onLabelsChange, onCreate, onUpdate, onDelete, onStageChange }: Props) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  const projectListRef = useRef<HTMLDivElement>(null)
  const hydratedProjects = useMemo(() => projects.map(hydrateStageProject), [projects])
  const today = toStageDate(new Date())
  const weekEnd = addStageDays(today, 7)
  const visibleProjects = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase()
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...hydratedProjects]
      .filter((project) => {
        if (filter === 'all') return true
        if (filter === 'complete') return project.taskCompleted
        if (filter === 'dueSoon') return !project.taskCompleted && project.taskEnd >= today && project.taskEnd <= weekEnd
        return isPendingProject(project, today)
      })
      .filter((project) => !needle || `${project.name} ${project.client} ${project.location}`.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === 'progress') return (left.stageIndex - right.stageIndex) * direction
        if (sort === 'designStart') return left.designStart.localeCompare(right.designStart) * direction
        if (sort === 'taskEnd') return left.taskEnd.localeCompare(right.taskEnd) * direction
        return (new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime()) * direction
      })
  }, [deferredQuery, filter, hydratedProjects, sort, sortDirection, today, weekEnd])
  const active = hydratedProjects.filter((project) => isPendingProject(project, today)).length
  const complete = hydratedProjects.filter((project) => project.taskCompleted).length
  const dueSoon = hydratedProjects.filter((project) => !project.taskCompleted && project.taskEnd >= today && project.taskEnd <= weekEnd).length
  const average = hydratedProjects.length ? Math.round(hydratedProjects.reduce((sum, project) => sum + stagePercent(project.stageIndex), 0) / hydratedProjects.length) : 0
  const editingProject = editingId && editingId !== 'new' ? projects.find((project) => project.id === editingId) : undefined
  const selectSort = (next: Sort, defaultDirection: SortDirection = 'asc') => {
    if (sort === next) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSort(next); setSortDirection(defaultDirection) }
  }
  const showDueSoon = () => {
    setQuery('')
    setFilter('dueSoon')
    setSort('taskEnd')
    setSortDirection('asc')
    requestAnimationFrame(() => projectListRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <section className="stage-portfolio-section" aria-label="设计项目管理">
      <div className="stage-portfolio-heading">
        <div><EditableText value={title} ariaLabel="进度视图标题" onSave={onTitleChange} className="stage-portfolio-title" /><p>项目阶段、排期与当前任务</p></div>
        <button type="button" className="primary-button" onClick={() => setEditingId('new')}><Plus size={15} />新建项目</button>
      </div>

      <div className="stage-portfolio-tools">
        <label><Search size={15} /><input aria-label="搜索阶段项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、客户或地点" /></label>
        <div className="stage-select-wrap"><select aria-label="筛选阶段项目" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="active">待推进</option><option value="dueSoon">7天内到期</option><option value="all">全部项目</option><option value="complete">已完成</option></select><ChevronDown size={14} /></div>
        <button type="button" className="ghost-button" onClick={() => selectSort(sort === 'updated' ? 'progress' : 'updated', 'desc')}><ArrowDownUp size={14} />{sort === 'progress' ? '进度优先' : sort === 'taskEnd' ? '到期优先' : '最近更新'}</button>
      </div>

      <div className="stage-summary" aria-label="项目数据总览">
        <button type="button" data-active={filter === 'all' || undefined} onClick={() => setFilter('all')}><span>全部项目</span><strong>{hydratedProjects.length}</strong><small>所有项目</small></button>
        <button type="button" data-active={filter === 'active' || undefined} onClick={() => setFilter('active')}><span>待推进</span><strong>{active}</strong><small>任务期内未完结</small></button>
        <button type="button" data-active={filter === 'complete' || undefined} onClick={() => setFilter('complete')}><span>已完成</span><strong>{complete}</strong><small>任务已完结</small></button>
        <button type="button" data-active={filter === 'dueSoon' || undefined} onClick={showDueSoon}><span>7天内到期</span><strong>{dueSoon}</strong><small>点击定位</small></button>
        <div><span>平均进度</span><strong>{average}<i>%</i></strong><small>全部项目</small></div>
      </div>

      <ProjectGantt projects={visibleProjects} labels={labels} />

      <div className="stage-overview">
        <div><strong>{visibleProjects.length}</strong> 个项目 <span>·</span> {active} 个待推进 <span>·</span> {complete} 个已完成</div>
        <button type="button" onClick={() => setStageEditorOpen(true)}><Pencil size={12} />编辑阶段</button>
      </div>
      <div className="stage-legend" aria-label="阶段图例">{labels.map((label, index) => <span key={`${index}-${label}`}><i>{index + 1}</i>{label}</span>)}</div>

      <div className="stage-project-table" aria-label="阶段项目列表" ref={projectListRef}>
        <div className="stage-project-head"><span>项目</span><button type="button" onClick={() => selectSort('designStart')}>设计周期<ArrowDownUp size={11} /></button><button type="button" onClick={() => selectSort('progress')}>当前阶段<ArrowDownUp size={11} /></button><span>当前任务</span><span>阶段进度</span><span>进度</span><span /></div>
        {visibleProjects.map((project) => {
          const percent = stagePercent(project.stageIndex)
          return (
            <article className="stage-project-row" key={project.id} onClick={() => setEditingId(project.id)}>
              <div className="stage-project-name"><strong>{project.name}</strong><span>{[project.client, project.location].filter(Boolean).join(' / ') || '未填写客户与地点'}</span></div>
              <div className="stage-design-period"><span>{shortDate(project.designStart)}</span><i /><span>{shortDate(project.designEnd)}</span></div>
              <div className="stage-current-stage"><i>{project.stageIndex + 1}</i><span>{labels[project.stageIndex]}</span></div>
              <time>{shortDate(project.taskStart)} — {shortDate(project.taskEnd)}</time>
              <StageRail project={project} labels={labels} onChange={(index) => onStageChange(project.id, index)} />
              <strong className="stage-percent">{percent}%</strong>
              <button type="button" className="stage-edit-button" aria-label={`编辑阶段项目 ${project.name}`} onClick={(event) => { event.stopPropagation(); setEditingId(project.id) }}><Pencil size={14} /></button>
            </article>
          )
        })}
        {!visibleProjects.length ? <div className="stage-project-empty"><p>{projects.length ? (filter === 'dueSoon' ? '7天内没有到期项目' : filter === 'active' ? '没有待推进项目' : '没有匹配的项目') : '还没有设计项目'}</p>{projects.length ? <button type="button" onClick={() => { setQuery(''); setFilter('active') }}>查看待推进项目</button> : <button type="button" onClick={() => setEditingId('new')}>添加第一个项目</button>}</div> : null}
      </div>

      {editingId ? <ProjectEditor key={editingId} project={editingProject} labels={labels} onClose={() => setEditingId(null)} onSave={(draft) => { if (editingProject) onUpdate(editingProject.id, draft); else onCreate(draft); setEditingId(null) }} onDelete={editingProject ? () => { if (window.confirm(`删除“${editingProject.name}”？`)) { onDelete(editingProject.id); setEditingId(null) } } : undefined} /> : null}
      {stageEditorOpen ? <StageNameEditor labels={labels} onClose={() => setStageEditorOpen(false)} onSave={(nextLabels) => { onLabelsChange(nextLabels); setStageEditorOpen(false) }} /> : null}
    </section>
  )
}
