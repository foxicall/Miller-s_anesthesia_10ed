import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { projectRoot } from './prepare-content'

const output = path.join(projectRoot, 'docs/public/icons')
await mkdir(output, { recursive: true })
// The central book and pulse fit within the maskable icon's 80% safe circle.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0f172a"/><g stroke="#fff" stroke-width="15" stroke-linejoin="round" fill="none"><path d="M256 166c-40-27-77-29-122-13v201c46-17 84-12 122 15 38-27 76-32 122-15V153c-45-16-82-14-122 13Z"/><path d="M256 166v203"/></g><path d="M166 260h38l17-30 23 58 26-64 20 36h56" stroke="#9fe0d3" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
await writeFile(path.join(output, 'favicon.svg'), svg)
for (const [name, size] of [['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['maskable-512x512.png', 512], ['apple-touch-icon.png', 180]] as const) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(output, name))
}
console.log('已產生 192px、512px、maskable 及 Apple touch 圖示。')
