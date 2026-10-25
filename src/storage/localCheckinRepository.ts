import { createInitialState, type AppState } from '../domain/types'
import { importState } from './dataTransfer'
import type { CheckinRepository } from './checkinRepository'

const STORAGE_KEY = 'project-checkins'
const BACKUP_KEY = `${STORAGE_KEY}:backup`

type PersistedEnvelope = {
  version: 1
  state: AppState
}

export function createLocalCheckinRepository(storage: Storage): CheckinRepository {
  let unreadableOriginal: string | undefined
  return {
    load() {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) return createInitialState()
      try {
        const envelope = JSON.parse(raw) as PersistedEnvelope
        if (envelope.version !== 1 || !envelope.state) throw new Error('Unsupported data')
        return importState(raw)
      } catch {
        try { storage.setItem(BACKUP_KEY, raw) } catch { unreadableOriginal = raw }
        return createInitialState()
      }
    },
    save(state) {
      if (unreadableOriginal !== undefined) {
        storage.setItem(BACKUP_KEY, unreadableOriginal)
        unreadableOriginal = undefined
      }
      const envelope: PersistedEnvelope = { version: 1, state }
      storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    },
  }
}
