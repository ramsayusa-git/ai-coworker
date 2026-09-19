'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { api, fetcher, fmtDT } from '@/lib/api';
import { useToast } from '@/components/ui';

export default function IssueThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { show, Toast } = useToast();
  const { data: i, mutate } = useSWR(`/issues/${id}`, fetcher, { refreshInterval: 10000 });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [rating, setRating] = useState(0);
  if (!i) return <div className="text-gray-400">Loading…</div>;
  const done = ['RESOLVED', 'CLOSED'].includes(i.status);
  const send = async () => { setBusy(true); try { await api(`/issues/${id}/messages`, { body: { body: msg } }); setMsg(''); mutate(); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const rate = async (n: number) => { setRating(n); try { await api(`/issues/${id}/rate`, { body: { rating: n } }); mutate(); show('Thanks for the rating'); } catch (e: any) { show(e.message, true); } };
  return <div><Toast />
    <Link href="/shop/issues" className="text-sm underline">← All issues</Link>
    <div className="flex justify-between items-start mt-2"><h1 className="text-lg font-bold">#{i.ticketNo} · {i.title}</h1><span className="badge bg-gray-100">{i.status.replace(/_/g, ' ').toLowerCase()}</span></div>
    <div className="text-xs text-gray-500 mb-3">{fmtDT(i.createdAt)}{i.order ? <> · <Link className="underline" href={`/shop/orders/${i.order.id}`}>order #{i.order.orderNo}</Link></> : ''}{done && i.resolution ? ` · Resolved: ${i.resolution}` : ''}</div>
    {i.description && <div className="card text-sm mb-3">{i.description}{i.photo && <img src={i.photo} alt="" className="mt-2 max-h-56 rounded" />}</div>}
    <div className="space-y-2">{i.messages.map((m: any) => <div key={m.id} className={'text-sm p-3 rounded-lg ' + (m.fromStaff ? 'bg-white border mr-8' : 'bg-leaf-600/10 ml-8')}><div className="text-xs text-gray-500">{m.fromStaff ? 'FreshRice' : 'You'} · {fmtDT(m.createdAt)}</div>{m.body}{m.photo && <img src={m.photo} alt="" className="mt-1 max-h-40 rounded" />}</div>)}</div>
    {!done ? <div className="mt-3 flex gap-2"><input className="input flex-1" placeholder="Add a message" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn-primary" disabled={busy || !msg.trim()} onClick={send}>Send</button></div>
      : !i.rating ? <div className="card mt-3 text-sm"><div className="mb-1">How did we handle this?</div><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={'text-2xl ' + (n <= rating ? '' : 'opacity-30')} onClick={() => rate(n)}>★</button>)}</div></div>
      : <div className="text-sm text-leaf-700 mt-3">You rated this {i.rating}/5. Thank you.</div>}
  </div>;
}
