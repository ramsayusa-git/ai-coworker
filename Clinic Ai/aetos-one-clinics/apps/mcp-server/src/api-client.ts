import axios, { AxiosInstance } from 'axios';

/**
 * Thin client for the Aetos One Clinics core API, authenticated as a service
 * account for one organization. Every MCP tool call goes through this client,
 * so the same RBAC/tenancy rules enforced on the API (RolesGuard, row-level
 * security) apply no matter which MCP client (Claude, Codex, ...) is calling.
 */
export function createApiClient(): AxiosInstance {
  const baseURL = process.env.AETOS_API_BASE_URL ?? 'http://localhost:3001';
  const orgId = process.env.AETOS_ORG_ID;
  const token = process.env.AETOS_SERVICE_TOKEN;
  if (!orgId) {
    throw new Error('AETOS_ORG_ID environment variable is required');
  }
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      'X-Org-Id': orgId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
