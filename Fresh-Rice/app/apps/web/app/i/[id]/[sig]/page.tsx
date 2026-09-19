'use client';
import { use } from 'react';
import { API } from '@/lib/api';

/** Public invoice viewer reached from WhatsApp/email links — the API serves the signed HTML; this just frames it with a PDF button. */
export default function PublicInvoice({ params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = use(params);
  const base = `${API}/v1/invoices/public/${id}/${sig}`;
  return <main className="min-h-screen bg-rice-50">
    <div className="max-w-3xl mx-auto p-3 flex justify-between items-center"><b className="text-leaf-700">🌾 FreshRice · tax invoice</b><div className="flex gap-2"><a className="btn-secondary !py-1" href={`${base}?format=pdf`} target="_blank">Download PDF</a><a className="btn-primary !py-1" href="/shop">Order again</a></div></div>
    <iframe title="Invoice" src={base} className="w-full bg-white border-t" style={{ height: 'calc(100vh - 56px)' }} />
  </main>;
}
