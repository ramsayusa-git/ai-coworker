'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDT, API, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field, useToast, Empty } from '@/components/ui';

const BLANK = { name: '', channel: 'ANY', brandName: 'FreshRice', legalName: 'Aetos Tech Labs', address: 'Kukatpally, Hyderabad 500072', gstin: '36XXXXX0000X1Z5', fssai: '13626000000000', phone: '', email: '', logo: '', accentColor: '#1d5133', footer: 'Rice is a pre-packed & labelled commodity taxed at 5% GST. Store in a cool, dry place. Milling date and lot printed on each bag.', terms: '', bankDetails: '', signatory: '', showLot: true, numberPrefix: 'FR', nextNumber: 1, isDefault: false, active: true };

export default function InvoiceTemplates() {
  const { user } = useAuth(); const canEdit = user?.role === 'ADMIN';
  const { data, mutate } = useSWR('/admin/invoice-templates', fetcher); const { show, Toast } = useToast();
  const [edit, setEdit] = useState<any>(null); const [busy, setBusy] = useState(false); const [previewId, setPreviewId] = useState<string | null>(null);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const pick = (f?: File) => { if (!f) return; if (f.size > 200 * 1024) { show('Logo must be under 200 KB', true); return; } const r = new FileReader(); r.onload = () => set('logo', String(r.result)); r.readAsDataURL(f); };
  const save = async () => { setBusy(true); try { const t = edit.id ? await api(`/admin/invoice-templates/${edit.id}`, { method: 'PATCH', body: edit }) : await api('/admin/invoice-templates', { body: edit }); show('Saved'); setEdit(null); mutate(); setPreviewId(t.id); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const makeDefault = async (id: string) => { try { await api(`/admin/invoice-templates/${id}/default`, { method: 'POST' }); mutate(); } catch (e: any) { show(e.message, true); } };
  const remove = async (id: string) => { if (!confirm('Remove this template? (It is deactivated instead if invoices already used it.)')) return; try { await api(`/admin/invoice-templates/${id}`, { method: 'DELETE' }); mutate(); if (previewId === id) setPreviewId(null); } catch (e: any) { show(e.message, true); } };
  const previewUrl = (id: string, f = '') => `${API}/v1/admin/invoice-templates/${id}/preview?t=${getToken()}${f ? '&format=' + f : ''}`;
  return <div><Toast />
    <div className="flex flex-wrap justify-between items-center gap-2 mb-1"><h1 className="text-2xl font-bold">Invoice templates</h1>{canEdit && <button className="btn-primary" onClick={() => setEdit({ ...BLANK })}>+ New template</button>}</div>
    <p className="text-sm text-gray-600 mb-4">Seller details, logo, footer, bank details and numbering series that every invoice renders from. One default per channel (B2C / B2B); "Any" is the fallback. Existing invoices keep the details they were issued with.</p>
    {data && !data.length && <Empty text="No templates yet" />}
    <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
      <div className="space-y-3">
        {data?.map((t: any) => <div key={t.id} className={'card ' + (!t.active ? 'opacity-50' : '') + (previewId === t.id ? ' border-leaf-600' : '')}>
          <div className="flex justify-between items-start gap-2">
            <div className="flex gap-3 items-center">{t.logo && <img src={t.logo} alt="" className="h-10 w-10 object-contain rounded border bg-white" />}<div><b>{t.name}</b> <span className="badge bg-gray-100 ml-1">{t.channel}</span>{t.isDefault && <span className="badge bg-green-100 text-green-700 ml-1">default</span>}{!t.active && <span className="badge bg-gray-100 ml-1">inactive</span>}<div className="text-xs text-gray-500">{t.legalName} · GSTIN {t.gstin} · series {t.numberPrefix}/… next #{t.nextNumber} · updated {fmtDT(t.updatedAt)}</div></div></div>
            <div className="flex gap-1 flex-wrap justify-end"><button className="btn-secondary !py-0.5 !px-2" onClick={() => setPreviewId(t.id)}>Preview</button><a className="btn-secondary !py-0.5 !px-2" target="_blank" href={previewUrl(t.id, 'pdf')}>PDF</a>{canEdit && <><button className="btn-secondary !py-0.5 !px-2" onClick={() => setEdit({ ...t })}>Edit</button>{!t.isDefault && t.active && <button className="btn-secondary !py-0.5 !px-2" onClick={() => makeDefault(t.id)}>Make default</button>}<button className="btn-secondary !py-0.5 !px-2 text-red-600" onClick={() => remove(t.id)}>Remove</button></>}</div>
          </div>
        </div>)}
        {edit && <div className="card border-leaf-600">
          <b>{edit.id ? 'Edit template' : 'New template'}</b>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="Template name"><input className="input" value={edit.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. B2B with bank details" /></Field>
            <Field label="Channel"><select className="input" value={edit.channel} onChange={(e) => set('channel', e.target.value)}><option value="ANY">Any (fallback)</option><option value="B2C">B2C — households</option><option value="B2B">B2B — businesses</option></select></Field>
            <Field label="Brand name (heading)"><input className="input" value={edit.brandName} onChange={(e) => set('brandName', e.target.value)} /></Field>
            <Field label="Legal name"><input className="input" value={edit.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
            <div className="col-span-2"><Field label="Address"><input className="input" value={edit.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
            <Field label="GSTIN"><input className="input font-mono" maxLength={15} value={edit.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
            <Field label="FSSAI"><input className="input font-mono" value={edit.fssai} onChange={(e) => set('fssai', e.target.value)} /></Field>
            <Field label="Phone (optional)"><input className="input" value={edit.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email (optional)"><input className="input" value={edit.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Logo (PNG/JPEG, under 200 KB)"><div className="flex gap-2 items-center">{edit.logo && <img src={edit.logo} alt="" className="h-10 w-10 object-contain border rounded bg-white" />}<input type="file" accept="image/png,image/jpeg" className="text-xs" onChange={(e) => pick(e.target.files?.[0])} />{edit.logo && <button className="text-xs text-red-600" onClick={() => set('logo', '')}>remove</button>}</div></Field>
            <Field label="Accent colour"><div className="flex gap-2 items-center"><input type="color" value={edit.accentColor} onChange={(e) => set('accentColor', e.target.value)} /><input className="input font-mono" value={edit.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></div></Field>
            <Field label="Number prefix"><input className="input font-mono" maxLength={8} value={edit.numberPrefix} onChange={(e) => set('numberPrefix', e.target.value.toUpperCase())} /></Field>
            <Field label="Next number in series"><input className="input" type="number" min={1} value={edit.nextNumber} onChange={(e) => set('nextNumber', Number(e.target.value))} /></Field>
            <div className="col-span-2"><Field label="Footer / declaration"><textarea className="input" rows={2} value={edit.footer} onChange={(e) => set('footer', e.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="Terms (optional, shown as a box)"><textarea className="input" rows={2} value={edit.terms || ''} onChange={(e) => set('terms', e.target.value)} placeholder="Payment due within 7 days. Goods once sold…" /></Field></div>
            <div className="col-span-2"><Field label="Bank / UPI details (B2B invoices only)"><textarea className="input font-mono" rows={3} value={edit.bankDetails || ''} onChange={(e) => set('bankDetails', e.target.value)} placeholder={'Bank: HDFC Bank, Kukatpally\nA/c: 5010 0012 3456 78 · IFSC: HDFC0001234\nUPI: freshrice@hdfcbank'} /></Field></div>
            <Field label="Signatory line"><input className="input" value={edit.signatory || ''} onChange={(e) => set('signatory', e.target.value)} placeholder="For Aetos Tech Labs — Authorised signatory" /></Field>
            <div className="flex flex-col gap-1 text-sm justify-end"><label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.showLot} onChange={(e) => set('showLot', e.target.checked)} /> Show lot number per line</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /> Default for this channel</label><label className="flex items-center gap-2"><input type="checkbox" checked={edit.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label></div>
          </div>
          <div className="flex gap-2 mt-3"><button className="btn-primary" disabled={busy || !edit.name} onClick={save}>{busy ? 'Saving…' : 'Save template'}</button><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>}
      </div>
      <div className="card p-0 overflow-hidden min-h-[520px]">{previewId ? <iframe title="Preview" src={previewUrl(previewId)} className="w-full h-[720px] bg-white" /> : <div className="text-gray-400 text-sm p-8 text-center">Pick a template → Preview to see it on your latest order</div>}</div>
    </div>
  </div>;
}
