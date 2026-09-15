<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, markRaw, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard, Bot, PhoneCall, Boxes, Radio, Settings, LogOut, Menu, X,
  ChevronDown, ShieldAlert, Sun, Moon, MonitorSmartphone, Users, KeyRound,
  Palette, FileBadge, Activity, ListTree, Search, CornerDownLeft, Workflow,
} from '@lucide/vue'
import { useAuth, type Role } from '../stores/auth'
import { useBranding } from '../stores/branding'
import { useTheme } from '../stores/theme'
import { useUI } from '../stores/ui'
import ToastHost from '../components/ui/ToastHost.vue'

const auth = useAuth()
const branding = useBranding()
const theme = useTheme()
const ui = useUI()
const route = useRoute()
const router = useRouter()

const drawer = ref(false)          // mobile
const openMenu = ref<string | null>(null)
const userMenu = ref(false)

/* ------------------------------------------------------------------ nav --- */

interface NavChild { to: string; label: string; icon: any; min: Role; hint?: string }
interface NavItem {
  key: string
  to?: string
  label: string
  icon: any
  min: Role
  children?: NavChild[]
}

const NAV: NavItem[] = [
  { key: 'dash', to: '/app', label: 'Dashboard', icon: markRaw(LayoutDashboard), min: 'viewer' },
  {
    key: 'agents', label: 'Agents', icon: markRaw(Bot), min: 'viewer',
    children: [
      { to: '/app/agents', label: 'All agents', icon: markRaw(ListTree), min: 'viewer', hint: 'Create, publish and pause' },
      { to: '/app/sessions', label: 'Sessions', icon: markRaw(PhoneCall), min: 'viewer', hint: 'Call history and transcripts' },
    ],
  },
  { key: 'tel', to: '/app/telephony', label: 'Telephony', icon: markRaw(Radio), min: 'viewer' },
  { key: 'comp', to: '/app/components', label: 'Components', icon: markRaw(Boxes), min: 'viewer' },
  {
    key: 'settings', label: 'Settings', icon: markRaw(Settings), min: 'admin',
    children: [
      { to: '/app/settings/users', label: 'Users & roles', icon: markRaw(Users), min: 'admin', hint: 'Invite people, set roles' },
      { to: '/app/settings/keys', label: 'API keys', icon: markRaw(KeyRound), min: 'owner', hint: 'Machine access' },
      { to: '/app/settings/branding', label: 'Branding', icon: markRaw(Palette), min: 'admin', hint: 'Logo, colours, white-label' },
      { to: '/app/settings/licence', label: 'Licence', icon: markRaw(FileBadge), min: 'admin', hint: 'Entitlements and expiry' },
      { to: '/app/settings/system', label: 'System', icon: markRaw(Activity), min: 'admin', hint: 'Version and audit log' },
    ],
  },
]

const nav = computed(() =>
  NAV.filter((i) => auth.can(i.min)).map((i) => ({
    ...i,
    children: i.children?.filter((c) => auth.can(c.min)),
  })))

/* --------------------------------------------------------------- search --- */
/* The palette is built FROM the menu, so a new nav entry is searchable with
   no extra registration — one source of truth. */

interface Entry { to: string; label: string; group: string; icon: any; hint?: string }

const entries = computed<Entry[]>(() => {
  const out: Entry[] = []
  for (const i of nav.value) {
    if (i.to) out.push({ to: i.to, label: i.label, group: 'Go to', icon: i.icon })
    for (const c of i.children ?? []) {
      out.push({ to: c.to, label: c.label, group: i.label, icon: c.icon, hint: c.hint })
    }
  }
  out.push({ to: '/app/agents', label: 'Create an agent', group: 'Actions', icon: markRaw(Bot) })
  out.push({ to: '/app/settings/branding', label: 'Change the logo', group: 'Actions', icon: markRaw(Palette) })
  return out
})

const paletteOpen = ref(false)
const q = ref('')
const cursor = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)

const results = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return entries.value
  return entries.value.filter((e) =>
    e.label.toLowerCase().includes(term) ||
    e.group.toLowerCase().includes(term) ||
    (e.hint ?? '').toLowerCase().includes(term))
})

watch(results, () => { cursor.value = 0 })

async function openPalette() {
  paletteOpen.value = true
  q.value = ''
  cursor.value = 0
  await nextTick()
  searchInput.value?.focus()
}

function closePalette() {
  paletteOpen.value = false
  q.value = ''
}

function choose(e?: Entry) {
  const pick = e ?? results.value[cursor.value]
  if (!pick) return
  closePalette()
  router.push(pick.to)
}

