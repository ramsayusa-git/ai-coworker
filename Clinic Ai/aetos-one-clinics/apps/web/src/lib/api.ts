import axios from 'axios';

/**
 * API client for the web app. Reads the tenant/org id from local storage
 * (set at login) and sends it as X-Org-Id — mirroring the dev fallback in
 * apps/api/src/tenancy/tenant.middleware.ts. Swap for a Keycloak-issued JWT
 * (Authorization: Bearer ...) once auth is wired; the org claim then comes
 * from the token instead of this header.
 */
export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const orgId = localStorage.getItem('aetos.orgId');
  const role = localStorage.getItem('aetos.role');
  if (orgId) config.headers['X-Org-Id'] = orgId;
  if (role) config.headers['X-Role'] = role; // dev-only RBAC fallback, see roles.guard.ts
  return config;
});
