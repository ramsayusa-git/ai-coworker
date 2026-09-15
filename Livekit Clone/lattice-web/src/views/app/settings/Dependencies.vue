<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { SystemInfo } from '../../../api/sections'
import PageShell from '../../../components/ui/PageShell.vue'

const data = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await SystemInfo.dependencies()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageShell
    title="Dependencies"
    lede="Read from the running interpreter, not from a requirements file — this is what is installed, not what was asked for."
    :loading="loading" :error="error" @retry="load"
  >
    <template #actions>
      <button class="s-btn" @click="load">Refresh</button>
    </template>

    <template v-if="data">
      <div class="s-card">
        <div class="s-kv"><dt>Python</dt><dd>{{ data.python }}</dd></div>
        <div class="s-kv"><dt>Platform</dt><dd>{{ data.platform }}</dd></div>
        <div class="s-kv"><dt>Packages tracked</dt><dd>{{ data.packages.length }}</dd></div>
      </div>

      <div v-if="data.missing.length" class="s-card missing">
        <strong>{{ data.missing.length }} package(s) missing</strong>
        <p>{{ data.missing.join(', ') }} — features relying on these will fail at the point of use.</p>
      </div>

      <table class="tbl">
        <thead><tr><th>Package</th><th>Version</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="p in data.packages" :key="p.name">
            <td class="s-mono">{{ p.name }}</td>
            <td class="s-mono">{{ p.version || '—' }}</td>
            <td><span class="s-pill" :class="p.status === 'installed' ? 'ok' : 'bad'">{{ p.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </template>
  </PageShell>
</template>

<style scoped>
.tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.tbl th, .tbl td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); }
.tbl th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.missing { border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
.missing strong { display: block; color: var(--warn); font-size: .88rem; margin-bottom: .25rem; }
.missing p { font-size: .84rem; color: var(--mut); }
</style>
