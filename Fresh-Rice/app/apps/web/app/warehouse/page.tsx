'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, ymd, API, getToken } from '@/lib/api';
import { Modal, Field, useToast, Empty } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// Scoped to the logged-in warehouse staff's own warehouse — the API already filters
// by their warehouseId, this page just doesn't offer a warehouse picker.
export default function WarehouseHome() {
  const { user } = useAuth();
  const { data: summary, mutate: m1 } = useSWR('/inventory/summary', fetcher);
  const { data: lots, mutate: m2 } = useSWR('/inventory/lots', fetcher);
  const { data: vendors } = useSWR('/admin/vendors', fetcher);
  const { data: cat } = useSWR('/catalog', fetcher);
  const { show, Toast } = useToast();
  const [grn, setGrn] = useState(false);
  const [f, setF] = useState<any>({ lotNo: 'LOT-' + ymd(new Date()).replace(/-/g, '').slice(2) + '-', vendorId: '', warehouseId: user?.warehouseId || '', varietyId: '', harvestSeason: 'Kharif 2025', milledOn: ymd(new Date()), moisturePct: 12.5, brokenPct: 2.5, costRupees: 44, receivedKg: 1000 });
  const submitGrn = async () => { try { await api('/inventory/grn', { body: { ...f, warehouseId: user?.warehouseId, costPaisePerKg: Math.round(f.costRupees * 100) } }); setGrn(false); m1(); m2(); show('Lot received; vendor bill posted'); } catch (e: any) { show(e.message, true); } };

  return <div><Toast />
    <div className="flex justify-between items-center mb-4"><h1 className="text-2xl font-bold">Your warehouse stock</h1><button className="btn-primary" onClick={() => setGrn(true)}>+ Receive stock (GRN)</button></div>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      {summary?.map((v: any) => <div key={v.id} className={'card ' + (v.low ? 'border-amber-400 bg-amber-50' : '')}>
        <div className="text-xs text-gray-500">{v.code}</div><div className="font-semibold">{v.name}</div>
        <div className="text-2xl font-bold">{Math.round(v.onHandKg)} <span className="text-sm font-normal">kg</span></div>
        {v.low && <div className="text-xs text-amber-700 font-medium mt-1">Low stock — reorder</div>}
      </div>)}
    </div>
    {!lots?.length && <Empty text="No lots at your warehouse yet" />}
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Lot</th><th>Variety</th><th>Vendor</th><th>Milled</th><th>Aged</th><th>Moist %</th><th>On hand</th><th></th></tr></thead><tbody>
      {lots?.map((l: any) => <tr key={l.id} className={l.onHandKg <= 0 ? 'opacity-40' : ''}>
        <td className="font-mono text-xs">{l.lotNo}</td><td>{l.variety.name}</td><td className="text-xs">{l.vendor.name}</td><td>{fmtDate(l.milledOn)}</td>
        <td>{Math.floor((Date.now() - new Date(l.milledOn).getTime()) / 2592000000)} mo</td><td className={l.moisturePct > 13 ? 'text-red-600' : ''}>{l.moisturePct}</td><td><b>{l.onHandKg}</b></td>
        <td><a className="btn-secondary !py-0.5 !px-2" target="_blank" href={`${API}/v1/inventory/lots/${l.id}/labels.html?packKg=20&count=12&t=${getToken()}`}>Labels</a></td>
      </tr>)}
    </tbody></table></div>

    <Modal title="Goods receipt (GRN)" open={grn} onClose={() => setGrn(false)}><div className="grid grid-cols-2 gap-2">
      <Field label="Lot no"><input className="input" value={f.lotNo} onChange={(e) => setF({ ...f, lotNo: e.target.value })} /></Field>
      <Field label="Vendor"><select className="input" value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}><option value="">Select</option>{vendors?.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      <Field label="Variety"><select className="input" value={f.varietyId} onChange={(e) => setF({ ...f, varietyId: e.target.value })}><option value="">Select</option>{cat?.items?.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      <Field label="Harvest season"><input className="input" value={f.harvestSeason} onChange={(e) => setF({ ...f, harvestSeason: e.target.value })} /></Field>
      <Field label="Milled on"><input type="date" className="input" value={f.milledOn} onChange={(e) => setF({ ...f, milledOn: e.target.value })} /></Field>
      <Field label="Received kg"><input type="number" className="input" value={f.receivedKg} onChange={(e) => setF({ ...f, receivedKg: Number(e.target.value) })} /></Field>
      <Field label="Moisture % (spec <13)"><input type="number" step="0.1" className="input" value={f.moisturePct} onChange={(e) => setF({ ...f, moisturePct: Number(e.target.value) })} /></Field>
      <Field label="Brokens %"><input type="number" step="0.1" className="input" value={f.brokenPct} onChange={(e) => setF({ ...f, brokenPct: Number(e.target.value) })} /></Field>
      <Field label="Cost ₹/kg"><input type="number" step="0.5" className="input" value={f.costRupees} onChange={(e) => setF({ ...f, costRupees: Number(e.target.value) })} /></Field>
      <button className="btn-primary col-span-2" disabled={!f.vendorId || !f.varietyId} onClick={submitGrn}>Receive</button>
    </div></Modal>
  </div>;
}
