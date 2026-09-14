const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "whatsup_token";
const REFRESH_KEY = "whatsup_refresh";
const ME_KEY = "whatsup_me";

export type Brand = {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string | null;
  primaryColor: string;
};
export const DEFAULT_BRAND: Brand = {
  brandName: "Loqio", logoUrl: null, faviconUrl: null, footerText: null, primaryColor: "#059669",
};

export type Me = { userId: string; email: string; name: string; orgId: string; orgName: string; role: string; brand?: Brand };

// White-label lookup used before login (login/register/accept-invite pages) and to set the
// browser tab favicon early. Never throws — always falls back to the platform default brand.
export async function getPublicBranding(): Promise<Brand> {
  try {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const res = await fetch(`${API_BASE}/v1/public/branding?host=${encodeURIComponent(host)}`);
    if (!res.ok) return DEFAULT_BRAND;
    const brand = await res.json();
    return { ...DEFAULT_BRAND, ...brand };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}

export function getCachedMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setSession(token: string, me: Me, refreshToken?: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ME_KEY, JSON.stringify(me));
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch { /* ignore — falls back to re-login */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ME_KEY);
  } catch { /* ignore */ }
}

export async function logout() {
  const refreshToken = getRefreshToken();
  clearSession();
  if (refreshToken) {
    // Best-effort — revokes the refresh token server-side so a captured copy can't be replayed.
    fetch(`${API_BASE}/v1/auth/logout`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken }),
    }).catch(() => { /* ignore — session is already cleared client-side */ });
  }
}

// Access tokens are short-lived (15m). Called automatically by apiFetch on a 401; returns
// true if a new access token was obtained (and stored), false if the refresh token itself
// is invalid/expired/reused — in which case the caller falls back to a full re-login.
let refreshInFlight: Promise<boolean> | null = null;
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const { token, refreshToken: nextRefresh, user } = await res.json();
      setSession(token, user, nextRefresh);
      return true;
    } catch { return false; }
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
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
  const { token, refreshToken, user } = await res.json();
  setSession(token, user, refreshToken);
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
  const { token, refreshToken, user } = await res.json();
  setSession(token, user, refreshToken);
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
  const { token, refreshToken, user } = await res.json();
  setSession(token, user, refreshToken);
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
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Session expired — please sign in again");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function apiFetch(path: string, init?: RequestInit, _retried = false): Promise<any> {
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
    // Access token expired (they last 15m) rather than the session being invalid — try a
    // silent refresh once before forcing a full re-login.
    if (!_retried && (await refreshAccessToken())) {
      return apiFetch(path, init, true);
    }
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Session expired — please sign in again");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}
