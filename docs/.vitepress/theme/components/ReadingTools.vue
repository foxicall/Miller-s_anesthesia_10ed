<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useData } from 'vitepress'
import AppIcon from './AppIcon.vue'
const route = useRoute()
const { frontmatter } = useData()
const headings = ref<{ id: string; text: string; level: number }[]>([])
const dialog = ref<HTMLDialogElement>()
const trigger = ref<HTMLButtonElement>()
const scrolled = ref(false)
let observer: MutationObserver | undefined
function collect() {
  headings.value = Array.from(document.querySelectorAll<HTMLHeadingElement>('.vp-doc h2[id], .vp-doc h3[id]')).map(node => ({ id: node.id, text: node.textContent?.replace(/\s*#\s*$/, '').trim() || '', level: Number(node.tagName[1]) }))
}
function scroll() { scrolled.value = window.scrollY > 320 }
function close() { dialog.value?.close(); trigger.value?.focus() }
function open() { collect(); dialog.value?.showModal() }
function top() { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
watch(() => route.path, async () => { close(); await nextTick(); collect() })
onMounted(() => {
  collect(); scroll()
  window.addEventListener('scroll', scroll, { passive: true })
  observer = new MutationObserver(collect)
  const main = document.querySelector('#VPContent')
  if (main) observer.observe(main, { subtree: true, childList: true })
})
onUnmounted(() => { window.removeEventListener('scroll', scroll); observer?.disconnect() })
</script>

<template>
  <div class="reading-tools" v-if="frontmatter.layout !== 'page' || scrolled">
    <button v-if="headings.length && frontmatter.layout !== 'page'" ref="trigger" class="outline-trigger" @click="open" aria-haspopup="dialog"><AppIcon name="list" :size="19" /><span>章節導覽</span></button>
    <button v-if="scrolled" class="top-trigger" @click="top" aria-label="快速回到頂部"><AppIcon name="up" :size="20" /></button>
  </div>
  <dialog ref="dialog" class="outline-dialog" aria-labelledby="outline-title" @click="event => { if (event.target === dialog) close() }">
    <div class="outline-dialog-header"><h2 id="outline-title">章節導覽</h2><button @click="close" aria-label="關閉大綱"><AppIcon name="close" /></button></div>
    <nav aria-label="本頁大綱"><a v-for="heading in headings" :key="heading.id" :class="{ nested: heading.level === 3 }" :href="`#${encodeURIComponent(heading.id)}`" @click="close">{{ heading.text }}</a></nav>
  </dialog>
</template>
