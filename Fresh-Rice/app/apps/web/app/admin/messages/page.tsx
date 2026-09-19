'use client';
import useSWR from 'swr';
import { fetcher, fmtDT } from '@/lib/api';
export default function Messages() {
  const { data } = useSWR('/notifications', fetcher, { refreshInterval: 10000 });
  return <div><h1 className="text-2xl font-bold mb-1">WhatsApp / OTP log</h1><p className="text-sm text-gray-600 mb-4">Without a WHATSAPP_TOKEN the adapter logs messages here instead of sending. In dev mode every OTP is 123456.</p>
    <div className="card"><table className="tbl"><thead><tr><th>Time</th><th>To</th><th>Template</th><th>Message</th><th>Status</th></tr></thead><tbody>{data?.map((n: any) => <tr key={n.id}><td className="whitespace-nowrap">{fmtDT(n.at)}</td><td>{n.phone}</td><td><span className="badge bg-gray-100">{n.template}</span></td><td>{n.body}</td><td>{n.status}</td></tr>)}</tbody></table></div></div>;
}
