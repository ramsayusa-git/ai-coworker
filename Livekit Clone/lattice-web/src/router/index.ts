import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/Landing.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/signup',
    name: 'Signup',
    component: () => import('../views/auth/Signup.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/app',
    name: 'Dashboard',
    component: () => import('../views/app/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/app/agents',
    name: 'Agents',
    component: () => import('../views/app/Agents.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/app/deployments',
    name: 'Deployments',
    component: () => import('../views/app/Deployments.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/app/settings',
    name: 'Settings',
    component: () => import('../views/app/Settings.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/clear',
    name: 'Clear',
    beforeEnter: (to, from, next) => {
      console.log('🧹 CLEARING ALL AUTH')
      localStorage.clear()
      sessionStorage.clear()
      next({ name: 'Landing' })
    },
    component: () => import('../views/Landing.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const requiresAuth = to.meta.requiresAuth as boolean

  console.log('🔍 GUARD CHECK - Route:', to.name, 'RequiresAuth:', requiresAuth, 'Token:', !!authStore.token, 'User:', !!authStore.user)

  // STRICT: Block protected routes if not authenticated
  if (requiresAuth && (!authStore.token || !authStore.user)) {
    console.log('🛑 BLOCKED - Redirecting to Landing (no auth)')
    return next({ name: 'Landing' })
  }

  // Redirect authenticated users away from login/signup
  if ((to.name === 'Login' || to.name === 'Signup') && authStore.token && authStore.user) {
    console.log('⚠️ Redirecting authenticated user to Dashboard')
    return next({ name: 'Dashboard' })
  }

  console.log('✅ Allowing navigation')
  next()
})

export default router
