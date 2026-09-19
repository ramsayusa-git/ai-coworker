'use client';
import { useState } from 'react';
import { api, API, getToken, ymd } from '@/lib/api';
import { useToast } from '@/components/ui';

const EXPORTS: [string, string][] = [['orders', 'Orders'], ['customers', 'Customers'], ['leads', 'Leads (CRM)'], ['b2b', 'B2B accounts'], ['invoices', 'Invoices'], ['shifts', 'Duty shifts / hours'], ['riders', 'Riders'], ['staff', 'Staff']];
const IMPORTS: Record<string, { label: string; columns: string; sample: string }> = {
  leads: { label: 'Leads (CRM)', columns: 'name, phone, company, source, status (NEW/CONTACTED/QUALIFIED/PROPOSAL/WON/LOST), assignedTo (rep name or phone), estValue (₹), notes', sample: 'name,phone,company,status,assignedTo,estValue\nGreen Valley RWA,9848012345,Green Valley Apartments,NEW,Arjun (Sales),50000' },
  customers: { label: 'Customers', columns: 'name, phone, email, address, complex, pincode', sample: 'name,phone,email,address,complex,pincode\nLakshmi Rao,9848011111,lakshmi@example.com,"Flat 302, Block B",Sai Enclave,500072' },
  b2b: { label: 'B2B accounts', columns: 'name, gstin, tier (1-3), contact, phone', sample: 'name,gstin,tier,contact,phone\nHotel Sai Residency,36AABCU9603R1ZM,2,Ramesh,9848022222' },
  prices: { label: 'Price list', columns: 'sku (e.g. SONA-20), scope (BASE/ZONE/B2B_TIER), price (₹ per pack), zone (for ZONE), tier (for B2B_TIER)', sample: 'sku,scope,price,zone,tier\nSONA-20,BASE,1120,,\nSONA-25,B2B_TIER,1350,,2' },
};

/** Tiny CSV parser: handles quoted fields, commas and newlines inside quotes, CRLF, BOM. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== '')); if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export default function DataIO() {
  const { show, Toast } = useToast();
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86400000))); const [to, setTo] = useState(ymd(new Date()));
  const [ds, setDs] = useState('leads'); const [rows, setRows] = useState<Record<string, string>[]>([]); const [preview, setPreview] = useState<any>(null); const [busy, setBusy] = useState(false); const [fileName, setFileName] = useState('');
  const exp = (name: string, format: string) => fetch(`${API}/v1/admin/export/${name}?from=${from}&to=${to}&format=${format}`, { headers: { Authorization: 'Bearer ' + getToken() } }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).message); return r.blob(); }).then((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${name}-${from}-${to}.${format}`; a.click(); }).catch((e) => show(e.message, true));
  const pick = async (f?: File) => { if (!f) return; setFileName(f.name); const parsed = parseCsv(await f.text()); setRows(parsed); setPreview(null); if (!parsed.length) show('No rows found in that file', true); };
  const validate = async (commit: boolean) => { if (!rows.length) return; setBusy(true); try { const r = await api(`/admin/import/${ds}`, { body: { rows, commit } }); setPreview(r); if (commit) { show(`Imported: ${r.created} created, ${r.updated} updated`); setRows([]); setFileName(''); } } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const meta = IMPORTS[ds];
  return <div><Toast />
    <h1 className="text-2xl font-bold mb-4">Import / export data</h1>
    <div className="card mb-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><b>Bulk export</b><div className="flex gap-2 items-center text-sm"><span className="text-gray-500">Date range (orders, invoices, shifts)</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /><span>→</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
      <table className="tbl"><tbody>{EXPORTS.map(([k, l]) => <tr key={k}><td className="w-64">{l}</td><td><div className="flex gap-1">{['csv', 'xlsx', 'pdf'].map((f) => <button key={f} className="btn-secondary !py-1 !px-2 uppercase text-xs" onClick={() => exp(k, f)}>{f}</button>)}</div></td></tr>)}</tbody></table>
      <div className="text-xs text-gray-500 mt-2">Every report on the <a className="underline" href="/admin/reports">Reports</a> page also exports in all three formats.</div>
    </div>
    <div className="card">
      <b>Import from CSV</b>
      <div className="grid md:grid-cols-[220px_1fr] gap-3 mt-3 items-start">
        <div>
          <label className="label">What are you importing?<select className="input" value={ds} onChange={(e) => { setDs(e.target.value); setPreview(null); }}>{Object.entries(IMPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <input type="file" accept=".csv,text/csv" className="text-sm mt-3 w-full" onChange={(e) => pick(e.target.files?.[0])} />
          {fileName && <div className="text-xs text-gray-500 mt-1">{fileName} · {rows.length} rows</div>}
          <div className="flex gap-2 mt-3"><button className="btn-secondary" disabled={!rows.length || busy} onClick={() => validate(false)}>Validate</button><button className="btn-primary" disabled={!preview || preview.invalid > 0 || busy || !rows.length} onClick={() => validate(true)}>Import {preview?.valid ? `${preview.valid} rows` : ''}</button></div>
        </div>
        <div className="text-sm">
          <div className="text-xs text-gray-500">Columns (header names are matched loosely — "Phone", "mobile", "phone_number" all work):</div>
          <div className="mt-1">{meta.columns}</div>
          <div className="text-xs text-gray-500 mt-2">Sample file:</div>
          <pre className="bg-rice-100 rounded p-2 text-xs overflow-auto">{meta.sample}</pre>
          <button className="text-xs underline" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([meta.sample], { type: 'text/csv' })); a.download = `${ds}-sample.csv`; a.click(); }}>Download sample CSV</button>
          <div className="text-xs text-gray-500 mt-2">Existing records are matched by phone (leads, customers, B2B) and updated rather than duplicated. Prices always add a new price row (the latest valid price wins). Validate first — nothing is written until every row passes and you press Import.</div>
        </div>
      </div>
      {preview && <div className="mt-4">
        <div className={'text-sm font-semibold ' + (preview.invalid ? 'text-amber-700' : 'text-leaf-700')}>{preview.committed ? `Imported ${preview.created} new, ${preview.updated} updated.` : preview.invalid ? `${preview.invalid} of ${preview.total} rows have problems — fix them in the file and re-upload.` : `All ${preview.total} rows valid (${preview.results.filter((r: any) => r.action === 'create').length} new, ${preview.results.filter((r: any) => r.action === 'update').length} updates). Ready to import.`}</div>
        {!preview.committed && <div className="overflow-auto max-h-96 mt-2"><table className="tbl"><thead><tr><th>#</th><th>Result</th>{rows[0] && Object.keys(rows[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>
          {preview.results.map((r: any) => <tr key={r.row} className={r.ok ? '' : 'bg-red-50'}><td>{r.row}</td><td className="text-xs whitespace-nowrap">{r.ok ? <span className="text-leaf-700">{r.action}</span> : <span className="text-red-700">{r.errors.join('; ')}</span>}</td>{Object.values(rows[r.row - 1] || {}).map((v: any, i) => <td key={i} className="text-xs">{v}</td>)}</tr>)}
        </tbody></table></div>}
      </div>}
    </div>
  </div>;
}
