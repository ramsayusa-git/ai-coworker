'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, fmtDT, ymd, API, getToken, getUser } from '@/lib/api';
import { StatusBadge, useToast, Field, Modal, Stat, Empty } from '@/components/ui';

const TABS = ['Today', 'Attendance', 'Leave', 'Roster', 'Holidays', 'Staff', 'Payroll', 'Policy'] as const;
const CODE: Record<string, { bg: string; t: string }> = { P: { bg: 'bg-leaf-100 text-leaf-800', t: 'Present' }, H: { bg: 'bg-amber-100 text-amber-800', t: 'Half day' }, A: { bg: 'bg-red-100 text-red-800', t: 'Absent' }, L: { bg: 'bg-blue-100 text-blue-800', t: 'Leave' }, UL: { bg: 'bg-purple-100 text-purple-800', t: 'Unpaid leave' }, HO: { bg: 'bg-gray-200 text-gray-700', t: 'Holiday' }, WO: { bg: 'bg-gray-100 text-gray-500', t: 'Week off' }, WFH: { bg: 'bg-cyan-100 text-cyan-800', t: 'WFH' }, '': { bg: '', t: '' } };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const hmm = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HR() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Today');
  return <div><div className="flex justify-between items-center mb-3 flex-wrap gap-2"><h1 className="text-2xl font-bold">HR</h1><div className="flex gap-1 flex-wrap">{TABS.map((t) => <button key={t} className={(tab === t ? 'btn-primary' : 'btn-secondary') + ' !py-1'} onClick={() => setTab(t)}>{t}</button>)}</div></div>
    {tab === 'Today' && <Today />}{tab === 'Attendance' && <Attendance />}{tab === 'Leave' && <Leave />}{tab === 'Roster' && <Roster />}{tab === 'Holidays' && <Holidays />}{tab === 'Staff' && <Staff />}{tab === 'Payroll' && <Payroll />}{tab === 'Policy' && <Policy />}</div>;
}

function Today() {
  const { data: d } = useSWR('/admin/hr/today', fetcher, { refreshInterval: 30000 });
  if (!d) return <div className="text-gray-400">Loading…</div>;
  const c = d.counts;
  return <div><div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4"><Stat label="Clocked in now" value={c.in} /><Stat label="Worked today" value={c.worked} /><Stat label="Late" value={c.late} warn={c.late > 0} /><Stat label="Not in yet" value={c.notIn} warn={c.notIn > 0} /><Stat label="On leave / WFH" value={c.onLeave} /><Stat label="Week off / holiday" value={c.off} /></div>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Flags</th></tr></thead><tbody>
      {d.rows.map((r: any) => <tr key={r.user.id}><td>{r.user.name}<br /><small className="text-gray-500">{r.user.phone}</small></td><td className="text-xs">{r.user.role}{r.user.isField ? ' · field' : ''}</td><td>{r.onDutyNow ? <span className="badge bg-leaf-100 text-leaf-800">on duty since {hmm(r.since)}</span> : r.code ? <span className={'badge ' + CODE[r.code]?.bg}>{CODE[r.code]?.t}{r.leaveType ? ` (${r.leaveType})` : ''}</span> : r.hours > 0 ? <span className="badge bg-gray-100">clocked out</span> : <span className="badge bg-red-50 text-red-700">not in</span>}</td><td className="text-xs">{hmm(r.firstIn)}</td><td className="text-xs">{hmm(r.lastOut)}</td><td>{r.hours}</td><td className="text-xs">{r.late && <span className="badge bg-amber-100 mr-1">late {r.lateMin}m</span>}{r.geoFlag && <span className="badge bg-red-100">outside geofence</span>}</td></tr>)}</tbody></table></div></div>;
}


