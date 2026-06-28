# Project Check-in Collection Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous, code-based Firebase cloud synchronization that transactionally merges all project-check-in records across devices, propagates deletions, supports offline local edits, and preserves current UI state.

**Architecture:** Keep render-oriented `AppState` separate from a canonical versioned `SyncState`. Local mutations are diffed into `SyncState` with entity stamps and tombstones; Firestore stores only the canonical sync state. Pure conversion and merge functions provide deterministic union/LWW behavior, while a React hook owns anonymous authentication, transactions, snapshots, status, and reconnection.

**Tech Stack:** React 19, TypeScript, Vitest, Firebase Authentication, Cloud Firestore modular SDK, Vite, Firebase CLI

---

### Task 1: Define The Canonical Sync Model And Pure Merge

**Files:**
- Create: `src/domain/cloudSync.ts`
- Create: `src/domain/cloudSync.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Write failing tests for collection union and IDs**

Create tests using this public API:

```ts
const left = createSyncStateFromAppState(deviceAState)
const right = createSyncStateFromAppState(deviceBState)
const merged = mergeSyncStates(left, right)
const visible = applySyncStateToAppState(deviceAState, merged)

expect(visible.projects.map(({ id }) => id)).toEqual(['a', 'b'])
```

Cover two unique projects, two same-name projects with different IDs, unique check-ins, prompt items, random results, and stage projects.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run src/domain/cloudSync.test.ts`

Expected: FAIL because `cloudSync.ts` does not exist.

- [ ] **Step 3: Add sync types**

Add exact types:

```ts
export type VersionStamp = { updatedAt: number; updatedBy: string }
export type Versioned<T> = T & VersionStamp
export type SyncEntityKind = 'projects' | 'checkins' | 'randomItems' | 'randomResults' | 'stageProjects'
export type SyncSettingValue = string | number | boolean | string[]

export type SyncState = {
  schemaVersion: 2
  projects: Versioned<{ id: string; name: string; createdAt: string; archived: boolean; order: number }>[]
  checkins: Versioned<{ id: string; projectId: string; dateKey: string }>[]
  randomItems: Versioned<{ id: string; categoryId: RandomCategory['id']; name: string; order: number }>[]
  randomResults: Versioned<{ id: string; dateKey: string; categoryId: RandomCategory['id']; itemId: string; name: string }>[]
  stageProjects: Versioned<StageProject>[]
  settings: Record<string, { value: SyncSettingValue } & VersionStamp>
  tombstones: Record<SyncEntityKind, Record<string, VersionStamp>>
}
```

- [ ] **Step 4: Implement deterministic normalization and merge**

Export:

```ts
export function normalizeSyncState(value: unknown): SyncState
export function createSyncStateFromAppState(state: AppState): SyncState
export function mergeSyncStates(left: SyncState, right: SyncState): SyncState
export function applySyncStateToAppState(current: AppState, sync: SyncState): AppState
export function syncStatesEqual(left: SyncState, right: SyncState): boolean
export function latestSyncTimestamp(sync: SyncState): number
```

Use `updatedAt`, then `updatedBy`, then canonical JSON as tie-breakers. Sort entity arrays by stable ID after merge; materialization sorts projects and prompts by `order` then ID. Preserve `current.view` and `current.anchorDate` in `applySyncStateToAppState`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- --run src/domain/cloudSync.test.ts`

Expected: all union and identity tests pass.

### Task 2: Add Tombstones, LWW Settings, Offline Recovery And Idempotence

**Files:**
- Modify: `src/domain/cloudSync.ts`
- Modify: `src/domain/cloudSync.test.ts`

- [ ] **Step 1: Write failing conflict and deletion tests**

Add tests asserting:

```ts
expect(mergeSyncStates(staleEntity, newerEntity).projects[0].name).toBe('新名称')
expect(materialize(mergeSyncStates(staleEntity, deletion)).projects).toHaveLength(0)
expect(mergeSyncStates(deletion, staleEntity)).toEqual(mergeSyncStates(staleEntity, deletion))
```

Also test a newer live entity than an older tombstone, per-setting LWW, offline-local plus remote-online union, commutativity, and repeated-merge idempotence.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/domain/cloudSync.test.ts`

