<script setup lang="ts">
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'
import { useAuth } from '../../../stores/auth'

const auth = useAuth()

const fields: Field[] = [
  { key: 'provider', label: 'Provider', type: 'select', options: [
    { value: 'smtp', label: 'SMTP' },
    { value: 'ses', label: 'Amazon SES' },
    { value: 'sendgrid', label: 'SendGrid' },
    { value: 'postmark', label: 'Postmark' },
  ] },
  { key: 'smtp_host', label: 'Host', placeholder: 'smtp.example.com' },
  { key: 'smtp_port', label: 'Port', type: 'number', min: 1, max: 65535 },
  { key: 'smtp_user', label: 'Username' },
  { key: 'smtp_password', label: 'Password', type: 'secret',
    note: 'Stored write-only. Leaving this blank keeps whatever is already saved.' },
  { key: 'use_tls', label: 'Use TLS', type: 'switch' },
  { key: 'from_name', label: 'From name', placeholder: 'Lattice Net' },
  { key: 'from_address', label: 'From address', placeholder: 'no-reply@example.com' },
  { key: 'reply_to', label: 'Reply-to', placeholder: 'support@example.com' },
]
</script>

<template>
  <SettingsForm
    group="email"
    title="Email"
    lede="Outbound mail for invitations, password resets and scheduled reports. Under white-label these go out as your brand, from your domain."
    :fields="fields"
    :readonly="!auth.can('admin')"
  />
</template>
