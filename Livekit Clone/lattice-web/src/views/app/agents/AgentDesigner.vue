<script setup lang="ts">
/**
 * Visual agent designer.
 *
 * Edits a NODE GRAPH (layout + authoring metadata) and compiles it down to the
 * flat `pipeline` object Core already accepts. Keeping the two separate is what
 * lets the canvas carry positions and branch structure without changing the
 * runtime contract.
 */
import { ref, computed, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Save, Play, Trash2, Plus, AlertTriangle, CheckCircle2,
  LogIn, Mic, Cpu, AudioWaveform, Wrench, GitBranch, PhoneForwarded, PhoneOff,
  Webhook, Maximize2, History, X,
} from '@lucide/vue'
import { Agents, Components, type Agent, type AgentVersion, type VersionDiff } from '../../../api'
import { useUI } from '../../../stores/ui'

const route = useRoute()
const router = useRouter()
const ui = useUI()

interface GNode {
  id: string
  type: string
  x: number
  y: number
  config: Record<string, any>
}
interface GEdge { from: string; to: string }

const PALETTE: Record<string, { label: string; icon: any; color: string; once?: boolean }> = {
  entry: { label: 'Entry', icon: markRaw(LogIn), color: 'var(--ok)', once: true },
  stt: { label: 'Speech to text', icon: markRaw(Mic), color: 'var(--acc-2)' },
  llm: { label: 'Language model', icon: markRaw(Cpu), color: 'var(--acc)' },
  tts: { label: 'Text to speech', icon: markRaw(AudioWaveform), color: 'var(--acc-3)' },
  tool: { label: 'Tool call', icon: markRaw(Wrench), color: 'var(--warn)' },
  branch: { label: 'Branch', icon: markRaw(GitBranch), color: 'var(--warn)' },
  transfer: { label: 'Transfer', icon: markRaw(PhoneForwarded), color: 'var(--mut)' },
  hangup: { label: 'Hang up', icon: markRaw(PhoneOff), color: 'var(--bad)' },
  webhook: { label: 'Webhook', icon: markRaw(Webhook), color: 'var(--mut)' },
}

