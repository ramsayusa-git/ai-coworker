<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  items: { label: string; value: number; id?: string }[]
  loading?: boolean
  emptyTitle?: string
  emptyBody?: string
  unit?: string
}>()

const emit = defineEmits<{ (e: 'pick', id: string): void }>()
const peak = computed(() => Math.max(1, ...props.items.map((i) => i.value)))
</script>

<template>
  <div class="bl">
    <div v-if="loading" class="sks">
      <div v-for="n in 4" :key="n" class="sk shimmer"></div>
    </div>

    <div v-else-if="!items.length" class="empty">
      <strong>{{ emptyTitle || 'Nothing yet' }}</strong>
      <p v-if="emptyBody">{{ emptyBody }}</p>
    </div>

    <ul v-else>
      <li v-for="(it, i) in items" :key="it.id || it.label"
          :style="{ '--i': i }"
          :class="{ clickable: !!it.id }"
          :tabindex="it.id ? 0 : undefined"
          @click="it.id && emit('pick', it.id)"
          @keydown.enter="it.id && emit('pick', it.id)">
        <span class="nm">{{ it.label }}</span>
        <span class="track">
          <i :style="{ width: (it.value / peak) * 100 + '%' }"></i>
        </span>
        <span class="val">{{ it.value.toLocaleString() }}{{ unit || '' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.bl { height: 100%; overflow-y: auto; }
ul { list-style: none; display: grid; gap: .7rem; }
li {
  display: grid; grid-template-columns: minmax(5rem, 9rem) 1fr auto;
  gap: .8rem; align-items: center; font-size: .85rem;
  padding: .2rem .25rem; border-radius: var(--r-sm);
  animation: slide .4s var(--ease) both;
  animation-delay: calc(var(--i) * 45ms);
  transition: background var(--fast) var(--ease);
}
li.clickable { cursor: pointer; }
li.clickable:hover, li.clickable:focus-visible { background: color-mix(in srgb, var(--txt) 5%, transparent); }
@keyframes slide { from { opacity: 0; transform: translateX(-8px); } }

.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt-2); }
.track { height: 8px; border-radius: 5px; background: var(--line); overflow: hidden; }
.track i {
  display: block; height: 100%; border-radius: 5px;
  background: linear-gradient(90deg, var(--acc), var(--acc-2));
  box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 45%, transparent);
  transition: width var(--slow) var(--ease);
}
.val { font-family: var(--mono); font-size: .8rem; color: var(--txt); }

.sks { display: grid; gap: .8rem; }
.sk { height: 16px; border-radius: 6px; }
.empty { height: 100%; display: grid; place-content: center; text-align: center; }
.empty strong { display: block; font-size: .92rem; margin-bottom: .25rem; }
.empty p { font-size: .82rem; color: var(--mut); }

@media (max-width: 520px) { li { grid-template-columns: 4.5rem 1fr auto; } }
</style>
