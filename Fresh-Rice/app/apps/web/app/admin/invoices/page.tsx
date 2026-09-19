'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, fetcher, paise, fmtDate, fmtDT, API, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatusBadge, Modal, Field, useToast } from '@/components/ui';

export default function Invoices() {
  const { user } = useAuth(); const canEdit = ['ADMIN', 'OPS'].includes(user?.role);
  const [status, setStatus] = useState(''); const [search, setSearch] = useState('');
  const { data, mutate } = useSWR(`/admin/invoices?status=${status}&search=${encodeURIComponent(search)}`, fetcher);
  const { show, Toast } = useToast();
  const [re, setRe] = useState<any>(null); const [reason, setReason] = useState(''); const [bn, setBn] = useState(''); const [bg, setBg] = useState(''); const [ba, setBa] = useState(''); const [busy, setBusy] = useState(false);
  const [send, setSend] = useState<any>(null); const [email, setEmail] = useState(''); const [chW, setChW] = useState(true); const [chE, setChE] = useState(true);
  const issued = data?.filter((i: any) => i.status === 'ISSUED') || [];
  const totals = issued.reduce((a: any, i: any) => ({ n: a.n + 1, sub: a.sub + i.subtotalPaise, gst: a.gst + i.gstPaise, tot: a.tot + i.totalPaise }), { n: 0, sub: 0, gst: 0, tot: 0 });
  const openRe = (i: any) => { setRe(i); setReason(''); setBn(i.buyerName); setBg(i.buyerGstin || ''); setBa(i.buyerAddress); };
  const doReissue = async () => { setBusy(true); try { const r = await api(`/orders/${re.orderId}/invoice/reissue`, { body: { reason, buyerName: bn, buyerGstin: bg, buyerAddress: ba } }); show(`Reissued as ${r.invoice.invoiceNo}; ${re.invoiceNo} cancelled`); setRe(null); mutate(); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  const doSend = async () => { setBusy(true); try { const r = await api(`/orders/${send.orderId}/invoice/resend`, { body: { channels: [...(chW ? ['whatsapp'] : []), ...(chE ? ['email'] : [])], email: email || undefined } }); show(`WhatsApp: ${r.results.whatsapp || '-'} · Email: ${r.results.email || '-'}`); setSend(null); } catch (e: any) { show(e.message, true); } finally { setBusy(false); } };
  return <div><Toast />
    <div className="flex flex-wrap justify-between items-center gap-2 mb-1"><h1 className="text-2xl font-bold">Invoices</h1>
      <div className="flex gap-2"><input className="input" placeholder="Search invoice no / buyer / GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="ISSUED">Issued</option><option value="CANCELLED">Cancelled</option></select></div></div>
    <p className="text-sm text-gray-600 mb-4">Issued automatically when an order is confirmed. Reissue keeps the old number as cancelled (audit trail) and issues a fresh one; resend goes out on WhatsApp as a signed link and on email as a PDF.</p>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4"><div className="card"><div className="text-xs text-gray-500">Active invoices</div><b className="text-xl">{totals.n}</b></div><div className="card"><div className="text-xs text-gray-500">Taxable value</div><b className="text-xl">{paise(totals.sub)}</b></div><div className="card"><div className="text-xs text-gray-500">GST collected</div><b className="text-xl">{paise(totals.gst)}</b></div><div className="card"><div className="text-xs text-gray-500">Total billed</div><b className="text-xl">{paise(totals.tot)}</b></div></div>
    <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Invoice</th><th>Status</th><th>Date</th><th>Order</th><th>Buyer</th><th>GSTIN</th><th className="text-right">Taxable</th><th className="text-right">GST</th><th className="text-right">Total</th><th>Payment</th><th></th></tr></thead><tbody>
      {data?.map((i: any) => <tr key={i.id} className={i.status === 'CANCELLED' ? 'opacity-60' : ''}>
        <td className="font-mono text-xs">{i.invoiceNo}{i.revision > 1 && <span className="badge bg-amber-100 text-amber-700 ml-1">rev {i.revision}</span>}</td>
        <td>{i.status === 'CANCELLED' ? <span className="badge bg-red-100 text-red-700" title={i.cancelReason}>cancelled</span> : <span className="badge bg-green-100 text-green-700">issued</span>}{i.cancelReason && <div className="text-xs text-gray-500 max-w-[160px] truncate" title={i.cancelReason}>{i.cancelReason}</div>}</td>
        <td>{fmtDate(i.issuedAt)}</td><td>#{i.order.orderNo} <span className="badge bg-gray-100">{i.order.channel}</span></td><td>{i.buyerName}<div className="text-xs text-gray-500">{i.order.user?.phone}</div></td><td className="font-mono text-xs">{i.buyerGstin || '—'}</td>
        <td className="text-right">{paise(i.subtotalPaise)}</td><td className="text-right">{paise(i.gstPaise)}</td><td className="text-right font-semibold">{paise(i.totalPaise)}</td>
        <td className="text-xs">{i.order.payment?.method} <StatusBadge s={i.order.payment?.status || '-'} /></td>
        <td className="whitespace-nowrap text-xs"><a className="underline mr-2" target="_blank" href={`${API}/v1/orders/${i.orderId}/invoice.html?t=${getToken()}`}>Open</a>
          {i.status === 'ISSUED' && <><button className="btn-secondary !py-0.5 !px-2 mr-1" onClick={() => { setSend(i); setEmail(i.order.user?.email || ''); }}>Resend</button>{canEdit && <button className="btn-secondary !py-0.5 !px-2" onClick={() => openRe(i)}>Reissue</button>}</>}</td>
      </tr>)}</tbody></table>{data && !data.length && <div className="text-gray-400 text-center py-6">No invoices</div>}</div>
    <Modal title={`Reissue ${re?.invoiceNo || ''}`} open={!!re} onClose={() => setRe(null)}>{re && <div className="space-y-2">
      <div className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded p-2">{re.invoiceNo} will be marked <b>cancelled</b> (kept for GST audit) and a new invoice number issued with the details below. Amounts are recomputed from the order; the customer is notified.</div>
      <Field label="Reason (required)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. GSTIN correction requested by buyer" /></Field>
      <Field label="Buyer name"><input className="input" value={bn} onChange={(e) => setBn(e.target.value)} /></Field>
      <Field label="Buyer GSTIN (blank = none)"><input className="input font-mono" value={bg} onChange={(e) => setBg(e.target.value.toUpperCase())} maxLength={15} /></Field>
      <Field label="Buyer address"><textarea className="input" rows={2} value={ba} onChange={(e) => setBa(e.target.value)} /></Field>
      <button className="btn-primary w-full" disabled={busy || !reason.trim()} onClick={doReissue}>{busy ? 'Reissuing…' : 'Cancel old & issue new invoice'}</button></div>}</Modal>
    <Modal title={`Resend ${send?.invoiceNo || ''}`} open={!!send} onClose={() => setSend(null)}>{send && <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chW} onChange={(e) => setChW(e.target.checked)} /> WhatsApp to {send.order.user?.phone} (signed link)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chE} onChange={(e) => setChE(e.target.checked)} /> Email with PDF attached</label>
      {chE && <Field label="Email address"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" /></Field>}
      <div className="text-xs text-gray-500">WhatsApp/email go out for real only once the WhatsApp Cloud API / SMTP keys are configured; until then they're logged.</div>
      <button className="btn-primary w-full" disabled={busy || (!chW && !chE)} onClick={doSend}>{busy ? 'Sending…' : 'Send'}</button></div>}</Modal>
  </div>;
}
