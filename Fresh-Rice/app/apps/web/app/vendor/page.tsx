'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate } from '@/lib/api';
import { Stat, StatusBadge, Empty, useToast } from '@/components/ui';

/** Mill story editor — what customers see when they scan the QR on a bag from this mill. */
function MillStory({ me, onSaved }: { me: any; onSaved: () => void }) {
  const [title, setTitle] = useState(me.storyTitle || ''); const [story, setStory] = useState(me.story || ''); const [photo, setPhoto] = useState<string>(me.storyPhoto || ''); const [busy, setBusy] = useState(false); const { show, Toast } = useToast();
  const pick = (f?: File) => { if (!f) return; if (f.size > 400 * 1024) { show('Photo must be under 400 KB'); return; } const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(f); };
  const save = async () => { setBusy(true); try { await api('/vendor/me/story', { method: 'PATCH', body: { storyTitle: title, story, storyPhoto: photo } }); show('Story saved — live on every bag from your mill'); onSaved(); } catch (e: any) { show(e.message); } finally { setBusy(false); } };
  return <div className="card">
    <Toast />
    <div className="flex justify-between items-start"><div><h2 className="font-semibold">Your mill's story</h2><div className="text-xs text-gray-500">Customers see this when they scan the QR on any bag milled by you. Say who you are, how long you've been milling, what you're proud of.</div></div></div>
    <div className="grid md:grid-cols-[1fr_180px] gap-3 mt-3">
      <div>
        <label className="label">Title <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${me.name} — three generations of milling`} /></label>
        <label className="label mt-2">Story <textarea className="input h-28" maxLength={1200} value={story} onChange={(e) => setStory(e.target.value)} placeholder="We've milled Sona Masoori in Miryalaguda since 1978. Every lot is sun-dried, aged in jute, and tested for moisture before it leaves the yard…" /></label>
        <div className="text-xs text-gray-400 text-right">{story.length}/1200</div>
      </div>
      <div>
        <div className="label">Photo (optional, under 400 KB)</div>
        {photo ? <img src={photo} alt="" className="w-full h-28 object-cover rounded border" /> : <div className="w-full h-28 rounded border border-dashed flex items-center justify-center text-xs text-gray-400">No photo</div>}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="text-xs mt-2 w-full" onChange={(e) => pick(e.target.files?.[0])} />
        {photo && <button className="text-xs text-red-600 mt-1" onClick={() => setPhoto('')}>Remove photo</button>}
      </div>
    </div>
    <button className="btn-primary mt-3" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save story'}</button>
  </div>;
}

export default function VendorHome() {
  const { data: me, mutate } = useSWR('/vendor/me', fetcher);
  const { data: pos } = useSWR('/vendor/pos', fetcher);
  const { data: ledger } = useSWR('/vendor/ledger', fetcher);
  const { data: deliveries } = useSWR('/vendor/deliveries', fetcher);
  if (!me) return <div className="text-gray-400">Loading…</div>;
  return <div className="space-y-6">
    <h1 className="text-2xl font-bold">{me.name}</h1>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Stat label="Payable to you" value={paise(me.payablePaise)} />
      <Stat label="Overdue" value={paise(me.overduePaise)} warn={me.overduePaise > 0} />
      <Stat label="Open POs" value={pos?.filter((p: any) => !['CLOSED', 'CANCELLED'].includes(p.status)).length ?? '—'} />
    </div>

    <MillStory key={me.id} me={me} onSaved={() => mutate()} />

    <div><h2 className="font-semibold mb-2">Purchase orders</h2>
      {!pos?.length && <Empty text="No purchase orders yet" />}
      <div className="card overflow-auto"><table className="tbl"><thead><tr><th>PO</th><th>Warehouse</th><th>Lines</th><th>Expected</th><th></th></tr></thead><tbody>
        {pos?.map((p: any) => <tr key={p.id}><td>PO-{p.poNo}</td><td>{p.warehouse.code}</td><td>{p.lines.map((l: any) => `${l.variety.code} ${l.receivedKg}/${l.kg}kg`).join(', ')}</td><td>{p.expectedOn ? fmtDate(p.expectedOn) : '-'}</td><td><StatusBadge s={p.status} /></td></tr>)}
      </tbody></table></div>
    </div>

    <div><h2 className="font-semibold mb-2">Deliveries received</h2>
      {!deliveries?.length && <Empty text="No deliveries recorded yet" />}
      <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Lot</th><th>Variety</th><th>Warehouse</th><th>Kg</th><th>Received</th></tr></thead><tbody>
        {deliveries?.map((l: any) => <tr key={l.id}><td className="font-mono text-xs">{l.lotNo}</td><td>{l.variety.name}</td><td>{l.warehouse.code}</td><td>{l.receivedKg}</td><td>{fmtDate(l.receivedAt)}</td></tr>)}
      </tbody></table></div>
    </div>

    <div><h2 className="font-semibold mb-2">Payment ledger</h2>
      {!ledger?.length && <Empty text="No ledger entries yet" />}
      <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Date</th><th>Entry</th><th>Ref</th><th>Due</th><th className="text-right">Amount</th></tr></thead><tbody>
        {ledger?.map((l: any) => <tr key={l.id}><td>{fmtDate(l.at)}</td><td>{l.reason}</td><td className="font-mono text-xs">{l.ref}</td><td>{l.dueOn ? fmtDate(l.dueOn) : ''}</td><td className={'text-right ' + (l.deltaPaise < 0 ? 'text-green-700' : '')}>{paise(l.deltaPaise)}</td></tr>)}
      </tbody></table></div>
    </div>
  </div>;
}
