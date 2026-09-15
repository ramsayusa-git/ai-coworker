<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, markRaw } from 'vue'
import { GridStack, type GridStackNode } from 'gridstack'
import 'gridstack/dist/gridstack.css'
import {
  PhoneCall, Clock, Gauge, DollarSign, RefreshCw, LayoutGrid, Check,
  RotateCcw, Plus, X, GripVertical,
} from '@lucide/vue'

import { Analytics, Sessions, type Overview, type CallSession } from '../../api'
import { useLayout, type WidgetNode } from '../../stores/layout'
import { useUI } from '../../stores/ui'

import StatTile from '../../components/widgets/StatTile.vue'
import VolumeChart from '../../components/widgets/VolumeChart.vue'
import DonutChart from '../../components/widgets/DonutChart.vue'
import BarList from '../../components/widgets/BarList.vue'
import RecentCalls from '../../components/widgets/RecentCalls.vue'

const layout = useLayout()
const ui = useUI()

const overview = ref<Overview | null>(null)
const recent = ref<CallSession[]>([])
const loading = ref(true)
const error = ref('')
const hours = ref(24)

const gridEl = ref<HTMLElement | null>(null)
let grid: GridStack | null = null

const RANGES = [
  { h: 24, label: '24h' },
  { h: 168, label: '7d' },
  { h: 720, label: '30d' },
]

/** Every widget the user can place. Title/min sizes live here, not in layout. */
const REGISTRY: Record<string, { title: string; minW: number; minH: number; pad?: boolean }> = {
  'stat-calls': { title: 'Calls handled', minW: 2, minH: 2 },
  'stat-minutes': { title: 'Talk minutes', minW: 2, minH: 2 },
  'stat-ttfb': { title: 'Time to first byte', minW: 2, minH: 2 },
  'stat-cost': { title: 'Spend', minW: 2, minH: 2 },
  'call-volume': { title: 'Call volume', minW: 4, minH: 4 },
  'outcomes': { title: 'Outcomes', minW: 3, minH: 4 },
  'top-agents': { title: 'Busiest agents', minW: 3, minH: 3 },
  'recent-calls': { title: 'Recent calls', minW: 3, minH: 3 },
}

const addable = computed(() =>
  Object.entries(REGISTRY).map(([type, meta]) => ({ type, title: meta.title })))

const showAdd = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [ov, page] = await Promise.all([
      Analytics.overview(hours.value),
      Sessions.list({ limit: 8 }),
    ])
    overview.value = ov
    recent.value = page.items
  } catch (e: any) {
    error.value = e.message || 'Could not load dashboard data.'
  } finally {
    loading.value = false
  }
}

function setRange(h: number) {
  hours.value = h
  load()
}

const agentItems = computed(() =>
  (overview.value?.by_agent ?? []).map((a) => ({
    label: a.agent, value: a.calls, id: a.agent_id,
  })).sort((a, b) => b.value - a.value))

// ------------------------------------------------------------- gridstack ---

function initGrid() {
  if (!gridEl.value) return
  const g = GridStack.init(
    {
      column: 12,
      cellHeight: 76,
      margin: 10,
      float: false,
      animate: true,
      disableDrag: !layout.editing,
      disableResize: !layout.editing,
      handle: '.w-grip',
      resizable: { handles: 'se, sw, e, s, w' },
      columnOpts: {
        breakpointForWindow: true,
        breakpoints: [
          { w: 700, c: 1 },
          { w: 1000, c: 6 },
          { w: 1400, c: 12 },
        ],
      },
    },
    gridEl.value,
  )
  if (!g) return
  grid = g
  g.on('change', () => { layout.dirty = true })
}

