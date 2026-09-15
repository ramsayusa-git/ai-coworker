<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import { Chats, type Chat } from '../../../api/sections'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const ui = useUI()

const chat = ref<Chat | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const facts = computed(() => {
  const c = chat.value
  if (!c) return []
  return [
    ['Visitor', c.visitor || 'Anonymous'],
    ['Agent', c.agent],
    ['Channel', c.channel],
    ['Messages', String(c.message_count)],
    ['Tokens', `${c.tokens_in} in / ${c.tokens_out} out`],
    ['Cost', `$${c.cost.toFixed(4)}`],
  ]
})

async function load() {
  loading.value = true
  error.value = null
  try {
    chat.value = await Chats.get(String(route.params.id))
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function close() {
  if (!chat.value) return
  try {
    const c = await Chats.close(chat.value.id)
    chat.value = { ...chat.value, status: c.status, ended_at: c.ended_at }
    ui.success('Conversation closed')
  } catch (e: any) {
    ui.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    :title="chat ? (chat.visitor || 'Anonymous') : 'Conversation'"
    :loading="loading" :error="error" @retry="load"
  >
    <template #actions>
      <button class="s-btn" @click="router.push('/app/chats')">
        <ArrowLeft :size="14" /> All chats
      </button>
      <button v-if="chat && chat.status !== 'closed' && auth.can('operator')"
              class="s-btn" @click="close">Close conversation</button>
    </template>

    <template v-if="chat">
      <div class="s-card facts">
        <div v-for="[k, v] in facts" :key="k" class="fact">
          <span>{{ k }}</span><strong>{{ v }}</strong>
        </div>
        <div class="fact">
          <span>Status</span>
          <strong><span class="s-pill" :class="chat.status">{{ chat.status }}</span></strong>
        </div>
      </div>

      <h3 class="sub">Transcript</h3>
      <div v-if="!chat.messages?.length" class="empty s-card">
        No messages were recorded for this conversation.
      </div>
      <ol v-else class="thread">
        <li v-for="(m, i) in chat.messages" :key="i" :class="m.who">
          <div class="bubble">{{ m.text }}</div>
        </li>
      </ol>
    </template>
  </PageShell>
</template>

<style scoped>
.facts { display: grid; gap: .1rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.fact { display: flex; flex-direction: column; gap: .2rem; padding: .5rem .2rem; }
.fact span { font-size: .74rem; color: var(--mut); text-transform: uppercase; letter-spacing: .05em; }
.fact strong { font-size: .92rem; font-weight: 600; }

.sub { font-size: .9rem; font-weight: 700; margin-top: .4rem; }
.empty { color: var(--mut); font-size: .86rem; }

.thread { list-style: none; display: flex; flex-direction: column; gap: .55rem; }
.thread li { display: flex; }
/* Anything that is not the visitor is the agent — a channel that labels its
   side differently still lands on one of the two sides rather than vanishing. */
.thread li.visitor, .thread li.user, .thread li.caller { justify-content: flex-start; }
.thread li:not(.visitor):not(.user):not(.caller) { justify-content: flex-end; }
.bubble {
  max-width: min(72ch, 78%); padding: .6rem .8rem; border-radius: var(--r-md);
  font-size: .88rem; line-height: 1.5;
  background: color-mix(in srgb, var(--txt) 6%, transparent);
}
.thread li:not(.visitor):not(.user):not(.caller) .bubble {
  background: color-mix(in srgb, var(--acc) 16%, transparent);
}
</style>
