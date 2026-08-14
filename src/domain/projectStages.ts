import type { StageProject, StageProjectDraft } from './types'

export const PROJECT_STAGES = [
  { name: '第一次沟通', shortName: '初次沟通', percent: 10 },
  { name: '交付设计定金', shortName: '设计定金', percent: 20 },
  { name: '现场量尺', shortName: '现场量尺', percent: 30 },
  { name: '平面方案设计', shortName: '平面方案', percent: 40 },
  { name: '第一次方案沟通', shortName: '一次方案', percent: 50 },
  { name: 'SU建模方案设计中', shortName: 'SU建模', percent: 60 },
  { name: '第二次方案沟通', shortName: '二次方案', percent: 65 },
  { name: '效果图制作中', shortName: '效果图制作', percent: 70 },
  { name: '效果图沟通', shortName: '效果图沟通', percent: 75 },
  { name: '施工图纸制作中', shortName: '施工图制作', percent: 80 },
  { name: '对接施工图纸', shortName: '图纸对接', percent: 85 },
  { name: '软装搭配PPT制作中', shortName: '软装搭配', percent: 90 },
  { name: '软装PPT交付', shortName: '软装交付', percent: 95 },
  { name: '现场施工中', shortName: '现场施工', percent: 96 },
  { name: '设计跟踪服务完结', shortName: '服务完结', percent: 100 },
] as const

export function createStageProject(name: string, id: string): StageProject {
  const now = new Date()
  const today = toStageDate(now)
  return {
    id,
    name,
    stageIndex: 0,
    createdAt: now.toISOString(),
    client: '',
    location: '',
    designStart: today,
    designEnd: addStageDays(today, 90),
    taskStart: today,
    taskEnd: addStageDays(today, 7),
    note: '',
    modifiedAt: now.toISOString(),
  }
}

export function toStageDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addStageDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toStageDate(date)
}

export function stageDayDiff(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000)
}

export function hydrateStageProject(project: StageProject): StageProject & Required<Omit<StageProject, 'id' | 'name' | 'stageIndex' | 'createdAt'>> {
  const createdDate = /^\d{4}-\d{2}-\d{2}/.exec(project.createdAt)?.[0] ?? toStageDate(new Date())
  const designStart = project.designStart || createdDate
  const taskStart = project.taskStart || designStart
  return {
    ...project,
    client: project.client ?? '',
    location: project.location ?? '',
    designStart,
    designEnd: project.designEnd || addStageDays(designStart, 90),
    taskStart,
    taskEnd: project.taskEnd || addStageDays(taskStart, 7),
    note: project.note ?? '',
    modifiedAt: project.modifiedAt || project.createdAt,
  }
}

export function createStageProjectDraft(project?: StageProject): StageProjectDraft {
  if (project) {
    const hydrated = hydrateStageProject(project)
    return {
      name: hydrated.name,
      client: hydrated.client,
      location: hydrated.location,
      stageIndex: hydrated.stageIndex,
      designStart: hydrated.designStart,
      designEnd: hydrated.designEnd,
      taskStart: hydrated.taskStart,
      taskEnd: hydrated.taskEnd,
      note: hydrated.note,
    }
  }
  const today = toStageDate(new Date())
  return { name: '', client: '', location: '', stageIndex: 0, designStart: today, designEnd: addStageDays(today, 90), taskStart: today, taskEnd: addStageDays(today, 7), note: '' }
}
