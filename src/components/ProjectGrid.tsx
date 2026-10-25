import { ArrowDown, ArrowUp, Trash2, Pin, EyeOff, Eye } from 'lucide-react'
import { useState } from 'react'
import { getIntensity, getPeriodRatio } from '../domain/aggregation'
import { getMonthDays, getMonthPeriods, getWeekPeriods, toDateKey, type Period } from '../domain/dateRanges'
import type { Project, ViewMode } from '../domain/types'
import { EditableText } from './EditableText'

type Props = {
  view: ViewMode
  anchor: Date
  today: Date
  projects: Project[]
  checkins: Record<string, string[]>
  onToggle: (projectId: string, dateKey: string) => void
  onRename: (projectId: string, name: string) => void
  onMove: (projectId: string, direction: -1 | 1) => void
  onDelete: (projectId: string) => void
  pinnedIds?: string[]
  onPin?: (id: string) => void
  onArchive?: (id: string) => void
  onReorder?: (from: string, to: string) => void
}

const weekday = ['日', '一', '二', '三', '四', '五', '六']

function AggregateCell({ period, checked }: { period: Period; checked: Set<string> }) {
  const ratio = getPeriodRatio(period.dateKeys, checked, new Date())
  const intensity = getIntensity(ratio)
  return <div className="aggregate-cell" data-intensity={intensity} title={`${Math.round(ratio * 100)}%`} />
}