const agent = ref<Agent | null>(null)
const nodes = ref<GNode[]>([])
const edges = ref<GEdge[]>([])
const selected = ref<string | null>(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const installed = ref<any[]>([])

const versions = ref<AgentVersion[]>([])
const currentVersion = ref<number | null>(null)
const note = ref('')
const historyOpen = ref(false)
const diffing = ref(false)
const diff = ref<VersionDiff | null>(null)

const canvas = ref<HTMLElement | null>(null)
const pan = ref({ x: 0, y: 0 })
const zoom = ref(1)
const linkFrom = ref<string | null>(null)

let drag: { id: string; dx: number; dy: number } | null = null
let panning: { x: number; y: number } | null = null

const sel = computed(() => nodes.value.find((n) => n.id === selected.value) || null)

/** Provider names aetosd reports, so the dropdowns reflect what is installed. */
const providersFor = (kind: string) =>
  installed.value
    .map((c: any) => c.name as string)
    .filter((n) => typeof n === 'string' && n.startsWith(kind))

// ------------------------------------------------------------ validation ---

const problems = computed(() => {
  const out: { node?: string; msg: string }[] = []
  const entries = nodes.value.filter((n) => n.type === 'entry')
  if (entries.length === 0) out.push({ msg: 'There is no Entry node — the call has nowhere to start.' })
  if (entries.length > 1) out.push({ msg: 'More than one Entry node. Exactly one is allowed.' })

  const linked = new Set<string>()
  edges.value.forEach((e) => { linked.add(e.from); linked.add(e.to) })
  nodes.value.forEach((n) => {
    if (nodes.value.length > 1 && !linked.has(n.id)) {
      out.push({ node: n.id, msg: `${PALETTE[n.type]?.label ?? n.type} is not connected to anything.` })
    }
    if ((n.type === 'stt' || n.type === 'llm' || n.type === 'tts') && !n.config.component) {
      out.push({ node: n.id, msg: `${PALETTE[n.type]?.label} has no provider selected.` })
    }
    if (n.type === 'tool' && !n.config.name) {
      out.push({ node: n.id, msg: 'Tool node has no tool name.' })
    }
  })
  return out
})

const valid = computed(() => problems.value.length === 0)

/** Flatten the graph into the Pipeline shape Core stores on the agent. */
function compile(): Record<string, any> {
  const p: Record<string, any> = {}
  for (const n of nodes.value) {
    if (n.type === 'stt' && n.config.component) p.stt = n.config.component
    if (n.type === 'llm' && n.config.component) p.llm = n.config.component
    if (n.type === 'tts' && n.config.component) p.tts = n.config.component
    if (n.type === 'tts' && n.config.voice) p.voice = n.config.voice
    if (n.type === 'stt' && n.config.language) p.language = n.config.language
  }
  return p
}

const toolNames = computed(() =>
  nodes.value.filter((n) => n.type === 'tool' && n.config.name).map((n) => n.config.name))

// ------------------------------------------------------------- graph ops ---

function addNode(type: string) {
  if (PALETTE[type]?.once && nodes.value.some((n) => n.type === type)) {
    ui.info('Only one allowed', `${PALETTE[type].label} already exists.`)
    return
  }
  const id = `n${Date.now().toString(36)}`
  nodes.value.push({
    id, type,
    x: 80 + (nodes.value.length % 5) * 190,
    y: 90 + Math.floor(nodes.value.length / 5) * 150,
    config: {},
  })
  selected.value = id
}

function removeNode(id: string) {
  nodes.value = nodes.value.filter((n) => n.id !== id)
  edges.value = edges.value.filter((e) => e.from !== id && e.to !== id)
  if (selected.value === id) selected.value = null
}

function startLink(id: string) {
  if (linkFrom.value === id) { linkFrom.value = null; return }
  if (!linkFrom.value) { linkFrom.value = id; return }
  const from = linkFrom.value
  if (from !== id && !edges.value.some((e) => e.from === from && e.to === id)) {
    edges.value.push({ from, to: id })
  }
  linkFrom.value = null
}

function removeEdge(i: number) { edges.value.splice(i, 1) }

// ---------------------------------------------------------------- canvas ---

function onNodeDown(e: PointerEvent, n: GNode) {
  if ((e.target as HTMLElement).closest('.port, .nx')) return
  selected.value = n.id
  drag = { id: n.id, dx: e.clientX / zoom.value - n.x, dy: e.clientY / zoom.value - n.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (drag) {
    const n = nodes.value.find((x) => x.id === drag!.id)
    if (n) {
      n.x = Math.max(0, e.clientX / zoom.value - drag.dx)
      n.y = Math.max(0, e.clientY / zoom.value - drag.dy)
    }
  } else if (panning) {
    pan.value = { x: pan.value.x + e.clientX - panning.x, y: pan.value.y + e.clientY - panning.y }
    panning = { x: e.clientX, y: e.clientY }
  }
}
function onUp() { drag = null; panning = null }
function onCanvasDown(e: PointerEvent) {
  if (e.target !== canvas.value && !(e.target as HTMLElement).classList.contains('grid-bg')) return
  selected.value = null
  linkFrom.value = null
  panning = { x: e.clientX, y: e.clientY }
}
function zoomBy(d: number) { zoom.value = Math.min(1.6, Math.max(0.45, zoom.value + d)) }
function fit() { pan.value = { x: 0, y: 0 }; zoom.value = 1 }

function edgePath(e: GEdge) {
  const a = nodes.value.find((n) => n.id === e.from)
  const b = nodes.value.find((n) => n.id === e.to)
  if (!a || !b) return ''
  const x1 = a.x + 168, y1 = a.y + 34
  const x2 = b.x, y2 = b.y + 34
  const mid = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`
}

// ------------------------------------------------------------------ load ---

async function load() {
  loading.value = true
  error.value = ''
  try {
    const a = await Agents.get(route.params.id as string)
    agent.value = a

    // Prefer the saved designer graph — it preserves layout and any nodes that
    // do not survive flattening (branch, tool, webhook…).
    try {
      const latest = await Agents.latestVersion(a.id)
      if (latest.graph?.nodes?.length) {
        nodes.value = latest.graph.nodes as GNode[]
        edges.value = latest.graph.edges || []
        currentVersion.value = latest.version
      } else {
        seedFromPipeline(a)
      }
    } catch {
      // 404 = no versions yet. Seed from the flat pipeline so the canvas opens
      // on something meaningful rather than empty.
      seedFromPipeline(a)
    }

    await loadVersions()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
  try { installed.value = await Components.installed() } catch { installed.value = [] }
}

function seedFromPipeline(a: Agent) {
  const p = a.pipeline || {}
  const seeded: GNode[] = [{ id: 'n-entry', type: 'entry', x: 60, y: 150, config: {} }]
  let x = 250
  if (p.stt) { seeded.push({ id: 'n-stt', type: 'stt', x, y: 150, config: { component: p.stt, language: p.language } }); x += 190 }
  if (p.llm) { seeded.push({ id: 'n-llm', type: 'llm', x, y: 150, config: { component: p.llm } }); x += 190 }
  if (p.tts) { seeded.push({ id: 'n-tts', type: 'tts', x, y: 150, config: { component: p.tts, voice: p.voice } }) }
  nodes.value = seeded
  edges.value = seeded.slice(0, -1).map((n, i) => ({ from: n.id, to: seeded[i + 1].id }))
}

async function loadVersions() {
  if (!agent.value) return
  try {
    versions.value = await Agents.versions(agent.value.id)
  } catch {
    versions.value = []
  }
}

function graphPayload() {
  return { nodes: nodes.value, edges: edges.value }
}

async function save(publish = false) {
  if (!agent.value) return
  if (publish && !valid.value) {
    ui.error('Fix the problems first', `${problems.value.length} issue(s) remain.`)
    return
  }
  saving.value = true
  try {
    const v = await Agents.saveVersion(agent.value.id, {
      graph: graphPayload(),
      prompt: agent.value.prompt,
      tools: toolNames.value,
      note: note.value.trim(),
      publish,
    })
    currentVersion.value = v.version
    note.value = ''
    await loadVersions()
    ui.success(publish ? `Published v${v.version}` : `Saved v${v.version}`, agent.value.name)
  } catch (e: any) {
    ui.error('Could not save', e.message)
  } finally {
    saving.value = false
  }
}

async function doRollback(v: AgentVersion) {
  if (!agent.value) return
  if (!confirm(`Roll back to v${v.version}? This republishes that version exactly as it was saved.`)) return
  try {
    const restored = await Agents.rollback(agent.value.id, v.id)
    if (restored.graph?.nodes?.length) {
      nodes.value = restored.graph.nodes as GNode[]
      edges.value = restored.graph.edges || []
    }
    currentVersion.value = restored.version
    await loadVersions()
    ui.success(`Rolled back to v${restored.version}`)
  } catch (e: any) {
    ui.error('Could not roll back', e.message)
  }
}

async function showDiff(v: AgentVersion) {
  if (!agent.value) return
  diffing.value = true
  diff.value = null
  try {
    diff.value = await Agents.diff(agent.value.id, v.id)
  } catch (e: any) {
    ui.error('Could not load diff', e.message)
    diffing.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<template>
  <div class="designer">
    <div class="bar glass">
      <button class="ghost" @click="router.push(`/app/agents/${route.params.id}`)">
        <ArrowLeft :size="15" /> Back
      </button>
      <strong class="title">{{ agent?.name || 'Designer' }}</strong>

      <div class="zoom">
        <button @click="zoomBy(-0.15)" aria-label="Zoom out">−</button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button @click="zoomBy(0.15)" aria-label="Zoom in">+</button>
        <button @click="fit" aria-label="Reset view"><Maximize2 :size="14" /></button>
      </div>

      <div class="right">
        <span v-if="currentVersion" class="vtag">v{{ currentVersion }}</span>
        <span class="status" :class="valid ? 'ok' : 'bad'">
          <component :is="valid ? CheckCircle2 : AlertTriangle" :size="14" />
          {{ valid ? 'Valid' : `${problems.length} issue${problems.length === 1 ? '' : 's'}` }}
        </span>
        <input v-model="note" class="note" placeholder="Change note (optional)" />
        <button class="ghost" @click="historyOpen = !historyOpen"
                :class="{ on: historyOpen }" title="Version history">
          <History :size="15" /> <span class="hide-sm">History</span>
        </button>
        <button class="ghost" @click="save(false)" :disabled="saving">
          <Save :size="15" /> Save draft
        </button>
        <button class="primary" @click="save(true)" :disabled="saving || !valid">
          <Play :size="15" /> Publish
        </button>
      </div>
    </div>

    <!-- version history -->
    <transition name="pop">
      <div v-if="historyOpen" class="history surface">
        <header>
          <h3>Version history</h3>
          <button @click="historyOpen = false" aria-label="Close"><X :size="14" /></button>
        </header>
        <p v-if="!versions.length" class="muted">No saved versions yet. Save a draft to start one.</p>
        <ul v-else>
          <li v-for="v in versions" :key="v.id" :class="{ live: v.status === 'published' }">
            <div class="vmeta">
              <strong>v{{ v.version }}</strong>
              <span class="vstatus" :class="v.status">{{ v.status }}</span>
              <small>{{ new Date(v.created_at).toLocaleString() }}</small>
            </div>
            <p v-if="v.note" class="vnote">{{ v.note }}</p>
            <div class="vacts">
              <button @click="showDiff(v)">Diff</button>
              <button v-if="v.status !== 'published'" @click="doRollback(v)">Roll back</button>
            </div>
          </li>
        </ul>
      </div>
    </transition>

    <!-- diff -->
    <div v-if="diffing" class="scrim" @click.self="diffing = false">
      <div class="modal surface">
        <h3>Changes</h3>
        <p v-if="!diff" class="muted">Loading…</p>
        <template v-else>
          <p class="muted">
            {{ diff.from ? `v${diff.from} → v${diff.to}` : `v${diff.to}` }}
            <span v-if="diff.note"> · {{ diff.note }}</span>
          </p>
          <p v-if="!diff.changes.length" class="muted">Nothing changed between these versions.</p>
          <ul v-else class="changes">
            <li v-for="(c, i) in diff.changes" :key="i">
              <code>{{ c.field }}</code>
              <span class="from" v-if="c.from !== null && c.from !== undefined">{{ c.from }}</span>
              <span class="arrow">→</span>
              <span class="to" v-if="c.to !== null && c.to !== undefined">{{ c.to }}</span>
              <span class="to removed" v-else>removed</span>
            </li>
          </ul>
        </template>
        <div class="acts"><button @click="diffing = false">Close</button></div>
      </div>
    </div>

    <div v-if="error" class="err surface">
      <strong>Could not load this agent</strong><p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <div v-else class="work">
      <!-- palette -->
      <aside class="palette surface">
        <h3>Nodes</h3>
        <button v-for="(m, type) in PALETTE" :key="type" @click="addNode(type)">
          <span class="pi" :style="{ color: m.color }"><component :is="m.icon" :size="15" /></span>
          {{ m.label }}
          <Plus :size="12" class="pl" />
        </button>

        <h3 class="mt">Problems</h3>
        <p v-if="valid" class="good"><CheckCircle2 :size="13" /> Graph is valid.</p>
        <ul v-else class="probs">
          <li v-for="(p, i) in problems" :key="i" @click="p.node && (selected = p.node)"
              :class="{ clickable: !!p.node }">
            <AlertTriangle :size="12" /> {{ p.msg }}
          </li>
        </ul>
      </aside>

      <!-- canvas -->
      <div ref="canvas" class="canvas" @pointerdown="onCanvasDown">
        <div class="grid-bg"></div>
        <div class="stage" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
          <svg class="wires">
            <path v-for="(e, i) in edges" :key="i" :d="edgePath(e)"
                  class="wire" @click="removeEdge(i)" />
          </svg>

          <div v-for="n in nodes" :key="n.id" class="node"
               :class="{ sel: selected === n.id, linking: linkFrom === n.id }"
               :style="{ left: n.x + 'px', top: n.y + 'px',
                         '--c': PALETTE[n.type]?.color || 'var(--mut)' }"
               @pointerdown="onNodeDown($event, n)">
            <div class="nhead">
              <span class="nic"><component :is="PALETTE[n.type]?.icon" :size="14" /></span>
              <span class="nlabel">{{ PALETTE[n.type]?.label ?? n.type }}</span>
              <button class="nx" @click.stop="removeNode(n.id)" aria-label="Delete node">
                <Trash2 :size="12" />
              </button>
            </div>
            <div class="nbody">
              {{ n.config.component || n.config.name || n.config.on || '—' }}
            </div>
            <button class="port" @click.stop="startLink(n.id)"
                    :aria-label="linkFrom ? 'Connect here' : 'Start a connection'"></button>
          </div>
        </div>

        <div v-if="linkFrom" class="linking-hint">Click another node to connect · click the same node to cancel</div>
      </div>

      <!-- properties -->
      <aside class="props surface">
        <template v-if="sel">
          <h3>{{ PALETTE[sel.type]?.label ?? sel.type }}</h3>

          <template v-if="sel.type === 'stt' || sel.type === 'llm' || sel.type === 'tts'">
            <label><span>Provider</span>
              <select v-model="sel.config.component">
                <option value="">Choose…</option>
                <option v-for="p in providersFor(sel.type)" :key="p" :value="p">{{ p }}</option>
                <option v-if="!providersFor(sel.type).length" value="fast">fast</option>
              </select>
              <small v-if="!providersFor(sel.type).length">
                No installed {{ sel.type }} providers reported by the supervisor.
              </small>
            </label>
            <label v-if="sel.type === 'stt'"><span>Language</span>
              <input v-model="sel.config.language" placeholder="en" /></label>
            <label v-if="sel.type === 'tts'"><span>Voice</span>
              <input v-model="sel.config.voice" placeholder="tone" /></label>
            <label v-if="sel.type === 'llm'"><span>Temperature</span>
              <input v-model.number="sel.config.temperature" type="number" step="0.1" min="0" max="2" /></label>
          </template>

          <template v-else-if="sel.type === 'tool'">
            <label><span>Tool name</span>
              <input v-model="sel.config.name" placeholder="book_appointment" /></label>
            <label><span>Timeout (ms)</span>
              <input v-model.number="sel.config.timeout_ms" type="number" placeholder="500" />
              <small>Keep tools under 500 ms or the caller hears a gap.</small></label>
          </template>

          <template v-else-if="sel.type === 'branch'">
            <label><span>Branch on</span>
              <input v-model="sel.config.on" placeholder="intent" /></label>
          </template>

          <template v-else-if="sel.type === 'transfer'">
            <label><span>Destination</span>
              <input v-model="sel.config.to" placeholder="+61 3 9042 8811" /></label>
          </template>

          <template v-else-if="sel.type === 'webhook'">
            <label><span>URL</span>
              <input v-model="sel.config.url" placeholder="https://…" /></label>
            <small class="note">Webhooks fire off the call path, so they never add latency.</small>
          </template>

          <p v-else class="muted">This node has no settings.</p>

          <div class="compiled">
            <h4>Compiles to</h4>
            <pre>{{ JSON.stringify(compile(), null, 2) }}</pre>
          </div>
        </template>

        <div v-else class="none">
          <p>Select a node to edit it.</p>
          <p class="muted">Click a node's right-hand port, then another node, to connect them.
             Click a wire to delete it.</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.designer { display: flex; flex-direction: column; height: calc(100vh - 140px); min-height: 520px; }

.bar {
  display: flex; align-items: center; gap: .7rem; flex-wrap: wrap;
  padding: .5rem .7rem; border-radius: var(--r-md); margin-bottom: .8rem;
}
.title { font-size: .95rem; font-weight: 650; }
.right { margin-left: auto; display: flex; gap: .45rem; align-items: center; }
.ghost, .primary {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .45rem .85rem; border-radius: var(--r-sm); font-size: .84rem; font-weight: 600;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 3%, transparent);
  color: var(--mut);
}
.ghost:hover:not(:disabled) { color: var(--txt); }
.primary { background: var(--acc); color: #fff; border: 0; box-shadow: 0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent); }
.ghost:disabled, .primary:disabled { opacity: .45; cursor: not-allowed; }

.zoom { display: flex; align-items: center; gap: .2rem; font-size: .8rem; color: var(--mut); }
.zoom button {
  width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line);
  background: none; color: var(--mut); display: grid; place-items: center;
}
.zoom span { min-width: 3rem; text-align: center; font-family: var(--mono); font-size: .76rem; }

.status {
  display: inline-flex; align-items: center; gap: .3rem;
  padding: .3rem .6rem; border-radius: 999px; font-size: .77rem; font-weight: 650;
}
.status.ok { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
.status.bad { background: color-mix(in srgb, var(--warn) 15%, transparent); color: var(--warn); }

.work { display: grid; grid-template-columns: 190px 1fr 280px; gap: .8rem; flex: 1; min-height: 0; }

.palette, .props { padding: .9rem; overflow-y: auto; }
.palette h3, .props h3 {
  font-size: .73rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--mut); margin-bottom: .6rem;
}
.palette h3.mt { margin-top: 1.2rem; }
.palette button {
  display: flex; align-items: center; gap: .5rem; width: 100%;
  padding: .45rem .5rem; margin-bottom: 2px; border: 0; border-radius: var(--r-sm);
  background: none; color: var(--txt-2); font-size: .82rem; text-align: left;
  transition: background var(--fast) var(--ease);
}
.palette button:hover { background: color-mix(in srgb, var(--acc) 12%, transparent); color: var(--txt); }
.pi { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px;
      background: color-mix(in srgb, currentColor 16%, transparent); }
.pl { margin-left: auto; opacity: .5; }

.good { display: flex; align-items: center; gap: .35rem; font-size: .8rem; color: var(--ok); }
.probs { list-style: none; display: grid; gap: .4rem; }
.probs li {
  display: flex; align-items: flex-start; gap: .35rem; font-size: .78rem;
  color: var(--warn); line-height: 1.4;
}
.probs li.clickable { cursor: pointer; }
.probs li.clickable:hover { text-decoration: underline; }

.canvas {
  position: relative; overflow: hidden; border-radius: var(--r-md);
  border: 1px solid var(--line); background: var(--bg-sunk);
  touch-action: none; cursor: grab;
}
.canvas:active { cursor: grabbing; }
.grid-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 22px 22px;
  opacity: .6;
}
.stage { position: absolute; inset: 0; transform-origin: 0 0; }
.wires { position: absolute; inset: 0; width: 4000px; height: 3000px; overflow: visible; pointer-events: none; }
.wire {
  fill: none; stroke: var(--acc); stroke-width: 2; opacity: .55;
  pointer-events: stroke; cursor: pointer;
  stroke-dasharray: 5 4; animation: flow 1.2s linear infinite;
}
.wire:hover { opacity: 1; stroke: var(--bad); }
@keyframes flow { to { stroke-dashoffset: -18; } }

.node {
  position: absolute; width: 168px; border-radius: var(--r-md);
  background: var(--panel-raised); border: 1px solid var(--line-2);
  box-shadow: var(--sh-1); cursor: move; user-select: none;
  transition: box-shadow var(--fast) var(--ease), border-color var(--fast) var(--ease);
}
.node:hover { box-shadow: var(--sh-2); }
.node.sel { border-color: var(--c); box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 45%, transparent), var(--sh-2); }
.node.linking { border-color: var(--acc-2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc-2) 40%, transparent); }

.nhead {
  display: flex; align-items: center; gap: .4rem; padding: .5rem .55rem;
  border-bottom: 1px solid var(--line);
}
.nic { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px;
       color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
.nlabel { font-size: .78rem; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nx { margin-left: auto; border: 0; background: none; color: var(--mut); display: grid; place-items: center; }
.nx:hover { color: var(--bad); }
.nbody {
  padding: .45rem .55rem; font-size: .76rem; color: var(--mut);
  font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.port {
  position: absolute; right: -7px; top: 50%; transform: translateY(-50%);
  width: 14px; height: 14px; border-radius: 50%; padding: 0;
  background: var(--c); border: 2px solid var(--panel-solid); cursor: crosshair;
}
.port:hover { transform: translateY(-50%) scale(1.25); }

.linking-hint {
  position: absolute; bottom: .7rem; left: 50%; transform: translateX(-50%);
  padding: .4rem .8rem; border-radius: 999px; font-size: .78rem;
  background: var(--panel-raised); border: 1px solid var(--line-2); color: var(--mut);
  box-shadow: var(--sh-2);
}

.props label { display: block; margin-bottom: .75rem; }
.props label span { display: block; font-size: .76rem; font-weight: 600; color: var(--mut); margin-bottom: .3rem; }
.props input, .props select {
  width: 100%; padding: .48rem .6rem; font-size: .84rem;
  border-radius: var(--r-sm); border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
.props small { display: block; font-size: .73rem; color: var(--mut); margin-top: .25rem; line-height: 1.4; }
.props .note { font-size: .76rem; color: var(--mut); }
.muted { font-size: .82rem; color: var(--mut); line-height: 1.5; }
.none p { margin-bottom: .6rem; font-size: .84rem; }

.compiled { margin-top: 1.2rem; }
.compiled h4 {
  font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--mut); margin-bottom: .4rem;
}
.compiled pre {
  padding: .6rem; border-radius: var(--r-sm); font-family: var(--mono); font-size: .74rem;
  background: var(--bg-sunk); border: 1px solid var(--line); overflow-x: auto;
  color: var(--txt-2);
}

.err { padding: 2rem; text-align: center; }
.err strong { display: block; color: var(--bad); margin-bottom: .3rem; }
.err p { color: var(--mut); font-size: .86rem; margin-bottom: 1rem; }
.err button { padding: .5rem 1.1rem; border: 0; border-radius: var(--r-sm); background: var(--acc); color: #fff; font-weight: 600; }

@media (max-width: 1100px) {
  .work { grid-template-columns: 160px 1fr; }
  .props { display: none; }
}
@media (max-width: 760px) {
  .designer { height: auto; }
  .work { grid-template-columns: 1fr; }
  .palette { order: 2; }
  .canvas { height: 60vh; }
}
@media (prefers-reduced-motion: reduce) { .wire { animation: none; } }
</style>

<style scoped>
/* ---------- version history + diff ---------- */
.vtag {
  padding: .25rem .55rem; border-radius: 999px; font-size: .74rem; font-weight: 700;
  font-family: var(--mono);
  background: color-mix(in srgb, var(--acc) 16%, transparent); color: var(--acc);
}
.note {
  width: 190px; padding: .4rem .6rem; font-size: .8rem;
  border-radius: var(--r-sm); border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
.note:focus { outline: none; border-color: var(--acc); }
.ghost.on { color: var(--txt); border-color: color-mix(in srgb, var(--acc) 45%, transparent); }

.history {
  position: absolute; top: 3.6rem; right: 0; z-index: 40;
  width: min(340px, 92vw); max-height: 60vh; overflow-y: auto;
  padding: .9rem; box-shadow: var(--sh-3);
}
.history header { display: flex; align-items: center; margin-bottom: .7rem; }
.history header h3 { font-size: .8rem; font-weight: 700; text-transform: uppercase;
                     letter-spacing: .06em; color: var(--mut); }
.history header button {
  margin-left: auto; border: 0; background: none; color: var(--mut);
  display: grid; place-items: center;
}
.history ul { list-style: none; display: grid; gap: .5rem; }
.history li {
  padding: .6rem .7rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 2%, transparent);
}
.history li.live { border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
.vmeta { display: flex; align-items: center; gap: .5rem; }
.vmeta strong { font-family: var(--mono); font-size: .84rem; }
.vmeta small { margin-left: auto; font-size: .72rem; color: var(--mut); }
.vstatus {
  padding: .12rem .45rem; border-radius: 999px; font-size: .68rem; font-weight: 650;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.vstatus.published { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
.vstatus.draft { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.vnote { font-size: .78rem; color: var(--mut); margin-top: .25rem; }
.vacts { display: flex; gap: .35rem; margin-top: .5rem; }
.vacts button {
  padding: .28rem .6rem; border-radius: 6px; font-size: .75rem;
  border: 1px solid var(--line-2); background: none; color: var(--txt-2);
}
.vacts button:hover { background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--txt); }

.scrim {
  position: fixed; inset: 0; z-index: 120; display: grid; place-items: center;
  padding: 1rem; background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
}
.modal { width: min(520px, 100%); padding: 1.4rem; box-shadow: var(--sh-3); }
.modal h3 { font-size: 1rem; font-weight: 650; margin-bottom: .5rem; }
.changes { list-style: none; display: grid; gap: .45rem; margin-top: .9rem;
           max-height: 50vh; overflow-y: auto; }
.changes li {
  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
  padding: .45rem .6rem; border-radius: var(--r-sm); font-size: .82rem;
  background: color-mix(in srgb, var(--txt) 4%, transparent);
}
.changes code {
  font-family: var(--mono); font-size: .76rem; color: var(--acc-2);
  min-width: 8rem;
}
.changes .from { color: var(--mut); text-decoration: line-through; }
.changes .arrow { color: var(--mut); }
.changes .to { color: var(--ok); font-weight: 600; }
.changes .to.removed { color: var(--bad); font-weight: 500; }
.acts { display: flex; justify-content: flex-end; margin-top: 1.1rem; }
.acts button {
  padding: .5rem 1rem; border-radius: var(--r-sm); font-size: .85rem;
  border: 1px solid var(--line-2); background: none; color: var(--txt);
}

@media (max-width: 900px) {
  .note { display: none; }
  .hide-sm { display: none; }
}
</style>
