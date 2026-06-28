# Standalone HTML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one self-contained `项目进度一览表.html` file that preserves the complete application without an adjacent assets folder.

**Architecture:** Add a dependency-free Node build script that consumes Vite's production `dist/index.html`, resolves its generated CSS and JavaScript files, and replaces their tags with inline content. A Node test runs the CLI against a temporary fixture so asset inlining, escaping, and output independence are verified without relying on changing Vite hash names.

**Tech Stack:** Node.js ESM, Node test runner, Vite, React, HTML/CSS/JavaScript

---

### Task 1: Build and test the standalone HTML generator

**Files:**
- Create: `scripts/build-standalone.node-test.mjs`
- Create: `scripts/build-standalone.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [x] **Step 1: Write the failing CLI test**

Create `scripts/build-standalone.node-test.mjs` with a temporary Vite-like build:

```js
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('inlines Vite CSS and JavaScript into one HTML file', () => {
  const root = mkdtempSync(join(tmpdir(), 'standalone-html-'))
  const dist = join(root, 'dist')
  const assets = join(dist, 'assets')
  const output = join(root, 'output.html')
  mkdirSync(assets, { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<link rel="stylesheet" href="/app/assets/app.css"><div id="root"></div><script type="module" src="/app/assets/app.js"></script>')
  writeFileSync(join(assets, 'app.css'), 'body { color: black; }')
  writeFileSync(join(assets, 'app.js'), 'document.querySelector("#root").textContent = "可用"')

  execFileSync(process.execPath, ['scripts/build-standalone.mjs', '--input', join(dist, 'index.html'), '--output', output])
  const html = readFileSync(output, 'utf8')

  assert.match(html, /<style>body \{ color: black; \}<\/style>/)
  assert.match(html, /<script type="module">document\.querySelector/)
  assert.doesNotMatch(html, /assets\/app\.(css|js)/)
})
```

- [x] **Step 2: Run the test and confirm it fails**

Run: `node --test scripts/build-standalone.node-test.mjs`

Expected: FAIL because `scripts/build-standalone.mjs` does not exist.

- [x] **Step 3: Implement the dependency-free generator**

Create `scripts/build-standalone.mjs` to:

- Parse optional `--input` and `--output` arguments.
- Default to `dist/index.html` and `项目进度一览表.html`.
- Resolve asset files from the input HTML's sibling `assets` directory using each URL basename.
- Replace stylesheet links with `<style>` content.
- Replace module script tags with inline `<script type="module">` content.
- Escape closing `style` and `script` sequences before insertion.
- Throw a clear error unless exactly one stylesheet and one script are inlined.

Add these package scripts:

```json
"build:standalone": "npm run build && node scripts/build-standalone.mjs",
"test:standalone": "node --test scripts/build-standalone.test.mjs"
```

Add `/项目进度一览表.html` to `.gitignore` because it is a reproducible delivery artifact.

- [x] **Step 4: Verify the generator test passes**

Run: `npm run test:standalone`

Expected: one test passes.

### Task 2: Generate and verify the deliverable

**Files:**
- Create (generated, ignored): `项目进度一览表.html`

- [x] **Step 1: Build the standalone file**

Run: `npm run build:standalone`

Expected: Vite build succeeds and the script reports the absolute output path.

- [x] **Step 2: Run all automated checks**

Run: `npm test -- --run && npm run test:standalone && git diff --check`

Expected: all application tests and the standalone generator test pass; no whitespace errors.

- [x] **Step 3: Inspect the generated artifact**

Confirm that `项目进度一览表.html`:

- Exists and has non-zero size.
- Contains inline `<style>` and `<script type="module">`.
- Contains no `src` or `href` reference to `dist/assets` or `/project-checkin-dashboard/assets`.

- [x] **Step 4: Verify in the in-app browser**

Open the generated file through a local static server, then confirm:

- Page title and project dashboard render.
- No framework error overlay or relevant console errors appear.
- The GitHub shortcut is present.
- Switching the theme changes the rendered control state.

- [x] **Step 5: Commit source changes and deliver the file**

```bash
git add scripts/build-standalone.mjs scripts/build-standalone.node-test.mjs package.json .gitignore docs/superpowers/plans/2026-06-28-standalone-html-export.md
git commit -m "feat: add standalone HTML export"
```

Return a clickable absolute file link to `项目进度一览表.html`.
