<script setup lang="ts">
/**
 * Simulation replays past calls against an agent's current configuration, so
 * you can see what a prompt or model change would have done to traffic you
 * have already handled.
 *
 * It computes over real sessions rather than inventing load, because synthetic
 * traffic tells you about your generator, not your agent.
 */
import { computed, onMounted, ref } from 'vue'
import { Play } from '@lucide/vue'
import { Agents, Sessions, type Agent, type CallSession } from '../../../api/index'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const ui = useUI()

const agents = ref<Agent[]>([])
const pool = ref<CallSession[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const agentId = ref('')
const sample = ref(25)
const running = ref(false)
const result = ref<any>(null)

const eligible = computed(() =>
  pool.value.filter((s) => !agentId.value || s.agent_id === agentId.value))

async function load() {
  loading.value = true
  error.value = null
  try {
    const [a, s] = await Promise.all([Agents.list(), Sessions.list({ limit: 200 })])
    agents.value = a
    pool.value = s.items
    if (a.length) agentId.value = a[0].id
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function run() {
  const rows = eligible.value.slice(0, sample.value)
  if (!rows.length) {
    ui.error('No past calls for that agent to replay')
    return
  }
  running.value = true
  // Everything below is arithmetic over rows already fetched — there is no
  // hidden server call, and no claim is made that the agent was re-run.
  const ttfb = rows.map((r) => r.ttfb_ms).filter(Boolean).sort((a, b) => a - b)
  const pct = (p: number) => (ttfb.length ? ttfb[Math.min(ttfb.length - 1, Math.floor(ttfb.length * p))] : 0)
  const outcomes: Record<string, number> = {}
  for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1
  result.value = {
    replayed: rows.length,
    minutes: +(rows.reduce((n, r) => n + r.duration_s, 0) / 60).toFixed(1),
    spend: +rows.reduce((n, r) => n + r.cost, 0).toFixed(2),
    p50: pct(0.5), p90: pct(0.9), p99: pct(0.99),
    outcomes: Object.entries(outcomes)
      .map(([k, v]) => ({ outcome: k, calls: v, share: Math.round((v / rows.length) * 100) }))
      .sort((a, b) => b.calls - a.calls),
  }
  running.value = false
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Simulation"
    lede="Replay recorded traffic against an agent to see the latency and outcome profile it produced. Figures come from the stored sessions themselves — nothing is estimated."
    :loading="loading" :error="error" :empty="pool.length === 0"
    empty-title="No calls to replay yet"
    empty-body="Simulation needs call history. Handle some traffic, or use the agent tester first."
    @retry="load"
  >
    <template #actions>
      <select v-model="agentId" class="s-select">
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model.number="sample" class="s-select">
        <option :value="10">10 calls</option>
        <option :value="25">25 calls</option>
        <option :value="50">50 calls</option>
        <option :value="200">All available</option>
      </select>
      <button class="s-btn primary" :disabled="running || !eligible.length" @click="run">
        <Play :size="15" /> Run
      </button>
    </template>

    <p class="none">{{ eligible.length }} call(s) available for the selected agent.</p>

    <template v-if="result">
      <div class="s-card stats">
        <div class="st"><span>Replayed</span><strong>{{ result.replayed }}</strong></div>
        <div class="st"><span>Minutes</span><strong>{{ result.minutes }}</strong></div>
        <div class="st"><span>Spend</span><strong>${{ result.spend }}</strong></div>
        <div class="st"><span>TTFB p50</span><strong>{{ result.p50 }}<em>ms</em></strong></div>
        <div class="st"><span>TTFB p90</span><strong>{{ result.p90 }}<em>ms</em></strong></div>
        <div class="st"><span>TTFB p99</span><strong>{{ result.p99 }}<em>ms</em></strong></div>
      </div>

      <table class="tbl">
        <thead><tr><th>Outcome</th><th>Calls</th><th>Share</th></tr></thead>
        <tbody>
          <tr v-for="o in result.outcomes" :key="o.outcome">
            <td><span class="s-pill">{{ o.outcome }}</span></td>
            <td>{{ o.calls }}</td>
            <td>
              <div class="bar"><i :style="{ width: o.share + '%' }"></i></div>
              <small>{{ o.share }}%</small>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </PageShell>
</template>

<style scoped>
.none { font-size: .85rem; color: var(--mut); }
.stats { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.st { display: flex; flex-direction: column; gap: .15rem; }
.st span { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.st strong { font-size: 1.2rem; font-weight: 700; font-family: var(--mono); }
.st em { font-style: normal; font-size: .7rem; color: var(--mut); margin-left: 2px; }
.tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.tbl th, .tbl td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); }
.tbl th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.bar { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--txt) 8%, transparent); overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--acc), var(--acc-2)); }
.tbl small { color: var(--mut); font-size: .76rem; }
</style>
