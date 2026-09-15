<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Chats, type Chat } from '../../../api/sections'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const rows = ref<Chat[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref('')
const channel = ref('')

const columns = [
  { key: 'visitor', label: 'Visitor' },
  { key: 'agent', label: 'Agent' },
  { key: 'channel', label: 'Channel', width: '110px' },
  { key: 'started', label: 'Started', width: '150px' },
  { key: 'messages', label: 'Messages', width: '100px', align: 'right' as const },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'cost', label: 'Cost', width: '90px', align: 'right' as const },
]

function when(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const q: Record<string, any> = { limit: 100 }
    if (status.value) q.status = status.value
    if (channel.value) q.channel = channel.value
    const res = await Chats.list(q)
    rows.value = res.items
    total.value = res.total
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch([status, channel], load)
onMounted(load)
</script>

<template>
  <PageShell
    title="Chat history"
    :lede="`Conversations handled by your chatbot agents${total ? ` — ${total} total` : ''}.`"
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No conversations yet"
    empty-body="Chats appear here as soon as a chatbot agent takes its first message."
    @retry="load"
  >
    <template #actions>
      <select v-model="channel" class="s-select" aria-label="Filter by channel">
        <option value="">All channels</option>
        <option value="web">Web</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="sms">SMS</option>
        <option value="api">API</option>
      </select>
      <select v-model="status" class="s-select" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="escalated">Escalated</option>
      </select>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id" clickable
               @row="(r:any) => router.push(`/app/chats/${r.id}`)">
      <template #cell:visitor="{ row }">
        <strong class="s-name">{{ row.visitor || 'Anonymous' }}</strong>
        <small v-if="row.summary" class="s-sub">{{ row.summary }}</small>
      </template>
      <template #cell:started="{ row }">{{ when(row.started_at) }}</template>
      <template #cell:messages="{ row }">{{ row.message_count }}</template>
      <template #cell:status="{ row }">
        <span class="s-pill" :class="row.status">{{ row.status }}</span>
      </template>
      <template #cell:cost="{ row }"><span class="s-mono">${{ row.cost.toFixed(2) }}</span></template>
    </DataTable>
  </PageShell>
</template>
