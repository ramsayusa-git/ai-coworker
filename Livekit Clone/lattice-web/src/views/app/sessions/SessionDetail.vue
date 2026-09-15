<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, User, Bot } from '@lucide/vue'
import { Sessions, type CallSession } from '../../../api'

const route = useRoute()
const router = useRouter()
const s = ref<CallSession | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    s.value = await Sessions.get(route.params.id as string)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const facts = computed(() => {
  const x = s.value
  if (!x) return []
  const mins = Math.floor(x.duration_s / 60)
  return [
    { k: 'From', v: x.caller || 'unknown' },
    { k: 'Agent', v: x.agent || '—' },
    { k: 'Channel', v: x.channel },
    { k: 'Length', v: x.duration_s ? `${mins}:${String(x.duration_s % 60).padStart(2, '0')}` : '—' },
    { k: 'Outcome', v: x.outcome },
    { k: 'First byte', v: x.ttfb_ms ? `${x.ttfb_ms} ms` : '—' },
    { k: 'Cost', v: `$${x.cost.toFixed(3)}` },
  ]
})

/** Per-turn latency, only where the agent actually reported the legs. */
function legs(t: any) {
  const out: { label: string; ms: number }[] = []
  if (t.eot_ms) out.push({ label: 'EOT', ms: t.eot_ms })
  if (t.stt_ms) out.push({ label: 'STT', ms: t.stt_ms })
  if (t.llm_ms) out.push({ label: 'LLM', ms: t.llm_ms })
  if (t.tts_ms) out.push({ label: 'TTS', ms: t.tts_ms })
  return out
}
function turnTotal(t: any) {
  return legs(t).reduce((a, l) => a + l.ms, 0)
}
</script>

<template>
  <div>
    <button class="back" @click="router.push('/app/sessions')">
      <ArrowLeft :size="15" /> All sessions
    </button>

    <div v-if="loading" class="sk-block"></div>

    <div v-else-if="error" class="err">
      <strong>Could not load this session</strong>
      <p>{{ error }}</p>
      <button @click="load">Try again</button>
    </div>

    <template v-else-if="s">
      <div class="head">
        <h2>{{ s.caller || 'Unknown caller' }}</h2>
        <span class="pill" :class="s.outcome">{{ s.outcome }}</span>
      </div>
      <p v-if="s.summary" class="summary">{{ s.summary }}</p>

      <div class="facts">
        <div v-for="f in facts" :key="f.k">
          <span>{{ f.k }}</span>
          <strong>{{ f.v }}</strong>
        </div>
      </div>

      <h3 class="sec">Transcript</h3>

      <div v-if="!s.turns || !s.turns.length" class="empty">
        <strong>No transcript recorded</strong>
        <p>This call ended before any turns were captured.</p>
      </div>

      <ol v-else class="turns">
        <li v-for="(t, i) in s.turns" :key="i" :class="t.who">
          <span class="avatar">
            <component :is="t.who === 'agent' ? Bot : User" :size="15" />
          </span>
          <div class="bubble">
            <p>{{ t.text }}</p>
            <div v-if="legs(t).length" class="legs">
              <span v-for="l in legs(t)" :key="l.label">{{ l.label }} {{ l.ms }}ms</span>
              <span class="tot">total {{ turnTotal(t) }}ms</span>
            </div>
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.back {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .4rem .7rem; margin-bottom: 1.1rem; border-radius: 8px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
  font-size: .85rem; font-family: inherit;
}
.back:hover { color: var(--txt); }

.head { display: flex; align-items: center; gap: .8rem; margin-bottom: .5rem; flex-wrap: wrap; }
.head h2 { font-size: 1.3rem; font-weight: 700; letter-spacing: -.02em;
           font-family: var(--brand-mono, ui-monospace), monospace; }
.summary { color: var(--mut); font-size: .92rem; margin-bottom: 1.3rem; }

.pill {
  display: inline-block; padding: .22rem .6rem; border-radius: 999px;
  font-size: .75rem; font-weight: 650; text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.pill.completed { background: rgba(52,211,153,.15); color: #34d399; }
.pill.transferred { background: rgba(34,211,238,.15); color: #22d3ee; }
.pill.failed { background: rgba(248,113,113,.15); color: #f87171; }

.facts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1px;
  background: var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  border-radius: 12px; overflow: hidden; margin-bottom: 2rem;
}
.facts > div { background: var(--panel-solid); padding: .9rem 1rem; }
.facts span { display: block; font-size: .76rem; color: var(--mut); margin-bottom: .2rem; }
.facts strong { font-size: .92rem; font-weight: 600; text-transform: capitalize; }

.sec { font-size: 1rem; font-weight: 650; margin-bottom: 1rem; }

.turns { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem; }
.turns li { display: flex; gap: .7rem; max-width: 760px; }
.turns li.agent { flex-direction: row-reverse; margin-left: auto; }
.avatar {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
  flex-shrink: 0; background: color-mix(in srgb, var(--txt) 7%, transparent); color: var(--mut);
}
.turns li.agent .avatar {
  background: linear-gradient(135deg, var(--brand-primary, #6d5efc), var(--brand-accent, #22d3ee));
  color: #fff;
}
.bubble {
  padding: .75rem .95rem; border-radius: 13px;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  background: var(--panel-solid);
}
.turns li.agent .bubble { background: rgba(109,94,252,.1); border-color: rgba(109,94,252,.28); }
.bubble p { font-size: .91rem; line-height: 1.55; }
.legs {
  display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem;
  font-size: .72rem; color: var(--mut);
  font-family: var(--brand-mono, ui-monospace), monospace;
}
.legs .tot { color: var(--brand-accent, #22d3ee); }

.empty, .err {
  padding: 2.5rem; text-align: center;
  border: 1px solid var(--line, color-mix(in srgb, var(--txt) 9%, transparent));
  border-radius: 12px; background: var(--panel-solid);
}
.err { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.07); }
.err strong { color: var(--brand-danger, #f87171); }
.empty strong, .err strong { display: block; margin-bottom: .3rem; }
.empty p, .err p { color: var(--mut); font-size: .87rem; margin-bottom: 1rem; }
.err button {
  padding: .5rem 1.1rem; border: 0; border-radius: 8px;
  background: var(--brand-primary, #6d5efc); color: #fff; font-weight: 600;
}

.sk-block {
  height: 320px; border-radius: 12px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--txt) 4%, transparent), color-mix(in srgb, var(--txt) 9%, transparent), color-mix(in srgb, var(--txt) 4%, transparent));
  background-size: 200% 100%; animation: shimmer 1.3s linear infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .sk-block { animation: none; } }
@media (max-width: 600px) { .turns li { max-width: 100%; } }
</style>
