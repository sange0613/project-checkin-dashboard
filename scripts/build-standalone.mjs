import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个文件路径`)
  return value
}

function assetPath(inputDirectory, assetUrl) {
  const pathname = new URL(assetUrl, 'https://standalone.local').pathname
  return join(inputDirectory, 'assets', basename(pathname))
}

const inputPath = resolve(readOption('--input', 'dist/index.html'))
const outputPath = resolve(readOption('--output', '项目进度一览表.html'))
const inputDirectory = dirname(inputPath)
let html = readFileSync(inputPath, 'utf8')
let styleCount = 0
let scriptCount = 0

html = html.replace(
  /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
  (_tag, href) => {
    styleCount += 1
    const css = readFileSync(assetPath(inputDirectory, href), 'utf8')
      .replace(/<\/style/gi, '<\\/style')
    return `<style>${css}</style>`
  },
)

html = html.replace(
  /<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
  (_tag, src) => {
    scriptCount += 1
    const javascript = readFileSync(assetPath(inputDirectory, src), 'utf8')
      .replace(/<\/script/gi, '<\\/script')
    return `<script type="module">${javascript}</script>`
  },
)

if (styleCount !== 1 || scriptCount !== 1) {
  throw new Error(`需要各内嵌一个 CSS 和 JavaScript 文件，实际为 CSS ${styleCount}、JavaScript ${scriptCount}`)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, html)
console.log(`已生成：${outputPath}`)
