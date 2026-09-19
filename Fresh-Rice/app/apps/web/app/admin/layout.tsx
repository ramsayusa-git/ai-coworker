'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireRole, useAuth } from '@/lib/auth';

// Each nav item optionally lists which roles see it. No `roles` = ADMIN/OPS only (the original ops console).
const NAV: [string, string, string[]?][] = [
  ['/admin', 'Dashboard'],
  ['/admin/orders', 'Orders', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/issues', 'Issues desk', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/approvals', 'Approvals', ['ADMIN', 'OPS']],
  ['/admin/dispatch', 'Dispatch'],
  ['/admin/riders', 'Field · live', ['ADMIN', 'OPS', 'SALES', 'MARKETING']],
  ['/admin/zones', 'Zones & slots'],
  ['/admin/subscriptions', 'Subscriptions'],
  ['/admin/inventory', 'Stock & lots'],
  ['/admin/warehouses', 'Warehouses'],
  ['/admin/vendors', 'Vendors'],
  ['/admin/purchase-orders', 'Purchase orders'],
  ['/admin/invoices', 'Invoices', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/invoice-templates', 'Invoice templates'],
  ['/admin/customers', 'Customers', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/b2b', 'B2B accounts', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/leads', 'Leads (CRM)', ['ADMIN', 'OPS', 'SALES']],
  ['/admin/pricing', 'Pricing'],
  ['/admin/coupons', 'Coupons', ['ADMIN', 'OPS', 'MARKETING']],
  ['/admin/reports', 'Reports', ['ADMIN', 'OPS', 'SALES', 'MARKETING']],
  ['/admin/data', 'Import / export'],
  ['/admin/messages', 'WhatsApp log', ['ADMIN', 'OPS', 'MARKETING']],
  ['/admin/team', 'Team', ['ADMIN']],
  ['/admin/api-keys', 'API keys (Claude / MCP)', ['ADMIN']],
];
const ALL_ROLES = ['ADMIN', 'OPS', 'MARKETING', 'SALES'];
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const p = usePathname(); const { user, logout } = useAuth();
  const items = NAV.filter(([, , roles]) => !roles || (user && roles.includes(user.role)));
  return <RequireRole roles={ALL_ROLES}><div className="min-h-screen flex">
    <aside className="w-44 lg:w-56 bg-gray-900 text-gray-200 flex flex-col shrink-0"><div className="px-4 py-4 font-bold text-white border-b border-gray-800">🌾 FreshRice Ops</div>
      <nav className="flex-1 py-2 text-sm">{items.map(([h, l]) => <Link key={h} href={h} className={'block px-4 py-2 hover:bg-gray-800 ' + (p === h ? 'bg-gray-800 text-white font-medium' : '')}>{l}</Link>)}</nav>
      <div className="px-4 py-3 text-xs border-t border-gray-800">{user?.name} <span className="text-gray-500">({user?.role})</span><br /><a href={'/docs'} target="_blank" className="underline">API docs</a> · <button onClick={logout} className="underline">Logout</button></div></aside>
    <main className="flex-1 p-6 overflow-auto">{children}</main></div></RequireRole>;
}
