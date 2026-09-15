import { defineStore } from 'pinia'
import { ref } from 'vue'

/** One placed widget. x/y/w/h are gridstack cells (12-column grid). */
export interface WidgetNode {
  id: string          // instance id
  type: string        // key into the widget registry
  x: number
  y: number
  w: number
  h: number
}

const KEY = 'lattice.dashboard.layout.v1'

export const DEFAULT_LAYOUT: WidgetNode[] = [
  { id: 'w-calls', type: 'stat-calls', x: 0, y: 0, w: 3, h: 2 },
  { id: 'w-mins', type: 'stat-minutes', x: 3, y: 0, w: 3, h: 2 },
  { id: 'w-ttfb', type: 'stat-ttfb', x: 6, y: 0, w: 3, h: 2 },
  { id: 'w-cost', type: 'stat-cost', x: 9, y: 0, w: 3, h: 2 },
  { id: 'w-volume', type: 'call-volume', x: 0, y: 2, w: 8, h: 5 },
  { id: 'w-outcomes', type: 'outcomes', x: 8, y: 2, w: 4, h: 5 },
  { id: 'w-agents', type: 'top-agents', x: 0, y: 7, w: 6, h: 5 },
  { id: 'w-recent', type: 'recent-calls', x: 6, y: 7, w: 6, h: 5 },
]

export const useLayout = defineStore('layout', () => {
  const nodes = ref<WidgetNode[]>([])
  const editing = ref(false)
  const dirty = ref(false)

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) {
          nodes.value = parsed
          return
        }
      }
    } catch {
      /* fall through to the default */
    }
    nodes.value = DEFAULT_LAYOUT.map((n) => ({ ...n }))
  }

  function save(next: WidgetNode[]) {
    nodes.value = next
    dirty.value = false
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* layout is a per-viewer convenience; losing it is not fatal */
    }
  }

  function reset() {
    nodes.value = DEFAULT_LAYOUT.map((n) => ({ ...n }))
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }

  function add(type: string) {
    const id = `w-${type}-${Date.now().toString(36)}`
    const maxY = nodes.value.reduce((m, n) => Math.max(m, n.y + n.h), 0)
    nodes.value = [...nodes.value, { id, type, x: 0, y: maxY, w: 4, h: 4 }]
    dirty.value = true
  }

  function remove(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id)
    dirty.value = true
  }

  return { nodes, editing, dirty, load, save, reset, add, remove }
})
