import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot, walk } from './prepare-content'
import { chapterTranslations } from './chapter-localization'

const dist = path.join(projectRoot, 'docs/.vitepress/dist')
const files = await walk(dist)
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'))
assert.equal(manifest.name, "米勒麻醉學 (Miller's Anesthesia 10e)")
assert.equal(manifest.short_name, '米勒麻醉學')
assert.equal(manifest.description, "Miller's Anesthesia 10th Edition 繁體中文臨床參考電子手冊")
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.theme_color, '#0f172a')
assert.equal(manifest.background_color, '#ffffff')
assert.equal(manifest.icons.length, 3)
assert(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'))
const sw = await readFile(path.join(dist, 'sw.js'), 'utf8')
for (let number = 1; number <= 87; number++) {
  const page = `chapters/ch-${String(number).padStart(2, '0')}.html`
  assert(sw.includes(page), `離線快取缺少 ${page}`)
  assert(files.includes(path.join(dist, page)), `缺少章節頁面 ${page}`)
  const html = await readFile(path.join(dist, page), 'utf8')
  assert(html.includes(`<title>${chapterTranslations[number - 1].title}`), `第 ${number} 章缺少繁中頁面標題`)
}
for (const file of files) {
  const relative = path.relative(dist, file).split(path.sep).join('/')
  if (/^(?:sw\.js|workbox-[^/]+\.js)$/.test(relative) || /\.map$/.test(relative)) continue
  assert(sw.includes(relative) || sw.includes(encodeURI(relative)), `檔案未納入離線快取（可能超過 50 MiB）：${relative}`)
}
assert(files.some(file => /localSearchIndex.*\.js$/.test(file)), '未產生本地搜尋索引')
const html = await readFile(path.join(dist, 'index.html'), 'utf8')
assert(html.includes('lang="zh-Hant-TW"'))
assert(html.includes('manifest.webmanifest'))
console.log(`建置驗證通過：87 個章節頁面、繁體中文介面、PWA manifest 及所有靜態檔案皆納入離線快取（${files.length} 個輸出檔案）。`)
