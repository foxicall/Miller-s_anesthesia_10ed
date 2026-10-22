import test from 'node:test'
import assert from 'node:assert/strict'
import MiniSearch from 'minisearch'
import { tokenizeChinese } from '../scripts/search'

test('finds Traditional Chinese terms inside unspaced prose and English drug names', () => {
  const index = new MiniSearch({ fields: ['text'], tokenize: tokenizeChinese, searchOptions: { combineWith: 'AND', prefix: true, fuzzy: false } })
  index.addAll([{ id: 1, text: '這是一段呼吸道管理與藥物劑量的搜尋測試。Propofol 2 mg/kg。' }, { id: 2, text: '其他段落。' }])
  for (const query of ['呼吸道管理', '藥物劑量', 'PROPOFOL', 'propof', '呼吸道 劑量', '2 mg/kg']) assert.deepEqual(index.search(query).map(hit => hit.id), [1])
  assert.deepEqual(index.search('未存在的關鍵字'), [])
})
test('normalizes full-width characters and survives function serialization for browser search', () => {
  assert.deepEqual(tokenizeChinese('ＰＲＯＰＯＦＯＬ ２'), ['propofol', '2'])
  const browserTokenize = new Function(`return (${tokenizeChinese.toString()})`)() as typeof tokenizeChinese
  assert.deepEqual(browserTokenize('局部麻醉'), ['局部', '部麻', '麻醉'])
})
