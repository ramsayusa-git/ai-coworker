<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'

const props = defineProps<{
  label: string
  value: number | null
  unit?: string
  prefix?: string
  decimals?: number
  icon?: any
  tone?: 'acc' | 'ok' | 'warn' | 'bad'
  loading?: boolean
  spark?: number[]
}>()

// Count-up. Jumps straight to the target when the tab is hidden, because rAF
// is frozen there and a half-finished animation would show a wrong number.
const shown = ref<number>(props.value ?? 0)

function animateTo(target: number) {
  const from = shown.value
  if (document.hidden || from === target) {
    shown.value = target
    return
  }
  const start = performance.now()
  const dur = 650
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / dur)
    shown.value = from + (target - from) * (1 - Math.pow(1 - p, 3))
    if (p < 1) requestAnimationFrame(step)
    else shown.value = target
  }
  requestAnimationFrame(step)
}

watch(() => props.value, (v) => { if (v !== null && v !== undefined) animateTo(v) })
onMounted(() => { if (props.value !== null && props.value !== undefined) shown.value = props.value })

const text = computed(() => {
  if (props.value === null || props.value === undefined) return '—'
  const n = props.decimals
    ? shown.value.toFixed(props.decimals)
    : Math.round(shown.value).toLocaleString()
  return `${props.prefix ?? ''}${n}`
})

const peak = computed(() => Math.max(1, ...(props.spark ?? [0])))
const uid = Math.random().toString(36).slice(2, 8)
const points = computed(() => {
  const s = props.spark
  if (!s || s.length < 2) return ''
  const w = 100, h = 28
  return s.map((v, i) => `${(i / (s.length - 1)) * w},${h - (v / peak.value) * h}`).join(' ')
})
</script>

<template>
  <div class="stat" :class="tone || 'acc'">
    <div class="top">
      <span class="ic" v-if="icon"><component :is="icon" :size="16" :stroke-width="2.2" /></span>
      <span class="label">{{ label }}</span>
    </div>

    <div class="val" :class="{ dim: loading }">
      {{ text }}<small v-if="unit && value !== null">{{ unit }}</small>
    </div>

    <svg v-if="points" class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="`sg-${uid}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity=".35" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon :points="`0,28 ${points} 100,28`" :fill="`url(#sg-${uid})`" />
      <polyline :points="points" fill="none" stroke="currentColor"
                stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  </div>
</template>

<style scoped>
.stat { display: flex; flex-direction: column; height: 100%; gap: .35rem; }
.top { display: flex; align-items: center; gap: .5rem; }
.ic {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px;
  background: color-mix(in srgb, currentColor 16%, transparent);
}
.label { font-size: .8rem; color: var(--mut); font-weight: 500; }

.val {
  font-size: clamp(1.4rem, 3.2vw, 2rem); font-weight: 750; letter-spacing: -.03em;
  font-family: var(--mono); color: var(--txt); line-height: 1.1; margin-top: auto;
  transition: opacity var(--fast) var(--ease);
}
.val.dim { opacity: .35; }
.val small { font-size: .55em; margin-left: 2px; color: var(--mut); font-weight: 600; }

.spark { width: 100%; height: 30px; display: block; }

.stat.acc { color: var(--acc); }
.stat.ok { color: var(--ok); }
.stat.warn { color: var(--warn); }
.stat.bad { color: var(--bad); }
</style>
