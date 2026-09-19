'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDT, ymd } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Modal, Field, useToast, Empty } from '@/components/ui';
import { LiveMap, timeAgo, wa, type MapMarker } from '@/components/live-map';

const hrs = (from: string | Date) => Math.round(((Date.now() - new Date(from).getTime()) / 36e5) * 10) / 10;

function HoursReport() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 6 * 86400000))); const [to, setTo] = useState(ymd(new Date()));
  const { data } = useSWR(`/admin/shifts?from=${from}&to=${to}`, fetcher);
  const csv = () => { const rows = [['Name', 'Phone', 'Role', 'Days', 'Shifts', 'Hours', 'Avg h/day', 'First in', 'Last out', 'Auto-closed'], ...(data || []).map((r: any) => [r.name, r.phone, r.role, r.days, r.shifts, r.hours, r.avgHoursPerDay, fmtDT(r.firstIn), r.openNow ? 'on duty' : fmtDT(r.lastOut), r.autoClosed])]; const blob = new Blob([rows.map((r) => r.map((c: any) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `working-hours-${from}-to-${to}.csv`; a.click(); };
  return <div className="card mt-6">
    <div className="flex flex-wrap justify-between items-center gap-2 mb-2"><div><b>Working hours</b><div className="text-xs text-gray-500">From clock-in / clock-out in the mobile app. Shifts left open are auto-closed after 16h and flagged.</div></div>
      <div className="flex gap-2 items-center text-sm"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /><span>→</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /><button className="btn-secondary" onClick={csv} disabled={!data?.length}>CSV</button></div></div>
    {data && !data.length && <Empty text="No shifts in this range" />}
    {data?.length > 0 && <div className="overflow-auto"><table className="tbl"><thead><tr><th>Person</th><th>Role</th><th>Days</th><th>Shifts</th><th>Hours</th><th>Avg / day</th><th>First in</th><th>Last out</th><th></th></tr></thead><tbody>
      {data.map((r: any) => <tr key={r.userId}><td><b>{r.name}</b><div className="text-xs text-gray-500">{r.phone}</div></td><td><span className="badge bg-gray-100">{r.role}</span></td><td>{r.days}</td><td>{r.shifts}</td><td><b>{r.hours}</b></td><td>{r.avgHoursPerDay}</td><td className="text-xs">{fmtDT(r.firstIn)}</td><td className="text-xs">{r.openNow ? <span className="text-green-700">on duty now</span> : fmtDT(r.lastOut)}</td><td className="text-xs text-amber-700">{r.autoClosed > 0 && `${r.autoClosed} auto-closed`}</td></tr>)}
    </tbody></table></div>}
  </div>;
}

export default function FieldLive() {
  const { user } = useAuth(); const canEdit = ['ADMIN', 'OPS'].includes(user?.role);
  const { data: live, mutate } = useSWR('/admin/dispatch/live', fetcher, { refreshInterval: 10000 });
  const { show, Toast } = useToast();
  const [add, setAdd] = useState(false); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [filter, setFilter] = useState<'all' | 'rider' | 'field' | 'duty'>('all');
  const rows = useMemo(() => (live || []).filter((r: any) => filter === 'all' || (filter === 'duty' ? r.onDuty || r.route : r.kind === filter)), [live, filter]);
  const markers: MapMarker[] = useMemo(() => rows.filter((r: any) => r.loc).map((r: any) => ({ id: r.id, lat: r.loc.lat, lng: r.loc.lng, kind: r.kind === 'field' ? 'me' : r.online ? 'rider' : 'rider-stale', label: `${r.name || r.phone}${r.kind === 'field' ? ` (${r.role.toLowerCase()})` : ''}`, sub: `${r.phone} · ${r.route ? `${r.route.zone} · ${r.route.delivered}/${r.route.stops} delivered` : r.onDuty ? `on duty ${hrs(r.dutySince)}h` : 'off duty'} · ${timeAgo(r.loc.at)}` })), [rows]);
  const counts = { riders: (live || []).filter((r: any) => r.kind === 'rider').length, field: (live || []).filter((r: any) => r.kind === 'field').length, online: (live || []).filter((r: any) => r.online).length, duty: (live || []).filter((r: any) => r.onDuty || r.route).length };
  const addRider = async () => { try { await api('/admin/riders', { body: { name, phone } }); setAdd(false); setName(''); setPhone(''); mutate(); show('Rider added — they log in to the mobile app with this number (OTP)'); } catch (e: any) { show(e.message, true); } };
  const toggle = async (r: any) => { try { if (r.kind === 'rider') await api(`/admin/riders/${r.id}`, { method: 'PATCH', body: { active: !r.active } }); else await api(`/admin/staff/${r.id}`, { method: 'PATCH', body: { active: !r.active } }); mutate(); } catch (e: any) { show(e.message, true); } };
  return <div><Toast />
    <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
      <div><h1 className="text-2xl font-bold">Riders & field team · live</h1><div className="text-sm text-gray-500">{counts.riders} riders · {counts.field} field staff · <b className="text-leaf-700">{counts.online} online</b> · {counts.duty} on duty · refreshes every 10s</div></div>
      <div className="flex gap-2 items-center flex-wrap">
        {(['all', 'rider', 'field', 'duty'] as const).map((f) => <button key={f} className={'btn-secondary !py-1 ' + (filter === f ? '!bg-leaf-600 !text-white' : '')} onClick={() => setFilter(f)}>{f === 'all' ? 'Everyone' : f === 'rider' ? 'Riders' : f === 'field' ? 'Field staff' : 'On duty'}</button>)}
        {canEdit && <button className="btn-primary" onClick={() => setAdd(true)}>+ Add rider</button>}</div>
    </div>
    <LiveMap markers={markers} height={380} className="mb-4" />
    <div className="text-xs text-gray-500 mb-2">🛵 green = rider live · grey = rider stale · 🔵 = field staff. Field staff are added from <a className="underline" href="/admin/team">Team</a> with the "Field team" flag.</div>
    {!rows.length && <Empty text="Nobody to show" />}
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Person</th><th>Phone</th><th>Status</th><th>Duty</th><th>Route</th><th>Last seen</th><th>Location</th>{canEdit && <th></th>}</tr></thead><tbody>
      {rows.map((r: any) => <tr key={r.id} className={!r.active ? 'opacity-50' : ''}>
        <td><b>{r.name || '—'}</b> <span className="badge bg-gray-100 ml-1">{r.kind === 'rider' ? 'RIDER' : r.role}</span>{!r.active && <span className="badge bg-gray-100 text-gray-600 ml-1">deactivated</span>}</td>
        <td className="whitespace-nowrap"><a className="underline" href={'tel:' + r.phone}>{r.phone}</a> <a className="btn-secondary !py-0.5 !px-2 ml-1" target="_blank" href={wa(r.phone)}>WhatsApp</a></td>
        <td><span className={'badge ' + (r.online ? 'bg-green-100 text-green-700' : r.loc ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{r.online ? 'online' : r.loc ? 'stale' : 'offline'}</span></td>
        <td className="text-sm">{r.onDuty ? <><span className="text-green-700 font-semibold">on duty</span><div className="text-xs text-gray-500">since {fmtDT(r.dutySince)} · {hrs(r.dutySince)}h</div></> : <span className="text-gray-400">off duty</span>}</td>
        <td className="text-sm">{r.route ? <>{r.route.zone} · <b>{r.route.delivered}/{r.route.stops}</b> delivered</> : <span className="text-gray-400">—</span>}</td>
        <td className="text-sm whitespace-nowrap">{r.loc ? <>{timeAgo(r.loc.at)}<div className="text-xs text-gray-400">{fmtDT(r.loc.at)}</div></> : '—'}</td>
        <td className="text-xs">{r.loc ? <a className="underline" target="_blank" href={`https://maps.google.com/?q=${r.loc.lat},${r.loc.lng}`}>{r.loc.lat.toFixed(4)}, {r.loc.lng.toFixed(4)}</a> : '—'}</td>
        {canEdit && <td><button className="btn-secondary !py-0.5 !px-2" onClick={() => toggle(r)}>{r.active ? 'Deactivate' : 'Reactivate'}</button></td>}
      </tr>)}
    </tbody></table></div>
    <HoursReport />
    <Modal title="Add rider" open={add} onClose={() => setAdd(false)}>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Mobile (they log in to the app with OTP on this number)"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98480 12345" /></Field>
      <button className="btn-primary w-full mt-3" onClick={addRider} disabled={!name || phone.replace(/\D/g, '').length < 10}>Add rider</button>
    </Modal>
  </div>;
}
