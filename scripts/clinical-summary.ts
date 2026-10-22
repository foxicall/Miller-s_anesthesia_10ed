import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import matter from 'gray-matter'

export const originalMarker = '<!-- original-source-body -->\n'
const sectionHeadings = [
  '## 1. 核心觀念精要 (Core Concepts)',
  '## 2. 臨床指引與處置決策 (Clinical Guidelines & Management)',
  '## 3. 重要併發症與危機處理 (Complications & Crisis Management)',
  '## 4. 臨床重點口訣 / 高頻考點 (Key Takeaways / Board Exam Focus)',
  '## 英文原文對照 / 原始內文 (Original Text)'
]
export const digest = (text: string) => createHash('sha256').update(text).digest('hex')

/** Consume only complete artifacts bound to the unchanged original chapter. */
export async function loadClinicalSummary(root: string, number: number, source: string, title: string): Promise<string | undefined> {
  const name = `Chapter_${String(number).padStart(2, '0')}`
  let text: string
  try { text = await readFile(path.join(root, 'summaries_md', `${name}.md`), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const parsed = matter(text)
  const marker = parsed.content.indexOf(originalMarker)
  const fail = () => new Error(`第 ${number} 章摘要缺少有效檢查紀錄或原文已變更。請重新執行 generate_chapter_summaries.py。`)
  if (parsed.data.chapter !== number || parsed.data.title !== title ||
      parsed.data.source_sha256 !== digest(source) ||
      parsed.data.summary_schema_version !== 'gemini-clinical-summary-v1' ||
      parsed.data.summary_review_status !== 'automated_source_checks_only' || marker < 0 ||
      parsed.content.slice(marker + originalMarker.length) !== matter(source).content) throw fail()
  const summary = parsed.content.slice(0, marker)
  if (!summary.startsWith(`\n# 第 ${number} 章 ${title}：重點精華總整理\n`)) throw fail()
  let last = -1
  for (const heading of sectionHeadings) {
    const index = summary.indexOf(`\n${heading}\n`)
    if (index <= last) throw fail()
    last = index
  }
  try {
    const checkpoint = JSON.parse(await readFile(path.join(root, '.summary-checkpoints', `${name}.json`), 'utf8'))
    if (checkpoint.output_sha256 !== digest(text) || checkpoint.response?.review?.approved !== true || checkpoint.response.review.issues?.length !== 0) throw fail()
  } catch { throw fail() }
  // Keep the stored original byte-for-byte; adjust headings only in rendered pages.
  const original = matter(source).content.replace(/^#\s+.+(?:\r?\n|$)/m, '')
  return `${summary}${original}`
}

export function addSourcePageAnchors(content: string): string {
  return content.replace(/<!-- PDF page (\d+) -->/g,
    (_match, page: string) => `<span id="pdf-page-${page}" class="source-page-anchor" aria-label="原始 PDF 第 ${page} 頁"></span>`)
}
