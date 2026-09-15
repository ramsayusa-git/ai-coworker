/** Typed wrappers over the Core API. One function per endpoint. */
import { api } from './client'

// ---------------------------------------------------------------- types ---

export interface Agent {
  id: string
  name: string
  kind: 'voice' | 'chat'
  status: 'draft' | 'online' | 'paused'
  prompt: string
  pipeline: Record<string, any>
  tools: string[]
  kb: string[]
  updated_at: string | null
  stats24h?: { calls: number; minutes: number; ttfb_ms: number; resolved_pct: number }
}

export interface Turn {
  who: 'caller' | 'agent'
  text: string
  ts: number
  eot_ms?: number
  stt_ms?: number
  llm_ms?: number
  tts_ms?: number
}

export interface CallSession {
  id: string
  agent_id: string
  agent: string | null
  channel: string
  caller: string
  started_at: string
  ended_at: string | null
  outcome: string
  duration_s: number
  cost: number
  ttfb_ms: number
  summary: string
  turns?: Turn[]
}

export interface Paged<T> {
  total: number
  limit: number
  offset: number
  items: T[]
}

export interface Overview {
  window_h: number
  calls: number
  minutes: number
  cost: number
  ttfb_ms: number
  per_hour: number[]
  by_outcome: Record<string, number>
  by_agent: { agent_id: string; agent: string; calls: number }[]
  tz: string
}

export interface Trunk {
  id: string; name: string; carrier: string
  direction: string; address: string; state: string
}
export interface PhoneNumber {
  id: string; e164: string; region: string
  direction: string; trunk_id: string | null
}
export interface Rule {
  id: string; priority: number; name: string
  number: string; agent_id: string; agent: string | null; schedule: string
}

export interface Brand {
  product_name: string
  logo_url: string; logo_dark_url: string; favicon_url: string; login_art_url: string
  colors: Record<string, string>
  typography: Record<string, any>
  radius: Record<string, string>
  support_url: string; docs_url: string; privacy_url: string; terms_url: string
  mail_from_name?: string; mail_from_email?: string; mail_footer?: string
  custom_css: string
  tenant?: { slug: string; name: string }
}

export interface Licence {
  status: 'valid' | 'grace' | 'expired' | 'unlicensed' | 'invalid'
  days_left: number | null
  licensee: string
  tier: string
  tenants_max: number | null
  concurrent_sessions_max: number | null
  features: string[]
  expires_at: string | null
  error?: string
}

export interface TenantUser {
  id: string; email: string; name: string; role: string
  status: string; last_login_at: string | null
  must_change_password: boolean
  password?: string
}

export interface ApiKeyRow {
  id: string; name: string; prefix: string; scopes: string[]
  created_at: string; last_used_at: string | null
  expires_at: string | null; revoked_at: string | null
  secret?: string
}

// ----------------------------------------------------------- endpoints ---

export interface GraphNode {
  id: string
  type: string
  x: number
  y: number
  config: Record<string, any>
}
export interface GraphEdge { from: string; to: string }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export interface Problem { node?: string; msg: string }

export interface AgentVersion {
  id: string
  version: number
  status: 'draft' | 'published' | 'archived'
  note: string
  pipeline: Record<string, any>
  prompt: string
  tools: string[]
  created_by: string | null
  created_at: string
  graph?: Graph
  problems?: Problem[]
}

export interface VersionDiff {
  from: number | null
  to: number
  changes: { field: string; from: any; to: any }[]
  note?: string
}

export const Agents = {
  list: () => api.get<Agent[]>('/agents'),
  get: (id: string) => api.get<Agent>(`/agents/${id}`),
  create: (body: Partial<Agent>) => api.post<Agent>('/agents', body),
  patch: (id: string, body: Partial<Agent>) => api.patch<Agent>(`/agents/${id}`, body),
  action: (id: string, action: 'publish' | 'pause') =>
    api.post<Agent>(`/agents/${id}/${action}`),
  remove: (id: string) => api.del(`/agents/${id}`),

  // --- designer versions ---
  compile: (id: string, graph: Graph) =>
    api.post<{ pipeline: Record<string, any>; problems: Problem[]; valid: boolean }>(
      `/agents/${id}/compile`, { graph }),
  versions: (id: string) => api.get<AgentVersion[]>(`/agents/${id}/versions`),
  latestVersion: (id: string) => api.get<AgentVersion>(`/agents/${id}/versions/latest`),
  saveVersion: (id: string, body: {
    graph: Graph; prompt?: string; tools?: string[]; note?: string; publish?: boolean
  }) => api.post<AgentVersion>(`/agents/${id}/versions`, body),
  rollback: (id: string, versionId: string) =>
    api.post<AgentVersion>(`/agents/${id}/versions/${versionId}/rollback`),
  diff: (id: string, versionId: string, against?: string) =>
    api.get<VersionDiff>(`/agents/${id}/versions/${versionId}/diff`,
      against ? { against } : undefined),
}

