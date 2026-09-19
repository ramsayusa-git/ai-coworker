'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, fmtDT, ymd, getUser, API, getToken } from '@/lib/api';
import { StatusBadge, useToast, Field, Modal } from '@/components/ui';

const NEXT: Record<string, string[]> = { PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PACKED', 'CANCELLED'], PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'], OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'], FAILED: ['CONFIRMED'] };
const describe = (m: any) => {
  const b = m.before || {}, a = m.after || {};
  if (m.type === 'DISCOUNT') return `−${paise(m.amountPaise)}${a.refundedToWallet ? ' (credited to wallet)' : a.totalPaise !== undefined ? ` → payable ${paise(a.totalPaise)}` : ''}`;
  if (m.type === 'ITEMS') return `${(b.items || []).map((i: any) => `${i.qty}× ${i.code || i.skuId.slice(0, 6)}`).join(', ')} → ${(a.items || []).map((i: any) => `${i.qty}× ${i.code || i.skuId.slice(0, 6)}`).join(', ')} · ${paise(b.totalPaise)} → ${paise(a.totalPaise)}`;
  if (m.type === 'SLOT') return `${fmtDate(b.deliveryDate)} ${b.slot || ''} → ${fmtDate(a.deliveryDate)}`;
  if (m.type === 'ADDRESS') return `${b.line1} → ${a.line1}`;
  if (m.type === 'NOTE') return a.notes;
  return '';
};

