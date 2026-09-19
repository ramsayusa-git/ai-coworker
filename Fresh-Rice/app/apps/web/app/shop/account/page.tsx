'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AddressForm } from '@/components/address-form';
import { useCart } from '@/lib/cart';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Household rice meter: how much of the last bag is left, when it runs out, one-tap reorder. */
function RiceMeter({ user, refresh }: { user: any; refresh: () => void }) {
  const { data: m, mutate } = useSWR('/orders/rice-meter', fetcher); const { add } = useCart(); const router = useRouter();
  const [size, setSize] = useState<string>(user.householdSize ? String(user.householdSize) : '');
  const saveSize = async (v: string) => { setSize(v); if (!v) return; await api('/auth/me', { method: 'PATCH', body: { householdSize: Number(v) } }); refresh(); mutate(); };
  const sizeRow = <div className="flex items-center gap-2 text-sm mt-2"><span className="text-gray-600">People at home</span><select className="input inline w-auto" value={size} onChange={(e) => saveSize(e.target.value)}><option value="">—</option>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>;
  if (!m) return null;
  if (!m.hasHistory) return <div className="card mb-3"><div className="font-semibold">Rice meter</div><div className="text-xs text-gray-500">After your first delivery we'll show how much is left and when to reorder.</div>{sizeRow}</div>;
  const pct = Math.max(0, Math.min(100, m.pctLeft));
  const reorder = () => { if (m.suggested) { add({ skuId: m.suggested.skuId, code: m.suggested.code, name: m.suggested.name, packKg: m.suggested.packKg, pricePaise: m.suggested.pricePaise, gstPct: m.suggested.gstPct }, m.suggested.qty); } router.push('/shop/cart'); };
  return <div className="card mb-3">
    <div className="flex justify-between items-baseline"><div className="font-semibold">Rice meter</div><div className={`text-sm font-semibold ${m.reorderSoon ? 'text-amber-700' : 'text-leaf-700'}`}>{m.daysLeft === 0 ? 'Probably out' : `~${m.daysLeft} days left`}</div></div>
    <div className="h-3 rounded-full bg-rice-100 overflow-hidden mt-2"><div className={`h-full rounded-full ${pct < 25 ? 'bg-amber-500' : 'bg-leaf-600'}`} style={{ width: pct + '%' }} /></div>
    <div className="text-xs text-gray-600 mt-1">About <b>{m.kgLeft} kg</b> of your last {m.lastKg} kg bag left · runs out around <b>{fmtDate(m.runsOutOn)}</b> · you use ~{m.dailyKg} kg/day{m.basis === 'measured' ? ' (from your order history)' : m.basis === 'household' ? ' (from household size)' : ' (typical family — set household size for a better guess)'}</div>
    {sizeRow}
    {m.suggested && <button className={`w-full mt-3 ${m.reorderSoon ? 'btn-primary' : 'btn-secondary'}`} onClick={reorder}>Reorder {m.suggested.qty} × {m.suggested.name} {m.suggested.packKg} kg</button>}
  </div>;
}

