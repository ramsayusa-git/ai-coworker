'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetcher, paise } from '@/lib/api';
import { Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
export default function Dashboard() {
  const { user } = useAuth(); const router = useRouter();
  const canSeeOpsDashboard = user && ['ADMIN', 'OPS'].includes(user.role);
  useEffect(() => {
    if (!user) return;
    if (user.role === 'SALES') router.replace('/admin/leads');
    else if (user.role === 'MARKETING') router.replace('/admin/coupons');
  }, [user]);
  const { data: d } = useSWR(canSeeOpsDashboard ? '/admin/dashboard' : null, fetcher, { refreshInterval: 30000 });
  const { data: iss } = useSWR(canSeeOpsDashboard ? '/issues/stats' : null, fetcher, { refreshInterval: 30000 });
  const { data: wh } = useSWR(canSeeOpsDashboard ? '/admin/warehouses' : null, fetcher);
  if (!canSeeOpsDashboard) return <div className="text-gray-400">Redirecting…</div>;
  if (!d) return <div className="text-gray-400">Loading…</div>;
  return <div><h1 className="text-2xl font-bold mb-4">Today</h1>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3"><Stat label="Orders today" value={d.todayOrders} sub={`${d.delivered} delivered · ${d.failed} failed`} /><Stat label="Tomorrow" value={d.tomorrowOrders} sub="run batching at 05:30" /><Stat label="On-time %" value={d.onTimePct ?? '—'} warn={d.onTimePct !== null && d.onTimePct < 90} /><Stat label="Pending payment" value={d.pendingPay} warn={d.pendingPay > 0} />
      <Stat label="Revenue 30d" value={paise(d.revenue30dPaise)} sub={`${Math.round(d.kg30d)} kg shipped`} /><Stat label="Customers" value={d.customers} sub={`${d.activeSubs} active subscriptions`} /><Stat label="At-risk (35d no order)" value={d.atRiskCustomers} warn={d.atRiskCustomers > 0} /><Stat label="NPS" value={d.nps ?? '—'} sub={`${d.npsResponses} responses`} />
      <Stat label="Low stock (<500 kg)" value={d.lowStock.length ? d.lowStock.join(', ') : 'None'} warn={d.lowStock.length > 0} />
      {iss && <a href="/admin/issues"><Stat label="Open issues" value={iss.open} sub={iss.breached ? `${iss.breached} past SLA` : iss.dueSoon ? `${iss.dueSoon} due within 2h` : 'all within SLA'} warn={iss.breached > 0} /></a>}</div>
    <h2 className="font-semibold mt-6 mb-2">Warehouses</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{wh?.map((w: any) => <Link href="/admin/warehouses" key={w.id} className="card"><b>{w.code}</b> · {w.name}<div className="text-sm text-gray-600">{Math.round(w.onHandKg)} kg on hand · {w.lotCount} lots · value {paise(w.stockValuePaise)}</div><div className="text-xs text-gray-500">Zones: {w.zones.map((z: any) => z.name).join(', ') || '—'}</div></Link>)}</div>
    <div className="mt-6 flex gap-2"><Link href="/admin/dispatch" className="btn-primary">Open dispatch board</Link><Link href="/admin/inventory" className="btn-secondary">Receive stock (GRN)</Link><Link href="/admin/subscriptions" className="btn-secondary">Run subscription job</Link></div></div>;
}
