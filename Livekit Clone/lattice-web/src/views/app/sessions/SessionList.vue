<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import DataTable from '../../../components/ui/DataTable.vue'
import { Sessions, Agents, type CallSession, type Agent } from '../../../api'

const router = useRouter()
const rows = ref<CallSession[]>([])
const agents = ref<Agent[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)

const limit = 25
const offset = ref(0)
const agentId = ref('')
const outcome = ref('')

const columns = [
  { key: 'caller', label: 'From', mono: true },
  { key: 'agent', label: 'Agent' },
  { key: 'started_at', label: 'Started', width: '150px' },
  { key: 'duration_s', label: 'Length', width: '90px', align: 'right' as const, mono: true },
  { key: 'outcome', label: 'Outcome', width: '120px' },
  { key: 'cost', label: 'Cost', width: '90px', align: 'right' as const, mono: true },
]

function fmtDuration(s: number) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const page = await Sessions.list({
      limit, offset: offset.value,
      agent_id: agentId.value || undefined,
      outcome: outcome.value || undefined,
    })
    rows.value = page.items
    total.value = page.total
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch([agentId, outcome], () => { offset.value = 0; load() })
watch(offset, load)

onMounted(async () => {
  load()
  try {
    agents.value = await Agents.list()
  } catch {
    /* filter is a convenience; the list still works without it */
  }
})
</script>

<template>
  <div>
    <div class="toolbar">
      <select v-model="agentId" aria-label="Filter by agent">
        <option value="">All agents</option>
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model="outcome" aria-label="Filter by outcome">
        <option value="">All outcomes</option>
        <option value="completed">Completed</option>
        <option value="transferred">Transferred</option>
        <option value="no-answer">No answer</option>
        <option value="failed">Failed</option>
        <option value="in-progress">In progress</option>
      </select>
      <span class="count" v-if="!loading && !error">
        {{ total.toLocaleString() }} session{{ total === 1 ? '' : 's' }}
      </span>
    </div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :error="error"
               clickable empty-title="No sessions match"
               empty-body="Calls appear here as soon as an agent answers one."
               @row="(r) => router.push(`/app/sessions/${r.id}`)" @retry="load">
      <template #cell:caller="{ row }">{{ row.caller || 'unknown' }}</template>
      <template #cell:agent="{ row }">{{ row.agent || '—' }}</template>
      <template #cell:started_at="{ row }">{{ fmtWhen(row.started_at) }}</template>
      <template #cell:duration_s="{ row }">{{ fmtDuration(row.duration_s) }}</template>
      <template #cell:outcome="{ row }">
        <span class="pill" :class="row.outcome">{{ row.outcome }}</span>
      </template>
      <template #cell:cost="{ row }">${{ row.cost.toFixed(2) }}</template>
    </DataTable>

    <div v-if="total > limit" class="pager">
      <button :disabled="offset === 0" @click="offset = Math.max(0, offset - limit)">
        <ChevronLeft :size="15" /> Previous
      </button>
      <span>{{ offset + 1 }}–{{ Math.min(offset + limit, total) }} of {{ total }}</span>
      <button :disabled="offset + limit >= total" @click="offset += limit">
        Next <ChevronRight :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: .7rem; margin-bottom: 1.1rem; align-items: center; flex-wrap: wrap; }
select {
  padding: .55rem .8rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: var(--brand-text, #f2f4f8);
}
.count { margin-left: auto; font-size: .85rem; color: var(--brand-muted, #9aa2b4); }

.pill {
  display: inline-block; padding: .2rem .55rem; border-radius: 999px;
  font-size: .74rem; font-weight: 650; text-transform: capitalize;
  background: rgba(255,255,255,.08); color: var(--brand-muted, #9aa2b4);
}
.pill.completed { background: rgba(52,211,153,.15); color: #34d399; }
.pill.transferred { background: rgba(34,211,238,.15); color: #22d3ee; }
.pill.failed { background: rgba(248,113,113,.15); color: #f87171; }
.pill\.in-progress, .pill.in-progress { background: rgba(109,94,252,.18); color: #8b7cff; }

.pager {
  display: flex; align-items: center; justify-content: center; gap: 1rem;
  margin-top: 1.1rem; font-size: .85rem; color: var(--brand-muted, #9aa2b4);
}
.pager button {
  display: inline-flex; align-items: center; gap: .3rem;
  padding: .45rem .85rem; border-radius: 8px; font-size: .85rem; font-family: inherit;
  border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: var(--brand-text, #f2f4f8);
}
.pager button:disabled { opacity: .4; cursor: not-allowed; }

@media (max-width: 600px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .count { margin-left: 0; }
}
</style>
