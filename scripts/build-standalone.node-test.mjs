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
  assert.match(html, /<script type="module">document\.querySelector/)
  assert.doesNotMatch(html, /assets\/app\.(css|js)/)
  assert.match(html, /<\\\/style>/)
  assert.match(html, /<\\\/script>/)
})
