import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'

/** Keep every search record; compress only the serialized transport format. */
export function compressSearchIndex(): Plugin {
  return {
    name: 'compress-local-search-index',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith('/@localSearchIndex') || id === '/@localSearchIndex') return
      const match = code.match(/^export default\s+("[\s\S]*")\s*;?\s*$/)
      if (!match) throw new Error('本地搜尋索引模組格式變更，請檢查 VitePress 版本。')
      const serialized = JSON.parse(match[1]) as string
      const compressed = gzipSync(Buffer.from(serialized), { level: 9 }).toString('base64')
      return {
        code: `import { gunzipSync, strFromU8 } from 'fflate';
const packed = Uint8Array.from(atob(${JSON.stringify(compressed)}), character => character.charCodeAt(0));
export default strFromU8(gunzipSync(packed));`,
        map: null
      }
    }
  }
}
