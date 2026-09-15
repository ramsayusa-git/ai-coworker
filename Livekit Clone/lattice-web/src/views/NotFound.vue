<template>
  <div class="not-found">
    <div class="container">
      <h1>404</h1>
      <h2>Page Not Found</h2>
      <p>The page you're looking for doesn't exist.</p>
      <router-link to="/" class="btn-primary">Back to Home</router-link>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-bg-light) 0%, var(--color-bg) 100%);
}

.container {
  text-align: center;
}

h1 {
  font-size: 72px;
  font-weight: 800;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

h2 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 1rem;
}

p {
  font-size: 16px;
  color: var(--color-text-light);
  margin-bottom: 2rem;
}

.btn-primary {
  display: inline-block;
  padding: 12px 24px;
  background: var(--color-primary);
  color: white;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
}
</style>
