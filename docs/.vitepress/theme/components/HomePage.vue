<script setup lang="ts">
import { withBase } from 'vitepress'
import catalog from '../../generated/catalog.json'
import { clinicalSections } from '../../../../scripts/chapter-localization'
import AppIcon from './AppIcon.vue'
const available = catalog.filter(chapter => chapter.available).length
function openSearch() {
  document.querySelector<HTMLButtonElement>('.VPNavBarSearch button')?.click()
}
</script>

<template>
  <main class="handbook-home">
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow"><span class="edition-dot" /> 第 10 版 <span class="eyebrow-divider" /> 繁體中文介面 · 原文閱讀</div>
        <h1>讓臨床知識，<br><span>隨手可及。</span></h1>
        <p class="hero-description">米勒麻醉學臨床手冊<br>從基礎原理到臨床實務，讓每一次查閱都更從容。</p>
        <button class="hero-search" @click="openSearch"><AppIcon name="search" /><span>搜尋章節、醫學名詞或藥物…</span><kbd>⌘ / Ctrl K</kbd><AppIcon name="arrow" /></button>
        <div class="hero-links"><a class="primary-link" :href="withBase('/chapters/')">瀏覽全部章節 <AppIcon name="arrow" :size="17" /></a><a :href="withBase('/install')">安裝到主畫面 <AppIcon name="phone" :size="17" /></a></div>
      </div>
      <div class="book-scene" aria-hidden="true">
        <div class="book-orbit orbit-one" /><div class="book-orbit orbit-two" />
        <div class="reference-book">
          <div class="book-spine" />
          <div class="book-topline">臨 床 參 考 手 冊 <span>10</span></div>
          <div class="book-title">MILLER’S<br><strong>ANESTHESIA</strong></div>
          <div class="book-chinese">米勒麻醉學</div>
          <svg class="book-wave" viewBox="0 0 280 100"><path d="M0 55h55l12-14 13 29 20-57 23 80 18-38h139" /></svg>
          <div class="book-bottom"><span>第十版<br><small>繁體中文臨床手冊</small></span><AppIcon name="book" :size="28" /></div>
        </div>
        <div class="floating-note"><span class="note-icon"><AppIcon name="layers" /></span><span><strong>87 個章節入口</strong><small>你的隨身麻醉學知識庫</small></span></div>
      </div>
    </section>

    <section class="feature-strip" aria-label="手冊特色">
      <div><AppIcon name="book" /><span><strong>完整章節架構</strong><small>第 1–87 章，依序查閱</small></span></div>
      <div><AppIcon name="search" /><span><strong>中英雙語搜尋</strong><small>中文主題、英文全文檢索</small></span></div>
      <div><AppIcon name="download" /><span><strong>支援離線閱讀</strong><small>快取完成後，隨時可用</small></span></div>
      <div><AppIcon name="phone" /><span><strong>為行動閱讀而設計</strong><small>手機、平板與桌面皆適用</small></span></div>
    </section>

    <section class="browse-section">
      <div class="section-heading"><div><div class="section-kicker">從這裡開始</div><h2>依章節探索</h2></div><a :href="withBase('/chapters/')">完整目錄 <AppIcon name="arrow" :size="18" /></a></div>
      <p class="section-description">九大臨床主題，從繁中索引找到英文原文章節。</p>
      <div class="range-grid">
        <a v-for="(section, index) in clinicalSections" :key="section.id" class="range-card" :href="withBase(`/chapters/#${section.id}`)">
          <div class="range-icon"><AppIcon :name="index % 3 === 0 ? 'book' : index % 3 === 1 ? 'layers' : 'list'" /></div>
          <div><span class="range-label">第 {{ index + 1 }} 部分</span><h3>{{ section.title }}</h3><p>{{ section.chapters.length }} 個章節 · {{ section.chapters.filter(number => catalog[number - 1].available).length }} 章已匯入</p></div>
          <AppIcon name="arrow" :size="18" class="range-arrow" />
        </a>
      </div>
    </section>

    <section class="reading-banner"><span class="banner-icon"><AppIcon name="download" :size="30" /></span><div><h2>把手冊，帶在身邊。</h2><p>加入主畫面，等待離線快取完成，即可在沒有網路時閱讀。</p></div><a :href="withBase('/install')">查看安裝步驟 <AppIcon name="arrow" :size="18" /></a></section>
    <footer class="handbook-footer"><span>米勒麻醉學臨床手冊 <span class="footer-dot">·</span> 第 10 版</span><span>{{ available }} / 87 章已匯入 <span class="footer-dot">·</span> {{ available ? '請依原始內容與更新日期核對' : '章節內容待匯入' }}</span></footer>
  </main>
</template>
