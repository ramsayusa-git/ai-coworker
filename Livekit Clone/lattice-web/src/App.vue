<template>
  <div id="app" class="app">
    <!-- DEBUG INFO -->
    <div v-if="showDebug" class="debug-bar">
      <div class="debug-content">
        <span>Auth: {{ authStore.isAuthenticated ? '✅' : '❌' }} | Token: {{ authStore.token ? '✅' : '❌' }} | User: {{ authStore.user ? '✅' : '❌' }} | Route: {{ $route.name }}</span>
        <button @click="clearAndReload">CLEAR ALL</button>
      </div>
    </div>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from './stores/authStore'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()
const showDebug = ref(true)

const clearAndReload = () => {
  console.log('🧹 Manual clear triggered')
  localStorage.clear()
  sessionStorage.clear()
  window.location.href = '/'
}

onMounted(() => {
  console.log('🚀 App.vue mounted - AGGRESSIVE CLEAR MODE')

  // ALWAYS clear auth on app load - no persistence
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')

  authStore.initAuth()
  console.log('📊 Auth state:', {
    isAuthenticated: authStore.isAuthenticated,
    route: router.currentRoute.value.name
  })

  // If not authenticated and on protected route, FORCE to landing
  const path = router.currentRoute.value.path
  if (!authStore.isAuthenticated && path !== '/' && path !== '/login' && path !== '/signup') {
    console.log('🚨 BLOCKING: Protected route, forcing to landing')
    router.replace('/')
  }
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --color-primary: #6366f1;
  --color-primary-dark: #4f46e5;
  --color-primary-light: #818cf8;
  --color-text: #1f2937;
  --color-text-light: #6b7280;
  --color-bg: #ffffff;
  --color-bg-light: #f9fafb;
  --color-border: #e5e7eb;
  --color-success: #10b981;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #818cf8;
    --color-primary-dark: #6366f1;
    --color-primary-light: #a5b4fc;
    --color-text: #f3f4f6;
    --color-text-light: #d1d5db;
    --color-bg: #111827;
    --color-bg-light: #1f2937;
    --color-border: #374151;
  }
}

html {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-bg);
}

body {
  background-color: var(--color-bg);
}

a {
  color: var(--color-primary);
  text-decoration: none;
  transition: color 0.2s;
}

a:hover {
  color: var(--color-primary-dark);
}

button {
  cursor: pointer;
  font-family: inherit;
}

.app {
  width: 100%;
  height: 100vh;
}
</style>
