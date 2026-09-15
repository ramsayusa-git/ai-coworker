<script setup lang="ts">
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'
import { useAuth } from '../../../stores/auth'

const auth = useAuth()

const fields: Field[] = [
  { key: 'currency', label: 'Currency', type: 'select', options: [
    { value: 'AUD', label: 'AUD' }, { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' },
    { value: 'INR', label: 'INR' }, { value: 'SGD', label: 'SGD' },
  ] },
  { key: 'rate_per_minute', label: 'Rate per voice minute', type: 'number',
    note: 'What you charge this tenant. Resellers set their own margin here; it does not affect what you pay upstream.' },
  { key: 'rate_per_1k_tokens', label: 'Rate per 1,000 chat tokens', type: 'number' },
  { key: 'monthly_budget', label: 'Monthly budget', type: 'number',
    note: '0 means no budget tracking.' },
  { key: 'budget_alert_pct', label: 'Alert at % of budget', type: 'number', min: 1, max: 100 },
  { key: 'billing_email', label: 'Billing email', placeholder: 'accounts@example.com' },
  { key: 'invoice_prefix', label: 'Invoice prefix', placeholder: 'INV' },
]
</script>

<template>
  <SettingsForm
    group="finance"
    title="Finance"
    lede="Rates and budgets for this tenant. Session costs shown across the console are computed from these numbers."
    :fields="fields"
    :readonly="!auth.can('owner')"
  />
</template>
