import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'

export interface PreparedAsset { source: string; relative: string }
/** Lossless encoding only; verify identical decoded RGBA pixels before using WebP. */
export async function prepareAssets(files: string[], input: string, cacheRoot: string): Promise<Map<string, PreparedAsset>> {
  const result = new Map<string, PreparedAsset>()
  const cache = path.join(cacheRoot, 'lossless-webp-v1')
  await mkdir(cache, { recursive: true })
  sharp.concurrency(1)
  const pending = new Map<string, Promise<string | undefined>>()
  let next = 0, converted = 0, originalBytes = 0, outputBytes = 0, completed = 0
  async function encode(file: string, bytes: Buffer, hash: string): Promise<string | undefined> {
    const destination = path.join(cache, `${hash}.webp`)
    try {
      if ((await stat(destination)).size < bytes.length) return destination
      return undefined
    } catch { /* Generate an atomic cache entry on first use. */ }
    const encoded = await sharp(bytes).webp({ lossless: true, effort: 4 }).toBuffer()
    if (encoded.length >= bytes.length) return undefined
    const [before, after] = await Promise.all([
      sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    ])
    if (before.info.width !== after.info.width || before.info.height !== after.info.height || !before.data.equals(after.data)) {
      // Preserve the original file if color metadata or alpha semantics differ.
      console.log(`保留原始 PNG（像素比對不同）：${path.basename(file)}`)
      return undefined
    }
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, encoded)
    await rename(temporary, destination)
    return destination
  }
  async function worker() {
    while (next < files.length) {
      const file = files[next++]
      let source = file
      let relative = path.relative(input, file)
      const bytes = await readFile(file)
      originalBytes += bytes.length
      if (/\.png$/i.test(file) && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        const hash = createHash('sha256').update(bytes).digest('hex')
        if (!pending.has(hash)) pending.set(hash, encode(file, bytes, hash))
        const optimized = await pending.get(hash)!
        if (optimized) {
          source = optimized
          relative = relative.replace(/\.png$/i, `.${hash.slice(0, 12)}.webp`)
          converted++
        }
      }
      const outputSize = (await stat(source)).size
      outputBytes += outputSize
      result.set(file, { source, relative })
      completed++
      if (files.length > 100 && completed % 250 === 0) console.log(`圖片準備：${completed} / ${files.length}`)
    }
  }
  await Promise.all([worker(), worker()])
  if (files.length > 100) console.log(`無損圖庫：${converted} 張 WebP，${Math.round(originalBytes / 1024**2)} → ${Math.round(outputBytes / 1024**2)} MiB；來源檔案保持不變。`)
  return result
}
