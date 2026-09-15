<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { PhoneCall, Clock, Gauge, DollarSign, RefreshCw } from '@lucide/vue'
import { Analytics, type Overview } from '../../api'

const data = ref<Overview | null>(null)
const loading = ref(true)
const error = ref('')
const hours = ref(24)

const RANGES = [
  { h: 24, label: '24 h' },
  { h: 168, label: '7 d' },
  { h: 720, label: '30 d' },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await Analytics.overview(hours.value)
  } catch (e: any) {
    error.value = e.message || 'Could not load analytics.'
  } finally {
    loading.value = false
  }
}

function setRange(h: number) {
  hours.value = h
  load()
}

onMounted(load)

const tiles = computed(() => {
  const d = data.value
  return [
    { icon: PhoneCall, label: 'Calls handled', value: d ? d.calls.toLocaleString() : '—' },
    { icon: Clock, label: 'Talk minutes', value: d ? d.minutes.toLocaleString() : '—' },
    { icon: Gauge, label: 'Time to first byte', value: d ? `${d.ttfb_ms}` : '—', unit: 'ms' },
    { icon: DollarSign, label: 'Spend', value: d ? `$${d.cost.toFixed(2)}` : '—' },
  ]
})

// Bars are drawn from the max so an all-zero window renders a flat baseline
// rather than dividing by zero.
const peak = computed(() => Math.max(1, ...(data.value?.per_hour ?? [0])))
const outcomes = computed(() => Object.entries(data.value?.by_outcome ?? {}))
const totalOutcomes = computed(() =>
  outcomes.value.reduce((a, [, n]) => a + (n as number), 0) || 1)

const OUTCOME_COLOR: Record<string, string> = {
  completed: 'var(--brand-success, #34d399)',
  transferred: 'var(--brand-accent, #22d3ee)',
  'no-answer': 'var(--brand-muted, #9aa2b4)',
  failed: 'var(--brand-danger, #f87171)',
  'in-progress': 'var(--brand-primary, #6d5efc)',
}
</script>

<template>
  <div class="dash">
    <div class="bar">
      <div class="ranges">
        <button v-for="r in RANGES" :key="r.h" :class="{ on: hours === r.h }"
                @click="setRange(r.h)">{{ r.label }}</button>
      </div>
      <button class="refresh" @click="load" :disabled="loading" aria-label="Refresh">
        <RefreshCw :size="15" :class="{ spin: loading }" /> Refresh
      </button>
    </div>

    <div v-if="error" class="err">
      <strong>Could not load analytics</strong>
      <p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <template v-else>
      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile">
          <span class="tile-icon"><component :is="t.icon" :size="17" /></span>
          <span class="tile-label">{{ t.label }}</span>
          <span class="tile-value" :class="{ dim: loading }">
            {{ t.value }}<small v-if="t.unit && data">{{ t.unit }}</small>
          </span>
        </div>
      </div>

      <div class="cards">
        <section class="card">
          <header>
            <h2>Call volume</h2>
            <span>per hour · {{ data?.tz || '' }}</span>
          </header>
          <div v-if="loading" class="chart-sk"></div>
          <div v-else-if="!data?.calls" class="empty">
            <strong>No calls in this window</strong>
            <p>Once agents start taking calls, volume appears here.</p>
          </div>
          <div v-else class="chart" role="img"
               :aria-label="`Call volume, peak ${peak} per hour`">
            <div v-for="(n, i) in data.per_hour" :key="i" class="bar-col"
                 :style="{ height: Math.max(2, (n / peak) * 100) + '%' }"
                 :title="`${n} call${n === 1 ? '' : 's'}`"></div>
          </div>
          <footer v-if="data?.calls"><span>Peak {{ peak }} / hour</span></footer>
        </section>

        <section class="card">
          <header><h2>Outcomes</h2><span>how calls ended</span></header>
          <div v-if="loading" class="chart-sk"></div>
          <div v-else-if="!outcomes.length" class="empty">
            <strong>Nothing to break down yet</strong>
          </div>
          <ul v-else class="outcomes">
            <li v-for="[name, n] in outcomes" :key="name">
              <span class="dot" :style="{ background: OUTCOME_COLOR[name] || 'var(--brand-muted)' }"></span>
              <span class="oname">{{ name }}</span>
              <span class="obar">
                <i :style="{ width: ((n as number) / totalOutcomes * 100) + '%',
                             background: OUTCOME_COLOR[name] || 'var(--brand-muted)' }"></i>
              </span>
              <span class="ocount">{{ n }}</span>
            </li>
          </ul>
        </section>

        <section class="card wide">
          <header><h2>Busiest agents</h2><span>calls in this window</span></header>
          <div v-if="loading" class="chart-sk short"></div>
          <div v-else-if="!data?.by_agent?.length" class="empty">
            <strong>No agent activity yet</strong>
            <p>Create an agent and point a number at it to see traffic here.</p>
          </div>
          <ul v-else class="agents">
            <li v-for="a in data.by_agent" :key="a.agent_id">
              <span class="aname">{{ a.agent }}</span>
              <span class="abar">
                <i :style="{ width: (a.calls / Math.max(...data.by_agent.map(x => x.calls)) * 100) + '%' }"></i>
              </span>
              <span class="acount">{{ a.calls }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.3rem; flex-wrap: wrap; }
