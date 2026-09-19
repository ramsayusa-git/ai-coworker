'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate } from '@/lib/api';
import { Field, useToast } from '@/components/ui';
export default function Coupons() {
  const { data, mutate } = useSWR('/admin/coupons', fetcher); const { show, Toast } = useToast();
  const [f, setF] = useState<any>({ code: '', type: 'PERCENT', value: 10, minOrderRupees: 500, maxDiscountRupees: 100, firstOrderOnly: true, usesPerUser: 1, totalUses: '', validTo: '' });
  return <div><Toast /><h1 className="text-2xl font-bold mb-4">Coupons & promos</h1>
    <div className="card mb-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
      <Field label="Code"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
      <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PERCENT">% off</option><option value="FLAT">₹ off</option></select></Field>
      <Field label={f.type === 'PERCENT' ? 'Percent' : 'Rupees'}><input type="number" className="input" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></Field>
      <Field label="Min order ₹"><input type="number" className="input" value={f.minOrderRupees} onChange={(e) => setF({ ...f, minOrderRupees: Number(e.target.value) })} /></Field>
      <Field label="Max discount ₹"><input type="number" className="input" value={f.maxDiscountRupees} onChange={(e) => setF({ ...f, maxDiscountRupees: Number(e.target.value) })} /></Field>
      <Field label="Uses / user"><input type="number" className="input" value={f.usesPerUser} onChange={(e) => setF({ ...f, usesPerUser: Number(e.target.value) })} /></Field>
      <Field label="Total uses (blank = ∞)"><input type="number" className="input" value={f.totalUses} onChange={(e) => setF({ ...f, totalUses: e.target.value })} /></Field>
      <Field label="Valid to"><input type="date" className="input" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>
      <label className="text-sm"><input type="checkbox" checked={f.firstOrderOnly} onChange={(e) => setF({ ...f, firstOrderOnly: e.target.checked })} /> First order only</label>
      <button className="btn-primary" disabled={!f.code} onClick={async () => { try { await api('/admin/coupons', { body: { ...f, totalUses: f.totalUses ? Number(f.totalUses) : null, validTo: f.validTo || null } }); mutate(); show('Coupon created'); } catch (e: any) { show(e.message, true); } }}>Create</button></div></div>
    <div className="card"><table className="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Cap</th><th>Rules</th><th>Used</th><th>Valid to</th><th>Active</th></tr></thead><tbody>{data?.map((c: any) => <tr key={c.id}><td className="font-mono font-semibold">{c.code}</td><td>{c.type === 'PERCENT' ? c.value + '%' : paise(c.value)}</td><td>{paise(c.minOrderPaise)}</td><td>{c.maxDiscountPaise ? paise(c.maxDiscountPaise) : '—'}</td><td className="text-xs">{c.firstOrderOnly && 'first order · '}{c.usesPerUser}/user</td><td>{c.usedCount}{c.totalUses ? '/' + c.totalUses : ''}</td><td>{c.validTo ? fmtDate(c.validTo) : '∞'}</td><td><button className={'btn-secondary !py-0.5 !px-2 ' + (c.active ? '' : 'text-red-600')} onClick={async () => { await api('/admin/coupons/' + c.id, { method: 'PATCH', body: { active: !c.active } }); mutate(); }}>{c.active ? 'active' : 'off'}</button></td></tr>)}</tbody></table></div></div>;
}
