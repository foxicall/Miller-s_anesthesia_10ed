import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { prepareContent } from '../scripts/prepare-content'

test('published WebP preserves exact decoded pixels, source PNG, and valid rewritten links', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'miller-lossless-'))
  try {
    await mkdir(path.join(root, 'output_md'))
    const pixels = Buffer.alloc(128 * 128 * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = i % 20 ? 240 : 10
      pixels[i + 1] = 100
      pixels[i + 2] = 180
      pixels[i + 3] = 255
    }
    const png = await sharp(pixels, { raw: { width: 128, height: 128, channels: 4 } }).png().toBuffer()
    const source = path.join(root, 'output_md/figure.png')
    await writeFile(source, png)
    await writeFile(path.join(root, 'output_md/Chapter_01.md'), '# Original\n\n![Dose table](figure.png)\n')
    await prepareContent(root)
    const page = await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8')
    const link = page.match(/!\[Dose table\]\((\/chapter-assets\/[^)]+)\)/)?.[1]
    assert(link)
    assert(link.endsWith('.webp'))
    const optimized = path.join(root, 'docs/public', link)
    assert((await sharp(optimized).ensureAlpha().raw().toBuffer()).equals(pixels))
    assert((await readFile(source)).equals(png))
    // A subsequent sync can reuse the verified content-addressed encoding.
    await prepareContent(root)
    assert.equal(await readFile(path.join(root, 'docs/chapters/ch-01.md'), 'utf8'), page)
  } finally { await rm(root, { recursive: true, force: true }) }
})
