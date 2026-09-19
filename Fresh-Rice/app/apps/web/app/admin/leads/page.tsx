'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, fmtDT } from '@/lib/api';
import { Modal, Field, useToast, Empty } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'];
const STAGE_COLOR: Record<string, string> = { NEW: 'bg-gray-100', CONTACTED: 'bg-blue-50', QUALIFIED: 'bg-indigo-50', PROPOSAL: 'bg-amber-50', WON: 'bg-green-50', LOST: 'bg-red-50' };
const ACT_TYPES = ['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'NOTE'];

export default function Leads() {
  const { user } = useAuth();
  const { data, mutate } = useSWR('/sales/leads', fetcher);
  const { data: today } = useSWR('/sales/followups/today', fetcher);
  const { data: overdue } = useSWR('/sales/followups/overdue', fetcher);
  const { show, Toast } = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const { data: detail, mutate: mD } = useSWR(sel ? '/sales/leads/' + sel : null, fetcher);
  const [create, setCreate] = useState<any>(null);
  const [act, setAct] = useState({ type: 'CALL', note: '', nextFollowUpAt: '' });

  const advance = async (lead: any, status: string) => { try { await api('/sales/leads/' + lead.id, { method: 'PATCH', body: { status } }); mutate(); if (sel === lead.id) mD(); show('Moved to ' + status); } catch (e: any) { show(e.message, true); } };
  const saveCreate = async () => { try { await api('/sales/leads', { body: create }); setCreate(null); mutate(); show('Lead added'); } catch (e: any) { show(e.message, true); } };
  const logActivity = async () => { try { await api(`/sales/leads/${sel}/activities`, { body: act }); setAct({ type: 'CALL', note: '', nextFollowUpAt: '' }); mD(); mutate(); show('Logged'); } catch (e: any) { show(e.message, true); } };
  const convert = async () => { try { await api(`/sales/leads/${sel}/convert`, { body: {} }); mD(); mutate(); show('Converted to B2B account'); } catch (e: any) { show(e.message, true); } };

  const dueCount = (today?.length || 0) + (overdue?.length || 0);

  return <div><Toast />
    <div className="flex justify-between items-center mb-4"><h1 className="text-2xl font-bold">Leads {user?.role === 'SALES' && <span className="text-sm font-normal text-gray-500">(your pipeline)</span>}</h1><button className="btn-primary" onClick={() => setCreate({ name: '', phone: '', estValueRupees: 0 })}>+ Lead</button></div>

    {dueCount > 0 && <div className="card mb-4 border-amber-300 bg-amber-50">
      <b>Follow-ups due: {dueCount}</b>
      <div className="text-sm mt-1 space-y-1">
        {overdue?.map((l: any) => <div key={l.id} className="text-red-700">Overdue: <button className="underline" onClick={() => setSel(l.id)}>{l.name}</button> — {l.assignedTo?.name || 'unassigned'}</div>)}
        {today?.map((l: any) => <div key={l.id}>Today: <button className="underline" onClick={() => setSel(l.id)}>{l.name}</button> — {l.assignedTo?.name || 'unassigned'}</div>)}
      </div>
    </div>}

    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {STAGES.map((stage) => <div key={stage} className={'rounded-xl p-2 ' + STAGE_COLOR[stage]}>
        <div className="font-semibold text-sm mb-2 px-1">{stage.replace(/_/g, ' ')} ({data?.filter((l: any) => l.status === stage).length || 0})</div>
        <div className="space-y-2">
          {data?.filter((l: any) => l.status === stage).map((l: any) => <div key={l.id} className="card !p-2 cursor-pointer" onClick={() => setSel(l.id)}>
            <div className="font-medium text-sm">{l.name}</div>
            <div className="text-xs text-gray-500">{l.company || l.phone}</div>
            {l.estValuePaise > 0 && <div className="text-xs text-gray-600 mt-1">{paise(l.estValuePaise)}</div>}
            {l.assignedTo && <div className="text-xs text-gray-400">→ {l.assignedTo.name}</div>}
            {l.nextFollowUpAt && <div className="text-xs mt-1 text-amber-700">Follow up {fmtDate(l.nextFollowUpAt)}</div>}
          </div>)}
          {!data?.filter((l: any) => l.status === stage).length && <div className="text-xs text-gray-400 px-1">—</div>}
        </div>
      </div>)}
    </div>

    <Modal title="New lead" open={!!create} onClose={() => setCreate(null)}>{create && <div className="grid grid-cols-2 gap-2">
      <Field label="Name"><input className="input" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></Field>
      <Field label="Phone"><input className="input" value={create.phone} onChange={(e) => setCreate({ ...create, phone: e.target.value })} /></Field>
      <Field label="Company"><input className="input" value={create.company || ''} onChange={(e) => setCreate({ ...create, company: e.target.value })} /></Field>
      <Field label="Source"><input className="input" placeholder="referral, cold call, walk-in…" value={create.source || ''} onChange={(e) => setCreate({ ...create, source: e.target.value })} /></Field>
      <Field label="Est. value (₹)"><input type="number" className="input" value={create.estValueRupees || ''} onChange={(e) => setCreate({ ...create, estValueRupees: Number(e.target.value) })} /></Field>
      <div className="col-span-2"><Field label="Notes"><textarea className="input" value={create.notes || ''} onChange={(e) => setCreate({ ...create, notes: e.target.value })} /></Field></div>
      <button className="btn-primary col-span-2" disabled={!create.name || !create.phone} onClick={saveCreate}>Add lead</button>
    </div>}</Modal>

    <Modal title={detail?.name || 'Lead'} open={!!sel} onClose={() => setSel(null)}>{detail && <div className="space-y-4 text-sm">
      <div className="flex justify-between items-center"><div>{detail.company && <div className="text-gray-500">{detail.company}</div>}<div>{detail.phone}</div>{detail.estValuePaise > 0 && <div className="text-gray-600">{paise(detail.estValuePaise)} est.</div>}</div>
        <div className="flex gap-1 flex-wrap">{STAGES.map((s) => <button key={s} className={'badge ' + (detail.status === s ? STAGE_COLOR[s] + ' font-semibold' : 'bg-gray-50 text-gray-400')} onClick={() => advance(detail, s)}>{s}</button>)}</div></div>
      {detail.status !== 'WON' && !detail.b2bAccountId && <button className="btn-secondary" onClick={convert}>Convert to B2B account</button>}
      {detail.b2bAccountId && <div className="text-green-700 text-xs">Converted to B2B account</div>}

      <div className="card"><b>Log a touch</b>
        <div className="flex gap-2 mt-2 flex-wrap">
          <select className="input !w-auto" value={act.type} onChange={(e) => setAct({ ...act, type: e.target.value })}>{ACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <input className="input" placeholder="note" value={act.note} onChange={(e) => setAct({ ...act, note: e.target.value })} />
          <input className="input !w-auto" type="date" value={act.nextFollowUpAt} onChange={(e) => setAct({ ...act, nextFollowUpAt: e.target.value })} />
          <button className="btn-primary" onClick={logActivity}>Log</button>
        </div>
      </div>
      <div><b>Timeline</b>
        {!detail.activities?.length && <Empty text="No activity logged yet" />}
        {detail.activities?.map((a: any) => <div key={a.id} className="border-b py-1"><span className="badge bg-gray-100">{a.type}</span> {a.note} <span className="text-xs text-gray-400">— {a.createdBy?.name || 'system'}, {fmtDT(a.createdAt)}</span>{a.nextFollowUpAt && <div className="text-xs text-amber-700">Next follow-up: {fmtDate(a.nextFollowUpAt)}</div>}</div>)}
      </div>
    </div>}</Modal>
  </div>;
}
