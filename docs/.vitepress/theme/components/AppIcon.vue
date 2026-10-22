<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  book: 'M12 5v16m0-16C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-4-2-7-1-10 1Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',
  check: 'm5 12 4 4L19 6',
  wifi: 'M2 8c6-6 14-6 20 0M5 12c4-4 10-4 14 0m-11 4c2-2 4-2 6 0m-3 4h.01',
  offline: 'm3 3 18 18M2 8c2-2 4-3 6-3m4-1c4 0 7 1 10 4M5 12c2-2 4-3 7-3m4 1 3 2m-11 4c2-2 4-2 6 0m-3 4h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  up: 'm6 14 6-6 6 6',
  close: 'm6 6 12 12M6 18 18 6',
  shield: 'm12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Zm-4 9 3 3 5-6',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5'
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.book" /></svg>
</template>
