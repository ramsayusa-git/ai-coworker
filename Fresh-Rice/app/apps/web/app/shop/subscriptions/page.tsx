'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, tomorrow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatusBadge, Modal, Field, useToast } from '@/components/ui';
export default function Subs() {
  const { user } = useAuth(); const { data, mutate } = useSWR(user ? '/subscriptions/mine' : null, fetcher); const { data: cat } = useSWR('/catalog', fetcher); const { data: addrs } = useSWR(user ? '/addresses' : null, fetcher);
  const [open, setOpen] = useState(false); const [f, setF] = useState<any>({ skuId: '', addressId: '', qty: 1, frequency: 'TRIWEEKLY', firstDeliveryOn: tomorrow() }); const { show, Toast } = useToast();
  if (!user) return <Link href="/login?next=/shop/subscriptions" className="btn-primary">Login</Link>;
  const act = async (id: string, action: string) => { try { await api('/subscriptions/' + id, { method: 'PATCH', body: { action } }); mutate(); show('Updated'); } catch (e: any) { show(e.message, true); } };
  const create = async () => { try { await api('/subscriptions', { body: f }); mutate(); setOpen(false); show('Subscription created'); } catch (e: any) { show(e.message, true); } };
  const skus = cat?.items?.filter((v: any) => !v.isAddon).flatMap((v: any) => v.skus.map((s: any) => ({ ...s, name: v.name }))) || [];
  return <div><Toast /><div className="flex justify-between items-center mb-3"><h1 className="text-xl font-bold">Subscriptions</h1><button className="btn-primary" onClick={() => setOpen(true)}>+ New</button></div>
    <p className="text-sm text-gray-600 mb-3">Set & forget. We message you the evening before each delivery — reply SKIP to skip.</p>
    {data?.map((s: any) => <div key={s.id} className="card mb-2"><div className="flex justify-between"><b>{s.qty}× {s.sku.variety.name} {s.sku.packKg}kg</b><StatusBadge s={s.status} /></div><div className="text-sm text-gray-600">Every {({ WEEKLY: 'week', BIWEEKLY: '2 weeks', TRIWEEKLY: '3 weeks', MONTHLY: 'month' } as Record<string, string>)[s.frequency]} · next {fmtDate(s.nextRunOn)}{s.skipNext && ' (skipping)'} · {s.address.line1}</div>
      <div className="flex gap-2 mt-2 text-xs">{s.status === 'ACTIVE' && <><button className="btn-secondary !py-1" onClick={() => act(s.id, 'skip')}>Skip next</button><button className="btn-secondary !py-1" onClick={() => act(s.id, 'pause')}>Pause</button></>}{s.status === 'PAUSED' && <button className="btn-secondary !py-1" onClick={() => act(s.id, 'resume')}>Resume</button>}<button className="btn-secondary !py-1 text-red-600" onClick={() => act(s.id, 'cancel')}>Cancel</button></div></div>)}
    <Modal title="New subscription" open={open} onClose={() => setOpen(false)}><div className="space-y-2">
      <Field label="Product"><select className="input" value={f.skuId} onChange={(e) => setF({ ...f, skuId: e.target.value })}><option value="">Select</option>{skus.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.packKg}kg — {paise(s.pricePaise)}</option>)}</select></Field>
      <Field label="Address"><select className="input" value={f.addressId} onChange={(e) => setF({ ...f, addressId: e.target.value })}><option value="">Select</option>{addrs?.map((a: any) => <option key={a.id} value={a.id}>{a.line1} · {a.pincode}</option>)}</select></Field>
      <div className="grid grid-cols-3 gap-2"><Field label="Qty"><input type="number" min={1} className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field><Field label="Every"><select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="WEEKLY">Week</option><option value="BIWEEKLY">2 weeks</option><option value="TRIWEEKLY">3 weeks</option><option value="MONTHLY">Month</option></select></Field><Field label="First delivery"><input type="date" className="input" min={tomorrow()} value={f.firstDeliveryOn} onChange={(e) => setF({ ...f, firstDeliveryOn: e.target.value })} /></Field></div>
      <p className="text-xs text-gray-500">Payment via UPI AutoPay mandate (mock in pilot). You're notified 24 h before each charge.</p>
      <button className="btn-primary w-full" disabled={!f.skuId || !f.addressId} onClick={create}>Start subscription</button></div></Modal></div>;
}
