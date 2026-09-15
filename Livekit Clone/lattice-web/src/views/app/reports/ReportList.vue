<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Play, Trash2 } from '@lucide/vue'
import { Reports, type ReportRow } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<ReportRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const columns = [
  { key: 'name', label: 'Report' },
  { key: 'kind', label: 'Kind', width: '110px' },
  { key: 'window', label: 'Window', width: '90px' },
  { key: 'schedule', label: 'Schedule', width: '110px' },
  { key: 'last', label: 'Last run', width: '150px' },
  { key: 'acts', label: '', width: '90px', align: 'right' as const },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Reports.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const creating = ref(false)
const saving = ref(false)
const form = ref({ name: '', kind: 'calls', window: '7d', schedule: '' })

async function create() {
  saving.value = true
  try {
    rows.value = [await Reports.create({ ...form.value, name: form.value.name.trim() }), ...rows.value]
    creating.value = false
    form.value = { name: '', kind: 'calls', window: '7d', schedule: '' }
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

const result = ref<any>(null)
const running = ref('')

async function run(r: ReportRow) {
  running.value = r.id
  try {
    result.value = await Reports.run(r.id)
    rows.value = rows.value.map((x) =>
      (x.id === r.id ? { ...x, last_run_at: result.value.generated_at } : x))
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    running.value = ''
  }
}

async function remove(r: ReportRow) {
  if (!confirm(`Delete report "${r.name}"?`)) return
  try {
    await Reports.remove(r.id)
    rows.value = rows.value.filter((x) => x.id !== r.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Reports"
    lede="Saved queries over your own call and chat data. Running one computes from the live tables, so a report is never stale."
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No saved reports"
    empty-body="Save a report to run it on demand or on a schedule."
    @retry="load"
  >
    <template #actions>
      <button v-if="auth.can('operator')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New report
      </button>
    </template>
    <template #empty-action>
      <button v-if="auth.can('operator')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New report
      </button>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id">
      <template #cell:name="{ row }"><strong class="s-name">{{ row.name }}</strong></template>
      <template #cell:schedule="{ row }">{{ row.schedule || 'On demand' }}</template>
      <template #cell:last="{ row }">{{ when(row.last_run_at) }}</template>
      <template #cell:acts="{ row }">
        <div class="s-acts">
          <button class="s-icon-btn" title="Run now" :disabled="running === row.id"
                  @click.stop="run(row)"><Play :size="14" /></button>
          <button v-if="auth.can('operator')" class="s-icon-btn danger"
                  title="Delete" @click.stop="remove(row)"><Trash2 :size="14" /></button>
        </div>
      </template>
    </DataTable>

    <section v-if="result" class="s-card out">
      <header>
        <h3>{{ result.report.name }}</h3>
        <button class="s-btn" @click="result = null">Close</button>
      </header>
      <div class="totals">
        <div v-for="(v, k) in result.totals" :key="k" class="t">
          <span>{{ String(k).replace(/_/g, ' ') }}</span><strong>{{ v }}</strong>
        </div>
      </div>
      <table v-if="result.rows?.length" class="rowsTable">
        <thead><tr><th>Key</th><th v-for="c in Object.keys(result.rows[0]).filter(k => k !== 'key' && k !== 'label')" :key="c">{{ c }}</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in result.rows" :key="i">
            <td>{{ r.label ?? r.key }}</td>
            <td v-for="c in Object.keys(result.rows[0]).filter(k => k !== 'key' && k !== 'label')" :key="c">{{ r[c] }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="none">No rows in this window.</p>
    </section>
  </PageShell>

  <div v-if="creating" class="s-scrim" @click.self="creating = false">
    <div class="s-modal">
      <h3>New report</h3>
      <label>Name<input v-model="form.name" class="s-input" placeholder="Weekly call summary" /></label>
      <div class="s-grid2">
        <label>Kind
          <select v-model="form.kind" class="s-select">
            <option value="calls">Calls</option>
            <option value="chats">Chats</option>
            <option value="spend">Spend</option>
            <option value="agents">By agent</option>
            <option value="quality">By outcome</option>
          </select>
        </label>
        <label>Window
          <select v-model="form.window" class="s-select">
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </label>
      </div>
      <label>Schedule
        <select v-model="form.schedule" class="s-select">
          <option value="">On demand only</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      <div class="row">
        <button class="s-btn" @click="creating = false">Cancel</button>
        <button class="s-btn primary" :disabled="saving || !form.name.trim()" @click="create">
          {{ saving ? 'Saving…' : 'Save report' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.out { display: flex; flex-direction: column; gap: .9rem; }
.out header { display: flex; align-items: center; gap: 1rem; }
.out h3 { font-size: .95rem; font-weight: 700; }
.out header button { margin-left: auto; }
.totals { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.t { display: flex; flex-direction: column; gap: .15rem; }
.t span { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.t strong { font-size: 1.15rem; font-weight: 700; }
.rowsTable { width: 100%; border-collapse: collapse; font-size: .85rem; }
.rowsTable th, .rowsTable td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid var(--line); }
.rowsTable th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.none { font-size: .85rem; color: var(--mut); }
</style>