function moveCursor(d: number) {
  const n = results.value.length
  if (!n) return
  cursor.value = (cursor.value + d + n) % n
}

function onKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value ? closePalette() : openPalette()
    return
  }
  if (e.key === 'Escape') {
    if (paletteOpen.value) closePalette()
    openMenu.value = null
    userMenu.value = false
  }
}

/* ---------------------------------------------------------------- misc --- */

const productName = computed(() => branding.brand.product_name || 'Lattice Net')
const licenceWarning = ref('')
const THEME_ICON = { light: Sun, dark: Moon, system: MonitorSmartphone }
const themeLabel = computed(() =>
  theme.choice === 'system' ? 'System theme' : theme.choice === 'dark' ? 'Dark' : 'Light')

function isActive(to?: string) {
  if (!to) return false
  return to === '/app' ? route.path === '/app' : route.path.startsWith(to)
}
function groupActive(i: NavItem) {
  return i.children?.some((c) => isActive(c.to)) ?? false
}
function toggleMenu(key: string) {
  openMenu.value = openMenu.value === key ? null : key
  userMenu.value = false
}
function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.menu-item, .user')) {
    openMenu.value = null
    userMenu.value = false
  }
}

async function signOut() {
  await auth.logout()
  router.push('/login')
}

async function pickTenant(id: string) {
  userMenu.value = false
  if (id === auth.tenant?.id) return
  try {
    await auth.switchTenant(id)
    await branding.load()
    router.go(0)
  } catch (e: any) {
    ui.error('Could not switch tenant', e.message)
  }
}

