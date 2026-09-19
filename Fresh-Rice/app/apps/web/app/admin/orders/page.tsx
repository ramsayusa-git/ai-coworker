'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, ymd, API, getToken } from '@/lib/api';
import { StatusBadge, useToast, Empty } from '@/components/ui';

const NEXT: Record<string, string[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'], OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'], FAILED: ['CONFIRMED'],
};
const STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED'];
const TONE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-blue-100 text-blue-800',
  PACKED: 'bg-indigo-100 text-indigo-800', OUT_FOR_DELIVERY: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800', CANCELLED: 'bg-gray-200 text-gray-700', FAILED: 'bg-red-100 text-red-800',
};

export default function Orders() {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { show, Toast } = useToast();
  const { data, mutate, isLoading } = useSWR(`/admin/orders?${date ? 'date=' + date + '&' : ''}${status ? 'status=' + status : ''}`, fetcher);

  const move = async (id: string, s: string) => {
    try { await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status: s } }); mutate(); show(`Moved to ${s.replace(/_/g, ' ').toLowerCase()}`); }
    catch (e: any) { show(e.message, true); }
  };

  // Search is client-side over the loaded page — the list endpoint filters by date/status only.
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((o: any) =>
      String(o.orderNo).includes(needle) ||
      (o.user?.name || '').toLowerCase().includes(needle) ||
      (o.user?.phone || '').includes(needle) ||
      (o.address?.zone?.name || '').toLowerCase().includes(needle));
  }, [data, q]);

  const summary = useMemo(() => {
    const s: Record<string, number> = {};
    let kg = 0, value = 0;
    for (const o of rows) { s[o.status] = (s[o.status] || 0) + 1; kg += o.totalKg || 0; value += o.totalPaise || 0; }
    return { s, kg, value, n: rows.length };
  }, [rows]);

  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));

  return <div><Toast />
    {/* Filters */}
    <div className="card-modern mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search order no, customer, phone, zone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-1">
          {[['', 'Any date'], [today, 'Today'], [tomorrow, 'Tomorrow']].map(([v, l]) =>
            <button key={l} onClick={() => setDate(v)}
              className={'rounded-lg border px-3 py-1.5 text-xs transition ' + (date === v ? 'bg-leaf-600 text-white border-leaf-600' : 'bg-white hover:bg-gray-50')}>{l}</button>)}
        </div>
        {(q || date || status) && <button className="text-xs underline text-gray-500" onClick={() => { setQ(''); setDate(''); setStatus(''); }}>Clear</button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <button onClick={() => setStatus('')} className={'rounded-full px-3 py-1 text-xs font-medium transition ' + (!status ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200')}>All</button>
        {STATUSES.map((s) => <button key={s} onClick={() => setStatus(status === s ? '' : s)}
          className={'rounded-full px-3 py-1 text-xs font-medium transition ' + (status === s ? 'bg-gray-900 text-white' : TONE[s] + ' hover:opacity-80')}>
          {s.replace(/_/g, ' ').toLowerCase()}{summary.s[s] ? ` ${summary.s[s]}` : ''}</button>)}
      </div>
    </div>

    {/* Summary of whatever the filters currently select */}
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[['Orders', summary.n], ['Rice', `${Math.round(summary.kg)} kg`], ['Value', paise(summary.value)]].map(([l, v]) =>
        <div key={l as string} className="card-modern card-grad">
          <div className="text-xs text-gray-500">{l}</div><div className="text-xl font-bold">{v}</div>
        </div>)}
    </div>

    <div className="card-modern overflow-auto p-0">
      {isLoading && <div className="p-6 text-center text-gray-400">Loading orders…</div>}
      {!isLoading && !rows.length && <Empty text={q || date || status ? 'No orders match these filters' : 'No orders yet'} />}
      {rows.length > 0 && <table className="tbl">
        <thead><tr><th>Order</th><th>Delivery</th><th>Customer</th><th>Zone / address</th><th>Items</th><th className="text-right">kg</th><th className="text-right">Total</th><th>Payment</th><th>Status</th><th>Route</th><th></th></tr></thead>
        <tbody>{rows.map((o: any) => <tr key={o.id} className="hover:bg-rice-50/60">
          <td className="whitespace-nowrap">
            <a className="font-semibold text-leaf-700 underline underline-offset-2" href={`/admin/orders/${o.id}`}>#{o.orderNo}</a>
            {o.revision > 1 && <span className="ml-1 text-[10px] text-gray-400">r{o.revision}</span>}
            <div><span className="badge bg-gray-100">{o.channel}</span></div>
          </td>
          <td className="whitespace-nowrap">{fmtDate(o.deliveryDate)}<div className="text-xs text-gray-500">{o.slot?.label}</div></td>
          <td>{o.user.name}<div className="text-xs text-gray-500">{o.user.phone}</div></td>
          <td><b>{o.address.zone?.name || '—'}</b><div className="text-xs text-gray-500 max-w-[16rem] truncate">{o.address.line1}{o.address.complex ? ', ' + o.address.complex : ''}</div></td>
          <td className="text-xs max-w-[12rem]">{o.items.map((i: any) => `${i.qty}× ${i.sku.code}`).join(', ')}</td>
          <td className="text-right">{o.totalKg}</td>
          <td className="text-right font-medium whitespace-nowrap">{paise(o.totalPaise)}</td>
          <td className="text-xs whitespace-nowrap">{o.payment?.method}<div><StatusBadge s={o.payment?.status || '-'} /></div></td>
          <td><span className={'badge ' + (TONE[o.status] || 'bg-gray-100')}>{o.status.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td className="text-xs text-gray-500">{o.stop ? `stop ${o.stop.seq}` : '—'}</td>
          <td className="text-xs whitespace-nowrap">
            {(NEXT[o.status] || []).map((s) => <button key={s} className="btn-secondary !py-0.5 !px-2 mr-1 mb-1" onClick={() => move(o.id, s)}>{s.replace(/_/g, ' ').toLowerCase()}</button>)}
            <a className="underline text-gray-500" target="_blank" href={`${API}/v1/orders/${o.id}/invoice.html?t=${getToken()}`}>invoice</a>
          </td></tr>)}</tbody>
      </table>}
    </div>
  </div>;
}
