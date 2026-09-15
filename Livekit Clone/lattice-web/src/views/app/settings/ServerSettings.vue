<script setup lang="ts">
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'
import { useAuth } from '../../../stores/auth'

const auth = useAuth()

const fields: Field[] = [
  { key: 'public_url', label: 'Public URL', placeholder: 'https://console.example.com',
    note: 'Used in invitation and password-reset links.' },
  { key: 'region', label: 'Region', placeholder: 'ap-southeast-2',
    note: 'Where this deployment runs. Shown to your tenants, not used for routing.' },
  { key: 'timezone', label: 'Timezone', placeholder: 'Australia/Sydney',
    note: 'Reports and schedules are computed in this zone.' },
  { key: 'default_language', label: 'Default language', placeholder: 'en' },
  { key: 'max_concurrent_calls', label: 'Max concurrent calls', type: 'number', min: 1, max: 10000,
    note: 'Your licence sets the hard ceiling; this can only lower it.' },
  { key: 'call_timeout_s', label: 'Call timeout (seconds)', type: 'number', min: 30, max: 14400 },
  { key: 'maintenance_mode', label: 'Maintenance mode', type: 'switch',
    note: 'Refuses new calls and shows the message below. Calls already running are not cut off.' },
  { key: 'maintenance_message', label: 'Maintenance message', type: 'textarea',
    placeholder: 'Back at 06:00 AEST — scheduled upgrade.' },
]
</script>

<template>
  <SettingsForm
    group="server"
    title="Server"
    lede="How this deployment presents itself and the limits it holds itself to."
    :fields="fields"
    :readonly="!auth.can('admin')"
  />
</template>