watch(() => route.fullPath, () => { openMenu.value = null; drawer.value = false })

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
  await branding.load()
  try {
    const { Admin } = await import('../api')
    const lic = await Admin.licence()
    if (lic.status === 'grace') licenceWarning.value = `Licence expired — ${lic.days_left} days of grace left.`
    else if (lic.status === 'expired' || lic.status === 'invalid')
      licenceWarning.value = 'Licence expired. The system is read-only until a valid licence is installed.'
    else if (lic.status === 'unlicensed') licenceWarning.value = 'No licence installed — trial limits apply.'
  } catch { /* informational only */ }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="shell">
    <div class="ambient" aria-hidden="true"><i></i><i></i></div>

    <!-- ===================== top menu bar ===================== -->
    <header class="topbar glass">
      <div class="bar-inner">
        <button class="ic only-mobile" @click="drawer = true" aria-label="Open menu">
          <Menu :size="19" />
        </button>

        <router-link to="/app" class="brand" aria-label="Home">
          <img class="mark" :src="branding.brand.logo_url || '/logo-mark.svg'"
               alt="" width="30" height="30" />
          <span class="bname">{{ productName }}</span>
        </router-link>

        <!-- horizontal menu -->
        <nav class="menu">
          <template v-for="i in nav" :key="i.key">
            <router-link v-if="!i.children" :to="i.to!" class="menu-item"
                         :class="{ active: isActive(i.to) }">
              <component :is="i.icon" :size="16" :stroke-width="2.1" />
              <span>{{ i.label }}</span>
            </router-link>

            <div v-else class="menu-item wrap" :class="{ active: groupActive(i) }">
              <button @click.stop="toggleMenu(i.key)" :aria-expanded="openMenu === i.key">
                <component :is="i.icon" :size="16" :stroke-width="2.1" />
                <span>{{ i.label }}</span>
                <ChevronDown :size="13" class="chev" :class="{ flip: openMenu === i.key }" />
              </button>

              <transition name="drop">
                <div v-if="openMenu === i.key" class="dropdown surface">
                  <router-link v-for="c in i.children" :key="c.to" :to="c.to"
                               :class="{ on: isActive(c.to) }">
                    <span class="di"><component :is="c.icon" :size="15" /></span>
                    <span class="dt">
                      <strong>{{ c.label }}</strong>
                      <small v-if="c.hint">{{ c.hint }}</small>
                    </span>
                  </router-link>
                </div>
              </transition>
            </div>
          </template>
        </nav>

        <!-- search -->
        <button class="search" @click="openPalette">
          <Search :size="15" />
          <span class="sl">Search menu…</span>
          <kbd>⌘K</kbd>
        </button>

        <button class="ic" @click="theme.cycle()" :title="themeLabel" :aria-label="themeLabel">
          <component :is="THEME_ICON[theme.choice]" :size="17" />
        </button>

        <!-- user -->
        <div class="user">
          <button class="ubtn" @click.stop="userMenu = !userMenu" :aria-expanded="userMenu">
            <span class="avatar">{{ (auth.user?.name || auth.user?.email || '?').charAt(0).toUpperCase() }}</span>
            <ChevronDown :size="13" />
          </button>
          <transition name="drop">
            <div v-if="userMenu" class="dropdown surface right">
              <div class="who">
                <strong>{{ auth.user?.name || auth.user?.email }}</strong>
                <small>{{ auth.role }} · {{ auth.tenant?.name }}</small>
              </div>
              <template v-if="auth.memberships.length > 1">
                <div class="dhead">Switch tenant</div>
                <button v-for="m in auth.memberships" :key="m.tenant_id"
                        class="plain" :class="{ on: m.tenant_id === auth.tenant?.id }"
                        @click="pickTenant(m.tenant_id)">
                  <span class="dt"><strong>{{ m.name }}</strong><small>{{ m.role }}</small></span>
                </button>
              </template>
              <button class="plain danger" @click="signOut">
                <span class="di"><LogOut :size="15" /></span>
                <span class="dt"><strong>Sign out</strong></span>
              </button>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <!-- ===================== mobile drawer ===================== -->
    <transition name="fade">
      <div v-if="drawer" class="scrim" @click="drawer = false"></div>
    </transition>
    <aside class="drawer glass" :class="{ open: drawer }">
      <div class="dhead-row">
        <strong>{{ productName }}</strong>
        <button class="ic" @click="drawer = false" aria-label="Close"><X :size="18" /></button>
      </div>
      <nav>
        <template v-for="i in nav" :key="i.key">
          <router-link v-if="!i.children" :to="i.to!" class="ditem" :class="{ on: isActive(i.to) }">
            <component :is="i.icon" :size="17" /> {{ i.label }}
          </router-link>
          <template v-else>
            <div class="dgroup">{{ i.label }}</div>
            <router-link v-for="c in i.children" :key="c.to" :to="c.to"
                         class="ditem sub" :class="{ on: isActive(c.to) }">
              <component :is="c.icon" :size="16" /> {{ c.label }}
            </router-link>
          </template>
        </template>
      </nav>
    </aside>

    <!-- ===================== command palette ===================== -->
    <transition name="fade">
      <div v-if="paletteOpen" class="pscrim" @click.self="closePalette">
        <div class="palette surface" role="dialog" aria-modal="true" aria-label="Search menu">
          <div class="pinput">
            <Search :size="17" />
            <input ref="searchInput" v-model="q" placeholder="Search menu and actions…"
                   @keydown.down.prevent="moveCursor(1)"
                   @keydown.up.prevent="moveCursor(-1)"
                   @keydown.enter.prevent="choose()"
                   @keydown.esc="closePalette" />
            <kbd>esc</kbd>
          </div>

          <div v-if="!results.length" class="pempty">
            <strong>Nothing matches “{{ q }}”</strong>
            <p>Try an agent, session, licence or branding.</p>
          </div>

          <ul v-else class="presults">
            <li v-for="(e, i) in results" :key="e.to + e.label"
                :class="{ cur: i === cursor }"
                @mouseenter="cursor = i" @click="choose(e)">
              <span class="di"><component :is="e.icon" :size="15" /></span>
              <span class="dt">
                <strong>{{ e.label }}</strong>
                <small v-if="e.hint">{{ e.hint }}</small>
              </span>
              <span class="grp">{{ e.group }}</span>
              <CornerDownLeft v-if="i === cursor" :size="13" class="ret" />
            </li>
          </ul>
        </div>
      </div>
    </transition>

    <!-- ===================== page ===================== -->
    <main class="main">
      <div class="page-head">
        <h1>{{ route.meta.title || '' }}</h1>
      </div>

      <transition name="fade">
        <div v-if="licenceWarning" class="lic">
          <ShieldAlert :size="15" />
          <span>{{ licenceWarning }}</span>
          <router-link v-if="auth.can('admin')" to="/app/settings/licence">Manage</router-link>
        </div>
      </transition>

      <div class="content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <ToastHost />
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; background: var(--bg); color: var(--txt); }

.ambient { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.ambient i { position: absolute; border-radius: 50%; filter: blur(110px); opacity: .22; }
.ambient i:first-child {
  width: 520px; height: 520px; top: -200px; left: -100px;
  background: radial-gradient(circle, var(--acc), transparent 70%);
}
.ambient i:last-child {
  width: 460px; height: 460px; bottom: -180px; right: -120px;
  background: radial-gradient(circle, var(--acc-2), transparent 70%);
}

/* ---------------- top bar ---------------- */
.topbar {
  position: sticky; top: 0; z-index: 40;
  border-width: 0 0 1px 0; border-radius: 0;
}
.bar-inner {
  display: flex; align-items: center; gap: .6rem;
  height: 58px; padding: 0 1.1rem; max-width: 1600px; margin-inline: auto;
}
.brand { display: flex; align-items: center; gap: .55rem; color: inherit; flex-shrink: 0; }
.mark {
  width: 30px; height: 30px; border-radius: 9px; object-fit: contain;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--acc) 45%, transparent);
}
.bname { font-weight: 700; font-size: .95rem; letter-spacing: -.015em; white-space: nowrap; }

