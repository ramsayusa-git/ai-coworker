'use client';
import { useState } from 'react';
export function Stat({ label, value, sub, warn }: { label: string; value: any; sub?: string; warn?: boolean }) {
  return <div className={'card ' + (warn ? 'border-amber-300 bg-amber-50' : '')}><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-semibold mt-1">{value ?? '—'}</div>{sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}</div>;
}
export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = { PENDING_PAYMENT: 'bg-gray-100 text-gray-700', CONFIRMED: 'bg-blue-100 text-blue-700', PACKED: 'bg-indigo-100 text-indigo-700', OUT_FOR_DELIVERY: 'bg-amber-100 text-amber-800', DELIVERED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700', FAILED: 'bg-red-100 text-red-700', ACTIVE: 'bg-green-100 text-green-700', PAUSED: 'bg-amber-100 text-amber-800', DRAFT: 'bg-gray-100 text-gray-700', PUBLISHED: 'bg-blue-100 text-blue-700', IN_PROGRESS: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-700', PAID: 'bg-green-100 text-green-700', PENDING: 'bg-gray-100 text-gray-700', SENT: 'bg-blue-100 text-blue-700', PARTIAL: 'bg-amber-100 text-amber-800', RECEIVED: 'bg-green-100 text-green-700' };
  return <span className={'badge ' + (map[s] || 'bg-gray-100 text-gray-700')}>{s.replace(/_/g, ' ')}</span>;
}
export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}><div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-center mb-3"><h3 className="font-semibold text-lg">{title}</h3><button onClick={onClose} className="text-gray-400 text-xl">×</button></div>{children}</div></div>;
}
export function useToast() {
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const show = (t: string, err = false) => { setMsg({ t, err }); setTimeout(() => setMsg(null), 3500); };
  const Toast = () => (msg ? <div className={'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm text-white shadow-lg ' + (msg.err ? 'bg-red-600' : 'bg-gray-900')}>{msg.t}</div> : null);
  return { show, Toast };
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="label">{label}</label>{children}</div>; }
export const Empty = ({ text }: { text: string }) => <div className="text-center text-gray-400 py-10 text-sm">{text}</div>;
