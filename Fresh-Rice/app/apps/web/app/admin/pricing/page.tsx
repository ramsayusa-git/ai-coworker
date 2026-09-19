'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate } from '@/lib/api';
import { Field, useToast } from '@/components/ui';
export default function Pricing() {
  const { data, mutate } = useSWR('/admin/prices', fetcher); const { data: zones } = useSWR('/zones', fetcher); const { data: cat } = useSWR('/catalog', fetcher); const { show, Toast } = useToast();
  const [f, setF] = useState<any>({ skuId: '', scope: 'BASE', zoneId: '', b2bTier: 1, priceRupees: 0 });
  const skus = cat?.items?.flatMap((v: any) => v.skus.map((s: any) => ({ ...s, name: v.name }))) || [];
  return <div><Toast /><h1 className="text-2xl font-bold mb-4">Pricing</h1>
    <div className="card mb-4"><div className="font-semibold mb-2">Add price (newest valid price wins; precedence B2B tier → zone → base)</div><div className="grid grid-cols-5 gap-2 items-end">
      <Field label="SKU"><select className="input" value={f.skuId} onChange={(e) => setF({ ...f, skuId: e.target.value })}><option value="">Select</option>{skus.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.packKg}kg</option>)}</select></Field>
      <Field label="Scope"><select className="input" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option>BASE</option><option>ZONE</option><option>B2B_TIER</option></select></Field>
      {f.scope === 'ZONE' ? <Field label="Zone"><select className="input" value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}><option value="">Select</option>{zones?.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field> : f.scope === 'B2B_TIER' ? <Field label="Tier"><input type="number" className="input" value={f.b2bTier} onChange={(e) => setF({ ...f, b2bTier: Number(e.target.value) })} /></Field> : <div />}
      <Field label="Price ₹ / pack"><input type="number" step="1" className="input" value={f.priceRupees} onChange={(e) => setF({ ...f, priceRupees: Number(e.target.value) })} /></Field>
      <button className="btn-primary" disabled={!f.skuId || !f.priceRupees} onClick={async () => { try { await api('/admin/prices', { body: { ...f, zoneId: f.scope === 'ZONE' ? f.zoneId : undefined, b2bTier: f.scope === 'B2B_TIER' ? f.b2bTier : undefined } }); mutate(); show('Price added'); } catch (e: any) { show(e.message, true); } }}>Add</button></div></div>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>SKU</th><th>Scope</th><th>Zone / tier</th><th className="text-right">Price</th><th className="text-right">₹/kg</th><th>Valid from</th></tr></thead><tbody>{data?.map((p: any) => <tr key={p.id}><td>{p.sku.variety.name} {p.sku.packKg}kg</td><td><span className="badge bg-gray-100">{p.scope}</span></td><td>{p.zone?.name || (p.b2bTier ? 'Tier ' + p.b2bTier : '')}</td><td className="text-right">{paise(p.pricePaise)}</td><td className="text-right">{paise(Math.round(p.pricePaise / p.sku.packKg))}</td><td>{fmtDate(p.validFrom)}</td></tr>)}</tbody></table></div></div>;
}
