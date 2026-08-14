import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { PROJECT_STAGES } from '../domain/projectStages'
import type { StageProject } from '../domain/types'
import { EditableText } from './EditableText'

type BoardProps = {
  title: string
  labels: string[]
  projects: StageProject[]
  onTitleChange: (title: string) => void
  onLabelChange: (index: number, label: string) => void
  onStageChange: (id: string, stageIndex: number) => void
}

export function ProjectStageBoard({ title, labels, projects, onTitleChange, onLabelChange, onStageChange }: BoardProps) {
  const [mobileDetailed, setMobileDetailed] = useState(false)

  return (
    <section className="stage-board-section">
      <div className="stage-section-heading">
        <EditableText value={title} ariaLabel="进度视图标题" onSave={onTitleChange} className="stage-board-title" />
        <span>{projects.length} 个项目</span>
      </div>
      <div className="stage-mobile-overview">
        {projects.map((project) => {
          const stage = PROJECT_STAGES[project.stageIndex] ?? PROJECT_STAGES[0]
          return (
            <button type="button" key={project.id} className="stage-mobile-project" onClick={() => setMobileDetailed(true)}>
              <span className="stage-mobile-copy"><strong>{project.name}</strong><small>{labels[project.stageIndex] ?? stage.name}</small></span>
              <span className="stage-mobile-progress"><i style={{ width: `${stage.percent}%` }} /></span>
              <b>{stage.percent}%</b>
            </button>
          )
        })}
        {!projects.length ? <p>还没有进度项目</p> : null}
        {projects.length ? (
          <button type="button" className="stage-detail-toggle" onClick={() => setMobileDetailed((value) => !value)}>
            {mobileDetailed ? '收起详细阶段' : '展开详细阶段'}
          </button>
        ) : null}
      </div>
      <div className="stage-scroll" data-mobile-expanded={mobileDetailed || undefined}>
        <div className="stage-grid">
          <div className="stage-project-header">项目</div>
          <div className="stage-axis-header">
            {PROJECT_STAGES.map((stage, index) => (
              <span key={stage.name} title={stage.name}>
                <EditableText value={labels[index]} ariaLabel={`阶段简称${index + 1}`} onSave={(label) => onLabelChange(index, label)} className="stage-label" />
              </span>
            ))}
          </div>
          <div className="stage-percent-header">进度</div>
          {projects.map((project) => {
            const lineWidth = (project.stageIndex / PROJECT_STAGES.length) * 100
            return (
              <div className="stage-row" key={project.id}>
                <div className="stage-project-name"><span>{project.name}</span></div>
                <div className="stage-track">
                  <i className="stage-line" style={{ width: `${lineWidth}%` }} />
                  {PROJECT_STAGES.map((stage, index) => (
                    <button key={stage.name} aria-label={`${project.name} ${stage.name}`} title={stage.name} onClick={() => onStageChange(project.id, index)} />
                  ))}
                </div>
                <div className="stage-row-end"><strong>{PROJECT_STAGES[project.stageIndex].percent}%</strong></div>
              </div>
            )
          })}
          {!projects.length && <div className="stage-empty">在最下方添加进度项目</div>}
        </div>
      </div>
    </section>
  )
}

type ManagerProps = {
  projects: StageProject[]
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function StageProjectManager({ projects, onAdd, onRename, onDelete }: ManagerProps) {
  const [name, setName] = useState('')
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const add = () => {
    const next = name.trim()
    if (!next) return
    onAdd(next)
    setName('')
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details ref={detailsRef} className="bottom-panel">
      <summary>管理进度项目</summary>
      <div className="stage-add">
        <input aria-label="阶段项目名称" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="新增项目" />
        <button onClick={add} disabled={!name.trim()}><Plus size={13} />添加</button>
      </div>
      <div className="stage-manage-list">
        {projects.map((project) => (
          <div key={project.id}>
            <EditableText value={project.name} ariaLabel={`${project.name}阶段项目名称`} onSave={(value) => onRename(project.id, value)} />
            <button aria-label={`删除阶段项目 ${project.name}`} onClick={() => onDelete(project.id)}><Trash2 size={13} /></button>
          </div>
        ))}
        {!projects.length && <p>还没有项目</p>}
      </div>
    </details>
  )
}
