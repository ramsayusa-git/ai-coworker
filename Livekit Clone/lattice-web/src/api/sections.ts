/**
 * Typed wrappers for the console sections added alongside the original API:
 * rooms, chat history, recordings, tools, knowledge base, reports, notes,
 * settings groups and the dependency inventory.
 *
 * Kept in its own file rather than bolted onto index.ts so the original
 * surface stays readable — these are a different slice of the product.
 */
import { api } from './client'

// ------------------------------------------------------------------ types ---

export interface Room {
  id: string
  name: string
  kind: string
  status: 'idle' | 'live' | 'closed'
  agent_id: string | null
  max_participants: number
  empty_timeout_s: number
  participants: Array<{ identity: string; role?: string; joined_at?: string }>
  participant_count: number
  metadata: Record<string, any>
  created_at: string | null
  last_active_at: string | null
}

export interface Chat {
  id: string
  agent_id: string
  agent: string
  channel: string
  visitor: string
  status: 'open' | 'closed' | 'escalated'
  started_at: string | null
  ended_at: string | null
  message_count: number
  tokens_in: number
  tokens_out: number
  cost: number
  summary: string
  messages?: Array<{ who: string; text: string; ts: number }>
}

export interface RecordingRow {
  id: string
  session_id: string | null
  room_id: string | null
  kind: string
  status: string
  destination: string
  path: string
  size_bytes: number
  duration_s: number
  error: string
  started_at: string | null
  finished_at: string | null
}

export interface ToolRow {
  id: string
  name: string
  kind: 'http' | 'builtin' | 'mcp'
  description: string
  enabled: boolean
  method: string
  url: string
  headers: Record<string, string>
  parameters: Record<string, any>
  timeout_s: number
  updated_at: string | null
}

export interface Kb {
  id: string
  name: string
  description: string
  embedding_model: string
  chunk_size: number
  chunk_overlap: number
  doc_count: number
  created_at: string | null
}

export interface KbDoc {
  id: string
  kb_id: string
  title: string
  source: string
  uri: string
  status: string
  chunks: number
  bytes: number
  error: string
  content?: string
  created_at: string | null
}

export interface ReportRow {
  id: string
  name: string
  kind: string
  window: string
  filters: Record<string, any>
  schedule: string
  recipients: string[]
  last_run_at: string | null
  created_at: string | null
}

export interface NoteRow {
  id: string
  title: string
  category: 'guide' | 'runbook' | 'note'
  body: string
  pinned: boolean
  updated_at: string | null
}

export type SettingGroup =
  | 'server' | 'security' | 'email' | 'storage' | 'finance' | 'mcp'

// -------------------------------------------------------------- endpoints ---

export const Rooms = {
  list: (status?: string) => api.get<Room[]>('/rooms', status ? { status } : undefined),
  get: (id: string) => api.get<Room>(`/rooms/${id}`),
  create: (b: Partial<Room>) => api.post<Room>('/rooms', b),
  patch: (id: string, b: Partial<Room>) => api.patch<Room>(`/rooms/${id}`, b),
  close: (id: string) => api.post<Room>(`/rooms/${id}/close`, {}),
  remove: (id: string) => api.del(`/rooms/${id}`),
}

export const Chats = {
  list: (q: Record<string, any> = {}) =>
    api.get<{ total: number; items: Chat[] }>('/chats', q),
  get: (id: string) => api.get<Chat>(`/chats/${id}`),
  close: (id: string) => api.post<Chat>(`/chats/${id}/close`, {}),
}

export const Recordings = {
  list: (q: Record<string, any> = {}) =>
    api.get<{ total: number; bytes_used: number; items: RecordingRow[] }>('/recordings', q),
  get: (id: string) => api.get<RecordingRow>(`/recordings/${id}`),
  start: (b: { session_id?: string; room_id?: string; kind?: string; destination?: string }) =>
    api.post<RecordingRow>('/recordings', b),
  stop: (id: string) => api.post<RecordingRow>(`/recordings/${id}/stop`, {}),
  remove: (id: string) => api.del(`/recordings/${id}`),
}

export const Tools = {
  list: () => api.get<ToolRow[]>('/tools'),
  get: (id: string) => api.get<ToolRow>(`/tools/${id}`),
  create: (b: Partial<ToolRow>) => api.post<ToolRow>('/tools', b),
  patch: (id: string, b: Partial<ToolRow>) => api.patch<ToolRow>(`/tools/${id}`, b),
  remove: (id: string) => api.del(`/tools/${id}`),
}

export const Knowledge = {
  list: () => api.get<Kb[]>('/knowledge-bases'),
  get: (id: string) => api.get<Kb>(`/knowledge-bases/${id}`),
  create: (b: Partial<Kb>) => api.post<Kb>('/knowledge-bases', b),
  patch: (id: string, b: Partial<Kb>) => api.patch<Kb>(`/knowledge-bases/${id}`, b),
  remove: (id: string) => api.del(`/knowledge-bases/${id}`),
  docs: (id: string) => api.get<KbDoc[]>(`/knowledge-bases/${id}/documents`),
  doc: (id: string, did: string) => api.get<KbDoc>(`/knowledge-bases/${id}/documents/${did}`),
  addDoc: (id: string, b: Partial<KbDoc>) =>
    api.post<KbDoc>(`/knowledge-bases/${id}/documents`, b),
  removeDoc: (id: string, did: string) =>
    api.del(`/knowledge-bases/${id}/documents/${did}`),
  reindex: (id: string) =>
    api.post<{ documents: number; chunks: number }>(`/knowledge-bases/${id}/reindex`, {}),
}

export const Reports = {
  list: () => api.get<ReportRow[]>('/reports'),
  get: (id: string) => api.get<ReportRow>(`/reports/${id}`),
  create: (b: Partial<ReportRow>) => api.post<ReportRow>('/reports', b),
  patch: (id: string, b: Partial<ReportRow>) => api.patch<ReportRow>(`/reports/${id}`, b),
  remove: (id: string) => api.del(`/reports/${id}`),
  run: (id: string) => api.post<any>(`/reports/${id}/run`, {}),
}

export const Notes = {
  list: (category?: string) =>
    api.get<NoteRow[]>('/notes', category ? { category } : undefined),
  get: (id: string) => api.get<NoteRow>(`/notes/${id}`),
  create: (b: Partial<NoteRow>) => api.post<NoteRow>('/notes', b),
  patch: (id: string, b: Partial<NoteRow>) => api.patch<NoteRow>(`/notes/${id}`, b),
  remove: (id: string) => api.del(`/notes/${id}`),
}

export const Settings = {
  groups: () => api.get<Array<{ group: string; min_role: string }>>('/settings'),
  get: (g: SettingGroup) =>
    api.get<{ group: string; value: Record<string, any> }>(`/settings/${g}`),
  /** Send only the keys you changed — omitted secrets keep their stored value. */
  put: (g: SettingGroup, value: Record<string, any>) =>
    api.put<{ group: string; value: Record<string, any> }>(`/settings/${g}`, { value }),
}

export const SystemInfo = {
  dependencies: () => api.get<{
    python: string
    platform: string
    packages: Array<{ name: string; version: string; status: string }>
    missing: string[]
  }>('/system/dependencies'),
}
