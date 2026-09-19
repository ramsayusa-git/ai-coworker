'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate } from '@/lib/api';
import { RequireRole, useAuth } from '@/lib/auth';
import { StatusBadge, Modal, Field, useToast, Empty } from '@/components/ui';
export default function RiderPage() { return <RequireRole roles={['RIDER']}><Rider /></RequireRole>; }
function Rider() {
  const { user, logout } = useAuth(); const { data, mutate } = useSWR('/rider/manifest', fetcher, { refreshInterval: 15000 }); const { show, Toast } = useToast();
  const [stop, setStop] = useState<any>(null); const [scanFor, setScanFor] = useState<any>(null); const [scanLot, setScanLot] = useState('');
  useEffect(() => { if (!navigator.geolocation) return; const id = setInterval(() => navigator.geolocation.getCurrentPosition((p) => api('/rider/location', { body: { lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => {}), () => {}, { timeout: 5000 }), 30000); return () => clearInterval(id); }, []); const [otp, setOtp] = useState(''); const [photo, setPhoto] = useState(''); const [fail, setFail] = useState('');
  const start = async (id: string) => { try { await api(`/rider/routes/${id}/start`, { method: 'POST' }); mutate(); show('Route started — customers got their OTPs'); } catch (e: any) { show(e.message, true); } };
  const deliver = async () => { try {
    const pos: any = await new Promise((r) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => r(p.coords), () => r(null), { timeout: 3000 }) : r(null));
    const r = await api(`/rider/stops/${stop.id}/deliver`, { body: { otp: otp || undefined, podPhotoUrl: photo || undefined, failReason: fail || undefined, lat: pos?.latitude, lng: pos?.longitude } });
    show(r.status === 'DELIVERED' ? (r.otpVerified ? 'Delivered ✔ OTP verified' : 'Delivered (photo POD)') : 'Marked failed'); setStop(null); setOtp(''); setPhoto(''); setFail(''); mutate(); } catch (e: any) { show(e.message, true); } };
  return <div className="max-w-md mx-auto min-h-screen pb-8"><Toast />
    <header className="bg-gray-900 text-white px-4 py-3 flex justify-between items-center"><b>🛵 Rider · {user.name}</b><button className="text-xs underline" onClick={logout}>Logout</button></header>
    <main className="p-3">{data && !data.length && <Empty text="No routes assigned. Check with ops." />}
      {data?.map((r: any) => <div key={r.id} className="card mb-3"><div className="flex justify-between items-center"><div><b>{r.zone.name}</b> · {fmtDate(r.date)}<div className="text-xs text-gray-500">{r.vehicleType.replace('_', ' ')} · {r.loadKg} kg · {r.stops.length} stops</div></div><StatusBadge s={r.status} /></div>
        {r.status === 'PUBLISHED' && <button className="btn-primary w-full mt-2" onClick={() => start(r.id)}>Start route (load {r.loadKg} kg)</button>}
        <div className="mt-3 space-y-2">{r.stops.map((s: any) => <div key={s.id} className={'border rounded-lg p-2 text-sm ' + (s.status === 'DELIVERED' ? 'bg-green-50 opacity-70' : s.status === 'FAILED' ? 'bg-red-50' : '')}>
          <div className="flex justify-between"><b>#{s.seq} · Order {s.order.orderNo}</b><StatusBadge s={s.status} /></div>
          <div>{s.order.address.line1}{s.order.address.complex ? ', ' + s.order.address.complex : ''}{s.order.address.landmark ? ' (' + s.order.address.landmark + ')' : ''} · Floor {s.order.address.floor}{s.order.address.hasLift ? '' : ' · NO LIFT'}</div>
          <div className="text-xs text-gray-600">{s.order.items.map((i: any) => `${i.qty}× ${i.sku.variety.name} ${i.sku.packKg}kg [${i.lot?.lotNo || '-'}]`).join(', ')} · {s.order.totalKg} kg</div>
          <div className="text-xs mt-1">{s.order.payment?.method === 'COD' && s.order.payment.status !== 'PAID' ? <b className="text-amber-700">Collect {paise(s.order.totalPaise)} cash/UPI</b> : <span className="text-green-700">Prepaid</span>} · <a className="underline" href={'tel:' + s.order.user.phone}>{s.order.user.name || 'Call'}</a>{s.order.address.lat && <> · <a className="underline" target="_blank" href={`https://maps.google.com/?q=${s.order.address.lat},${s.order.address.lng}`}>Navigate</a></>}</div>
          {r.status !== 'COMPLETED' && s.status === 'PENDING' && !s.loadedAt && <button className="btn-secondary w-full mt-2 !py-1.5" onClick={() => { setScanFor(s); setScanLot(''); }}>Scan bag to load</button>}{s.loadedAt && s.status === 'PENDING' && <div className="text-xs text-green-700 mt-1">✔ Loaded</div>}{r.status === 'IN_PROGRESS' && s.status === 'PENDING' && <button className="btn-primary w-full mt-2 !py-1.5" onClick={() => setStop(s)}>Deliver</button>}</div>)}</div></div>)}</main>
    <Modal title={scanFor ? `Load bag for order #${scanFor.order.orderNo}` : ''} open={!!scanFor} onClose={() => setScanFor(null)}><div className="space-y-2"><Field label="Scan / type lot number from the bag QR"><input className="input font-mono" autoFocus value={scanLot} onChange={(e) => setScanLot(e.target.value.split('|')[0])} /></Field><button className="btn-primary w-full" onClick={async () => { try { await api(`/rider/stops/${scanFor.id}/scan`, { body: { lotNo: scanLot } }); show('Loaded ✔'); setScanFor(null); mutate(); } catch (e: any) { show(e.message, true); } }}>Confirm</button></div></Modal>
    <Modal title={stop ? `Deliver order #${stop.order.orderNo}` : ''} open={!!stop} onClose={() => setStop(null)}><div className="space-y-3">
      <Field label="Customer OTP (4 digits)"><input className="input text-center text-2xl tracking-widest" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value)} /></Field>
      <div className="text-center text-xs text-gray-500">— or —</div>
      <Field label="Photo at door"><input type="file" accept="image/*" capture="environment" className="input" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const rd = new FileReader(); rd.onload = () => setPhoto('data:' + f.type + ';base64,' + btoa(String(rd.result)).slice(0, 40) + '…(stored)'); rd.readAsBinaryString(f); } }} />{photo && <div className="text-xs text-green-700">Photo attached</div>}</Field>
      <button className="btn-primary w-full" disabled={!otp && !photo} onClick={deliver}>Confirm delivered</button>
      <Field label="Could not deliver — reason"><select className="input" value={fail} onChange={(e) => setFail(e.target.value)}><option value="">—</option><option>Customer not available</option><option>Wrong address</option><option>Refused</option></select></Field>
      {fail && <button className="btn-danger w-full" onClick={deliver}>Mark failed</button>}</div></Modal></div>;
}
