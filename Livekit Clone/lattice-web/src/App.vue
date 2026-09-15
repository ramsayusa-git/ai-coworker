<template>
  <div id="app" class="app">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/authStore'
import { useRouter } from 'vue-router'

import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'

const authStore = useAuthStore()
const router = useRouter()

onMounted(() => {
  authStore.initAuth()
  const path = router.currentRoute.value.path
  if (!authStore.isAuthenticated && path.startsWith('/app')) {
    router.replace('/')
  }
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --color-primary: #6d5efc;
  --color-primary-dark: #5a4ae0;
  --color-primary-light: #8b7cff;
  --color-accent: #22d3ee;
  --color-text: #f2f4f8;
  --color-text-light: #9aa2b4;
  --color-bg: #07080d;
  --color-bg-light: #0f111a;
  --color-border: rgba(255, 255, 255, 0.09);
  --color-success: #34d399;
  --color-error: #f87171;
  --color-warning: #fbbf24;
  color-scheme: dark;
}

html {
  font-family: 'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body { background-color: var(--color-bg); }

a { color: var(--color-primary-light); text-decoration: none; transition: color 0.2s; }
a:hover { color: var(--color-accent); }

button { cursor: pointer; font-family: inherit; }

html { scroll-behavior: smooth; }

::selection { background: rgba(109, 94, 252, 0.4); color: #fff; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #0b0d14; }
::-webkit-scrollbar-thumb { background: #262b3a; border-radius: 5px; border: 2px solid #0b0d14; }
::-webkit-scrollbar-thumb:hover { background: #343a4d; }

.app { width: 100%; min-height: 100vh; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.fade-enter-from { opacity: 0; transform: translateY(8px); }
.fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .fade-enter-active, .fade-leave-active { transition: none; }
}
</style>
