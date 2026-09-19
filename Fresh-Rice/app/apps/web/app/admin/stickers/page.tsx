'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDT, API, getToken } from '@/lib/api';
import { Modal, Field, useToast, Empty } from '@/components/ui';

/** Per-bag QR stickers: generate a batch for a lot, print the sheet, then each bag
 *  carries its own code. Unlike a lot code (shared by every bag from that lot), a
 *  unique per-bag code scanned from several devices is a real counterfeit signal. */
export default function Stickers() {
  const { show, Toast } = useToast();
  const { data: stats, mutate: mStats } = useSWR('/inventory/stickers/stats', fetcher, { refreshInterval: 60000 });
  const { data: batches, mutate: mBatches } = useSWR('/inventory/stickers/batches', fetcher);
  const { data: suspicious } = useSWR('/inventory/stickers/suspicious', fetcher, { refreshInterval: 60000 });
  const { data: lots } = useSWR('/inventory/lots', fetcher);

  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ lotId: '', packKg: 20, count: 50, note: '' });
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState('');

  const lot = lots?.find((l: any) => l.id === f.lotId);
  const capacity = lot && Number(f.packKg) > 0 ? Math.floor(lot.onHandKg / Number(f.packKg)) : null;
  const refresh = () => { mStats(); mBatches(); };

  const create = async () => {
    setBusy(true);
    try {
      const r: any = await api('/inventory/stickers/batches', { body: { ...f, packKg: Number(f.packKg), count: Number(f.count) } });
      setOpen(false); refresh();
      show(`${r.generated} stickers generated for ${r.lotNo}${r.overCapacity ? ' — note: more than this lot can fill' : ''}`);
    } catch (e: any) { show(e.message, true); } finally { setBusy(false); }
  };

  // Warehouse flow: scan a sticker with a USB/phone scanner (it types the code + Enter).
  const applyScan = async (code: string) => {
    if (!code.trim()) return;
    try {
      const r: any = await api(`/inventory/stickers/${encodeURIComponent(code.trim())}/apply`, { body: {} });
      show(r.alreadyApplied ? `${code} was already applied` : `${code} applied to a bag`);
      setScan(''); refresh();
    } catch (e: any) { show(e.message, true); setScan(''); }
  };

  const S = ({ label, value, tone }: { label: string; value: any; tone?: string }) =>
    <div className={'card-modern ' + (tone || '')}><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold">{value ?? '—'}</div></div>;

  return <div><Toast />
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <p className="text-sm text-gray-600 max-w-2xl">One unique QR per bag. Generate a batch for a lot, print the sheet, stick one on each bag as it is packed, then scan it below to mark it applied.</p>
      <button className="btn-primary" onClick={() => setOpen(true)}>+ New sticker batch</button>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
      <S label="Batches" value={stats?.batches} />
      <S label="Stickers" value={stats?.total} />
      <S label="Printed" value={stats?.printed} />
      <S label="Applied to bags" value={stats?.applied} />
      <S label="Customer scans" value={stats?.totalScans} />
      <S label="Duplicate-scan alerts" value={stats?.suspicious} tone={stats?.suspicious ? 'border-red-400 bg-red-50' : ''} />
    </div>

    <div className="card-modern mb-5">
      <div className="font-semibold mb-1">Apply a sticker</div>
      <div className="text-xs text-gray-500 mb-2">Scan the QR (or type the code) as the sticker goes onto a bag. A barcode scanner types the code and presses Enter for you.</div>
      <div className="flex gap-2 max-w-md">
        <input className="input font-mono uppercase" placeholder="e.g. TWAMVVF24W" value={scan}
          onChange={(e) => setScan(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') applyScan(scan); }} />
        <button className="btn-secondary whitespace-nowrap" onClick={() => applyScan(scan)}>Mark applied</button>
      </div>
    </div>

    {suspicious?.length > 0 && <div className="card-modern border-red-400 bg-red-50 mb-5">
      <div className="font-semibold text-red-800">⚠ Duplicate-scan alerts — {suspicious.length} sticker{suspicious.length === 1 ? '' : 's'}</div>
      <div className="text-xs text-gray-600 mb-2">Each of these is ONE bag whose sticker was scanned from 3+ different devices. A single bag is scanned by a single customer — repeats mean the sticker was photocopied.</div>
      <div className="overflow-auto"><table className="tbl"><thead><tr><th>Code</th><th>Lot</th><th>Variety</th><th>Bag #</th><th>Scans</th><th>Devices</th><th>Status</th></tr></thead><tbody>
        {suspicious.map((r: any) => <tr key={r.code}>
          <td className="font-mono text-xs font-semibold">{r.code}</td><td className="text-xs">{r.lotNo}</td><td className="text-xs">{r.variety}</td>
          <td>#{r.serial}</td><td><b>{r.scans}</b></td><td className="text-red-700 font-semibold">{r.distinctIps}</td>
          <td><span className="badge bg-gray-100">{r.status}</span></td></tr>)}
      </tbody></table></div>
    </div>}

    <div className="card-modern overflow-auto">
      <div className="font-semibold mb-2">Sticker batches</div>
      {batches && !batches.length && <Empty text="No batches yet — generate one to start stickering bags" />}
      {batches?.length > 0 && <table className="tbl"><thead><tr>
        <th>Created</th><th>Lot</th><th>Variety</th><th>Pack</th><th>Count</th>
        <th>Applied</th><th>Scanned</th><th>Note</th><th></th></tr></thead><tbody>
        {batches.map((b: any) => <tr key={b.id}>
          <td className="text-xs whitespace-nowrap">{fmtDT(b.createdAt)}</td>
          <td className="font-mono text-xs">{b.lotNo}</td>
          <td className="text-xs">{b.variety}</td>
          <td>{b.packKg} kg</td>
          <td><b>{b.count}</b></td>
          <td>{b.applied}<span className="text-xs text-gray-400"> / {b.count}</span></td>
          <td>{b.scanned}</td>
          <td className="text-xs text-gray-500">{b.note || '—'}{b.printedAt && <div className="text-gray-400">printed {fmtDT(b.printedAt)}</div>}</td>
          <td><a className="btn-secondary !py-0.5 !px-2 whitespace-nowrap" target="_blank"
            href={`${API}/v1/inventory/stickers/batches/${b.id}/print.html?t=${getToken()}`}>🖨 Print sheet</a></td>
        </tr>)}
      </tbody></table>}
    </div>

    <Modal title="New sticker batch" open={open} onClose={() => setOpen(false)}>
      <div className="space-y-2">
        <Field label="Lot">
          <select className="input" value={f.lotId} onChange={(e) => setF({ ...f, lotId: e.target.value })}>
            <option value="">Select a lot</option>
            {lots?.filter((l: any) => l.onHandKg > 0).map((l: any) =>
              <option key={l.id} value={l.id}>{l.lotNo} · {l.variety.name} · {Math.round(l.onHandKg)} kg on hand</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pack size (kg)"><input type="number" min={1} className="input" value={f.packKg} onChange={(e) => setF({ ...f, packKg: e.target.value })} /></Field>
          <Field label="How many stickers"><input type="number" min={1} max={5000} className="input" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
        </div>
        {capacity !== null && <div className={'rounded-lg p-2 text-xs ' + (Number(f.count) > capacity ? 'bg-amber-50 text-amber-800 border border-amber-300' : 'bg-rice-100 text-gray-600')}>
          This lot can fill about <b>{capacity}</b> bags at {f.packKg} kg.
          {Number(f.count) > capacity && ' You are printing more stickers than the lot can fill — fine if you are pre-printing for a refill, otherwise check the count.'}
        </div>}
        <Field label="Note (optional)"><input className="input" placeholder="e.g. Friday packing run" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={!f.lotId || busy} onClick={create}>{busy ? 'Generating…' : `Generate ${f.count || 0} stickers`}</button>
      </div>
    </Modal>
  </div>;
}
