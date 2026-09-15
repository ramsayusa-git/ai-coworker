# Aetos Lattice Web App - Architecture Diagrams

## 1. Application Structure

```
Aetos Lattice Web App
│
├── index.html (Entry point)
│   └── <div id="app"></div>
│
├── src/
│   ├── main.ts
│   │   └── createApp() + Vue Router + Pinia
│   │
│   ├── App.vue
│   │   └── <router-view /> + Global CSS
│   │
│   ├── router/index.ts
│   │   ├── Route definitions
│   │   └── Navigation guards (beforeEach)
│   │
│   ├── stores/authStore.ts
│   │   ├── User state
│   │   ├── Token state
│   │   ├── Auth actions (login, signup, logout)
│   │   └── localStorage persistence
│   │
│   └── views/
│       ├── Landing.vue          (Public)
│       ├── auth/
│       │   ├── Login.vue        (Public)
│       │   └── Signup.vue       (Public)
│       ├── app/
│       │   ├── Dashboard.vue    (Protected)
│       │   ├── Agents.vue       (Protected)
│       │   ├── Deployments.vue  (Protected)
│       │   └── Settings.vue     (Protected)
│       └── NotFound.vue         (Public)
│
├── vite.config.ts  → Dev server config
├── tsconfig.json   → TypeScript config
├── package.json    → Dependencies
└── README.md + SETUP_GUIDE.md + etc
```

---

## 2. Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER AUTHENTICATION FLOW                 │
└─────────────────────────────────────────────────────────────┘

1. SIGNUP
   ├─ User → /signup page
   ├─ Form input: email, password, name
   ├─ Submit → authStore.signup(email, password, name)
   ├─ → Pinia store makes API call (mock: 1000ms delay)
   ├─ → API returns: { user, token }
   ├─ → Store in Pinia: authStore.user, authStore.token
   ├─ → Persist: localStorage.auth_token, localStorage.auth_user
   ├─ → isAuthenticated = true
   └─ → Router.push('/app') → Dashboard renders

2. LOGIN
   ├─ User → /login page
   ├─ Form input: email, password
   ├─ Submit → authStore.login(email, password)
   ├─ → API call (mock: 800ms delay)
   ├─ → Returns: { user, token }
   ├─ → Store in Pinia + localStorage
   ├─ → isAuthenticated = true
   └─ → Navigate to /app (or redirect param)

3. SESSION RESTORATION (on app load)
   ├─ App.vue mounted
   ├─ → authStore.initAuth()
   ├─ → Read localStorage.auth_token
   ├─ → Read localStorage.auth_user
   ├─ → Restore to Pinia store
   ├─ → isAuthenticated = true
   └─ → Can access /app immediately

4. LOGOUT
   ├─ User clicks "Logout" button
   ├─ → authStore.logout()
   ├─ → Clear Pinia store: user, token
   ├─ → Clear localStorage
   ├─ → isAuthenticated = false
   └─ → Router.push('/') → Landing page
```

---

## 3. Route Guards & Navigation

```
┌─────────────────────────────────────────────────────────────┐
│                    ROUTE NAVIGATION FLOW                    │
└─────────────────────────────────────────────────────────────┘

User clicks router-link to /destination
        ↓
Router.beforeEach() guard fires
        ↓
┌───────────────────────────────┐
│ Check: to.meta.requiresAuth?  │
└───────────────────────────────┘
        ↙                ↖
    YES                   NO
    ↓                     ↓
┌─────────────────────┐  Route is public
│ Requires Auth       │  → Allow navigation
└─────────────────────┘  → next() ✓
    ↓
┌─────────────────────────────────┐
│ Check:                          │
│ authStore.isAuthenticated?      │
└─────────────────────────────────┘
    ↙              ↖
  YES              NO
  ↓                ↓
Allow nav      Redirect to /login
→ next() ✓     with ?redirect param
              → next({ name: 'Login' })

SPECIAL CASES:
- User on /login but authenticated?
  → Redirect to /app
- User on /app but not authenticated?
  → Redirect to /login?redirect=/app
```

---

## 4. State Management (Pinia)

```
┌──────────────────────────────────────────────────────────┐
│              PINIA AUTH STORE STATE TREE                  │
└──────────────────────────────────────────────────────────┘

authStore {
  
  // Reactive State
  ├─ user: Ref<User | null>
  │  └─ { id, email, name, role, createdAt }
  │
  ├─ token: Ref<string | null>
  │  └─ "token_abc123def456..."
  │
  ├─ isLoading: Ref<boolean>
  │  └─ false (true during API call)
  │
  ├─ error: Ref<string | null>
  │  └─ null (or error message)
  │
  // Computed
  ├─ isAuthenticated: Computed<boolean>
  │  └─ !!token.value && !!user.value
  │
  // Actions
  ├─ login(email, password): Promise<boolean>
  ├─ signup(email, password, name): Promise<boolean>
  ├─ logout(): void
  ├─ updateProfile(updates): Promise<boolean>
  └─ initAuth(): void
}

