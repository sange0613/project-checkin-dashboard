import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, Circle, Dumbbell, Flower2, X } from 'lucide-react'
import { getMonthDays, getWeekPeriods, toDateKey, type DateItem } from '../domain/dateRanges'
import type { Project } from '../domain/types'
import { HabitStats } from './HabitStats'
import './habitBoard.css'

const THEME_KEY = 'project-habit-board-theme'

type Props = {
  projects: Project[]
  checkins: Record<string, string[]>
  today: Date
  onToggle: (projectId: string, date: string) => void
}

function HabitIcon({ name }: { name: string }) {
  const Icon = /健身|运动|俯卧撑|深蹲|走路/.test(name) ? Dumbbell : /阅读|读书/.test(name) ? BookOpen : /冥想/.test(name) ? Flower2 : Circle
  return <Icon size={17} aria-hidden="true" />
}

function MonthDots({ days, checked, selected, onSelect }: {
  days: DateItem[]
  checked: Set<string>
  selected: string
  onSelect?: (date: string) => void
}) {
  const offset = (days[0].date.getDay() + 6) % 7
  return <div className="habit-dots" aria-label={onSelect ? '月度日期' : undefined} aria-hidden={onSelect ? undefined : true}>
    {Array.from({ length: offset }, (_, index) => <span key={index} />)}
    {days.map(({ date, key }) => {
      const dot = <i data-done={checked.has(key)} data-selected={key === selected} />
      return onSelect
        ? <button key={key} type="button" aria-pressed={key === selected} aria-label={`${key}，${checked.has(key) ? '已打卡' : '未打卡'}`} onClick={() => onSelect(key)}>{dot}<span>{date.getDate()}</span></button>
        : <span key={key}>{dot}</span>
    })}
  </div>
}

export function HabitBoard({ projects, checkins, today, onToggle }: Props) {
  const todayKey = toDateKey(today)
  const [dateKey, setDateKey] = useState<string>()
  const selected = dateKey ?? todayKey
  const selectedDate = new Date(`${selected}T12:00:00`)
  const [theme, setTheme] = useState<'lavender' | 'mono'>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'lavender' ? 'lavender' : 'mono' }
    catch { return 'mono' }
  })
  const [projectId, setProjectId] = useState<string>()
  const [statsOpen, setStatsOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const project = projects.find(item => item.id === projectId)
  const detailOpen = Boolean(project)
  const days = getMonthDays(selectedDate)
  const week = getWeekPeriods(today).at(-1)!.dateKeys
  const completed = projects.filter(item => checkins[item.id]?.includes(todayKey)).length
  const detailDates = new Set(project ? checkins[project.id] : [])

  useEffect(() => {
    if (detailOpen && dialog.current && !dialog.current.open) dialog.current.showModal()
    else if (!detailOpen && dialog.current?.open) dialog.current.close()
  }, [detailOpen])

  function moveMonth(delta: number) {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth() + delta
    const last = new Date(year, month + 1, 0).getDate()
    setDateKey(toDateKey(new Date(year, month, Math.min(selectedDate.getDate(), last))))
  }

  function changeTheme(value: typeof theme) {
    setTheme(value)
    try { localStorage.setItem(THEME_KEY, value) } catch { /* Keep the choice for this visit. */ }
  }

  function checkButton(item: Project, dates: Set<string>) {
    const done = dates.has(selected)
    return <button type="button" className="habit-action" data-done={done} disabled={selected > todayKey} aria-pressed={done}
      aria-label={`${item.name} ${selected} ${done ? '取消打卡' : '打卡'}`} onClick={() => onToggle(item.id, selected)}>
      {done && <Check size={14} aria-hidden="true" />}{selected > todayKey ? '未到日期' : done ? '已打卡' : '打卡'}
    </button>
  }

  return <section id="habit-board" className="habit-board" data-habit-theme={theme} aria-label="习惯看板">
    <header className="habit-heading">
      <h2>{statsOpen ? '打卡统计' : '习惯看板'}</h2>
      <div className="habit-heading-actions">
        <button type="button" className="habit-overview" onClick={() => setStatsOpen(open => !open)}>{statsOpen ? '返回看板' : '总览'}</button>
        <div className="habit-themes" role="group" aria-label="看板主题">
          <button type="button" aria-pressed={theme === 'lavender'} onClick={() => changeTheme('lavender')}>浅紫</button>
          <button type="button" aria-pressed={theme === 'mono'} onClick={() => changeTheme('mono')}>黑白</button>
        </div>
      </div>
    </header>
    {statsOpen ? <HabitStats projects={projects} checkins={checkins} today={today} /> : <>
    <div className="habit-summary">
      <div className="habit-progress"><strong>今日进度</strong><span>{completed}/{projects.length}</span><progress aria-label="今日进度" value={completed} max={Math.max(1, projects.length)} /></div>
      <div className="habit-week" role="group" aria-label="本周日期">
        {week.map((key, index) => <button type="button" key={key} aria-label={key} aria-current={key === todayKey ? 'date' : undefined} aria-pressed={key === selected} onClick={() => setDateKey(key === todayKey ? undefined : key)}><small>{'一二三四五六日'[index]}</small><span>{Number(key.slice(-2))}</span></button>)}
      </div>
    </div>
    <div className="habit-month">
      <button type="button" aria-label="看板上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
      <span>{selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日</span>
      <button type="button" aria-label="看板下个月" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
      {selected !== todayKey && <button type="button" onClick={() => setDateKey(undefined)}>今天</button>}
    </div>
    <div className="habit-cards">
      {projects.map(item => {
        const dates = new Set(checkins[item.id])
        return <article className="habit-card" key={item.id}>
          <button type="button" className="habit-name" aria-label={`查看 ${item.name} 的打卡详情`} onClick={event => { trigger.current = event.currentTarget; setProjectId(item.id) }}>
            <span className="habit-icon"><HabitIcon name={item.name} /></span><strong>{item.name}</strong>
          </button>
          <MonthDots days={days} checked={dates} selected={selected} />
          {checkButton(item, dates)}
        </article>
      })}
    </div>
    {!projects.length && <p className="habit-empty">添加项目后，习惯会显示在这里。</p>}
    </>}
    <dialog ref={dialog} className="habit-detail" aria-label="习惯详情" onClose={() => { setProjectId(undefined); trigger.current?.focus() }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
    }}>
      {project && <>
        <header><h3>{project.name}</h3><button type="button" aria-label="关闭习惯详情" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
        <div className="habit-month">
          <button type="button" aria-label="详情上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
          <span>{selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月</span>
          <button type="button" aria-label="详情下个月" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
        </div>
        <MonthDots days={days} checked={detailDates} selected={selected} onSelect={setDateKey} />
        <p>本月 {days.filter(day => detailDates.has(day.key)).length}/{days.length} 天 · 累计 {detailDates.size} 天</p>
        <p>{selected}</p>
        {checkButton(project, detailDates)}
      </>}
    </dialog>
  </section>
}
