<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, X } from '@lucide/vue'
import { Rooms, type Room } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import DataTable from '../../../components/ui/DataTable.vue'

const auth = useAuth()
const ui = useUI()

const rows = ref<Room[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const filter = ref('')

const columns = [
  { key: 'name', label: 'Room' },
  { key: 'kind', label: 'Kind', width: '90px' },
  { key: 'people', label: 'In room', width: '110px', align: 'right' as const },
  { key: 'cap', label: 'Capacity', width: '100px', align: 'right' as const },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'acts', label: '', width: '120px', align: 'right' as const },
]

const shown = computed(() =>
  filter.value ? rows.value.filter((r) => r.status === filter.value) : rows.value)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await Rooms.list()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const creating = ref(false)
const form = ref({ name: '', kind: 'voice', max_participants: 8 })
const saving = ref(false)

async function create() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    const r = await Rooms.create({ ...form.value, name: form.value.name.trim() })
    rows.value = [r, ...rows.value]
    creating.value = false
    form.value = { name: '', kind: 'voice', max_participants: 8 }
    ui.success(`Room "${r.name}" created`)
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

async function close(r: Room) {
  try {
    const updated = await Rooms.close(r.id)
    rows.value = rows.value.map((x) => (x.id === r.id ? updated : x))
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function remove(r: Room) {
  if (!confirm(`Delete room "${r.name}"? This cannot be undone.`)) return
  try {
    await Rooms.remove(r.id)
    rows.value = rows.value.filter((x) => x.id !== r.id)
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Rooms"
    lede="Realtime media rooms. An agent and its callers meet in one; closing a room ends every session in it."
    :loading="loading" :error="error" :empty="shown.length === 0"
    empty-title="No rooms yet"
    empty-body="Rooms are created on demand when a call arrives, or by hand here for testing."
    @retry="load"
  >
    <template #actions>
      <select v-model="filter" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="idle">Idle</option>
        <option value="live">Live</option>
        <option value="closed">Closed</option>
      </select>
      <button v-if="auth.can('operator')" class="primary" @click="creating = true">
        <Plus :size="15" /> New room
      </button>
    </template>

    <DataTable :columns="columns" :rows="shown" row-key="id">
      <template #cell:name="{ row }">
        <strong class="nm">{{ row.name }}</strong>
      </template>
      <template #cell:people="{ row }">{{ row.participant_count }}</template>
      <template #cell:cap="{ row }">{{ row.max_participants }}</template>
      <template #cell:status="{ row }">
        <span class="pill" :class="row.status">{{ row.status }}</span>
      </template>
      <template #cell:acts="{ row }">
        <div class="acts">
          <button v-if="auth.can('operator') && row.status !== 'closed'"
                  @click.stop="close(row)" title="Close room">Close</button>
          <button v-if="auth.can('admin')" class="danger"
                  @click.stop="remove(row)" title="Delete room"><X :size="14" /></button>
        </div>
      </template>
    </DataTable>
  </PageShell>

  <div v-if="creating" class="scrim" @click.self="creating = false">
    <div class="modal surface">
      <h3>New room</h3>
      <label>Name<input v-model="form.name" placeholder="support-queue" /></label>
      <label>Kind
        <select v-model="form.kind">
          <option value="voice">Voice</option>
          <option value="video">Video</option>
          <option value="data">Data</option>
        </select>
      </label>
      <label>Max participants
        <input v-model.number="form.max_participants" type="number" min="1" max="200" />
      </label>
      <div class="row">
        <button @click="creating = false">Cancel</button>
        <button class="primary" :disabled="saving || !form.name.trim()" @click="create">
          {{ saving ? 'Creating…' : 'Create room' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nm { font-weight: 600; font-size: .9rem; }
select, input {
  padding: .5rem .7rem; border-radius: var(--r-sm); font-size: .86rem; font-family: inherit;
  border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
button.primary {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .5rem 1rem; border: 0; border-radius: var(--r-sm);
  background: var(--acc); color: #fff; font-weight: 600; font-size: .86rem; font-family: inherit;
}
button.primary:disabled { opacity: .5; }
.acts { display: flex; gap: .3rem; justify-content: flex-end; }
.acts button {
  padding: .3rem .55rem; border-radius: 6px; font-size: .78rem; font-family: inherit;
  border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 4%, transparent); color: var(--mut);
}
.acts button:hover { color: var(--txt); border-color: var(--acc); }
.acts .danger:hover { color: var(--bad); border-color: var(--bad); }
.pill {
  padding: .18rem .5rem; border-radius: 999px; font-size: .74rem; font-weight: 650;
  text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.pill.live { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
.pill.closed { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }

.scrim {
  position: fixed; inset: 0; z-index: 120; display: grid; place-items: center;
  padding: 1rem; background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
}
.modal {
  width: min(420px, 100%); padding: 1.2rem; display: flex; flex-direction: column; gap: .8rem;
  background: var(--panel-solid);
}
.modal h3 { font-size: 1rem; font-weight: 700; }
.modal label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; color: var(--mut); }
.modal .row { display: flex; gap: .5rem; justify-content: flex-end; margin-top: .3rem; }
.modal .row button {
  padding: .5rem 1rem; border-radius: var(--r-sm); font-size: .86rem; font-family: inherit;
  border: 1px solid var(--line-2); background: none; color: var(--txt);
}
</style>
