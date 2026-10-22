import { defineConfig } from 'vitepress'
import { withPwa } from '@vite-pwa/vitepress'
import { prepareContent, projectRoot } from '../../scripts/prepare-content'
import { tokenizeChinese } from '../../scripts/search'
import { clinicalSections } from '../../scripts/chapter-localization'
import { compressSearchIndex } from '../../scripts/compress-search'
import path from 'node:path'

// Both `dev` and `build` ingest output_md, even when invoked without npm scripts.
const chapters = await prepareContent()
const base = process.env.BASE_PATH || '/'
if (!/^\/(?:[^?#]*\/)?$/.test(base)) throw new Error('BASE_PATH 必須以 / 開頭及結尾，例如 /miller/。')
const groups = clinicalSections.map((section, index) => {
  return {
    text: section.label, collapsed: index !== 0,
    items: section.chapters.map(number => chapters[number - 1]).map(chapter => ({
      text: `${String(chapter.number).padStart(2, '0')} · ${chapter.title}${chapter.available ? '' : '（待匯入）'}`,
      link: chapter.link
    }))
  }
})

export default withPwa(defineConfig({
  lang: 'zh-Hant-TW',
  title: '米勒麻醉學',
  description: "Miller's Anesthesia 10th Edition 繁體中文臨床參考電子手冊",
  base,
  cleanUrls: false,
  lastUpdated: false,
  head: [
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: '米勒麻醉學' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}icons/favicon.svg` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}icons/apple-touch-icon.png` }]
  ],
  themeConfig: {
    logo: { src: '/icons/favicon.svg', alt: '' },
    siteTitle: '米勒麻醉學',
    nav: [
      { text: '首頁', link: '/' },
      { text: '章節目錄', link: '/chapters/', activeMatch: '/chapters/' },
      { text: '安裝 App', link: '/install' },
      { text: '使用說明', link: '/guide' }
    ],
    sidebar: { '/chapters/': [{ text: '章節總覽', link: '/chapters/' }, ...groups] },
    outline: { level: [2, 3], label: '本頁大綱' },
    sidebarMenuLabel: '目錄',
    returnToTopLabel: '快速回到頂部',
    darkModeSwitchLabel: '外觀模式',
    darkModeSwitchTitle: '切換為深色模式',
    lightModeSwitchTitle: '切換為淺色模式',
    docFooter: { prev: '上一章', next: '下一章' },
    langMenuLabel: '語言',
    skipToContentLabel: '跳至主要內容',
    notFound: { code: '404', title: '找不到此頁面', quote: '這個章節連結可能已經變更，請回到目錄繼續閱讀。', linkLabel: '返回首頁', linkText: '返回首頁' },
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: { tokenize: tokenizeChinese },
          searchOptions: { combineWith: 'AND', prefix: true, fuzzy: false }
        },
        translations: {
          button: { buttonText: '搜尋中文主題或英文關鍵字…', buttonAriaLabel: '搜尋章節與關鍵字' },
          modal: {
            displayDetails: '顯示詳細內容', resetButtonTitle: '清除搜尋',
            backButtonTitle: '關閉搜尋', noResultsText: '找不到相關內容：',
            footer: { selectText: '開啟', selectKeyAriaLabel: '輸入鍵', navigateText: '選擇', navigateUpKeyAriaLabel: '上方向鍵', navigateDownKeyAriaLabel: '下方向鍵', closeText: '關閉', closeKeyAriaLabel: '跳脫鍵' }
          }
        }
      }
    }
  },
  markdown: {
    lineNumbers: false, codeCopyButtonTitle: '複製程式碼',
    config(md) {
      const image = md.renderer.rules.image!
      md.renderer.rules.image = (tokens, index, options, env, self) => {
        tokens[index].attrSet('loading', 'lazy')
        tokens[index].attrSet('decoding', 'async')
        return image(tokens, index, options, env, self)
      }
    }
  },
  vite: {
    plugins: [compressSearchIndex(), {
      // VitePress 1.6 has some accessibility labels without translation options.
      // Transform its Vue sources so SSR and hydration use the same zh-TW labels.
      name: 'localize-default-theme-labels',
      enforce: 'pre',
      transform(code, id) {
        if (!/\/theme-default\/components\/(VPNavBarHamburger|VPNavBarExtra|VPSidebarItem|VPNavBarMenu|VPSidebar)\.vue(?:\?|$)/.test(id)) return
        return code.replace('aria-label="mobile navigation"', 'aria-label="開啟導覽選單"')
          .replace('label="extra navigation"', 'label="更多導覽選項"')
          .replace('aria-label="toggle section"', 'aria-label="展開或收合章節群組"')
          .replace('Main Navigation', '主要導覽')
          .replace('Sidebar Navigation', '章節導覽')
      }
    }, {
      name: 'watch-source-chapters',
      configureServer(server) {
        const input = path.join(projectRoot, 'output_md') + path.sep
        server.watcher.add(input)
        let timer: ReturnType<typeof setTimeout> | undefined
        const onChange = (file: string) => {
          if (!path.resolve(file).startsWith(input)) return
          clearTimeout(timer)
          timer = setTimeout(() => void server.restart(), 200)
        }
        server.watcher.on('all', (_event, file) => onChange(file))
        server.httpServer?.once('close', () => clearTimeout(timer))
      }
    }]
  },
  pwa: {
    // The hosted Site is private; fetch its manifest with the signed-in session.
    useCredentials: true,
    registerType: 'prompt',
    injectRegister: false,
    manifestFilename: 'manifest.webmanifest',
    includeAssets: ['icons/*'],
    manifest: {
      id: base,
      name: "米勒麻醉學 (Miller's Anesthesia 10e)",
      short_name: '米勒麻醉學',
      description: "Miller's Anesthesia 10th Edition 繁體中文臨床參考電子手冊",
      lang: 'zh-Hant-TW', dir: 'ltr',
      start_url: base, scope: base,
      display: 'standalone',
      background_color: '#ffffff', theme_color: '#0f172a',
      icons: [
        { src: `${base}icons/pwa-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}icons/pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}icons/maskable-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      cacheId: 'miller-handbook',
      // Precache every emitted page, async chapter/search chunk, font and attachment.
      globPatterns: ['**/*.{html,js,css,json,png,jpg,jpeg,gif,webp,avif,svg,ico,woff,woff2,pdf,mp4,webm,mp3,ogg,wav,webmanifest}'],
      maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      navigateFallback: undefined,
      clientsClaim: true,
      skipWaiting: false,
      // Workbox resolves / and /chapters/ to their precached index.html.
      directoryIndex: 'index.html'
    },
    devOptions: { enabled: false }
  }
}))
