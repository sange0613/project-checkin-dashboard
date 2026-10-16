# Zijian Text Layout Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact “字” shortcut that opens the Zijian Text Layout page from the top-right action area.

**Architecture:** Extend the existing static shortcut group in `App.tsx` with one text anchor. Reuse the current `icon-button shortcut-character` styling so no new component, state, storage, or dependency is introduced.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite

---

### Task 1: Add and verify the Zijian Text Layout shortcut

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

- [x] **Step 1: Write the failing test**

Add this case to the existing shortcut table:

```tsx
['字间排版', 'https://sange0613.github.io/zijian-text-layout/'],
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because no link named `字间排版` exists.

- [x] **Step 3: Add the minimal shortcut**

Place this anchor after “盘” and before the GitHub icon:

```tsx
<a className="icon-button shortcut-character" href="https://sange0613.github.io/zijian-text-layout/" target="_blank" rel="noopener noreferrer" aria-label="字间排版" title="字间排版">字</a>
```

- [x] **Step 4: Run all verification**

Run: `npm test -- --run`

Expected: all test files and tests PASS.

Run: `GITHUB_ACTIONS=true GITHUB_REPOSITORY=sange1022/project-checkin-dashboard npm run build`

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 5: Verify and publish**

Use the in-app browser to confirm the “字” shortcut appears between “盘” and the GitHub icon, has the correct URL, and causes no relevant console errors. Commit the files, update `main`, wait for GitHub Pages deployment, and verify the same link on the published page.
