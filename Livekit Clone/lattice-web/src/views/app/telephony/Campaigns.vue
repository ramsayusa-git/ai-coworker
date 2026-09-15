<script setup lang="ts">
/**
 * Outbound campaigns.
 *
 * Honest scope: the platform has no outbound dialer yet — no queue, no pacing,
 * no retry ladder, no answering-machine detection. Rendering a fake "Start
 * campaign" button would be worse than useless, because someone would press it
 * and believe calls were going out.
 *
 * So this screen does the part that is real: it shows whether the tenant is
 * actually equipped for outbound (an outbound-capable trunk, a caller ID, an
 * agent), and lets you verify how a number would be routed before you commit
 * to building a list around it.
 */
import { computed, onMounted, ref } from 'vue'
import { Telephony, Agents, type Trunk, type PhoneNumber, type Agent } from '../../../api/index'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const ui = useUI()

const trunks = ref<Trunk[]>([])
const numbers = ref<PhoneNumber[]>([])
const agents = ref<Agent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const outbound = computed(() => trunks.value.filter((t) => t.direction !== 'inbound'))
const callerIds = computed(() => numbers.value.filter((n) => n.direction !== 'inbound'))

const ready = computed(() => [
  { label: 'Outbound trunk', ok: outbound.value.length > 0,
    detail: outbound.value.length ? outbound.value.map((t) => t.name).join(', ')
                                  : 'Add one under SIP trunks' },
  { label: 'Caller ID', ok: callerIds.value.length > 0,
    detail: callerIds.value.length ? callerIds.value.map((n) => n.e164).join(', ')
                                   : 'Add an outbound-capable number' },
  { label: 'Agent', ok: agents.value.length > 0,
    detail: agents.value.length ? `${agents.value.length} available` : 'Create an agent first' },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    const [t, n, a] = await Promise.all([
      Telephony.trunks(), Telephony.numbers(), Agents.list(),
    ])
    trunks.value = t
    numbers.value = n
    agents.value = a
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const probe = ref('')
const probing = ref(false)
const probeResult = ref<any>(null)

async function check() {
  if (!probe.value.trim()) return
  probing.value = true
  probeResult.value = null
  try {
    probeResult.value = await Telephony.dispatch(probe.value.trim())
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    probing.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Campaigns"
    lede="Outbound calling readiness for this tenant."
    :loading="loading" :error="error" @retry="load"
  >
    <div class="s-card notice">
      <strong>The bulk dialer is not built yet.</strong>
      <p>
        Queuing, pacing, retries and answering-machine detection are a separate piece of
        infrastructure and are not in this release. Everything on this page is real:
        it tells you whether outbound would work, and how a number routes. It does not
        place calls.
      </p>
    </div>

    <h3 class="sub">Readiness</h3>
    <div class="s-cards">
      <article v-for="r in ready" :key="r.label" class="s-card check">
        <header>
          <h4>{{ r.label }}</h4>
          <span class="s-pill" :class="r.ok ? 'ok' : 'bad'">{{ r.ok ? 'Ready' : 'Missing' }}</span>
        </header>
        <p>{{ r.detail }}</p>
      </article>
    </div>

    <h3 class="sub">Check routing</h3>
    <div class="s-card probe">
      <p class="hint">
        Ask the dispatcher which agent a number resolves to, using the same rules an
        inbound call would follow.
      </p>
      <div class="row">
        <input v-model="probe" class="s-input" placeholder="+61 400 000 000"
               @keyup.enter="check" />
        <button class="s-btn primary" :disabled="probing || !probe.trim()" @click="check">
          {{ probing ? 'Checking…' : 'Check' }}
        </button>
      </div>
      <pre v-if="probeResult">{{ JSON.stringify(probeResult, null, 2) }}</pre>
    </div>
  </PageShell>
</template>

<style scoped>
.sub { font-size: .9rem; font-weight: 700; }
.notice { border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
.notice strong { display: block; color: var(--warn); font-size: .88rem; margin-bottom: .3rem; }
.notice p { font-size: .84rem; color: var(--mut); line-height: 1.55; max-width: 76ch; }
.check header { display: flex; align-items: center; gap: .6rem; margin-bottom: .4rem; }
.check h4 { font-size: .88rem; font-weight: 650; }
.check header .s-pill { margin-left: auto; }
.check p { font-size: .82rem; color: var(--mut); }
.probe { display: flex; flex-direction: column; gap: .7rem; }
.probe .hint { font-size: .84rem; color: var(--mut); }
.probe .row { display: flex; gap: .5rem; max-width: 460px; }
pre {
  font-family: var(--mono); font-size: .8rem; line-height: 1.6;
  padding: .7rem; border-radius: var(--r-sm); overflow-x: auto;
  background: color-mix(in srgb, var(--txt) 6%, transparent);
}
</style>
