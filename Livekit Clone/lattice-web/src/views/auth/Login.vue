<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowRight, Loader2 } from '@lucide/vue'
import { useAuth } from '../../stores/auth'
import { useBranding } from '../../stores/branding'

const auth = useAuth()
const branding = useBranding()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const productName = computed(() => branding.brand.product_name || 'Lattice Net')

onMounted(() => {
  // Branding must resolve before sign-in, so a partner's customers never see
  // our name on the login screen.
  branding.loadPublic()
})

async function submit() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    if (auth.mustChangePassword) {
      router.push('/change-password')
    } else {
      const next = (route.query.next as string) || '/app'
      router.push(next)
    }
  } catch (e: any) {
    error.value = e.message || 'Could not sign in.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="panel">
      <div class="head">
        <img class="mark" :src="branding.brand.logo_url || '/logo-mark.svg'"
             :alt="productName" width="52" height="52" />
        <h1>Sign in to {{ productName }}</h1>
        <p v-if="branding.brand.tenant">{{ branding.brand.tenant.name }}</p>
      </div>

      <form @submit.prevent="submit" novalidate>
        <label>
          <span>Email</span>
          <input v-model="email" type="email" autocomplete="username"
                 required autofocus :disabled="busy" />
        </label>

        <label>
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password"
                 required :disabled="busy" />
        </label>

        <p v-if="error" class="err" role="alert">{{ error }}</p>

        <button type="submit" class="submit" :disabled="busy || !email || !password">
          <Loader2 v-if="busy" :size="17" class="spin" />
          <template v-else>Sign in <ArrowRight :size="16" :stroke-width="2.5" /></template>
        </button>
      </form>

      <div class="foot">
        <router-link to="/">Back to site</router-link>
        <a v-if="branding.brand.support_url" :href="branding.brand.support_url">Need help?</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem;
  background: var(--brand-bg, #07080d);
  color: var(--brand-text, #f2f4f8);
}
.panel {
  width: min(410px, 100%);
  padding: 2.2rem;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: var(--brand-radius-lg, 18px);
  background: var(--brand-panel, #0f111a);
  box-shadow: 0 24px 64px rgba(0,0,0,.5);
}
.head { text-align: center; margin-bottom: 1.8rem; }
.mark {
  display: block; width: 52px; height: 52px; margin: 0 auto 1rem;
  border-radius: 14px; object-fit: contain;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--acc) 45%, transparent);
}
.head h1 { font-size: 1.24rem; font-weight: 700; letter-spacing: -.02em; }
.head p { color: var(--brand-muted, #9aa2b4); font-size: .88rem; margin-top: .3rem; }

label { display: block; margin-bottom: 1rem; }
label span {
  display: block; font-size: .82rem; font-weight: 600;
  color: var(--brand-muted, #9aa2b4); margin-bottom: .4rem;
}
input {
  width: 100%; padding: .7rem .85rem; font-size: .93rem;
  border-radius: var(--brand-radius-sm, 9px);
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.04);
  color: inherit; font-family: inherit;
}
input:focus {
  outline: none; border-color: var(--brand-primary, #6d5efc);
  box-shadow: 0 0 0 3px rgba(109,94,252,.22);
}
input:disabled { opacity: .6; }

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
.submit:not(:disabled):hover { filter: brightness(1.08); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.foot {
  display: flex; justify-content: space-between; gap: 1rem;
  margin-top: 1.4rem; font-size: .85rem;
}
.foot a { color: var(--brand-muted, #9aa2b4); text-decoration: none; }
.foot a:hover { color: var(--brand-accent, #22d3ee); }

@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
