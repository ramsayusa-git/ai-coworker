<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Users, KeyRound, Palette, FileBadge, Activity, Plus, Trash2, Copy, Check, Upload,
} from '@lucide/vue'
import DataTable from '../../../components/ui/DataTable.vue'
import { Admin, System, type TenantUser, type ApiKeyRow, type Brand, type Licence } from '../../../api'
import { useAuth } from '../../../stores/auth'
import { useBranding } from '../../../stores/branding'
import { useUI } from '../../../stores/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const branding = useBranding()
const ui = useUI()

const TABS = [
  { key: 'users', label: 'Users & roles', icon: Users, min: 'admin' },
  { key: 'keys', label: 'API keys', icon: KeyRound, min: 'owner' },
  { key: 'branding', label: 'Branding', icon: Palette, min: 'admin' },
  { key: 'licence', label: 'Licence', icon: FileBadge, min: 'admin' },
  { key: 'system', label: 'System', icon: Activity, min: 'admin' },
] as const

const tabs = computed(() => TABS.filter((t) => auth.can(t.min as any)))
const tab = ref<string>((route.params.tab as string) || 'users')
watch(() => route.params.tab, (t) => { if (t) tab.value = t as string })
function go(k: string) { tab.value = k; router.replace(`/app/settings/${k}`) }

// ---- users
const users = ref<TenantUser[]>([])
const uLoading = ref(true)
const uError = ref<string | null>(null)
const inviting = ref(false)
const invite = ref({ email: '', name: '', role: 'viewer' })
const inviteErr = ref('')
const issued = ref<{ email: string; password: string } | null>(null)

const userCols = [
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role', width: '130px' },
  { key: 'status', label: 'Status', width: '110px' },
  { key: 'actions', label: '', width: '60px', align: 'right' as const },
]

async function loadUsers() {
  uLoading.value = true; uError.value = null
  try { users.value = await Admin.users() } catch (e: any) { uError.value = e.message }
  finally { uLoading.value = false }
}

async function addUser() {
  inviteErr.value = ''
  try {
    const u = await Admin.addUser(invite.value)
    users.value.push(u)
    if (u.password) issued.value = { email: u.email, password: u.password }
    inviting.value = false
    invite.value = { email: '', name: '', role: 'viewer' }
    ui.success('User added')
  } catch (e: any) { inviteErr.value = e.message }
}

async function changeRole(u: TenantUser, role: string) {
  try {
    const updated = await Admin.patchUser(u.id, { role })
    const i = users.value.findIndex((x) => x.id === u.id)
    if (i >= 0) users.value[i] = updated
    ui.success('Role updated', `${u.email} is now ${role}`)
  } catch (e: any) { ui.error('Could not update role', e.message); loadUsers() }
}

async function removeUser(u: TenantUser) {
  if (!confirm(`Remove ${u.email} from this tenant? They keep their account but lose access here.`)) return
  try {
    await Admin.removeUser(u.id)
    users.value = users.value.filter((x) => x.id !== u.id)
    ui.success('User removed')
  } catch (e: any) { ui.error('Could not remove user', e.message) }
}

// ---- api keys
const keys = ref<ApiKeyRow[]>([])
const kLoading = ref(true)
const kError = ref<string | null>(null)
const newKeyName = ref('')
const freshSecret = ref('')
const copied = ref(false)

const keyCols = [
  { key: 'name', label: 'Name' },
  { key: 'prefix', label: 'Prefix', width: '150px', mono: true },
  { key: 'last_used_at', label: 'Last used', width: '160px' },
  { key: 'actions', label: '', width: '60px', align: 'right' as const },
]

