<template>
  <div class="app-layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <h2>Lattice</h2>
      </div>
      <ul class="sidebar-menu">
        <li><router-link to="/app" active-class="active">Dashboard</router-link></li>
        <li><router-link to="/app/agents" active-class="active">Agents</router-link></li>
        <li><router-link to="/app/deployments" active-class="active">Deployments</router-link></li>
        <li><router-link to="/app/settings" active-class="active">Settings</router-link></li>
      </ul>
      <div class="sidebar-footer">
        <button class="btn-logout" @click="handleLogout">Logout</button>
      </div>
    </nav>

    <main class="main-content">
      <header class="top-bar">
        <h1>🔴 DASHBOARD COMPONENT LOADED 🔴</h1>
        <div class="user-info">
          <span>{{ authStore.user?.name }}</span>
        </div>
      </header>

      <div class="dashboard-content">
        <div class="stats-grid">
          <div class="stat-card">
            <h3>Active Agents</h3>
            <div class="stat-value">{{ stats.activeAgents }}</div>
            <p class="stat-label">Running now</p>
          </div>
          <div class="stat-card">
            <h3>Deployments</h3>
            <div class="stat-value">{{ stats.deployments }}</div>
            <p class="stat-label">Total deployments</p>
          </div>
          <div class="stat-card">
            <h3>Uptime</h3>
            <div class="stat-value">{{ stats.uptime }}%</div>
            <p class="stat-label">Last 30 days</p>
          </div>
          <div class="stat-card">
            <h3>Latency</h3>
            <div class="stat-value">{{ stats.latency }}ms</div>
            <p class="stat-label">Average p95</p>
          </div>
        </div>

        <div class="content-grid">
          <div class="card">
            <h3>Recent Deployments</h3>
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Nodes</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="deployment in recentDeployments" :key="deployment.id">
                  <td>{{ deployment.name }}</td>
                  <td><span class="badge" :class="`badge-${deployment.status}`">{{ deployment.status }}</span></td>
                  <td>{{ deployment.nodes }}</td>
                  <td>{{ deployment.updated }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="card">
            <h3>Quick Start</h3>
            <ul class="action-list">
              <li><router-link to="/app/agents">➜ Create new agent</router-link></li>
              <li><router-link to="/app/deployments">➜ Deploy configuration</router-link></li>
              <li><a href="https://docs.aetoslattice.com" target="_blank">➜ View documentation</a></li>
              <li><router-link to="/app/settings">➜ Configure plugins</router-link></li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const stats = ref({
  activeAgents: 3,
  deployments: 8,
  uptime: 99.8,
  latency: 145,
})

const recentDeployments = ref([
  { id: 1, name: 'Production Voice AI', status: 'running', nodes: 5, updated: '2 minutes ago' },
  { id: 2, name: 'Staging Environment', status: 'running', nodes: 2, updated: '1 hour ago' },
  { id: 3, name: 'Dev Cluster', status: 'stopped', nodes: 1, updated: '3 days ago' },
])

const handleLogout = () => {
  authStore.logout()
  router.push('/')
}
</script>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 250px 1fr;
  min-height: 100vh;
}

.sidebar {
  background: var(--color-bg-light);
  border-right: 1px solid var(--color-border);
  padding: 2rem 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
}

.sidebar-header h2 {
  padding: 0 1.5rem;
  margin-bottom: 2rem;
  font-size: 20px;
  color: var(--color-primary);
}

.sidebar-menu {
  list-style: none;
  flex: 1;
}

.sidebar-menu li {
  padding: 0;
}

.sidebar-menu a {
  display: block;
  padding: 12px 1.5rem;
  color: var(--color-text-light);
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.sidebar-menu a:hover {
  color: var(--color-text);
  background: var(--color-bg);
}

.sidebar-menu a.active {
  border-left-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-bg);
}

.sidebar-footer {
  padding: 0 1.5rem;
  border-top: 1px solid var(--color-border);
  padding-top: 1.5rem;
}

.btn-logout {
  width: 100%;
  padding: 10px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-logout:hover {
  background: #dc2626;
}

.main-content {
  display: flex;
  flex-direction: column;
}

.top-bar {
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  padding: 1.5rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
}

.top-bar h1 {
  font-size: 24px;
  font-weight: 700;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 14px;
  color: var(--color-text-light);
}

.dashboard-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
}

.stat-card h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-light);
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-light);
}

.content-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
}

.card h3 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 1rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  text-align: left;
  padding: 10px 0;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-light);
}

.table td {
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.badge-running {
  background: #dcfce7;
  color: #166534;
}

.badge-stopped {
  background: #fee2e2;
  color: #991b1b;
}

@media (prefers-color-scheme: dark) {
  .badge-running {
    background: #064e3b;
    color: #86efac;
  }

  .badge-stopped {
    background: #7f1d1d;
    color: #fecaca;
  }
}

.action-list {
  list-style: none;
}

.action-list li {
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.action-list li:last-child {
  border-bottom: none;
}

.action-list a {
  font-size: 14px;
  color: var(--color-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.action-list a:hover {
  color: var(--color-primary-dark);
}

@media (max-width: 768px) {
  .app-layout {
    grid-template-columns: 1fr;
  }

  .sidebar {
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    flex-direction: row;
    padding: 0;
  }

  .sidebar-header {
    padding: 1rem 1.5rem 0;
  }

  .sidebar-menu {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
  }

  .sidebar-footer {
    display: none;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
