'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDT } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Modal, Field, useToast, Empty, Stat } from '@/components/ui';
import { timeAgo } from '@/components/live-map';

const CATS = ['WRONG_BAG', 'LATE', 'DAMAGED', 'MISSING', 'PAYMENT', 'RIDER', 'APP', 'OTHER'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIO: Record<string, string> = { URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-amber-100 text-amber-700', NORMAL: 'bg-gray-100 text-gray-700', LOW: 'bg-blue-50 text-blue-700' };
const slaLabel = (i: any) => { if (['RESOLVED', 'CLOSED'].includes(i.status)) return null; const ms = new Date(i.slaDueAt).getTime() - Date.now(); if (ms < 0) return <span className="text-red-700 font-semibold">breached {timeAgo(i.slaDueAt)}</span>; const h = ms / 36e5; return <span className={h < 2 ? 'text-amber-700 font-semibold' : 'text-gray-500'}>{h < 1 ? `${Math.round(h * 60)} min left` : `${Math.round(h)} h left`}</span>; };

export default function IssuesDesk() {
  const { user } = useAuth(); const { show, Toast } = useToast();
  const [status, setStatus] = useState('OPEN,IN_PROGRESS,WAITING_CUSTOMER'); const [mine, setMine] = useState(false); const [cat, setCat] = useState('');
  const { data, mutate } = useSWR(`/issues?status=${status}${mine ? '&mine=1' : ''}${cat ? '&category=' + cat : ''}`, fetcher, { refreshInterval: 15000 });
  const { data: stats, mutate: mStats } = useSWR('/issues/stats', fetcher, { refreshInterval: 30000 });
  const { data: staff } = useSWR('/admin/staff', fetcher);
  const [open, setOpen] = useState<any>(null); const { data: detail, mutate: mDetail } = useSWR(open ? `/issues/${open.id}` : null, fetcher, { refreshInterval: 10000 });
  const [msg, setMsg] = useState(''); const [internal, setInternal] = useState(false); const [resolution, setResolution] = useState(''); const [busy, setBusy] = useState(false);
  const [raise, setRaise] = useState(false); const [nf, setNf] = useState<any>({ category: 'OTHER', priority: 'NORMAL', title: '', description: '', onBehalfOfPhone: '' });
  const refresh = () => { mutate(); mStats(); mDetail(); };
  const send = async () => { if (!msg.trim()) return; setBusy(true); try { await api(`/issues/${open.id}/messages`, { body: { body: msg, internal } }); setMsg(''); refresh(); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const patch = async (b: any) => { setBusy(true); try { await api(`/issues/${open.id}`, { method: 'PATCH', body: b }); refresh(); show('Updated'); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const create = async () => { setBusy(true); try { await api('/issues', { body: { ...nf, onBehalfOfPhone: nf.onBehalfOfPhone || undefined } }); setRaise(false); setNf({ category: 'OTHER', priority: 'NORMAL', title: '', description: '', onBehalfOfPhone: '' }); refresh(); show('Ticket raised'); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  return <div><Toast />
    <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><div><h1 className="text-2xl font-bold">Issues desk</h1><div className="text-sm text-gray-500">Tickets from the app, web and WhatsApp ("ISSUE …"). SLA: urgent 1h · high 4h · normal 24h · low 72h. Ops get a WhatsApp nudge when one breaches.</div></div><button className="btn-primary" onClick={() => setRaise(true)}>+ Raise for a customer</button></div>
    {stats && <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"><Stat label="Open" value={stats.open} /><Stat label="SLA breached" value={stats.breached} warn={stats.breached > 0} /><Stat label="Due in 2h" value={stats.dueSoon} warn={stats.dueSoon > 0} /><Stat label="Avg resolution (7d)" value={stats.avgResolutionHours != null ? `${stats.avgResolutionHours} h` : '—'} /><Stat label="CSAT (7d)" value={stats.csat != null ? `${stats.csat} / 5` : '—'} /></div>}
    <div className="flex flex-wrap gap-2 mb-3 items-center text-sm">
      {[['OPEN,IN_PROGRESS,WAITING_CUSTOMER', 'Active'], ['OPEN', 'New'], ['IN_PROGRESS', 'In progress'], ['WAITING_CUSTOMER', 'Waiting on customer'], ['RESOLVED,CLOSED', 'Resolved']].map(([v, l]) => <button key={v} className={'btn-secondary !py-1 ' + (status === v ? '!bg-leaf-600 !text-white' : '')} onClick={() => setStatus(v)}>{l}</button>)}
      <label className="flex items-center gap-1 ml-2"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine</label>
      <select className="input !py-1 w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
    </div>
    {data && !data.length && <Empty text="No tickets here" />}
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>#</th><th>Priority</th><th>Title</th><th>Customer</th><th>Order</th><th>Status</th><th>Assignee</th><th>SLA</th><th>Last</th></tr></thead><tbody>
      {data?.map((i: any) => <tr key={i.id} className="cursor-pointer hover:bg-rice-50" onClick={() => setOpen(i)}>
        <td className="font-mono text-xs">#{i.ticketNo}</td><td><span className={'badge ' + PRIO[i.priority]}>{i.priority}</span></td>
        <td><b>{i.title}</b><div className="text-xs text-gray-500">{i.category} · via {i.channel}</div></td>
        <td className="text-sm">{i.raisedBy.name || i.raisedBy.phone}<div className="text-xs text-gray-500">{i.raisedBy.phone}</div></td>
        <td className="text-sm">{i.order ? `#${i.order.orderNo}` : '—'}</td><td><span className="badge bg-gray-100">{i.status.replace(/_/g, ' ')}</span></td>
        <td className="text-sm">{i.assignee?.name || <span className="text-gray-400">unassigned</span>}</td><td className="text-xs">{slaLabel(i)}</td>
        <td className="text-xs text-gray-500 max-w-[200px] truncate">{i.messages?.[0] ? `${i.messages[0].fromStaff ? '↩ ' : ''}${i.messages[0].body}` : timeAgo(i.createdAt)}</td>
      </tr>)}
    </tbody></table></div>

    <Modal title={detail ? `#${detail.ticketNo} · ${detail.title}` : 'Ticket'} open={!!open} onClose={() => setOpen(null)}>{detail && <div className="grid md:grid-cols-[1fr_260px] gap-4">
      <div>
        <div className="text-sm text-gray-600 mb-2">{detail.description || <i>No description</i>}{detail.photo && <img src={detail.photo} alt="" className="mt-2 max-h-60 rounded border" />}</div>
        <div className="space-y-2 max-h-80 overflow-auto border rounded p-2 bg-rice-50">
          {detail.messages.map((m: any) => <div key={m.id} className={'text-sm p-2 rounded ' + (m.internal ? 'bg-amber-50 border border-amber-200' : m.fromStaff ? 'bg-white ml-6' : 'bg-leaf-600/10 mr-6')}><div className="text-xs text-gray-500">{m.author?.name || 'Customer'}{m.internal && ' · internal note'}{m.viaWhatsapp && ' · WhatsApp'} · {fmtDT(m.createdAt)}</div>{m.body}{m.photo && <img src={m.photo} alt="" className="mt-1 max-h-40 rounded" />}</div>)}
          {!detail.messages.length && <div className="text-xs text-gray-400">No messages yet</div>}
        </div>
        <textarea className="input mt-2" rows={3} placeholder={internal ? 'Internal note (customer will not see this)' : 'Reply to the customer — also sent on WhatsApp'} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="flex justify-between items-center mt-1"><label className="text-xs flex items-center gap-1"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label><button className="btn-primary" disabled={busy || !msg.trim()} onClick={send}>{internal ? 'Add note' : 'Send reply'}</button></div>
      </div>
      <div className="space-y-2 text-sm">
        <div><b>{detail.raisedBy.name || 'Customer'}</b> · <a className="underline" href={'tel:' + detail.raisedBy.phone}>{detail.raisedBy.phone}</a>{detail.order && <div className="text-xs">Order <a className="underline" href={`/admin/orders`}>#{detail.order.orderNo}</a> · {detail.order.status}</div>}<div className="text-xs text-gray-500">Raised {fmtDT(detail.createdAt)} via {detail.channel} · {slaLabel(detail)}</div></div>
        <Field label="Status"><select className="input" value={detail.status} onChange={(e) => { const s = e.target.value; if (['RESOLVED', 'CLOSED'].includes(s) && !detail.resolution && !resolution) { show('Add a resolution note first', true); return; } patch({ status: s, resolution: resolution || undefined }); }}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={detail.priority} onChange={(e) => patch({ priority: e.target.value })}>{Object.keys(PRIO).map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Category"><select className="input" value={detail.category} onChange={(e) => patch({ category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Assignee"><select className="input" value={detail.assigneeId || ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}><option value="">Unassigned</option>{staff?.filter((s: any) => ['ADMIN', 'OPS', 'SALES'].includes(s.role)).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</select></Field>
        <Field label="Resolution note"><textarea className="input" rows={2} value={resolution || detail.resolution || ''} onChange={(e) => setResolution(e.target.value)} placeholder="What was done" /></Field>
        {!['RESOLVED', 'CLOSED'].includes(detail.status) && <button className="btn-primary w-full" disabled={busy || !(resolution || detail.resolution)} onClick={() => patch({ status: 'RESOLVED', resolution: resolution || detail.resolution })}>Mark resolved</button>}
        {detail.rating && <div className="text-xs text-leaf-700">Customer rated {detail.rating}/5</div>}
      </div>
    </div>}</Modal>

    <Modal title="Raise a ticket for a customer" open={raise} onClose={() => setRaise(false)}><div className="space-y-2">
      <Field label="Customer phone"><input className="input" value={nf.onBehalfOfPhone} onChange={(e) => setNf({ ...nf, onBehalfOfPhone: e.target.value })} placeholder="98480 12345" /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Category"><select className="input" value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="Priority"><select className="input" value={nf.priority} onChange={(e) => setNf({ ...nf, priority: e.target.value })}>{Object.keys(PRIO).map((p) => <option key={p}>{p}</option>)}</select></Field></div>
      <Field label="Title"><input className="input" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} /></Field>
      <Field label="Details"><textarea className="input" rows={3} value={nf.description} onChange={(e) => setNf({ ...nf, description: e.target.value })} /></Field>
      <button className="btn-primary w-full" disabled={busy || !nf.title || !nf.onBehalfOfPhone} onClick={create}>Raise ticket</button></div></Modal>
  </div>;
}
