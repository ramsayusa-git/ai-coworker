<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus } from '@lucide/vue'
import { Admin } from '../../../api/index'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<any[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const columns = [
  { key: 'name', label: 'Tenant' },
  { key: 'slug', label: 'Slug', width: '160px' },
  { key: 'kind', label: 'Kind', width: '120px' },
  { key: 'created', label: 'Created', width: '150px' },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Admin.tenants()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const creating = ref(false)
const saving = ref(false)
const form = ref({ name: '', slug: '' })

async function create() {
  saving.value = true
  try {
    rows.value = [...rows.value, await Admin.createTenant({
      name: form.value.name.trim(),
      slug: form.value.slug.trim().toLowerCase(),
    })]
    creating.value = false
    form.value = { name: '', slug: '' }
    ui.success('Tenant created')
  } catch (e: any) {
    // The licence caps tenant count; the server says so in plain words and
    // that message is worth showing verbatim.
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}

async function switchTo(t: any) {
  try {
    await auth.switchTenant(t.id)
    ui.success(`Now working in ${t.name}`)
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Tenants"
    lede="Every tenant on this install. Creating one is capped by your licence; resellers provision a tenant per customer here."
    :loading="loading" :error="error" :empty="rows.length === 0"
    empty-title="No tenants yet"
    @retry="load"
  >
    <template #actions>
      <button class="s-btn primary" @click="creating = true">
        <Plus :size="15" /> New tenant
      </button>
    </template>

    <DataTable :columns="columns" :rows="rows" row-key="id" clickable @row="switchTo">
      <template #cell:name="{ row }">
        <strong class="s-name">{{ row.name }}</strong>
        <small class="s-sub">Click to switch into this tenant</small>
      </template>
      <template #cell:slug="{ row }"><span class="s-mono">{{ row.slug }}</span></template>
      <template #cell:kind="{ row }">
        <span class="s-pill" :class="row.is_platform ? 'ok' : ''">
          {{ row.is_platform ? 'Platform' : 'Customer' }}
        </span>
      </template>
      <template #cell:created="{ row }">{{ when(row.created_at) }}</template>
    </DataTable>
  </PageShell>

  <div v-if="creating" class="s-scrim" @click.self="creating = false">
    <div class="s-modal">
      <h3>New tenant</h3>
      <label>Name<input v-model="form.name" class="s-input" placeholder="Acme Pty Ltd" /></label>
      <label>Slug<input v-model="form.slug" class="s-input" placeholder="acme" /></label>
      <p class="hint">
        The slug becomes the tenant's subdomain label and cannot be changed later.
      </p>
      <div class="row">
        <button class="s-btn" @click="creating = false">Cancel</button>
        <button class="s-btn primary"
                :disabled="saving || !form.name.trim() || !form.slug.trim()" @click="create">
          {{ saving ? 'Creating…' : 'Create tenant' }}
        </button>
      </div>
    </div>
  </div>
</template>
