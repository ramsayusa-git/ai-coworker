'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, API, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Stat, StatusBadge } from '@/components/ui';
export default function B2B() {
  const { user, loading } = useAuth(); const { data: acc } = useSWR(user?.b2bAccountId ? '/b2b/account' : null, fetcher); const { data: orders } = useSWR(user ? '/orders/mine' : null, fetcher);
  if (!loading && !user) return <Landing />;
  if (user && !user.b2bAccountId) return <Landing />;
  if (!acc) return <div className="p-8 text-gray-400">Loading…</div>;
  const spend = orders?.filter((o: any) => o.status === 'DELIVERED').reduce((a: number, o: any) => a + o.totalPaise, 0) || 0; const kg = orders?.filter((o: any) => o.status === 'DELIVERED').reduce((a: number, o: any) => a + o.totalKg, 0) || 0;
  return <div className="max-w-3xl mx-auto min-h-screen p-4">
    <header className="flex justify-between items-center mb-4"><div><h1 className="text-xl font-bold">🏢 {acc.name}</h1><div className="text-xs text-gray-500">GSTIN {acc.gstin || '—'} · Price tier {acc.tier} · Prepaid (UPI / card / cash on delivery)</div></div><Link href="/shop" className="btn-primary">Order bulk →</Link></header>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4"><Stat label="Orders" value={orders?.length ?? 0} /><Stat label="Delivered kg" value={Math.round(kg)} /><Stat label="Total spend" value={paise(spend)} /></div>
    <div className="card"><div className="font-semibold mb-2">Orders & GST invoices</div><table className="tbl"><thead><tr><th>#</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>{orders?.map((o: any) => <tr key={o.id}><td>{o.orderNo}</td><td>{fmtDate(o.deliveryDate)}</td><td>{o.items.map((i: any) => `${i.qty}×${i.sku.packKg}kg`).join(', ')}</td><td>{paise(o.totalPaise)}</td><td className="text-xs">{o.payment?.method}</td><td><StatusBadge s={o.status} /></td><td>{o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED' && <a className="underline text-xs" target="_blank" href={`${API}/v1/orders/${o.id}/invoice.html?t=${getToken()}`}>Invoice</a>}</td></tr>)}</tbody></table></div></div>;
}
function Landing() {
  return <div className="max-w-3xl mx-auto min-h-screen p-6"><h1 className="text-3xl font-bold">Bulk rice for PGs, hostels, restaurants & caterers</h1>
    <p className="mt-3 text-gray-700">25 kg and 50 kg packs at tier pricing (from ₹48/kg on 100 kg+), aged Sona Masoori/HMT/BPT and steam Basmati, GST tax invoices, deliveries in off-peak windows. Prepaid — UPI, card or cash on delivery.</p>
    <div className="card mt-6"><b>Open a business account</b><p className="text-sm text-gray-600 mt-1">WhatsApp <a className="underline" href="https://wa.me/919000000001">+91 90000 00001</a> with your business name, GSTIN and weekly rice usage. Accounts are live within a day. Already have one? <Link href="/login?next=/b2b" className="underline">Login</Link>.</p></div></div>;
}
