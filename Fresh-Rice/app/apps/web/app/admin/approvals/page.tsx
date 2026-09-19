'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDT, getUser } from '@/lib/api';
import { StatusBadge, useToast, Field, Empty } from '@/components/ui';

const ROLES = ['SALES', 'MARKETING', 'OPS'] as const;
export default function Approvals() {
  const me = getUser(); const { show, Toast } = useToast();
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const { data, mutate } = useSWR(`/admin/approvals?status=${status}`, fetcher, { refreshInterval: 20000 });
  const { data: limits, mutate: mutL } = useSWR('/admin/settings/discount-limits', fetcher);
  const [note, setNote] = useState<Record<string, string>>({});
  const [lim, setLim] = useState<any>(null);
  const decide = async (id: string, ok: boolean) => { try { await api(`/admin/approvals/${id}/${ok ? 'approve' : 'reject'}`, { body: { note: note[id] || '' } }); show(ok ? 'Approved — discount applied' : 'Rejected'); mutate(); } catch (e: any) { show(e.message, true); } };
  const saveLimits = async () => { try { await api('/admin/settings/discount-limits', { method: 'PUT', body: { SALES: Math.round(lim.SALES * 100), MARKETING: Math.round(lim.MARKETING * 100), OPS: Math.round(lim.OPS * 100), maxPct: Number(lim.maxPct), requireIssueAbovePaise: Math.round(lim.requireIssueAbovePaise * 100) } }); show('Limits saved'); setLim(null); mutL(); } catch (e: any) { show(e.message, true); } };
  return <div><Toast />
    <div className="flex justify-between items-center mb-4"><h1 className="text-2xl font-bold">Approvals</h1>
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></div>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>When</th><th>Order</th><th>Customer</th><th>Type</th><th>Amount</th><th>Reason</th><th>Requested by</th><th>Decision</th><th></th></tr></thead><tbody>
      {data?.map((m: any) => <tr key={m.id}><td className="text-xs whitespace-nowrap">{fmtDT(m.createdAt)}</td><td><a className="underline" href={`/admin/orders/${m.orderId}`}>#{m.order.orderNo}</a><br /><small>{paise(m.order.totalPaise)} · <StatusBadge s={m.order.status} /></small></td><td>{m.order.user.name}<br /><small>{m.order.user.phone}</small></td><td><StatusBadge s={m.type} /></td><td className="font-semibold">{m.type === 'DISCOUNT' ? '−' : ''}{paise(Math.abs(m.amountPaise))}{m.issueId && <div className="text-xs"><a className="underline" href={`/admin/issues?id=${m.issueId}`}>issue linked</a></div>}</td><td className="text-sm max-w-xs">{m.reason}</td><td className="text-xs">{m.requester?.name || '—'}<br /><span className="badge bg-gray-100">{m.requestedRole}</span></td>
        <td className="text-xs">{m.status === 'PENDING_APPROVAL' ? <span className="badge bg-amber-100">waiting</span> : <><StatusBadge s={m.status} /><br />{m.approver?.name}{m.decisionNote && <div className="text-gray-500">“{m.decisionNote}”</div>}</>}</td>
        <td className="whitespace-nowrap">{m.status === 'PENDING_APPROVAL' && (m.canApprove ? <div className="flex gap-1 items-center"><input className="input !py-1 w-36" placeholder="note (needed to reject)" value={note[m.id] || ''} onChange={(e) => setNote({ ...note, [m.id]: e.target.value })} /><button className="btn-primary !py-1" onClick={() => decide(m.id, true)}>Approve</button><button className="btn-danger !py-1" onClick={() => decide(m.id, false)}>Reject</button></div> : <span className="text-xs text-gray-400">{m.requestedBy === me?.id ? 'your request' : 'above your limit'}</span>)}</td></tr>)}</tbody></table>
      {data && !data.length && <Empty text={status === 'PENDING_APPROVAL' ? 'Nothing waiting for approval' : 'No records'} />}</div>

    <h2 className="font-semibold mt-6 mb-2">Discount hierarchy</h2>
    <div className="card text-sm">
      <p className="text-gray-600 mb-3">Each role can self-approve goodwill discounts up to its limit. Anything above escalates to the first role whose limit covers it (Ops, then Admin). Admin is unlimited. Nobody can approve their own request.</p>
      {limits && !lim && <div className="flex flex-wrap gap-4 items-end">{ROLES.map((r) => <div key={r}><div className="text-xs text-gray-500">{r}</div><b>{paise(limits[r])}</b></div>)}<div><div className="text-xs text-gray-500">ADMIN</div><b>unlimited</b></div><div><div className="text-xs text-gray-500">Max per order</div><b>{limits.maxPct}%</b></div><div><div className="text-xs text-gray-500">Issue ticket required above</div><b>{limits.requireIssueAbovePaise ? paise(limits.requireIssueAbovePaise) : 'never'}</b></div>
        {me?.role === 'ADMIN' && <button className="btn-secondary" onClick={() => setLim({ SALES: limits.SALES / 100, MARKETING: limits.MARKETING / 100, OPS: limits.OPS / 100, maxPct: limits.maxPct, requireIssueAbovePaise: limits.requireIssueAbovePaise / 100 })}>Edit</button>}</div>}
      {lim && <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{ROLES.map((r) => <Field key={r} label={`${r} limit (₹)`}><input type="number" className="input" value={lim[r]} onChange={(e) => setLim({ ...lim, [r]: e.target.value })} /></Field>)}<Field label="Max % of order"><input type="number" className="input" value={lim.maxPct} onChange={(e) => setLim({ ...lim, maxPct: e.target.value })} /></Field><Field label="Issue required above (₹, 0 = never)"><input type="number" className="input" value={lim.requireIssueAbovePaise} onChange={(e) => setLim({ ...lim, requireIssueAbovePaise: e.target.value })} /></Field>
        <div className="col-span-full flex gap-2"><button className="btn-primary" onClick={saveLimits}>Save</button><button className="btn-secondary" onClick={() => setLim(null)}>Cancel</button></div></div>}
    </div></div>;
}
