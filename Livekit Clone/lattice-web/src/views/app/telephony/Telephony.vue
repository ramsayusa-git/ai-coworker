<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Search } from '@lucide/vue'
import DataTable from '../../../components/ui/DataTable.vue'
import { Telephony, Agents, type Trunk, type PhoneNumber, type Rule, type Agent } from '../../../api'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'

const auth = useAuth()
const ui = useUI()

const tab = ref<'trunks' | 'numbers' | 'rules'>('trunks')
const trunks = ref<Trunk[]>([])
const numbers = ref<PhoneNumber[]>([])
const rules = ref<Rule[]>([])
const agents = ref<Agent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const adding = ref(false)
const saving = ref(false)
const formError = ref('')
const form = ref<any>({})

const dispatchNumber = ref('')
const dispatchResult = ref<any>(null)
const dispatchError = ref('')

const trunkCols = [
  { key: 'name', label: 'Trunk' },
  { key: 'carrier', label: 'Carrier', width: '130px' },
  { key: 'direction', label: 'Direction', width: '110px' },
  { key: 'address', label: 'Address', mono: true },
  { key: 'state', label: 'State', width: '120px' },
]
const numberCols = [
  { key: 'e164', label: 'Number', mono: true },
  { key: 'region', label: 'Region' },
  { key: 'direction', label: 'Direction', width: '110px' },
  { key: 'trunk_id', label: 'Trunk', width: '150px', mono: true },
]
const ruleCols = [
  { key: 'priority', label: 'Priority', width: '90px', align: 'right' as const, mono: true },
  { key: 'name', label: 'Rule' },
  { key: 'number', label: 'Number', mono: true },
  { key: 'agent', label: 'Answers with' },
  { key: 'schedule', label: 'Schedule' },
]

