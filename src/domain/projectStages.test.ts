import { PROJECT_STAGES, createStageProject, ganttDateWindow, stageDayDiff } from './projectStages'

test('defines the fixed fifteen stages and percentages', () => {
  expect(PROJECT_STAGES).toHaveLength(15)
  expect(PROJECT_STAGES.map((stage) => stage.percent)).toEqual([10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 96, 100])
  expect(PROJECT_STAGES.at(-1)?.name).toBe('设计跟踪服务完结')
})

test('creates projects at the first stage', () => {
  const project = createStageProject('住宅设计', 'stage-1')
  expect(project.name).toBe('住宅设计')
  expect(project.stageIndex).toBe(0)
})
test('long-running projects and tasks outside the design range still include today', () => {
  const window = ganttDateWindow([{ designStart: '2018-01-01', designEnd: '2018-12-31', taskStart: '2026-10-26', taskEnd: '2027-01-01' }], '2026-10-26')
  expect(window.start <= '2026-10-26').toBe(true)
  expect(window.end >= '2027-01-01').toBe(true)
  expect(stageDayDiff(window.start, window.end)).toBeLessThan(730)
})
