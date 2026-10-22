import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import HomePage from './components/HomePage.vue'
import ChapterDirectory from './components/ChapterDirectory.vue'
import PwaStatus from './components/PwaStatus.vue'
import ReadingTools from './components/ReadingTools.vue'
import ChapterMeta from './components/ChapterMeta.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => [h(PwaStatus), h(ReadingTools)],
    'doc-before': () => h(ChapterMeta)
  }),
  enhanceApp({ app }) {
    app.component('HomePage', HomePage)
    app.component('ChapterDirectory', ChapterDirectory)
  }
} satisfies Theme
