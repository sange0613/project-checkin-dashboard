import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { AppState } from '../domain/types'

export function useSuiteSync(_state: AppState, _setState: Dispatch<SetStateAction<AppState>>) {
  const [toolDataRevision, setToolDataRevision] = useState(0)
  useEffect(() => {
    const restored = () => setToolDataRevision(revision => revision + 1)
    window.addEventListener('suite-tools-restored', restored)
    return () => window.removeEventListener('suite-tools-restored', restored)
  }, [])
  return {
    codeInput: '',
    setCodeInput: (_value: string) => undefined,
    connectedCode: '',
    status: 'local' as const,
    message: '仅保存在当前电脑',
    connect: (_code?: string) => undefined,
    createAndConnect: () => undefined,
    disconnect: () => undefined,
    toolDataRevision,
    lastSyncedAt: undefined,
  }
}
