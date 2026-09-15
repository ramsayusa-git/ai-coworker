<script setup lang="ts">
/**
 * Chatbot agents are the same Agent rows as voice agents, with kind='chat'.
 * They get their own screen because the columns that matter are different —
 * nobody wants a TTFB column on a web chat — but there is deliberately no
 * second table behind this.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@lucide/vue'
import { Agents, type Agent } from '../../../api/index'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()
const router = useRouter()

const all = ref<Agent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const rows = computed(() => all.value.filter((a) => a.kind === 'chat'))

const columns = [
  { key: 'name', label: 'Chatbot' },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'tools', label: 'Tools', width: '100px', align: 'right' as const },
  { key: 'kb', label: 'Knowledge', width: '110px', align: 'right' as const },
  { key: 'updated', label: 'Updated', width: '150px' },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    all.value = await Agents.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const creating = ref(false)
const saving = ref(false)
const form = ref({ name: '', prompt: '' })

async function create() {
  saving.value = true
  try {
    const a = await Agents.create({
      name: form.value.name.trim(),
      kind: 'chat',
      prompt: form.value.prompt,
      pipeline: { llm: 'fast' },
      tools: [],
      kb: [],
    } as any)
    all.value = [...all.value, a]
    creating.value = false
    form.value = { name: '', prompt: '' }
    router.push(`/app/agents/${a.id}`)
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Chatbot agents"
    lede="Text agents for your website widget, SMS and WhatsApp. They share the agent editor with voice agents — only the pipeline differs."
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No chatbot agents yet"
    empty-body="A chatbot needs a prompt and an LLM; no speech components are involved."
    @retry="load"
  >
    <template #actions>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New chatbot
      </button>
    </template>
    <template #empty-action>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New chatbot
      </button>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id" clickable
               @row="(r:any) => router.push(`/app/agents/${r.id}`)">
      <template #cell:name="{ row }">
        <strong class="s-name">{{ row.name }}</strong>
        <small v-if="row.prompt" class="s-sub">{{ row.prompt.slice(0, 90) }}{{ row.prompt.length > 90 ? '…' : '' }}</small>
      </template>
      <template #cell:status="{ row }">
        <span class="s-pill" :class="row.status">{{ row.status }}</span>
      </template>
      <template #cell:tools="{ row }">{{ row.tools?.length ?? 0 }}</template>
      <template #cell:kb="{ row }">{{ row.kb?.length ?? 0 }}</template>
      <template #cell:updated="{ row }">{{ when(row.updated_at) }}</template>
    </DataTable>
  </PageShell>

  <div v-if="creating" class="s-scrim" @click.self="creating = false">
    <div class="s-modal">
      <h3>New chatbot agent</h3>
      <label>Name<input v-model="form.name" class="s-input" placeholder="Website assistant" /></label>
      <label>System prompt
        <textarea v-model="form.prompt" class="s-textarea"
                  placeholder="You answer questions about our products and book demos…"></textarea>
      </label>
      <div class="row">
        <button class="s-btn" @click="creating = false">Cancel</button>
        <button class="s-btn primary" :disabled="saving || !form.name.trim()" @click="create">
          {{ saving ? 'Creating…' : 'Create and edit' }}
        </button>
      </div>
    </div>
  </div>
</template>
