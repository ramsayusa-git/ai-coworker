'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDT, getUser } from '@/lib/api';
import { StatusBadge, useToast, Field, Empty } from '@/components/ui';

const ROLES = ['SALES', 'MARKETING', 'OPS'] as const;
/** Escalation order: a request goes to the first role in this chain whose limit covers it. */
const CHAIN = ['SALES', 'MARKETING', 'OPS', 'ADMIN'] as const;

/** Who decides on `amountPaise`, mirroring the server rule: within your own limit you
 *  self-approve and it applies immediately; above it, escalate to the first of OPS then
 *  ADMIN whose limit covers the amount. ADMIN is unlimited. */
function approverFor(amountPaise: number, limits: any, fromRole?: string): string {
  if (!limits) return 'ADMIN';
  if (fromRole && fromRole !== 'ADMIN' && amountPaise <= (limits[fromRole] ?? 0)) return fromRole;
  if (fromRole === 'ADMIN') return 'ADMIN';
  if (amountPaise <= (limits.OPS ?? 0)) return 'OPS';
  return 'ADMIN';
}

export default function Approvals() {
  const me = getUser(); const { show, Toast } = useToast();
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const { data, mutate } = useSWR(`/admin/approvals?status=${status}`, fetcher, { refreshInterval: 20000 });
  const { data: limits, mutate: mutL } = useSWR('/admin/settings/discount-limits', fetcher);
  const { data: stats } = useSWR('/admin/approvals/stats', fetcher, { refreshInterval: 20000 });
  const [note, setNote] = useState<Record<string, string>>({});
  const [lim, setLim] = useState<any>(null);

  const decide = async (id: string, ok: boolean) => {
    try { await api(`/admin/approvals/${id}/${ok ? 'approve' : 'reject'}`, { body: { note: note[id] || '' } });
      show(ok ? 'Approved — discount applied' : 'Rejected'); mutate(); }
    catch (e: any) { show(e.message, true); }
  };
  const saveLimits = async () => {
    try { await api('/admin/settings/discount-limits', { method: 'PUT', body: {
      SALES: Math.round(lim.SALES * 100), MARKETING: Math.round(lim.MARKETING * 100), OPS: Math.round(lim.OPS * 100),
      maxPct: Number(lim.maxPct), requireIssueAbovePaise: Math.round(lim.requireIssueAbovePaise * 100) } });
      show('Limits saved'); setLim(null); mutL(); }
    catch (e: any) { show(e.message, true); }
  };

  /** The escalation chain for one request, with the deciding role highlighted. */
  const Chain = ({ from, amount }: { from: string; amount: number }) => {
    // Customer self-service changes (NOTE/SLOT/ADDRESS) aren't part of the discount
    // hierarchy — showing a greyed-out four-step chain for them is just noise.
    if (!CHAIN.includes(from as any)) return null;
    const target = approverFor(amount, limits, from);
    const targetIdx = CHAIN.indexOf(target as any);
    const fromIdx = CHAIN.indexOf(from as any);
    return <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {CHAIN.map((r, i) => {
        const isFrom = i === fromIdx, isTarget = i === targetIdx;
        const passed = i > fromIdx && i < targetIdx;
        return <span key={r} className="flex items-center gap-1">
          <span className={'rounded-full px-2 py-0.5 font-medium ' +
            (isTarget ? 'bg-leaf-600 text-white' : isFrom ? 'bg-gray-900 text-white' : passed ? 'bg-amber-100 text-amber-800 line-through' : 'bg-gray-100 text-gray-400')}>
            {r.toLowerCase()}{isFrom && isTarget ? ' · within own limit' : isFrom ? ' · asked' : isTarget ? ' · decides' : ''}
          </span>
          {i < CHAIN.length - 1 && <span className={i < targetIdx ? 'text-gray-400' : 'text-gray-200'}>→</span>}
        </span>;
      })}
    </div>;
  };

  /** Where this amount sits against each role's ceiling. */
  const Ladder = ({ amount }: { amount?: number }) => {
    if (!limits) return null;
    const max = Math.max(limits.OPS || 0, amount || 0, 1);
    return <div className="space-y-1.5">
      {ROLES.map((r) => {
        const cap = limits[r] || 0;
        const covers = amount !== undefined && amount <= cap;
        return <div key={r} className="flex items-center gap-2">
          <div className="w-20 text-xs text-gray-500">{r.toLowerCase()}</div>
          <div className="relative h-3 flex-1 rounded-full bg-gray-100 overflow-hidden">
            <div className={'h-full rounded-full ' + (covers ? 'bg-leaf-500' : 'bg-gray-300')} style={{ width: `${Math.min(100, (cap / max) * 100)}%` }} />
            {amount !== undefined && <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${Math.min(100, (amount / max) * 100)}%` }} title={`this request: ${paise(amount)}`} />}
          </div>
          <div className="w-24 text-right text-xs font-medium">{paise(cap)}</div>
        </div>;
      })}
      <div className="flex items-center gap-2"><div className="w-20 text-xs text-gray-500">admin</div>
        <div className="h-3 flex-1 rounded-full brand-grad" /><div className="w-24 text-right text-xs font-medium">unlimited</div></div>
    </div>;
  };

  const pendingValue = (data || []).filter((m: any) => m.status === 'PENDING_APPROVAL').reduce((a: number, m: any) => a + Math.abs(m.amountPaise), 0);

  return <div><Toast />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div className="card-modern card-grad"><div className="text-xs text-gray-500">Waiting on a decision</div><div className="text-2xl font-bold">{stats?.pendingApprovals ?? '—'}</div></div>
      <div className="card-modern card-grad"><div className="text-xs text-gray-500">Value awaiting</div><div className="text-2xl font-bold">{paise(pendingValue)}</div></div>
      <div className="card-modern card-grad"><div className="text-xs text-gray-500">Discounts today</div><div className="text-2xl font-bold">{stats?.discountsToday ?? '—'}</div></div>
      <div className="card-modern card-grad"><div className="text-xs text-gray-500">Given away today</div><div className="text-2xl font-bold">{stats ? paise(stats.discountPaiseToday) : '—'}</div></div>
    </div>

    <div className="mb-3 flex flex-wrap gap-1">
      {['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED'].map((s) => <button key={s} onClick={() => setStatus(s)}
        className={'rounded-full px-3 py-1 text-xs font-medium transition ' + (status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200')}>
        {s.replace(/_/g, ' ').toLowerCase()}</button>)}
    </div>

    <div className="space-y-3">
      {data && !data.length && <Empty text={status === 'PENDING_APPROVAL' ? 'Nothing waiting for approval' : 'No records'} />}
      {data?.map((m: any) => <div key={m.id} className={'card-modern ' + (m.status === 'PENDING_APPROVAL' ? 'border-amber-300' : '')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{m.type === 'DISCOUNT' ? '−' : ''}{paise(Math.abs(m.amountPaise))}</span>
              <StatusBadge s={m.type} />
              <a className="text-sm underline text-leaf-700" href={`/admin/orders/${m.orderId}`}>#{m.order.orderNo}</a>
              <span className="text-xs text-gray-500">of {paise(m.order.totalPaise)}</span>
              {m.issueId && <a className="badge bg-blue-100 text-blue-800" href={`/admin/issues?id=${m.issueId}`}>issue linked</a>}
            </div>
            <div className="mt-1 text-sm text-gray-700">{m.reason}</div>
            <div className="mt-1 text-xs text-gray-500">
              {m.order.user.name} · {m.order.user.phone} · asked by {m.requester?.name || '—'} ({m.requestedRole?.toLowerCase()}) · {fmtDT(m.createdAt)}
            </div>
            <div className="mt-2"><Chain from={m.requestedRole} amount={Math.abs(m.amountPaise)} /></div>
          </div>

          <div className="shrink-0">
            {m.status === 'PENDING_APPROVAL' ? (m.canApprove
              ? <div className="flex flex-col gap-1 items-stretch w-56">
                  <input className="input !py-1" placeholder="note (required to reject)" value={note[m.id] || ''} onChange={(e) => setNote({ ...note, [m.id]: e.target.value })} />
                  <div className="flex gap-1">
                    <button className="btn-primary !py-1 flex-1" onClick={() => decide(m.id, true)}>Approve</button>
                    <button className="btn-danger !py-1 flex-1" onClick={() => decide(m.id, false)}>Reject</button>
                  </div>
                </div>
              : <span className="badge bg-gray-100 text-gray-600">{m.requestedBy === me?.id ? 'your own request' : 'above your limit'}</span>)
              : <div className="text-right text-xs"><StatusBadge s={m.status} />
                  <div className="mt-1 text-gray-500">{m.approver?.name}</div>
                  {m.decisionNote && <div className="text-gray-500 italic max-w-[14rem]">“{m.decisionNote}”</div>}
                </div>}
          </div>
        </div>
        {m.status === 'PENDING_APPROVAL' && <div className="mt-3 border-t pt-3"><Ladder amount={Math.abs(m.amountPaise)} /></div>}
      </div>)}
    </div>

    <h2 className="font-semibold mt-6 mb-2">Discount hierarchy</h2>
    <div className="card-modern text-sm">
      <p className="text-gray-600 mb-3">Each role self-approves goodwill discounts up to its limit. Anything above escalates to the first role whose limit covers it (Ops, then Admin). Admin is unlimited, and nobody approves their own request.</p>
      <Ladder />
      {limits && !lim && <div className="mt-4 flex flex-wrap gap-6 items-end border-t pt-3">
        <div><div className="text-xs text-gray-500">Max per order</div><b>{limits.maxPct}%</b></div>
        <div><div className="text-xs text-gray-500">Issue ticket required above</div><b>{limits.requireIssueAbovePaise ? paise(limits.requireIssueAbovePaise) : 'never'}</b></div>
        {me?.role === 'ADMIN' && <button className="btn-secondary" onClick={() => setLim({ SALES: limits.SALES / 100, MARKETING: limits.MARKETING / 100, OPS: limits.OPS / 100, maxPct: limits.maxPct, requireIssueAbovePaise: limits.requireIssueAbovePaise / 100 })}>Edit limits</button>}
      </div>}
      {lim && <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 border-t pt-3">
        {ROLES.map((r) => <Field key={r} label={`${r} limit (₹)`}><input type="number" className="input" value={lim[r]} onChange={(e) => setLim({ ...lim, [r]: e.target.value })} /></Field>)}
        <Field label="Max % of order"><input type="number" className="input" value={lim.maxPct} onChange={(e) => setLim({ ...lim, maxPct: e.target.value })} /></Field>
        <Field label="Issue required above (₹, 0 = never)"><input type="number" className="input" value={lim.requireIssueAbovePaise} onChange={(e) => setLim({ ...lim, requireIssueAbovePaise: e.target.value })} /></Field>
        <div className="col-span-full flex gap-2"><button className="btn-primary" onClick={saveLimits}>Save</button><button className="btn-secondary" onClick={() => setLim(null)}>Cancel</button></div>
      </div>}
    </div>
  </div>;
}
