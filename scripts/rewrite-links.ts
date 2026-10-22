import path from 'node:path'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Root, RootContent, Link, Image, Definition } from 'mdast'

/** Rewrite URL spans from the Markdown AST; never touch examples in code. */
export function rewriteLinks(content: string, file: string, input: string, routes: Map<string, string>, assets: string[], assetRoutes?: Map<string, string>): string {
  const tree = fromMarkdown(content)
  const nodes: (Root | RootContent)[] = []
  function visit(node: Root | RootContent) {
    nodes.push(node)
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(tree)
  const imageReferences = new Set(nodes.filter(node => node.type === 'imageReference').map(node => node.identifier))
  const edits: { start: number; end: number; value: string }[] = []
  for (const node of nodes) {
    if (node.type === 'html' && /<(?:img|video|audio|source|iframe|embed|object|link|script)\b/i.test(node.value)) {
      throw new Error(`${file}：請將 HTML 嵌入資源改為 Markdown 本地附件，才能驗證離線內容。`)
    }
    if (!['link', 'image', 'definition'].includes(node.type)) continue
    const targetNode = node as Link | Image | Definition
    const url = targetNode.url
    const isImage = targetNode.type === 'image' || (targetNode.type === 'definition' && imageReferences.has(targetNode.identifier))
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) {
      if (isImage && !url.startsWith('data:') && !url.startsWith('#')) throw new Error(`${file}：離線圖片須下載至 output_md 並使用相對路徑：${url}`)
      continue
    }
    const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/s)!
    const decoded = decodeURIComponent(pathname)
    const target = decoded.startsWith('/') ? path.resolve(input, `.${decoded}`) : path.resolve(path.dirname(file), decoded)
    if (!target.startsWith(input + path.sep)) throw new Error(`${file}：附件超出 output_md：${url}`)
    const route = routes.get(target)
    if (!route && !assets.includes(target)) throw new Error(`${file}：找不到本地連結目標 ${url}`)
    const replacement = route ?? assetRoutes?.get(target) ?? `/chapter-assets/${path.relative(input, target).split(path.sep).map(part => encodeURIComponent(part).replace(/[()]/g, char => '%' + char.charCodeAt(0).toString(16))).join('/')}`
    const start = targetNode.position!.start.offset!
    const markup = content.slice(start, targetNode.position!.end.offset!)
    let destinationStart: number
    if (targetNode.type === 'definition') {
      destinationStart = markup.match(/^\[[\s\S]*?\]:\s*/)?.[0].length ?? -1
    } else {
      const lastChild = targetNode.type === 'link' ? targetNode.children.at(-1) : undefined
      const labelEnd = lastChild ? lastChild.position!.end.offset! - start : 0
      const delimiter = targetNode.type === 'image' ? markup.lastIndexOf('](') : markup.indexOf('](', labelEnd)
      destinationStart = delimiter < 0 ? -1 : delimiter + 2
      while (/\s/.test(markup[destinationStart] ?? 'x')) destinationStart++
    }
    if (destinationStart < 0) throw new Error(`${file}：無法解析連結 ${url}，請使用標準 Markdown 連結。`)
    const angle = markup[destinationStart] === '<'
    if (angle) destinationStart++
    let destinationEnd = destinationStart
    let depth = 0
    while (destinationEnd < markup.length) {
      const char = markup[destinationEnd]
      if (char === '\\') { destinationEnd += 2; continue }
      if (angle ? char === '>' : /\s/.test(char) || (char === ')' && depth === 0)) break
      if (char === '(') depth++
      if (char === ')') depth--
      destinationEnd++
    }
    edits.push({ start: start + destinationStart, end: start + destinationEnd, value: replacement + suffix })
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.value + content.slice(edit.end)
  return content
}