export default function Account() {
  const { user, logout, refresh } = useAuth(); const { data: addrs, mutate } = useSWR(user ? '/addresses' : null, fetcher); const [add, setAdd] = useState(false); const { data: ref } = useSWR(user ? '/auth/referrals/mine' : null, fetcher, { refreshInterval: 20000 });
  const [email, setEmail] = useState(''); const [emailSaved, setEmailSaved] = useState(false);
  if (!user) return <Link href="/login" className="btn-primary">Login</Link>;
  return <div><h1 className="text-xl font-bold mb-3">Account</h1>
    {user.role === 'CUSTOMER' && <RiceMeter user={user} refresh={refresh} />}
    <div className="card mb-3"><div className="font-semibold">{user.name || 'Set your name'}</div><div className="text-sm text-gray-600">{user.phone}</div><div className="text-sm mt-2">Wallet: <b>{paise(user.walletBalance)}</b></div>
      <div className="mt-3 flex gap-2 items-center text-sm"><input className="input flex-1" type="email" placeholder="Email (get OTP + order updates by email too)" defaultValue={user.email || ''} onChange={(e) => { setEmail(e.target.value); setEmailSaved(false); }} />
        <button className="btn-secondary !py-1" onClick={async () => { await api('/auth/me', { method: 'PATCH', body: { email: email || user.email || '' } }); setEmailSaved(true); refresh(); }}>Save</button></div>
      {emailSaved && <div className="text-xs text-leaf-700 mt-1">Saved</div>}
      <div className="mt-3 bg-rice-100 rounded-lg p-3 text-sm"><div className="flex justify-between items-center"><span>Refer a neighbour · code <b className="font-mono">{user.referralCode}</b></span><a className="btn-primary !py-1" target="_blank" href={`https://wa.me/?text=${encodeURIComponent(ref?.shareText || `Use my FreshRice code ${user.referralCode} for ₹100 off`)}`}>Share on WhatsApp</a></div>
        <div className="text-xs text-gray-600 mt-1">They get ₹100 off their first bag; you get ₹100 in your wallet the moment it's delivered.</div>
        {ref && <div className="grid grid-cols-3 gap-2 mt-2 text-center"><div className="bg-white rounded p-2"><div className="text-lg font-bold">{ref.invited}</div><div className="text-xs text-gray-500">signed up</div></div><div className="bg-white rounded p-2"><div className="text-lg font-bold">{ref.converted}</div><div className="text-xs text-gray-500">delivered</div></div><div className="bg-white rounded p-2"><div className="text-lg font-bold">{paise(ref.earnedPaise)}</div><div className="text-xs text-gray-500">earned</div></div></div>}
        {ref?.list?.length > 0 && <div className="mt-2 text-xs">{ref.list.slice(0, 5).map((r: any, i: number) => <div key={i} className="flex justify-between border-t border-rice-500/20 py-1"><span>{r.name}</span><span className={r.status === 'delivered' ? 'text-leaf-700' : 'text-gray-500'}>{r.status}</span></div>)}</div>}</div>
      <div className="mt-3 flex gap-2 text-sm"><label>Language <select className="input inline w-auto ml-1" value={user.lang} onChange={async (e) => { await api('/auth/me', { method: 'PATCH', body: { lang: e.target.value } }); refresh(); }}><option value="te">తెలుగు</option><option value="hi">हिन्दी</option><option value="en">English</option></select></label></div></div>
    <div className="card mb-3"><div className="font-semibold mb-2">Addresses</div>{addrs?.map((a: any) => <div key={a.id} className="text-sm py-1 border-b last:border-0 flex justify-between"><span>{a.line1}{a.complex ? ', ' + a.complex : ''} · {a.pincode}</span><button className="text-red-600 text-xs" onClick={async () => { await api('/addresses/' + a.id, { method: 'DELETE' }); mutate(); }}>remove</button></div>)}
      {add ? <div className="mt-2"><AddressForm onSaved={() => { mutate(); setAdd(false); }} /></div> : <button className="btn-secondary mt-2" onClick={() => setAdd(true)}>+ Add</button>}</div>
    {['ADMIN', 'OPS'].includes(user.role) && <Link href="/admin" className="btn-secondary w-full mb-2">Open admin console</Link>}
    {user.role === 'RIDER' && <Link href="/rider" className="btn-secondary w-full mb-2">Open rider app</Link>}
    <Link href="/shop/riders" className="btn-secondary w-full mb-2">🛵 Riders on the road (live map)</Link>
    {user.b2bAccountId && <Link href="/b2b" className="btn-secondary w-full mb-2">Business portal</Link>}
    <button className="btn-secondary w-full" onClick={logout}>Log out</button></div>;
}
