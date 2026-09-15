<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { KeyRound, Loader2 } from '@lucide/vue'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'

const auth = useAuth()
const ui = useUI()
const router = useRouter()

const current = ref('')
const next = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')

const tooShort = computed(() => next.value.length > 0 && next.value.length < 12)
const mismatch = computed(() => confirm.value.length > 0 && next.value !== confirm.value)
const ok = computed(() =>
  current.value.length > 0 && next.value.length >= 12 && next.value === confirm.value)

async function submit() {
  if (!ok.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await auth.changePassword(current.value, next.value)
    ui.success('Password changed', 'Sign in again with your new password.')
    router.push('/login')
  } catch (e: any) {
    error.value = e.message || 'Could not change the password.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="panel">
      <div class="head">
        <span class="mark"><KeyRound :size="22" :stroke-width="2.2" /></span>
        <h1>Choose a new password</h1>
        <p>This account was issued a temporary password. Pick your own to continue.</p>
      </div>

      <form @submit.prevent="submit" novalidate>
        <label>
          <span>Current password</span>
          <input v-model="current" type="password" autocomplete="current-password"
                 required autofocus :disabled="busy" />
        </label>

        <label>
          <span>New password</span>
          <input v-model="next" type="password" autocomplete="new-password"
                 required :disabled="busy" />
          <small :class="{ bad: tooShort }">At least 12 characters.</small>
        </label>

        <label>
          <span>Confirm new password</span>
          <input v-model="confirm" type="password" autocomplete="new-password"
                 required :disabled="busy" />
          <small v-if="mismatch" class="bad">These do not match.</small>
        </label>

        <p v-if="error" class="err" role="alert">{{ error }}</p>

        <button type="submit" class="submit" :disabled="!ok || busy">
          <Loader2 v-if="busy" :size="17" class="spin" />
          <template v-else>Change password</template>
        </button>
      </form>

      <p class="note">Changing your password signs out every other session.</p>
    </div>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem;
  background: var(--brand-bg, #07080d); color: var(--brand-text, #f2f4f8);
}
.panel {
  width: min(430px, 100%); padding: 2.2rem;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: var(--brand-radius-lg, 18px);
  background: var(--brand-panel, #0f111a);
  box-shadow: 0 24px 64px rgba(0,0,0,.5);
}
.head { text-align: center; margin-bottom: 1.6rem; }
.mark {
  display: grid; place-items: center; width: 50px; height: 50px; margin: 0 auto 1rem;
  border-radius: 14px; color: #fff;
  background: linear-gradient(135deg, var(--brand-primary, #6d5efc), var(--brand-accent, #22d3ee));
}
.head h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.02em; }
.head p { color: var(--brand-muted, #9aa2b4); font-size: .88rem; margin-top: .4rem; line-height: 1.5; }

label { display: block; margin-bottom: 1rem; }
label span {
  display: block; font-size: .82rem; font-weight: 600;
  color: var(--brand-muted, #9aa2b4); margin-bottom: .4rem;
}
label small { display: block; font-size: .78rem; color: var(--brand-muted, #9aa2b4); margin-top: .35rem; }
label small.bad { color: var(--brand-warning, #fbbf24); }
input {
  width: 100%; padding: .7rem .85rem; font-size: .93rem;
  border-radius: var(--brand-radius-sm, 9px);
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.04); color: inherit; font-family: inherit;
}
input:focus {
  outline: none; border-color: var(--brand-primary, #6d5efc);
  box-shadow: 0 0 0 3px rgba(109,94,252,.22);
}
.err {
  font-size: .86rem; color: var(--brand-danger, #f87171);
  background: rgba(248,113,113,.1); border: 1px solid rgba(248,113,113,.3);
  padding: .6rem .75rem; border-radius: 9px; margin-bottom: 1rem;
}
.submit {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  padding: .78rem 1rem; border: 0; border-radius: var(--brand-radius-sm, 9px);
  background: var(--brand-primary, #6d5efc); color: #fff;
  font-size: .95rem; font-weight: 650; font-family: inherit;
}
.submit:disabled { opacity: .55; cursor: not-allowed; }
.note { margin-top: 1.1rem; font-size: .8rem; color: var(--brand-muted, #9aa2b4); text-align: center; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
