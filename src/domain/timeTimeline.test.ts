import { expect, test } from 'vitest'
import { splitInterval, snapMinute, nextOpenSlot } from '../../time-journal/model.mjs'

test('draws half-hour tiles while preserving exact legacy start and end minutes', () => {
  expect(splitInterval(547, 607)).toEqual([
    { start: 547, end: 570 }, { start: 570, end: 600 }, { start: 600, end: 607 },
  ])
  expect(splitInterval(1410, 1440)).toEqual([{ start: 1410, end: 1440 }])
})
test('snaps selection to half-hour boundaries and clamps both ends of the day', () => {
  expect(snapMinute).toBeTypeOf('function')
  expect([0, 14, 15, 29, 44, 45, 1439, 1500, -20].map(snapMinute)).toEqual([0, 0, 30, 30, 30, 60, 1440, 1440, 0])
})
test('new recordings default to one half-hour without extending a shorter free gap', () => {
  expect(nextOpenSlot([], 540)).toEqual({ start: 540, end: 570 })
  expect(nextOpenSlot([{ start: 0, end: 1425 }], 540)).toEqual({ start: 1425, end: 1440 })
})