async function loadKeys() {
  kLoading.value = true; kError.value = null
  try { keys.value = await Admin.keys() } catch (e: any) { kError.value = e.message }
  finally { kLoading.value = false }
}
async function createKey() {
  if (!newKeyName.value.trim()) return
  try {
    const k = await Admin.createKey({ name: newKeyName.value.trim() })
    freshSecret.value = k.secret || ''
    newKeyName.value = ''
    await loadKeys()
  } catch (e: any) { ui.error('Could not create key', e.message) }
}
async function revokeKey(k: ApiKeyRow) {
  if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return
  try { await Admin.revokeKey(k.id); await loadKeys(); ui.success('Key revoked') }
  catch (e: any) { ui.error('Could not revoke', e.message) }
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(freshSecret.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch { ui.error('Copy failed', 'Select the text and copy it manually.') }
}

// ---- branding
const brand = ref<Brand | null>(null)
const bSaving = ref(false)
const uploading = ref<string>('')

async function pickAsset(kind: 'logo' | 'logo_dark' | 'favicon' | 'login_art', e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !brand.value) return
  uploading.value = kind
  try {
    const { url } = await Admin.uploadAsset(kind, file)
    if (kind === 'logo') brand.value.logo_url = url
    if (kind === 'logo_dark') brand.value.logo_dark_url = url
    if (kind === 'favicon') brand.value.favicon_url = url
    if (kind === 'login_art') brand.value.login_art_url = url
    livePreview()
    ui.success('Uploaded', 'Remember to save branding.')
  } catch (err: any) {
    ui.error('Upload failed', err.message)
  } finally {
    uploading.value = ''
    input.value = ''   // let the same file be re-picked after a failure
  }
}
async function loadBrand() {
  try { brand.value = { ...(await Admin.branding()) } } catch (e: any) { ui.error('Could not load branding', e.message) }
}
function livePreview() { if (brand.value) branding.preview(brand.value) }
async function saveBrand() {
  if (!brand.value) return
  bSaving.value = true
  try { await branding.save(brand.value); ui.success('Branding saved') }
  catch (e: any) { ui.error('Could not save branding', e.message) }
  finally { bSaving.value = false }
}

// ---- licence + system
const licence = ref<Licence | null>(null)
const sysInfo = ref<any>(null)
const auditRows = ref<any[]>([])

async function loadLicence() { try { licence.value = await Admin.licence() } catch { /* shown as unknown */ } }
async function loadSystem() {
  try { sysInfo.value = await System.info() } catch { /* */ }
  try { auditRows.value = await System.audit(50) } catch { /* */ }
}

onMounted(() => {
  loadUsers()
  if (auth.can('owner')) loadKeys()
  loadBrand(); loadLicence(); loadSystem()
})
</script>

