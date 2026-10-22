import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chapterNumber, prepareContent } from '../scripts/prepare-content'

async function fixture(run: (root: string, source: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'miller-content-'))
  const source = path.join(root, 'output_md')
  await mkdir(source)
  try { await run(root, source) } finally { await rm(root, { recursive: true, force: true }) }
}

test('recognizes supported filenames and rejects invalid chapter numbers', () => {
  for (const file of ['01-intro.md', 'chapter_01.md', 'Ch.01.md', '第1章.md', '01導論.md']) assert.equal(chapterNumber(file, {}), 1)
  assert.equal(chapterNumber('custom.md', { chapter: 87 }), 87)
  for (const file of ['0.md', '88.md', 'notes.md', '1000.md']) assert.throws(() => chapterNumber(file, {}))
})
test('empty scaffold makes all 87 entries explicit and excludes placeholders from search', () => fixture(async (root) => {
  const chapters = await prepareContent(root)
  assert.equal(chapters.length, 87)
  assert.equal(chapters.filter(chapter => chapter.available).length, 0)
  assert.match(await readFile(path.join(root, 'docs/chapters/ch-87.md'), 'utf8'), /search: false/)
  await assert.rejects(prepareContent(root, true), /需要 87 章/)
}))
test('imports nested chapters, metadata, reference links and local images with stable routes', () => fixture(async (root, source) => {
  await mkdir(path.join(source, 'part'))
  await mkdir(path.join(source, 'images'))
  await writeFile(path.join(source, '01-呼吸.md'), '---\ndescription: 呼吸道相關閱讀\n---\n# 呼吸道管理\n\n## 準備\n\n[下一章](part/02-藥理.md#劑量)\n\n![圖片](images/流程.png)\n\n[參考][ref]\n\n[ref]: part/02-藥理.md\n')
  await writeFile(path.join(source, 'part/02-藥理.md'), '# 藥理學\n\n## 劑量\n\n測試內容。')
  await writeFile(path.join(source, 'images/流程.png'), 'test-image')
  const chapters = await prepareContent(root)
  assert.equal(chapters[0].title, '現代麻醉學實務與範疇')
  assert.equal(chapters[0].originalTitle, '呼吸道管理')
  assert.equal(chapters[1].available, true)
  const page = await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8')
  assert.match(decodeURI(page), /\/chapters\/ch-02.md#劑量/)
  assert.match(page, /\/chapter-assets\//)
  assert.match(page, /\[ref\]: \/chapters\/ch-02.md/)
  assert.equal(await readFile(path.join(root, 'docs/public/chapter-assets/images/流程.png'), 'utf8'), 'test-image')
}))
test('rejects duplicate numbers, empty files and broken links', () => fixture(async (root, source) => {
  await writeFile(path.join(source, '01.md'), '# 第一章\n')
  await writeFile(path.join(source, 'ch01.md'), '# 重複\n')
  await assert.rejects(prepareContent(root), /重複/)
  await rm(path.join(source, 'ch01.md'))
  await writeFile(path.join(source, '01.md'), '')
  await assert.rejects(prepareContent(root), /空白/)
  await writeFile(path.join(source, '01.md'), '# 第一章\n\n![遺失](missing.png)')
  await assert.rejects(prepareContent(root), /找不到本地連結/)
}))
test('rejects remote images so full-offline content is not silently incomplete', () => fixture(async (root, source) => {
  await writeFile(path.join(source, '01.md'), '# 第一章\n\n![外部圖](https://example.com/a.png)')
  await assert.rejects(prepareContent(root), /離線圖片/)
}))
test('rewrites only link destinations and preserves queries, anchors and code examples', () => fixture(async (root, source) => {
  await writeFile(path.join(source, '02.md'), '# 第二章\n')
  const code = '```md\n[範例](02.md)\n```\n\n`[行內範例](02.md)`'
  await writeFile(path.join(source, '01.md'), '# 第一章\n\n[實際連結](02.md?q=1#段落)\n\n' + code)
  await prepareContent(root)
  const result = await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8')
  assert.match(result, /\/chapters\/ch-02.md\?q=1#段落/)
  assert(result.includes(code))
}))
test('validates reference images and filenames with spaces', () => fixture(async (root, source) => {
  await writeFile(path.join(source, 'image file.png'), 'test')
  await writeFile(path.join(source, '01.md'), '# 第一章\n\n![圖片](<image file.png> "圖說")\n')
  await prepareContent(root)
  assert.match(await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8'), /image%20file.png/)
  await writeFile(path.join(source, '01.md'), '# 第一章\n\n![圖片][figure]\n\n[figure]: //example.com/image.png')
  await assert.rejects(prepareContent(root), /離線圖片/)
}))
test('strict build accepts exactly all 87 chapters and refresh removes obsolete assets', () => fixture(async (root, source) => {
  for (let i = 1; i <= 87; i++) await writeFile(path.join(source, `${i}.md`), `# 第 ${i} 章標題\n\n## 段落\n\n章節內容。`)
  await writeFile(path.join(source, 'unused.pdf'), 'test')
  assert.equal((await prepareContent(root, true)).filter(c => c.available).length, 87)
  await rm(path.join(source, 'unused.pdf'))
  await prepareContent(root, true)
  await assert.rejects(readFile(path.join(root, 'docs/public/chapter-assets/unused.pdf')))
}))
