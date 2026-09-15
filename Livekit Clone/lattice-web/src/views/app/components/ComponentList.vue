<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Play, Square, RotateCw, ArrowUp, Undo2, Download, Cpu } from '@lucide/vue'
import { Components } from '../../../api'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'

const auth = useAuth()
const ui = useUI()

const tab = ref<'installed' | 'store'>('installed')
const installed = ref<any[]>([])
const store = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref<string>('')

/** aetosd may return a bare array or {components:[…]} — accept both. */
function normalise(x: any): any[] {
  if (Array.isArray(x)) return x
  if (Array.isArray(x?.components)) return x.components
  if (Array.isArray(x?.items)) return x.items
  if (x && typeof x === 'object') {
    return Object.entries(x).map(([name, v]: any) =>
      typeof v === 'object' ? { name, ...v } : { name, state: String(v) })
  }
  return []
}

/** Liveness, wherever the payload happens to carry it. */
function stateOf(c: any): string {
  const s = c?.health?.state ?? c?.state ?? c?.status ?? ''
  return String(s).toLowerCase() || 'unknown'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    installed.value = normalise(await Components.installed())
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
  try {
    store.value = normalise(await Components.store())
  } catch {
    store.value = []
  }
}

async function act(name: string, action: string) {
  if (action === 'rollback' && !confirm(`Roll ${name} back to its previous version?`)) return
  busy.value = `${name}:${action}`
  try {
    await Components.action(name, action)
    ui.success(`${action} requested`, name)
    await load()
  } catch (e: any) {
    ui.error(`Could not ${action} ${name}`, e.message)
  } finally {
    busy.value = ''
  }
}

const canManage = computed(() => auth.isPlatform && auth.can('admin'))
onMounted(load)
</script>

<template>
  <div>
    <div class="tabs">
      <button :class="{ on: tab === 'installed' }" @click="tab = 'installed'">
        Installed <small>{{ installed.length }}</small>
      </button>
      <button :class="{ on: tab === 'store' }" @click="tab = 'store'">
        Store <small>{{ store.length }}</small>
      </button>
    </div>

    <p v-if="!canManage" class="note">
      Components are host-wide infrastructure. Only the platform tenant can start,
      stop or upgrade them — you are viewing in read-only mode.
    </p>

    <div v-if="loading" class="grid">
      <div v-for="n in 4" :key="n" class="card sk"></div>
    </div>

    <div v-else-if="error" class="err">
      <strong>Could not reach the supervisor</strong>
      <p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <template v-else-if="tab === 'installed'">
      <div v-if="!installed.length" class="empty">
        <strong>No components installed</strong>
        <p>Providers appear here once aetosd has them registered.</p>
      </div>
      <div v-else class="grid">
        <article v-for="c in installed" :key="c.name" class="card">
          <header>
            <span class="ic"><Cpu :size="17" /></span>
            <div>
              <h3>{{ c.name }}</h3>
              <small>{{ c.version || c.installed || '—' }}</small>
            </div>
            <!-- The core reports liveness as health:{state,detail}. Reading a
                 flat c.state made every component say "unknown" while they
                 were all running. -->
            <span class="state" :class="stateOf(c)" :title="c.health?.detail || ''">
              {{ stateOf(c) }}
            </span>
          </header>

          <dl v-if="c.cpu || c.mem || c.memory">
            <div v-if="c.cpu"><dt>CPU</dt><dd>{{ c.cpu }}</dd></div>
            <div v-if="c.mem || c.memory"><dt>Memory</dt><dd>{{ c.mem || c.memory }}</dd></div>
          </dl>

          <div v-if="canManage" class="acts">
            <button @click="act(c.name, 'start')" :disabled="!!busy" title="Start">
              <Play :size="14" />
            </button>
            <button @click="act(c.name, 'stop')" :disabled="!!busy" title="Stop">
              <Square :size="14" />
            </button>
            <button @click="act(c.name, 'restart')" :disabled="!!busy" title="Restart">
              <RotateCw :size="14" />
            </button>
            <button @click="act(c.name, 'upgrade')" :disabled="!!busy" title="Upgrade">
              <ArrowUp :size="14" />
            </button>
            <button class="danger" @click="act(c.name, 'rollback')" :disabled="!!busy" title="Roll back">
              <Undo2 :size="14" />
            </button>
          </div>
        </article>
      </div>
    </template>

    <template v-else>
      <div v-if="!store.length" class="empty">
        <strong>The store is empty</strong>
        <p>No additional components are offered by this installation.</p>
      </div>
      <div v-else class="grid">
        <article v-for="c in store" :key="c.name" class="card">
          <header>
            <span class="ic"><Download :size="17" /></span>
            <div>
              <h3>{{ c.name }}</h3>
              <small>{{ c.version || 'latest' }}</small>
            </div>
          </header>
          <p v-if="c.description" class="desc">{{ c.description }}</p>
          <div v-if="canManage" class="acts">
            <button class="wide" @click="act(c.name, 'install')" :disabled="!!busy">
              <Download :size="14" /> Install
            </button>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: .4rem; margin-bottom: 1.1rem; }
