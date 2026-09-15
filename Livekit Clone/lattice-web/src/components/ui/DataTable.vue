<script setup lang="ts">
/**
 * Table with first-class loading / empty / error states.
 *
 * Those three are not decoration — a screen that only renders the happy path
 * looks broken the moment the network is slow or a tenant is new.
 */
import { computed } from 'vue'

interface Column {
  key: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
  mono?: boolean
}

const props = withDefaults(defineProps<{
  columns: Column[]
  rows: any[]
  loading?: boolean
  error?: string | null
  emptyTitle?: string
  emptyBody?: string
  rowKey?: string
  clickable?: boolean
}>(), {
  loading: false,
  error: null,
  emptyTitle: 'Nothing here yet',
  emptyBody: '',
  rowKey: 'id',
  clickable: false,
})

const emit = defineEmits<{ (e: 'row', row: any): void; (e: 'retry'): void }>()

const showBody = computed(() => !props.loading && !props.error && props.rows.length > 0)
const showEmpty = computed(() => !props.loading && !props.error && props.rows.length === 0)
</script>

<template>
  <div class="tbl-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key"
              :style="{ width: c.width, textAlign: c.align || 'left' }">
            {{ c.label }}
          </th>
        </tr>
      </thead>

      <tbody v-if="loading">
        <tr v-for="n in 5" :key="'sk' + n" class="skeleton-row">
          <td v-for="c in columns" :key="c.key"><span class="sk"></span></td>
        </tr>
      </tbody>

      <tbody v-else-if="showBody">
        <tr v-for="row in rows" :key="row[rowKey]"
            :class="{ clickable }"
            :tabindex="clickable ? 0 : undefined"
            @click="clickable && emit('row', row)"
            @keydown.enter="clickable && emit('row', row)">
          <td v-for="c in columns" :key="c.key"
              :style="{ textAlign: c.align || 'left' }"
              :class="{ mono: c.mono }">
            <slot :name="`cell:${c.key}`" :row="row" :value="row[c.key]">
              {{ row[c.key] ?? '—' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="error" class="state error">
      <strong>Could not load this</strong>
      <p>{{ error }}</p>
      <button class="btn-sm" @click="emit('retry')">Try again</button>
    </div>

    <div v-else-if="showEmpty" class="state">
      <strong>{{ emptyTitle }}</strong>
      <p v-if="emptyBody">{{ emptyBody }}</p>
      <slot name="empty-action" />
    </div>
  </div>
</template>

<style scoped>
.tbl-wrap {
  border: 1px solid var(--line);
  border-radius: var(--brand-radius-md, 12px);
  background: var(--panel);
  overflow-x: auto;
}
.tbl { width: 100%; border-collapse: collapse; font-size: .89rem; min-width: 560px; }
thead th {
  text-align: left; font-weight: 600; font-size: .78rem; letter-spacing: .04em;
  text-transform: uppercase; color: var(--mut);
  padding: .8rem 1rem; border-bottom: 1px solid var(--line); white-space: nowrap;
}
tbody td {
  padding: .85rem 1rem; border-bottom: 1px solid var(--line);
  color: var(--txt); vertical-align: middle;
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr.clickable { cursor: pointer; transition: background .15s; }
tbody tr.clickable:hover, tbody tr.clickable:focus-visible {
  background: color-mix(in srgb, var(--txt) 4%, transparent); outline: none;
}
tbody tr.clickable:focus-visible { box-shadow: inset 0 0 0 2px var(--brand-primary, #6d5efc); }
td.mono { font-family: var(--brand-mono, ui-monospace), monospace; font-size: .84rem; }

.sk {
  display: block; height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--txt) 5%, transparent), color-mix(in srgb, var(--txt) 11%, transparent), color-mix(in srgb, var(--txt) 5%, transparent));
  background-size: 200% 100%;
  animation: shimmer 1.3s linear infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

.state { padding: 3rem 1.5rem; text-align: center; }
.state strong { display: block; font-size: 1rem; margin-bottom: .4rem; }
.state p { color: var(--mut); font-size: .9rem; margin-bottom: 1rem; }
.state.error strong { color: var(--brand-danger, #f87171); }
.btn-sm {
  padding: .5rem 1rem; border-radius: 9px; font-size: .85rem; font-weight: 600;
  background: var(--brand-primary, #6d5efc); color: #fff; border: 0;
}

@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
</style>
