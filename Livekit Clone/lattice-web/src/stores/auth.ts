import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Auth } from '../api'
import { saveTokens, currentAccess, setSignedOutHandler } from '../api/client'

export type Role = 'viewer' | 'operator' | 'admin' | 'owner'
const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 }

export interface Membership {
  tenant_id: string; slug: string; name: string; role: Role; is_platform: boolean
}

export const useAuth = defineStore('auth', () => {
  const user = ref<any | null>(null)
  const tenant = ref<any | null>(null)
  const role = ref<Role>('viewer')
  const memberships = ref<Membership[]>([])
  const ready = ref(false)          // true once the initial /me has settled
  const refreshToken = ref<string>('')

  const isAuthenticated = computed(() => !!user.value)
  const isPlatform = computed(() => !!tenant.value?.is_platform)
  const mustChangePassword = computed(() => !!user.value?.must_change_password)

  /** Role check. Use for hiding UI; the server enforces the real rule. */
  function can(minimum: Role): boolean {
    return RANK[role.value] >= RANK[minimum]
  }

  function apply(data: any) {
    user.value = data.user ?? user.value
    tenant.value = data.tenant ?? tenant.value
    role.value = (data.role as Role) ?? role.value
    if (data.memberships) memberships.value = data.memberships
    if (data.access && data.refresh) {
      refreshToken.value = data.refresh
      saveTokens({ access: data.access, refresh: data.refresh })
    }
  }

  function clear() {
    user.value = null
    tenant.value = null
    role.value = 'viewer'
    memberships.value = []
    refreshToken.value = ''
    saveTokens(null)
  }

  async function login(email: string, password: string, tenantSlug?: string) {
    const data = await Auth.login(email, password, tenantSlug)
    apply(data)
    ready.value = true
    return data
  }

  async function logout() {
    try {
      if (refreshToken.value) await Auth.logout(refreshToken.value)
    } catch {
      /* signing out locally matters more than the server round trip */
    }
    clear()
  }

  /** Restore a session on boot. Never throws — a failure just means signed out. */
  async function restore() {
    if (!currentAccess()) {
      ready.value = true
      return
    }
    try {
      const me = await Auth.me()
      user.value = me.user ?? null
      tenant.value = me.tenant ?? null
      role.value = (me.role as Role) ?? 'viewer'
      memberships.value = me.memberships ?? []
    } catch {
      clear()
    } finally {
      ready.value = true
    }
  }

  async function switchTenant(tenantId: string) {
    const data = await Auth.switchTenant(tenantId)
    apply(data)
    return data
  }

  async function changePassword(current: string, next: string) {
    await Auth.changePassword(current, next)
    // The server revokes every session on a password change, so we sign out.
    clear()
  }

  setSignedOutHandler(() => clear())

  return {
    user, tenant, role, memberships, ready, isAuthenticated, isPlatform,
    mustChangePassword, can, login, logout, restore, switchTenant,
    changePassword, apply, clear,
  }
})
