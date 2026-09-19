'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDT } from '@/lib/api';
import { Field, Modal, useToast, Empty } from '@/components/ui';

/** Service API keys for the FreshRice MCP server (Claude) and scripts. ADMIN only. */
export default function ApiKeys() {
  const { data, mutate } = useSWR('/admin/api-keys', fetcher); const { data: staff } = useSWR('/admin/staff', fetcher); const { show, Toast } = useToast();
  const [name, setName] = useState(''); const [userId, setUserId] = useState(''); const [write, setWrite] = useState(false); const [days, setDays] = useState(''); const [created, setCreated] = useState<any>(null); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); try { const r = await api('/admin/api-keys', { body: { name, userId: userId || undefined, scopes: write ? ['read', 'write'] : ['read'], expiresInDays: days ? Number(days) : undefined } }); setCreated(r); setName(''); mutate(); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const revoke = async (k: any) => { if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return; await api(`/admin/api-keys/${k.id}`, { method: 'DELETE' }); mutate(); };
  const [edit, setEdit] = useState<any>(null);
  // Hard delete is only offered on an already-revoked key, so removing a live integration
  // is always two deliberate steps. The API enforces the same rule.
  const destroy = async (k: any) => {
    if (!confirm(`Permanently delete "${k.name}"?\n\nThe key is already revoked, so nothing breaks — this only clears the row. The audit event is kept.`)) return;
    try { await api(`/admin/api-keys/${k.id}/permanent`, { method: 'DELETE' }); show(`Deleted "${k.name}"`); mutate(); }
    catch (e: any) { show(e.message, true); }
  };
  const saveEdit = async () => {
    try {
      await api(`/admin/api-keys/${edit.id}`, { method: 'PATCH', body: {
        name: edit.name,
        scopes: edit.write ? ['read', 'write'] : ['read'],
        expiresInDays: edit.days === '' ? null : Number(edit.days),
      } });
      show('Key updated'); setEdit(null); mutate();
    } catch (e: any) { show(e.message, true); }
  };
  return <div><Toast />
    <h1 className="text-2xl font-bold mb-1">API keys</h1>
    <p className="text-sm text-gray-600 mb-4">Long-lived keys for integrations — the FreshRice MCP server that lets Claude operate the platform, and scripts. A key acts as the staff account it's linked to; read-only keys can't change anything. Setup guide: <code>claude/README.md</code> in the repo.</p>
    {created && <div className="card mb-4 border-leaf-600 bg-leaf-600/5"><b>Key created — copy it now, it won't be shown again</b><pre className="bg-white border rounded p-2 mt-2 text-sm select-all break-all">{created.key}</pre><div className="text-xs text-gray-600 mt-1">{created.name} · acts as {created.user.name} ({created.user.role}) · {created.scopes.join(' + ')}</div><button className="btn-secondary mt-2 !py-1" onClick={() => setCreated(null)}>Done</button></div>}
    <div className="card mb-4"><b>New key</b><div className="grid md:grid-cols-4 gap-2 mt-2 items-end">
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Desktop — Ramsay" /></Field>
      <Field label="Acts as"><select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Me</option>{staff?.filter((s: any) => ['ADMIN', 'OPS', 'SALES', 'MARKETING'].includes(s.role)).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</select></Field>
      <Field label="Expires in days (blank = never)"><input className="input" type="number" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      <div><label className="text-sm flex items-center gap-2 mb-2"><input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Allow writes</label><button className="btn-primary w-full" disabled={busy || !name} onClick={create}>Create key</button></div>
    </div></div>
    {data && !data.length && <Empty text="No keys yet" />}
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Name</th><th>Key</th><th>Acts as</th><th>Scope</th><th>Last used</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>
      {data?.map((k: any) => <tr key={k.id} className={k.revokedAt ? 'opacity-50' : ''}><td><b>{k.name}</b><div className="text-xs text-gray-500">created {fmtDT(k.createdAt)}</div></td><td className="font-mono text-xs">{k.prefix}…</td><td className="text-sm">{k.user?.name} <span className="badge bg-gray-100">{k.user?.role}</span></td><td><span className={'badge ' + (k.scopes.includes('write') ? 'bg-amber-100 text-amber-700' : 'bg-gray-100')}>{k.scopes.includes('write') ? 'read + write' : 'read-only'}</span></td><td className="text-xs">{k.lastUsedAt ? fmtDT(k.lastUsedAt) : 'never'}</td><td className="text-xs">{k.expiresAt ? fmtDT(k.expiresAt) : '—'}</td><td>{k.revokedAt ? <span className="badge bg-red-100 text-red-700">revoked</span> : <span className="badge bg-green-100 text-green-700">active</span>}</td><td className="whitespace-nowrap">{!k.revokedAt
        ? <><button className="btn-secondary !py-0.5 !px-2 mr-1" onClick={() => setEdit({ id: k.id, name: k.name, write: k.scopes.includes('write'), days: '' })}>Edit</button>
            <button className="btn-secondary !py-0.5 !px-2 text-red-600" onClick={() => revoke(k)}>Revoke</button></>
        : <button className="btn-secondary !py-0.5 !px-2 text-red-600" onClick={() => destroy(k)}>Delete</button>}</td></tr>)}
    </tbody></table></div>
    <Modal title="Edit API key" open={!!edit} onClose={() => setEdit(null)}>{edit && <div className="space-y-2">
      <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
      <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={edit.write} onChange={(e) => setEdit({ ...edit, write: e.target.checked })} /> Allow writes</label>
      <Field label="Reset expiry to N days from now (blank = never expires)"><input className="input" type="number" value={edit.days} onChange={(e) => setEdit({ ...edit, days: e.target.value })} /></Field>
      <div className="text-xs text-gray-500">The secret itself can't be changed — only its hash is stored. To rotate it, revoke this key and create a new one.</div>
      <button className="btn-primary w-full" disabled={!edit.name.trim()} onClick={saveEdit}>Save changes</button>
    </div>}</Modal>
  </div>;
}
