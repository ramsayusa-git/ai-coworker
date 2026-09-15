<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Save, Play, Pause, Workflow } from '@lucide/vue'
import { Agents, Sessions, type Agent, type CallSession } from '../../../api'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const ui = useUI()

const agent = ref<Agent | null>(null)
const recent = ref<CallSession[]>([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)

const draft = ref({ name: '', prompt: '', tools: '' })
const dirty = computed(() => {
  const a = agent.value
  if (!a) return false
  return draft.value.name !== a.name ||
    draft.value.prompt !== a.prompt ||
    draft.value.tools !== (a.tools || []).join(', ')
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const a = await Agents.get(route.params.id as string)
    agent.value = a
    draft.value = { name: a.name, prompt: a.prompt, tools: (a.tools || []).join(', ') }
    const page = await Sessions.list({ agent_id: a.id, limit: 8 })
    recent.value = page.items
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!agent.value || !dirty.value) return
  saving.value = true
  try {
    const updated = await Agents.patch(agent.value.id, {
      name: draft.value.name.trim(),
      prompt: draft.value.prompt,
      tools: draft.value.tools.split(',').map((t) => t.trim()).filter(Boolean),
    })
    agent.value = { ...agent.value, ...updated }
    ui.success('Agent saved')
  } catch (e: any) {
    ui.error('Could not save', e.message)
  } finally {
    saving.value = false
  }
}

async function toggle() {
  if (!agent.value) return
  const action = agent.value.status === 'online' ? 'pause' : 'publish'
  try {
    const u = await Agents.action(agent.value.id, action)
    agent.value = { ...agent.value, ...u }
    ui.success(action === 'publish' ? 'Published' : 'Paused')
  } catch (e: any) {
    ui.error('Could not update', e.message)
  }
}

onMounted(load)
</script>

<template>
  <div>
    <button class="back" @click="router.push('/app/agents')">
      <ArrowLeft :size="15" /> All agents
    </button>

    <div v-if="loading" class="sk"></div>

    <div v-else-if="error" class="err">
      <strong>Could not load this agent</strong>
      <p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <template v-else-if="agent">
      <div class="head">
        <div>
          <h2>{{ agent.name }}</h2>
          <span class="pill" :class="agent.status">{{ agent.status }}</span>
          <span class="kind">{{ agent.kind }}</span>
        </div>
        <div class="head-acts">
          <button v-if="auth.can('admin')"
                  @click="router.push(`/app/agents/${agent.id}/designer`)">
            <Workflow :size="15" /> Designer
          </button>
          <button v-if="auth.can('operator')" @click="toggle">
            <component :is="agent.status === 'online' ? Pause : Play" :size="15" />
            {{ agent.status === 'online' ? 'Pause' : 'Publish' }}
          </button>
          <button v-if="auth.can('admin')" class="primary" @click="save"
                  :disabled="!dirty || saving">
            <Save :size="15" /> {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>

      <div class="cols">
        <section class="card">
          <h3>Configuration</h3>
          <label>
            <span>Name</span>
            <input v-model="draft.name" :disabled="!auth.can('admin')" />
          </label>
          <label>
            <span>System prompt</span>
            <textarea v-model="draft.prompt" rows="8" :disabled="!auth.can('admin')"
                      placeholder="Describe what this agent does and how it should behave."></textarea>
          </label>
          <label>
            <span>Tools</span>
            <input v-model="draft.tools" :disabled="!auth.can('admin')"
                   placeholder="transfer_call, book_appointment" />
            <small>Comma separated.</small>
          </label>
        </section>

        <div class="side">
          <section class="card">
            <h3>Pipeline</h3>
            <dl>
              <div v-for="(v, k) in agent.pipeline" :key="k">
                <dt>{{ k }}</dt><dd>{{ v }}</dd>
              </div>
            </dl>
            <p v-if="!Object.keys(agent.pipeline || {}).length" class="muted">
              No pipeline configured yet.
            </p>
            <button v-if="auth.can('admin')" class="link"
                    @click="router.push(`/app/agents/${agent.id}/designer`)">
              Edit in designer →
            </button>
          </section>

          <section class="card" v-if="agent.stats24h">
            <h3>Last 24 hours</h3>
            <dl>
              <div><dt>Calls</dt><dd>{{ agent.stats24h.calls }}</dd></div>
              <div><dt>Minutes</dt><dd>{{ agent.stats24h.minutes }}</dd></div>
              <div><dt>TTFB</dt><dd>{{ agent.stats24h.ttfb_ms || '—' }}ms</dd></div>
              <div><dt>Resolved</dt><dd>{{ agent.stats24h.resolved_pct }}%</dd></div>
            </dl>
          </section>

          <section class="card">
            <h3>Recent calls</h3>
            <p v-if="!recent.length" class="muted">No calls yet.</p>
            <ul v-else class="recent">
              <li v-for="r in recent" :key="r.id"
                  @click="router.push(`/app/sessions/${r.id}`)">
                <span class="mono">{{ r.caller || 'unknown' }}</span>
                <span class="pill sm" :class="r.outcome">{{ r.outcome }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.back {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .4rem .7rem; margin-bottom: 1.1rem; border-radius: 8px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
  font-size: .85rem; font-family: inherit;
}
.head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.4rem; flex-wrap: wrap; }
.head h2 { font-size: 1.35rem; font-weight: 700; letter-spacing: -.02em; display: inline; margin-right: .6rem; }
.kind { font-size: .8rem; color: var(--mut); text-transform: capitalize; margin-left: .5rem; }
.head-acts { margin-left: auto; display: flex; gap: .5rem; flex-wrap: wrap; }
.head-acts button {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .5rem .9rem; border-radius: 9px; font-size: .86rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
.head-acts button.primary { background: var(--brand-primary, #6d5efc); border: 0; color: #fff; font-weight: 600; }
.head-acts button:disabled { opacity: .45; cursor: not-allowed; }

.pill {
  display: inline-block; padding: .2rem .55rem; border-radius: 999px;
  font-size: .74rem; font-weight: 650; text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.pill.online, .pill.completed { background: rgba(52,211,153,.15); color: #34d399; }
.pill.paused { background: rgba(251,191,36,.15); color: #fbbf24; }
.pill.failed { background: rgba(248,113,113,.15); color: #f87171; }
.pill.sm { font-size: .7rem; }

.cols { display: grid; grid-template-columns: 1.6fr 1fr; gap: 1rem; align-items: start; }
.side { display: grid; gap: 1rem; }
.card {
  padding: 1.2rem; border-radius: 12px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: var(--panel-solid);
}
.card h3 { font-size: .95rem; font-weight: 650; margin-bottom: 1rem; }

label { display: block; margin-bottom: 1rem; }
label span {
  display: block; font-size: .8rem; font-weight: 600;
  color: var(--mut); margin-bottom: .35rem;
}
label small { display: block; font-size: .76rem; color: var(--mut); margin-top: .3rem; }
input, textarea {
  width: 100%; padding: .6rem .75rem; font-size: .9rem; font-family: inherit;
  border-radius: 9px; border: 1px solid color-mix(in srgb, var(--txt) 14%, transparent);
  background: color-mix(in srgb, var(--txt) 4%, transparent); color: var(--txt); resize: vertical;
}
input:focus, textarea:focus { outline: none; border-color: var(--brand-primary, #6d5efc); }
input:disabled, textarea:disabled { opacity: .7; }

dl { display: grid; gap: .55rem; }
dl > div { display: flex; justify-content: space-between; gap: 1rem; font-size: .86rem; }
dt { color: var(--mut); text-transform: capitalize; }
dd { font-family: var(--brand-mono, ui-monospace), monospace; font-size: .83rem; }
.muted { font-size: .85rem; color: var(--mut); }
.link {
  margin-top: .8rem; background: none; border: 0; padding: 0;
  color: var(--brand-accent, #22d3ee); font-size: .85rem; font-family: inherit;
}

.recent { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
.recent li {
  display: flex; justify-content: space-between; align-items: center; gap: .6rem;
  padding: .5rem .6rem; border-radius: 8px; cursor: pointer; font-size: .84rem;
  background: color-mix(in srgb, var(--txt) 3%, transparent);
}
.recent li:hover { background: color-mix(in srgb, var(--txt) 7%, transparent); }
.mono { font-family: var(--brand-mono, ui-monospace), monospace; font-size: .8rem; }

.sk {
  height: 340px; border-radius: 12px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--txt) 4%, transparent), color-mix(in srgb, var(--txt) 9%, transparent), color-mix(in srgb, var(--txt) 4%, transparent));
  background-size: 200% 100%; animation: shimmer 1.3s linear infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
.err {
  padding: 2.5rem; text-align: center; border-radius: 12px;
  border: 1px solid rgba(248,113,113,.3); background: rgba(248,113,113,.07);
}
.err strong { display: block; color: var(--brand-danger, #f87171); margin-bottom: .3rem; }
.err p { color: var(--mut); font-size: .87rem; margin-bottom: 1rem; }
.err button { padding: .5rem 1.1rem; border: 0; border-radius: 8px;
  background: var(--brand-primary, #6d5efc); color: #fff; font-weight: 600; }

@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
</style>
