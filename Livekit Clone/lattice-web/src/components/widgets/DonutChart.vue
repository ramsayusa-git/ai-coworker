<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  data: Record<string, number>
  loading?: boolean
}>()

// Categorical palette — distinguishable in both themes, not just hue-shifted.
const COLORS: Record<string, string> = {
  completed: 'var(--ok)',
  transferred: 'var(--acc-2)',
  'no-answer': 'var(--mut)',
  failed: 'var(--bad)',
  'in-progress': 'var(--acc)',
}
const FALLBACK = ['var(--acc)', 'var(--acc-2)', 'var(--acc-3)', 'var(--warn)', 'var(--mut)']

const hover = ref<string | null>(null)
const entries = computed(() => Object.entries(props.data ?? {}))
const total = computed(() => entries.value.reduce((a, [, n]) => a + n, 0))

const R = 42
const CIRC = 2 * Math.PI * R

const arcs = computed(() => {
  let offset = 0
  return entries.value.map(([name, n], i) => {
    const frac = total.value ? n / total.value : 0
    const arc = {
      name,
      n,
      pct: Math.round(frac * 100),
      color: COLORS[name] ?? FALLBACK[i % FALLBACK.length],
      dash: `${frac * CIRC} ${CIRC}`,
      offset: -offset * CIRC,
    }
    offset += frac
    return arc
  })
})
</script>

<template>
  <div class="donut">
    <div v-if="loading" class="sk shimmer"></div>
    <div v-else-if="!total" class="empty">
      <strong>Nothing to break down</strong>
    </div>

    <template v-else>
      <div class="ring">
        <svg viewBox="0 0 100 100" role="img" aria-label="Call outcomes">
          <circle cx="50" cy="50" :r="R" class="track" />
          <circle
            v-for="a in arcs"
            :key="a.name"
            cx="50" cy="50" :r="R"
            class="arc"
            :class="{ dim: hover && hover !== a.name }"
            :stroke="a.color"
            :stroke-dasharray="a.dash"
            :stroke-dashoffset="a.offset"
            @mouseenter="hover = a.name"
            @mouseleave="hover = null"
          />
        </svg>
        <div class="center">
          <strong>{{ hover ? (data[hover] ?? 0).toLocaleString() : total.toLocaleString() }}</strong>
          <span>{{ hover || 'calls' }}</span>
        </div>
      </div>

      <ul class="legend">
        <li v-for="a in arcs" :key="a.name"
            :class="{ dim: hover && hover !== a.name }"
            @mouseenter="hover = a.name" @mouseleave="hover = null">
          <span class="dot" :style="{ background: a.color }"></span>
          <span class="nm">{{ a.name }}</span>
          <span class="pc">{{ a.pct }}%</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.donut { display: flex; flex-direction: column; height: 100%; gap: .8rem; }
.ring { position: relative; display: grid; place-items: center; flex: 1; min-height: 120px; }
svg { width: 100%; max-width: 168px; height: auto; transform: rotate(-90deg); }
.track { fill: none; stroke: var(--line); stroke-width: 11; }
.arc {
  fill: none; stroke-width: 11; stroke-linecap: round;
  transition: opacity var(--fast) var(--ease), stroke-width var(--fast) var(--ease);
  cursor: pointer;
  animation: draw .7s var(--ease) both;
}
.arc:hover { stroke-width: 13; }
.arc.dim { opacity: .28; }
@keyframes draw { from { stroke-dasharray: 0 999; } }

.center {
  position: absolute; display: flex; flex-direction: column;
  align-items: center; pointer-events: none;
}
.center strong { font-size: 1.35rem; font-weight: 750; font-family: var(--mono); letter-spacing: -.02em; }
.center span { font-size: .74rem; color: var(--mut); text-transform: capitalize; }

.legend { list-style: none; display: grid; gap: .4rem; }
.legend li {
  display: grid; grid-template-columns: 10px 1fr auto; gap: .55rem;
  align-items: center; font-size: .82rem; cursor: pointer;
  transition: opacity var(--fast) var(--ease);
}
.legend li.dim { opacity: .4; }
.dot { width: 9px; height: 9px; border-radius: 50%; }
.nm { color: var(--mut); text-transform: capitalize; }
.pc { font-family: var(--mono); font-size: .78rem; }

.sk { flex: 1; border-radius: var(--r-sm); }
.empty { flex: 1; display: grid; place-content: center; text-align: center; font-size: .9rem; }
</style>
