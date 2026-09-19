'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, fmtDate } from '@/lib/api';
import { Modal, Field, useToast } from '@/components/ui';
const ROLES = ['MARKETING', 'SALES', 'OPS', 'ADMIN', 'WAREHOUSE_STAFF'];
export default function Team() {
  const { data, mutate } = useSWR('/admin/staff', fetcher); const { data: whs } = useSWR('/admin/warehouses', fetcher);
  const { show, Toast } = useToast();
  const [edit, setEdit] = useState<any>(null);
  const save = async () => {
    try {
      if (edit.id) await api('/admin/staff/' + edit.id, { method: 'PATCH', body: edit });
      else await api('/admin/staff', { body: edit });
      setEdit(null); mutate(); show('Saved');
    } catch (e: any) { show(e.message, true); }
  };
  return <div><Toast />
    <div className="flex justify-between items-center mb-4"><h1 className="text-2xl font-bold">Team</h1><button className="btn-primary" onClick={() => setEdit({ role: 'SALES' })}>+ Staff account</button></div>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Field</th><th>Warehouse</th><th>Leads</th><th>Status</th><th></th></tr></thead><tbody>
      {data?.map((s: any) => <tr key={s.id} className={!s.active ? 'opacity-50' : ''}>
        <td>{s.name}</td><td>{s.phone}</td><td><span className="badge bg-gray-100">{s.role}</span></td><td>{s.isField ? <span className="badge bg-green-100 text-green-700">field · tracked</span> : <span className="text-gray-400">office</span>}</td>
        <td>{s.warehouse?.code || '-'}</td><td>{s._count?.assignedLeads ?? 0}</td>
        <td>{s.active ? <span className="text-green-700">Active</span> : <span className="text-red-600">Deactivated</span>}</td>
        <td><button className="btn-secondary !py-0.5 !px-2" onClick={() => setEdit(s)}>Edit</button></td>
      </tr>)}
    </tbody></table></div>
    <Modal title={edit?.id ? 'Edit staff account' : 'New staff account'} open={!!edit} onClose={() => setEdit(null)}>{edit && <div className="grid grid-cols-2 gap-2">
      <Field label="Name"><input className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
      <Field label="Phone (10-digit)"><input className="input" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} disabled={!!edit.id} /></Field>
      <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
      {edit.role === 'WAREHOUSE_STAFF' && <Field label="Warehouse"><select className="input" value={edit.warehouseId || ''} onChange={(e) => setEdit({ ...edit, warehouseId: e.target.value })}><option value="">Select…</option>{whs?.map((w: any) => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}</select></Field>}
      <label className="col-span-2 flex items-start gap-2 text-sm bg-rice-100 rounded p-2"><input type="checkbox" className="mt-1" checked={!!edit.isField} onChange={(e) => setEdit({ ...edit, isField: e.target.checked })} /><span><b>Field team</b> — works outside the office (sales visits, supervision). Their mobile app shares live location while they're clocked in, and they appear on Riders · live with duty hours.</span></label>
      {edit.id && <Field label="Status"><select className="input" value={edit.active === false ? '0' : '1'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">Active</option><option value="0">Deactivated</option></select></Field>}
      <button className="btn-primary col-span-2" disabled={!edit.name || !edit.phone} onClick={save}>Save</button>
    </div>}</Modal>
  </div>;
}
