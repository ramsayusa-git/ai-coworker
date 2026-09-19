'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDate, tomorrow } from '@/lib/api';
import { StatusBadge, useToast } from '@/components/ui';
export default function Subs() {
  const { data, mutate } = useSWR('/admin/subscriptions', fetcher); const { show, Toast } = useToast(); const [date, setDate] = useState(tomorrow()); const [result, setResult] = useState<any>(null);
  const run = async () => { try { const r = await api('/admin/subscriptions/run?date=' + date, { method: 'POST' }); setResult(r); mutate(); show(`Created ${r.created}, skipped ${r.skipped}, failed ${r.failed}`); } catch (e: any) { show(e.message, true); } };
  return <div><Toast /><div className="flex justify-between items-center mb-4"><h1 className="text-2xl font-bold">Subscriptions</h1><div className="flex gap-2 items-center"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /><button className="btn-primary" onClick={run}>Run scheduler for this date</button></div></div>
    <p className="text-sm text-gray-600 mb-3">The scheduler runs automatically every night at 22:00 IST for the next day (charges mandate, FIFO-allocates stock, sends the T-24h WhatsApp). Use the button to run it manually.</p>
    {result && <div className="card mb-4 text-sm bg-blue-50">Run for {fmtDate(result.date)}: processed {result.processed}, created {result.created}, skipped {result.skipped}, failed {result.failed}{result.errors?.length > 0 && <ul className="text-red-600 mt-1">{result.errors.map((e: string) => <li key={e}>{e}</li>)}</ul>}</div>}
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Customer</th><th>Product</th><th>Qty</th><th>Frequency</th><th>Next run</th><th>Zone</th><th>Status</th><th>Mandate</th></tr></thead><tbody>
      {data?.map((s: any) => <tr key={s.id}><td>{s.user.name}<br /><small>{s.user.phone}</small></td><td>{s.sku.variety.name} {s.sku.packKg}kg</td><td>{s.qty}</td><td>{s.frequency}</td><td>{fmtDate(s.nextRunOn)}{s.skipNext && <span className="badge bg-amber-100 ml-1">skip</span>}</td><td>{s.address.zone?.name}</td><td><StatusBadge s={s.status} /></td><td className="font-mono text-xs">{s.mandateRef}</td></tr>)}</tbody></table></div></div>;
}
