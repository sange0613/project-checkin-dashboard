import { act, renderHook } from '@testing-library/react'
import { useTodoBridge } from './useTodoBridge'
import { normalizeTodoSync, TODO_SYNC_KEY } from '../sync/todoSync'

test('only accepts todo updates from its own iframe and trusted origin', () => {
  localStorage.clear()
  const frame = document.createElement('iframe')
  frame.title = '待办看板'
  document.body.append(frame)
  const sent = vi.spyOn(frame.contentWindow!, 'postMessage')
  const { unmount } = renderHook(() => useTodoBridge(0, '已同步'))
  const initialMessages = sent.mock.calls.length
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'calorie-tracker-v1' })))
  expect(sent).toHaveBeenCalledTimes(initialMessages)
  const value = normalizeTodoSync({ boards: [{ id: 'b', name: '看板', columns: [{ id: 'todo', label: '待办' }], tasks: [] }], activeBoardId: 'b' })
  const deliver = (origin: string, source: Window) => act(() => window.dispatchEvent(new MessageEvent('message', { origin, source, data: { type: 'liubai-suite:change', value } })))
  deliver('https://other.example', frame.contentWindow!)
  expect(localStorage.getItem(TODO_SYNC_KEY)).toBeNull()
  deliver('https://sange0613.github.io', window)
  expect(localStorage.getItem(TODO_SYNC_KEY)).toBeNull()
  deliver('https://sange0613.github.io', frame.contentWindow!)
  expect(JSON.parse(localStorage.getItem(TODO_SYNC_KEY)!).fields).toEqual(value.fields)
  unmount(); sent.mockRestore(); frame.remove()
})