/** Per-day share of the team that actually worked (P counts 1, half-day 0.5), as a
 *  sequential single-hue ramp — this is a magnitude, so one hue light->dark, never a
 *  rainbow and never the status colours, which mean something else in the grid below.
 *  Week-offs and holidays are excluded from the denominator: a quiet Sunday is not a
 *  staffing problem, and colouring it "empty" would cry wolf every week. */
const PRESENCE_RAMP = ['#eaf3ee', '#c3dfd0', '#8dc2a7', '#4f9a74', '#2e7d4f'];
function PresenceStrip({ a }: { a: any }) {
  const [tip, setTip] = useState<string | null>(null);
  const days = Array.from({ length: a.days }, (_, i) => i);
  const per = days.map((i) => {
    let worked = 0, expected = 0;
    for (const r of a.rows) {
      const c = r.days[i]?.code;
      if (!c || c === 'WO' || c === 'HO') continue;
      expected++;
      if (c === 'P' || c === 'WFH') worked++;
      else if (c === 'H') worked += 0.5;
    }
    return { i, worked, expected, pct: expected ? worked / expected : null };
  });
  return <div className="card-modern mb-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="font-semibold text-sm">Team present, by day</div>
      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        none{PRESENCE_RAMP.map((c) => <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />)}all
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-[2px]">
      {per.map(({ i, pct, worked, expected }) => <div key={i}
        className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[10px] text-gray-600"
        style={{ background: pct === null ? '#f3f4f6' : PRESENCE_RAMP[Math.min(4, Math.round(pct * 4))] }}
        onMouseEnter={() => setTip(pct === null ? `Day ${i + 1}: week off / holiday` : `Day ${i + 1}: ${worked} of ${expected} worked (${Math.round(pct * 100)}%)`)}
        onMouseLeave={() => setTip(null)}>{i + 1}</div>)}
    </div>
    <div className="mt-1 h-4 text-xs text-gray-500">{tip}</div>
  </div>;
}

function Attendance() {
  const [month, setMonth] = useState(thisMonth());
  const { data: a } = useSWR(`/admin/hr/attendance?month=${month}`, fetcher);
  const [sel, setSel] = useState<any>(null);
  return <div><div className="flex gap-2 items-center mb-3 flex-wrap"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
    {['csv', 'xlsx', 'pdf'].map((f) => <a key={f} className="btn-secondary !py-1" href={`${API}/v1/admin/hr/attendance.export?month=${month}&format=${f}&t=${getToken()}`} target="_blank">{f.toUpperCase()}</a>)}
    <span className="text-xs text-gray-500 ml-2">{Object.entries(CODE).filter(([k]) => k).map(([k, v]) => <span key={k} className={'badge mr-1 ' + v.bg}>{k} {v.t}</span>)}</span></div>
    {!a ? <div className="text-gray-400">Loading…</div> : <><PresenceStrip a={a} /><div className="card overflow-auto"><table className="tbl text-xs"><thead><tr><th className="sticky left-0 bg-white">Name</th>{Array.from({ length: a.days }, (_, i) => <th key={i} className="!px-1 text-center">{i + 1}</th>)}<th>P</th><th>½</th><th>A</th><th>L</th><th>Late</th><th>Hrs</th><th>OT</th><th>Payable</th></tr></thead><tbody>
      {a.rows.map((r: any) => <tr key={r.user.id}><td className="sticky left-0 bg-white whitespace-nowrap">{r.user.name}<br /><span className="text-gray-400">{r.user.role}</span></td>{r.days.map((d: any) => <td key={d.date} title={`${d.date} · ${CODE[d.code]?.t || '—'} · ${d.hours}h${d.lateMin ? ` · late ${d.lateMin}m` : ''}${d.note ? ' · ' + d.note : ''}`} className={'!px-1 text-center cursor-pointer ' + (CODE[d.code]?.bg || '')} onClick={() => setSel({ user: r.user, d })}>{d.code || '·'}</td>)}<td>{r.summary.present}</td><td>{r.summary.half}</td><td className={r.summary.absent ? 'text-red-700 font-semibold' : ''}>{r.summary.absent}</td><td>{r.summary.paidLeave + r.summary.unpaidLeave}</td><td className={r.summary.late ? 'text-amber-700' : ''}>{r.summary.late}</td><td>{r.summary.hours}</td><td>{r.summary.ot}</td><td className="font-semibold">{r.summary.payableDays}</td></tr>)}</tbody></table></div></>}
    <Modal title={sel ? `${sel.user.name} · ${sel.d.date}` : ''} open={!!sel} onClose={() => setSel(null)}>{sel && <div className="text-sm space-y-1"><div>Status: <b>{CODE[sel.d.code]?.t || 'No record'}</b>{sel.d.leaveType ? ` (${sel.d.leaveType})` : ''}{sel.d.note ? ` — ${sel.d.note}` : ''}</div><div>In {hmm(sel.d.firstIn)} · Out {hmm(sel.d.lastOut)} · {sel.d.hours} h{sel.d.ot ? ` · OT ${sel.d.ot} h` : ''}</div>{sel.d.lateMin > 0 && <div className="text-amber-700">Late by {sel.d.lateMin} min</div>}{sel.d.geoFlag && <div className="text-red-700">Clocked in outside the warehouse geofence</div>}</div>}</Modal></div>;
}

