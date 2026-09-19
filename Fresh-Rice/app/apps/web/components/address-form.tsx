'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Field } from './ui';
export function AddressForm({ onSaved }: { onSaved: (a: any) => void }) {
  const [f, setF] = useState<any>({ label: 'Home', line1: '', complex: '', landmark: '', floor: 0, hasLift: true, pincode: '' }); const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const save = async () => { setErr(''); try { onSaved(await api('/addresses', { body: f })); } catch (e: any) { setErr(e.message); } };
  return <div className="space-y-2">
    <Field label="Flat / house, street"><input className="input" value={f.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
    <div className="grid grid-cols-2 gap-2"><Field label="Apartment / complex"><input className="input" value={f.complex} onChange={(e) => set('complex', e.target.value)} /></Field><Field label="Landmark"><input className="input" value={f.landmark} onChange={(e) => set('landmark', e.target.value)} /></Field></div>
    <div className="grid grid-cols-3 gap-2"><Field label="Pincode"><input className="input" value={f.pincode} maxLength={6} onChange={(e) => set('pincode', e.target.value)} /></Field><Field label="Floor"><input className="input" type="number" value={f.floor} onChange={(e) => set('floor', Number(e.target.value))} /></Field><Field label="Lift?"><select className="input" value={f.hasLift ? '1' : '0'} onChange={(e) => set('hasLift', e.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select></Field></div>
    {err && <div className="text-red-600 text-sm">{err}</div>}
    <button className="btn-primary w-full" onClick={save} disabled={!f.line1 || f.pincode.length !== 6}>Save address</button></div>;
}