<template>
  <div>
    <nav class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="go(t.key)">
        <component :is="t.icon" :size="15" /> {{ t.label }}
      </button>
    </nav>

    <!-- USERS -->
    <section v-if="tab === 'users'">
      <div class="head">
        <div><h2>Users & roles</h2><p>Who can reach this tenant, and what they may do.</p></div>
        <button class="primary" @click="inviting = true"><Plus :size="15" /> Add user</button>
      </div>

      <div v-if="issued" class="secret">
        <strong>Temporary password for {{ issued.email }}</strong>
        <code>{{ issued.password }}</code>
        <p>Shown once. They must change it at first sign-in.</p>
        <button @click="issued = null">Done</button>
      </div>

      <DataTable :columns="userCols" :rows="users" :loading="uLoading" :error="uError"
                 empty-title="No users yet" @retry="loadUsers">
        <template #cell:role="{ row }">
          <select :value="row.role" @change="changeRole(row, ($event.target as HTMLSelectElement).value)"
                  :disabled="!auth.can('admin')">
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
            <option value="owner" :disabled="!auth.can('owner')">Owner</option>
          </select>
        </template>
        <template #cell:status="{ row }">
          <span class="pill" :class="row.status">{{ row.status }}</span>
        </template>
        <template #cell:actions="{ row }">
          <button class="ic danger" @click="removeUser(row)" aria-label="Remove user">
            <Trash2 :size="14" />
          </button>
        </template>
      </DataTable>

      <div v-if="inviting" class="scrim" @click.self="inviting = false">
        <div class="modal surface">
          <h3>Add user</h3>
          <label><span>Email</span><input v-model="invite.email" type="email" autofocus /></label>
          <label><span>Name</span><input v-model="invite.name" /></label>
          <label><span>Role</span>
            <select v-model="invite.role">
              <option value="viewer">Viewer — read only</option>
              <option value="operator">Operator — run agents</option>
              <option value="admin">Admin — full config</option>
              <option value="owner" :disabled="!auth.can('owner')">Owner — everything</option>
            </select>
          </label>
          <p v-if="inviteErr" class="err">{{ inviteErr }}</p>
          <div class="acts">
            <button @click="inviting = false">Cancel</button>
            <button class="primary" @click="addUser" :disabled="!invite.email">Add</button>
          </div>
        </div>
      </div>
    </section>

    <!-- API KEYS -->
    <section v-else-if="tab === 'keys'">
      <div class="head">
        <div><h2>API keys</h2><p>Machine access to this tenant's API. Keys are shown once.</p></div>
      </div>

      <div v-if="freshSecret" class="secret">
        <strong>New API key</strong>
        <code>{{ freshSecret }}</code>
        <p>Copy it now — it is hashed at rest and cannot be shown again.</p>
        <div class="acts">
          <button @click="copySecret">
            <component :is="copied ? Check : Copy" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button @click="freshSecret = ''">Done</button>
        </div>
      </div>

      <div class="newkey">
        <input v-model="newKeyName" placeholder="Key name, e.g. dialer-integration"
               @keydown.enter="createKey" />
        <button class="primary" @click="createKey" :disabled="!newKeyName.trim()">
          <Plus :size="15" /> Create key
        </button>
      </div>

      <DataTable :columns="keyCols" :rows="keys" :loading="kLoading" :error="kError"
                 empty-title="No API keys" empty-body="Create one to let a service call this API."
                 @retry="loadKeys">
        <template #cell:last_used_at="{ row }">
          {{ row.last_used_at ? new Date(row.last_used_at).toLocaleString() : 'never' }}
        </template>
        <template #cell:actions="{ row }">
          <button class="ic danger" @click="revokeKey(row)" aria-label="Revoke key">
            <Trash2 :size="14" />
          </button>
        </template>
      </DataTable>
    </section>

    <!-- BRANDING -->
    <section v-else-if="tab === 'branding'">
      <div class="head">
        <div><h2>Branding</h2><p>Every surface your customers see. Changes preview live.</p></div>
        <button class="primary" @click="saveBrand" :disabled="bSaving">
          {{ bSaving ? 'Saving…' : 'Save branding' }}
        </button>
      </div>

      <div v-if="brand" class="bgrid">
        <div class="card surface">
          <h3>Identity</h3>
          <label><span>Product name</span>
            <input v-model="brand.product_name" @input="livePreview" /></label>
          <label><span>Logo</span>
            <div class="upload">
              <img v-if="brand.logo_url" :src="brand.logo_url" alt="" class="prev" />
              <input v-model="brand.logo_url" @input="livePreview" placeholder="/logo-mark.svg or https://…" />
              <label class="pick">
                <Upload :size="14" /> {{ uploading === 'logo' ? 'Uploading…' : 'Upload' }}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                       hidden @change="pickAsset('logo', $event)" />
              </label>
            </div>
            <small>PNG, JPEG, WebP or SVG. Up to 2 MB. Scripted SVGs are rejected.</small>
          </label>

          <label><span>Favicon</span>
            <div class="upload">
              <img v-if="brand.favicon_url" :src="brand.favicon_url" alt="" class="prev sm" />
              <input v-model="brand.favicon_url" @input="livePreview" placeholder="/favicon.svg" />
              <label class="pick">
                <Upload :size="14" /> {{ uploading === 'favicon' ? 'Uploading…' : 'Upload' }}
                <input type="file" accept="image/png,image/svg+xml,image/x-icon"
                       hidden @change="pickAsset('favicon', $event)" />
              </label>
            </div>
          </label>
          <label><span>Support URL</span><input v-model="brand.support_url" /></label>
          <label><span>Docs URL</span><input v-model="brand.docs_url" /></label>
        </div>

        <div class="card surface">
          <h3>Palette</h3>
          <div v-for="k in ['primary','accent','success','warning','danger']" :key="k" class="swatch">
            <input type="color" :value="brand.colors[k] || '#6d5efc'"
                   @input="brand.colors[k] = ($event.target as HTMLInputElement).value; livePreview()"
                   :aria-label="k" />
            <div><strong>{{ k }}</strong><code>{{ brand.colors[k] }}</code></div>
          </div>
        </div>

        <div class="card surface">
          <h3>Mail identity</h3>
          <label><span>From name</span><input v-model="brand.mail_from_name" /></label>
          <label><span>From address</span><input v-model="brand.mail_from_email" type="email" /></label>
          <label><span>Footer</span><textarea v-model="brand.mail_footer" rows="3"></textarea></label>
        </div>

        <div class="card surface">
          <h3>Custom CSS</h3>
          <p class="muted">Injected last, so it overrides everything above. Limited to 100 KB.</p>
          <textarea v-model="brand.custom_css" rows="8" class="mono"
                    placeholder=".widget { border-radius: 4px; }"></textarea>
        </div>
      </div>
    </section>

    <!-- LICENCE -->
    <section v-else-if="tab === 'licence'">
      <div class="head"><div><h2>Licence</h2><p>Verified offline. No usage data leaves this install.</p></div></div>
      <div v-if="licence" class="card surface lic">
        <div class="lic-top">
          <span class="pill" :class="licence.status">{{ licence.status }}</span>
          <strong>{{ licence.licensee || 'Unlicensed' }}</strong>
        </div>
        <dl>
          <div><dt>Tier</dt><dd>{{ licence.tier || '—' }}</dd></div>
          <div><dt>Expires</dt><dd>{{ licence.expires_at ? new Date(licence.expires_at).toLocaleDateString() : 'never' }}</dd></div>
          <div><dt>Days left</dt><dd>{{ licence.days_left ?? '—' }}</dd></div>
          <div><dt>Max tenants</dt><dd>{{ licence.tenants_max ?? 'unlimited' }}</dd></div>
          <div><dt>Max concurrent</dt><dd>{{ licence.concurrent_sessions_max ?? 'unlimited' }}</dd></div>
        </dl>
        <div v-if="licence.features?.length" class="feats">
          <span v-for="f in licence.features" :key="f">{{ f }}</span>
        </div>
        <p v-if="licence.error" class="err">{{ licence.error }}</p>
      </div>
    </section>

    <!-- SYSTEM -->
    <section v-else>
      <div class="head"><div><h2>System</h2><p>Version, contracts and the audit trail.</p></div></div>
      <div class="card surface" v-if="sysInfo">
        <h3>Build</h3>
        <dl>
          <div><dt>Core version</dt><dd>{{ sysInfo.version }}</dd></div>
          <div><dt>Timezone</dt><dd>{{ sysInfo.tz }}</dd></div>
          <div><dt>Tenant</dt><dd>{{ sysInfo.tenant?.name }} ({{ sysInfo.tenant?.slug }})</dd></div>
        </dl>
      </div>

      <div class="card surface">
        <h3>Recent activity</h3>
        <p v-if="!auditRows.length" class="muted">Nothing recorded yet.</p>
        <ul v-else class="audit">
          <li v-for="(a, i) in auditRows" :key="i">
            <span class="ts">{{ new Date(a.ts).toLocaleString() }}</span>
            <span class="act">{{ a.action }}</span>
            <span class="who">{{ a.who }}</span>
            <span class="det">{{ a.detail }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: .3rem; margin-bottom: 1.4rem; flex-wrap: wrap; }
