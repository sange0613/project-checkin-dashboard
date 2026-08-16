import type { Dispatch, SetStateAction } from 'react'
import type { AppState } from '../domain/types'

export function useSuiteSync(_state: AppState, _setState: Dispatch<SetStateAction<AppState>>) {
  return {
    codeInput: '',
    setCodeInput: (_value: string) => undefined,
    connectedCode: '',
    status: 'local' as const,
    message: '仅保存在当前电脑',
    connect: (_code?: string) => undefined,
    createAndConnect: () => undefined,
    disconnect: () => undefined,
    toolDataRevision: 0,
    lastSyncedAt: undefined,
  }
}