.menu { display: flex; align-items: center; gap: .15rem; margin-left: .9rem; flex: 1; }
.menu-item { position: relative; }
.menu-item > a, .menu-item > button, a.menu-item {
  display: inline-flex; align-items: center; gap: .42rem;
  padding: .5rem .72rem; border-radius: var(--r-sm);
  font-size: .87rem; font-weight: 550; color: var(--mut);
  border: 0; background: none; white-space: nowrap;
  transition: background var(--fast) var(--ease), color var(--fast) var(--ease);
}
.menu-item:hover > a, .menu-item:hover > button, a.menu-item:hover {
  background: color-mix(in srgb, var(--txt) 6%, transparent); color: var(--txt);
}
.menu-item.active > a, .menu-item.active > button, a.menu-item.active {
  color: var(--txt); background: color-mix(in srgb, var(--acc) 14%, transparent);
}
.menu-item.active svg:first-child, a.menu-item.active svg:first-child { color: var(--acc-2); }
.chev { opacity: .65; transition: transform var(--fast) var(--ease); }
.chev.flip { transform: rotate(180deg); }

.dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 60;
  min-width: 248px; padding: .35rem; box-shadow: var(--sh-3);
}
.dropdown.right { left: auto; right: 0; }
.dropdown a, .dropdown .plain {
  display: flex; align-items: flex-start; gap: .6rem; width: 100%;
  padding: .55rem .6rem; border-radius: var(--r-sm); border: 0; background: none;
  color: var(--txt-2); text-align: left;
  transition: background var(--fast) var(--ease);
}
.dropdown a:hover, .dropdown .plain:hover {
  background: color-mix(in srgb, var(--acc) 13%, transparent); color: var(--txt);
}
.dropdown a.on, .dropdown .plain.on { color: var(--acc-2); }
.dropdown .danger:hover { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }
.di {
  display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px;
  background: color-mix(in srgb, var(--txt) 7%, transparent); flex-shrink: 0;
}
.dt { display: flex; flex-direction: column; min-width: 0; }
.dt strong { font-size: .85rem; font-weight: 600; }
.dt small { font-size: .74rem; color: var(--mut); }
.who { padding: .55rem .6rem .5rem; border-bottom: 1px solid var(--line); margin-bottom: .3rem; }
.who strong { display: block; font-size: .87rem; }
.who small { font-size: .74rem; color: var(--mut); text-transform: capitalize; }
.dhead {
  padding: .45rem .6rem .25rem; font-size: .68rem; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--mut);
}

/* search */
.search {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .45rem .7rem; border-radius: var(--r-sm);
  border: 1px solid var(--line-2); background: color-mix(in srgb, var(--txt) 3%, transparent);
  color: var(--mut); font-size: .84rem; min-width: 190px;
  transition: all var(--fast) var(--ease);
}
.search:hover { border-color: var(--acc); color: var(--txt); }
.sl { flex: 1; text-align: left; }
kbd {
  padding: .12rem .35rem; border-radius: 5px; font-size: .68rem; font-family: var(--mono);
  border: 1px solid var(--line-2); background: color-mix(in srgb, var(--txt) 6%, transparent);
  color: var(--mut);
}

.ic {
  display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0;
  border-radius: var(--r-sm); border: 1px solid var(--line);
  background: color-mix(in srgb, var(--txt) 3%, transparent); color: var(--mut);
  transition: all var(--fast) var(--ease);
}
.ic:hover { color: var(--txt); background: color-mix(in srgb, var(--txt) 8%, transparent); }

.user { position: relative; }
.ubtn {
  display: inline-flex; align-items: center; gap: .3rem;
  padding: .25rem .45rem .25rem .25rem; border-radius: 999px;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--txt) 3%, transparent);
  color: var(--mut);
}
.ubtn:hover { border-color: var(--line-2); }
.avatar {
  display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%;
  background: linear-gradient(135deg, var(--acc), var(--acc-2));
  color: #fff; font-size: .8rem; font-weight: 700;
}