export default function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const me = getUser(); const { show, Toast } = useToast();
  const { data: o, mutate } = useSWR('/orders/' + id, fetcher);
  const { data: mods, mutate: mutM } = useSWR(`/orders/${id}/modifications`, fetcher);
  const { data: opt } = useSWR(`/admin/orders/${id}/options`, fetcher);
  const [modal, setModal] = useState<'' | 'ITEMS' | 'SLOT' | 'ADDRESS' | 'NOTE' | 'DISCOUNT'>('');
  const [f, setF] = useState<any>({});
  const refresh = () => { mutate(); mutM(); };
  const open = (t: typeof modal) => { setF(t === 'ITEMS' ? { items: o.items.map((i: any) => ({ skuId: i.skuId, qty: i.qty })), reason: '', collectOnDelivery: false } : t === 'SLOT' ? { deliveryDate: ymd(new Date(o.deliveryDate)), slotId: o.slotId || '', reason: '' } : t === 'ADDRESS' ? { addressId: o.addressId, reason: '' } : t === 'DISCOUNT' ? { mode: 'amount', amount: '', pct: '', reason: '', issueId: '' } : { note: '', reason: 'ops note' }); setModal(t); };
  const submit = async () => {
    try {
      if (modal === 'DISCOUNT') { const r = await api(`/admin/orders/${id}/discount`, { body: { ...(f.mode === 'pct' ? { pct: Number(f.pct) } : { amountPaise: Math.round(Number(f.amount) * 100) }), reason: f.reason, issueId: f.issueId || undefined } }); show(r.applied ? 'Discount applied' : `Sent for approval to ${r.approvers.join('/')}`); }
      else { await api(`/admin/orders/${id}/modify`, { body: { type: modal, ...f, slotId: modal === 'SLOT' ? (f.slotId || null) : undefined, items: modal === 'ITEMS' ? f.items.filter((i: any) => Number(i.qty) > 0) : undefined } }); show('Order updated'); }
      setModal(''); refresh();
    } catch (e: any) { show(e.message, true); }
  };
  const move = async (s: string) => { try { await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status: s } }); refresh(); } catch (e: any) { show(e.message, true); } };
  if (!o) return <div className="text-gray-400">Loading…</div>;
  const editable = !o.stop && ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED'].includes(o.status);
  const lim = opt?.limits; const myLimit = me?.role === 'ADMIN' ? Infinity : lim?.[me?.role] || 0;
  return <div><Toast />
    <div className="flex justify-between items-start flex-wrap gap-2"><div><a href="/admin/orders" className="text-xs underline text-gray-500">← Orders</a><h1 className="text-2xl font-bold">Order #{o.orderNo} <span className="text-sm font-normal text-gray-500">rev {o.revision}</span></h1><div className="text-sm">{o.user.name} · {o.user.phone} · <span className="badge bg-gray-100">{o.channel}</span> <StatusBadge s={o.status} /></div></div>
      <div className="flex flex-wrap gap-1">{['ADMIN', 'OPS'].includes(me?.role) && (NEXT[o.status] || []).map((s) => <button key={s} className="btn-secondary !py-1" onClick={() => move(s)}>{s.replace(/_/g, ' ')}</button>)}<a className="btn-secondary !py-1" target="_blank" href={`${API}/v1/orders/${id}/invoice.html?t=${getToken()}`}>Invoice</a></div></div>

    <div className="grid md:grid-cols-2 gap-3 mt-4">
      <div className="card text-sm"><div className="flex justify-between items-center mb-2"><b>Items</b>{editable && ['PENDING_PAYMENT', 'CONFIRMED'].includes(o.status) && me?.role !== 'MARKETING' && <button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => open('ITEMS')}>Change items</button>}</div>
        {o.items.map((i: any) => <div key={i.id} className="flex justify-between py-1 border-b last:border-0"><span>{i.qty}× {i.sku.variety.name} {i.sku.packKg}kg <small className="text-gray-500">{i.lot?.lotNo}</small></span><span>{paise(i.unitPaise * i.qty)}</span></div>)}
        <div className="flex justify-between mt-2"><span>Subtotal</span><span>{paise(o.subtotalPaise)}</span></div><div className="flex justify-between"><span>GST</span><span>{paise(o.gstPaise)}</span></div>{o.discountPaise > 0 && <div className="flex justify-between text-leaf-700"><span>Discounts</span><span>−{paise(o.discountPaise)}</span></div>}<div className="flex justify-between font-bold"><span>Total</span><span>{paise(o.totalPaise)}</span></div>
        <div className="text-xs text-gray-500 mt-1">{o.payment?.method} · {o.payment?.status} · {paise(o.payment?.amountPaise)}{o.totalKg ? ` · ${o.totalKg} kg` : ''}</div>
        {['PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status) && <button className="btn-primary mt-3 !py-1" onClick={() => open('DISCOUNT')}>Goodwill discount</button>}
        {lim && <div className="text-xs text-gray-500 mt-1">Your self-approval limit: {myLimit === Infinity ? 'unlimited' : paise(myLimit)} · cap {lim.maxPct}% of order</div>}</div>
      <div className="card text-sm"><div className="flex justify-between items-center mb-2"><b>Delivery</b>{editable && me?.role !== 'MARKETING' && <div className="flex gap-1"><button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => open('SLOT')}>Reschedule</button><button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => open('ADDRESS')}>Change address</button></div>}</div>
        <div>{fmtDate(o.deliveryDate)} {o.slot?.label || ''}</div><div>{o.address.line1}{o.address.complex ? ', ' + o.address.complex : ''} · {o.address.pincode}</div>
        {o.stop && <div className="text-xs mt-1">On route · stop {o.stop.seq}{o.stop.route?.rider ? ` · ${o.stop.route.rider.name}` : ''} — remove from route before editing</div>}
        <div className="mt-2"><b>Notes</b> <button className="btn-secondary !py-0.5 !px-2 text-xs" onClick={() => open('NOTE')}>Add</button><div className="text-gray-700 whitespace-pre-wrap">{o.notes || '—'}</div></div></div></div>

    <h2 className="font-semibold mt-6 mb-2">Change log</h2>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>When</th><th>Type</th><th>Change</th><th>Reason</th><th>By</th><th>Status</th></tr></thead><tbody>
      {mods?.map((m: any) => <tr key={m.id}><td className="text-xs whitespace-nowrap">{fmtDT(m.createdAt)}</td><td><StatusBadge s={m.type} /></td><td className="text-xs max-w-md">{describe(m)}</td><td className="text-xs">{m.reason}</td><td className="text-xs">{m.requester?.name || '—'} <span className="badge bg-gray-100">{m.requestedRole}</span>{m.approver && m.approver.id !== m.requester?.id && <div>✓ {m.approver.name}{m.decisionNote ? ` — ${m.decisionNote}` : ''}</div>}</td><td><StatusBadge s={m.status} /></td></tr>)}</tbody></table>{mods && !mods.length && <div className="text-gray-400 text-center py-4 text-sm">No changes since placement</div>}</div>
    <div className="mt-4 text-xs text-gray-500">{o.events?.map((e: any) => <div key={e.id}>{fmtDT(e.at)} · {e.type}{e.payload?.reason ? ` — ${e.payload.reason}` : ''}</div>)}</div>

    <Modal title={modal === 'DISCOUNT' ? 'Goodwill discount' : modal === 'ITEMS' ? 'Change items' : modal === 'SLOT' ? 'Reschedule' : modal === 'ADDRESS' ? 'Change address' : 'Add note'} open={!!modal} onClose={() => setModal('')}>
      {modal === 'ITEMS' && <div className="space-y-2">{f.items?.map((it: any, i: number) => <div key={i} className="flex gap-2 items-center"><select className="input flex-1" value={it.skuId} onChange={(e) => { const items = [...f.items]; items[i] = { ...it, skuId: e.target.value }; setF({ ...f, items }); }}>{opt?.skus?.map((s: any) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select><input type="number" min={0} className="input w-20" value={it.qty} onChange={(e) => { const items = [...f.items]; items[i] = { ...it, qty: Number(e.target.value) }; setF({ ...f, items }); }} /></div>)}
        <button className="btn-secondary !py-1" onClick={() => setF({ ...f, items: [...f.items, { skuId: opt?.skus?.[0]?.id, qty: 1 }] })}>+ Add line</button><div className="text-xs text-gray-500">Qty 0 removes a line. Existing lines keep the price the customer saw; new lines use today's price. Stock is re-allocated FIFO.</div>
        {o.payment?.status === 'PAID' && <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!f.collectOnDelivery} onChange={(e) => setF({ ...f, collectOnDelivery: e.target.checked })} />Customer already paid — collect any balance on delivery (a decrease is credited to their wallet)</label>}</div>}
      {modal === 'SLOT' && <div className="grid grid-cols-2 gap-2"><Field label="Delivery date"><input type="date" className="input" value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} /></Field><Field label="Slot"><select className="input" value={f.slotId} onChange={(e) => setF({ ...f, slotId: e.target.value })}><option value="">Any</option>{opt?.slots?.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field></div>}
      {modal === 'ADDRESS' && <Field label="Deliver to"><select className="input" value={f.addressId} onChange={(e) => setF({ ...f, addressId: e.target.value })}>{opt?.addresses?.map((a: any) => <option key={a.id} value={a.id}>{a.line1}{a.complex ? ', ' + a.complex : ''} · {a.pincode} ({a.zone?.name || 'no zone'})</option>)}</select></Field>}
      {modal === 'NOTE' && <Field label="Note"><textarea className="input" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>}
      {modal === 'DISCOUNT' && <div className="space-y-2"><div className="flex gap-2"><label className="text-sm"><input type="radio" checked={f.mode === 'amount'} onChange={() => setF({ ...f, mode: 'amount' })} /> Amount ₹</label><label className="text-sm"><input type="radio" checked={f.mode === 'pct'} onChange={() => setF({ ...f, mode: 'pct' })} /> Percent</label></div>
        {f.mode === 'amount' ? <input type="number" className="input" placeholder="₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /> : <input type="number" className="input" placeholder="%" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />}
        <Field label="Link to issue ticket (optional)"><select className="input" value={f.issueId} onChange={(e) => setF({ ...f, issueId: e.target.value })}><option value="">—</option>{opt?.issues?.map((i: any) => <option key={i.id} value={i.id}>#{i.ticketNo} {i.title} ({i.status})</option>)}</select></Field>
        {lim && (() => { const amt = f.mode === 'pct' ? Math.round((o.subtotalPaise + o.gstPaise) * Number(f.pct || 0) / 100) : Math.round(Number(f.amount || 0) * 100); return <div className="text-xs text-gray-500">{amt > 0 && (amt <= myLimit ? 'Within your limit — applies immediately.' : `Above your limit (${paise(myLimit)}) — goes to ${amt <= lim.OPS ? 'Ops' : 'Admin'} for approval.`)}{lim.requireIssueAbovePaise > 0 && amt > lim.requireIssueAbovePaise && !f.issueId ? ' Needs a linked issue.' : ''}</div>; })()}</div>}
      {modal !== 'NOTE' && <Field label="Reason (shown to the customer)"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>}
      <div className="flex justify-end gap-2 mt-3"><button className="btn-secondary" onClick={() => setModal('')}>Cancel</button><button className="btn-primary" onClick={submit}>{modal === 'DISCOUNT' ? 'Apply / request' : 'Save'}</button></div>
    </Modal></div>;
}
