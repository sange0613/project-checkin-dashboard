import { createInitialState } from '../domain/types'
import { createLocalCheckinRepository } from './localCheckinRepository'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  constructor(seed: Record<string, string> = {}) {
    Object.entries(seed).forEach(([key, value]) => this.values.set(key, value))
  }
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('round-trips application state', () => {
  const storage = new MemoryStorage()
  const repository = createLocalCheckinRepository(storage)
  const state = createInitialState()
  state.title = '年度计划'
  repository.save(state)
  expect(repository.load()).toEqual(state)
})

test('keeps custom stage names after reload', () => {
  const storage = new MemoryStorage()
  const repository = createLocalCheckinRepository(storage)
  const state = createInitialState()
  state.stageLabels = [...state.stageLabels, '竣工摄影']

  repository.save(state)

  expect(repository.load().stageLabels).toEqual(state.stageLabels)
})

test('adds the construction stages to legacy saved data', () => {
  const storage = new MemoryStorage()
  const repository = createLocalCheckinRepository(storage)
  const state = createInitialState()
  state.stageLabels = state.stageLabels.slice(0, 15)

  repository.save(state)

  expect(repository.load().stageLabels.slice(-6)).toEqual(['土建阶段', '水电阶段', '瓦工阶段', '木工阶段', '油漆阶段', '软装阶段'])
})

test('backs up malformed data and returns initial state', () => {
  const storage = new MemoryStorage({ 'project-checkins': '{bad json' })
  const repository = createLocalCheckinRepository(storage)
  expect(repository.load()).toMatchObject({
    title: '项目进度',
    view: 'day',
    projects: [],
    checkins: {},
  })
  expect(storage.getItem('project-checkins:backup')).toBe('{bad json')
})