Expected: FAIL on tombstone filtering, setting selection, or stable repeated merge.

- [ ] **Step 3: Implement tombstone and setting selection**

For every entity ID, merge the newest live version and newest tombstone, then keep the live entity only when:

```ts
compareVersion(live, tombstone) > 0
```

Merge every settings key independently. Required keys include `title`, `theme`, `stageBoardTitle`, `stageLabel:0..14`, and `categoryName:fitness|modeling|mind`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/domain/cloudSync.test.ts`

Expected: all merge, conflict, deletion, offline-recovery, commutativity, and idempotence tests pass.

### Task 3: Version Local Storage And Import/Export

**Files:**
- Modify: `src/storage/checkinRepository.ts`
- Modify: `src/storage/localCheckinRepository.ts`
- Modify: `src/storage/localCheckinRepository.test.ts`
- Modify: `src/storage/dataTransfer.ts`
- Modify: `src/storage/dataTransfer.test.ts`

- [ ] **Step 1: Write failing migration tests**

Define:

```ts
export type StoredCheckinDocument = {
  state: AppState
  sync: SyncState
}
```

Test that loading a version-1 envelope returns all original projects/check-ins/results plus deterministic sync IDs and baseline metadata, and loading it twice produces equal sync state.

- [ ] **Step 2: Write failing transfer tests**

Test that export version 2 contains `sync`, stamps, and tombstones; importing version 1 upgrades without record loss; importing version 2 preserves metadata. Confirm deviceId and sync code are absent.

- [ ] **Step 3: Run storage tests and verify RED**

Run: `npm test -- --run src/storage/localCheckinRepository.test.ts src/storage/dataTransfer.test.ts`

Expected: FAIL because repository and transfer functions still use `AppState` version 1.

- [ ] **Step 4: Implement version-2 repository migration**

```ts
type PersistedEnvelopeV2 = {
  version: 2
  document: StoredCheckinDocument
}
```

Read version 1 with `createSyncStateFromAppState`, then save version 2. Keep the existing raw backup behavior for invalid JSON.

- [ ] **Step 5: Implement version-2 import/export**

```ts
export function exportState(document: StoredCheckinDocument): string
export function importState(content: string): StoredCheckinDocument
```

Version-1 backups are upgraded; version-2 imports normalize sync data.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- --run src/storage/localCheckinRepository.test.ts src/storage/dataTransfer.test.ts`

Expected: all migration and transfer tests pass.

### Task 4: Stamp Every Local Mutation

**Files:**
- Modify: `src/domain/cloudSync.ts`
- Modify: `src/domain/cloudSync.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing mutation-diff tests**

Add:

```ts
const next = recordLocalMutation(document, changedState, { updatedAt: 100, updatedBy: 'device-a' })
expect(next.sync.projects.find(({ id }) => id === projectId)?.updatedAt).toBe(100)
expect(next.sync.tombstones.checkins[checkinId]).toEqual({ updatedAt: 100, updatedBy: 'device-a' })
```

Cover project add/edit/reorder/delete, check-in add/delete, prompt add/edit/delete, random result update, stage project add/edit/delete, title/theme/stage/category setting edits.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/domain/cloudSync.test.ts`

Expected: FAIL because `recordLocalMutation` is missing.

- [ ] **Step 3: Implement mutation diffing**

Export:

```ts
export function recordLocalMutation(
  current: StoredCheckinDocument,
  nextState: AppState,
  stamp: VersionStamp,
): StoredCheckinDocument
```

Flatten previous and next state into sync entities, stamp only changed/added entities, create tombstones for removed entities, and stamp changed setting keys. Assign array positions to entity `order`.

- [ ] **Step 4: Route App updates through the mutation recorder**