.tabs button {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .5rem .85rem; border-radius: var(--r-sm); font-size: .85rem; font-weight: 600;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 3%, transparent);
  color: var(--mut); transition: all var(--fast) var(--ease);
}
.tabs button:hover { color: var(--txt); transform: translateY(-1px); }
.tabs button.on {
  color: var(--txt); background: color-mix(in srgb, var(--acc) 15%, transparent);
  border-color: color-mix(in srgb, var(--acc) 40%, transparent);
}

.head { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
.head h2 { font-size: 1.1rem; font-weight: 700; letter-spacing: -.015em; }
.head p { font-size: .86rem; color: var(--mut); margin-top: .2rem; }
.head .primary { margin-left: auto; }

.primary {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .55rem 1rem; border: 0; border-radius: var(--r-sm);
  background: var(--acc); color: #fff; font-weight: 600; font-size: .87rem;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent);
  transition: transform var(--fast) var(--ease);
}
.primary:hover:not(:disabled) { transform: translateY(-1px); }
.primary:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

.card { padding: 1.2rem; margin-bottom: 1rem; }
.card h3 { font-size: .93rem; font-weight: 650; margin-bottom: .9rem; }
.muted { font-size: .84rem; color: var(--mut); margin-bottom: .7rem; }

label { display: block; margin-bottom: .85rem; }
label span { display: block; font-size: .79rem; font-weight: 600; color: var(--mut); margin-bottom: .3rem; }
input, select, textarea {
  width: 100%; padding: .55rem .7rem; font-size: .88rem;
  border-radius: var(--r-sm); border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
  resize: vertical;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: var(--acc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent);
}
textarea.mono { font-family: var(--mono); font-size: .82rem; }

.bgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
.swatch { display: flex; align-items: center; gap: .7rem; margin-bottom: .7rem; }
.swatch input[type=color] {
  width: 42px; height: 34px; padding: 2px; border-radius: var(--r-sm); cursor: pointer;
}
.swatch strong { display: block; font-size: .85rem; text-transform: capitalize; }
.swatch code { font-size: .76rem; color: var(--mut); font-family: var(--mono); }

.secret {
  padding: 1.1rem; margin-bottom: 1rem; border-radius: var(--r-md);
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent);
}
.secret strong { display: block; margin-bottom: .5rem; font-size: .9rem; }
.secret code {
  display: block; padding: .6rem .75rem; margin-bottom: .5rem; border-radius: var(--r-sm);
  background: var(--panel-solid); border: 1px solid var(--line);
  font-family: var(--mono); font-size: .84rem; word-break: break-all;
}
.secret p { font-size: .82rem; color: var(--mut); margin-bottom: .7rem; }
.secret button, .acts button {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .45rem .9rem; border-radius: var(--r-sm); font-size: .85rem;
  border: 1px solid var(--line-2); background: color-mix(in srgb, var(--txt) 4%, transparent);
  color: var(--txt);
}
.acts { display: flex; gap: .5rem; justify-content: flex-end; margin-top: 1rem; }

