'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetcher, paise } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WidgetGrid, type Widget } from '@/components/widget-grid';

/** One metric. `tone` drives the accent bar; `warn` turns it amber. */
function Metric({ label, value, sub, warn, accent = 'leaf', href }: {
  label: string; value: any; sub?: any; warn?: boolean; accent?: 'leaf' | 'rice' | 'red'; href?: string;
}) {
  const bar = warn ? 'from-amber-400 to-amber-600'
    : accent === 'rice' ? 'from-rice-500 to-rice-700'
    : accent === 'red' ? 'from-red-400 to-red-600'
    : 'from-leaf-500 to-leaf-700';
  const body = <div className={'card-modern card-grad h-full overflow-hidden relative ' + (warn ? 'border-amber-300' : '')}>
    <div className={'absolute inset-x-0 top-0 h-1 bg-gradient-to-r ' + bar} />
    <div className="text-xs text-gray-500 mt-1">{label}</div>
    <div className="text-2xl font-bold tracking-tight mt-0.5 break-words">{value ?? '—'}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>;
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

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
  const { data: ap } = useSWR(canSeeOpsDashboard ? '/admin/approvals/stats' : null, fetcher, { refreshInterval: 30000 });
  const { data: wh } = useSWR(canSeeOpsDashboard ? '/admin/warehouses' : null, fetcher);
  const { data: st } = useSWR(canSeeOpsDashboard ? '/inventory/stickers/stats' : null, fetcher, { refreshInterval: 60000 });

  const widgets: Widget[] = useMemo(() => {
    if (!d) return [];
    const w: Widget[] = [
      { id: 'orders-today', title: 'Orders today', node: <Metric label="Orders today" value={d.todayOrders} sub={`${d.delivered} delivered · ${d.failed} failed`} href="/admin/orders" /> },
      { id: 'tomorrow', title: 'Tomorrow', node: <Metric label="Tomorrow" value={d.tomorrowOrders} sub="batching runs 05:30" href="/admin/dispatch" /> },
      { id: 'on-time', title: 'On-time %', node: <Metric label="On-time %" value={d.onTimePct ?? '—'} warn={d.onTimePct !== null && d.onTimePct < 90} /> },
      { id: 'pending-pay', title: 'Pending payment', node: <Metric label="Pending payment" value={d.pendingPay} warn={d.pendingPay > 0} /> },
      { id: 'revenue', title: 'Revenue 30d', node: <Metric label="Revenue 30d" value={paise(d.revenue30dPaise)} sub={`${Math.round(d.kg30d)} kg shipped`} accent="rice" /> },
      { id: 'customers', title: 'Customers', node: <Metric label="Customers" value={d.customers} sub={`${d.activeSubs} active subscriptions`} href="/admin/customers" /> },
      { id: 'at-risk', title: 'At-risk', node: <Metric label="At-risk (35d no order)" value={d.atRiskCustomers} warn={d.atRiskCustomers > 0} /> },
      { id: 'nps', title: 'NPS', node: <Metric label="NPS" value={d.nps ?? '—'} sub={`${d.npsResponses} responses`} warn={d.nps !== null && d.nps < 0} /> },
      { id: 'low-stock', title: 'Low stock', node: <Metric label="Low stock (<500 kg)" value={d.lowStock.length ? d.lowStock.join(', ') : 'None'} warn={d.lowStock.length > 0} href="/admin/inventory" /> , defaultSpan: 2 },
    ];
    if (ap && ap.pendingApprovals > 0) w.push({ id: 'approvals', title: 'Awaiting approval',
      node: <Metric label="Awaiting approval" value={ap.pendingApprovals} sub={`${ap.discountsToday} discounts today · ${paise(ap.discountPaiseToday)}`} warn href="/admin/approvals" /> });
    if (iss) w.push({ id: 'issues', title: 'Open issues',
      node: <Metric label="Open issues" value={iss.open} warn={iss.breached > 0} href="/admin/issues"
        sub={iss.breached ? `${iss.breached} past SLA` : iss.dueSoon ? `${iss.dueSoon} due within 2h` : 'all within SLA'} /> });
    if (st) w.push({ id: 'stickers', title: 'Bag stickers',
      node: <Metric label="Bag stickers applied" value={st.applied} accent={st.suspicious ? 'red' : 'leaf'} warn={st.suspicious > 0} href="/admin/stickers"
        sub={st.suspicious ? `${st.suspicious} duplicate-scan alert${st.suspicious === 1 ? '' : 's'}` : `${st.totalScans} customer scans`} /> });

    if (wh?.length) w.push({ id: 'warehouses', title: 'Warehouses', defaultSpan: 4, node:
      <div className="card-modern h-full">
        <div className="font-semibold mb-2">Warehouses</div>
        <div className="grid gap-3 md:grid-cols-3">{wh.map((x: any) => <Link href="/admin/warehouses" key={x.id}
          className="rounded-xl border border-gray-200 p-3 hover:border-leaf-500 transition">
          <b>{x.code}</b> · {x.name}
          <div className="text-sm text-gray-600">{Math.round(x.onHandKg)} kg · {x.lotCount} lots · {paise(x.stockValuePaise)}</div>
          <div className="text-xs text-gray-500">Zones: {x.zones.map((z: any) => z.name).join(', ') || '—'}</div>
        </Link>)}</div>
      </div> });

    w.push({ id: 'actions', title: 'Quick actions', defaultSpan: 4, node:
      <div className="card-modern brand-grad text-white h-full">
        <div className="font-semibold mb-2">Quick actions</div>
        <div className="flex flex-wrap gap-2">
          {[['/admin/dispatch', 'Open dispatch board'], ['/admin/inventory', 'Receive stock (GRN)'],
            ['/admin/stickers', 'Print bag stickers'], ['/admin/subscriptions', 'Run subscription job']].map(([h, l]) =>
            <Link key={h} href={h} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm backdrop-blur hover:bg-white/25 transition">{l}</Link>)}
        </div>
      </div> });
    return w;
  }, [d, iss, ap, wh, st]);

  if (!canSeeOpsDashboard) return <div className="text-gray-400">Redirecting…</div>;
  if (!d) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card-modern h-24 animate-pulse bg-gray-100" />)}
  </div>;

  return <WidgetGrid widgets={widgets} storageKey="fr_dash_layout" />;
}
