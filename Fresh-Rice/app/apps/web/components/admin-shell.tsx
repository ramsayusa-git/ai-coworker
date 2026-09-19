'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** Nav item: [href, label, icon, roles?]. No roles = ADMIN/OPS only (the original ops console). */
type Item = [string, string, string, string[]?];
type Group = { name: string; items: Item[] };

export const GROUPS: Group[] = [
  { name: 'Overview', items: [['/admin', 'Dashboard', '📊']] },
  { name: 'Sell', items: [
    ['/admin/orders', 'Orders', '🧾', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/issues', 'Issues desk', '🎧', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/customers', 'Customers', '👤', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/b2b', 'B2B accounts', '🏢', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/leads', 'Leads (CRM)', '🎯', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/subscriptions', 'Subscriptions', '🔁'],
    ['/admin/coupons', 'Coupons', '🎟️', ['ADMIN', 'OPS', 'MARKETING']],
    ['/admin/pricing', 'Pricing', '💰'],
  ] },
  { name: 'Operate', items: [
    ['/admin/dispatch', 'Dispatch', '🚚'],
    ['/admin/riders', 'Field · live', '📍', ['ADMIN', 'OPS', 'SALES', 'MARKETING']],
    ['/admin/zones', 'Zones & slots', '🗺️'],
    ['/admin/approvals', 'Approvals', '✅', ['ADMIN', 'OPS']],
  ] },
  { name: 'Stock', items: [
    ['/admin/inventory', 'Stock & lots', '📦'],
    ['/admin/stickers', 'QR stickers', '🏷️'],
    ['/admin/warehouses', 'Warehouses', '🏬'],
    ['/admin/vendors', 'Vendors', '🤝'],
    ['/admin/purchase-orders', 'Purchase orders', '📝'],
  ] },
  { name: 'People', items: [
    ['/admin/hr', 'HR', '🧑‍💼', ['ADMIN', 'OPS']],
    ['/admin/fleet', 'Fleet', '🛵', ['ADMIN', 'OPS']],
    ['/admin/team', 'Team', '👥', ['ADMIN']],
  ] },
  { name: 'Money', items: [
    ['/admin/invoices', 'Invoices', '📄', ['ADMIN', 'OPS', 'SALES']],
    ['/admin/invoice-templates', 'Invoice templates', '🧩'],
    ['/admin/reports', 'Reports', '📈', ['ADMIN', 'OPS', 'SALES', 'MARKETING']],
  ] },
  { name: 'System', items: [
    ['/admin/data', 'Import / export', '🔄'],
    ['/admin/messages', 'WhatsApp log', '💬', ['ADMIN', 'OPS', 'MARKETING']],
    ['/admin/api-keys', 'API keys (Claude / MCP)', '🔑', ['ADMIN']],
  ] },
];

export type NavPos = 'left' | 'top';
type Prefs = { pos: NavPos; collapsed: boolean };
const DEFAULTS: Prefs = { pos: 'left', collapsed: false };
const KEY = 'fr_admin_layout';

/** Layout preference, per browser. Starts at DEFAULTS on both server and first client
 *  render (so hydration matches), then loads the saved value in an effect. Every
 *  localStorage touch is guarded — it throws in private mode / blocked-storage. */
function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) }); } catch {}
  }, []);
  const update = (p: Partial<Prefs>) => setPrefs((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  return [prefs, update];
}

/** True while the viewport is below Tailwind's lg breakpoint. */
function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 1023px)');
    const on = () => setM(q.matches);
    on(); q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return m;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  const { user, logout } = useAuth();
  const [prefs, setPrefs] = usePrefs();
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);

  // Close the mobile drawer on navigation, otherwise it covers the page you just opened.
  useEffect(() => { setDrawer(false); }, [p]);

  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter(([, , , roles]) => !roles || (user && roles.includes(user.role))) }))
    .filter((g) => g.items.length);

  const active = (href: string) => (href === '/admin' ? p === '/admin' : p.startsWith(href));
  // On mobile the rail is always full-width inside the drawer — never the icon-only rail.
  const collapsed = prefs.collapsed && !isMobile && prefs.pos === 'left';
  const topMode = prefs.pos === 'top' && !isMobile;

  const NavLink = ({ it }: { it: Item }) => {
    const [href, label, icon] = it;
    const on = active(href);
    return <Link href={href} title={collapsed ? label : undefined}
      className={'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ' + (on ? 'bg-leaf-600 text-white font-medium shadow-sm' : 'text-gray-300 hover:bg-white/10 hover:text-white')}>
      <span className="text-base leading-none shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>;
  };

  const Rail = () => <div className="flex flex-col h-full bg-gray-900 text-gray-200">
    <div className={'flex items-center gap-2 border-b border-white/10 px-4 py-4 ' + (collapsed ? 'justify-center px-2' : '')}>
      <span className="text-lg">🌾</span>
      {!collapsed && <span className="font-bold text-white truncate">FreshRice Ops</span>}
    </div>
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
      {groups.map((g) => <div key={g.name}>
        {!collapsed && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.name}</div>}
        <div className="space-y-0.5">{g.items.map((it) => <NavLink key={it[0]} it={it} />)}</div>
      </div>)}
    </nav>
    <div className="border-t border-white/10 p-3 text-xs">
      {!collapsed && <div className="mb-2 truncate text-gray-300">{user?.name} <span className="text-gray-500">({user?.role})</span></div>}
      <div className={'flex gap-2 ' + (collapsed ? 'flex-col items-center' : '')}>
        <a href="/docs" target="_blank" className="rounded px-2 py-1 hover:bg-white/10" title="API docs">📚{!collapsed && <span className="ml-1">Docs</span>}</a>
        <button onClick={logout} className="rounded px-2 py-1 hover:bg-white/10" title="Logout">🚪{!collapsed && <span className="ml-1">Logout</span>}</button>
      </div>
    </div>
  </div>;

  // Layout switcher — lets the user park the nav on the left or across the top,
  // and collapse the left rail to icons. Saved per browser.
  const LayoutSwitch = () => <div className="flex items-center gap-1">
    {prefs.pos === 'left' && !isMobile && <button onClick={() => setPrefs({ collapsed: !prefs.collapsed })}
      className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50" title={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{prefs.collapsed ? '»' : '«'}</button>}
    <button onClick={() => setPrefs({ pos: prefs.pos === 'left' ? 'top' : 'left' })}
      className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50" title="Move navigation">{prefs.pos === 'left' ? '▤ Left' : '▥ Top'}</button>
  </div>;

  const flat = groups.flatMap((g) => g.items);
  const current = flat.find((it) => active(it[0]));

  return <div className="min-h-screen bg-rice-50">
    {/* Desktop left rail */}
    {!isMobile && prefs.pos === 'left' && <aside className={'fixed inset-y-0 left-0 z-30 transition-all duration-200 ' + (collapsed ? 'w-16' : 'w-60')}><Rail /></aside>}

    {/* Desktop top bar mode */}
    {topMode && <header className="sticky top-0 z-30 bg-gray-900 text-gray-200">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="font-bold text-white whitespace-nowrap">🌾 FreshRice</span>
        <nav className="flex-1 flex gap-1 overflow-x-auto">{flat.map((it) => <Link key={it[0]} href={it[0]}
          className={'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ' + (active(it[0]) ? 'bg-leaf-600 text-white font-medium' : 'text-gray-300 hover:bg-white/10 hover:text-white')}>
          <span className="mr-1">{it[2]}</span>{it[1]}</Link>)}</nav>
        <button onClick={() => setPrefs({ pos: 'left' })} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10" title="Move navigation to the left">▤</button>
        <button onClick={logout} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10">Logout</button>
      </div>
    </header>}

    {/* Mobile: top bar + off-canvas drawer */}
    {isMobile && <>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-gray-900 px-4 py-3 text-white">
        <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">☰</button>
        <span className="font-bold">🌾 {current ? current[1] : 'FreshRice Ops'}</span>
      </header>
      {drawer && <div className="fixed inset-0 z-40 lg:hidden">
        <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
        <div className="absolute inset-y-0 left-0 w-64 shadow-xl"><Rail /></div>
      </div>}
    </>}

    {/* Content. Left rail is fixed, so the main column is inset by its width. */}
    <div className={!isMobile && prefs.pos === 'left' ? (collapsed ? 'pl-16' : 'pl-60') : ''}>
      {!isMobile && <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <h1 className="text-xl font-bold text-gray-800">{current ? current[1] : 'Admin'}</h1>
        <LayoutSwitch />
      </div>}
      <main className="p-4 lg:px-6 lg:pb-8 lg:pt-4">{children}</main>
    </div>
  </div>;
}
