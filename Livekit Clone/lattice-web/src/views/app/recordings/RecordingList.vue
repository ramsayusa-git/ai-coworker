<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Square, Trash2 } from '@lucide/vue'
import { Recordings, type RecordingRow } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<RecordingRow[]>([])
const bytesUsed = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref('')

const columns = [
  { key: 'what', label: 'Recording' },
  { key: 'kind', label: 'Kind', width: '100px' },
  { key: 'dest', label: 'Destination', width: '130px' },
  { key: 'len', label: 'Length', width: '100px', align: 'right' as const },
  { key: 'size', label: 'Size', width: '100px', align: 'right' as const },
  { key: 'status', label: 'Status', width: '120px' },
  { key: 'acts', label: '', width: '90px', align: 'right' as const },
]

function bytes(n: number) {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function clock(s: number) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await Recordings.list(status.value ? { status: status.value, limit: 200 } : { limit: 200 })
    rows.value = res.items
    bytesUsed.value = res.bytes_used
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function stop(r: RecordingRow) {
  try {
    const u = await Recordings.stop(r.id)
    rows.value = rows.value.map((x) => (x.id === u.id ? u : x))
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function remove(r: RecordingRow) {
  if (!confirm('Delete this recording? The stored file is removed with it.')) return
  try {
    await Recordings.remove(r.id)
    rows.value = rows.value.filter((x) => x.id !== r.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

watch(status, load)
onMounted(load)
</script>

<template>
  <PageShell
    title="Recording / egress"
    :lede="`Call and room captures, and where each one was written. ${bytesUsed ? bytes(bytesUsed) + ' stored.' : ''}`"
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="Nothing recorded yet"
    empty-body="Turn recording on for an agent, or start one against a live session, and captures land here."
    @retry="load"
  >
    <template #actions>
      <select v-model="status" class="s-select" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="recording">Recording</option>
        <option value="complete">Complete</option>
        <option value="failed">Failed</option>
      </select>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id">
      <template #cell:what="{ row }">
        <strong class="s-mono">{{ row.session_id || row.room_id || row.id }}</strong>
        <small v-if="row.error" class="s-sub err">{{ row.error }}</small>
        <small v-else-if="row.path" class="s-sub">{{ row.path }}</small>
      </template>
      <template #cell:dest="{ row }">{{ row.destination }}</template>
      <template #cell:len="{ row }">{{ clock(row.duration_s) }}</template>
      <template #cell:size="{ row }">{{ bytes(row.size_bytes) }}</template>
      <template #cell:status="{ row }">
        <span class="s-pill" :class="row.status">{{ row.status }}</span>
      </template>
      <template #cell:acts="{ row }">
        <div class="s-acts">
          <button v-if="row.status === 'recording' && auth.can('operator')"
                  class="s-icon-btn" title="Stop" @click.stop="stop(row)"><Square :size="13" /></button>
          <button v-if="auth.can('admin')" class="s-icon-btn danger"
                  title="Delete" @click.stop="remove(row)"><Trash2 :size="14" /></button>
        </div>
      </template>
    </DataTable>
  </PageShell>
</template>

<style scoped>
.err { color: var(--bad); }
</style>
