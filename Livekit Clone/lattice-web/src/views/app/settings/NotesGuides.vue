<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Pin, Trash2, Pencil } from '@lucide/vue'
import { Notes, type NoteRow } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<NoteRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const category = ref('')
const open = ref<NoteRow | null>(null)

const shown = computed(() =>
  category.value ? rows.value.filter((n) => n.category === category.value) : rows.value)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Notes.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const editing = ref(false)
const saving = ref(false)
const form = ref<any>({ id: '', title: '', category: 'guide', body: '', pinned: false })

function openNew() {
  form.value = { id: '', title: '', category: 'guide', body: '', pinned: false }
  editing.value = true
}

async function openEdit(n: NoteRow) {
  // The list carries a truncated body — fetch the whole thing before editing,
  // or saving would silently shorten the note.
  try {
    form.value = { ...(await Notes.get(n.id)) }
    editing.value = true
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function view(n: NoteRow) {
  try {
    open.value = await Notes.get(n.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function save() {
  saving.value = true
  try {
    const body = {
      title: form.value.title.trim(),
      category: form.value.category,
      body: form.value.body,
      pinned: form.value.pinned,
    }
    if (form.value.id) {
      const n = await Notes.patch(form.value.id, body)
      rows.value = rows.value.map((x) => (x.id === n.id ? n : x))
    } else {
      rows.value = [await Notes.create(body), ...rows.value]
    }
    editing.value = false
    await load()
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

async function togglePin(n: NoteRow) {
  try {
    await Notes.patch(n.id, { pinned: !n.pinned })
    await load()
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function remove(n: NoteRow) {
  if (!confirm(`Delete "${n.title}"?`)) return
  try {
    await Notes.remove(n.id)
    rows.value = rows.value.filter((x) => x.id !== n.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Notes / guides"
    lede="Runbooks and internal notes kept beside the system they describe, so the person on call does not have to find the wiki."
    :loading="loading" :error="error" :empty="shown.length === 0"
    empty-title="Nothing written yet"
    empty-body="Write the procedure once, here, and it is where the next person will look."
    @retry="load"
  >
    <template #actions>
      <select v-model="category" class="s-select" aria-label="Filter by category">
        <option value="">All</option>
        <option value="guide">Guides</option>
        <option value="runbook">Runbooks</option>
        <option value="note">Notes</option>
      </select>
      <button v-if="auth.can('operator')" class="s-btn primary" @click="openNew">
        <Plus :size="15" /> New note
      </button>
    </template>
    <template #empty-action>
      <button v-if="auth.can('operator')" class="s-btn primary" @click="openNew">
        <Plus :size="15" /> New note
      </button>
    </template>

    <div class="s-cards">
      <article v-for="n in shown" :key="n.id" class="s-card note" @click="view(n)">
        <header>
          <span class="s-pill">{{ n.category }}</span>
          <Pin v-if="n.pinned" :size="14" class="pinned" />
        </header>
        <h3>{{ n.title }}</h3>
        <p>{{ n.body }}</p>
        <div class="s-acts" v-if="auth.can('operator')">
          <button class="s-icon-btn" title="Pin" @click.stop="togglePin(n)"><Pin :size="14" /></button>
          <button class="s-icon-btn" title="Edit" @click.stop="openEdit(n)"><Pencil :size="14" /></button>
          <button class="s-icon-btn danger" title="Delete" @click.stop="remove(n)"><Trash2 :size="14" /></button>
        </div>
      </article>
    </div>
  </PageShell>

  <div v-if="open" class="s-scrim" @click.self="open = null">
    <div class="s-modal">
      <h3>{{ open.title }}</h3>
      <pre class="bodytext">{{ open.body }}</pre>
      <div class="row"><button class="s-btn" @click="open = null">Close</button></div>
    </div>
  </div>

  <div v-if="editing" class="s-scrim" @click.self="editing = false">
    <div class="s-modal">
      <h3>{{ form.id ? 'Edit note' : 'New note' }}</h3>
      <label>Title<input v-model="form.title" class="s-input" placeholder="Restarting a stuck SIP trunk" /></label>
      <label>Category
        <select v-model="form.category" class="s-select">
          <option value="guide">Guide</option>
          <option value="runbook">Runbook</option>
          <option value="note">Note</option>
        </select>
      </label>
      <label>Body<textarea v-model="form.body" class="s-textarea"></textarea></label>
      <label class="s-switch"><input v-model="form.pinned" type="checkbox" /> Pin to the top</label>
      <div class="row">
        <button class="s-btn" @click="editing = false">Cancel</button>
        <button class="s-btn primary" :disabled="saving || !form.title.trim()" @click="save">
          {{ saving ? 'Saving…' : 'Save note' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note { cursor: pointer; display: flex; flex-direction: column; gap: .5rem; transition: border-color var(--fast) var(--ease); }
.note:hover { border-color: var(--acc); }
.note header { display: flex; align-items: center; gap: .5rem; }
.note .pinned { margin-left: auto; color: var(--acc-2); }
.note h3 { font-size: .95rem; font-weight: 650; }
.note p { font-size: .84rem; color: var(--mut); line-height: 1.5; flex: 1; }
.bodytext {
  white-space: pre-wrap; font-family: inherit; font-size: .88rem; line-height: 1.6;
  max-height: 58vh; overflow-y: auto;
}
</style>
