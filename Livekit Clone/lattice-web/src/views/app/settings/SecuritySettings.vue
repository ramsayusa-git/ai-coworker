<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'
import { System } from '../../../api/index'
import { useAuth } from '../../../stores/auth'

const auth = useAuth()

const fields: Field[] = [
  { key: 'password_min_length', label: 'Minimum password length', type: 'number', min: 8, max: 128 },
  { key: 'password_require_symbol', label: 'Require a symbol', type: 'switch' },
  { key: 'session_idle_minutes', label: 'Idle session timeout (minutes)', type: 'number', min: 5, max: 1440 },
  { key: 'refresh_days', label: 'Refresh token lifetime (days)', type: 'number', min: 1, max: 365,
    note: 'Refresh tokens rotate on every use; reusing a rotated one revokes the whole family.' },
  { key: 'mfa_required', label: 'Require MFA', type: 'switch' },
  { key: 'failed_login_lockout', label: 'Lock out after N failures', type: 'number', min: 0, max: 50,
    note: '0 disables lockout.' },
  { key: 'audit_retention_days', label: 'Audit retention (days)', type: 'number', min: 30, max: 3650 },
  { key: 'ip_allowlist', label: 'Dashboard IP allowlist', type: 'list',
    placeholder: '203.0.113.4, 198.51.100.0/24',
    note: 'Leave empty to allow every address. An allowlist that omits your own address locks you out.' },
]

// The audit log is the evidence half of this page: policy above, what actually
// happened below.
const events = ref<any[]>([])
const loadingEvents = ref(true)

async function loadEvents() {
  loadingEvents.value = true
  try {
    events.value = await System.audit(60)
  } catch {
    events.value = []
  } finally {
    loadingEvents.value = false
  }
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadEvents)
</script>

<template>
  <div class="wrap">
    <SettingsForm
      group="security"
      title="Security"
      lede="Policy for this tenant. The server enforces every one of these — the console only shows them."
      :fields="fields"
      :readonly="!auth.can('owner')"
    />

    <section class="s-card log">
      <header>
        <h3>Recent activity</h3>
        <button class="s-btn" @click="loadEvents">Refresh</button>
      </header>
      <p v-if="loadingEvents" class="none">Loading…</p>
      <p v-else-if="!events.length" class="none">Nothing recorded yet.</p>
      <table v-else>
        <thead><tr><th>Time</th><th>Action</th><th>Who</th><th>IP</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in events" :key="i">
            <td class="s-mono">{{ when(e.ts) }}</td>
            <td>{{ e.action }}<small v-if="e.detail"> — {{ e.detail }}</small></td>
            <td>{{ e.who }}</td>
            <td class="s-mono">{{ e.ip || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; gap: 1.6rem; }
.log { display: flex; flex-direction: column; gap: .8rem; }
.log header { display: flex; align-items: center; gap: 1rem; }
.log h3 { font-size: .95rem; font-weight: 700; }
.log header button { margin-left: auto; }
.log table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.log th, .log td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
.log th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--mut); }
.log small { color: var(--mut); }
.none { font-size: .85rem; color: var(--mut); }
</style>