In `App.tsx`, store `StoredCheckinDocument`, derive `state = document.state`, and replace the local update helper with:

```ts
const update = (change: (current: AppState) => AppState) => {
  setDocument((current) => recordLocalMutation(current, change(current.state), nextStamp()))
}
```

Generate and persist deviceId at `project-checkins:device-id`; use a ref initialized from `latestSyncTimestamp` to create monotonic stamps. Repository saves the whole document.

- [ ] **Step 5: Run all application tests**

Run: `npm test -- --run`

Expected: existing UI behavior remains green and new stamping tests pass.

### Task 5: Add Firebase Transaction Client And React Hook

**Files:**
- Create: `src/cloud/firebaseConfig.ts`
- Create: `src/cloud/firestoreSync.ts`
- Create: `src/cloud/firestoreSync.test.ts`
- Create: `src/hooks/useProjectCloudSync.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Firebase**

Run: `npm install firebase`

Expected: `firebase` is added to dependencies and lockfile.

- [ ] **Step 2: Write failing transaction-adapter tests**

Use a tiny injected transaction adapter to verify that the client:

- Reads remote state before writing.
- Calls `mergeSyncStates(local, remote)`.
- Skips the write when merged content equals remote.
- Returns merged state.

Public boundary:

```ts
export async function mergeIntoCloud(
  adapter: SyncTransactionAdapter,
  code: string,
  local: SyncState,
): Promise<SyncState>
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- --run src/cloud/firestoreSync.test.ts`

Expected: FAIL because the transaction module does not exist.

- [ ] **Step 4: Implement Firebase configuration and transaction**

Use the existing project configuration:

```ts
export const firebaseConfig = {
  apiKey: 'AIzaSyDbLCcDs-Gk6ev2zSUT4cdYAgvpqUzSUEY',
  authDomain: 'daily-calorie-tracker-3ec47.firebaseapp.com',
  projectId: 'daily-calorie-tracker-3ec47',
  storageBucket: 'daily-calorie-tracker-3ec47.firebasestorage.app',
  messagingSenderId: '197589959166',
  appId: '1:197589959166:web:711ca2487ef48c9c42c0af',
}
```

Use `doc(db, 'projectCheckinSyncSpaces', code)`, `runTransaction`, `transaction.get`, and `transaction.set`. Keep transaction callbacks free of React state mutation because Firestore may retry them.

- [ ] **Step 5: Implement the cloud-sync hook**

Return:

```ts
type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'failed'

{
  codeInput,
  setCodeInput,
  status,
  createSyncCode,
  connectSync,
}
```

The hook must:

- Sign in with `signInAnonymously` via `onAuthStateChanged`.
- Persist the project-only code at `project-checkins:sync-code`.
- Debounce local changes by 700ms.
- Merge through a transaction.
- Subscribe using `onSnapshot`.
- Return the existing document object when merged sync content is unchanged.
- Materialize merged sync data while preserving view and anchor date.
- Retry on `online`, show offline on `offline`, and unsubscribe when code changes/unmounts.

- [ ] **Step 6: Run transaction and full tests**

Run: `npm test -- --run src/cloud/firestoreSync.test.ts && npm test -- --run`

Expected: all tests pass.

### Task 6: Add The Bottom Collapsed UI

**Files:**
- Create: `src/components/CloudSyncPanel.tsx`
- Create: `src/components/CloudSyncPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing component tests**

Render the panel and verify:

```tsx
expect(screen.getByText('云同步与数据').closest('details')).not.toHaveAttribute('open')
expect(screen.getByRole('textbox', { name: '云同步码' })).toBeVisible()
expect(screen.getByRole('button', { name: '新建同步码' })).toBeVisible()
expect(screen.getByRole('button', { name: '连接同步' })).toBeVisible()
expect(screen.getByText('仅本地')).toBeVisible()
```

