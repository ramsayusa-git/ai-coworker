<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { CallSession } from '../../api'

defineProps<{ items: CallSession[]; loading?: boolean }>()
const router = useRouter()

function fmt(s: number) {
  if (!s) return '—'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function when(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
</script>

<template>
  <div class="rc">
    <div v-if="loading" class="sks">
      <div v-for="n in 5" :key="n" class="sk shimmer"></div>
    </div>

    <div v-else-if="!items.length" class="empty">
      <strong>No calls yet</strong>
      <p>Recent sessions will appear here.</p>
    </div>

    <ul v-else>
      <li v-for="(c, i) in items" :key="c.id" :style="{ '--i': i }"
          tabindex="0"
          @click="router.push(`/app/sessions/${c.id}`)"
          @keydown.enter="router.push(`/app/sessions/${c.id}`)">
        <span class="dot" :class="c.outcome"></span>
        <div class="who">
          <strong>{{ c.caller || 'unknown' }}</strong>
          <small>{{ c.agent || '—' }} · {{ when(c.started_at) }}</small>
        </div>
        <span class="len">{{ fmt(c.duration_s) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.rc { height: 100%; overflow-y: auto; }
ul { list-style: none; display: grid; gap: .2rem; }
li {
  display: grid; grid-template-columns: 8px 1fr auto; gap: .7rem;
  align-items: center; padding: .55rem .5rem; border-radius: var(--r-sm);
  cursor: pointer; font-size: .85rem;
  animation: fade .4s var(--ease) both; animation-delay: calc(var(--i) * 40ms);
  transition: background var(--fast) var(--ease), transform var(--fast) var(--ease);
}
li:hover, li:focus-visible {
  background: color-mix(in srgb, var(--txt) 5%, transparent);
  transform: translateX(2px);
}
@keyframes fade { from { opacity: 0; transform: translateY(6px); } }

.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mut); }
.dot.completed { background: var(--ok); box-shadow: 0 0 8px color-mix(in srgb, var(--ok) 60%, transparent); }
.dot.transferred { background: var(--acc-2); }
.dot.failed { background: var(--bad); }
.dot.in-progress { background: var(--acc); animation: pulse 1.6s infinite; }
@keyframes pulse { 50% { opacity: .4; } }

.who { min-width: 0; }
.who strong {
  display: block; font-weight: 600; font-family: var(--mono); font-size: .82rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.who small { display: block; color: var(--mut); font-size: .75rem; }
.len { font-family: var(--mono); font-size: .78rem; color: var(--mut); }

.sks { display: grid; gap: .6rem; }
.sk { height: 34px; border-radius: var(--r-sm); }
.empty { height: 100%; display: grid; place-content: center; text-align: center; }
.empty strong { display: block; font-size: .92rem; margin-bottom: .25rem; }
.empty p { font-size: .82rem; color: var(--mut); }
</style>
