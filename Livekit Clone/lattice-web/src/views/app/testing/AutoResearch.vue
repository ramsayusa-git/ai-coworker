<script setup lang="ts">
/**
 * AutoResearch mines your own transcripts for what callers actually say, so
 * prompt changes are driven by evidence instead of memory.
 *
 * Everything here is computed from stored turns in the browser. No text leaves
 * the tenant, which matters because transcripts are the most sensitive thing
 * in the product.
 */
import { computed, onMounted, ref } from 'vue'
import { Sessions, type CallSession } from '../../../api/index'
import PageShell from '../../../components/ui/PageShell.vue'

const rows = ref<CallSession[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const term = ref('')

const STOP = new Set(('a an the and or but if then than that this these those is are was were be been being '
  + 'i you he she it we they me him her us them my your his its our their to of in on at for with from by '
  + 'as so do does did done not no yes ok okay just like get got can could would should will shall may might '
  + 'have has had hi hello thanks thank please um uh yeah yep nope about into over under out up down all any '
  + 'what when where who why how there here now one two three').split(' '))

async function load() {
  loading.value = true
  error.value = null
  try {
    // The list endpoint does not carry turns, so each session is fetched.
    // Capped at 60 because this is analysis, not an export.
    const page = await Sessions.list({ limit: 60 })
    rows.value = await Promise.all(page.items.map((s) => Sessions.get(s.id)))
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const callerText = computed(() =>
  rows.value.flatMap((s) => (s.turns ?? []).filter((t) => t.who === 'caller').map((t) => t.text)))

const phrases = computed(() => {
  const counts = new Map<string, number>()
  for (const line of callerText.value) {
    const words = line.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean)
    for (const w of words) {
      if (w.length < 4 || STOP.has(w)) continue
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    // Bigrams catch "site survey" and "water plant", which single words miss.
    for (let i = 0; i < words.length - 1; i++) {
      const [a, b] = [words[i], words[i + 1]]
      if (STOP.has(a) || STOP.has(b) || a.length < 3 || b.length < 3) continue
      const k = `${a} ${b}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 40)
    .map(([phrase, n]) => ({ phrase, n }))
})

const matches = computed(() => {
  const t = term.value.trim().toLowerCase()
  if (!t) return []
  const out: Array<{ id: string; text: string }> = []
  for (const s of rows.value) {
    for (const turn of s.turns ?? []) {
      if (turn.text.toLowerCase().includes(t)) out.push({ id: s.id, text: turn.text })
    }
  }
  return out.slice(0, 60)
})

onMounted(load)
</script>

<template>
  <PageShell
    title="AutoResearch"
    :lede="`What your callers actually say, taken from ${rows.length} recent call(s). Computed in your browser — no transcript leaves this tenant.`"
    :loading="loading" :error="error" :empty="callerText.length === 0"
    empty-title="No caller speech to analyse"
    empty-body="Once calls carry transcripts, the common phrases appear here."
    @retry="load"
  >
    <template #actions>
      <input v-model="term" class="s-input" placeholder="Search every transcript…" />
    </template>

    <template v-if="term.trim()">
      <p class="none">{{ matches.length }} matching turn(s).</p>
      <ul class="hits">
        <li v-for="(m, i) in matches" :key="i">
          <router-link :to="`/app/sessions/${m.id}`" class="s-mono">{{ m.id }}</router-link>
          <p>{{ m.text }}</p>
        </li>
      </ul>
    </template>

    <template v-else>
      <h3 class="sub">Most common phrases</h3>
      <div class="cloud">
        <button v-for="p in phrases" :key="p.phrase" class="chip" @click="term = p.phrase">
          {{ p.phrase }} <em>{{ p.n }}</em>
        </button>
      </div>
      <p v-if="!phrases.length" class="none">
        Not enough repeated language yet — a phrase has to appear more than once to show up here.
      </p>
    </template>
  </PageShell>
</template>

<style scoped>
.none { font-size: .85rem; color: var(--mut); }
.sub { font-size: .9rem; font-weight: 700; }
.cloud { display: flex; flex-wrap: wrap; gap: .4rem; }
.chip {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .35rem .7rem; border-radius: 999px; font-size: .84rem; font-family: inherit;
  border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 4%, transparent); color: var(--txt);
}
.chip:hover { border-color: var(--acc); }
.chip em { font-style: normal; font-family: var(--mono); font-size: .74rem; color: var(--mut); }
.hits { list-style: none; display: flex; flex-direction: column; gap: .5rem; }
.hits li { padding: .6rem .7rem; border-radius: var(--r-sm); border: 1px solid var(--line); }
.hits a { font-size: .74rem; color: var(--acc-2); }
.hits p { font-size: .87rem; line-height: 1.5; margin-top: .2rem; }
</style>
