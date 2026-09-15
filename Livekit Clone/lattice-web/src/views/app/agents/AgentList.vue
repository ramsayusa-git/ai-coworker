<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, Play, Pause, Trash2, Workflow } from '@lucide/vue'
import DataTable from '../../../components/ui/DataTable.vue'
import { Agents, type Agent } from '../../../api'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'

const router = useRouter()
const auth = useAuth()
const ui = useUI()

const rows = ref<Agent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const q = ref('')
const statusFilter = ref('')

const creating = ref(false)
const form = ref({ name: '', kind: 'voice' as 'voice' | 'chat', prompt: '' })
const saving = ref(false)
const formError = ref('')

const columns = [
  { key: 'name', label: 'Agent' },
  { key: 'kind', label: 'Kind', width: '90px' },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'calls', label: 'Calls 24h', width: '100px', align: 'right' as const, mono: true },
  { key: 'ttfb', label: 'TTFB', width: '90px', align: 'right' as const, mono: true },
  { key: 'actions', label: '', width: '140px', align: 'right' as const },
]

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  return rows.value.filter((a) => {
    if (statusFilter.value && a.status !== statusFilter.value) return false
    if (!term) return true
    return a.name.toLowerCase().includes(term) || a.prompt.toLowerCase().includes(term)
  })
})

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Agents.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function toggle(a: Agent) {
  const action = a.status === 'online' ? 'pause' : 'publish'
  try {
    const updated = await Agents.action(a.id, action)
    const i = rows.value.findIndex((r) => r.id === a.id)
    if (i >= 0) rows.value[i] = { ...rows.value[i], ...updated }
    ui.success(action === 'publish' ? 'Agent published' : 'Agent paused', a.name)
  } catch (e: any) {
    ui.error('Could not update agent', e.message)
  }
}

async function remove(a: Agent) {
  if (!confirm(`Delete "${a.name}"? Its call history stays, but the agent is gone. This cannot be undone.`)) return
  try {
    await Agents.remove(a.id)
    rows.value = rows.value.filter((r) => r.id !== a.id)
    ui.success('Agent deleted', a.name)
  } catch (e: any) {
    ui.error('Could not delete agent', e.message)
  }
}

