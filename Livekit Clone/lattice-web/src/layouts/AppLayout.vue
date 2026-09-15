<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AudioWaveform, LayoutDashboard, Bot, PhoneCall, Boxes, Radio, Settings,
  ChevronsLeft, ChevronsRight, LogOut, Menu, X, ChevronDown, ShieldAlert,
} from '@lucide/vue'
import { useAuth, type Role } from '../stores/auth'
import { useBranding } from '../stores/branding'
import { useUI } from '../stores/ui'
import ToastHost from '../components/ui/ToastHost.vue'

const auth = useAuth()
const branding = useBranding()
const ui = useUI()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const tenantMenu = ref(false)

interface NavItem { to: string; label: string; icon: any; min: Role; platform?: boolean }

const items: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, min: 'viewer' },
  { to: '/app/agents', label: 'Agents', icon: Bot, min: 'viewer' },
  { to: '/app/sessions', label: 'Sessions', icon: PhoneCall, min: 'viewer' },
  { to: '/app/telephony', label: 'Telephony', icon: Radio, min: 'viewer' },
  { to: '/app/components', label: 'Components', icon: Boxes, min: 'viewer' },
  { to: '/app/settings', label: 'Settings', icon: Settings, min: 'admin' },
]

const visible = computed(() => items.filter((i) => auth.can(i.min)))
const productName = computed(() => branding.brand.product_name || 'Lattice Net')

const licenceWarning = ref<string>('')

function isActive(to: string) {
  return to === '/app' ? route.path === '/app' : route.path.startsWith(to)
}

async function signOut() {
  await auth.logout()
  router.push('/login')
}

async function pickTenant(id: string) {
  tenantMenu.value = false
  if (id === auth.tenant?.id) return
  try {
    await auth.switchTenant(id)
    await branding.load()
    ui.success('Switched tenant', auth.tenant?.name)
    router.go(0)
  } catch (e: any) {
    ui.error('Could not switch tenant', e.message)
  }
}

onMounted(async () => {
  ui.restoreSidebar()
  await branding.load()
  try {
    const { Admin } = await import('../api')
    const lic = await Admin.licence()
    if (lic.status === 'grace') {
      licenceWarning.value = `Licence expired — ${lic.days_left} days of grace remaining.`
    } else if (lic.status === 'expired' || lic.status === 'invalid') {
      licenceWarning.value = 'Licence expired. The system is read-only until a valid licence is installed.'
    } else if (lic.status === 'unlicensed') {
      licenceWarning.value = 'No licence installed — running with trial limits.'
    }
  } catch {
    /* licence banner is informational; never block the console on it */
  }
})
</script>

<template>
  <div class="shell" :class="{ collapsed: !ui.sidebarOpen }">
    <aside class="side" :class="{ open: menuOpen }">
      <div class="side-head">
        <router-link to="/app" class="brand">
          <span class="brand-mark">
            <img v-if="branding.brand.logo_url" :src="branding.brand.logo_url" :alt="productName" />
            <AudioWaveform v-else :size="18" :stroke-width="2.4" />
          </span>
          <span v-if="ui.sidebarOpen" class="brand-name">{{ productName }}</span>
        </router-link>
        <button class="icon-btn only-mobile" @click="menuOpen = false" aria-label="Close menu">
          <X :size="18" />
        </button>
      </div>

      <nav class="side-nav">
        <router-link v-for="i in visible" :key="i.to" :to="i.to" class="nav-item"
                     :class="{ active: isActive(i.to) }" @click="menuOpen = false"
                     :title="ui.sidebarOpen ? undefined : i.label">
          <component :is="i.icon" :size="18" :stroke-width="2.1" />
          <span v-if="ui.sidebarOpen">{{ i.label }}</span>
        </router-link>
      </nav>

      <div class="side-foot">
        <div class="tenant" v-if="auth.tenant">
          <button class="tenant-btn" @click="tenantMenu = !tenantMenu"
                  :disabled="auth.memberships.length < 2">
            <span class="tenant-dot"></span>
            <span v-if="ui.sidebarOpen" class="tenant-name">{{ auth.tenant.name }}</span>
            <ChevronDown v-if="ui.sidebarOpen && auth.memberships.length > 1" :size="14" />
          </button>
          <div v-if="tenantMenu" class="tenant-menu">
            <button v-for="m in auth.memberships" :key="m.tenant_id"
                    :class="{ current: m.tenant_id === auth.tenant.id }"
                    @click="pickTenant(m.tenant_id)">
              {{ m.name }} <small>{{ m.role }}</small>
            </button>
          </div>
        </div>

        <div class="who" v-if="ui.sidebarOpen && auth.user">
          <span class="who-name">{{ auth.user.name || auth.user.email }}</span>
          <span class="who-role">{{ auth.role }}</span>
        </div>

        <div class="side-actions">
          <button class="icon-btn" @click="ui.toggleSidebar()"
                  :aria-label="ui.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'">
            <component :is="ui.sidebarOpen ? ChevronsLeft : ChevronsRight" :size="17" />
          </button>
          <button class="icon-btn" @click="signOut" aria-label="Sign out" title="Sign out">
            <LogOut :size="17" />
          </button>
        </div>
      </div>
    </aside>

    <div v-if="menuOpen" class="scrim" @click="menuOpen = false"></div>

    <main class="main">
      <header class="topbar">
        <button class="icon-btn only-mobile" @click="menuOpen = true" aria-label="Open menu">
          <Menu :size="20" />
        </button>
        <h1 class="page-title">{{ route.meta.title || '' }}</h1>
        <div class="topbar-right">
          <slot name="actions" />
        </div>
      </header>

      <div v-if="licenceWarning" class="licence-banner">
        <ShieldAlert :size="16" />
        <span>{{ licenceWarning }}</span>
        <router-link v-if="auth.can('owner')" to="/app/settings/licence">Manage</router-link>
      </div>

      <div class="content">
        <router-view />
      </div>
    </main>

    <ToastHost />
  </div>
