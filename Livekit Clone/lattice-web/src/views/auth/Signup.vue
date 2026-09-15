<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Mail, ArrowLeft } from '@lucide/vue'
import { useBranding } from '../../stores/branding'

const branding = useBranding()
const sent = ref(false)
const email = ref('')
const company = ref('')

const productName = computed(() => branding.brand.product_name || 'Lattice Net')
const supportUrl = computed(() => branding.brand.support_url || '')

onMounted(() => branding.loadPublic())

/**
 * Self-service signup is deliberately not wired to account creation.
 * Tenants are provisioned by an operator (or a reseller partner) so that
 * licence limits and brand profiles are set correctly — an open signup route
 * would let anyone create tenants against someone else's licence.
 */
function submit() {
  sent.value = true
}
</script>

<template>
  <div class="auth">
    <div class="panel surface">
      <div class="head">
        <img class="mark" :src="branding.brand.logo_url || '/logo-mark.svg'"
             alt="" width="50" height="50" />
        <h1>Request access to {{ productName }}</h1>
        <p>Accounts are provisioned by your administrator so licence limits and
           branding are applied correctly.</p>
      </div>

      <form v-if="!sent" @submit.prevent="submit" novalidate>
        <label><span>Work email</span>
          <input v-model="email" type="email" required autofocus autocomplete="email" /></label>
        <label><span>Company</span>
          <input v-model="company" autocomplete="organization" /></label>
        <button type="submit" class="submit" :disabled="!email">
          <Mail :size="16" /> Request access
        </button>
      </form>

      <div v-else class="done">
        <strong>Request noted</strong>
        <p>
          Send this to your administrator to have a tenant created:
          <code>{{ email }}</code>
        </p>
        <p v-if="supportUrl" class="sm">
          Or contact <a :href="supportUrl">support</a>.
        </p>
      </div>

      <div class="foot">
        <router-link to="/login"><ArrowLeft :size="14" /> Back to sign in</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth { min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem; background: var(--bg); }
.panel { width: min(420px, 100%); padding: 2.1rem; box-shadow: var(--sh-3); }
.head { text-align: center; margin-bottom: 1.6rem; }
.mark {
  display: block; width: 50px; height: 50px; margin: 0 auto 1rem;
  border-radius: 14px; object-fit: contain;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--acc) 45%, transparent);
}
.head h1 { font-size: 1.16rem; font-weight: 700; letter-spacing: -.02em; }
.head p { color: var(--mut); font-size: .86rem; margin-top: .45rem; line-height: 1.5; }

label { display: block; margin-bottom: .9rem; }
label span { display: block; font-size: .8rem; font-weight: 600; color: var(--mut); margin-bottom: .35rem; }
input {
  width: 100%; padding: .68rem .8rem; font-size: .92rem;
  border-radius: var(--r-sm); border: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--txt);
}
input:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 22%, transparent); }

.submit {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  padding: .75rem 1rem; border: 0; border-radius: var(--r-sm);
  background: var(--acc); color: #fff; font-size: .93rem; font-weight: 650;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--acc) 40%, transparent);
}
.submit:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

.done { text-align: center; padding: .5rem 0; }
.done strong { display: block; font-size: 1rem; margin-bottom: .5rem; color: var(--ok); }
.done p { font-size: .87rem; color: var(--mut); line-height: 1.55; }
.done code {
  display: inline-block; margin-top: .4rem; padding: .3rem .6rem; border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--txt) 6%, transparent); font-family: var(--mono); font-size: .83rem;
}
.done .sm { margin-top: .7rem; font-size: .83rem; }

.foot { margin-top: 1.4rem; text-align: center; font-size: .85rem; }
.foot a { display: inline-flex; align-items: center; gap: .3rem; color: var(--mut); }
.foot a:hover { color: var(--acc-2); }
</style>
