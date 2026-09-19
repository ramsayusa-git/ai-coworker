'use client';
export const API = process.env.NEXT_PUBLIC_API_URL || '';
export const paise = (p?: number | null) => '₹' + ((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-');
export const fmtDT = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const ymd = (d: Date) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10); };
export const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); };

export function getToken() { try { return localStorage.getItem('fr_token'); } catch { return null; } }
export function setSession(token: string | null, user: any) { try { token ? localStorage.setItem('fr_token', token) : localStorage.removeItem('fr_token'); user ? localStorage.setItem('fr_user', JSON.stringify(user)) : localStorage.removeItem('fr_user'); } catch {} }
export function getUser(): any { try { const u = localStorage.getItem('fr_user'); return u ? JSON.parse(u) : null; } catch { return null; } }

export class ApiError extends Error {
  status: number; network: boolean;
  constructor(msg: string, status = 0, network = false) { super(msg); this.name = 'ApiError'; this.status = status; this.network = network; }
}
export async function api<T = any>(path: string, opts: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken(); if (t) headers['Authorization'] = 'Bearer ' + t;
  let res: Response;
  try {
    res = await fetch(API + '/v1' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch (e: any) {
    // fetch() only rejects on network failure (server down / restarting / offline). Never treat this as an auth failure.
    throw new ApiError('Cannot reach server — retrying…', 0, true);
  }
  const text = await res.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || res.statusText || `HTTP ${res.status}`; throw new ApiError(msg, res.status); }
  return data as T;
}
export const fetcher = (p: string) => api(p);