function currentNodes(): WidgetNode[] {
  if (!grid) return layout.nodes
  // save(false) returns widgets without their DOM content; the union type in
  // gridstack's declarations is wider than what this overload actually yields.
  const saved = grid.save(false) as GridStackNode[]
  return saved.map((n) => ({
    id: String(n.id),
    type: String(layout.nodes.find((x) => x.id === n.id)?.type ?? ''),
    x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 3, h: n.h ?? 3,
  }))
}

function setInteractive(on: boolean) {
  if (!grid) return
  // setStatic alone does not re-enable widgets that were initialised disabled,
  // so move and resize are toggled explicitly.
  grid.setStatic(!on)
  grid.enableMove(on)
  grid.enableResize(on)
}

function toggleEdit() {
  layout.editing = !layout.editing
  setInteractive(layout.editing)
  if (!layout.editing) saveLayout()
}

function saveLayout() {
  const nodes = currentNodes().map((n) => {
    const known = layout.nodes.find((x) => x.id === n.id)
    return { ...n, type: n.type || known?.type || '' }
  }).filter((n) => n.type)
  layout.save(nodes)
  ui.success('Layout saved')
}

async function resetLayout() {
  if (!confirm('Reset the dashboard to its default arrangement?')) return
  layout.reset()
  await rebuild()
  ui.info('Layout reset')
}

async function addWidget(type: string) {
  showAdd.value = false
  layout.add(type)
  await rebuild()
  if (!layout.editing) toggleEdit()
}

async function removeWidget(id: string) {
  layout.remove(id)
  await rebuild()
}

/** Tear down and re-init after the node list changes structurally. */
async function rebuild() {
  grid?.destroy(false)
  grid = null
  await nextTick()
  initGrid()
  setInteractive(layout.editing)
}

onMounted(async () => {
  layout.load()
  await load()
  await nextTick()
  initGrid()
})

onBeforeUnmount(() => {
  grid?.destroy(false)
  grid = null
})
</script>

