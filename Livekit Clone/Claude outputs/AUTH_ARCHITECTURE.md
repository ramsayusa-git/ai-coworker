# Authentication & Routing Architecture

## Overview

Aetos Lattice uses a **Pinia-based auth store** with **Vue Router guards** to manage user sessions and protect routes.

---

## Auth Store (`src/stores/authStore.ts`)

### State

```typescript
interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'viewer'
  createdAt: string
}

// Store state
user: Ref<User | null> = null
token: Ref<string | null> = null
isLoading: Ref<boolean> = false
error: Ref<string | null> = null
isAuthenticated: Computed<boolean> = computed(() => !!token.value && !!user.value)
```

### Actions

#### `login(email: string, password: string): Promise<boolean>`

Authenticates user and stores token/user in localStorage.

```typescript
// Usage
const success = await authStore.login('user@example.com', 'password123')

if (success) {
  // User authenticated, can now access protected routes
  router.push('/app')
} else {
  // Show error: authStore.error
}
```

#### `signup(email: string, password: string, name: string): Promise<boolean>`

Creates new account and auto-logs in.

```typescript
const success = await authStore.signup(
  'user@example.com', 
  'password123', 
  'John Doe'
)
```

#### `logout(): void`

Clears auth state and localStorage.

```typescript
authStore.logout()
router.push('/') // Redirect to landing
```

#### `updateProfile(updates: Partial<User>): Promise<boolean>`

Updates user info in store and localStorage.

```typescript
await authStore.updateProfile({
  name: 'John Smith'
})
```

#### `initAuth(): void`

Restores user session from localStorage on app startup.

```typescript
// Called in App.vue onMounted
onMounted(() => {
  authStore.initAuth()
})
```

---

## Router Guards (`src/router/index.ts`)

### Navigation Guard (beforeEach)

```typescript
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const requiresAuth = to.meta.requiresAuth as boolean

  // Check if route requires authentication
  if (requiresAuth && !authStore.isAuthenticated) {
    // Not authenticated → redirect to login with intended path
    next({ 
      name: 'Login', 
      query: { redirect: to.fullPath } 
    })
  } 
  // Already authenticated + trying to access login/signup
  else if (!requiresAuth && ['Login', 'Signup'].includes(to.name)) {
    if (authStore.isAuthenticated) {
      // Redirect to dashboard instead
      next({ name: 'Dashboard' })
    } else {
      next()
    }
  } 
  // All other cases: proceed
  else {
    next()
  }
})
```

### Route Metadata

Every route has `meta: { requiresAuth: boolean }`:

```typescript
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/Landing.vue'),
    meta: { requiresAuth: false }  // ← Public page
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/Login.vue'),
    meta: { requiresAuth: false }  // ← Public page
  },
  {
    path: '/app',
    name: 'Dashboard',
    component: () => import('../views/app/Dashboard.vue'),
    meta: { requiresAuth: true }   // ← Protected page
  }
]
```

---

## User Flow Diagrams

### Login Flow

```
User visits /login
       ↓
Enters email + password
       ↓
Clicks "Sign in"
       ↓
authStore.login() called
       ↓
[Mock API] Validates credentials
       ↓
Success: token + user stored in localStorage
       ↓
Router navigates to /app (or redirected URL)
       ↓
Dashboard renders (isAuthenticated = true)
```

### Protected Route Access

```
User visits /app/agents (requires auth)
       ↓
Router guard checks: requiresAuth = true
       ↓
Guard checks: authStore.isAuthenticated?
       ↓
YES → Render page ✓
NO → Redirect to /login?redirect=/app/agents
       ↓
User logs in
       ↓
Guard detects ?redirect query param
       ↓
[Currently doesn't auto-redirect to original]
[To implement: check route.query.redirect in component]
```

### Logout Flow

```
User clicks "Logout" in Dashboard
       ↓
authStore.logout() called
       ↓
Clears: user, token, localStorage
       ↓
Router navigates to /
       ↓
User now unauthenticated (can't access /app)
```

---

## localStorage Structure

### Storage Keys

```javascript
// After successful login/signup:
localStorage.getItem('auth_token')
// → "token_abc123def456..."

localStorage.getItem('auth_user')
// → JSON string:
{
  "id": "user_xyz789",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "admin",
  "createdAt": "2026-09-15T07:00:00Z"
}
```

### Manual Testing

