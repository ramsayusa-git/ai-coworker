'use client';
import { useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LiveMap, timeAgo, wa, type MapMarker } from '@/components/live-map';

/** Riders on the road right now — visible to any logged-in user (customers, B2B, staff). */
export default function RidersOnTheRoad() {
  const { user } = useAuth();
  const { data: riders } = useSWR(user ? '/riders/live' : null, fetcher, { refreshInterval: 10000 });
  const markers: MapMarker[] = useMemo(() => (riders || []).filter((r: any) => r.loc).map((r: any) => ({ id: r.id, lat: r.loc.lat, lng: r.loc.lng, kind: r.online ? 'rider' : 'rider-stale', label: r.name || 'Rider', sub: `${r.phone} · ${r.route?.zone || ''} · ${timeAgo(r.loc.at)}` })), [riders]);
  if (!user) return <Link href="/login?next=/shop/riders" className="btn-primary">Login to see riders</Link>;
  return <div>
    <h1 className="text-xl font-bold">Riders on the road</h1>
    <p className="text-sm text-gray-500 mb-3">Every FreshRice rider out delivering right now, live. Tap a rider to call or WhatsApp them.</p>
    <LiveMap markers={markers} height={340} />
    <div className="mt-3 space-y-2">
      {riders && !riders.length && <div className="card text-sm text-gray-500 text-center">No riders on a route at the moment.</div>}
      {riders?.map((r: any) => <div key={r.id} className="card flex justify-between items-center text-sm">
        <div><div className="font-semibold">🛵 {r.name}{r.online ? <span className="badge bg-green-100 text-green-700 ml-2">live</span> : <span className="badge bg-gray-100 text-gray-600 ml-2">seen {timeAgo(r.loc?.at)}</span>}</div>
          <div className="text-xs text-gray-500">{r.route?.zone} · {r.route?.delivered}/{r.route?.stops} deliveries done</div></div>
        <div className="flex gap-2"><a className="btn-secondary !py-1" href={'tel:' + r.phone}>Call</a><a className="btn-primary !py-1" target="_blank" href={wa(r.phone)}>WhatsApp</a></div>
      </div>)}
    </div>
  </div>;
}
