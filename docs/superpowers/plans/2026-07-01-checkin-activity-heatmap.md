# Checkin Activity Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Codex-style one-year activity heatmap that visualizes total project check-ins in daily, weekly, and week-to-date cumulative modes.

**Architecture:** Put date generation and aggregation in a pure domain module, and render the resulting cells in a focused React component. `App` only passes the existing `checkins` state into the component, while CSS owns the responsive grid, tooltip, intensity palette, and dark theme.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS Grid, Vite

---

### Task 1: Build pure activity aggregation

**Files:**
- Create: `src/domain/activityHeatmap.test.ts`
- Create: `src/domain/activityHeatmap.ts`

- [x] **Step 1: Write failing domain tests**

Cover these public functions:

```ts
type ActivityMode = 'daily' | 'weekly' | 'cumulative'

getActivityDates(new Date(2026, 6, 1))
getDailyCheckinTotals({ a: ['2026-06-29'], b: ['2026-06-29', '2026-06-30'] })
getActivityValues(dates, totals, 'weekly')
getActivityValues(dates, totals, 'cumulative')
getActivityIntensity(0, values)
```

Assert that the range starts on a Monday, ends on the Sunday containing today, has complete weeks, counts two projects on the same date as 2, assigns a full natural-week total in weekly mode, resets cumulative totals on Monday, and maps zero to level 0 with positive values distributed across levels 1–4.

- [x] **Step 2: Verify the domain tests fail**

Run: `npm test -- --run src/domain/activityHeatmap.test.ts`

Expected: FAIL because `activityHeatmap.ts` does not exist.

- [x] **Step 3: Implement the pure functions**

Create `activityHeatmap.ts` with exported `ActivityMode`, `ActivityCell`, `getActivityDates`, `getDailyCheckinTotals`, `getActivityValues`, `getActivityIntensity`, `getActivityMonthLabels`, and `formatActivityTooltip`. Use local calendar dates and Monday-based weeks; do not mutate input state.

- [x] **Step 4: Verify domain tests pass**

Run: `npm test -- --run src/domain/activityHeatmap.test.ts`

Expected: all activity domain tests PASS.

### Task 2: Render and interact with the heatmap

**Files:**
- Create: `src/components/CheckinActivityHeatmap.test.tsx`
- Create: `src/components/CheckinActivityHeatmap.tsx`

- [x] **Step 1: Write failing component tests**

Render:

```tsx
<CheckinActivityHeatmap
  checkins={{ a: ['2026-06-29'], b: ['2026-06-29', '2026-06-30'] }}
  today={new Date(2026, 6, 1)}
/>
```

Assert that the component shows “打卡活动”, three buttons named “每日”, “每周”, and “累计”, defaults to daily mode, exposes the June 29 cell as “2026年6月29日 打卡 2 次”, switches weekly and cumulative button state, and shows the matching tooltip on pointer hover or focus.

- [x] **Step 2: Verify component tests fail**

Run: `npm test -- --run src/components/CheckinActivityHeatmap.test.tsx`

Expected: FAIL because the component does not exist.

- [x] **Step 3: Implement the component**

Render a section with a heading row, ARIA-pressed mode buttons, a 53-column by 7-row CSS grid, month labels, focusable cells, and one tooltip controlled by hover/focus state. Set `data-intensity`, `data-future`, and stable date attributes on each cell.

- [x] **Step 4: Verify component tests pass**

Run: `npm test -- --run src/components/CheckinActivityHeatmap.test.tsx`

Expected: all heatmap component tests PASS.

### Task 3: Place the heatmap at the end of the page and style it

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [x] **Step 1: Write a failing App integration test**

Assert that `screen.getByRole('region', { name: '打卡活动' })` is rendered after the bottom management panels and receives existing check-in data through the visible tooltip contract.

- [x] **Step 2: Verify the App test fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because the activity region is absent.

- [x] **Step 3: Add the component and styles**

Import `CheckinActivityHeatmap`, render it after `.bottom-panels`, and pass `state.checkins` plus `today`. Add styles matching the approved reference: generous top spacing, 18–20 px heading, text-only mode tabs, 15–17 px rounded squares, pale neutral zero state, four blue activity levels, floating tooltip, month labels, dark mode variants, and horizontal overflow below the desktop width.

- [x] **Step 4: Run full verification**

Run: `npm test -- --run`

Expected: all tests PASS.

Run: `GITHUB_ACTIONS=true GITHUB_REPOSITORY=sange1022/project-checkin-dashboard npm run build`

Expected: production build succeeds.

- [ ] **Step 5: Browser QA and publish**

Verify the desktop and narrow layouts, all three switches, tooltip contents, dark mode, no framework overlay, and no relevant console warnings. Commit the implementation, publish only the intended feature files on top of the current remote `main`, wait for GitHub Pages, and verify the live activity region.
