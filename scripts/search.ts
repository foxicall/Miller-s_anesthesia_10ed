/** Self-contained: VitePress serializes this function into the browser bundle. */
export function tokenizeChinese(text: string): string[] {
  const pieces = text.normalize('NFKC').toLocaleLowerCase('zh-TW')
    .match(/[\p{Script=Han}]+|[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu) ?? []
  return pieces.flatMap(piece => {
    if (!/\p{Script=Han}/u.test(piece)) return [piece]
    const chars = Array.from(piece)
    if (chars.length === 1) return chars
    // Overlapping bigrams find terms inside unspaced Traditional Chinese prose.
    return chars.slice(0, -1).map((char, index) => char + chars[index + 1])
  })
}
