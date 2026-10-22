import { mkdir, readdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { rewriteLinks } from './rewrite-links'
import { chapterTranslations, clinicalSections } from './chapter-localization'
import { prepareAssets } from './optimize-images'
import { addSourcePageAnchors, loadClinicalSummary } from './clinical-summary'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export interface Chapter {
  number: number
  title: string
  originalTitle: string
  keywords: string[]
  section: string
  sectionTitle: string
  description: string
  link: string
  available: boolean
  hasSummary: boolean
  source?: string
}

export function chapterNumber(file: string, metadata: Record<string, unknown>): number {
  const name = path.basename(file, path.extname(file))
  const match = name.match(/^(?:chapter[\s_-]*|ch[\s_.-]*|第\s*)?(\d{1,3})(?=$|[\s_.-]|章|[^\x00-\x7F])/i)
  const value = metadata.chapter ?? match?.[1]
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 87) {
    throw new Error(`${file}：請以 01–87 開頭命名，或在 frontmatter 設定 chapter: 1–87。`)
  }
  return number
}

export async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue
    if (entry.isSymbolicLink()) throw new Error(`不支援符號連結：${entry.name}`)
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...await walk(full))
    else result.push(full)
  }
  return result
}

export async function prepareContent(root = projectRoot, strict = false): Promise<Chapter[]> {
  const input = path.join(root, 'output_md')
  const output = path.join(root, 'docs/chapters')
  const generated = path.join(root, 'docs/.vitepress/generated')
  const assets = path.join(root, 'docs/public/chapter-assets')
  await mkdir(input, { recursive: true })
  const files = await walk(input)
  const sourceFiles = files.filter(file => /\.md$/i.test(file) && path.basename(file).toLowerCase() !== 'readme.md')
  const sources = new Map<number, { file: string, raw: string, content: string, data: Record<string, unknown> }>()
  const routeMap = new Map<string, string>()
  for (const file of sourceFiles) {
    const raw = await readFile(file, 'utf8')
    const parsed = matter(raw)
    const number = chapterNumber(file, parsed.data)
    if (sources.has(number)) throw new Error(`第 ${number} 章重複：${sources.get(number)!.file}、${file}`)
    if (!parsed.content.trim()) throw new Error(`${file}：章節內容空白。`)
    const route = `/chapters/ch-${String(number).padStart(2, '0')}.md`
    sources.set(number, { file, raw, content: parsed.content, data: parsed.data })
    routeMap.set(file, route)
  }
  if (strict && sources.size !== 87) throw new Error(`完整內容建置需要 87 章，目前只有 ${sources.size} 章。`)

  // Validate before replacing any previously generated content.
  const assetFiles = files.filter(file => !/\.md$/i.test(file))
  for (const file of assetFiles) {
    if (!/\.(?:png|jpe?g|gif|webp|avif|svg|ico|pdf|woff2?|mp4|webm|mp3|ogg|wav)$/i.test(file)) {
      throw new Error(`不支援的章節附件：${path.relative(input, file)}。請只放入 Markdown 與閱讀附件。`)
    }
  }
  const generatedPages = new Map<string, string>()
  const preparedAssets = await prepareAssets(assetFiles, input, path.join(root, 'docs/.vitepress/cache'))
  const assetRoutes = new Map([...preparedAssets].map(([file, asset]) => [file,
    `/chapter-assets/${asset.relative.split(path.sep).map(part => encodeURIComponent(part).replace(/[()]/g, char => '%' + char.charCodeAt(0).toString(16))).join('/')}`
  ]))
  const chapters: Chapter[] = []
  for (let number = 1; number <= 87; number++) {
    const source = sources.get(number)
    const slug = `ch-${String(number).padStart(2, '0')}`
    const translation = chapterTranslations[number - 1]
    const section = clinicalSections.find(section => section.chapters.includes(number))!
    const title = translation.title
    const clinicalSummary = source ? await loadClinicalSummary(root, number, source.raw, title) : undefined
    let originalTitle = ''
    if (source) {
      const heading = source.content.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]
      originalTitle = String(source.data.title || heading || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '')
    }
    const chapter: Chapter = {
      number, title, originalTitle, keywords: translation.keywords, section: section.id, sectionTitle: section.title,
      link: `/chapters/${slug}.html`, available: Boolean(source), hasSummary: Boolean(clinicalSummary),
      description: source ? `米勒麻醉學第 ${number} 章：${title}。${section.title}，附${clinicalSummary ? '繁中臨床摘要、' : ''}繁中主題索引與英文原文。` : '內容尚未匯入',
      ...(source ? { source: path.relative(input, source.file).split(path.sep).join('/') } : {})
    }
    chapters.push(chapter)
    let content = source?.content ?? `# 第 ${number} 章\n\n::: info 內容尚未匯入\n此章節入口已準備就緒，尚未加入原始 Markdown 內容。\n:::\n\n## 閱讀狀態\n\n目前沒有可供閱讀的章節內容。匯入完成後，此處會顯示章節標題、內文與大綱。\n\n## 下一步\n\n你可以先[瀏覽章節目錄](/chapters/)或閱讀[使用說明](/guide)。\n`
    if (source) {
      if (clinicalSummary) content = clinicalSummary
      content = rewriteLinks(content, source.file, input, routeMap, assetFiles, assetRoutes)
      const english = originalTitle.replace(/[<>]/g, character => character === '<' ? '&lt;' : '&gt;')
      const index = `<p class="chapter-original-title" lang="en">${english}</p>\n\n**主題索引：** ${translation.keywords.join('、')}`
      if (clinicalSummary) {
        content = content.replace(/^(# .+)$/m, `$1\n\n${index}`)
        content = addSourcePageAnchors(content)
      } else {
        // Localize the title without changing source prose when no summary exists.
        content = content.replace(/^#\s+.+(?:\r?\n|$)/m, '')
        content = `# ${title}\n\n${index}\n\n${content.trimStart()}`
      }
    } else {
      content = content.replace(/^# .+/, `# ${title}`)
    }
    const frontmatter = {
      ...(source?.data ?? {}), title, description: chapter.description,
      originalTitle, keywords: translation.keywords, section: section.title,
      chapter: number, available: chapter.available, outline: [2, 3],
      hasSummary: chapter.hasSummary,
      ...(!source ? { search: false } : {}),
      prev: number > 1 ? { text: `第 ${number - 1} 章 · ${chapterTranslations[number - 2].title}`, link: `/chapters/ch-${String(number - 1).padStart(2, '0')}` } : false,
      next: number < 87 ? { text: `第 ${number + 1} 章 · ${chapterTranslations[number].title}`, link: `/chapters/ch-${String(number + 1).padStart(2, '0')}` } : false
    }
    generatedPages.set(`${slug}.md`, matter.stringify(content, frontmatter))
  }
  generatedPages.set('index.md', '---\nlayout: page\ntitle: 章節目錄\nsearch: false\n---\n\n<ChapterDirectory />\n')
  await rm(output, { recursive: true, force: true })
  await rm(assets, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await mkdir(generated, { recursive: true })
  await mkdir(assets, { recursive: true })
  for (const [file, content] of generatedPages) await writeFile(path.join(output, file), content)
  for (const file of assetFiles) {
    const asset = preparedAssets.get(file)!
    const destination = path.join(assets, asset.relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(asset.source, destination)
  }
  await writeFile(path.join(generated, 'catalog.json'), JSON.stringify(chapters, null, 2) + '\n')
  return chapters
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chapters = await prepareContent(projectRoot, process.argv.includes('--strict'))
  console.log(`章節同步完成：${chapters.filter(chapter => chapter.available).length} / 87 章已匯入。`)
}