.ranges { display: flex; gap: .3rem; }
.ranges button {
  padding: .45rem .9rem; font-size: .85rem; font-weight: 600;
  border-radius: 8px; border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: var(--brand-muted, #9aa2b4);
}
.ranges button.on {
  background: rgba(109,94,252,.18); color: #fff;
  border-color: rgba(109,94,252,.45);
}
.refresh {
  margin-left: auto; display: inline-flex; align-items: center; gap: .4rem;
  padding: .45rem .85rem; font-size: .85rem; border-radius: 8px;
  border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: var(--brand-muted, #9aa2b4);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem; }
.tile {
  padding: 1.2rem; border-radius: var(--brand-radius-md, 12px);
  border: 1px solid var(--line, rgba(255,255,255,.09));
  background: var(--brand-panel, #0f111a);
  display: flex; flex-direction: column; gap: .35rem;
}
.tile-icon {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px;
  background: rgba(109,94,252,.16); color: var(--brand-accent, #22d3ee); margin-bottom: .3rem;
}
.tile-label { font-size: .8rem; color: var(--brand-muted, #9aa2b4); }
.tile-value {
  font-size: 1.7rem; font-weight: 750; letter-spacing: -.03em;
  font-family: var(--brand-mono, ui-monospace), monospace;
}
.tile-value.dim { opacity: .4; }
.tile-value small { font-size: .9rem; margin-left: 2px; color: var(--brand-muted, #9aa2b4); }

.cards { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; }
.card {
  padding: 1.2rem; border-radius: var(--brand-radius-md, 12px);
  border: 1px solid var(--line, rgba(255,255,255,.09));
  background: var(--brand-panel, #0f111a);
}
.card.wide { grid-column: 1 / -1; }
.card header { display: flex; align-items: baseline; gap: .7rem; margin-bottom: 1.1rem; }
.card h2 { font-size: .98rem; font-weight: 650; }
.card header span { font-size: .8rem; color: var(--brand-muted, #9aa2b4); }
.card footer { margin-top: .7rem; font-size: .8rem; color: var(--brand-muted, #9aa2b4); }

.chart { display: flex; align-items: flex-end; gap: 2px; height: 150px; }
.bar-col {
  flex: 1; min-height: 2px; border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--brand-accent, #22d3ee), var(--brand-primary, #6d5efc));
  opacity: .9;
}
.chart-sk {
  height: 150px; border-radius: 10px;
  background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04));
  background-size: 200% 100%; animation: shimmer 1.3s linear infinite;
}
.chart-sk.short { height: 90px; }
@keyframes shimmer { to { background-position: -200% 0; } }

.empty { padding: 2.4rem 1rem; text-align: center; }
.empty strong { display: block; font-size: .95rem; margin-bottom: .3rem; }
.empty p { font-size: .85rem; color: var(--brand-muted, #9aa2b4); }

.outcomes, .agents { list-style: none; padding: 0; margin: 0; display: grid; gap: .8rem; }
.outcomes li { display: grid; grid-template-columns: 10px 6.5rem 1fr auto; gap: .6rem; align-items: center; font-size: .86rem; }
.dot { width: 9px; height: 9px; border-radius: 50%; }
.oname { text-transform: capitalize; color: var(--brand-muted, #9aa2b4); }
.obar, .abar { height: 7px; border-radius: 4px; background: rgba(255,255,255,.07); overflow: hidden; }
.obar i, .abar i { display: block; height: 100%; border-radius: 4px; }
.abar i { background: linear-gradient(90deg, var(--brand-primary, #6d5efc), var(--brand-accent, #22d3ee)); }
.ocount, .acount { font-family: var(--brand-mono, ui-monospace), monospace; font-size: .82rem; }
.agents li { display: grid; grid-template-columns: 11rem 1fr auto; gap: .8rem; align-items: center; font-size: .87rem; }
.aname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.err {
  padding: 2.5rem; text-align: center;
  border: 1px solid rgba(248,113,113,.3); border-radius: 12px;
  background: rgba(248,113,113,.07);
}
.err strong { display: block; color: var(--brand-danger, #f87171); margin-bottom: .3rem; }
.err p { color: var(--brand-muted, #9aa2b4); font-size: .88rem; margin-bottom: 1rem; }
.err button {
  padding: .5rem 1.1rem; border: 0; border-radius: 8px;
  background: var(--brand-primary, #6d5efc); color: #fff; font-weight: 600;
}

@media (max-width: 1000px) {
  .tiles { grid-template-columns: 1fr 1fr; }
  .cards { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .tiles { grid-template-columns: 1fr; }
  .outcomes li { grid-template-columns: 10px 5rem 1fr auto; }
  .agents li { grid-template-columns: 7rem 1fr auto; }
}
@media (prefers-reduced-motion: reduce) {
  .spin, .chart-sk { animation: none; }
}
</style>
