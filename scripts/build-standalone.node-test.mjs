import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

test('inlines Vite CSS and JavaScript into one HTML file', () => {
  const root = mkdtempSync(join(tmpdir(), 'standalone-html-'))
  const dist = join(root, 'dist')
  const assets = join(dist, 'assets')
  const output = join(root, 'output.html')
  mkdirSync(assets, { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<link rel="stylesheet" href="/app/assets/app.css"><div id="root"></div><script type="module" src="/app/assets/app.js"></script>')
  writeFileSync(join(assets, 'app.css'), 'body { color: black; } /* </style> */')
  writeFileSync(join(assets, 'app.js'), 'document.querySelector("#root").textContent = "可用 </script>"')

  let failure
  try {
    execFileSync(process.execPath, ['scripts/build-standalone.mjs', '--input', join(dist, 'index.html'), '--output', output], { stdio: 'pipe' })
  } catch (error) {
    failure = error
  }

  assert.equal(failure, undefined, failure?.stderr?.toString())
  const html = readFileSync(output, 'utf8')
  assert.match(html, /<style>body \{ color: black; \}/)
  assert.match(html, /<script type="module">[\s\S]*document\.querySelector/)
  assert.doesNotMatch(html, /assets\/app\.(css|js)/)
  assert.match(html, /<\\\/style>/)
  assert.match(html, /<\\\/script>/)
})

test('bundles shared static imports so standalone HTML can start without adjacent chunks', () => {
  const root = mkdtempSync(join(tmpdir(), 'standalone-shared-'))
  const assets = join(root, 'assets')
  mkdirSync(assets)
  writeFileSync(join(root, 'index.html'), '<link rel="modulepreload" href="./assets/shared.js"><link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>')
  writeFileSync(join(assets, 'app.css'), 'body{}')
  writeFileSync(join(assets, 'shared.js'), 'export const title = "时间记录已就绪";')
  writeFileSync(join(assets, 'app.js'), 'import {title} from "./shared.js"; document.title = title;')
  const output = join(root, 'output.html')
  execFileSync(process.execPath, ['scripts/build-standalone.mjs', '--input', join(root, 'index.html'), '--output', output])
  const html = readFileSync(output, 'utf8')
  const document = { title: '' }
  runInNewContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1], { document })
  assert.equal(document.title, '时间记录已就绪')
  assert.doesNotMatch(html, /rel="modulepreload"/)
})
