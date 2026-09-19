'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher, paise, fmtDate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatusBadge, Empty } from '@/components/ui';
export default function Orders() {
  const { user } = useAuth(); const { data } = useSWR(user ? '/orders/mine' : null, fetcher);
  if (!user) return <Link href="/login?next=/shop/orders" className="btn-primary">Login to see orders</Link>;
  if (data && !data.length) return <Empty text="No orders yet" />;
  return <div><h1 className="text-xl font-bold mb-3">My orders</h1>{data?.map((o: any) => <Link key={o.id} href={'/shop/orders/' + o.id} className="card block mb-2"><div className="flex justify-between"><b>#{o.orderNo}</b><StatusBadge s={o.status} /></div><div className="text-sm text-gray-600">{o.items.map((i: any) => `${i.qty}× ${i.sku.variety.name} ${i.sku.packKg}kg`).join(', ')}</div><div className="text-xs text-gray-500 mt-1">Delivery {fmtDate(o.deliveryDate)} {o.slot?.label || ''} · {paise(o.totalPaise)} · {o.payment?.method}</div></Link>)}</div>;
}
