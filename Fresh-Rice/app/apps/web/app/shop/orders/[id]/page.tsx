'use client';
import { use, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, fmtDT, API, getToken } from '@/lib/api';
import { StatusBadge, Field } from '@/components/ui';
import { LiveMap, timeAgo, wa } from '@/components/live-map';
const STEPS = ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export default function Order({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const sp = useSearchParams(); useEffect(() => { if (sp.get('placed')) { confetti({ particleCount: 140, spread: 70, origin: { y: 0.3 }, colors: ['#2e7d4f', '#b8862b', '#fbf8f1'] }); } }, []); const { data: o, mutate } = useSWR('/orders/' + id, fetcher, { refreshInterval: 10000 }); const { data: loc } = useSWR(o?.status === 'OUT_FOR_DELIVERY' ? `/orders/${id}/rider-location` : null, fetcher, { refreshInterval: 15000 }); const [score, setScore] = useState(9); const [rated, setRated] = useState(false); const [sent, setSent] = useState('');
  if (!o) return <div className="text-gray-400">Loading…</div>;
  const idx = STEPS.indexOf(o.status);
  return <div><div className="flex justify-between items-center"><h1 className="text-xl font-bold">Order #{o.orderNo}</h1><StatusBadge s={o.status} /></div>
    <div className="card mt-3"><div className="flex justify-between text-xs">{STEPS.map((s, i) => <div key={s} className={'flex-1 text-center ' + (i <= idx ? 'text-leaf-700 font-semibold' : 'text-gray-400')}><div className="h-2 rounded mx-1 mb-1 bg-gray-200 overflow-hidden"><motion.div className="h-full bg-leaf-600" initial={{ width: 0 }} animate={{ width: i <= idx ? '100%' : '0%' }} transition={{ delay: i * 0.25, duration: 0.5 }} /></div>{s.replace(/_/g, ' ')}</div>)}</div>{o.status === 'OUT_FOR_DELIVERY' && <motion.div className="text-2xl mt-1" animate={{ x: ['0%', '85%'] }} transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}>🛺</motion.div>}
      {o.stop?.route?.rider && o.status === 'OUT_FOR_DELIVERY' && <div className="mt-3 text-sm">🛵 Rider <b>{o.stop.route.rider.name}</b> · <a className="underline" href={'tel:' + o.stop.route.rider.phone}>{o.stop.route.rider.phone}</a> · <a className="underline" target="_blank" href={wa(o.stop.route.rider.phone)}>WhatsApp</a> · stop {o.stop.seq} on route{loc && <> · seen {timeAgo(loc.at)}</>}
        {loc && <LiveMap className="mt-2" height={260} fitOnChange markers={[{ id: 'rider', lat: loc.lat, lng: loc.lng, kind: 'rider', label: `${o.stop.route.rider.name} (rider)`, sub: `${o.stop.route.rider.phone} · ${timeAgo(loc.at)}` }, ...(loc.dest?.lat ? [{ id: 'home', lat: loc.dest.lat, lng: loc.dest.lng, kind: 'dest' as const, label: 'Your address' }] : [])]} />}
        {!loc && <div className="text-xs text-gray-500 mt-1">Waiting for the rider's first location ping…</div>}</div>}
      <div className="text-sm mt-2">Delivery {fmtDate(o.deliveryDate)} {o.slot?.label || ''}</div></div>
    <div className="card mt-3 text-sm">{o.items.map((i: any) => <div key={i.id} className="py-1 border-b last:border-0"><div className="flex justify-between"><span>{i.qty}× {i.sku.variety.name} {i.sku.packKg}kg</span><span>{paise(i.unitPaise * i.qty)}</span></div>{i.lot && <div className="text-xs text-gray-500">Lot {i.lot.lotNo} · {i.lot.vendor?.name} · milled {fmtDate(i.lot.milledOn)}</div>}</div>)}
      <div className="flex justify-between mt-2"><span>GST</span><span>{paise(o.gstPaise)}</span></div>{o.discountPaise > 0 && <div className="flex justify-between"><span>Wallet</span><span>-{paise(o.discountPaise)}</span></div>}<div className="flex justify-between font-bold"><span>Total</span><span>{paise(o.totalPaise)}</span></div>
      <div className="text-xs text-gray-500 mt-1">{o.payment?.method} · {o.payment?.status}</div></div>
    <div className="flex gap-2 mt-3">{['CONFIRMED', 'PENDING_PAYMENT'].includes(o.status) && <button className="btn-danger" onClick={async () => { await api(`/orders/${id}/cancel`, { method: 'POST' }); mutate(); }}>Cancel order</button>}
      {['DELIVERED', 'OUT_FOR_DELIVERY', 'PACKED', 'CONFIRMED'].includes(o.status) && <><a className="btn-secondary" target="_blank" href={`${API}/v1/orders/${id}/invoice.html?t=${getToken()}`}>Invoice</a>
        <button className="btn-secondary" onClick={async () => { try { const r = await api(`/orders/${id}/invoice/resend`, { body: {} }); setSent(`Invoice ${r.invoiceNo} sent — WhatsApp: ${r.results.whatsapp || '-'}${r.results.email ? ` · email: ${r.results.email}` : ''}`); } catch (e: any) { setSent(e.message); } }}>Resend invoice</button></>}</div>
    {sent && <div className="text-xs text-leaf-700 mt-1">{sent}</div>}
    {o.status === 'DELIVERED' && !rated && !o.events?.some((e: any) => e.type === 'RATED') && <div className="card mt-3"><Field label="How likely are you to recommend us? (0–10)"><input type="range" min={0} max={10} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-full" /></Field><div className="flex justify-between items-center"><b>{score}</b><button className="btn-primary" onClick={async () => { await api(`/orders/${id}/rate`, { body: { score } }); setRated(true); }}>Submit</button></div></div>}
    <div className="mt-4 text-xs text-gray-500">{o.events?.map((e: any) => <div key={e.id}>{fmtDT(e.at)} · {e.type}</div>)}</div></div>;
}