</template>

<style scoped>
.shell {
  --side-w: 244px;
  display: grid;
  grid-template-columns: var(--side-w) 1fr;
  min-height: 100vh;
  background: var(--brand-bg, #07080d);
  color: var(--brand-text, #f2f4f8);
}
.shell.collapsed { --side-w: 68px; }

.side {
  display: flex; flex-direction: column;
  border-right: 1px solid var(--line, rgba(255,255,255,.09));
  background: var(--brand-panel, #0f111a);
  position: sticky; top: 0; height: 100vh;
}
.side-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 60px; padding: 0 .9rem;
  border-bottom: 1px solid var(--line, rgba(255,255,255,.09));
}
.brand { display: flex; align-items: center; gap: .6rem; text-decoration: none; color: inherit; overflow: hidden; }
.brand-mark {
  display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px;
  background: linear-gradient(135deg, var(--brand-primary, #6d5efc), var(--brand-accent, #22d3ee));
  color: #fff; flex-shrink: 0; overflow: hidden;
}
.brand-mark img { width: 100%; height: 100%; object-fit: contain; }
.brand-name { font-weight: 700; font-size: .96rem; white-space: nowrap; }

.side-nav { flex: 1; padding: .8rem .6rem; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: .7rem;
  padding: .6rem .7rem; border-radius: 9px;
  color: var(--brand-muted, #9aa2b4); text-decoration: none;
  font-size: .9rem; font-weight: 500; white-space: nowrap;
  transition: background .15s, color .15s;
}
.nav-item:hover { background: rgba(255,255,255,.05); color: var(--brand-text, #f2f4f8); }
.nav-item.active { background: rgba(109,94,252,.16); color: #fff; }
.nav-item.active svg { color: var(--brand-accent, #22d3ee); }

.side-foot { padding: .7rem .6rem; border-top: 1px solid var(--line, rgba(255,255,255,.09)); }
.tenant { position: relative; margin-bottom: .5rem; }
.tenant-btn {
  width: 100%; display: flex; align-items: center; gap: .5rem;
  padding: .5rem .6rem; border-radius: 9px; border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: inherit; font-size: .85rem; text-align: left;
}
.tenant-btn:disabled { cursor: default; opacity: .8; }
.tenant-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand-success, #34d399); flex-shrink: 0; }
.tenant-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tenant-menu {
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: 20;
  background: #14161f; border: 1px solid var(--line-2, rgba(255,255,255,.16));
  border-radius: 10px; padding: .3rem; box-shadow: 0 16px 40px rgba(0,0,0,.6);
}
.tenant-menu button {
  width: 100%; text-align: left; padding: .5rem .6rem; border: 0; border-radius: 7px;
  background: none; color: inherit; font-size: .85rem; display: flex;
  justify-content: space-between; gap: .5rem;
}
.tenant-menu button:hover { background: rgba(255,255,255,.07); }
.tenant-menu button.current { color: var(--brand-accent, #22d3ee); }
.tenant-menu small { color: var(--brand-muted, #9aa2b4); text-transform: capitalize; }

.who { padding: .4rem .6rem .6rem; display: flex; flex-direction: column; }
.who-name { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who-role { font-size: .74rem; color: var(--brand-muted, #9aa2b4); text-transform: capitalize; }

.side-actions { display: flex; gap: .3rem; }
.icon-btn {
  display: grid; place-items: center; width: 34px; height: 34px;
  border-radius: 8px; border: 1px solid var(--line, rgba(255,255,255,.09));
  background: rgba(255,255,255,.03); color: var(--brand-muted, #9aa2b4);
}
.icon-btn:hover { background: rgba(255,255,255,.08); color: var(--brand-text, #f2f4f8); }

.main { display: flex; flex-direction: column; min-width: 0; }
.topbar {
  display: flex; align-items: center; gap: 1rem;
  height: 60px; padding: 0 1.5rem;
  border-bottom: 1px solid var(--line, rgba(255,255,255,.09));
  position: sticky; top: 0; z-index: 10;
  background: rgba(7,8,13,.82); backdrop-filter: blur(12px);
}
.page-title { font-size: 1.05rem; font-weight: 650; letter-spacing: -.01em; }
.topbar-right { margin-left: auto; display: flex; gap: .5rem; align-items: center; }

.licence-banner {
  display: flex; align-items: center; gap: .6rem;
  padding: .7rem 1.5rem; font-size: .87rem;
  background: rgba(251,191,36,.12); border-bottom: 1px solid rgba(251,191,36,.3);
  color: #fbbf24;
}
.licence-banner a { margin-left: auto; color: inherit; text-decoration: underline; }

.content { padding: 1.6rem 1.5rem 3rem; flex: 1; min-width: 0; }

.only-mobile { display: none; }
.scrim { display: none; }

@media (max-width: 860px) {
  .shell, .shell.collapsed { grid-template-columns: 1fr; }
  .side {
    position: fixed; inset: 0 auto 0 0; width: 260px; z-index: 40;
    transform: translateX(-100%); transition: transform .22s ease;
  }
  .side.open { transform: none; }
  .scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 30; }
  .only-mobile { display: grid; }
  .content { padding: 1.2rem 1rem 2.5rem; }
  .topbar { padding: 0 1rem; }
}
@media (prefers-reduced-motion: reduce) { .side { transition: none; } }
</style>
