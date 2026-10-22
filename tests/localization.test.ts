import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import MiniSearch from 'minisearch'
import { chapterTranslations, clinicalSections } from '../scripts/chapter-localization'
import { prepareContent } from '../scripts/prepare-content'
import { tokenizeChinese } from '../scripts/search'

test('clinical sections cover each of the 87 chapters exactly once', () => {
  const numbers = clinicalSections.flatMap(section => section.chapters)
  assert.deepEqual(numbers.toSorted((a, b) => a - b), Array.from({ length: 87 }, (_, i) => i + 1))
  assert.equal(chapterTranslations.length, 87)
  for (const chapter of chapterTranslations) {
    assert.match(chapter.title, /\p{Script=Han}/u)
    assert(chapter.keywords.length > 0)
  }
  assert(clinicalSections.find(section => section.id === 'pain-palliative')!.chapters.includes(77))
})

test('localized pages keep original English and index Chinese aliases without changing source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'miller-localization-'))
  const input = path.join(root, 'output_md')
  try {
    await mkdir(input)
    const original = '---\nchapter: 40\ntitle: Airway Management in the Adult\n---\n\n# Airway Management in the Adult\n\n## Preparation\n\nOriginal English content with 2 mg/kg.\n'
    const file = path.join(input, 'Chapter_40.md')
    await writeFile(file, original)
    const chapters = await prepareContent(root)
    const page = matter(await readFile(path.join(root, 'docs/chapters/ch-40.md'), 'utf8'))
    assert.equal(page.data.title, '成人氣道管理')
    assert.match(page.data.description, /第 40 章/)
    assert.match(page.data.next.text, /脊髓、硬膜外與薦椎麻醉/)
    assert.equal(page.data.originalTitle, 'Airway Management in the Adult')
    assert.equal(page.content.match(/^# /gm)?.length, 1)
    assert(page.content.includes('Original English content with 2 mg/kg.'))
    assert.equal(await readFile(file, 'utf8'), original)
    const index = new MiniSearch({ fields: ['text'], tokenize: tokenizeChinese, searchOptions: { combineWith: 'AND' } })
    index.add({ id: 40, text: `${chapters[39].title} ${page.content}` })
    for (const query of ['氣道管理', '呼吸道管理', '困難插管', 'Airway']) assert.equal(index.search(query)[0]?.id, 40)
  } finally { await rm(root, { recursive: true, force: true }) }
})
