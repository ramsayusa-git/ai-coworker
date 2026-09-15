<script setup lang="ts">
/**
 * Improvement lab — compare two published versions of an agent side by side,
 * with the calls each one actually handled.
 *
 * It uses the agent_versions history rather than a separate experiment table,
 * so the thing being compared is the thing that ran.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Agents, Sessions, type Agent, type AgentVersion, type CallSession } from '../../../api/index'
import PageShell from '../../../components/ui/PageShell.vue'

const agents = ref<Agent[]>([])
const versions = ref<AgentVersion[]>([])
const calls = ref<CallSession[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const agentId = ref('')
const aId = ref('')
const bId = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    agents.value = await Agents.list()
    if (agents.value.length) agentId.value = agents.value[0].id
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadAgent() {
  if (!agentId.value) return
  try {
    const [v, s] = await Promise.all([
      Agents.versions(agentId.value),
      Sessions.list({ agent_id: agentId.value, limit: 200 }),
    ])
    versions.value = v
    calls.value = s.items
    // Default to the two most recent, which is the comparison people want
    // nine times out of ten.
    aId.value = v[1]?.id ?? v[0]?.id ?? ''
    bId.value = v[0]?.id ?? ''
  } catch (e: any) {
    error.value = e.message
  }
}

function summarise(v?: AgentVersion) {
  if (!v) return null
  const created = v.created_at ? new Date(v.created_at).getTime() : 0
  // A version "owns" the calls made after it was published and before the next
  // one was. Anything else double-counts.
  const next = versions.value
    .filter((x) => x.created_at && new Date(x.created_at).getTime() > created)
    .map((x) => new Date(x.created_at!).getTime())
    .sort((a, b) => a - b)[0] ?? Infinity
  const rows = calls.value.filter((c) => {
    const t = new Date(c.started_at).getTime()
    return t >= created && t < next
  })
  const ttfb = rows.map((r) => r.ttfb_ms).filter(Boolean)
  return {
    version: v.version,
    note: v.note,
    calls: rows.length,
    minutes: +(rows.reduce((n, r) => n + r.duration_s, 0) / 60).toFixed(1),
    spend: +rows.reduce((n, r) => n + r.cost, 0).toFixed(2),
    ttfb: ttfb.length ? Math.round(ttfb.reduce((a, b) => a + b, 0) / ttfb.length) : 0,
    completed: rows.length
      ? Math.round((rows.filter((r) => r.outcome === 'completed').length / rows.length) * 100)
      : 0,
    pipeline: v.pipeline ?? {},
  }
}

const A = computed(() => summarise(versions.value.find((v) => v.id === aId.value)))
const B = computed(() => summarise(versions.value.find((v) => v.id === bId.value)))

function delta(a?: number, b?: number) {
  if (a === undefined || b === undefined || !a) return null
  return Math.round(((b - a) / a) * 100)
}

watch(agentId, loadAgent)
onMounted(async () => { await load(); await loadAgent() })
</script>

<template>
  <PageShell
    title="Improvement lab"
    lede="Compare two published versions of an agent using the calls each one actually handled. A version owns the traffic between its publish and the next."
    :loading="loading" :error="error" :empty="agents.length === 0"
    empty-title="No agents yet"
    @retry="load"
  >
    <template #actions>
      <select v-model="agentId" class="s-select">
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </template>

    <p v-if="versions.length < 2" class="none">
      This agent has {{ versions.length }} published version(s). Publish another from the
      designer and the two become comparable here.
    </p>

    <template v-else>
      <div class="pick">
        <label>Baseline
          <select v-model="aId" class="s-select">
            <option v-for="v in versions" :key="v.id" :value="v.id">v{{ v.version }} — {{ v.note || 'no note' }}</option>
          </select>
        </label>
        <label>Compared with
          <select v-model="bId" class="s-select">
            <option v-for="v in versions" :key="v.id" :value="v.id">v{{ v.version }} — {{ v.note || 'no note' }}</option>
          </select>
        </label>
      </div>

      <div class="cols">
        <article v-for="(s, i) in [A, B]" :key="i" class="s-card col">
          <header>
            <h3>v{{ s?.version }}</h3>
            <span class="s-pill">{{ i === 0 ? 'Baseline' : 'Compared' }}</span>
          </header>
          <p v-if="s?.note" class="note">{{ s.note }}</p>
          <div class="s-kv"><dt>Calls</dt><dd>{{ s?.calls }}</dd></div>
          <div class="s-kv"><dt>Minutes</dt><dd>{{ s?.minutes }}</dd></div>
          <div class="s-kv"><dt>Spend</dt><dd>${{ s?.spend }}</dd></div>
          <div class="s-kv"><dt>Avg TTFB</dt><dd>{{ s?.ttfb }}ms</dd></div>
          <div class="s-kv"><dt>Completed</dt><dd>{{ s?.completed }}%</dd></div>
          <div class="s-kv" v-for="(v, k) in s?.pipeline" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
        </article>
      </div>

      <div v-if="A?.calls && B?.calls" class="s-card verdict">
        <h3>Difference</h3>
        <ul>
          <li>
            TTFB
            <strong :class="(delta(A.ttfb, B.ttfb) ?? 0) <= 0 ? 'good' : 'bad'">
              {{ (delta(A.ttfb, B.ttfb) ?? 0) > 0 ? '+' : '' }}{{ delta(A.ttfb, B.ttfb) }}%
            </strong>
          </li>
          <li>
            Completion rate
            <strong :class="B.completed >= A.completed ? 'good' : 'bad'">
              {{ B.completed - A.completed > 0 ? '+' : '' }}{{ B.completed - A.completed }} pts
            </strong>
          </li>
          <li>
            Cost per call
            <strong>
              ${{ (B.spend / B.calls).toFixed(3) }} vs ${{ (A.spend / A.calls).toFixed(3) }}
            </strong>
          </li>
        </ul>
        <p class="caveat">
          These are observational, not a controlled test — traffic mix changes between
          versions too. Treat a small difference on few calls as noise.
        </p>
      </div>
    </template>
  </PageShell>
</template>

<style scoped>
.none { font-size: .85rem; color: var(--mut); }
.pick { display: flex; gap: 1rem; flex-wrap: wrap; }
.pick label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; color: var(--mut); }
.cols { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.col header { display: flex; align-items: center; gap: .6rem; margin-bottom: .5rem; }
.col h3 { font-size: .95rem; font-weight: 700; }
.col header .s-pill { margin-left: auto; }
.note { font-size: .82rem; color: var(--mut); margin-bottom: .5rem; }
.verdict h3 { font-size: .9rem; font-weight: 700; margin-bottom: .5rem; }
.verdict ul { list-style: none; display: flex; flex-direction: column; gap: .35rem; }
.verdict li { display: flex; justify-content: space-between; font-size: .87rem; }
.verdict strong { font-family: var(--mono); font-size: .85rem; }
.verdict .good { color: var(--ok); }
.verdict .bad { color: var(--bad); }
.caveat { font-size: .78rem; color: var(--mut); margin-top: .7rem; line-height: 1.5; }
</style>
