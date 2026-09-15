<script setup lang="ts">
/**
 * Integrations / API — four sub-tabs, matching how operators actually think
 * about this: keys they paste in, the REST surface, the MCP server, and a
 * place to try a call without leaving the console.
 */
import { computed, onMounted, ref } from 'vue'
import { Copy, Trash2, Plus } from '@lucide/vue'
import { Admin } from '../../../api/index'
import { Settings as SettingsApi } from '../../../api/sections'
import { API_BASE } from '../../../api/client'
import { useAuth } from '../../../stores/auth'
import { useUI } from '../../../stores/ui'
import PageShell from '../../../components/ui/PageShell.vue'
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'

const auth = useAuth()
const ui = useUI()

const TABS = ['API keys', 'REST API', 'MCP server', 'Sandbox'] as const
const tab = ref<(typeof TABS)[number]>('API keys')

/* ------------------------------------------------------------ API keys --- */

const keys = ref<any[]>([])
const loadingKeys = ref(true)
const keysError = ref<string | null>(null)
const newKeyName = ref('')
const issued = ref('')

async function loadKeys() {
  loadingKeys.value = true
  keysError.value = null
  try {
    keys.value = await Admin.keys()
  } catch (e: any) {
    keysError.value = e.message
  } finally {
    loadingKeys.value = false
  }
}

