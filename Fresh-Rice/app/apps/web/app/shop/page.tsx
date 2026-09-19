'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { fetcher, paise, fmtDate } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useToast } from '@/components/ui';
import { Grain, Skeleton, fadeUp } from '@/components/graphics';
function ShopInner() {
  const sp = useSearchParams(); const [pin, setPin] = useState(sp.get('pincode') || '');
  useEffect(() => { if (!pin) { try { setPin(localStorage.getItem('fr_pin') || '500072'); } catch {} } else { try { localStorage.setItem('fr_pin', pin); } catch {} } }, [pin]);
  const { data, error } = useSWR(pin.length === 6 ? '/catalog?pincode=' + pin : null, fetcher);
  const { add } = useCart(); const { show, Toast } = useToast(); const [fly, setFly] = useState<{ x: number; y: number; k: number } | null>(null);
  const onAdd = (v: any, s: any, e: React.MouseEvent) => { add({ skuId: s.id, code: s.code, name: v.name, packKg: s.packKg, pricePaise: s.pricePaise, gstPct: s.gstPct }); setFly({ x: e.clientX, y: e.clientY, k: Date.now() }); show(`Added ${v.name} ${s.packKg}kg`); };
  const list = data?.items || [];
  return <div><Toast />
    <AnimatePresence>{fly && <motion.div key={fly.k} className="fixed z-50 pointer-events-none" style={{ left: fly.x, top: fly.y }} initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 0.3, x: typeof window !== 'undefined' ? window.innerWidth / 2 + 220 - fly.x : 0, y: -fly.y + 24 }} transition={{ duration: 0.7, ease: 'easeIn' }} onAnimationComplete={() => setFly(null)}><Grain size={28} /></motion.div>}</AnimatePresence>
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mb-4"><span className="text-sm text-gray-600">Delivering to</span><input className="input max-w-[110px]" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} inputMode="numeric" /><AnimatePresence mode="wait">{data?.zone ? <motion.span key="z" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="badge bg-green-100 text-green-700">{data.zone.name}</motion.span> : data && <motion.span key="n" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="badge bg-amber-100 text-amber-800">Not serviceable yet</motion.span>}</AnimatePresence></motion.div>
    {error && <div className="text-red-600 text-sm">{error.message}</div>}
    {!data && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-72 mt-2" /><div className="flex gap-2 mt-3">{[0, 1, 2].map((j) => <Skeleton key={j} className="h-12 w-24" />)}</div></div>)}</div>}
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
      {list.filter((v: any) => !v.isAddon).map((v: any) => <Variety key={v.id} v={v} onAdd={onAdd} />)}
      {list.some((v: any) => v.isAddon) && <motion.h2 variants={fadeUp} className="font-semibold mt-6 mb-2">Add-ons — same delivery, no extra fee</motion.h2>}
      {list.filter((v: any) => v.isAddon).map((v: any) => <Variety key={v.id} v={v} onAdd={onAdd} />)}
    </motion.div></div>;
}
function Variety({ v, onAdd }: { v: any; onAdd: (v: any, s: any, e: React.MouseEvent) => void }) {
  const aged = v.agedPreferred && v.lot;
  return <motion.div variants={fadeUp} layout className="card mb-3 relative overflow-hidden"><motion.div className="absolute -right-6 -top-6 opacity-[.07]" animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}><Grain size={70} /></motion.div>
    <div className="font-semibold">{v.name} <span className="text-gray-400 text-sm">{v.nameTe}</span></div>
    {v.lot ? <div className="text-xs text-gray-600 mt-1">Lot {v.lot.lotNo} · {v.lot.mill}, {v.lot.district}<br />Harvest {v.lot.harvestSeason} · Milled {fmtDate(v.lot.milledOn)} · {aged ? <motion.b className={v.lot.agedMonths >= 6 ? 'text-leaf-700' : 'text-amber-700'} animate={{ opacity: [1, 0.55, 1] }} transition={{ duration: 2.2, repeat: Infinity }}>Aged {v.lot.agedMonths} mo</motion.b> : <b>Fresh ({v.lot.agedMonths} mo)</b>} · Moisture {v.lot.moisturePct}% · Brokens {v.lot.brokenPct}%</div> : <div className="text-xs text-red-600 mt-1">Out of stock</div>}
    <div className="flex flex-wrap gap-2 mt-3">{v.skus.map((s: any) => <motion.button key={s.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} disabled={!s.inStock} onClick={(e) => onAdd(v, s, e)} className="btn-secondary flex-col !items-start !py-1.5"><span className="font-semibold">{s.packKg} kg</span><span className="text-xs text-gray-600">{paise(s.pricePaise)} · {paise(Math.round(s.pricePaise / s.packKg))}/kg{s.gstPct ? ' +GST' : ''}</span></motion.button>)}</div></motion.div>;
}
export default function Shop() { return <Suspense><ShopInner /></Suspense>; }
