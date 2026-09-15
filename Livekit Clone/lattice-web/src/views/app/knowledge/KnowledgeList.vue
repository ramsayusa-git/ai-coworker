<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2, RefreshCw } from '@lucide/vue'
import { Knowledge, type Kb } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const auth = useAuth()
const ui = useUI()
const router = useRouter()

const rows = ref<Kb[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Knowledge.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const creating = ref(false)
const saving = ref(false)
const form = ref({ name: '', description: '', chunk_size: 800, chunk_overlap: 120 })

async function create() {
  saving.value = true
  try {
    rows.value = [...rows.value, await Knowledge.create({
      ...form.value, name: form.value.name.trim(),
    })]
    creating.value = false
    form.value = { name: '', description: '', chunk_size: 800, chunk_overlap: 120 }
    ui.success('Knowledge base created')
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

async function reindex(k: Kb) {
  try {
    const r = await Knowledge.reindex(k.id)
    ui.success(`Reindexed ${r.documents} document(s) into ${r.chunks} chunks`)
    await load()
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function remove(k: Kb) {
  if (!confirm(`Delete "${k.name}" and its ${k.doc_count} document(s)?`)) return
  try {
    await Knowledge.remove(k.id)
    rows.value = rows.value.filter((x) => x.id !== k.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Knowledge base / memory"
    lede="Documents your agents can quote from. Each base is chunked and embedded on its own settings, so a short FAQ and a long manual do not have to share one strategy."
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No knowledge bases yet"
    empty-body="Create one, add documents, and attach it to an agent."
    @retry="load"
  >
    <template #actions>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New knowledge base
      </button>
    </template>
    <template #empty-action>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New knowledge base
      </button>
    </template>

    <div class="s-cards">
      <article v-for="k in rows" :key="k.id" class="s-card kb"
               @click="router.push(`/app/knowledge/${k.id}`)">
        <header>
          <h3>{{ k.name }}</h3>
          <span class="s-pill">{{ k.doc_count }} doc{{ k.doc_count === 1 ? '' : 's' }}</span>
        </header>
        <p v-if="k.description">{{ k.description }}</p>
        <dl>
          <div class="s-kv"><dt>Embedding</dt><dd>{{ k.embedding_model }}</dd></div>
          <div class="s-kv"><dt>Chunk</dt><dd>{{ k.chunk_size }} / {{ k.chunk_overlap }} overlap</dd></div>
        </dl>
        <div class="s-acts" v-if="auth.can('admin')">
          <button class="s-icon-btn" title="Reindex" @click.stop="reindex(k)"><RefreshCw :size="14" /></button>
          <button class="s-icon-btn danger" title="Delete" @click.stop="remove(k)"><Trash2 :size="14" /></button>
        </div>
      </article>
    </div>
  </PageShell>

  <div v-if="creating" class="s-scrim" @click.self="creating = false">
    <div class="s-modal">
      <h3>New knowledge base</h3>
      <label>Name<input v-model="form.name" class="s-input" placeholder="Product manual" /></label>
      <label>Description<input v-model="form.description" class="s-input" placeholder="What is in here" /></label>
      <div class="s-grid2">
        <label>Chunk size<input v-model.number="form.chunk_size" class="s-input" type="number" min="100" max="8000" /></label>
        <label>Overlap<input v-model.number="form.chunk_overlap" class="s-input" type="number" min="0" max="2000" /></label>
      </div>
      <p class="hint">Overlap must be smaller than the chunk size, or a chunk can never advance.</p>
      <div class="row">
        <button class="s-btn" @click="creating = false">Cancel</button>
        <button class="s-btn primary"
                :disabled="saving || !form.name.trim() || form.chunk_overlap >= form.chunk_size"
                @click="create">{{ saving ? 'Creating…' : 'Create' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb { cursor: pointer; display: flex; flex-direction: column; gap: .5rem; transition: border-color var(--fast) var(--ease); }
.kb:hover { border-color: var(--acc); }
.kb header { display: flex; align-items: center; gap: .6rem; }
.kb h3 { font-size: .95rem; font-weight: 650; }
.kb header .s-pill { margin-left: auto; }
.kb p { font-size: .84rem; color: var(--mut); line-height: 1.5; }
.kb dl { margin-top: auto; }
</style>
