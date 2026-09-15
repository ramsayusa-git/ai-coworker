<script setup lang="ts">
import { CheckCircle2, AlertCircle, Info, X } from '@lucide/vue'
import { useUI } from '../../stores/ui'

const ui = useUI()
const icons = { success: CheckCircle2, error: AlertCircle, info: Info }
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.kind">
      <component :is="icons[t.kind]" :size="18" />
      <div class="txt">
        <strong>{{ t.title }}</strong>
        <p v-if="t.body">{{ t.body }}</p>
      </div>
      <button @click="ui.dismiss(t.id)" aria-label="Dismiss"><X :size="15" /></button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed; right: 1.2rem; bottom: 1.2rem; z-index: 200;
  display: flex; flex-direction: column; gap: .6rem; max-width: 380px;
}
.toast {
  display: flex; align-items: flex-start; gap: .7rem;
  padding: .85rem 1rem; border-radius: 12px;
  background: #14161f; border: 1px solid var(--line-2, color-mix(in srgb, var(--txt) 16%, transparent));
  box-shadow: 0 16px 40px rgba(0,0,0,.55);
  animation: slideIn .22s ease;
}
.toast.success svg:first-child { color: var(--brand-success, #34d399); }
.toast.error svg:first-child { color: var(--brand-danger, #f87171); }
.toast.info svg:first-child { color: var(--brand-accent, #22d3ee); }
.txt { flex: 1; min-width: 0; }
.txt strong { display: block; font-size: .9rem; margin-bottom: .15rem; }
.txt p { font-size: .84rem; color: var(--mut); line-height: 1.45; }
.toast button { background: none; border: 0; color: var(--mut); padding: 0; }
.toast button:hover { color: var(--txt); }

@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
@media (max-width: 600px) { .toasts { left: 1rem; right: 1rem; max-width: none; } }
</style>
