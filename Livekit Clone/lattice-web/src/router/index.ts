import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth, type Role } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    minRole?: Role
    title?: string
    public?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'Landing', component: () => import('../views/Landing.vue'),
    meta: { public: true } },

  { path: '/login', name: 'Login', component: () => import('../views/auth/Login.vue'),
    meta: { public: true } },
  { path: '/signup', name: 'Signup', component: () => import('../views/auth/Signup.vue'),
    meta: { public: true } },
  { path: '/change-password', name: 'ChangePassword',
    component: () => import('../views/auth/ChangePassword.vue'),
    meta: { requiresAuth: true } },

  {
    path: '/app',
    component: () => import('../layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('../views/app/Dashboard.vue'),
        meta: { title: 'Dashboard', minRole: 'viewer' } },

      { path: 'agents', name: 'Agents',
        component: () => import('../views/app/agents/AgentList.vue'),
        meta: { title: 'Agents', minRole: 'viewer' } },
      { path: 'agents/:id', name: 'AgentDetail',
        component: () => import('../views/app/agents/AgentDetail.vue'),
        meta: { title: 'Agent', minRole: 'viewer' } },
      { path: 'agents/:id/designer', name: 'AgentDesigner',
        component: () => import('../views/app/agents/AgentDesigner.vue'),
        meta: { title: 'Designer', minRole: 'admin' } },

      { path: 'sessions', name: 'Sessions',
        component: () => import('../views/app/sessions/SessionList.vue'),
        meta: { title: 'Sessions', minRole: 'viewer' } },
      { path: 'sessions/:id', name: 'SessionDetail',
        component: () => import('../views/app/sessions/SessionDetail.vue'),
        meta: { title: 'Session', minRole: 'viewer' } },

      { path: 'telephony', name: 'Telephony',
        component: () => import('../views/app/telephony/Telephony.vue'),
        meta: { title: 'Telephony', minRole: 'viewer' } },

      { path: 'components', name: 'Components',
        component: () => import('../views/app/components/ComponentList.vue'),
        meta: { title: 'Components', minRole: 'viewer' } },

      { path: 'settings', name: 'Settings',
        component: () => import('../views/app/settings/Settings.vue'),
        meta: { title: 'Settings', minRole: 'admin' } },
      { path: 'settings/:tab', name: 'SettingsTab',
        component: () => import('../views/app/settings/Settings.vue'),
        meta: { title: 'Settings', minRole: 'admin' } },
    ],
  },

  { path: '/:pathMatch(.*)*', name: 'NotFound',
    component: () => import('../views/NotFound.vue'), meta: { public: true } },
]

const router = createRouter({
  history: createWebHistory((import.meta as any).env?.BASE_URL || '/'),
  routes,
  scrollBehavior: (to, _from, saved) =>
    saved ?? (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  // One restore attempt per page load, before the first guarded decision.
  if (!auth.ready) await auth.restore()

  if (to.meta.public) {
    // A signed-in user landing on /login goes straight through to the console.
    if ((to.name === 'Login' || to.name === 'Signup') && auth.isAuthenticated) {
      return { path: '/app' }
    }
    return true
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'Login', query: to.fullPath !== '/app' ? { next: to.fullPath } : {} }
  }

  // A temporary password must be replaced before anything else is reachable.
  if (auth.isAuthenticated && auth.mustChangePassword && to.name !== 'ChangePassword') {
    return { name: 'ChangePassword' }
  }

  if (to.meta.minRole && !auth.can(to.meta.minRole)) {
    return { path: '/app' }
  }

  return true
})

export default router