async function create() {
  if (!form.value.name.trim()) return
  saving.value = true
  formError.value = ''
  try {
    const a = await Agents.create({
      name: form.value.name.trim(),
      kind: form.value.kind,
      prompt: form.value.prompt,
      pipeline: { llm: 'fast' },
      tools: [],
      kb: [],
    })
    rows.value.unshift(a)
    creating.value = false
    form.value = { name: '', kind: 'voice', prompt: '' }
    ui.success('Agent created', a.name)
    router.push(`/app/agents/${a.id}`)
  } catch (e: any) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="toolbar">
      <div class="search">
        <Search :size="16" />
        <input v-model="q" placeholder="Search agents" aria-label="Search agents" />
      </div>
      <select v-model="statusFilter" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="online">Online</option>
        <option value="paused">Paused</option>
        <option value="draft">Draft</option>
      </select>
      <button v-if="auth.can('admin')" class="primary" @click="creating = true">
        <Plus :size="16" /> New agent
      </button>
    </div>

    <DataTable :columns="columns" :rows="filtered" :loading="loading" :error="error"
               clickable empty-title="No agents yet"
               empty-body="An agent is a prompt plus a pipeline of STT, LLM and TTS."
               @row="(r) => router.push(`/app/agents/${r.id}`)" @retry="load">
      <template #cell:name="{ row }">
        <div class="cell-name">
          <strong>{{ row.name }}</strong>
          <small>{{ row.prompt ? row.prompt.slice(0, 68) + (row.prompt.length > 68 ? '…' : '') : 'No prompt set' }}</small>
        </div>
      </template>

      <template #cell:status="{ row }">
        <span class="pill" :class="row.status">{{ row.status }}</span>
      </template>

      <template #cell:calls="{ row }">{{ row.stats24h?.calls ?? 0 }}</template>
      <template #cell:ttfb="{ row }">
        {{ row.stats24h?.ttfb_ms ? row.stats24h.ttfb_ms + 'ms' : '—' }}
      </template>

      <template #cell:actions="{ row }">
        <div class="acts" @click.stop>
          <button v-if="auth.can('admin')" class="ic" title="Open designer"
                  @click="router.push(`/app/agents/${row.id}/designer`)">
            <Workflow :size="15" />
          </button>
          <button v-if="auth.can('operator')" class="ic"
                  :title="row.status === 'online' ? 'Pause' : 'Publish'" @click="toggle(row)">
            <component :is="row.status === 'online' ? Pause : Play" :size="15" />
          </button>
          <button v-if="auth.can('admin')" class="ic danger" title="Delete" @click="remove(row)">
            <Trash2 :size="15" />
          </button>
        </div>
      </template>

      <template #empty-action>
        <button v-if="auth.can('admin')" class="primary" @click="creating = true">
          <Plus :size="16" /> Create your first agent
        </button>
      </template>
    </DataTable>

    <div v-if="creating" class="modal-scrim" @click.self="creating = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="New agent">
        <h2>New agent</h2>
        <label>
          <span>Name</span>
          <input v-model="form.name" autofocus placeholder="Reception line" />
        </label>
        <label>
          <span>Kind</span>
          <select v-model="form.kind">
            <option value="voice">Voice</option>
            <option value="chat">Chat</option>
          </select>
        </label>
        <label>
          <span>System prompt</span>
          <textarea v-model="form.prompt" rows="4"
                    placeholder="You are the receptionist for…"></textarea>
        </label>
        <p v-if="formError" class="err">{{ formError }}</p>
        <div class="modal-acts">
          <button @click="creating = false" :disabled="saving">Cancel</button>
          <button class="primary" @click="create" :disabled="saving || !form.name.trim()">
            {{ saving ? 'Creating…' : 'Create agent' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: .7rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
.search {
  display: flex; align-items: center; gap: .5rem; flex: 1; min-width: 200px;
  padding: 0 .8rem; border-radius: 9px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.search input {
  flex: 1; padding: .55rem 0; border: 0; background: none;
  color: var(--txt); font-family: inherit; font-size: .9rem;
}
.search input:focus { outline: none; }
select {
  padding: .55rem .8rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
button.primary {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .55rem 1rem; border: 0; border-radius: 9px;
  background: var(--brand-primary, #6d5efc); color: #fff;
  font-weight: 600; font-size: .88rem; font-family: inherit;
}
button.primary:disabled { opacity: .5; cursor: not-allowed; }

.cell-name strong { display: block; font-weight: 600; font-size: .9rem; }
.cell-name small { display: block; color: var(--mut); font-size: .79rem; margin-top: 2px; }

.pill {
  display: inline-block; padding: .2rem .55rem; border-radius: 999px;
  font-size: .74rem; font-weight: 650; text-transform: capitalize;
}
.pill.online { background: rgba(52,211,153,.15); color: #34d399; }
.pill.paused { background: rgba(251,191,36,.15); color: #fbbf24; }
.pill.draft { background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut); }

.acts { display: flex; gap: .3rem; justify-content: flex-end; }
.ic {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.ic:hover { background: color-mix(in srgb, var(--txt) 9%, transparent); color: var(--txt); }
.ic.danger:hover { color: var(--brand-danger, #f87171); border-color: rgba(248,113,113,.4); }

.modal-scrim {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  padding: 1rem; background: rgba(0,0,0,.6); backdrop-filter: blur(3px);
}
.modal {
  width: min(460px, 100%); padding: 1.6rem; border-radius: 16px;
  background: #14161f; border: 1px solid var(--line-2, color-mix(in srgb, var(--txt) 16%, transparent));
  box-shadow: 0 24px 60px rgba(0,0,0,.6);
}
.modal h2 { font-size: 1.05rem; font-weight: 650; margin-bottom: 1.2rem; }
.modal label { display: block; margin-bottom: .9rem; }
.modal label span {
  display: block; font-size: .8rem; font-weight: 600;
  color: var(--mut); margin-bottom: .35rem;
}
.modal input, .modal textarea, .modal select {
  width: 100%; padding: .6rem .75rem; font-size: .9rem; font-family: inherit;
  border-radius: 9px; border: 1px solid color-mix(in srgb, var(--txt) 14%, transparent);
  background: color-mix(in srgb, var(--txt) 4%, transparent); color: var(--txt);
  resize: vertical;
}
.modal input:focus, .modal textarea:focus, .modal select:focus {
  outline: none; border-color: var(--brand-primary, #6d5efc);
}
.err {
  font-size: .85rem; color: var(--brand-danger, #f87171);
  background: rgba(248,113,113,.1); padding: .55rem .7rem;
  border-radius: 8px; margin-bottom: .9rem;
}
.modal-acts { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.2rem; }
.modal-acts button:not(.primary) {
  padding: .55rem 1rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: none; color: var(--mut);
}

@media (max-width: 600px) {
  .toolbar { flex-direction: column; }
  .toolbar > * { width: 100%; }
  button.primary { justify-content: center; }
}
</style>
