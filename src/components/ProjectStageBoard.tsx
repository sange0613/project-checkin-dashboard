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
  ganttDateWindow,
} from '../domain/projectStages'
import { DEFAULT_STAGE_LABELS, type StageProject, type StageProjectDraft } from '../domain/types'
import { projectDisplay, displayPercent, displayLabel, readBinding, linkKey, listProgress, flowlineUrl } from '../domain/flowline'
import type { FlowBinding, FlowState, StageDisplay } from '../domain/flowline'
import type { SyncSettingValue } from '../domain/types'
import { EditableText } from './EditableText'

type Props = {
  flowline?: FlowState
  preferences?: Record<string, SyncSettingValue>
  onLink?: (id: string, binding: FlowBinding | null) => void
  filterRequest?: { filter: 'active' | 'dueSoon'; at: number }
  title: string
  labels: string[]
  projects: StageProject[]
  onTitleChange: (title: string) => void
  onLabelsChange: (labels: string[]) => void
  onCreate: (draft: StageProjectDraft, binding?: FlowBinding | null) => void
  onUpdate: (id: string, draft: StageProjectDraft) => void
  onDelete: (id: string) => void
  onStageChange: (id: string, stageIndex: number) => void
}

type Filter = 'all' | 'active' | 'dueSoon' | 'complete'
type Sort = 'updated' | 'progress' | 'designStart' | 'taskEnd'
type SortDirection = 'asc' | 'desc'

function isPendingProject(project: StageDisplay, today: string) {
  if(project.flowline)return !project.taskCompleted
  return !project.taskCompleted && project.taskStart <= today && project.taskEnd >= today
}

function shortDate(value: string) {
  if(!value||!Number.isFinite(Date.parse(value)))return '待排期'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(`${value}T00:00:00`))
}

function dateRange(start: string, end: string) {
  const length = Math.max(1, Math.min(730, stageDayDiff(start, end) + 1))
  return Array.from({ length }, (_, index) => addStageDays(start, index))
}

