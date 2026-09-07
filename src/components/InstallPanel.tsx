import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function InstallPanel() {
  const [prompt, setPrompt] = useState<InstallPrompt>()
  const [ready, setReady] = useState(false)
  const [waiting, setWaiting] = useState<ServiceWorker>()
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt) }
    window.addEventListener('beforeinstallprompt', install)
    let disposed = false
    let registration: ServiceWorkerRegistration | undefined
    const check = () => { if (!disposed) setWaiting(registration?.waiting ?? undefined) }
    if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_DESKTOP_LOCAL_ONLY !== 'true') {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(reg => {
        if (disposed) return
        registration = reg
        check()
        reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', check))
        navigator.serviceWorker.ready.then(() => { if (!disposed) setReady(true) })
      }).catch(() => { if (!disposed) setReady(false) })
    }
    return () => { disposed = true; window.removeEventListener('beforeinstallprompt', install) }
  }, [])
  return <details className="enhancement-settings"><summary>安装与离线</summary>
    <p>{ready ? '本页已缓存，可离线打开、打卡和编辑；联网后使用原同步码继续同步。' : '正式网址首次联网打开后会准备离线缓存；本地开发预览不启用缓存。'}</p>
    <p>iPhone / iPad：Safari 分享 → 添加到主屏幕。饮、清、物等外部工具的离线能力由各自网页提供。</p>
    {prompt && <button onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(undefined) }}>安装到设备</button>}
    {waiting && <button onClick={() => {
      if (!window.confirm('更新页面前请结束正在输入的内容。刷新以使用新版本？')) return
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
      waiting.postMessage('activate-update')
    }}>新版本已就绪，刷新更新</button>}
  </details>
}
