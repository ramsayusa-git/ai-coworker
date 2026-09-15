<script setup lang="ts">
import SettingsForm, { type Field } from '../../../components/ui/SettingsForm.vue'
import { useAuth } from '../../../stores/auth'

const auth = useAuth()

const fields: Field[] = [
  { key: 'backend', label: 'Backend', type: 'select', options: [
    { value: 'local', label: 'Local disk' },
    { value: 's3', label: 'Amazon S3 (or compatible)' },
    { value: 'gcs', label: 'Google Cloud Storage' },
    { value: 'azure', label: 'Azure Blob Storage' },
  ] },
  { key: 'local_path', label: 'Local path', placeholder: '/var/lib/lattice/recordings',
    note: 'Only used when the backend is local disk.' },
  { key: 'bucket', label: 'Bucket / container' },
  { key: 'region', label: 'Region', placeholder: 'ap-southeast-2' },
  { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.ap-southeast-2.amazonaws.com',
    note: 'Set this for MinIO, Wasabi, R2 and anything else S3-compatible.' },
  { key: 'access_key_id', label: 'Access key ID' },
  { key: 'secret_access_key', label: 'Secret access key', type: 'secret',
    note: 'Stored write-only. Blank keeps the saved value.' },
  { key: 'recordings_enabled', label: 'Record calls', type: 'switch',
    note: 'Turning this off stops new captures; existing ones are untouched.' },
  { key: 'retention_days', label: 'Retention (days)', type: 'number', min: 1, max: 3650,
    note: 'Recordings older than this are deleted. Check what your jurisdiction requires before lowering it.' },
]
</script>

<template>
  <SettingsForm
    group="storage"
    title="Storage"
    lede="Where recordings and exports are written. Self-hosted deployments keep this on infrastructure you own — nothing is copied to us."
    :fields="fields"
    :readonly="!auth.can('admin')"
  />
</template>
