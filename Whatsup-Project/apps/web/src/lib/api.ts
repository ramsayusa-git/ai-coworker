const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "whatsup_token";
const ME_KEY = "whatsup_me";

export type Me = { userId: string; email: string; name: string; orgId: string; orgName: string; role: string };

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getCachedMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setSession(token: string, me: Me) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ME_KEY, JSON.stringify(me));
  } catch { /* ignore — falls back to re-login */ }
}

export function clearSession() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ME_KEY); } catch { /* ignore */ }
}

export async function login(email: string, password: string): Promise<Me> {
  const res = await fetch(`${API_BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed (${res.status})`);
  }
  const { token, user } = await res.json();
  setSession(token, user);
  return user;
}

export async function register(input: { email: string; password: string; name: string; orgName: string }): Promise<Me> {
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Registration failed (${res.status})`);
  }
  const { token, user } = await res.json();
  setSession(token, user);
  return user;
}

export async function acceptInvite(input: { token: string; password: string; name?: string }): Promise<Me> {
  const res = await fetch(`${API_BASE}/v1/auth/accept-invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not accept invite (${res.status})`);
  }
  const { token, user } = await res.json();
  setSession(token, user);
  return user;
}

export async function acceptPartnerInvite(input: { token: string; password: string; name?: string }) {
  const res = await fetch(`${API_BASE}/v1/auth/accept-partner-invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not accept invite (${res.status})`);
  }
  const { token, user } = await res.json();
  // Partner-team members have no org yet, so we can't populate the normal Me/session shape.
  // Just stash the token; the console reads /partners/mine to figure out where to send them.
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
  return user;
}

export async function getOrgId(): Promise<string> {
  const me = getCachedMe();
  if (me) return me.orgId;
  throw new Error("Not signed in");
}

// For /v1/partners/... routes, which are scoped by :partnerId rather than the cached
// org — used by the Partner Console (multi-vendor/reseller management, white-label).
export async function partnerFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const url = `${API_BASE}/v1${path}`;
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired — please sign in again");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const orgId = await getOrgId();
  const url = `${API_BASE}/v1/orgs/${orgId}${path}`;
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired — please sign in again");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}
