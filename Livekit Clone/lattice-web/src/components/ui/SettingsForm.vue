<script setup lang="ts">
/**
 * One settings group, rendered from a field spec.
 *
 * The server owns the shape: it returns defaults merged with whatever is
 * stored, rejects unknown keys and type-checks each value. This component only
 * decides how each field is drawn, and sends back the keys that actually
 * changed — which is also what makes write-only secrets work, because an
 * untouched secret field is simply never in the payload.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Settings as SettingsApi, type SettingGroup } from '../../api/sections'
import { useUI } from '../../stores/ui'
import PageShell from './PageShell.vue'

export interface Field {
  key: string
  label: string
  type?: 'text' | 'number' | 'switch' | 'select' | 'secret' | 'list' | 'textarea'
  options?: Array<{ value: string; label: string }>
  note?: string
  placeholder?: string
  min?: number
  max?: number
}

const props = defineProps<{
  group: SettingGroup
  title: string
  lede?: string
  fields: Field[]
  readonly?: boolean
}>()

const ui = useUI()
const value = ref<Record<string, any>>({})
const original = ref<Record<string, any>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const dirty = computed(() =>
  props.fields.some((f) => {
    const a = value.value[f.key]
    const b = original.value[f.key]
    if (f.type === 'secret') return typeof a === 'string' && a.length > 0
    if (f.type === 'list') return (a ?? []).join(',') !== (b ?? []).join(',')
    return a !== b
  }))

function isSecretSet(f: Field) {
  return f.type === 'secret' && original.value[`${f.key}_set`] === true
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await SettingsApi.get(props.group)
    original.value = { ...res.value }
    const v: Record<string, any> = { ...res.value }
    // A secret never arrives; the field starts empty and only travels when
    // the operator types a new one.
    for (const f of props.fields) if (f.type === 'secret') v[f.key] = ''
    value.value = v
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const patch: Record<string, any> = {}
    for (const f of props.fields) {
      const a = value.value[f.key]
      if (f.type === 'secret') {
        if (typeof a === 'string' && a.length > 0) patch[f.key] = a
        continue
      }
      if (f.type === 'list') {
        const now = Array.isArray(a) ? a : String(a ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (now.join(',') !== (original.value[f.key] ?? []).join(',')) patch[f.key] = now
        continue
      }
      if (a !== original.value[f.key]) patch[f.key] = a
    }
    if (Object.keys(patch).length === 0) { saving.value = false; return }
    const res = await SettingsApi.put(props.group, patch)
    original.value = { ...res.value }
    for (const f of props.fields) if (f.type === 'secret') value.value[f.key] = ''
    ui.success(`${props.title} saved`)
  } catch (e: any) {
    ui.error(e.message)
  } finally {
    saving.value = false
  }
}

function listText(f: Field) {
  const v = value.value[f.key]
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}
function setList(f: Field, text: string) {
  value.value[f.key] = text.split(',').map((s) => s.trim()).filter(Boolean)
}

watch(() => props.group, load)
onMounted(load)
</script>

<template>
  <PageShell :title="title" :lede="lede" :loading="loading" :error="error" @retry="load">
    <template #actions>
      <button v-if="!readonly" class="s-btn primary" :disabled="!dirty || saving" @click="save">
        {{ saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved' }}
      </button>
    </template>

    <div class="s-form">
      <label v-for="f in fields" :key="f.key" class="s-field"
             :class="{ wide: f.type === 'textarea' || f.type === 'list' }">
        <span>{{ f.label }}</span>

        <div v-if="f.type === 'switch'" class="s-switch">
          <input v-model="value[f.key]" type="checkbox" :disabled="readonly" />
          <em>{{ value[f.key] ? 'On' : 'Off' }}</em>
        </div>

        <select v-else-if="f.type === 'select'" v-model="value[f.key]" class="s-select" :disabled="readonly">
          <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <input v-else-if="f.type === 'number'" v-model.number="value[f.key]" class="s-input"
               type="number" :min="f.min" :max="f.max" :disabled="readonly" />

        <input v-else-if="f.type === 'secret'" v-model="value[f.key]" class="s-input"
               type="password" autocomplete="new-password" :disabled="readonly"
               :placeholder="isSecretSet(f) ? '•••••••• (set — type to replace)' : 'Not set'" />

        <textarea v-else-if="f.type === 'textarea'" v-model="value[f.key]" class="s-textarea"
                  :placeholder="f.placeholder" :disabled="readonly"></textarea>

        <input v-else-if="f.type === 'list'" class="s-input"
               :value="listText(f)" :placeholder="f.placeholder || 'Comma separated'"
               :disabled="readonly" @input="setList(f, ($event.target as HTMLInputElement).value)" />

        <input v-else v-model="value[f.key]" class="s-input"
               :placeholder="f.placeholder" :disabled="readonly" />

        <small v-if="f.note" class="note">{{ f.note }}</small>
      </label>
    </div>
  </PageShell>
</template>

<style scoped>
.s-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.s-field.wide { grid-column: 1 / -1; }
.s-switch em { font-style: normal; color: var(--mut); font-size: .84rem; }
@media (max-width: 640px) { .s-form { grid-template-columns: 1fr; } }
</style>
