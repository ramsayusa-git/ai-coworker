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

      { path: 'chatbots', name: 'Chatbots',
        component: () => import('../views/app/chatbots/ChatbotList.vue'),
        meta: { title: 'Chatbot agents', minRole: 'viewer' } },

      { path: 'sessions', name: 'Sessions',
        component: () => import('../views/app/sessions/SessionList.vue'),
        meta: { title: 'Call history', minRole: 'viewer' } },
      { path: 'sessions/:id', name: 'SessionDetail',
        component: () => import('../views/app/sessions/SessionDetail.vue'),
        meta: { title: 'Session', minRole: 'viewer' } },

      { path: 'chats', name: 'Chats',
        component: () => import('../views/app/chats/ChatList.vue'),
        meta: { title: 'Chat history', minRole: 'viewer' } },
      { path: 'chats/:id', name: 'ChatDetail',
        component: () => import('../views/app/chats/ChatDetail.vue'),
        meta: { title: 'Conversation', minRole: 'viewer' } },

      { path: 'rooms', name: 'Rooms',
        component: () => import('../views/app/rooms/RoomList.vue'),
        meta: { title: 'Rooms', minRole: 'viewer' } },

      { path: 'recordings', name: 'Recordings',
        component: () => import('../views/app/recordings/RecordingList.vue'),
        meta: { title: 'Recording / egress', minRole: 'viewer' } },

      { path: 'tools', name: 'Tools',
        component: () => import('../views/app/tools/ToolList.vue'),
        meta: { title: 'Tools', minRole: 'viewer' } },

      { path: 'knowledge', name: 'Knowledge',
        component: () => import('../views/app/knowledge/KnowledgeList.vue'),
        meta: { title: 'Knowledge base', minRole: 'viewer' } },
      { path: 'knowledge/:id', name: 'KnowledgeDetail',
        component: () => import('../views/app/knowledge/KnowledgeDetail.vue'),
        meta: { title: 'Knowledge base', minRole: 'viewer' } },

      { path: 'reports', name: 'Reports',
        component: () => import('../views/app/reports/ReportList.vue'),
        meta: { title: 'Reports', minRole: 'viewer' } },

      // Telephony keeps one screen behind three menu entries — the tabs were
      // already there, so deep-linking to a tab beats splitting the component.
      { path: 'telephony', redirect: '/app/telephony/trunks' },
      { path: 'telephony/:tab(trunks|numbers|rules)', name: 'Telephony',
        component: () => import('../views/app/telephony/Telephony.vue'),
        meta: { title: 'Telephony', minRole: 'viewer' } },
      { path: 'telephony/campaigns', name: 'Campaigns',
        component: () => import('../views/app/telephony/Campaigns.vue'),
        meta: { title: 'Campaigns', minRole: 'operator' } },

      { path: 'testing/tester', name: 'AgentTester',
        component: () => import('../views/app/testing/AgentTester.vue'),
        meta: { title: 'Agent tester', minRole: 'operator' } },
      { path: 'testing/simulation', name: 'Simulation',
        component: () => import('../views/app/testing/Simulation.vue'),
        meta: { title: 'Simulation', minRole: 'operator' } },
      { path: 'testing/autoresearch', name: 'AutoResearch',
        component: () => import('../views/app/testing/AutoResearch.vue'),
        meta: { title: 'AutoResearch', minRole: 'operator' } },
      { path: 'testing/improvement-lab', name: 'ImprovementLab',
        component: () => import('../views/app/testing/ImprovementLab.vue'),
        meta: { title: 'Improvement lab', minRole: 'operator' } },

      { path: 'components', name: 'Components',
        component: () => import('../views/app/components/ComponentList.vue'),
        meta: { title: 'Components', minRole: 'viewer' } },
      { path: 'tenants', name: 'Tenants',
        component: () => import('../views/app/platform/TenantList.vue'),
        meta: { title: 'Tenants', minRole: 'owner' } },

      { path: 'settings', redirect: '/app/settings/server' },
      { path: 'settings/server', name: 'ServerSettings',
        component: () => import('../views/app/settings/ServerSettings.vue'),
        meta: { title: 'Server', minRole: 'admin' } },
      { path: 'settings/integrations', name: 'Integrations',
        component: () => import('../views/app/settings/Integrations.vue'),
        meta: { title: 'Integrations / API', minRole: 'admin' } },
      { path: 'settings/dependencies', name: 'Dependencies',
        component: () => import('../views/app/settings/Dependencies.vue'),
        meta: { title: 'Dependencies', minRole: 'admin' } },
      { path: 'settings/security', name: 'SecuritySettings',
        component: () => import('../views/app/settings/SecuritySettings.vue'),
        meta: { title: 'Security', minRole: 'owner' } },
      { path: 'settings/email', name: 'EmailSettings',
        component: () => import('../views/app/settings/EmailSettings.vue'),
        meta: { title: 'Email', minRole: 'admin' } },
      { path: 'settings/storage', name: 'StorageSettings',
        component: () => import('../views/app/settings/StorageSettings.vue'),
        meta: { title: 'Storage', minRole: 'admin' } },
      { path: 'settings/finance', name: 'FinanceSettings',
        component: () => import('../views/app/settings/FinanceSettings.vue'),
        meta: { title: 'Finance', minRole: 'owner' } },
      { path: 'settings/notes', name: 'NotesGuides',
        component: () => import('../views/app/settings/NotesGuides.vue'),
        meta: { title: 'Notes / guides', minRole: 'viewer' } },
      // users / keys / branding / licence / system still live in the original
      // tabbed Settings screen; the menu deep-links straight to each tab.
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