/* ---------------- palette ---------------- */
.pscrim {
  position: fixed; inset: 0; z-index: 200; display: flex; justify-content: center;
  padding: 12vh 1rem 1rem; background: rgba(0,0,0,.5); backdrop-filter: blur(3px);
}
.palette {
  width: min(560px, 100%); max-height: 62vh; display: flex; flex-direction: column;
  overflow: hidden; box-shadow: var(--sh-3);
  animation: rise .18s var(--ease);
}
@keyframes rise { from { opacity: 0; transform: translateY(-10px) scale(.98); } }
.pinput {
  display: flex; align-items: center; gap: .6rem;
  padding: .9rem 1rem; border-bottom: 1px solid var(--line); color: var(--mut);
}
.pinput input {
  flex: 1; border: 0; background: none; color: var(--txt);
  font-size: 1rem; font-family: inherit;
}
.pinput input:focus { outline: none; }
.presults { list-style: none; overflow-y: auto; padding: .35rem; }
.presults li {
  display: flex; align-items: center; gap: .6rem;
  padding: .55rem .6rem; border-radius: var(--r-sm); cursor: pointer;
}
.presults li.cur { background: color-mix(in srgb, var(--acc) 15%, transparent); }
.grp {
  margin-left: auto; font-size: .72rem; color: var(--mut);
  padding: .12rem .45rem; border-radius: 999px;
  background: color-mix(in srgb, var(--txt) 7%, transparent); white-space: nowrap;
}
.ret { color: var(--acc-2); flex-shrink: 0; }
.pempty { padding: 2.2rem 1rem; text-align: center; }
.pempty strong { display: block; font-size: .93rem; margin-bottom: .25rem; }
.pempty p { font-size: .83rem; color: var(--mut); }

/* ---------------- page ---------------- */
.main { position: relative; z-index: 1; max-width: 1600px; margin-inline: auto; }
.page-head { padding: 1.3rem 1.4rem .2rem; }
.page-head h1 { font-size: 1.32rem; font-weight: 700; letter-spacing: -.02em; }
.lic {
  display: flex; align-items: center; gap: .55rem;
  margin: .9rem 1.4rem 0; padding: .65rem .9rem; border-radius: var(--r-sm);
  font-size: .85rem; color: var(--warn);
  background: color-mix(in srgb, var(--warn) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 32%, transparent);
}
.lic a { margin-left: auto; color: inherit; text-decoration: underline; }
.content { padding: 1.1rem 1.4rem 3rem; }

/* ---------------- drawer (mobile) ---------------- */
.drawer {
  position: fixed; inset: 0 auto 0 0; width: 268px; z-index: 80;
  transform: translateX(-100%); transition: transform var(--mid) var(--ease);
  border-radius: 0; border-width: 0 1px 0 0; padding: .8rem;
  overflow-y: auto;
}
.drawer.open { transform: none; box-shadow: var(--sh-3); }
.dhead-row { display: flex; align-items: center; margin-bottom: 1rem; }
.dhead-row strong { font-size: .95rem; font-weight: 700; }
.dhead-row .ic { margin-left: auto; }
.dgroup {
  padding: .8rem .6rem .3rem; font-size: .68rem; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--mut);
}
.ditem {
  display: flex; align-items: center; gap: .6rem;
  padding: .6rem .6rem; border-radius: var(--r-sm);
  font-size: .88rem; color: var(--mut);
}
.ditem.sub { padding-left: 1.1rem; font-size: .85rem; }
.ditem:hover { background: color-mix(in srgb, var(--txt) 6%, transparent); color: var(--txt); }
.ditem.on { color: var(--txt); background: color-mix(in srgb, var(--acc) 14%, transparent); }

.scrim {
  position: fixed; inset: 0; z-index: 70;
  background: rgba(0,0,0,.5); backdrop-filter: blur(2px);
}

.only-mobile { display: none; }
.fade-enter-active, .fade-leave-active { transition: opacity var(--fast) var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.drop-enter-active, .drop-leave-active {
  transition: opacity var(--fast) var(--ease), transform var(--fast) var(--ease);
}
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px) scale(.98); }

@media (max-width: 1080px) {
  .search { min-width: 0; }
  .search .sl, .search kbd { display: none; }
}
@media (max-width: 900px) {
  .menu { display: none; }
  .only-mobile { display: grid; }
  .bname { display: none; }
  .menu { flex: 0; }
  .search { margin-left: auto; }
}
@media (max-width: 560px) {
  .bar-inner { padding: 0 .8rem; gap: .4rem; }
  .content { padding: 1rem .9rem 2.5rem; }
  .page-head { padding: 1.1rem .9rem .2rem; }
  .lic { margin: .8rem .9rem 0; }
}
</style>