function ProjectGantt({ projects, labels }: { projects: StageDisplay[]; labels: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hydratedProjects = useMemo(() => projects.map(p=>({...hydrateStageProject(p),...p})), [projects])
  const today = toStageDate(new Date())
  const chart = useMemo(() => {
    if (!hydratedProjects.length) return null
    const { start, end } = ganttDateWindow(hydratedProjects, today)
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
  const acrossYears = chart.start.slice(0, 4) !== chart.end.slice(0, 4)
  const locateToday = () => {
    if (!scrollRef.current || todayIndex < 0) return
    scrollRef.current.scrollTo({ left: todayScrollLeft(), behavior: 'smooth' })
  }

  return (
    <section className="stage-gantt-section" aria-label="项目排期">
      <div className="stage-gantt-heading">
        <div><h3>项目排期</h3><p>浅色为设计周期，深色为当前任务；填色为实际进度</p></div>
        <div><span>{acrossYears ? chart.start.replaceAll('-', '/') : shortDate(chart.start)} — {acrossYears ? chart.end.replaceAll('-', '/') : shortDate(chart.end)}</span><button type="button" onClick={locateToday}><CalendarDays size={14} />定位今天</button></div>
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
            const designStart = project.designStart < chart.start ? chart.start : project.designStart
            const designEnd = project.designEnd > chart.end ? chart.end : project.designEnd
            const taskStart = project.taskStart < chart.start ? chart.start : project.taskStart
            const taskEnd = project.taskEnd > chart.end ? chart.end : project.taskEnd
            const designLeft = labelWidth + stageDayDiff(chart.start, designStart) * dayWidth
            const designWidth = Math.max(0, (stageDayDiff(designStart, designEnd) + 1) * dayWidth)
            const taskLeft = labelWidth + stageDayDiff(chart.start, taskStart) * dayWidth
            const taskWidth = taskStart&&taskEnd?Math.max(0, (stageDayDiff(taskStart, taskEnd) + 1) * dayWidth):0
            return (
              <div className="stage-gantt-row" key={project.id}>
                <div className="stage-gantt-project" style={{ width: labelWidth }}><i /><span><strong>{project.name}</strong><small>{displayLabel(project,labels)}{project.flowline&&!project.flowline.scheduled?' · 待排期':''}</small></span></div>
                {project.flowline?.available&&[project.flowline.actualStartedAt,project.flowline.actualCompletedAt].map((date,index)=>{if(!date||!Number.isFinite(Date.parse(date)))return null;const day=toStageDate(new Date(date)),position=chart.days.indexOf(day);return position>=0?<i key={index} className="stage-actual-mark" data-finished={index===1||undefined} title={`${index?'实际完成':'首次记录进展'} ${day}`} style={{left:labelWidth+position*dayWidth+dayWidth/2}}/>:null})}
                <div className="stage-gantt-grid" style={{ left: labelWidth, width: chartWidth, backgroundSize: `${dayWidth}px 100%` }} />
                {designWidth > 0 && <div className="stage-design-bar" title={`设计周期 ${project.designStart} 至 ${project.designEnd}`} style={{ left: designLeft, width: designWidth }}>{project.flowline?.available&&<i className="stage-design-fill" style={{width: `${project.flowline.percent}%`}} />}</div>}
                {taskWidth > 0 && <div className="stage-task-bar" data-completed={project.taskCompleted || undefined} title={`当前任务 ${project.taskStart} 至 ${project.taskEnd}${project.taskCompleted ? '（已完结）' : ''}`} style={{ left: taskLeft, width: taskWidth }}>{project.flowline?.available&&<i className="stage-task-fill" style={{width:`${project.flowline.nodePercent}%`}}/>}</div>}
                <div className="stage-gantt-label" style={{left:labelWidth,width:chartWidth}}><span style={{left:labelWidth+8}} title={displayLabel(project,labels)}>{displayLabel(project,labels)}{project.flowline&&!project.flowline.scheduled?' · 待排期':project.taskCompleted?' · 已完结':''}</span></div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StageRail({ project, labels, onChange }: { project: StageDisplay; labels: string[]; onChange: (stageIndex: number) => void }) {
  if(project.flowline){labels=project.flowline.labels;project={...project,stageIndex:project.flowline.index}}
  return (
    <>
    <select className="stage-touch-select" disabled={Boolean(project.flowline)} aria-label={`${project.name}触控选择阶段`} value={project.stageIndex} onClick={e => e.stopPropagation()} onChange={e => onChange(Number(e.target.value))}>{labels.map((label, index) => <option key={index} value={index}>{label}</option>)}</select>
    <div className="stage-portfolio-rail" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} data-completed={project.taskCompleted || undefined} aria-label={`${project.name} 当前阶段：${labels[project.stageIndex]}${project.taskCompleted ? '，当前任务已完结' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
      <span />
      {labels.map((label, index) => (
        <button
          type="button"
          key={`${index}-${label}`}
          disabled={Boolean(project.flowline)}
          className={project.flowline?(project.flowline.doneIndices.includes(index)?'done':index===project.stageIndex?'current':''):index < project.stageIndex ? 'done' : index === project.stageIndex ? 'current' : ''}
          aria-label={project.flowline?`${labels[index]}${project.flowline.doneIndices.includes(index)?'，已完成':index===project.stageIndex?'，当前阶段':'，未完成'}`:`将 ${project.name} 设为${labels[index]}`}
          title={`${index + 1}. ${labels[index]}`}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(index) }}
        >
          {index === project.stageIndex ? <i>{index + 1}</i> : null}
        </button>
      ))}
    </div>
    </>
  )
}

function ProjectEditor({ project, labels, onClose, onSave, onDelete, flowline, binding }: { project?: StageProject; labels: string[]; onClose: () => void; onSave: (draft: StageProjectDraft, binding: FlowBinding | null) => void; onDelete?: () => void; flowline: FlowState; binding: FlowBinding | null }) {
  const [draft, setDraft] = useState(() => createStageProjectDraft(project))
  const update = <K extends keyof StageProjectDraft>(key: K, value: StageProjectDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const [link,setLink]=useState<FlowBinding|null>(binding)
  const selectedSource=flowline.data.projects.find(p=>p.id===link?.projectId)
  const selectedFlow=selectedSource?.flows.find(f=>f.id===link?.flowId)
  const following=link?.mode==='follow'
  const linkedInfo=selectedFlow?listProgress(selectedFlow):null
  const datesValid = draft.designStart <= draft.designEnd && (following || draft.taskStart <= draft.taskEnd)
  const canSave = Boolean(draft.name.trim()) && datesValid && (!following||Boolean(link?.projectId&&link?.flowId))
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
          <fieldset className="flowline-link-editor"><legend>阶段来源</legend><label><span>进度模式</span><select aria-label="阶段进度来源" value={following?'follow':'manual'} onChange={e=>setLink(e.target.value==='follow'?{projectId:link?.projectId||'',flowId:link?.flowId||'',mode:'follow'}:link?{...link,mode:'manual'}:null)}><option value="manual">手动维护阶段</option><option value="follow">跟随流程管理</option></select></label>{following&&<><p>{flowline.status}</p><label><span>对应流程项目</span><select aria-label="关联流程项目" value={link?.projectId||''} onChange={e=>setLink({projectId:e.target.value,flowId:'',mode:'follow'})}><option value="">选择项目</option>{link?.projectId&&!selectedSource&&<option value={link.projectId}>已关联项目（等待同步）</option>}{flowline.data.projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label><span>设计阶段清单</span><select aria-label="关联设计清单" value={link?.flowId||''} onChange={e=>setLink({projectId:link?.projectId||'',flowId:e.target.value,mode:'follow'})}><option value="">选择负责设计阶段的清单</option>{link?.flowId&&!selectedFlow&&<option value={link.flowId}>已关联清单（等待同步）</option>}{selectedSource?.flows.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label><p>只跟随所选清单；主材、装修准备等其他清单独立计算。关联与同步码一起保存，改名后仍能继续跟随。</p>{linkedInfo&&<p>当前：{linkedInfo.allDone?'已完成':linkedInfo.current?.title||'尚未添加节点'} · {linkedInfo.percent}%<br/>下一项：{linkedInfo.task?.text||((linkedInfo.next&&'title'in linkedInfo.next)?linkedInfo.next.title:'—')}</p>}</>}</fieldset>
          {!following&&<><label><span>当前阶段</span><div className="stage-select-wrap"><select value={draft.stageIndex} onChange={(event) => update('stageIndex', Number(event.target.value))}>{labels.map((label, index) => <option key={`${index}-${label}`} value={index}>{index + 1}. {label}</option>)}</select><ChevronDown size={16} /></div></label>
          <div className="stage-editor-progress" data-completed={draft.taskCompleted || undefined}><div><strong>{percent}%</strong><span>{labels[draft.stageIndex]}</span></div><div><i style={{ width: `${percent}%` }} /></div></div>
          <fieldset><legend>当前任务周期</legend><label><span>开始日期</span><input type="date" value={draft.taskStart} onChange={(event) => update('taskStart', event.target.value)} /></label><label><span>结束日期</span><input type="date" min={draft.taskStart} value={draft.taskEnd} onChange={(event) => update('taskEnd', event.target.value)} /></label></fieldset>
          <button type="button" className="stage-task-complete-toggle" data-active={draft.taskCompleted || undefined} aria-pressed={draft.taskCompleted} onClick={() => update('taskCompleted', !draft.taskCompleted)}><Check size={15} />{draft.taskCompleted ? '当前任务已完结' : '标记当前任务完结'}</button></>}
          {following&&<div className="flowline-plan-hint"><p>当前阶段和任务日期来自流程节点，未填写时显示“待排期”。原有手动排期保留，切回手动即可使用。</p>{link?.projectId&&link?.flowId&&<a href={flowlineUrl(link,linkedInfo?.current?.id)} target="_blank" rel="noopener noreferrer">打开流程并安排阶段日期 ↗</a>}</div>}
          {!datesValid ? <p className="stage-date-error">结束日期不能早于开始日期</p> : null}
          <label><span>备注</span><textarea rows={5} value={draft.note} onChange={(event) => update('note', event.target.value.slice(0, 200))} placeholder="记录下一步或待确认事项" /><small>{draft.note.length}/200</small></label>
        </div>
        <footer><button type="button" className="primary-button" disabled={!canSave} onClick={() => onSave({ ...draft, name: draft.name.trim() }, link)}><Check size={16} />保存</button>{onDelete ? <button type="button" className="stage-delete-button" onClick={onDelete}><Trash2 size={15} />删除项目</button> : null}</footer>
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

const emptyFlowline:FlowState={data:{projects:[]},ready:false,status:'连接同一同步码后可关联流程项目',at:0,cached:false}
export function ProjectStageBoard({ title, labels, projects, onTitleChange, onLabelsChange, onCreate, onUpdate, onDelete, onStageChange, filterRequest, flowline=emptyFlowline, preferences={}, onLink }: Props) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [stageEditorOpen, setStageEditorOpen] = useState(false)
  useEffect(() => { if (filterRequest) { setFilter(filterRequest.filter); setQuery(''); setSort('taskEnd'); setSortDirection('asc') } }, [filterRequest])
  const projectListRef = useRef<HTMLDivElement>(null)
  const hydratedProjects = useMemo(() => projects.map(p=>projectDisplay(p,readBinding(preferences[linkKey(p.id)]),flowline)), [projects,preferences,flowline])
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
        if (sort === 'progress') return ((displayPercent(left)??-1) - (displayPercent(right)??-1)) * direction
        if (sort === 'designStart') return left.designStart.localeCompare(right.designStart) * direction
        if (sort === 'taskEnd') return left.taskEnd.localeCompare(right.taskEnd) * direction
        return (new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime()) * direction
      })
  }, [deferredQuery, filter, hydratedProjects, sort, sortDirection, today, weekEnd])
  const active = hydratedProjects.filter((project) => isPendingProject(project, today)).length
  const complete = hydratedProjects.filter((project) => project.taskCompleted).length
  const dueSoon = hydratedProjects.filter((project) => !project.taskCompleted && project.taskEnd >= today && project.taskEnd <= weekEnd).length
  const percentages=hydratedProjects.map(displayPercent).filter((v):v is number=>v!==null)
  const average=percentages.length?Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length):0
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
        <div><EditableText value={title} ariaLabel="进度视图标题" onSave={onTitleChange} className="stage-portfolio-title" /><p>保留计划排期 · 实际阶段可跟随流程管理</p></div>
        <button type="button" className="primary-button" onClick={() => setEditingId('new')}><Plus size={15} />新建项目</button>
      </div>

      {onLink&&<p className="flowline-reader-status">{flowline.status}{flowline.at?` · ${new Date(flowline.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:''}{flowline.cached?' · 上次记录':''}<span>在项目编辑中选择“跟随流程管理”</span></p>}
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
        {(!hydratedProjects.length||hydratedProjects.some(p=>!p.flowline))?<button type="button" onClick={() => setStageEditorOpen(true)}><Pencil size={12} />编辑阶段</button>:<small>阶段随流程清单自动更新</small>}
      </div>
      {(!hydratedProjects.length||hydratedProjects.some(p=>!p.flowline))&&<div className="stage-legend" aria-label="阶段图例">{labels.map((label, index) => <span key={`${index}-${label}`}><i>{index + 1}</i>{label}</span>)}</div>}

      <div className="stage-project-table" aria-label="阶段项目列表" ref={projectListRef}>
        <div className="stage-project-head"><span>项目</span><button type="button" onClick={() => selectSort('designStart')}>设计周期<ArrowDownUp size={11} /></button><button type="button" onClick={() => selectSort('progress')}>当前阶段<ArrowDownUp size={11} /></button><span>当前任务</span><span>阶段进度</span><span>进度</span><span /></div>
        {visibleProjects.map((project) => {
          const percent = displayPercent(project)
          return (
            <article className="stage-project-row" data-due={!project.taskCompleted && project.taskEnd >= today && project.taskEnd <= weekEnd || undefined} key={project.id} onClick={() => setEditingId(project.id)}>
              <div className="stage-project-name"><strong>{project.name}</strong>{project.flowline&&<a href={project.flowline.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} aria-label={`打开 ${project.name} 对应流程`}>查看流程 ↗</a>}<span>{[project.client, project.location].filter(Boolean).join(' / ') || '未填写客户与地点'}</span></div>
              <div className="stage-design-period"><span>{shortDate(project.designStart)}</span><i /><span>{shortDate(project.designEnd)}</span></div>
              <div className="stage-current-stage"><i>{(project.flowline?.index??project.stageIndex) + 1}</i><span>{displayLabel(project,labels)}{project.flowline&&<small>自动联动{project.flowline.projectName?' · '+project.flowline.projectName:''}</small>}</span></div>
              <time>{project.flowline&&!project.flowline.scheduled?'待排期':<>{shortDate(project.taskStart)} — {shortDate(project.taskEnd)}</>}{project.flowline?.next&&<small>下一项：{project.flowline.next}</small>}{project.flowline?.message&&<small>{project.flowline.message}</small>}{!project.flowline&&isPendingProject(project, today)?<small>今天待推进</small>:null}</time>
              <StageRail project={project} labels={labels} onChange={(index) => onStageChange(project.id, index)} />
              <strong className="stage-percent">{percent===null?'—':percent+'%'}{project.flowline?.available&&<small>{project.flowline.completed}/{project.flowline.total}</small>}</strong>
              <button type="button" className="stage-edit-button" aria-label={`编辑阶段项目 ${project.name}`} onClick={(event) => { event.stopPropagation(); setEditingId(project.id) }}><Pencil size={14} /></button>
            </article>
          )
        })}
        {!visibleProjects.length ? <div className="stage-project-empty"><p>{projects.length ? (filter === 'dueSoon' ? '7天内没有到期项目' : filter === 'active' ? '没有待推进项目' : '没有匹配的项目') : '还没有设计项目'}</p>{projects.length ? <button type="button" onClick={() => { setQuery(''); setFilter('active') }}>查看待推进项目</button> : <button type="button" onClick={() => setEditingId('new')}>添加第一个项目</button>}</div> : null}
      </div>

      {editingId ? <ProjectEditor key={editingId} project={editingProject} flowline={flowline} binding={editingProject?readBinding(preferences[linkKey(editingProject.id)]):null} labels={labels} onClose={() => setEditingId(null)} onSave={(draft,binding) => { if(editingProject){onUpdate(editingProject.id,draft);onLink?.(editingProject.id,binding)}else if(binding)onCreate(draft,binding);else onCreate(draft);setEditingId(null) }} onDelete={editingProject ? () => { if (window.confirm(`删除“${editingProject.name}”？`)) { onDelete(editingProject.id); setEditingId(null) } } : undefined} /> : null}
      {stageEditorOpen ? <StageNameEditor labels={labels} onClose={() => setStageEditorOpen(false)} onSave={(nextLabels) => { onLabelsChange(nextLabels); setStageEditorOpen(false) }} /> : null}
    </section>
  )
}
