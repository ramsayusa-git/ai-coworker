import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  body?: string
}

let seq = 0

export const useUI = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const sidebarOpen = ref(true)
  const paletteOpen = ref(false)

  function toast(kind: Toast['kind'], title: string, body?: string) {
    const t: Toast = { id: ++seq, kind, title, body }
    toasts.value.push(t)
    setTimeout(() => dismiss(t.id), kind === 'error' ? 8000 : 4000)
    return t.id
  }

  const success = (title: string, body?: string) => toast('success', title, body)
  const error = (title: string, body?: string) => toast('error', title, body)
  const info = (title: string, body?: string) => toast('info', title, body)

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
    try {
      localStorage.setItem('lattice.sidebar', sidebarOpen.value ? '1' : '0')
    } catch {
      /* per-viewer convenience only */
    }
  }

  function restoreSidebar() {
    try {
      const v = localStorage.getItem('lattice.sidebar')
      if (v !== null) sidebarOpen.value = v === '1'
    } catch {
      /* ignore */
    }
  }

  return {
    toasts, sidebarOpen, paletteOpen,
    toast, success, error, info, dismiss, toggleSidebar, restoreSidebar,
  }
})
