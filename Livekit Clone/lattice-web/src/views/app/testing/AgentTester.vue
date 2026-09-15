<script setup lang="ts">
/**
 * Agent tester — start a real session against a real agent and watch the turns
 * come back with their latency legs. It uses the same /sessions endpoints a
 * phone call uses, so what you see here is what a caller gets.
 */
import { computed, onMounted, ref } from 'vue'
import { Play, Square, Send } from '@lucide/vue'
import { Agents, Sessions, type Agent, type CallSession } from '../../../api/index'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const ui = useUI()

const agents = ref<Agent[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const agentId = ref('')

const session = ref<CallSession | null>(null)
const busy = ref(false)
const utterance = ref('')

const agent = computed(() => agents.value.find((a) => a.id === agentId.value))

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

async function start() {
  if (!agentId.value) return
  busy.value = true
  try {
    session.value = await Sessions.start({
      agent_id: agentId.value,
      channel: 'tester',
      caller: 'console-tester',
    } as any)
    ui.success('Session started')
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    busy.value = false
  }
}

async function say() {
  if (!session.value || !utterance.value.trim()) return
  busy.value = true
  const text = utterance.value.trim()
  utterance.value = ''
  try {
    await Sessions.addTurn(session.value.id, { who: 'caller', text, ts: Date.now() } as any)
    session.value = await Sessions.get(session.value.id)
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    busy.value = false
  }
}

async function end() {
  if (!session.value) return
  busy.value = true
  try {
    await Sessions.end(session.value.id)
    session.value = await Sessions.get(session.value.id)
    ui.success('Session ended')
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Agent tester"
    lede="Hold a conversation with an agent from here. It runs as a real session against the real pipeline — the transcript lands in call history like any other."
    :loading="loading" :error="error" :empty="agents.length === 0"
    empty-title="No agents to test"
    empty-body="Create an agent first, then come back."
    @retry="load"
  >
    <template #actions>
      <select v-model="agentId" class="s-select" :disabled="!!session">
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <button v-if="!session || session.ended_at" class="s-btn primary" :disabled="busy || !agentId" @click="start">
        <Play :size="15" /> Start session
      </button>
      <button v-else class="s-btn" :disabled="busy" @click="end">
        <Square :size="14" /> End session
      </button>
    </template>

    <div v-if="agent" class="s-card pipe">
      <div v-for="(v, k) in agent.pipeline" :key="k" class="leg">
        <span>{{ k }}</span><strong>{{ v }}</strong>
      </div>
    </div>

    <div v-if="!session" class="s-card idle">
      Start a session to begin. Nothing is sent until you do.
    </div>

    <template v-else>
      <ol class="thread">
        <li v-for="(t, i) in session.turns ?? []" :key="i" :class="t.who">
          <div class="bubble">
            {{ t.text }}
            <small v-if="t.stt_ms || t.llm_ms || t.tts_ms" class="legs">
              <span v-if="t.eot_ms">EOT {{ t.eot_ms }}ms</span>
              <span v-if="t.stt_ms">STT {{ t.stt_ms }}ms</span>
              <span v-if="t.llm_ms">LLM {{ t.llm_ms }}ms</span>
              <span v-if="t.tts_ms">TTS {{ t.tts_ms }}ms</span>
            </small>
          </div>
        </li>
      </ol>

      <div v-if="!session.ended_at" class="compose">
        <input v-model="utterance" class="s-input" placeholder="Say something to the agent…"
               @keyup.enter="say" />
        <button class="s-btn primary" :disabled="busy || !utterance.trim()" @click="say">
          <Send :size="15" /> Send
        </button>
      </div>
      <p v-else class="none">This session has ended.</p>
    </template>
  </PageShell>
</template>

<style scoped>
.pipe { display: flex; gap: 1.4rem; flex-wrap: wrap; }
.leg { display: flex; flex-direction: column; gap: .15rem; }
.leg span { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.leg strong { font-family: var(--mono); font-size: .85rem; }

.idle { color: var(--mut); font-size: .86rem; }
.thread { list-style: none; display: flex; flex-direction: column; gap: .55rem; }
.thread li { display: flex; }
.thread li.caller { justify-content: flex-start; }
.thread li.agent { justify-content: flex-end; }
.bubble {
  max-width: min(70ch, 78%); padding: .6rem .8rem; border-radius: var(--r-md);
  font-size: .88rem; line-height: 1.5;
  background: color-mix(in srgb, var(--txt) 6%, transparent);
}
.thread li.agent .bubble { background: color-mix(in srgb, var(--acc) 16%, transparent); }
.legs { display: flex; gap: .6rem; margin-top: .35rem; font-family: var(--mono); font-size: .7rem; color: var(--mut); }
.compose { display: flex; gap: .5rem; }
.none { font-size: .85rem; color: var(--mut); }
</style>
