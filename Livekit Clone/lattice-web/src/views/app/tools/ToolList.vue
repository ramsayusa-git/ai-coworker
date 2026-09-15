<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Trash2, Pencil } from '@lucide/vue'
import { Tools, type ToolRow } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<ToolRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const columns = [
  { key: 'name', label: 'Tool' },
  { key: 'kind', label: 'Kind', width: '90px' },
  { key: 'target', label: 'Target' },
  { key: 'enabled', label: 'State', width: '100px' },
  { key: 'acts', label: '', width: '90px', align: 'right' as const },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Tools.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const blank = () => ({
  id: '', name: '', kind: 'http', description: '', enabled: true,
  method: 'POST', url: '', timeout_s: 10,
})
const form = ref<any>(blank())
const editing = ref(false)
const saving = ref(false)

function openNew() { form.value = blank(); editing.value = true }
function openEdit(r: ToolRow) { form.value = { ...r }; editing.value = true }

async function save() {
  saving.value = true
  try {
    const body = {
      name: form.value.name.trim(),
      kind: form.value.kind,
      description: form.value.description,
      enabled: form.value.enabled,
      method: form.value.method,
      url: form.value.url.trim(),
      timeout_s: form.value.timeout_s,
    }
    if (form.value.id) {
      const r = await Tools.patch(form.value.id, body)
      rows.value = rows.value.map((x) => (x.id === r.id ? r : x))
    } else {
      rows.value = [...rows.value, await Tools.create(body)]
    }
    editing.value = false
    ui.success('Tool saved')
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

async function toggle(r: ToolRow) {
  try {
    const u = await Tools.patch(r.id, { enabled: !r.enabled })
    rows.value = rows.value.map((x) => (x.id === u.id ? u : x))
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function remove(r: ToolRow) {
  if (!confirm(`Delete tool "${r.name}"? Agents using it will lose the call.`)) return
  try {
    await Tools.remove(r.id)
    rows.value = rows.value.filter((x) => x.id !== r.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Tools"
    lede="Functions an agent can call mid-conversation — a webhook into your systems, a built-in like transfer or hang up, or an MCP tool."
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No tools yet"
    empty-body="Add a webhook and it becomes selectable in every agent's tool list."
    @retry="load"
  >
    <template #actions>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="openNew">
        <Plus :size="15" /> New tool
      </button>
    </template>
    <template #empty-action>
      <button v-if="auth.can('admin')" class="s-btn primary" @click="openNew">
        <Plus :size="15" /> New tool
      </button>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id">
      <template #cell:name="{ row }">
        <strong class="s-name">{{ row.name }}</strong>
        <small v-if="row.description" class="s-sub">{{ row.description }}</small>
      </template>
      <template #cell:target="{ row }">
        <span class="s-mono">{{ row.kind === 'builtin' ? '—' : `${row.method} ${row.url}` }}</span>
      </template>
      <template #cell:enabled="{ row }">
        <button class="s-pill" :class="row.enabled ? 'enabled' : 'disabled'"
                :disabled="!auth.can('admin')" @click.stop="toggle(row)">
          {{ row.enabled ? 'Enabled' : 'Disabled' }}
        </button>
      </template>
      <template #cell:acts="{ row }">
        <div class="s-acts" v-if="auth.can('admin')">
          <button class="s-icon-btn" title="Edit" @click.stop="openEdit(row)"><Pencil :size="14" /></button>
          <button class="s-icon-btn danger" title="Delete" @click.stop="remove(row)"><Trash2 :size="14" /></button>
        </div>
      </template>
    </DataTable>
  </PageShell>

  <div v-if="editing" class="s-scrim" @click.self="editing = false">
    <div class="s-modal">
      <h3>{{ form.id ? 'Edit tool' : 'New tool' }}</h3>
      <label>Name<input v-model="form.name" class="s-input" placeholder="book_appointment" /></label>
      <label>Description<input v-model="form.description" class="s-input" placeholder="Books a site survey in the CRM" /></label>
      <div class="s-grid2">
        <label>Kind
          <select v-model="form.kind" class="s-select" :disabled="!!form.id">
            <option value="http">HTTP webhook</option>
            <option value="builtin">Built-in</option>
            <option value="mcp">MCP</option>
          </select>
        </label>
        <label>Timeout (seconds)
          <input v-model.number="form.timeout_s" class="s-input" type="number" min="1" max="120" />
        </label>
      </div>
      <template v-if="form.kind !== 'builtin'">
        <div class="s-grid2">
          <label>Method
            <select v-model="form.method" class="s-select">
              <option>GET</option><option>POST</option><option>PUT</option>
              <option>PATCH</option><option>DELETE</option>
            </select>
          </label>
          <label>URL<input v-model="form.url" class="s-input" placeholder="https://…" /></label>
        </div>
        <p class="hint">
          The agent calls this from the server with your tenant's credentials, so only
          http:// and https:// targets are accepted.
        </p>
      </template>
      <label class="s-switch"><input v-model="form.enabled" type="checkbox" /> Enabled</label>
      <div class="row">
        <button class="s-btn" @click="editing = false">Cancel</button>
        <button class="s-btn primary" :disabled="saving || !form.name.trim()" @click="save">
          {{ saving ? 'Saving…' : 'Save tool' }}
        </button>
      </div>
    </div>
  </div>
</template>
