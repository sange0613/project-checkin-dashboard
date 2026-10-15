import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { build } from 'vite'

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个文件路径`)
  return value
}

const inputPath = resolve(readOption('--input', 'dist/index.html'))
const outputPath = resolve(readOption('--output', '项目进度一览表.html'))
const inputDirectory = dirname(inputPath)
function assetPath(assetUrl) {
  const pathname = new URL(assetUrl, 'https://standalone.local').pathname
  return join(inputDirectory, 'assets', basename(pathname))
}
async function inlinePage(pagePath) {
  let html = readFileSync(pagePath, 'utf8')
  let styleCount = 0
  let scriptCount = 0
  html = html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, '')
  html = html.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (_tag, href) => {
      styleCount += 1
      return `<style>${readFileSync(assetPath(href), 'utf8').replace(/<\/style/gi, '<\\/style')}</style>`
    },
  )
  for (const match of [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]) {
    scriptCount += 1
    const result = await build({
      configFile: false, publicDir: false, logLevel: 'silent',
      build: {
        write: false, minify: false,
        lib: { entry: assetPath(match[1]), formats: ['iife'], name: 'StandaloneApp' },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    })
    const output = Array.isArray(result) ? result[0].output : result.output
    const chunk = output.find(item => item.type === 'chunk')
    if (!chunk) throw new Error('未能打包独立页面脚本')
    html = html.replace(match[0], () => `<script type="module">${chunk.code.replace(/<\/script/gi, '<\\/script')}</script>`)
  }
  if (styleCount !== 1 || scriptCount !== 1) throw new Error(`需要各内嵌一个 CSS 和 JavaScript 文件，实际为 CSS ${styleCount}、JavaScript ${scriptCount}`)
  return html
}

let html = await inlinePage(inputPath)
const journalPath = join(inputDirectory, 'time-journal', 'index.html')
if (existsSync(journalPath)) {
  const journal = JSON.stringify(await inlinePage(journalPath)).replace(/</g, '\\u003c')
  const payload = `<script id="standalone-time-journal" type="application/json">${journal}</script>`
  html = html.includes('</body>') ? html.replace('</body>', () => `${payload}\n</body>`) : `${payload}\n${html}`
}
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, html)
console.log(`已生成：${outputPath}`)