<template>
  <div class="dash">
    <!-- toolbar -->
    <div class="bar glass">
      <div class="ranges">
        <button v-for="r in RANGES" :key="r.h" :class="{ on: hours === r.h }"
                @click="setRange(r.h)">{{ r.label }}</button>
      </div>

      <div class="bar-right">
        <button class="ghost" @click="load" :disabled="loading" title="Refresh data">
          <RefreshCw :size="15" :class="{ spin: loading }" />
          <span class="hide-sm">Refresh</span>
        </button>

        <button v-if="layout.editing" class="ghost" @click="showAdd = !showAdd">
          <Plus :size="15" /><span class="hide-sm">Widget</span>
        </button>
        <button v-if="layout.editing" class="ghost" @click="resetLayout" title="Reset layout">
          <RotateCcw :size="15" /><span class="hide-sm">Reset</span>
        </button>

        <button class="edit" :class="{ on: layout.editing }" @click="toggleEdit">
          <component :is="layout.editing ? Check : LayoutGrid" :size="15" />
          {{ layout.editing ? 'Done' : 'Customise' }}
        </button>
      </div>

      <transition name="pop">
        <div v-if="showAdd" class="add-menu surface">
          <p>Add a widget</p>
          <button v-for="a in addable" :key="a.type" @click="addWidget(a.type)">
            <Plus :size="13" /> {{ a.title }}
          </button>
        </div>
      </transition>
    </div>

    <div v-if="layout.editing" class="hint">
      Drag widgets by their handle, resize from any edge, then press Done to save.
    </div>

    <div v-if="error" class="err surface">
      <strong>Could not load dashboard data</strong>
      <p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <!-- grid -->
    <div ref="gridEl" class="grid-stack" :class="{ editing: layout.editing }">
      <div
        v-for="n in layout.nodes"
        :key="n.id"
        class="grid-stack-item"
        :gs-id="n.id"
        :gs-x="n.x" :gs-y="n.y" :gs-w="n.w" :gs-h="n.h"
        :gs-min-w="REGISTRY[n.type]?.minW ?? 2"
        :gs-min-h="REGISTRY[n.type]?.minH ?? 2"
      >
        <div class="grid-stack-item-content widget surface">
          <header class="w-head">
            <span class="w-grip" v-if="layout.editing" title="Drag to move">
              <GripVertical :size="14" />
            </span>
            <h3>{{ REGISTRY[n.type]?.title ?? n.type }}</h3>
            <button v-if="layout.editing" class="w-x" @click="removeWidget(n.id)"
                    :aria-label="`Remove ${REGISTRY[n.type]?.title}`">
              <X :size="14" />
            </button>
          </header>

          <div class="w-body">
            <StatTile v-if="n.type === 'stat-calls'" label="Calls handled"
                      :value="overview?.calls ?? null" :icon="markRaw(PhoneCall)"
                      :loading="loading" :spark="overview?.per_hour" tone="acc" />
            <StatTile v-else-if="n.type === 'stat-minutes'" label="Talk minutes"
                      :value="overview?.minutes ?? null" :icon="markRaw(Clock)"
                      :loading="loading" tone="ok" />
            <StatTile v-else-if="n.type === 'stat-ttfb'" label="Time to first byte"
                      :value="overview?.ttfb_ms ?? null" unit="ms" :icon="markRaw(Gauge)"
                      :loading="loading" tone="warn" />
            <StatTile v-else-if="n.type === 'stat-cost'" label="Spend"
                      :value="overview?.cost ?? null" prefix="$" :decimals="2"
                      :icon="markRaw(DollarSign)" :loading="loading" tone="acc" />

            <VolumeChart v-else-if="n.type === 'call-volume'"
                         :data="overview?.per_hour ?? []" :loading="loading"
                         :tz="overview?.tz" />

            <DonutChart v-else-if="n.type === 'outcomes'"
                        :data="overview?.by_outcome ?? {}" :loading="loading" />

            <BarList v-else-if="n.type === 'top-agents'" :items="agentItems"
                     :loading="loading" empty-title="No agent activity"
                     empty-body="Traffic appears once an agent takes a call."
                     @pick="(id) => $router.push(`/app/agents/${id}`)" />

            <RecentCalls v-else-if="n.type === 'recent-calls'" :items="recent"
                         :loading="loading" />

            <div v-else class="unknown">Unknown widget “{{ n.type }}”</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash { position: relative; }

/* ---------------- toolbar ---------------- */
.bar {
  position: relative; display: flex; align-items: center; gap: .8rem;
  padding: .55rem .7rem; margin-bottom: 1rem;
  border-radius: var(--r-md); box-shadow: var(--sh-1);
  flex-wrap: wrap;
}
.ranges { display: flex; gap: .25rem; }
.ranges button {
  padding: .42rem .8rem; border-radius: var(--r-sm); font-size: .83rem; font-weight: 600;
  border: 1px solid transparent; background: transparent; color: var(--mut);
  transition: all var(--fast) var(--ease);
}
.ranges button:hover { color: var(--txt); background: color-mix(in srgb, var(--txt) 6%, transparent); }
.ranges button.on {
  color: var(--txt); background: color-mix(in srgb, var(--acc) 16%, transparent);
  border-color: color-mix(in srgb, var(--acc) 40%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--acc) 22%, transparent);
}

