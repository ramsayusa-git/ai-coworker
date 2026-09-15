<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, Trash2 } from '@lucide/vue'
import { Knowledge, type Kb, type KbDoc } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const ui = useUI()
const id = String(route.params.id)

const kb = ref<Kb | null>(null)
const docs = ref<KbDoc[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const columns = [
  { key: 'title', label: 'Document' },
  { key: 'source', label: 'Source', width: '100px' },
  { key: 'chunks', label: 'Chunks', width: '90px', align: 'right' as const },
  { key: 'size', label: 'Size', width: '100px', align: 'right' as const },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'acts', label: '', width: '60px', align: 'right' as const },
]

function bytes(n: number) {
  if (!n) return '—'
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
}

async function load() {
  loading.value = true
  error.value = null
  try {
    // Both in flight together — the header and the table are equally useless
    // on their own, so there is nothing to show until they both land.
    const [k, d] = await Promise.all([Knowledge.get(id), Knowledge.docs(id)])
    kb.value = k
    docs.value = d
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const adding = ref(false)
const saving = ref(false)
const form = ref({ title: '', source: 'text', uri: '', content: '' })

async function add() {
  saving.value = true
  try {
    docs.value = [await Knowledge.addDoc(id, { ...form.value, title: form.value.title.trim() }), ...docs.value]
    if (kb.value) kb.value.doc_count = docs.value.length
    adding.value = false
    form.value = { title: '', source: 'text', uri: '', content: '' }
    ui.success('Document indexed')
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(d: KbDoc) {
  if (!confirm(`Remove "${d.title}" from this knowledge base?`)) return
  try {
    await Knowledge.removeDoc(id, d.id)
    docs.value = docs.value.filter((x) => x.id !== d.id)
    if (kb.value) kb.value.doc_count = docs.value.length
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    :title="kb?.name ?? 'Knowledge base'"
    :lede="kb?.description || ''"
    :loading="loading" :error="error" @retry="load"
  >
    <template #actions>
      <button class="s-btn" @click="router.push('/app/knowledge')">
        <ArrowLeft :size="14" /> All bases
      </button>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="adding = true">
        <Plus :size="15" /> Add document
      </button>
    </template>

    <DataTable :columns="columns" :rows="docs" row-key="id"
               empty-title="No documents yet"
               empty-body="Paste text or point at a URL — it is chunked on this base's settings straight away.">
      <template #cell:title="{ row }">
        <strong class="s-name">{{ row.title }}</strong>
        <small v-if="row.error" class="s-sub err">{{ row.error }}</small>
        <small v-else-if="row.uri" class="s-sub">{{ row.uri }}</small>
      </template>
      <template #cell:size="{ row }">{{ bytes(row.bytes) }}</template>
      <template #cell:status="{ row }">
        <span class="s-pill" :class="row.status">{{ row.status }}</span>
      </template>
      <template #cell:acts="{ row }">
        <div class="s-acts" v-if="auth.can('admin')">
          <button class="s-icon-btn danger" title="Remove" @click.stop="remove(row)"><Trash2 :size="14" /></button>
        </div>
      </template>
    </DataTable>
  </PageShell>

  <div v-if="adding" class="s-scrim" @click.self="adding = false">
    <div class="s-modal">
      <h3>Add document</h3>
      <label>Title<input v-model="form.title" class="s-input" placeholder="Warranty terms" /></label>
      <label>Source
        <select v-model="form.source" class="s-select">
          <option value="text">Pasted text</option>
          <option value="url">URL</option>
        </select>
      </label>
      <label v-if="form.source === 'url'">URL
        <input v-model="form.uri" class="s-input" placeholder="https://…" />
      </label>
      <label v-else>Content
        <textarea v-model="form.content" class="s-textarea" placeholder="Paste the text to index…"></textarea>
      </label>
      <div class="row">
        <button class="s-btn" @click="adding = false">Cancel</button>
        <button class="s-btn primary" :disabled="saving || !form.title.trim()" @click="add">
          {{ saving ? 'Indexing…' : 'Add document' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.err { color: var(--bad); }
</style>
