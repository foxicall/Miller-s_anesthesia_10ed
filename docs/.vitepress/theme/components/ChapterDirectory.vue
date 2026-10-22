<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import catalog from '../../generated/catalog.json'
import { clinicalSections } from '../../../../scripts/chapter-localization'
import AppIcon from './AppIcon.vue'
const query = ref('')
const onlyAvailable = ref(false)
const count = catalog.filter(chapter => chapter.available).length
const summaryCount = catalog.filter(chapter => chapter.hasSummary).length
const groups = computed(() => clinicalSections.map(section => {
  return { ...section, chapters: section.chapters.map(number => catalog[number - 1]).filter(chapter =>
    (!onlyAvailable.value || chapter.available) && `${chapter.number} ${chapter.title} ${chapter.originalTitle} ${chapter.keywords.join(' ')} ${chapter.sectionTitle}`.toLowerCase().includes(query.value.trim().toLowerCase())) }
}).filter(group => group.chapters.length))
</script>

<template>
  <main class="directory-page">
    <a class="back-link" :href="withBase('/')">首頁 / 章節目錄</a>
    <div class="directory-heading"><div><div class="section-kicker">第十版 · 章節索引</div><h1>章節目錄</h1><p>87 個章節入口，讓查閱更有方向。</p></div><span class="count-badge">{{ count }} / 87 章已匯入</span></div>
    <p v-if="summaryCount" class="chapter-summary-count">{{ summaryCount }} / 87 章附繁中臨床摘要，可由摘要頁碼回查英文原文。</p>
    <div class="directory-controls"><label class="chapter-filter"><AppIcon name="search" /><input v-model="query" type="search" placeholder="篩選章號或章節名稱…" aria-label="篩選章號或章節名稱"></label><label class="available-filter"><input v-model="onlyAvailable" type="checkbox">只顯示已匯入章節</label></div>
    <nav class="range-nav" aria-label="臨床主題分類"><a v-for="group in groups" :key="group.id" :href="`#${group.id}`">{{ group.title }}</a></nav>
    <div v-if="!count" class="content-notice"><AppIcon name="book" /><p><strong>章節架構已就緒，內容待匯入。</strong><br>目前未提供原始章節；下列入口將在匯入 Markdown 後自動更新。</p></div>
    <p v-if="!groups.length" class="empty-results" role="status">沒有符合條件的章節。請調整關鍵字或取消篩選。</p>
    <section v-for="group in groups" :id="group.id" :key="group.id" class="chapter-group"><h2>{{ group.label }} <span>{{ group.chapters.length }} 個章節</span></h2><div class="chapter-list"><a v-for="chapter in group.chapters" :key="chapter.number" :href="withBase(chapter.link)" class="chapter-row"><span class="chapter-number">{{ String(chapter.number).padStart(2, '0') }}</span><span class="chapter-row-title">{{ chapter.title }}<small lang="en">{{ chapter.originalTitle || '內容待匯入' }}</small></span><span class="chapter-state" :class="{ imported: chapter.available }">{{ chapter.hasSummary ? '含臨床摘要' : chapter.available ? '可閱讀' : '待匯入' }}</span><AppIcon name="arrow" :size="18" /></a></div></section>
    <footer class="handbook-footer"><span>依臨床主題分類，章號沿用原書。</span><a :href="withBase('/guide')">使用說明</a></footer>
  </main>
</template>