.bar-right { margin-left: auto; display: flex; gap: .4rem; align-items: center; }
.ghost, .edit {
  display: inline-flex; align-items: center; gap: .38rem;
  padding: .45rem .8rem; border-radius: var(--r-sm); font-size: .83rem; font-weight: 600;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 3%, transparent);
  color: var(--mut); transition: all var(--fast) var(--ease);
}
.ghost:hover:not(:disabled) { color: var(--txt); transform: translateY(-1px); }
.ghost:disabled { opacity: .45; cursor: not-allowed; }
.edit { border-color: color-mix(in srgb, var(--acc) 40%, transparent); color: var(--txt); }
.edit.on {
  background: var(--acc); color: #fff; border-color: transparent;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--acc) 45%, transparent);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.add-menu {
  position: absolute; top: calc(100% + 8px); right: .7rem; z-index: 30;
  width: 210px; padding: .45rem; box-shadow: var(--sh-3);
}
.add-menu p {
  font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--mut); padding: .4rem .55rem .3rem;
}
.add-menu button {
  display: flex; align-items: center; gap: .45rem; width: 100%;
  padding: .45rem .55rem; border: 0; border-radius: var(--r-sm);
  background: none; color: var(--txt-2); font-size: .84rem; text-align: left;
  transition: background var(--fast) var(--ease);
}
.add-menu button:hover { background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--txt); }
.pop-enter-active, .pop-leave-active { transition: opacity var(--fast) var(--ease), transform var(--fast) var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px) scale(.97); }

.hint {
  padding: .6rem .9rem; margin-bottom: .9rem; border-radius: var(--r-sm);
  font-size: .83rem; color: var(--acc);
  background: color-mix(in srgb, var(--acc) 10%, transparent);
  border: 1px dashed color-mix(in srgb, var(--acc) 40%, transparent);
}

/* ---------------- widgets ---------------- */
.widget {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  padding: .9rem 1rem 1rem;
  transition: box-shadow var(--mid) var(--ease), transform var(--mid) var(--ease),
              border-color var(--mid) var(--ease);
}
.widget::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: radial-gradient(420px circle at 50% -30%,
              color-mix(in srgb, var(--acc) 12%, transparent), transparent 70%);
  opacity: 0; transition: opacity var(--mid) var(--ease); pointer-events: none;
}
.widget:hover { box-shadow: var(--sh-2); border-color: var(--line-2); }
.widget:hover::before { opacity: 1; }

.w-head { display: flex; align-items: center; gap: .45rem; margin-bottom: .6rem; position: relative; }
.w-head h3 {
  font-size: .78rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.w-grip {
  display: grid; place-items: center; color: var(--mut); cursor: move;
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
}
.w-grip:hover { background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--txt); }
.w-x {
  margin-left: auto; display: grid; place-items: center; width: 22px; height: 22px;
  border-radius: 6px; border: 0; background: none; color: var(--mut);
  transition: all var(--fast) var(--ease);
}
.w-x:hover { background: color-mix(in srgb, var(--bad) 16%, transparent); color: var(--bad); }

.w-body { flex: 1; min-height: 0; position: relative; }
.unknown { display: grid; place-content: center; height: 100%; color: var(--mut); font-size: .85rem; }

/* editing affordance */
.grid-stack.editing .widget {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--acc) 45%, transparent);
}
.grid-stack.editing .widget:hover { transform: translateY(-2px); }

/* gridstack chrome */
:deep(.grid-stack-item-content) { inset: 0; }
:deep(.ui-resizable-handle) { opacity: 0; transition: opacity var(--fast) var(--ease); }
.grid-stack.editing :deep(.ui-resizable-handle) { opacity: .9; }
:deep(.grid-stack-placeholder > .placeholder-content) {
  border: 2px dashed color-mix(in srgb, var(--acc) 60%, transparent);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--acc) 8%, transparent);
}

.err { padding: 2rem; text-align: center; border-color: color-mix(in srgb, var(--bad) 35%, transparent); }
.err strong { display: block; color: var(--bad); margin-bottom: .3rem; }
.err p { color: var(--mut); font-size: .87rem; margin-bottom: 1rem; }
.err button {
  padding: .5rem 1.1rem; border: 0; border-radius: var(--r-sm);
  background: var(--acc); color: #fff; font-weight: 600;
}

@media (max-width: 640px) {
  .hide-sm { display: none; }
  .bar { gap: .5rem; }
  .bar-right { margin-left: 0; width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
  .widget:hover { transform: none; }
}
</style>