.tabs button {
  padding: .5rem .9rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.tabs button.on { background: rgba(109,94,252,.18); color: #fff; border-color: rgba(109,94,252,.45); }
.tabs button small { opacity: .6; margin-left: .25rem; }

.note {
  padding: .7rem .9rem; margin-bottom: 1rem; border-radius: 9px; font-size: .85rem;
  background: rgba(34,211,238,.09); border: 1px solid rgba(34,211,238,.25);
  color: var(--mut);
}

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
.card {
  padding: 1.1rem; border-radius: 12px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: var(--panel-solid);
}
.card.sk {
  height: 150px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--txt) 4%, transparent), color-mix(in srgb, var(--txt) 9%, transparent), color-mix(in srgb, var(--txt) 4%, transparent));
  background-size: 200% 100%; animation: shimmer 1.3s linear infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

.card header { display: flex; align-items: center; gap: .7rem; margin-bottom: .9rem; }
.ic {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px;
  background: rgba(109,94,252,.16); color: var(--brand-accent, #22d3ee); flex-shrink: 0;
}
.card h3 { font-size: .93rem; font-weight: 650; font-family: var(--brand-mono, ui-monospace), monospace; }
.card header small { font-size: .77rem; color: var(--mut); }
.state {
  margin-left: auto; padding: .2rem .5rem; border-radius: 999px;
  font-size: .72rem; font-weight: 650; text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.state.running, .state.online, .state.active, .state.ready {
  background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok);
}
.state.stopped, .state.failed, .state.down, .state.timeout {
  background: color-mix(in srgb, var(--bad) 16%, transparent); color: var(--bad);
}
.state.starting, .state.warmup {
  background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn);
}

dl { display: flex; gap: 1.2rem; margin-bottom: .9rem; }
dt { font-size: .73rem; color: var(--mut); }
dd { font-size: .86rem; font-family: var(--brand-mono, ui-monospace), monospace; }
.desc { font-size: .85rem; color: var(--mut); line-height: 1.5; margin-bottom: .9rem; }

.acts { display: flex; gap: .3rem; }
.acts button {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 7px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.acts button.wide {
  width: auto; flex: 1; gap: .4rem; display: inline-flex; align-items: center;
  justify-content: center; font-size: .85rem; font-family: inherit; font-weight: 600;
  color: var(--txt);
}
.acts button:hover:not(:disabled) { background: color-mix(in srgb, var(--txt) 9%, transparent); color: var(--txt); }
.acts button:disabled { opacity: .4; cursor: not-allowed; }
.acts button.danger:hover:not(:disabled) { color: var(--brand-danger, #f87171); }

.empty, .err {
  padding: 2.5rem; text-align: center; border-radius: 12px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: var(--panel-solid);
}
.err { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.07); }
.err strong { color: var(--brand-danger, #f87171); }
.empty strong, .err strong { display: block; margin-bottom: .3rem; }
.empty p, .err p { color: var(--mut); font-size: .87rem; margin-bottom: 1rem; }
.err button {
  padding: .5rem 1.1rem; border: 0; border-radius: 8px;
  background: var(--brand-primary, #6d5efc); color: #fff; font-weight: 600;
}
@media (prefers-reduced-motion: reduce) { .card.sk { animation: none; } }
</style>