PERSISTENCE:
├─ localStorage.auth_token   → "token_..."
└─ localStorage.auth_user    → JSON stringified user object
```

---

## 5. Component Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                   COMPONENT TREE                        │
└─────────────────────────────────────────────────────────┘

index.html
└── main.ts
    └── createApp(App)
        └── App.vue
            ├── Global CSS variables
            ├── onMounted: authStore.initAuth()
            │
            └── <router-view />
                ├── Landing.vue              (Route: /)
                ├── Login.vue                (Route: /login)
                ├── Signup.vue               (Route: /signup)
                ├── Dashboard.vue            (Route: /app)
                │   ├── Sidebar
                │   ├── TopBar
                │   ├── StatsGrid
                │   ├── RecentDeployments
                │   └── QuickStart
                │
                ├── Agents.vue               (Route: /app/agents)
                ├── Deployments.vue          (Route: /app/deployments)
                ├── Settings.vue             (Route: /app/settings)
                └── NotFound.vue             (Route: /*)
```

---

## 6. Data Flow (User Interaction)

```
┌──────────────────────────────────────────────────────────┐
│            USER INTERACTION → STATE → UI                 │
└──────────────────────────────────────────────────────────┘

1. USER SIGNUP
   User Input
   └─ name, email, password
      ↓
   Component: Signup.vue
   └─ @click="handleSignup()"
      ↓
   Action: authStore.signup()
   └─ API call (mock)
      ↓
   Mutation: Set state
   └─ user.value = userData
   └─ token.value = token
      ↓
   Persistence: localStorage
   └─ auth_token, auth_user
      ↓
   Navigation: router.push('/app')
   └─ Trigger beforeEach guard
      ↓
   Guard Check: isAuthenticated?
   └─ YES → Allow navigation
      ↓
   UI: Dashboard.vue renders
   └─ Display user name, stats, table

2. PAGE REFRESH (Session Restore)
   Page loads
   └─ index.html
      ↓
   App.vue onMounted()
   └─ authStore.initAuth()
      ↓
   Action: initAuth()
   └─ Read localStorage
      ↓
   Mutation: Restore state
   └─ user.value = JSON.parse(localStorage.auth_user)
   └─ token.value = localStorage.auth_token
      ↓
   Computed: isAuthenticated = true
      ↓
   Router: Current route still /app?
   └─ beforeEach guard: YES, has token
      ↓
   UI: Dashboard renders without relogin
```

---

## 7. File Dependencies (Imports)

```
┌──────────────────────────────────────────────────────────┐
│            MODULE IMPORT DEPENDENCY GRAPH                │
└──────────────────────────────────────────────────────────┘

index.html
└─ src/main.ts
   ├─ vue
   ├─ vue-router
   ├─ pinia
   ├─ ./App.vue
   └─ ./router
      ├─ vue-router
      ├─ ./stores/authStore
      └─ views/ (lazy loaded)

src/App.vue
├─ vue
├─ ./stores/authStore
└─ ./router

src/stores/authStore.ts
├─ vue
├─ pinia
└─ axios (when integrated with real API)

src/router/index.ts
├─ vue-router
└─ ./stores/authStore

src/views/Landing.vue
├─ vue
├─ vue-router

src/views/auth/Login.vue
├─ vue
├─ vue-router
└─ ./stores/authStore

src/views/app/Dashboard.vue
├─ vue
├─ vue-router
└─ ./stores/authStore
```

---

## 8. API Integration Point

```
┌──────────────────────────────────────────────────────────┐
│          API INTEGRATION (Replace Mock)                  │
└──────────────────────────────────────────────────────────┘

CURRENT (Mock):
┌────────────────────────────────────────────┐
│ src/stores/authStore.ts (lines 45-80)      │
│                                            │
│ const login = async (email, password) => {│
│   // ← MOCK: await new Promise(...)       │
│   const mockUser = { /* ... */ }           │
│   const mockToken = 'token_...'            │
│ }                                          │
└────────────────────────────────────────────┘

TO INTEGRATE REAL API:
┌────────────────────────────────────────────┐
│ Replace with:                              │
│                                            │
│ import axios from 'axios'                  │
│ const api = axios.create({                 │
│   baseURL: 'https://api.your-domain.com'   │
│ })                                         │
│                                            │
│ const { data } = await api.post(           │
│   '/auth/login',                           │
│   { email, password }                      │
│ )                                          │
│                                            │
│ const { token, user } = data               │
│ // Store as before...                      │
└────────────────────────────────────────────┘

ADD INTERCEPTORS:
┌────────────────────────────────────────────┐
│ api.interceptors.request.use(...)          │
│   → Add Authorization header               │
│                                            │
│ api.interceptors.response.use(...)         │
│   → Handle 401 → logout() + redirect       │
└────────────────────────────────────────────┘
```

