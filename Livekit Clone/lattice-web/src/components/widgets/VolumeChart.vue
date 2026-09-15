<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ data: number[]; loading?: boolean; tz?: string }>()

const hover = ref<number | null>(null)
const peak = computed(() => Math.max(1, ...(props.data ?? [0])))
const total = computed(() => (props.data ?? []).reduce((a, b) => a + b, 0))
const hasData = computed(() => total.value > 0)
</script>

<template>
  <div class="vc">
    <div v-if="loading" class="sk shimmer"></div>

    <div v-else-if="!hasData" class="empty">
      <strong>No calls in this window</strong>
      <p>Volume appears here once agents start answering.</p>
    </div>

    <template v-else>
      <div class="chart" role="img" :aria-label="`Call volume, peak ${peak} per hour`">
        <div
          v-for="(n, i) in data"
          :key="i"
          class="col"
          :class="{ active: hover === i }"
          :style="{ height: Math.max(3, (n / peak) * 100) + '%', '--i': i }"
          @mouseenter="hover = i"
          @mouseleave="hover = null"
        >
          <span class="tip" v-if="hover === i">{{ n }}</span>
        </div>
      </div>
      <footer>
        <span>Peak {{ peak }}/hr</span>
        <span>{{ total.toLocaleString() }} total</span>
        <span v-if="tz" class="tz">{{ tz }}</span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.vc { display: flex; flex-direction: column; height: 100%; }
.chart {
  flex: 1; min-height: 80px; display: flex; align-items: flex-end;
  gap: 2px; padding-top: 1.2rem;
}
.col {
  position: relative; flex: 1; min-height: 3px; border-radius: 4px 4px 2px 2px;
  background: linear-gradient(180deg, var(--acc-2), var(--acc));
  opacity: .85;
  transform-origin: bottom;
  animation: grow .5s var(--ease) both;
  animation-delay: calc(var(--i) * 12ms);
  transition: opacity var(--fast) var(--ease), filter var(--fast) var(--ease);
}
.col:hover, .col.active {
  opacity: 1;
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--acc) 60%, transparent));
}
@keyframes grow { from { transform: scaleY(0); opacity: 0; } }

.tip {
  position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  padding: .15rem .45rem; border-radius: 6px; font-size: .72rem; font-weight: 650;
  font-family: var(--mono); white-space: nowrap;
  background: var(--panel-raised); border: 1px solid var(--line-2);
  color: var(--txt); box-shadow: var(--sh-2);
}

footer {
  display: flex; gap: 1rem; margin-top: .7rem; padding-top: .6rem;
  border-top: 1px solid var(--line);
  font-size: .76rem; color: var(--mut);
}
.tz { margin-left: auto; }

.sk { flex: 1; border-radius: var(--r-sm); min-height: 90px; }
.empty { flex: 1; display: grid; place-content: center; text-align: center; }
.empty strong { display: block; font-size: .92rem; margin-bottom: .25rem; }
.empty p { font-size: .82rem; color: var(--mut); }
</style>
