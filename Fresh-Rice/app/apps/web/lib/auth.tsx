'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser, setSession, getToken } from './api';
type Ctx = { user: any; loading: boolean; login: (token: string, user: any) => void; logout: () => void; refresh: () => Promise<void> };
const C = createContext<Ctx>({ user: null, loading: true, login: () => {}, logout: () => {}, refresh: async () => {} });
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null); const [loading, setLoading] = useState(true);
  const refresh = async () => { if (!getToken()) { setUser(null); setLoading(false); return; } try { const me = await api('/auth/me'); setUser(me); setSession(getToken(), me); } catch { setSession(null, null); setUser(null); } finally { setLoading(false); } };
  useEffect(() => { setUser(getUser()); refresh(); }, []);
  return <C.Provider value={{ user, loading, login: (t, u) => { setSession(t, u); setUser(u); refresh(); }, logout: () => { setSession(null, null); setUser(null); }, refresh }}>{children}</C.Provider>;
}
export const useAuth = () => useContext(C);
export function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, loading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading && (!user || !roles.includes(user.role))) router.replace('/login?next=' + encodeURIComponent(location.pathname)); }, [user, loading]);
  if (loading || !user || !roles.includes(user.role)) return <div className="p-8 text-center text-gray-500">Checking access…</div>;
  return <>{children}</>;
}
