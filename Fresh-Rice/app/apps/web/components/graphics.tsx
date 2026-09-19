'use client';
import { motion, useInView, useMotionValue, useSpring, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';

/** A single rice grain — used for floating particles and the logo mark */
export function Grain({ size = 24, color = '#f4ecd8', stroke = '#b8862b', className = '', style = {} }: { size?: number; color?: string; stroke?: string; className?: string; style?: React.CSSProperties }) {
  return <svg width={size} height={size * 1.8} viewBox="0 0 20 36" className={className} style={style}><path d="M10 1C15 6 18 14 18 22c0 7-3.5 13-8 13S2 29 2 22C2 14 5 6 10 1z" fill={color} stroke={stroke} strokeWidth="1.2" /><path d="M10 6c1.5 6 1.5 16 0 24" stroke={stroke} strokeWidth="1" opacity=".5" fill="none" /></svg>;
}

/** Floating grains with parallax tied to scroll */
export function GrainField({ count = 14 }: { count?: number }) {
  const { scrollY } = useScroll(); const y = useTransform(scrollY, [0, 800], [0, -120]);
  const grains = Array.from({ length: count }, (_, i) => ({ x: (i * 67) % 100, y: (i * 41) % 100, s: 14 + (i % 4) * 6, d: 6 + (i % 5) * 1.5, r: (i * 37) % 360 }));
  return <motion.div style={{ y }} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
    {grains.map((g, i) => <motion.div key={i} className="absolute" style={{ left: `${g.x}%`, top: `${g.y}%`, rotate: g.r }} animate={{ y: [0, -18, 0], rotate: [g.r, g.r + 12, g.r] }} transition={{ duration: g.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}><Grain size={g.s} color="rgba(255,255,255,.85)" stroke="rgba(184,134,43,.6)" /></motion.div>)}
  </motion.div>;
}

/** Number that counts up when scrolled into view */
export function Counter({ to, prefix = '', suffix = '', decimals = 0, className = '' }: { to: number; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const inView = useInView(ref, { once: true, margin: '-40px' });
  const mv = useMotionValue(0); const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  useEffect(() => { if (inView) mv.set(to); }, [inView, to]);
  useEffect(() => spring.on('change', (v) => { if (ref.current) ref.current.textContent = prefix + v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix; }), [spring]);
  return <span ref={ref} className={className}>{prefix}0{suffix}</span>;
}

/** Word-by-word headline reveal */
export function Reveal({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  return <motion.h1 className={className} initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}>
    {text.split(' ').map((w, i) => <motion.span key={i} className="inline-block mr-[0.28em]" variants={{ h: { opacity: 0, y: 24, filter: 'blur(6px)' }, v: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 120, damping: 16 } } }}>{w}</motion.span>)}
  </motion.h1>;
}

export const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } } } as const;
export function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <motion.section className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={{ show: { transition: { staggerChildren: 0.12 } } }}>{children}</motion.section>;
}

/** Mill → warehouse → door journey with a truck riding the path */
export function Journey() {
  const ref = useRef<HTMLDivElement>(null); const inView = useInView(ref, { once: true, margin: '-60px' });
  const stops = [{ x: 60, label: 'Mill', sub: 'Miryalaguda · Warangal', icon: '🏭' }, { x: 300, label: 'FreshRice MFC', sub: 'Lot QC · moisture · brokens', icon: '🏬' }, { x: 540, label: 'Your door', sub: 'OTP delivery', icon: '🏠' }];
  return <div ref={ref} className="relative w-full overflow-hidden"><svg viewBox="0 0 600 160" className="w-full h-auto">
    <defs><linearGradient id="road" x1="0" x2="1"><stop offset="0" stopColor="#2e7d4f" /><stop offset="1" stopColor="#b8862b" /></linearGradient></defs>
    <motion.path id="jp" d="M60 100 C 160 20, 200 180, 300 100 S 440 20, 540 100" fill="none" stroke="url(#road)" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}} transition={{ duration: 1.8, ease: 'easeInOut' }} />
    {stops.map((s, i) => <motion.g key={s.label} initial={{ opacity: 0, scale: 0.6 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.4 + i * 0.5, type: 'spring', stiffness: 160 }}>
      <circle cx={s.x} cy="100" r="22" fill="#fff" stroke="#2e7d4f" strokeWidth="2" /><text x={s.x} y="107" textAnchor="middle" fontSize="20">{s.icon}</text>
      <text x={s.x} y="140" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1f3a5f">{s.label}</text><text x={s.x} y="153" textAnchor="middle" fontSize="8" fill="#666">{s.sub}</text></motion.g>)}
    <motion.text fontSize="22" initial={{ offsetDistance: '0%' }} animate={inView ? { offsetDistance: ['0%', '100%'] } : {}} transition={{ duration: 4, delay: 1.2, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }} style={{ offsetPath: "path('M60 100 C 160 20, 200 180, 300 100 S 440 20, 540 100')", offsetRotate: '0deg' } as any} dy="-26">🛺</motion.text>
  </svg></div>;
}

/** 3D-flipping bag label */
export function BagLabel() {
  return <motion.div className="relative w-full max-w-sm mx-auto [perspective:1200px]" initial={{ opacity: 0, rotateY: -30 }} whileInView={{ opacity: 1, rotateY: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 60, damping: 14 }}>
    <motion.div whileHover={{ rotateY: 8, rotateX: -6, scale: 1.02 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} className="rounded-2xl bg-gradient-to-br from-rice-100 to-white border-2 border-dashed border-rice-500 p-5 font-mono text-sm shadow-xl [transform-style:preserve-3d]">
      <div className="flex justify-between items-start"><div><div className="text-[10px] uppercase tracking-widest text-rice-700">FreshRice · Lot label</div><div className="text-2xl font-bold text-gray-900">SONA MASOORI</div></div><div className="text-3xl font-black text-leaf-700">20<span className="text-base font-bold">kg</span></div></div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-700">
        <span className="text-gray-400">Lot</span><b>LOT-SONA-2508-01</b><span className="text-gray-400">Mill</span><span>Sri Balaji Rice Mills, Miryalaguda</span><span className="text-gray-400">Harvest</span><span>Kharif 2025 · Milled 12 Jan 2026</span>
        <span className="text-gray-400">Aged</span><motion.span className="text-leaf-700 font-bold" animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }}>8 months ✔</motion.span><span className="text-gray-400">Spec</span><span>Moisture 12.4% · Brokens 2.1%</span></div>
      <div className="mt-3 flex items-center gap-3"><div className="grid grid-cols-6 gap-[2px] w-12 h-12">{Array.from({ length: 36 }, (_, i) => <div key={i} className={((i * 7) % 3 ? 'bg-gray-900' : 'bg-transparent') + ' rounded-[1px]'} />)}</div><div className="text-[10px] text-gray-500 leading-tight">FSSAI 13626000000000<br />Net Qty 20 kg · MRP incl. GST<br />Scan to verify this lot</div></div>
    </motion.div></motion.div>;
}

/** Shimmer skeleton */
export const Skeleton = ({ className = '' }: { className?: string }) => <div className={'animate-pulse rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] ' + className} style={{ animation: 'shimmer 1.4s linear infinite' }} />;
