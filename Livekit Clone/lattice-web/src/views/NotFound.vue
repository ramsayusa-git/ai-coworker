<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
</script>

<template>
  <div class="nf">
    <div class="panel surface">
      <span class="code">404</span>
      <h1>That page does not exist</h1>
      <p>The link may be out of date, or the item was removed.</p>
      <div class="acts">
        <router-link to="/app" class="primary"><ArrowLeft :size="15" /> Back to console</router-link>
        <router-link to="/" class="ghost">Go to site</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf { min-height: 100vh; display: grid; place-items: center; padding: 2rem 1rem; background: var(--bg); }
.panel { width: min(430px, 100%); padding: 2.4rem; text-align: center; box-shadow: var(--sh-2); }
.code {
  display: block; font-size: 3.4rem; font-weight: 800; letter-spacing: -.04em;
  font-family: var(--mono); line-height: 1;
  background: linear-gradient(120deg, var(--acc), var(--acc-2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  margin-bottom: .8rem;
}
h1 { font-size: 1.12rem; font-weight: 700; letter-spacing: -.02em; margin-bottom: .4rem; }
p { color: var(--mut); font-size: .88rem; margin-bottom: 1.6rem; }
.acts { display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap; }
.primary, .ghost {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .6rem 1.1rem; border-radius: var(--r-sm); font-size: .88rem; font-weight: 600;
}
.primary { background: var(--acc); color: #fff; box-shadow: 0 6px 18px color-mix(in srgb, var(--acc) 40%, transparent); }
.ghost { border: 1px solid var(--line-2); color: var(--mut); }
.ghost:hover { color: var(--txt); }
</style>