export function ProjectGrid({ view, anchor, today, projects, checkins, onToggle, onRename, onMove, onDelete, pinnedIds = [], onPin, onArchive, onReorder }: Props) {
  const [hovered, setHovered] = useState<{ projectId: string; dateKey: string } | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuProject = projects.find(project => project.id === menuId)
  const canMove = (index: number, direction: -1 | 1) => {
    const project = projects[index], neighbor = projects[index + direction]
    return Boolean(project && neighbor && pinnedIds.includes(project.id) === pinnedIds.includes(neighbor.id))
  }
  const days = getMonthDays(anchor)
  const periods = view === 'week' ? getWeekPeriods(today) : getMonthPeriods(today)
  const columns = view === 'day' ? days.length : periods.length
  const gridStyle = { '--time-columns': columns } as React.CSSProperties
  const todayKey = toDateKey(today)

  return (
    <>
    <div className={`grid-scroll grid-${view}`}>
      <div className="progress-grid" style={gridStyle}>
        <div className="grid-header project-spacer">项目</div>
        {view === 'day'
          ? days.map(({ date, key }) => (
              <div className={`grid-header day-header ${key === todayKey ? 'is-today' : ''} ${hovered?.dateKey === key ? 'hover-column' : ''}`} data-testid={`day-header-${key}`} key={key}>
                <span>{date.getDate()}</span>
                <small>周{weekday[date.getDay()]}</small>
              </div>
            ))
          : periods.map((period) => (
              <div className="grid-header period-header" data-testid="period-header" key={period.key}>
                <span>{period.label}</span>
                <small>{period.sublabel}</small>
              </div>
            ))}
        <div className="grid-header menu-spacer" />

        {projects.map((project, projectIndex) => {
          const checked = new Set(checkins[project.id] ?? [])
          const monthCount = days.filter(({ key }) => checked.has(key)).length
          return (
            <div className="project-row-contents" data-testid="project-row" key={project.id}>
              <div className={`project-name-cell ${hovered?.projectId === project.id ? 'hover-row' : ''}`} data-testid="project-name-cell" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = event.dataTransfer.getData('text/project-id'); if (projects.some(p => p.id === from) && from !== project.id) onReorder?.(from, project.id) }}>
                <i className="project-dot" draggable={Boolean(onReorder)} title="拖动排序，也可使用上移下移按钮" onDragStart={event => event.dataTransfer.setData('text/project-id', project.id)} />
                {view === 'day' && <span className="month-count" aria-label={`${project.name}本月打卡`}>{monthCount}/{days.length}</span>}
                <span data-testid="project-name" className="project-name-wrap">
                  <EditableText value={project.name} ariaLabel={`${project.name}名称`} onSave={(name) => onRename(project.id, name)} className="project-name" />
                </span>
              </div>
              {view === 'day'
                ? days.map(({ date, key }) => {
                    const future = key > todayKey
                    const selected = checked.has(key)
                    return (
                      <button
                        key={key}
                        className={`checkin-cell ${selected ? 'checked' : ''} ${key === todayKey ? 'today' : ''} ${hovered?.projectId === project.id ? 'hover-row' : ''} ${hovered?.dateKey === key ? 'hover-column' : ''} ${hovered?.projectId === project.id && hovered.dateKey === key ? 'hover-current' : ''}`}
                        aria-label={`${project.name} ${date.getMonth() + 1}月${date.getDate()}日`}
                        aria-pressed={selected}
                        disabled={future}
                        onMouseEnter={() => setHovered({ projectId: project.id, dateKey: key })}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered({ projectId: project.id, dateKey: key })}
                        onBlur={() => setHovered(null)}
                        onClick={() => onToggle(project.id, key)}
                      />
                    )
                  })
                : periods.map((period) => <AggregateCell key={period.key} period={period} checked={checked} />)}
              <div className="project-actions">
                <span className="lifetime-count" aria-label={`${project.name}累计打卡`}>{checked.size}</span>
                <button className="project-mobile-actions" aria-label={`操作 ${project.name}`} aria-expanded={menuId === project.id} onClick={() => setMenuId(project.id)}>···</button>
                {onPin && <button aria-label={`${pinnedIds.includes(project.id) ? '取消置顶' : '置顶'} ${project.name}`} aria-pressed={pinnedIds.includes(project.id)} onClick={() => onPin(project.id)}><Pin size={14} /></button>}
                {onArchive && <button aria-label={`${project.archived ? '恢复显示' : '隐藏'} ${project.name}`} onClick={() => onArchive(project.id)}>{project.archived ? <Eye size={14} /> : <EyeOff size={14} />}</button>}
                <button aria-label={`上移 ${project.name}`} disabled={!canMove(projectIndex, -1)} onClick={() => onMove(project.id, -1)}><ArrowUp size={14} /></button>
                <button aria-label={`下移 ${project.name}`} disabled={!canMove(projectIndex, 1)} onClick={() => onMove(project.id, 1)}><ArrowDown size={14} /></button>
                <button className="danger" aria-label={`删除 ${project.name}`} onClick={() => window.confirm(`删除“${project.name}”及全部打卡记录？`) && onDelete(project.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
    {menuProject && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setMenuId(null)}>
      <section className="dialog project-mobile-dialog" role="dialog" aria-modal="true" aria-label={`项目操作 ${menuProject.name}`} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setMenuId(null) }}>
        <header><strong>{menuProject.name}</strong><button autoFocus className="icon-button" aria-label="关闭项目操作" onClick={() => setMenuId(null)}>×</button></header>
        {onPin && <button onClick={() => { onPin(menuProject.id); setMenuId(null) }}>{pinnedIds.includes(menuProject.id) ? '取消置顶' : '置顶'} {menuProject.name}</button>}
        {onArchive && <button onClick={() => { onArchive(menuProject.id); setMenuId(null) }}>{menuProject.archived ? '恢复显示' : '隐藏'} {menuProject.name}</button>}
        <button disabled={!canMove(projects.indexOf(menuProject), -1)} onClick={() => { onMove(menuProject.id, -1); setMenuId(null) }}>上移 {menuProject.name}</button>
        <button disabled={!canMove(projects.indexOf(menuProject), 1)} onClick={() => { onMove(menuProject.id, 1); setMenuId(null) }}>下移 {menuProject.name}</button>
        <button className="danger" onClick={() => { if (window.confirm(`删除“${menuProject.name}”及全部打卡记录？`)) { onDelete(menuProject.id); setMenuId(null) } }}>删除 {menuProject.name}</button>
      </section>
    </div>}
    </>
  )
}
