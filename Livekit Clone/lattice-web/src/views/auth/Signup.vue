<template>
  <div class="auth-layout">
    <div class="auth-container">
      <div class="auth-sidebar">
        <div class="sidebar-content">
          <h3>Aetos Lattice</h3>
          <p>Voice infrastructure for the future. Self-hosted, modular, zero-latency.</p>
        </div>
      </div>

      <div class="auth-card">
        <div class="auth-header">
          <h2>Create account</h2>
          <p>Start building with Aetos Lattice today</p>
        </div>

        <form @submit.prevent="handleSignup">
          <div class="form-group">
            <label>Full Name</label>
            <input
              v-model="name"
              type="text"
              placeholder="John Doe"
              required
            />
          </div>

          <div class="form-group">
            <label>Email</label>
            <input
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div class="form-group">
            <label>Password</label>
            <input
              v-model="password"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          <div class="form-group">
            <label>Confirm Password</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          <div v-if="error" class="error-message">{{ error }}</div>

          <button
            type="submit"
            class="btn-primary btn-block"
            :disabled="isLoading"
          >
            {{ isLoading ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <div class="auth-footer">
          <p>Already have an account? <router-link to="/login">Sign in</router-link></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const error = ref('')

const handleSignup = async () => {
  error.value = ''

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Password must be at least 6 characters'
    return
  }

  isLoading.value = true

  try {
    const success = await authStore.signup(email.value, password.value, name.value)
    if (success) {
      router.push('/app')
    } else {
      error.value = authStore.error || 'Signup failed'
    }
  } catch (err) {
    error.value = 'An unexpected error occurred'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.auth-layout {
  min-height: 100vh;
  display: flex;
  background: linear-gradient(135deg, var(--color-bg-light) 0%, var(--color-bg) 100%);
}

.auth-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
}

.auth-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem;
  background: var(--color-bg);
}

.auth-header {
  margin-bottom: 2rem;
}

.auth-header h2 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.auth-header p {
  color: var(--color-text-light);
  font-size: 14px;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--color-bg);
  color: var(--color-text);
  transition: border 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.form-group input::placeholder {
  color: var(--color-text-light);
}

.error-message {
  background: #fee2e2;
  color: #991b1b;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 1rem;
}

@media (prefers-color-scheme: dark) {
  .error-message {
    background: #7f1d1d;
    color: #fecaca;
  }
}

.btn-primary {
  width: 100%;
  padding: 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-block {
  width: 100%;
  display: block;
}

.auth-footer {
  text-align: center;
  margin-top: 2rem;
  font-size: 14px;
}

.auth-footer a {
  font-weight: 600;
  color: var(--color-primary);
}

.auth-sidebar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  padding: 3rem;
}

.sidebar-content h3 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 1rem;
}

.sidebar-content p {
  font-size: 16px;
  line-height: 1.6;
  opacity: 0.9;
}

@media (max-width: 768px) {
  .auth-container {
    grid-template-columns: 1fr;
  }

  .auth-sidebar {
    display: none;
  }
}
</style>