export const Sessions = {
  list: (q: { limit?: number; offset?: number; agent_id?: string; outcome?: string } = {}) =>
    api.get<Paged<CallSession>>('/sessions', q),
  get: (id: string) => api.get<CallSession>(`/sessions/${id}`),
  /** Same endpoints a real call uses — the tester is not a separate path. */
  start: (b: { agent_id: string; channel?: string; caller?: string }) =>
    api.post<CallSession>('/sessions', b),
  addTurn: (id: string, t: Turn) => api.post<{ n: number }>(`/sessions/${id}/turns`, t),
  end: (id: string) => api.post<CallSession>(`/sessions/${id}/end`, {}),
}

export const Analytics = {
  overview: (hours = 24) => api.get<Overview>('/analytics/overview', { hours }),
}

export const Telephony = {
  trunks: () => api.get<Trunk[]>('/telephony/trunks'),
  addTrunk: (b: Partial<Trunk>) => api.post('/telephony/trunks', b),
  numbers: () => api.get<PhoneNumber[]>('/telephony/numbers'),
  addNumber: (b: Partial<PhoneNumber>) => api.post('/telephony/numbers', b),
  rules: () => api.get<Rule[]>('/telephony/rules'),
  addRule: (b: Partial<Rule>) => api.post('/telephony/rules', b),
  dispatch: (number: string) => api.get('/telephony/dispatch', { number }),
}

export const Components = {
  installed: () => api.get<any>('/components'),
  store: () => api.get<any>('/components/store'),
  action: (name: string, action: string) => api.post(`/components/${name}/${action}`),
}

export const System = {
  info: () => api.get<any>('/system/info'),
  events: (n = 50) => api.get<any[]>('/system/events', { n }),
  audit: (n = 100, action?: string) => api.get<any[]>('/system/audit', { n, action }),
}

export const Admin = {
  users: () => api.get<TenantUser[]>('/users'),
  addUser: (b: { email: string; name?: string; role: string }) =>
    api.post<TenantUser>('/users', b),
  patchUser: (id: string, b: Partial<TenantUser>) =>
    api.patch<TenantUser>(`/users/${id}`, b),
  removeUser: (id: string) => api.del(`/users/${id}`),

  keys: () => api.get<ApiKeyRow[]>('/api-keys'),
  createKey: (b: { name: string; scopes?: string[]; expires_days?: number }) =>
    api.post<ApiKeyRow>('/api-keys', b),
  revokeKey: (id: string) => api.del(`/api-keys/${id}`),

  tenants: () => api.get<any[]>('/tenants'),
  createTenant: (b: { slug: string; name: string; owner_email?: string }) =>
    api.post('/tenants', b),
  patchTenant: (id: string, b: any) => api.patch(`/tenants/${id}`, b),

  branding: () => api.get<Brand>('/branding'),
  saveBranding: (b: Partial<Brand>) => api.put<Brand>('/branding', b),

  /** Multipart upload — bypasses the JSON client on purpose. */
  uploadAsset: async (kind: 'logo' | 'logo_dark' | 'favicon' | 'login_art', file: File) => {
    const { API_BASE, currentAccess, ApiError } = await import('./client')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/branding/assets?kind=${kind}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${currentAccess() ?? ''}` },
      body: fd,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const d = body?.detail
      throw new ApiError(res.status, typeof d === 'string' ? d : 'Upload failed', body)
    }
    return body as { kind: string; url: string; bytes: number; content_type: string }
  },
  publicBranding: (host?: string) =>
    api.get<Brand>('/branding/public', host ? { host } : undefined),

  licence: () => api.get<Licence>('/licence'),
  installLicence: (blob: string) => api.put<Licence>('/licence', { blob }),
}

export const Auth = {
  login: (email: string, password: string, tenant?: string) =>
    api.post<any>('/auth/login', { email, password, tenant }),
  refresh: (refresh: string) => api.post<any>('/auth/refresh', { refresh }),
  logout: (refresh: string) => api.post('/auth/logout', { refresh }),
  me: () => api.get<any>('/auth/me'),
  changePassword: (current: string, next: string) =>
    api.post('/auth/password', { current, new: next }),
  switchTenant: (tenant_id: string) => api.post<any>('/auth/switch-tenant', { tenant_id }),
  sessions: () => api.get<any[]>('/auth/sessions'),
  revokeSession: (id: string) => api.del(`/auth/sessions/${id}`),
}
