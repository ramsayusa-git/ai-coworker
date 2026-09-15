<script setup lang="ts">
/**
 * The frame every section screen sits in: title, optional lede, an actions
 * slot, and the three states that actually matter — loading, error, empty.
 *
 * Every screen rendering those three by hand is how they end up subtly
 * different, and how one of them ends up missing the error case entirely.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCw, TriangleAlert } from '@lucide/vue'

const props = withDefaults(defineProps<{
  title: string
  lede?: string
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyTitle?: string
  emptyBody?: string
}>(), {
  lede: '',
  loading: false,
  error: null,
  empty: false,
  emptyTitle: 'Nothing here yet',
  emptyBody: '',
})

defineEmits<{ (e: 'retry'): void }>()

/**
 * The layout already prints the route's title above the content. Repeating it
 * here gave every section two identical headings. So the heading renders only
 * when it says something the route title does not — which is exactly the case
 * that matters, a sub-section like "MCP server" inside "Integrations / API".
 */
const route = useRoute()
const showTitle = computed(() => {
  const a = String(route.meta?.title ?? '').trim().toLowerCase()
  const b = props.title.trim().toLowerCase()
  if (!a || !b) return true
  // Prefix, not equality: the menu shortens "Knowledge base / memory" to
  // "Knowledge base", and those are the same heading said twice.
  return !(a.startsWith(b) || b.startsWith(a))
})
</script>

<template>
  <section class="shell">
    <header class="head">
      <div class="titles">
        <h2 v-if="showTitle">{{ title }}</h2>
        <p v-if="lede">{{ lede }}</p>
      </div>
      <div class="acts"><slot name="actions" /></div>
    </header>

    <slot name="filters" />

    <div v-if="loading" class="state">
      <div class="spin"><RefreshCw :size="18" /></div>
      <p>Loading…</p>
    </div>

    <div v-else-if="error" class="state err">
      <TriangleAlert :size="20" />
      <strong>Could not load this</strong>
      <p>{{ error }}</p>
      <button class="btn" @click="$emit('retry')">Try again</button>
    </div>

    <div v-else-if="empty" class="state">
      <strong>{{ emptyTitle }}</strong>
      <p v-if="emptyBody">{{ emptyBody }}</p>
      <slot name="empty-action" />
    </div>

    <slot v-else />
  </section>
</template>

<style scoped>
.shell { display: flex; flex-direction: column; gap: 1rem; }
.head { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.titles h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -.01em; }
.titles p { font-size: .85rem; color: var(--mut); margin-top: .2rem; max-width: 62ch; }
.acts { margin-left: auto; display: flex; gap: .45rem; flex-wrap: wrap; }

.state {
  display: flex; flex-direction: column; align-items: center; gap: .5rem;
  padding: 3rem 1rem; text-align: center;
  border: 1px dashed var(--line-2); border-radius: var(--r-md);
  color: var(--mut);
}
.state strong { color: var(--txt); font-size: .95rem; }
.state p { font-size: .85rem; max-width: 46ch; }
.state.err { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); }
.state.err p { color: var(--mut); }

.spin { animation: spin 1s linear infinite; display: grid; place-items: center; }
@keyframes spin { to { transform: rotate(360deg); } }

.btn {
  padding: .45rem .9rem; border-radius: var(--r-sm); font-size: .85rem;
  border: 1px solid var(--line-2); background: color-mix(in srgb, var(--txt) 4%, transparent);
  color: var(--txt); font-family: inherit;
}
.btn:hover { border-color: var(--acc); }

@media (max-width: 560px) {
  .acts { margin-left: 0; width: 100%; }
}
</style>
