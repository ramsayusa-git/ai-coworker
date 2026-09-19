'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, fetcher, fmtDT } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, useToast } from '@/components/ui';
import { Suspense } from 'react';

const CATS: [string, string][] = [['WRONG_BAG', 'Wrong bag / variety'], ['LATE', 'Late or not delivered'], ['DAMAGED', 'Damaged bag'], ['MISSING', 'Missing item'], ['PAYMENT', 'Payment / refund'], ['RIDER', 'Rider behaviour'], ['APP', 'App problem'], ['OTHER', 'Something else']];

function IssuesInner() {
  const { user } = useAuth(); const sp = useSearchParams(); const { show, Toast } = useToast();
  const { data, mutate } = useSWR(user ? '/issues' : null, fetcher); const { data: orders } = useSWR(user ? '/orders/mine' : null, fetcher);
  const [f, setF] = useState<any>({ category: 'LATE', title: '', description: '', orderId: sp.get('orderId') || '', photo: '' }); const [busy, setBusy] = useState(false); const [showForm, setShowForm] = useState(!!sp.get('orderId'));
  const pick = (file?: File) => { if (!file) return; if (file.size > 400 * 1024) { show('Photo must be under 400 KB', true); return; } const r = new FileReader(); r.onload = () => setF({ ...f, photo: String(r.result) }); r.readAsDataURL(file); };
  const submit = async () => { setBusy(true); try { await api('/issues', { body: { ...f, orderId: f.orderId || undefined, photo: f.photo || undefined } }); show('Logged — we will get back to you on WhatsApp'); setShowForm(false); setF({ category: 'LATE', title: '', description: '', orderId: '', photo: '' }); mutate(); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  if (!user) return <Link href="/login?next=/shop/issues" className="btn-primary">Login</Link>;
  return <div><Toast />
    <div className="flex justify-between items-center mb-3"><h1 className="text-xl font-bold">Help & issues</h1><button className="btn-primary !py-1" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Report a problem'}</button></div>
    {showForm && <div className="card mb-4 space-y-2">
      <Field label="What went wrong?"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Order (optional)"><select className="input" value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}><option value="">Not about a specific order</option>{orders?.slice(0, 20).map((o: any) => <option key={o.id} value={o.id}>#{o.orderNo} · {o.status} · {fmtDT(o.createdAt)}</option>)}</select></Field>
      <Field label="In one line"><input className="input" maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Bag arrived torn at the corner" /></Field>
      <Field label="Details"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Photo (optional)"><input type="file" accept="image/*" capture="environment" className="text-sm" onChange={(e) => pick(e.target.files?.[0])} />{f.photo && <img src={f.photo} alt="" className="mt-1 h-24 rounded border" />}</Field>
      <button className="btn-primary w-full" disabled={busy || !f.title.trim()} onClick={submit}>{busy ? 'Sending…' : 'Send to FreshRice'}</button>
      <div className="text-xs text-gray-500">You can also WhatsApp us "ISSUE …" from your registered number.</div>
    </div>}
    {data && !data.length && !showForm && <div className="card text-sm text-gray-500 text-center">No issues raised. Hopefully it stays that way.</div>}
    <div className="space-y-2">{data?.map((i: any) => <Link key={i.id} href={`/shop/issues/${i.id}`} className="card block text-sm">
      <div className="flex justify-between"><b>#{i.ticketNo} · {i.title}</b><span className={'badge ' + (['RESOLVED', 'CLOSED'].includes(i.status) ? 'bg-green-100 text-green-700' : i.status === 'WAITING_CUSTOMER' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>{i.status.replace(/_/g, ' ').toLowerCase()}</span></div>
      <div className="text-xs text-gray-500">{fmtDT(i.createdAt)}{i.order ? ` · order #${i.order.orderNo}` : ''}{i.messages?.[0] ? ` · ${i.messages[0].fromStaff ? 'FreshRice: ' : 'You: '}${i.messages[0].body.slice(0, 80)}` : ''}</div>
    </Link>)}</div>
  </div>;
}
export default function Issues() { return <Suspense><IssuesInner /></Suspense>; }
