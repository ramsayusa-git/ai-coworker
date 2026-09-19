'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function OwnerLogin() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const { login } = useAuth(); const router = useRouter();
  const submit = async () => {
    setErr(''); setBusy(true);
    try { const r = await api('/auth/admin-login', { body: { email, password } }); login(r.token, r.user); router.replace('/admin'); }
    catch (e: any) { setErr(e.message || 'Login failed'); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen flex items-center justify-center p-4 hero-bg">
    <div className="card w-full max-w-sm">
      <h1 className="text-xl font-bold">🌾 FreshRice — Owner login</h1>
      <p className="text-sm text-gray-500 mb-4">Backend login for the account owner</p>
      <label className="label">Email</label>
      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <label className="label mt-3">Password</label>
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <button className="btn-primary w-full mt-4" onClick={submit} disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
    </div>
  </main>;
}