---

## 9. localStorage Structure

```
┌──────────────────────────────────────────────────────────┐
│            BROWSER localStorage LAYOUT                   │
└──────────────────────────────────────────────────────────┘

After login/signup:

├─ Key: "auth_token"
│  └─ Value: "token_a1b2c3d4e5f6g7h8i9j0k1l2m3n4"
│
└─ Key: "auth_user"
   └─ Value: 
      {
        "id": "user_xyz123",
        "email": "user@example.com",
        "name": "John Doe",
        "role": "admin",
        "createdAt": "2026-09-15T07:00:00Z"
      }

LIFECYCLE:
1. Created → By authStore.login() or authStore.signup()
2. Persists → Across page refresh, tab close/reopen
3. Restored → By authStore.initAuth() on app startup
4. Cleared → By authStore.logout() (removeItem)
```

---

## 10. CSS Variable System

```
┌──────────────────────────────────────────────────────────┐
│            THEME CSS VARIABLES (App.vue)                 │
└──────────────────────────────────────────────────────────┘

:root (Light Mode)
├─ --color-primary: #6366f1
├─ --color-primary-dark: #4f46e5
├─ --color-primary-light: #818cf8
├─ --color-text: #1f2937
├─ --color-text-light: #6b7280
├─ --color-bg: #ffffff
├─ --color-bg-light: #f9fafb
├─ --color-border: #e5e7eb
├─ --color-success: #10b981
├─ --color-error: #ef4444
└─ --color-warning: #f59e0b

@media (prefers-color-scheme: dark)
├─ --color-primary: #818cf8          (lighter)
├─ --color-primary-dark: #6366f1
├─ --color-primary-light: #a5b4fc
├─ --color-text: #f3f4f6             (light gray)
├─ --color-text-light: #d1d5db
├─ --color-bg: #111827               (dark)
├─ --color-bg-light: #1f2937
├─ --color-border: #374151
└─ (success, error, warning unchanged)

[data-theme="light"]
└─ Overrides all to light mode

[data-theme="dark"]
└─ Overrides all to dark mode

USAGE IN COMPONENTS:
.button {
  background: var(--color-primary)     ← Auto theme-aware
  color: var(--color-bg)
  border: 1px solid var(--color-border)
}
```

---

## 11. Responsive Breakpoints

```
┌──────────────────────────────────────────────────────────┐
│          MOBILE-FIRST RESPONSIVE LAYOUT                  │
└──────────────────────────────────────────────────────────┘

Mobile (<768px)
├─ Single column layout
├─ Sidebar hidden (show as dropdown or collapse)
├─ Cards stack vertically
├─ Full-width buttons
├─ Smaller font sizes
├─ Touch-friendly tap targets (48px+)
└─ Optimize for 4-inch screens

Tablet (768px - 1024px)
├─ Two-column grid (when possible)
├─ Sidebar visible but narrow
├─ Medium padding/margins
├─ Grid layouts with 2 columns
└─ Adjust font sizes for readability

Desktop (1024px+)
├─ Full layout unleashed
├─ Wide sidebar
├─ Multi-column grids
├─ Hover states (sidebar highlights)
├─ Full padding/margins
└─ All features visible

BREAKPOINTS IN CODE:
@media (max-width: 768px) {
  /* Mobile overrides */
}

@media (min-width: 1024px) {
  /* Desktop overrides */
}
```

---

## 12. Error Handling Flow

```
┌──────────────────────────────────────────────────────────┐
│            ERROR HANDLING FLOW                           │
└──────────────────────────────────────────────────────────┘

User Action
└─ Submit login form
    ↓
Try authStore.login()
    ↓
├─ Success
│  ├─ Set token + user
│  ├─ Store in localStorage
│  ├─ isLoading = false
│  ├─ error = null
│  └─ Return true
│
└─ Failure
   ├─ Catch error
   ├─ Set error.value = error.message
   ├─ Clear token + user
   ├─ isLoading = false
   └─ Return false

Component (Login.vue)
└─ if (!success) {
     show error message
   } else {
     redirect to /app
   }

Display to User
└─ Error box with red background
   └─ "Login failed" or specific message
   └─ User can retry
```

---

**Architecture Version**: 1.0  
**Last Updated**: 2026-09-15  
**Ready**: Production deployment
