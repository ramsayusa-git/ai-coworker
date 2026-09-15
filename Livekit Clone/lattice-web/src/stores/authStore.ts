import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'viewer'
  createdAt: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  // Initialize from localStorage
  const initAuth = () => {
    console.log('🔄 initAuth called')

    // Check for development mode query param to reset session
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'true') {
      console.log('🧹 Reset param detected - clearing auth')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      // Remove the query param from URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    const savedToken = localStorage.getItem('auth_token')
    const savedUser = localStorage.getItem('auth_user')

    console.log('💾 localStorage check:', {
      hasToken: !!savedToken,
      hasUser: !!savedUser
    })

    if (savedToken && savedUser) {
      console.log('✅ Restoring auth from localStorage')
      token.value = savedToken
      user.value = JSON.parse(savedUser)
    } else {
      console.log('⭐ No auth in localStorage - user is unauthenticated')
    }
  }

  const login = async (email: string, password: string): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      // Simulate API call (replace with real API endpoint)
      await new Promise(resolve => setTimeout(resolve, 800))

      // Mock authentication
      if (!email || !password) {
        throw new Error('Email and password are required')
      }

      const mockUser: User = {
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        email,
        name: email.split('@')[0],
        role: 'admin',
        createdAt: new Date().toISOString(),
      }

      const mockToken = 'token_' + Math.random().toString(36).substr(2, 32)

      // Save to store
      user.value = mockUser
      token.value = mockToken

      // Persist to localStorage
      localStorage.setItem('auth_token', mockToken)
      localStorage.setItem('auth_user', JSON.stringify(mockUser))

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (!email || !password || !name) {
        throw new Error('All fields are required')
      }

      const mockUser: User = {
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        email,
        name,
        role: 'user',
        createdAt: new Date().toISOString(),
      }

      const mockToken = 'token_' + Math.random().toString(36).substr(2, 32)

      user.value = mockUser
      token.value = mockToken

      localStorage.setItem('auth_token', mockToken)
      localStorage.setItem('auth_user', JSON.stringify(mockUser))

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Signup failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  const logout = () => {
    user.value = null
    token.value = null
    error.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  }

  const updateProfile = async (updates: Partial<User>): Promise<boolean> => {
    try {
      if (user.value) {
        user.value = { ...user.value, ...updates }
        localStorage.setItem('auth_user', JSON.stringify(user.value))
        return true
      }
      return false
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Update failed'
      return false
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    initAuth,
    login,
    signup,
    logout,
    updateProfile,
  }
})
