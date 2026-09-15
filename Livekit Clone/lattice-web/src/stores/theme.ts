import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'lattice.theme'

export const useTheme = defineStore('theme', () => {
  const choice = ref<ThemeChoice>('system')
  const systemDark = ref(true)

  /** What is actually rendered right now. */
  const effective = computed<'light' | 'dark'>(() =>
    choice.value === 'system' ? (systemDark.value ? 'dark' : 'light') : choice.value)

  function paint() {
    const root = document.documentElement
    root.setAttribute('data-theme', effective.value)
    root.style.colorScheme = effective.value
  }

  function set(next: ThemeChoice) {
    choice.value = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* per-viewer convenience only */
    }
    paint()
  }

  /** Cycle light → dark → system, which is what a single toggle button needs. */
  function cycle() {
    set(choice.value === 'light' ? 'dark' : choice.value === 'dark' ? 'system' : 'light')
  }

  function init() {
    try {
      const saved = localStorage.getItem(KEY) as ThemeChoice | null
      if (saved === 'light' || saved === 'dark' || saved === 'system') choice.value = saved
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = mq.matches
    mq.addEventListener('change', (e) => {
      systemDark.value = e.matches
      if (choice.value === 'system') paint()
    })
    paint()
  }

  return { choice, effective, set, cycle, init }
})