async function load() {
  loading.value = true
  error.value = null
  try {
    const [t, n, r] = await Promise.all([
      Telephony.trunks(), Telephony.numbers(), Telephony.rules(),
    ])
    trunks.value = t
    numbers.value = n
    rules.value = r
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openAdd() {
  formError.value = ''
  form.value =
    tab.value === 'trunks'
      ? { name: '', carrier: '', direction: 'inbound', address: '' }
      : tab.value === 'numbers'
        ? { e164: '', region: '', direction: 'both', trunk_id: '' }
        : { priority: 100, name: '', number: '', agent_id: '', schedule: 'always' }
  adding.value = true
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    if (tab.value === 'trunks') await Telephony.addTrunk(form.value)
    else if (tab.value === 'numbers') await Telephony.addNumber(form.value)
    else await Telephony.addRule(form.value)
    adding.value = false
    ui.success('Saved')
    await load()
  } catch (e: any) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

async function testDispatch() {
  dispatchResult.value = null
  dispatchError.value = ''
  if (!dispatchNumber.value.trim()) return
  try {
    dispatchResult.value = await Telephony.dispatch(dispatchNumber.value.trim())
  } catch (e: any) {
    dispatchError.value = e.message
  }
}

onMounted(async () => {
  await load()
  try {
    agents.value = await Agents.list()
  } catch {
    /* rule form degrades to a free-text agent id */
  }
})
</script>

<template>
  <div>
    <div class="tabs">
      <button :class="{ on: tab === 'trunks' }" @click="tab = 'trunks'">
        Trunks <small>{{ trunks.length }}</small>
      </button>
      <button :class="{ on: tab === 'numbers' }" @click="tab = 'numbers'">
        Numbers <small>{{ numbers.length }}</small>
      </button>
      <button :class="{ on: tab === 'rules' }" @click="tab = 'rules'">
        Dispatch rules <small>{{ rules.length }}</small>
      </button>
      <button v-if="auth.can('admin')" class="primary" @click="openAdd">
        <Plus :size="16" /> Add
      </button>
    </div>

    <DataTable v-if="tab === 'trunks'" :columns="trunkCols" :rows="trunks"
               :loading="loading" :error="error" empty-title="No trunks configured"
               empty-body="A trunk is the SIP connection to your carrier." @retry="load">
      <template #cell:state="{ row }">
        <span class="pill" :class="row.state">{{ row.state }}</span>
      </template>
    </DataTable>

    <DataTable v-else-if="tab === 'numbers'" :columns="numberCols" :rows="numbers"
               :loading="loading" :error="error" empty-title="No numbers yet"
               empty-body="Add the numbers your carrier has assigned to you." @retry="load">
      <template #cell:trunk_id="{ row }">{{ row.trunk_id || '—' }}</template>
    </DataTable>

    <template v-else>
      <DataTable :columns="ruleCols" :rows="rules" :loading="loading" :error="error"
                 empty-title="No dispatch rules"
                 empty-body="Rules decide which agent answers which number. Lowest priority wins."
                 @retry="load">
        <template #cell:agent="{ row }">{{ row.agent || '(missing agent)' }}</template>
      </DataTable>

      <section class="dispatch">
        <h3>Test dispatch</h3>
        <p>Check which agent would answer a given number right now.</p>
        <div class="dispatch-row">
          <div class="search">
            <Search :size="15" />
            <input v-model="dispatchNumber" placeholder="+61 3 9042 8811"
                   @keydown.enter="testDispatch" aria-label="Number to test" />
          </div>
          <button @click="testDispatch" :disabled="!dispatchNumber.trim()">Check</button>
        </div>
        <div v-if="dispatchResult" class="dispatch-ok">
          <strong>{{ dispatchResult.agent }}</strong> answers via rule
          “{{ dispatchResult.rule }}”.
        </div>
        <div v-else-if="dispatchError" class="dispatch-bad">{{ dispatchError }}</div>
      </section>
    </template>

    <div v-if="adding" class="modal-scrim" @click.self="adding = false">
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Add {{ tab === 'trunks' ? 'trunk' : tab === 'numbers' ? 'number' : 'rule' }}</h2>

        <template v-if="tab === 'trunks'">
          <label><span>Name</span><input v-model="form.name" autofocus /></label>
          <label><span>Carrier</span><input v-model="form.carrier" placeholder="Twilio" /></label>
          <label><span>Direction</span>
            <select v-model="form.direction">
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label><span>Address</span><input v-model="form.address" /></label>
        </template>

        <template v-else-if="tab === 'numbers'">
          <label><span>Number (E.164)</span><input v-model="form.e164" autofocus placeholder="+61390428811" /></label>
          <label><span>Region</span><input v-model="form.region" placeholder="Melbourne, AU" /></label>
          <label><span>Direction</span>
            <select v-model="form.direction">
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label><span>Trunk</span>
            <select v-model="form.trunk_id">
              <option value="">None</option>
              <option v-for="t in trunks" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
        </template>

        <template v-else>
          <label><span>Rule name</span><input v-model="form.name" autofocus /></label>
          <label><span>Priority</span><input v-model.number="form.priority" type="number" />
            <small>Lower numbers are evaluated first.</small></label>
          <label><span>Number</span><input v-model="form.number" placeholder="+61390428811" /></label>
          <label><span>Answers with</span>
            <select v-model="form.agent_id">
              <option value="">Choose an agent…</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <label><span>Schedule</span><input v-model="form.schedule" placeholder="always" /></label>
        </template>

        <p v-if="formError" class="err">{{ formError }}</p>
        <div class="modal-acts">
          <button @click="adding = false" :disabled="saving">Cancel</button>
          <button class="primary" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: .4rem; margin-bottom: 1.1rem; flex-wrap: wrap; align-items: center; }
.tabs button {
  padding: .5rem .9rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.tabs button.on { background: rgba(109,94,252,.18); color: #fff; border-color: rgba(109,94,252,.45); }
.tabs button small { opacity: .6; margin-left: .25rem; }
.tabs button.primary {
  margin-left: auto; display: inline-flex; align-items: center; gap: .4rem;
  background: var(--brand-primary, #6d5efc); color: #fff; border: 0; font-weight: 600;
}

.pill {
  display: inline-block; padding: .2rem .55rem; border-radius: 999px;
  font-size: .74rem; font-weight: 650; text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.pill.registered { background: rgba(52,211,153,.15); color: #34d399; }
.pill.unregistered { background: rgba(251,191,36,.15); color: #fbbf24; }

.dispatch {
  margin-top: 1.4rem; padding: 1.3rem; border-radius: 12px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: var(--panel-solid);
}
.dispatch h3 { font-size: .95rem; font-weight: 650; margin-bottom: .3rem; }
.dispatch > p { font-size: .85rem; color: var(--mut); margin-bottom: .9rem; }
.dispatch-row { display: flex; gap: .6rem; flex-wrap: wrap; }
.search {
  display: flex; align-items: center; gap: .5rem; flex: 1; min-width: 200px;
  padding: 0 .8rem; border-radius: 9px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
}
.search input {
  flex: 1; padding: .55rem 0; border: 0; background: none; font-family: inherit;
  color: var(--txt); font-size: .9rem;
}
.search input:focus { outline: none; }
.dispatch-row button {
  padding: .55rem 1.1rem; border-radius: 9px; border: 0; font-family: inherit;
  background: var(--brand-primary, #6d5efc); color: #fff; font-weight: 600; font-size: .88rem;
}
.dispatch-row button:disabled { opacity: .5; }
.dispatch-ok, .dispatch-bad {
  margin-top: .9rem; padding: .7rem .85rem; border-radius: 9px; font-size: .87rem;
}
.dispatch-ok { background: rgba(52,211,153,.12); border: 1px solid rgba(52,211,153,.3); }
.dispatch-bad { background: rgba(251,191,36,.12); border: 1px solid rgba(251,191,36,.3); color: #fbbf24; }

.modal-scrim {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  padding: 1rem; background: rgba(0,0,0,.6); backdrop-filter: blur(3px);
  overflow-y: auto;
}
.modal {
  width: min(460px, 100%); padding: 1.6rem; border-radius: 16px;
  background: #14161f; border: 1px solid var(--line-2, color-mix(in srgb, var(--txt) 16%, transparent));
}
.modal h2 { font-size: 1.05rem; font-weight: 650; margin-bottom: 1.1rem; }
.modal label { display: block; margin-bottom: .85rem; }
.modal label span {
  display: block; font-size: .8rem; font-weight: 600;
  color: var(--mut); margin-bottom: .35rem;
}
.modal label small { display: block; font-size: .76rem; color: var(--mut); margin-top: .3rem; }
.modal input, .modal select {
  width: 100%; padding: .6rem .75rem; font-size: .9rem; font-family: inherit;
  border-radius: 9px; border: 1px solid color-mix(in srgb, var(--txt) 14%, transparent);
  background: color-mix(in srgb, var(--txt) 4%, transparent); color: var(--txt);
}
.modal input:focus, .modal select:focus { outline: none; border-color: var(--brand-primary, #6d5efc); }
.err {
  font-size: .85rem; color: var(--brand-danger, #f87171);
  background: rgba(248,113,113,.1); padding: .55rem .7rem; border-radius: 8px; margin-bottom: .8rem;
}
.modal-acts { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.1rem; }
.modal-acts button {
  padding: .55rem 1rem; border-radius: 9px; font-size: .88rem; font-family: inherit;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: none; color: var(--mut);
}
.modal-acts button.primary { background: var(--brand-primary, #6d5efc); color: #fff; border: 0; font-weight: 600; }

@media (max-width: 600px) {
  .tabs button.primary { margin-left: 0; width: 100%; justify-content: center; }
}
</style>