.newkey { display: flex; gap: .6rem; margin-bottom: 1rem; flex-wrap: wrap; }
.newkey input { flex: 1; min-width: 200px; }

.pill {
  display: inline-block; padding: .18rem .5rem; border-radius: 999px;
  font-size: .73rem; font-weight: 650; text-transform: capitalize;
  background: color-mix(in srgb, var(--txt) 8%, transparent); color: var(--mut);
}
.pill.active, .pill.valid { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
.pill.grace, .pill.unlicensed { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.pill.expired, .pill.invalid, .pill.disabled { background: color-mix(in srgb, var(--bad) 18%, transparent); color: var(--bad); }

.ic {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: none; color: var(--mut);
}
.ic.danger:hover { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); }

dl { display: grid; gap: .5rem; }
dl > div { display: flex; justify-content: space-between; gap: 1rem; font-size: .86rem; }
dt { color: var(--mut); }
dd { font-family: var(--mono); font-size: .83rem; }

.lic-top { display: flex; align-items: center; gap: .7rem; margin-bottom: 1rem; }
.feats { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .9rem; }
.feats span {
  padding: .2rem .55rem; border-radius: 999px; font-size: .75rem;
  background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--acc);
}

.audit { list-style: none; display: grid; gap: .45rem; max-height: 420px; overflow-y: auto; }
.audit li {
  display: grid; grid-template-columns: 11rem 9rem 1fr 1fr; gap: .7rem;
  font-size: .8rem; padding: .35rem 0; border-bottom: 1px solid var(--line);
}
.audit .ts { color: var(--mut); font-family: var(--mono); font-size: .75rem; }
.audit .act { font-weight: 600; }
.audit .who, .audit .det { color: var(--mut); overflow: hidden; text-overflow: ellipsis; }

.err {
  font-size: .84rem; color: var(--bad); margin-top: .6rem;
  background: color-mix(in srgb, var(--bad) 10%, transparent);
  padding: .5rem .7rem; border-radius: var(--r-sm);
}

.scrim {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  padding: 1rem; background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
}
.modal { width: min(440px, 100%); padding: 1.5rem; box-shadow: var(--sh-3); }
.modal h3 { font-size: 1rem; font-weight: 650; margin-bottom: 1rem; }

.upload { display: flex; align-items: center; gap: .5rem; }
.upload input[type=text], .upload > input { flex: 1; min-width: 0; }
.prev {
  width: 34px; height: 34px; border-radius: var(--r-sm); object-fit: contain;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 4%, transparent);
  flex-shrink: 0;
}
.prev.sm { width: 26px; height: 26px; }
.pick {
  display: inline-flex; align-items: center; gap: .35rem; white-space: nowrap;
  padding: .45rem .7rem; margin: 0; border-radius: var(--r-sm); cursor: pointer;
  border: 1px solid var(--line-2); background: color-mix(in srgb, var(--txt) 4%, transparent);
  font-size: .8rem; font-weight: 600; color: var(--txt-2);
}
.pick:hover { background: color-mix(in srgb, var(--acc) 14%, transparent); color: var(--txt); }

@media (max-width: 900px) { .bgrid { grid-template-columns: 1fr; } }
@media (max-width: 700px) {
  .audit li { grid-template-columns: 1fr; gap: .15rem; }
  .head .primary { margin-left: 0; }
}
</style>