Use parameterized tests for all six status labels.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run src/components/CloudSyncPanel.test.tsx`

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the panel and styles**

Place one unopened `<details className="bottom-panel cloud-sync-panel">` last inside `.bottom-panels`. Include code input, new/connect buttons, status, import, and export. Move the existing quiet transfer controls out of the footer to avoid duplicates.

- [ ] **Step 4: Wire import as collection merge**

Import a document, run:

```ts
const merged = mergeSyncStates(current.sync, imported.sync)
return {
  sync: merged,
  state: applySyncStateToAppState(current.state, merged),
}
```

Keep the current view/anchor and do not import deviceId or sync code.

- [ ] **Step 5: Run UI and full tests**

Run: `npm test -- --run src/components/CloudSyncPanel.test.tsx src/App.test.tsx && npm test -- --run`

Expected: all panel, app, and existing tests pass.

### Task 7: Add And Deploy Firebase Rules

**Files:**
- Create: `.firebaserc`
- Create: `firebase.json`
- Create: `firestore.rules`

- [ ] **Step 1: Add Firebase project files**

`.firebaserc`:

```json
{
  "projects": {
    "default": "daily-calorie-tracker-3ec47"
  }
}
```

`firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

`firestore.rules` must retain:

```text
match /syncSpaces/{syncCode} {
  allow read, write: if request.auth != null
    && syncCode.size() >= 12
    && syncCode.size() <= 24;
}
```

and add the same guarded rule for `projectCheckinSyncSpaces/{syncCode}`.

- [ ] **Step 2: Validate and deploy rules**

Run: `npx firebase-tools use daily-calorie-tracker-3ec47`

Run: `npx firebase-tools deploy --only firestore:rules --project daily-calorie-tracker-3ec47`

Expected: rules compile and deploy successfully without removing the existing calorie collection rule.

### Task 8: Build And Verify Two Isolated Clients

**Files:**
- Verify: all implementation files

- [ ] **Step 1: Run final automated verification**

Run:

```bash
npm test -- --run
npm run build
npm run build:standalone
git diff --check
```

Expected: every test passes, production build succeeds, standalone HTML regenerates, and no whitespace errors exist.

- [ ] **Step 2: Start one server on both hostnames**

Run: `npm run dev -- --host 0.0.0.0 --port 5174`

Open client A at `http://127.0.0.1:5174/` and client B at `http://localhost:5174/`. Their localStorage and anonymous Firebase sessions are isolated by origin.

- [ ] **Step 3: Verify real convergence**

Use one generated project sync code in both clients:

1. Create unique project A and B; both clients converge to both projects.
2. Create same-name projects with different IDs; both remain.
3. Edit the same ID sequentially; newest edit appears in both.
4. Delete a project and toggle off a check-in; deletion propagates and survives reload.
5. Keep a bottom panel open and change view on one client; remote snapshot does not close or change it.
6. Confirm statuses move through connecting/syncing/synced and the console has no relevant errors.

- [ ] **Step 4: Verify offline recovery logic**

Rerun the pure offline-recovery test and, if browser network emulation is available, make a local edit while one client is offline, edit the other online, reconnect, and confirm union. Do not block deployment on unavailable network emulation because the local-first/online-event path is already automated.

### Task 9: Commit, Publish, And Production Smoke Test

**Files:**
- Commit all intended source, tests, config, rules, lockfile, and documentation.

- [ ] **Step 1: Commit**

```bash
git add src package.json package-lock.json .firebaserc firebase.json firestore.rules docs/superpowers/plans/2026-06-28-collection-cloud-sync.md
git commit -m "feat: add collection cloud sync"
```

- [ ] **Step 2: Publish main**

Push the verified commit to `main` and `codex/project-checkin-web`. If Git transport remains unavailable, create a GitHub commit based on current remote `main` through the GitHub API and update `main` without force.

- [ ] **Step 3: Wait for GitHub Pages**

Confirm the Pages workflow for the published commit completes successfully.

- [ ] **Step 4: Verify production**

Open `https://sange1022.github.io/project-checkin-dashboard/`, confirm the bottom cloud panel, anonymous connection, real sync status, existing shortcuts, dark mode, and no console errors.
