'use client';
import { useEffect, useRef } from 'react';

/**
 * Leaflet + OpenStreetMap map, loaded from CDN on first use (no npm dep, no API key).
 * markers: riders (green = online, grey = stale/no fix) and an optional destination pin.
 */
export type MapMarker = { id: string; lat: number; lng: number; label: string; sub?: string; kind?: 'rider' | 'rider-stale' | 'dest' | 'me' };

let loading: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => res(w.L); s.onerror = rej; document.head.appendChild(s);
  });
  return loading;
}

const ICON: Record<string, string> = {
  rider: '<div style="background:#2e7d4f;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🛵</div>',
  'rider-stale': '<div style="background:#9ca3af;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:.85">🛵</div>',
  dest: '<div style="background:#b8862b;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🏠</div>',
  me: '<div style="background:#2563eb;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">●</div>',
};

export function LiveMap({ markers, height = 320, fitOnChange = false, className = '' }: { markers: MapMarker[]; height?: number; fitOnChange?: boolean; className?: string }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<any>(null); const layer = useRef<any>(null); const fitted = useRef(false);
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([17.4849, 78.3914], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }
      layer.current.clearLayers();
      const pts: any[] = [];
      for (const m of markers) {
        const icon = L.divIcon({ html: ICON[m.kind || 'rider'], className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18] });
        const mk = L.marker([m.lat, m.lng], { icon }).bindPopup(`<b>${m.label}</b>${m.sub ? '<br>' + m.sub : ''}`);
        layer.current.addLayer(mk); pts.push([m.lat, m.lng]);
      }
      if (pts.length && (!fitted.current || fitOnChange)) { map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); fitted.current = true; }
    }).catch(() => {});
    return () => { dead = true; };
  }, [markers, fitOnChange]);
  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null; } }, []);
  return <div ref={el} style={{ height }} className={'rounded-lg overflow-hidden border bg-rice-100 ' + className} />;
}

export const timeAgo = (d?: string | Date | null) => { if (!d) return 'never'; const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000); return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
export const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
