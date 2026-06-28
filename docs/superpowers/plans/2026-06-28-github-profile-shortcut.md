# GitHub Profile Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact GitHub icon shortcut that opens the user's public GitHub profile from the top-right action area.

**Architecture:** Extend the existing static shortcut group in `App.tsx` with one icon-only anchor. Reuse the existing `icon-button` styling and the installed `lucide-react` package so no new component, state, storage, or dependency is needed.

**Tech Stack:** React 19, TypeScript, lucide-react, Vitest, Testing Library, Vite

---

### Task 1: Add and verify the GitHub profile shortcut

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

- [x] **Step 1: Write the failing test**

Add this test after the existing English shortcut test:

```tsx
test('opens the GitHub profile shortcut safely in a new tab', () => {
  render(<App />)
  const link = screen.getByRole('link', { name: 'GitHub 主页' })
  expect(link).toHaveAttribute('href', 'https://github.com/sange1022')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because no link with accessible name `GitHub 主页` exists.

- [x] **Step 3: Add the minimal icon link**

Add `Github` to the existing `lucide-react` import, then place this anchor after the “盘” shortcut and before the theme button:

```tsx
<a
  className="icon-button"
  href="https://github.com/sange1022"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="GitHub 主页"
  title="GitHub 主页"
>
  <Github size={17} />
</a>
```

- [x] **Step 4: Run the complete tests and production build**

Run: `npm test -- --run`

Expected: all test files and tests PASS.

Run: `GITHUB_ACTIONS=true GITHUB_REPOSITORY=sange1022/project-checkin-dashboard npm run build`

Expected: TypeScript and Vite build complete with exit code 0.

- [x] **Step 5: Verify the rendered shortcut**

Open the local app in the in-app browser and confirm:

- The GitHub icon is between “盘” and the theme button.
- Its accessible name is `GitHub 主页`.
- Its destination is `https://github.com/sange1022` and opens in a new tab.
- The page has no relevant console errors or framework overlay.

- [ ] **Step 6: Commit and publish**

```bash
git add src/App.tsx src/App.test.tsx docs/superpowers/plans/2026-06-28-github-profile-shortcut.md
git commit -m "feat: add GitHub profile shortcut"
git push origin HEAD:main
git push origin HEAD:codex/project-checkin-web
```

Confirm the GitHub Pages workflow succeeds and the published page contains the GitHub shortcut.
