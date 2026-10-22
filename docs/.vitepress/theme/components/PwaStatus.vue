<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import AppIcon from './AppIcon.vue'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
const online = ref(true)
const cached = ref(false)
const failed = ref(false)
const supported = ref(true)
const installEvent = ref<InstallEvent>()
const installed = ref(false)
const mounted = ref(false)
let updateTimer: ReturnType<typeof setInterval> | undefined
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onOfflineReady() { cached.value = true },
  onRegisterError() { failed.value = true },
  onRegisteredSW(_url, registration) {
    if (registration) updateTimer = setInterval(() => {
      if (navigator.onLine) void registration.update().catch(() => {})
    }, 60 * 60 * 1000)
  }
})
const label = computed(() => {
  if (!import.meta.env.PROD) return '開發預覽 · 離線功能於正式版啟用'
  if (!supported.value) return '離線功能需使用 HTTPS'
  if (failed.value) return '離線快取失敗，請重新連線後重試'
  if (cached.value) return online.value ? '已可離線閱讀' : '離線閱讀中'
  return online.value ? '正在準備離線內容…' : '尚未完成離線快取'
})
function setOnline() { online.value = navigator.onLine }
function beforeInstall(event: Event) { event.preventDefault(); installEvent.value = event as InstallEvent }
function onInstalled() { installed.value = true; installEvent.value = undefined }
async function install() {
  if (!installEvent.value) return
  await installEvent.value.prompt()
  await installEvent.value.userChoice
  installEvent.value = undefined
}
async function checkExistingCache() {
  // Registration.ready means all atomic precache downloads have completed.
  // Check all 87 chapter documents to avoid trusting a stale localStorage flag.
  if (!('caches' in window)) return
  await navigator.serviceWorker.ready
  const registrations = await navigator.serviceWorker.getRegistration(withBase('/'))
  if (!registrations?.active) return
  const cacheNames = (await caches.keys()).filter(name => name.startsWith('miller-handbook-precache'))
  for (const name of cacheNames) {
    const cache = await caches.open(name)
    const matches = await Promise.all(Array.from({ length: 87 }, (_, index) =>
      cache.match(withBase(`/chapters/ch-${String(index + 1).padStart(2, '0')}.html`), { ignoreSearch: true })))
    if (matches.every(Boolean)) { cached.value = true; break }
  }
}
onMounted(() => {
  mounted.value = true
  setOnline()
  supported.value = window.isSecureContext && 'serviceWorker' in navigator
  installed.value = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  window.addEventListener('beforeinstallprompt', beforeInstall)
  window.addEventListener('appinstalled', onInstalled)
  if (supported.value && import.meta.env.PROD) void checkExistingCache().catch(() => { failed.value = true })
})
onUnmounted(() => {
  clearInterval(updateTimer)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
  window.removeEventListener('beforeinstallprompt', beforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})
</script>

<template>
  <div v-if="mounted" class="pwa-dock">
    <div v-if="needRefresh" class="update-notice" role="status"><p><strong>手冊有新版本</strong><br>更新後將重新載入目前頁面。</p><button class="update-button" @click="updateServiceWorker(true)">立即更新</button><button aria-label="稍後更新" class="dismiss-update" @click="needRefresh = false"><AppIcon name="close" :size="18" /></button></div>
    <div class="offline-status" :class="{ ready: cached, disconnected: !online }" role="status"><AppIcon :name="cached ? 'check' : online ? 'wifi' : 'offline'" :size="15" /><span>{{ label }}</span><button v-if="installEvent && !installed" @click="install">安裝手冊</button><a v-else-if="!installed" :href="withBase('/install')" aria-label="查看安裝到主畫面說明"><AppIcon name="phone" :size="16" /></a></div>
  </div>
</template>
