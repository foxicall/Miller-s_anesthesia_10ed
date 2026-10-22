<script setup lang="ts">
import { useData } from 'vitepress'
const { frontmatter } = useData()
</script>
<template><div v-if="frontmatter.chapter" class="chapter-meta"><span>第 {{ frontmatter.chapter }} 章</span><span>{{ frontmatter.section }}</span><span>{{ frontmatter.available ? '英文原文' : '內容待匯入' }}</span><span>第 10 版</span></div></template>