function Leave() {
  const [status, setStatus] = useState('PENDING'); const { show, Toast } = useToast();
  const { data, mutate } = useSWR(`/hr/leave-queue?status=${status}`, fetcher);
  const [note, setNote] = useState<Record<string, string>>({});
  const decide = async (id: string, ok: boolean) => { try { await api(`/hr/leave/${id}/${ok ? 'approve' : 'reject'}`, { body: { note: note[id] || '' } }); show(ok ? 'Approved' : 'Rejected'); mutate(); } catch (e: any) { show(e.message, true); } };
  return <div><Toast /><select className="input mb-3" value={status} onChange={(e) => setStatus(e.target.value)}>{['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</select>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Requested</th><th>Who</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Decision</th><th></th></tr></thead><tbody>
      {data?.map((r: any) => <tr key={r.id}><td className="text-xs">{fmtDT(r.createdAt)}</td><td>{r.user?.name}<br /><small>{r.user?.role}</small></td><td><span className="badge bg-gray-100">{r.type}</span>{r.halfDay ? ' ½' : ''}</td><td className="text-xs">{r.type === 'REG' ? `${fmtDate(r.from)} · ${hmm(r.claimedIn)}–${hmm(r.claimedOut)}` : `${fmtDate(r.from)}${r.to !== r.from ? ' → ' + fmtDate(r.to) : ''}`}</td><td>{r.days || '—'}</td><td className="text-sm max-w-xs">{r.reason}</td><td className="text-xs">{r.status === 'PENDING' ? <span className="badge bg-amber-100">waiting</span> : <><StatusBadge s={r.status} /> {r.approver?.name}{r.decisionNote && <div className="text-gray-500">“{r.decisionNote}”</div>}</>}</td>
        <td className="whitespace-nowrap">{r.status === 'PENDING' && <div className="flex gap-1"><input className="input !py-1 w-32" placeholder="note" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /><button className="btn-primary !py-1" onClick={() => decide(r.id, true)}>Approve</button><button className="btn-danger !py-1" onClick={() => decide(r.id, false)}>Reject</button></div>}</td></tr>)}</tbody></table>{data && !data.length && <Empty text="No requests" />}</div></div>;
}

function Roster() {
  const { show, Toast } = useToast();
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return ymd(d); });
  const { data: staff } = useSWR('/admin/hr/staff', fetcher); const { data: ros, mutate } = useSWR(`/admin/hr/roster?from=${days[0]}&to=${days[6]}`, fetcher);
  const [edit, setEdit] = useState<any>(null);
  const save = async (off = false) => { try { await api('/admin/hr/roster', { method: 'PUT', body: { rows: [{ ...edit, off }] } }); setEdit(null); mutate(); } catch (e: any) { show(e.message, true); } };
  const shift = (n: number) => { const d = new Date(start); d.setDate(d.getDate() + n); setStart(ymd(d)); };
  return <div><Toast /><div className="flex gap-2 items-center mb-3"><button className="btn-secondary !py-1" onClick={() => shift(-7)}>‹</button><b>Week of {fmtDate(days[0])}</b><button className="btn-secondary !py-1" onClick={() => shift(7)}>›</button><span className="text-xs text-gray-500">Click a cell to set a shift; blank = the person's default shift, or their week-off.</span></div>
    <div className="card overflow-auto"><table className="tbl text-xs"><thead><tr><th>Name</th>{days.map((d) => <th key={d}>{DOW[new Date(d).getDay()]}<br />{d.slice(5)}</th>)}</tr></thead><tbody>
      {staff?.filter((s: any) => s.active).map((s: any) => <tr key={s.id}><td className="whitespace-nowrap">{s.name}<br /><span className="text-gray-400">{s.role} · {s.profile?.shiftStart || '09:00'}–{s.profile?.shiftEnd || '18:00'}</span></td>{days.map((d) => { const r = ros?.find((x: any) => x.userId === s.id && x.date.slice(0, 10) === d); const off = (s.profile?.weeklyOffs || [0]).includes(new Date(d).getDay()); return <td key={d} className={'cursor-pointer text-center ' + (r ? 'bg-leaf-50' : off ? 'bg-gray-100 text-gray-400' : '')} onClick={() => setEdit({ userId: s.id, name: s.name, date: d, start: r?.start || s.profile?.shiftStart || '09:00', end: r?.end || s.profile?.shiftEnd || '18:00', label: r?.label || '' })}>{r ? `${r.start}–${r.end}${r.label ? ` ${r.label}` : ''}` : off ? 'off' : '·'}</td>; })}</tr>)}</tbody></table></div>
    <Modal title={edit ? `${edit.name} · ${edit.date}` : ''} open={!!edit} onClose={() => setEdit(null)}>{edit && <div className="grid grid-cols-3 gap-2"><Field label="Start"><input type="time" className="input" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field><Field label="End"><input type="time" className="input" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field><Field label="Label"><input className="input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field><div className="col-span-3 flex gap-2 justify-end"><button className="btn-secondary" onClick={() => save(true)}>Clear</button><button className="btn-primary" onClick={() => save()}>Save</button></div></div>}</Modal></div>;
}

function Holidays() {
  const { show, Toast } = useToast(); const [year, setYear] = useState(new Date().getFullYear());
  const { data, mutate } = useSWR(`/hr/holidays?year=${year}`, fetcher); const [f, setF] = useState({ date: '', name: '', optional: false });
  return <div><Toast /><div className="flex gap-2 items-end mb-3 flex-wrap"><Field label="Year"><input type="number" className="input w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field><Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><label className="text-sm pb-2"><input type="checkbox" checked={f.optional} onChange={(e) => setF({ ...f, optional: e.target.checked })} /> optional (restricted)</label><button className="btn-primary" onClick={async () => { try { await api('/admin/hr/holidays', { body: f }); setF({ date: '', name: '', optional: false }); mutate(); } catch (e: any) { show(e.message, true); } }}>Add</button></div>
    <div className="card"><table className="tbl"><thead><tr><th>Date</th><th>Holiday</th><th></th><th></th></tr></thead><tbody>{data?.map((h: any) => <tr key={h.id}><td>{fmtDate(h.date)} <small className="text-gray-400">{DOW[new Date(h.date).getDay()]}</small></td><td>{h.name}</td><td>{h.optional && <span className="badge bg-gray-100">optional</span>}</td><td><button className="text-xs underline text-red-700" onClick={async () => { await api(`/admin/hr/holidays/${h.id}`, { method: 'DELETE' }); mutate(); }}>remove</button></td></tr>)}</tbody></table>{data && !data.length && <Empty text="No holidays yet — add the Telangana public holiday list" />}</div></div>;
}

function Staff() {
  const me = getUser(); const { show, Toast } = useToast(); const { data, mutate } = useSWR('/admin/hr/staff', fetcher); const [edit, setEdit] = useState<any>(null);
  const managers = data?.filter((s: any) => ['ADMIN', 'OPS', 'SALES', 'MARKETING'].includes(s.role));
  const save = async () => { try { await api(`/admin/hr/staff/${edit.id}/profile`, { method: 'PATCH', body: { employeeCode: edit.employeeCode, designation: edit.designation, joinedOn: edit.joinedOn || null, monthlySalaryPaise: Math.round(Number(edit.salary || 0) * 100), weeklyOffs: edit.weeklyOffs, shiftStart: edit.shiftStart, shiftEnd: edit.shiftEnd, managerId: edit.managerId || null, notes: edit.notes } }); show('Saved'); setEdit(null); mutate(); } catch (e: any) { show(e.message, true); } };
  return <div><Toast /><div className="card overflow-auto"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Designation</th><th>Joined</th><th>Shift</th><th>Week off</th><th>Manager</th>{me?.role === 'ADMIN' && <th>Salary</th>}<th></th></tr></thead><tbody>
    {data?.map((s: any) => <tr key={s.id} className={s.active ? '' : 'opacity-50'}><td className="text-xs">{s.profile?.employeeCode || '—'}</td><td>{s.name}<br /><small className="text-gray-500">{s.phone}</small></td><td className="text-xs">{s.role}{s.isField ? ' · field' : ''}</td><td className="text-sm">{s.profile?.designation || '—'}</td><td className="text-xs">{s.profile?.joinedOn ? fmtDate(s.profile.joinedOn) : fmtDate(s.createdAt)}</td><td className="text-xs">{s.profile?.shiftStart || '09:00'}–{s.profile?.shiftEnd || '18:00'}</td><td className="text-xs">{(s.profile?.weeklyOffs || [0]).map((d: number) => DOW[d]).join(', ')}</td><td className="text-xs">{s.manager || '—'}</td>{me?.role === 'ADMIN' && <td className="text-xs">{s.profile?.monthlySalaryPaise ? paise(s.profile.monthlySalaryPaise) : '—'}</td>}
      <td>{me?.role === 'ADMIN' && <button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => setEdit({ id: s.id, name: s.name, employeeCode: s.profile?.employeeCode || '', designation: s.profile?.designation || '', joinedOn: s.profile?.joinedOn ? s.profile.joinedOn.slice(0, 10) : '', salary: (s.profile?.monthlySalaryPaise || 0) / 100, weeklyOffs: s.profile?.weeklyOffs || [0], shiftStart: s.profile?.shiftStart || '09:00', shiftEnd: s.profile?.shiftEnd || '18:00', managerId: s.profile?.managerId || '', notes: s.profile?.notes || '' })}>Edit</button>}</td></tr>)}</tbody></table></div>
    <Modal title={edit ? `${edit.name} · HR profile` : ''} open={!!edit} onClose={() => setEdit(null)}>{edit && <div className="grid grid-cols-2 gap-2"><Field label="Employee code"><input className="input" value={edit.employeeCode} onChange={(e) => setEdit({ ...edit, employeeCode: e.target.value })} /></Field><Field label="Designation"><input className="input" value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} /></Field><Field label="Joined on"><input type="date" className="input" value={edit.joinedOn} onChange={(e) => setEdit({ ...edit, joinedOn: e.target.value })} /></Field><Field label="Monthly salary (₹)"><input type="number" className="input" value={edit.salary} onChange={(e) => setEdit({ ...edit, salary: e.target.value })} /></Field><Field label="Shift start"><input type="time" className="input" value={edit.shiftStart} onChange={(e) => setEdit({ ...edit, shiftStart: e.target.value })} /></Field><Field label="Shift end"><input type="time" className="input" value={edit.shiftEnd} onChange={(e) => setEdit({ ...edit, shiftEnd: e.target.value })} /></Field>
      <Field label="Week offs"><div className="flex gap-1 flex-wrap">{DOW.map((d, i) => <label key={d} className={'badge cursor-pointer ' + (edit.weeklyOffs.includes(i) ? 'bg-leaf-100' : 'bg-gray-100')}><input type="checkbox" className="hidden" checked={edit.weeklyOffs.includes(i)} onChange={(e) => setEdit({ ...edit, weeklyOffs: e.target.checked ? [...edit.weeklyOffs, i] : edit.weeklyOffs.filter((x: number) => x !== i) })} />{d}</label>)}</div></Field>
      <Field label="Reports to"><select className="input" value={edit.managerId} onChange={(e) => setEdit({ ...edit, managerId: e.target.value })}><option value="">— (Admin approves)</option>{managers?.filter((m: any) => m.id !== edit.id).map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}</select></Field>
      <div className="col-span-2"><Field label="Notes"><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div><div className="col-span-2 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></div></div>}</Modal></div>;
}

