'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, fmtDate, paise } from '@/lib/api';
import { motion } from 'framer-motion';

/** "Compare your supermarket bag": packed date + MRP + pack size → how old that rice really is and what it costs per kg vs ours. */
function CompareBag({ ourPerKgPaise, variety }: { ourPerKgPaise: number | null; variety: string }) {
  const [packed, setPacked] = useState(''); const [mrp, setMrp] = useState(''); const [kg, setKg] = useState('25'); const [open, setOpen] = useState(false);
  const packedDate = packed ? new Date(packed) : null;
  // Packed-on is always AFTER milling, so "months since packed" is a floor on the rice's real age.
  const minMonths = packedDate && !isNaN(packedDate.getTime()) ? Math.max(0, Math.floor((Date.now() - packedDate.getTime()) / (30 * 86400000))) : null;
  const theirPerKg = mrp && Number(kg) > 0 ? (Number(mrp) * 100) / Number(kg) : null;
  const diff = theirPerKg && ourPerKgPaise ? theirPerKg - ourPerKgPaise : null;
  return <div className="mt-3">
    <button className="btn-secondary w-full" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Compare your supermarket bag'}</button>
    {open && <div className="bg-white border rounded-lg p-3 mt-2 text-sm space-y-2">
      <div className="text-xs text-gray-500">From the back of a supermarket rice bag. Most bags print a packed-on date and never the milling date.</div>
      <label className="label">Packed on <input type="date" className="input" value={packed} onChange={(e) => setPacked(e.target.value)} /></label>
      <div className="flex gap-2"><label className="label flex-1">MRP ₹ <input type="number" className="input" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="1450" /></label><label className="label w-24">Pack kg <input type="number" className="input" value={kg} onChange={(e) => setKg(e.target.value)} /></label></div>
      {(minMonths !== null || theirPerKg) && <div className="bg-rice-100 rounded p-2 mt-1">
        {minMonths !== null && <div>That bag was packed <b>{minMonths} month{minMonths === 1 ? '' : 's'} ago</b> — and it was milled some time before that, so the rice is <b>at least {minMonths} months old</b>. The bag doesn't tell you how much older.</div>}
        {theirPerKg && <div className="mt-1">You'd pay <b>{paise(Math.round(theirPerKg))}/kg</b> for it{ourPerKgPaise ? <> vs <b>{paise(ourPerKgPaise)}/kg</b> for this {variety} mill-direct{diff && diff > 0 ? <span className="text-leaf-700"> — {paise(Math.round(diff))}/kg more for rice of unknown age.</span> : '.'}</> : '.'}</div>}
      </div>}
    </div>}
  </div>;
}

export default function Trace({ params }: { params: Promise<{ lotNo: string }> }) {
  const { lotNo } = use(params);
  const { data, isLoading } = useSWR(`/inventory/trace/${encodeURIComponent(lotNo)}`, fetcher);

  if (isLoading) return <main className="min-h-screen flex items-center justify-center p-4 hero-bg"><div className="card w-full max-w-md text-center text-gray-500">Loading…</div></main>;
  if (!data?.found) return <main className="min-h-screen flex items-center justify-center p-4 hero-bg"><div className="card w-full max-w-md text-center">
    <h1 className="text-lg font-bold mb-2">Lot not found</h1>
    <p className="text-sm text-gray-500">We couldn't find a bag with the code <b>{lotNo}</b>. Check the code on your bag label, or contact us if you think this is a mistake.</p>
    <Link href="/" className="btn-primary w-full mt-4 inline-block">Back to FreshRice</Link>
  </div></main>;

  const aged = data.agedPreferred;
  // For aged-preferred varieties, 6-12 months is the sweet spot we advertise; meter fills toward that.
  const meterPct = aged ? Math.min(100, Math.round((data.agedMonths / 9) * 100)) : Math.min(100, Math.round((data.agedMonths / 3) * 100));
  const inSweetSpot = aged ? data.agedMonths >= 6 && data.agedMonths <= 12 : data.agedMonths <= 2;

  return <main className="min-h-screen p-4 hero-bg flex items-start justify-center">
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} className="card w-full max-w-md mt-6">
      <div className="text-xs uppercase tracking-wide text-rice-600 font-semibold mb-1">Aged vs Just-Milled</div>
      <h1 className="text-xl font-bold mb-1">Lot {data.lotNo}</h1>
      <p className="text-sm text-gray-500 mb-4">Supermarkets don't tell you how old their rice is. We do — every bag, every time.</p>

      <div className="bg-rice-100 rounded-lg p-3 mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-semibold">{aged ? `Aged ${data.agedMonths} months` : `Milled ${data.agedMonths} months ago`}</span>
          <span className={inSweetSpot ? 'text-leaf-700 font-semibold' : 'text-amber-700 font-semibold'}>{inSweetSpot ? (aged ? 'In the sweet spot' : 'Just-milled fresh') : aged ? 'Still young' : 'Getting older'}</span>
        </div>
        <div className="h-2 rounded-full bg-white overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${meterPct}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${inSweetSpot ? 'bg-leaf-600' : 'bg-amber-500'}`} />
        </div>
        <div className="text-xs text-gray-500 mt-1">{aged ? 'This variety is best 6–12 months after milling — properly aged rice cooks up separate and fluffy.' : 'This variety is meant to be eaten fresh, close to milling, for the best texture and aroma.'}</div>
      </div>

      <div className="text-sm space-y-2">
        <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Variety</span><b>{data.variety}</b></div>
        <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Mill</span><b>{data.mill}{data.district ? `, ${data.district}` : ''}</b></div>
        <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Harvest season</span><b>{data.harvestSeason}</b></div>
        <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Milled on</span><b>{fmtDate(data.milledOn)}</b></div>
        <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Moisture</span><b>{data.moisturePct}%</b></div>
        <div className="flex justify-between"><span className="text-gray-500">Brokens</span><b>{data.brokenPct}%</b></div>
      </div>

      {data.cook && <div className="mt-4 bg-leaf-600/10 border border-leaf-600/30 rounded-lg p-3">
        <div className="text-xs uppercase tracking-wide text-leaf-700 font-semibold mb-1">Cook mode · for this exact lot</div>
        <div className="grid grid-cols-3 gap-2 text-center my-2">
          <div className="bg-white rounded p-2"><div className="text-lg font-bold">{data.cook.ratio}</div><div className="text-xs text-gray-500">rice : water</div></div>
          <div className="bg-white rounded p-2"><div className="text-lg font-bold">{data.cook.soakMin} min</div><div className="text-xs text-gray-500">soak</div></div>
          <div className="bg-white rounded p-2"><div className="text-lg font-bold">{data.cook.cookerWhistles}</div><div className="text-xs text-gray-500">whistles · or {data.cook.potMin} min pot</div></div>
        </div>
        <div className="text-xs text-gray-600">{data.cook.note} Worked out from this lot's age ({data.agedMonths} mo) and moisture ({data.moisturePct}%).</div>
      </div>}

      {data.millStory && <div className="mt-4 border rounded-lg overflow-hidden">
        {data.millStory.photo && <img src={data.millStory.photo} alt={data.millStory.title} className="w-full h-40 object-cover" />}
        <div className="p-3"><div className="text-xs uppercase tracking-wide text-rice-600 font-semibold">From the mill</div><div className="font-semibold">{data.millStory.title}</div><p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{data.millStory.text}</p></div>
      </div>}

      <CompareBag ourPerKgPaise={data.ourPricePerKgPaise} variety={data.variety} />

      <Link href="/shop" className="btn-primary w-full mt-5 inline-block text-center">Order fresh from the mill</Link>
    </motion.div>
  </main>;
}
