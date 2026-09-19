'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, fetcher } from '@/lib/api';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
function LoginInner() {
  const sp0 = useSearchParams(); const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [referral, setReferral] = useState(sp0.get('referral') || ''); const { data: refCheck } = useSWR(referral.length >= 6 ? '/auth/referrals/check?code=' + referral : null, fetcher);
  const [step, setStep] = useState<1 | 2>(1); const [err, setErr] = useState(''); const [devOtp, setDevOtp] = useState('');
  const { login } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const request = async () => { setErr(''); try { const r = await api('/auth/otp/request', { body: { phone } }); if (r.devOtp) { setDevOtp(r.devOtp); setCode(r.devOtp); } setStep(2); } catch (e: any) { setErr(e.message); } };
  const verify = async () => { setErr(''); try { const r = await api('/auth/otp/verify', { body: { phone, code, name: name || undefined, referral: referral || undefined } }); login(r.token, r.user);
    const next = sp.get('next');
    const adminRoles = ['ADMIN', 'OPS', 'MARKETING', 'SALES'];
    const home = adminRoles.includes(r.user.role) ? '/admin' : r.user.role === 'RIDER' ? '/rider' : r.user.role === 'B2B_USER' ? '/b2b' : r.user.role === 'VENDOR_USER' ? '/vendor' : r.user.role === 'WAREHOUSE_STAFF' ? '/warehouse' : '/shop';
    router.replace(next || home); } catch (e: any) { setErr(e.message); } };
  return <main className="min-h-screen flex items-center justify-center p-4 hero-bg"><motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} className="card w-full max-w-sm">
    <h1 className="text-xl font-bold">🌾 FreshRice</h1><p className="text-sm text-gray-500 mb-4">Login with your mobile number</p>
    {step === 1 ? <><label className="label">Mobile</label><input className="input" placeholder="98480 12345" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      <label className="label mt-3">Name (new customers)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="label mt-3">Referral code (optional)</label><input className="input" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />{refCheck?.valid && <div className="text-xs text-leaf-700 mt-1">✓ Referred by {refCheck.referrer} — ₹100 off your first bag</div>}{refCheck && !refCheck.valid && <div className="text-xs text-red-600 mt-1">Code not found</div>}
      <button className="btn-primary w-full mt-4" onClick={request} disabled={phone.replace(/\D/g, '').length < 10}>Send OTP</button></>
    : <><label className="label">OTP sent to {phone}</label><input className="input text-center tracking-widest text-lg" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} inputMode="numeric" />
      {devOtp && <div className="text-xs text-amber-700 mt-1">Dev mode: OTP is {devOtp}</div>}
      <button className="btn-primary w-full mt-4" onClick={verify}>Verify & continue</button><button className="btn-secondary w-full mt-2" onClick={() => setStep(1)}>Change number</button></>}
    {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
    <div className="text-xs text-gray-400 mt-5">Test accounts: admin 9000000001 · rider 9000000002 · customer 9000000003 · B2B 9000000004</div></motion.div></main>;
}
export default function Login() { return <Suspense><LoginInner /></Suspense>; }