```javascript
// Clear all auth in browser console
localStorage.removeItem('auth_token')
localStorage.removeItem('auth_user')

// Manually set auth (for testing)
localStorage.setItem('auth_token', 'test_token_123')
localStorage.setItem('auth_user', JSON.stringify({
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  createdAt: new Date().toISOString()
}))

// Reload page to apply
location.reload()
```

---

## Component Integration Examples

### Check if User is Authenticated

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
</script>

<template>
  <div v-if="authStore.isAuthenticated">
    <p>Welcome, {{ authStore.user?.name }}</p>
  </div>
  <div v-else>
    <p>Please log in</p>
  </div>
</template>
```

### Use User Data

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const userEmail = authStore.user?.email
const userRole = authStore.user?.role
</script>

<template>
  <div class="profile">
    <h2>{{ authStore.user?.name }}</h2>
    <p>Email: {{ userEmail }}</p>
    <p>Role: {{ userRole }}</p>
  </div>
</template>
```

### Handle Login Errors

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')

const handleLogin = async () => {
  error.value = ''
  const success = await authStore.login(email.value, password.value)
  
  if (!success) {
    error.value = authStore.error || 'Login failed'
  }
}
</script>

<template>
  <div>
    <input v-model="email" type="email" />
    <input v-model="password" type="password" />
    <div v-if="error" class="error">{{ error }}</div>
    <button @click="handleLogin" :disabled="authStore.isLoading">
      {{ authStore.isLoading ? 'Signing in...' : 'Sign in' }}
    </button>
  </div>
</template>
```

---

## Real API Integration

### Replace Mock Auth

**Before** (src/stores/authStore.ts, current):

```typescript
const login = async (email: string, password: string) => {
  // Mock API call with 800ms delay
  await new Promise(resolve => setTimeout(resolve, 800))
  
  const mockUser: User = { /* ... */ }
  const mockToken = 'token_...'
  
  user.value = mockUser
  token.value = mockToken
}
```

**After** (with real API):

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://api.aetoslattice.com'
})

const login = async (email: string, password: string) => {
  isLoading.value = true
  error.value = null
  
  try {
    const { data } = await api.post('/auth/login', {
      email,
      password
    })
    
    const { token, user: userData } = data
    
    user.value = userData
    token.value = token
    
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(userData))
    
    return true
  } catch (err) {
    error.value = err.response?.data?.message || 'Login failed'
    return false
  } finally {
    isLoading.value = false
  }
}
```

### Add Request Interceptor

```typescript
// Add auth header to all requests
api.interceptors.request.use(config => {
  if (token.value) {
    config.headers.Authorization = `Bearer ${token.value}`
  }
  return config
})

// Handle 401 Unauthorized
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      logout() // Clear session
      router.push('/login')
    }
    return Promise.reject(error)
  }
)
```

---

## Testing Scenarios

### Scenario 1: Fresh User (No Session)

1. Load app → localStorage empty
2. Router redirects to landing page (public)
3. Click "Get Started" → /signup
4. Fill form, submit → stored in localStorage
5. Auto-redirect to /app
6. Dashboard renders with user data

### Scenario 2: Returning User

1. Load app → localStorage has token + user
2. authStore.initAuth() restores session
3. Can access /app immediately
4. Refresh page → session persists

### Scenario 3: Expired Session (Real API)

1. User accesses protected route
2. API returns 401 Unauthorized
3. Interceptor logs out user
4. Redirect to /login
5. User re-authenticates

### Scenario 4: Session in Another Tab

1. User logs out in tab A
2. Tab B still has old localStorage
3. User tries to access /app in tab B
4. API returns 401
5. Interceptor logs out tab B too

---

## Security Notes

⚠️ **Current Implementation (Development)**

- Uses localStorage (vulnerable to XSS)
- No HTTPS enforcement
- Mock API (no real validation)
- No CSRF protection

✅ **For Production**

- [ ] Move token to httpOnly cookie
- [ ] Implement HTTPS everywhere
- [ ] Add CSRF token to requests
- [ ] Validate JWT expiry in store
- [ ] Implement token refresh flow
- [ ] Add rate limiting on login
- [ ] Hash passwords server-side
- [ ] Implement 2FA for admin users

---

**Architecture Version**: 1.0  
**Last Updated**: 2026-09-15  
**Maintained By**: Aetos One Pro