function Payroll() {
  const me = getUser(); const [month, setMonth] = useState(thisMonth()); const { data } = useSWR(me?.role === 'ADMIN' ? `/admin/hr/payroll?month=${month}` : null, fetcher);
  if (me?.role !== 'ADMIN') return <div className="text-gray-500">Payroll is visible to Admin only.</div>;
  const tot = data?.reduce((a: number, r: any) => a + r.netPayableRupees, 0) || 0;
  return <div><div className="flex gap-2 items-center mb-3"><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />{['csv', 'xlsx', 'pdf'].map((f) => <a key={f} className="btn-secondary !py-1" target="_blank" href={`${API}/v1/admin/hr/payroll?month=${month}&format=${f}&t=${getToken()}`}>{f.toUpperCase()}</a>)}<span className="text-sm ml-auto">Net payable <b>₹{tot.toLocaleString('en-IN')}</b></span></div>
    <div className="card overflow-auto"><table className="tbl text-xs"><thead><tr><th>Code</th><th>Name</th><th>Role</th><th>P</th><th>½</th><th>Paid leave</th><th>LWP</th><th>A</th><th>HO/WO</th><th>Late</th><th>Payable days</th><th>LOP days</th><th>Hours</th><th>OT h</th><th>Salary</th><th>LOP −</th><th>OT +</th><th>Net</th></tr></thead><tbody>
      {data?.map((r: any) => <tr key={r.phone}><td>{r.employeeCode}</td><td>{r.name}</td><td>{r.role}</td><td>{r.present}</td><td>{r.halfDays}</td><td>{r.paidLeave}</td><td>{r.unpaidLeave}</td><td className={r.absent ? 'text-red-700' : ''}>{r.absent}</td><td>{r.holidays + r.weekOffs}</td><td>{r.lateMarks}{r.latePenaltyHalfDays ? ` (−${r.latePenaltyHalfDays}½)` : ''}</td><td className="font-semibold">{r.payableDays}</td><td>{r.lopDays}</td><td>{r.hoursWorked}</td><td>{r.overtimeHours}</td><td>₹{r.monthlySalaryRupees.toLocaleString('en-IN')}</td><td className="text-red-700">₹{r.lopDeductionRupees.toLocaleString('en-IN')}</td><td>₹{r.overtimeRupees.toLocaleString('en-IN')}</td><td className="font-bold">₹{r.netPayableRupees.toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-gray-500 mt-2">Net = salary − (salary ÷ days in month × LOP days) + overtime (if enabled in Policy). LOP = absents + unpaid leave + ½ per half-day + late-mark penalties. Export and hand to your accountant / Zoho Payroll.</p></div>;
}

function Policy() {
  const me = getUser(); const { show, Toast } = useToast(); const { data, mutate } = useSWR('/admin/hr/policy', fetcher); const [p, setP] = useState<any>(null);
  const cur = p || data; if (!cur) return <div className="text-gray-400">Loading…</div>;
  const set = (k: string, v: any) => setP({ ...cur, [k]: v });
  const N = (k: string, label: string) => <Field label={label}><input type="number" className="input" value={cur[k]} disabled={me?.role !== 'ADMIN'} onChange={(e) => set(k, Number(e.target.value))} /></Field>;
  return <div><Toast /><div className="card grid grid-cols-2 md:grid-cols-4 gap-3">{N('fullDayHours', 'Full day ≥ hours')}{N('halfDayHours', 'Half day ≥ hours')}{N('workdayHours', 'Standard day (hours)')}{N('overtimeAfterHours', 'Overtime after (hours)')}{N('graceMin', 'Grace (min)')}{N('lateAfterMin', 'Late mark after grace (min)')}{N('maxLateBeforeHalfDay', 'Late marks per ½-day cut (0 = off)')}{N('workingDaysPerMonth', 'Working days / month (OT rate)')}
    <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!cur.geofenceRequired} disabled={me?.role !== 'ADMIN'} onChange={(e) => set('geofenceRequired', e.target.checked)} />Block clock-in outside warehouse geofence</label><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!cur.payOvertime} disabled={me?.role !== 'ADMIN'} onChange={(e) => set('payOvertime', e.target.checked)} />Pay overtime</label></div>
    <h3 className="font-semibold mt-4 mb-2">Leave types</h3><div className="card"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Days / year</th><th>Paid</th><th></th></tr></thead><tbody>{cur.leaveTypes.map((t: any, i: number) => <tr key={i}><td><input className="input w-20" value={t.code} disabled={me?.role !== 'ADMIN'} onChange={(e) => { const lt = [...cur.leaveTypes]; lt[i] = { ...t, code: e.target.value.toUpperCase() }; set('leaveTypes', lt); }} /></td><td><input className="input" value={t.name} disabled={me?.role !== 'ADMIN'} onChange={(e) => { const lt = [...cur.leaveTypes]; lt[i] = { ...t, name: e.target.value }; set('leaveTypes', lt); }} /></td><td><input type="number" className="input w-24" value={t.daysPerYear} disabled={me?.role !== 'ADMIN'} onChange={(e) => { const lt = [...cur.leaveTypes]; lt[i] = { ...t, daysPerYear: Number(e.target.value) }; set('leaveTypes', lt); }} /></td><td><input type="checkbox" checked={!!t.paid} disabled={me?.role !== 'ADMIN'} onChange={(e) => { const lt = [...cur.leaveTypes]; lt[i] = { ...t, paid: e.target.checked }; set('leaveTypes', lt); }} /></td><td>{me?.role === 'ADMIN' && <button className="text-xs underline text-red-700" onClick={() => set('leaveTypes', cur.leaveTypes.filter((_: any, j: number) => j !== i))}>remove</button>}</td></tr>)}</tbody></table>
      {me?.role === 'ADMIN' && <div className="flex gap-2 mt-3"><button className="btn-secondary" onClick={() => set('leaveTypes', [...cur.leaveTypes, { code: 'NEW', name: 'New type', daysPerYear: 0, paid: true }])}>+ Leave type</button><button className="btn-primary" disabled={!p} onClick={async () => { try { await api('/admin/hr/policy', { method: 'PUT', body: p }); show('Policy saved'); setP(null); mutate(); } catch (e: any) { show(e.message, true); } }}>Save policy</button></div>}</div>
    <p className="text-xs text-gray-500 mt-2">WFH and REG (attendance regularisation) are always available. Geofence radius is set per warehouse (Warehouses → lat/lng/radius).</p></div>;
}
