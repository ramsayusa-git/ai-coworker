/**
 * API client.
 *
 * Handles bearer auth, one-shot refresh on 401, and turns non-2xx responses
 * into a typed ApiError so screens can render a real message rather than
 * "[object Object]".
 */

/**
 * Same-origin by default, proxied to the core by the dev server (vite.config.ts)
 * and by the reverse proxy in production.
 *
 * It used to point straight at http://localhost:8100. That works on exactly one
 * machine and fails everywhere else: over https://latticenet.aetosiot.com it is
 * mixed content, in embedded browsers the cross-origin call comes back
 * ERR_BLOCKED_BY_CLIENT, and the login screen can only report "could not reach
 * the server". Same-origin has none of those failure modes. Set VITE_API_BASE
 * only when the console is deliberately hosted apart from its core.
 */
export const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api/v1'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

type Tokens = { access: string; refresh: string }

const STORAGE_KEY = 'lattice.tokens'

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null // private mode / blocked storage — treat as signed out
  }
}

export function saveTokens(t: Tokens | null) {
  try {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* non-fatal */
  }
}

export function currentAccess(): string | null {
  return readTokens()?.access ?? null
}

/** Extract a human-readable message from FastAPI's error shapes. */
function messageFrom(status: number, body: any): string {
  const d = body?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) {
    const first = d[0]
    const field = Array.isArray(first?.loc) ? first.loc.slice(1).join('.') : ''
    return field ? `${field}: ${first.msg}` : first.msg
  }
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to do that.'
  if (status === 404) return 'Not found.'
  if (status === 402) return 'Your licence does not allow this.'
  if (status >= 500) return 'The server had a problem. Try again shortly.'
  return `Request failed (${status}).`
}

let refreshing: Promise<boolean> | null = null

/** Refresh once, shared across concurrent 401s so we don't stampede. */
async function refreshOnce(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const tokens = readTokens()
    if (!tokens?.refresh) return false
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh: tokens.refresh }),
      })
      if (!res.ok) {
        saveTokens(null)
        return false
      }
      const data = await res.json()
      saveTokens({ access: data.access, refresh: data.refresh })
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Called when the session is unrecoverable — wired up by the auth store. */
let onSignedOut: (() => void) | null = null
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn
}

export interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  auth?: boolean // default true
}

export async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, auth = true } = opts

  let url = `${API_BASE}${path}`
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (auth) {
      const access = currentAccess()
      if (access) headers['authorization'] = `Bearer ${access}`
    }
    return fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  }

  let res: Response
  try {
    res = await send()
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }

  if (res.status === 401 && auth) {
    const ok = await refreshOnce()
    if (ok) {
      res = await send()
    } else {
      saveTokens(null)
      onSignedOut?.()
      throw new ApiError(401, 'Your session has expired. Please sign in again.')
    }
  }

  if (res.status === 204) return undefined as T

  let payload: any = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) throw new ApiError(res.status, messageFrom(res.status, payload), payload)
  return payload as T
}

export const api = {
  get: <T = any>(p: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(p, { query, signal }),
  post: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body }),
  put: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body }),
  patch: <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
}
