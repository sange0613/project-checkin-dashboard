import { useEffect } from 'react'
import { mergeTodoSync, normalizeTodoSync, TODO_SYNC_KEY } from '../sync/todoSync'

export function useTodoBridge(revision: number, message: string) {
  useEffect(() => {
    const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="待办看板"]')
    const read = () => { try { return normalizeTodoSync(JSON.parse(localStorage.getItem(TODO_SYNC_KEY) ?? 'null')) } catch { return normalizeTodoSync(undefined) } }
    const send = () => frame()?.contentWindow?.postMessage({ type: 'liubai-suite:state', value: read(), message }, 'https://sange0613.github.io')
    const receive = (event: MessageEvent) => {
      if (event.source !== frame()?.contentWindow || event.origin !== 'https://sange0613.github.io' || !['liubai-suite:ready', 'liubai-suite:change'].includes(event.data?.type)) return
      const previous = localStorage.getItem(TODO_SYNC_KEY)
      const merged = JSON.stringify(mergeTodoSync(read(), event.data.value))
      if (previous !== merged) {
        localStorage.setItem(TODO_SYNC_KEY, merged)
        window.dispatchEvent(new StorageEvent('storage', { key: TODO_SYNC_KEY, oldValue: previous, newValue: merged }))
      }
      send()
    }
    window.addEventListener('message', receive)
    window.addEventListener('storage', send)
    send()
    return () => { window.removeEventListener('message', receive); window.removeEventListener('storage', send) }
  }, [revision, message])
}