async function createKey() {
  if (!newKeyName.value.trim()) return
  try {
    const k = await Admin.createKey({ name: newKeyName.value.trim() })
    // The secret is returned exactly once. If the operator navigates away
    // without copying it, it is gone — say so rather than pretending.
    issued.value = (k as any).secret ?? ''
    newKeyName.value = ''
    await loadKeys()
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function revokeKey(k: any) {
  if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return
  try {
    await Admin.revokeKey(k.id)
    await loadKeys()
  } catch (e: any) {
    ui.error(e.message)
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ui.success('Copied')
  } catch {
    ui.error('Could not copy — select the text and copy it manually')
  }
}

/* ------------------------------------------------------------ REST API --- */

// `location` is not in scope inside a template, so it is resolved here.
const origin = location.origin
const base = computed(() => `${origin}${API_BASE}`)
const docsUrl = `${origin}/api/docs`
const sampleCurl = computed(() =>
  `curl -H "Authorization: Bearer ltn_your_key_here" \\\n     ${base.value}/agents`)

/* ---------------------------------------------------------------- MCP --- */

const mcpFields: Field[] = [
  { key: 'enabled', label: 'Enable MCP server', type: 'switch',
    note: 'Lets an external agent read and manage this tenant over the Model Context Protocol.' },
  { key: 'path', label: 'Path', placeholder: '/mcp' },
  { key: 'allow_tools', label: 'Expose tools', type: 'switch' },
  { key: 'allow_agents', label: 'Expose agents', type: 'switch' },
  { key: 'allow_settings', label: 'Expose settings', type: 'switch',
    note: 'Off by default. On, an MCP client can change this tenant’s configuration.' },
  { key: 'allowed_origins', label: 'Allowed origins', type: 'list',
    placeholder: 'https://claude.ai, https://example.com' },
]

const mcpUrl = ref('')
async function loadMcp() {
  try {
    const res = await SettingsApi.get('mcp')
    mcpUrl.value = `${origin}${res.value.path || '/mcp'}`
  } catch { /* the form below reports its own errors */ }
}

/* ------------------------------------------------------------- sandbox --- */

const sbMethod = ref('GET')
const sbPath = ref('/agents')
const sbBody = ref('')
const sbOut = ref('')
const sbBusy = ref(false)

async function send() {
  sbBusy.value = true
  sbOut.value = ''
  try {
    const opts: RequestInit = {
      method: sbMethod.value,
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
    }
    const { currentAccess } = await import('../../../api/client')
    ;(opts.headers as any).authorization = `Bearer ${currentAccess() ?? ''}`
    if (sbMethod.value !== 'GET' && sbBody.value.trim()) opts.body = sbBody.value
    const res = await fetch(`${API_BASE}${sbPath.value}`, opts)
    const text = await res.text()
    try {
      sbOut.value = `${res.status} ${res.statusText}\n\n${JSON.stringify(JSON.parse(text), null, 2)}`
    } catch {
      sbOut.value = `${res.status} ${res.statusText}\n\n${text}`
    }
  } catch (e: any) {
    sbOut.value = `Request failed: ${e.message}`
  } finally {
    sbBusy.value = false
  }
}

onMounted(() => { loadKeys(); loadMcp() })
</script>

<template>
  <div class="wrap">
    <nav class="s-tabs">
      <button v-for="t in TABS" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
    </nav>

    <!-- ------------------------------------------------------ API keys -->
    <PageShell v-if="tab === 'API keys'"
      title="API keys"
      lede="Machine credentials for this tenant. A key carries a role, is scoped to this tenant only, and is shown once."
      :loading="loadingKeys" :error="keysError" @retry="loadKeys">
      <template #actions>
        <input v-model="newKeyName" class="s-input narrow" placeholder="Key name" />
        <button class="s-btn primary" :disabled="!newKeyName.trim()" @click="createKey">
          <Plus :size="15" /> Generate key
        </button>
      </template>

      <div v-if="issued" class="issued s-card">
        <strong>Copy this now — it is not shown again.</strong>
        <div class="secret">
          <code>{{ issued }}</code>
          <button class="s-icon-btn" @click="copy(issued)"><Copy :size="14" /></button>
        </div>
        <button class="s-btn" @click="issued = ''">I have saved it</button>
      </div>

      <p v-if="!keys.length" class="none">No keys yet.</p>
      <table v-else class="tbl">
        <thead><tr><th>Name</th><th>Prefix</th><th>Role</th><th>Last used</th><th></th></tr></thead>
        <tbody>
          <tr v-for="k in keys" :key="k.id">
            <td>{{ k.name }}</td>
            <td class="s-mono">{{ k.prefix ?? '—' }}</td>
            <td>{{ k.role }}</td>
            <td>{{ k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never' }}</td>
            <td class="s-acts">
              <button class="s-icon-btn danger" title="Revoke" @click="revokeKey(k)"><Trash2 :size="14" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </PageShell>

    <!-- ------------------------------------------------------ REST API -->
    <PageShell v-else-if="tab === 'REST API'"
      title="REST API"
      lede="The same API the console uses. There is no second, lesser public API — every screen here is built on these endpoints.">
      <div class="s-card">
        <div class="s-kv"><dt>Base URL</dt><dd>{{ base }}</dd></div>
        <div class="s-kv"><dt>OpenAPI</dt><dd>{{ base }}/openapi.json</dd></div>
        <div class="s-kv"><dt>Interactive docs</dt><dd>{{ docsUrl }}</dd></div>
        <div class="s-kv"><dt>Auth</dt><dd>Authorization: Bearer &lt;key&gt;</dd></div>
      </div>
      <div class="s-card">
        <header class="ch"><h3>Example</h3>
          <button class="s-btn" @click="copy(sampleCurl)"><Copy :size="14" /> Copy</button>
        </header>
        <pre>{{ sampleCurl }}</pre>
      </div>
    </PageShell>

    <!-- ---------------------------------------------------- MCP server -->
    <template v-else-if="tab === 'MCP server'">
      <div class="s-card mcpBanner" v-if="mcpUrl">
        <span>Endpoint</span><code>{{ mcpUrl }}</code>
        <button class="s-icon-btn" @click="copy(mcpUrl)"><Copy :size="14" /></button>
      </div>
      <SettingsForm
        group="mcp"
        title="MCP server"
        lede="Expose this tenant over the Model Context Protocol so an external agent can manage it. Off by default."
        :fields="mcpFields"
        :readonly="!auth.can('admin')"
      />
    </template>

    <!-- -------------------------------------------------------- sandbox -->
    <PageShell v-else
      title="Sandbox"
      lede="Try a call against this tenant with your own session. Requests run as you, with your role — this is not a simulator.">
      <div class="sb">
        <div class="sbRow">
          <select v-model="sbMethod" class="s-select narrow">
            <option>GET</option><option>POST</option><option>PATCH</option>
            <option>PUT</option><option>DELETE</option>
          </select>
          <input v-model="sbPath" class="s-input" placeholder="/agents" />
          <button class="s-btn primary" :disabled="sbBusy" @click="send">
            {{ sbBusy ? 'Sending…' : 'Send' }}
          </button>
        </div>
        <textarea v-if="sbMethod !== 'GET'" v-model="sbBody" class="s-textarea"
                  placeholder='{"name": "Test agent"}'></textarea>
        <pre v-if="sbOut" class="out">{{ sbOut }}</pre>
      </div>
    </PageShell>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; gap: 1.2rem; }
.narrow { width: auto; min-width: 150px; }
.none { font-size: .85rem; color: var(--mut); }

.issued { display: flex; flex-direction: column; gap: .6rem;
  border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
.issued strong { font-size: .88rem; color: var(--warn); }
.secret { display: flex; align-items: center; gap: .5rem; }
.secret code {
  flex: 1; font-family: var(--mono); font-size: .82rem; word-break: break-all;
  padding: .5rem .7rem; border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--txt) 6%, transparent);
}
.issued .s-btn { align-self: flex-start; }

.tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.tbl th, .tbl td { text-align: left; padding: .5rem .5rem; border-bottom: 1px solid var(--line); }
.tbl th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }

.ch { display: flex; align-items: center; gap: 1rem; margin-bottom: .6rem; }
.ch h3 { font-size: .9rem; font-weight: 700; }
.ch button { margin-left: auto; }
pre {
  font-family: var(--mono); font-size: .8rem; line-height: 1.6;
  padding: .8rem; border-radius: var(--r-sm); overflow-x: auto;
  background: color-mix(in srgb, var(--txt) 6%, transparent);
}

.mcpBanner { display: flex; align-items: center; gap: .7rem; }
.mcpBanner span { font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.mcpBanner code { font-family: var(--mono); font-size: .84rem; flex: 1; }

.sb { display: flex; flex-direction: column; gap: .7rem; }
.sbRow { display: flex; gap: .5rem; align-items: center; }
.out { max-height: 420px; overflow: auto; }
@media (max-width: 560px) { .sbRow { flex-wrap: wrap; } }
</style>
