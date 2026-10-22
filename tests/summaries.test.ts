import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import matter from 'gray-matter'
import { addSourcePageAnchors, digest, loadClinicalSummary, originalMarker } from '../scripts/clinical-summary'
import { prepareContent } from '../scripts/prepare-content'
import { chapterTranslations } from '../scripts/chapter-localization'

test('summaries retain original assets, page citations and one H1; tampered or stale summaries block import', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'miller-summary-'))
  try {
    for (const directory of ['output_md/assets', 'summaries_md', '.summary-checkpoints']) await mkdir(path.join(root, directory), { recursive: true })
    const title = chapterTranslations[0].title
    const source = '---\nchapter: 1\ntitle: Test Chapter\n---\n\n# Test Chapter\n\n<!-- PDF page 1 -->\n\nTest original body.\n\n![image](assets/test.svg)\n'
    await writeFile(path.join(root, 'output_md/Chapter_01.md'), source)
    await writeFile(path.join(root, 'output_md/assets/test.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const body = `\n# 第 1 章 ${title}：重點精華總整理\n\n## 1. 核心觀念精要 (Core Concepts)\n\n- 測試引用 [原文第 1 頁](#pdf-page-1)\n\n## 2. 臨床指引與處置決策 (Clinical Guidelines & Management)\n\n## 3. 重要併發症與危機處理 (Complications & Crisis Management)\n\n## 4. 臨床重點口訣 / 高頻考點 (Key Takeaways / Board Exam Focus)\n\n---\n\n## 英文原文對照 / 原始內文 (Original Text)\n\n${originalMarker}${matter(source).content}`
    const summary = matter.stringify(body, { title, chapter: 1, source_sha256: digest(source),
      summary_schema_version: 'gemini-clinical-summary-v1', summary_review_status: 'automated_source_checks_only' })
    const file = path.join(root, 'summaries_md/Chapter_01.md')
    await writeFile(file, summary)
    await writeFile(path.join(root, '.summary-checkpoints/Chapter_01.json'), JSON.stringify({ output_sha256: digest(summary), response: { review: { approved: true, issues: [] } } }))
    assert(await loadClinicalSummary(root, 1, source, title))
    assert.equal(await loadClinicalSummary(root, 2, source, title), undefined)
    const catalog = await prepareContent(root)
    assert.equal(catalog[0].hasSummary, true)
    assert.equal(catalog[1].hasSummary, false)
    const page = await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8')
    assert.equal(page.match(/^# /gm)?.length, 1)
    assert(page.includes('重點精華總整理'))
    assert(page.includes('id="pdf-page-1"'))
    assert(page.includes('/chapter-assets/assets/test.svg'))
    assert(page.includes('Test original body.'))
    assert.equal(await readFile(path.join(root, 'output_md/Chapter_01.md'), 'utf8'), source)
    await assert.rejects(loadClinicalSummary(root, 1, source + '\nchanged', title), /原文已變更/)
    await writeFile(file, summary.replace('測試引用', '已被修改'))
    await assert.rejects(prepareContent(root), /檢查紀錄/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('original page references become stable anchors without changing clinical prose', () => {
  const text = 'Before\n<!-- PDF page 12 -->\nAfter 2 mg/kg'
  assert.equal(addSourcePageAnchors(text), 'Before\n<span id="pdf-page-12" class="source-page-anchor" aria-label="原始 PDF 第 12 頁"></span>\nAfter 2 mg/kg')
})
