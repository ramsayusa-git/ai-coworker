'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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

/** Case-insensitive match on the item label or its group name, so "money" finds
 *  Invoices and "qr" finds QR stickers. */
function matches(q: string, label: string, group: string) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return label.toLowerCase().includes(n) || group.toLowerCase().includes(n);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [prefs, setPrefs] = usePrefs();
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');            // inline filter in the expanded rail
  const [palette, setPalette] = useState(false); // ⌘K overlay — works in every layout mode
  const [pq, setPq] = useState('');
  const [hi, setHi] = useState(0);            // highlighted row in the palette
  const pRef = useRef<HTMLInputElement>(null);

  // Close the mobile drawer on navigation, otherwise it covers the page you just opened.
  useEffect(() => { setDrawer(false); setPalette(false); }, [p]);

  // ⌘K / Ctrl+K anywhere opens the palette; Esc closes it. Ignored while the user is
  // typing in a field, so it can't hijack a form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPq(''); setHi(0); setPalette((v) => !v);
      } else if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (palette) setTimeout(() => pRef.current?.focus(), 20); }, [palette]);

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

  // Rail contents filtered by the inline search box.
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => matches(q, it[1], g.name)) }))
    .filter((g) => g.items.length);

  const Rail = () => <div className="flex flex-col h-full bg-gray-900 text-gray-200">
    <div className={'flex items-center gap-2 border-b border-white/10 px-4 py-4 ' + (collapsed ? 'justify-center px-2' : '')}>
      <span className="text-lg">🌾</span>
      {!collapsed && <span className="font-bold text-white truncate">FreshRice Ops</span>}
    </div>

    {/* Inline filter. The collapsed rail has no room for a field, so it gets a button
        that opens the same palette ⌘K does. */}
    {collapsed
      ? <button onClick={() => { setPq(''); setHi(0); setPalette(true); }} title="Search menu (⌘K)"
          className="mx-2 mt-2 rounded-lg py-2 text-center text-gray-300 hover:bg-white/10 hover:text-white">🔍</button>
      : <div className="px-2 pt-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">🔍</span>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }}
              placeholder="Search menu…"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-7 pr-7 text-sm text-white placeholder:text-gray-500 focus:border-leaf-500 focus:outline-none" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white">×</button>}
          </div>
        </div>}

    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
      {shown.map((g) => <div key={g.name}>
        {!collapsed && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.name}</div>}
        <div className="space-y-0.5">{g.items.map((it) => <NavLink key={it[0]} it={it} />)}</div>
      </div>)}
      {!shown.length && <div className="px-3 py-6 text-center text-xs text-gray-500">Nothing matches “{q}”</div>}
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

  // Palette results keep their group so the list stays readable when the query is empty.
  const results = useMemo(() => groups.flatMap((g) => g.items
    .filter((it) => matches(pq, it[1], g.name))
    .map((it) => ({ it, group: g.name }))), [groups.length, pq, user?.role]);
  const go = (href: string) => { setPalette(false); router.push(href); };

  const Palette = () => <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setPalette(false)} />
    <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
      <input ref={pRef} value={pq}
        onChange={(e) => { setPq(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); go(results[hi].it[0]); }
        }}
        placeholder="Jump to a page…"
        className="w-full border-b px-4 py-3 text-sm focus:outline-none" />
      <div className="max-h-80 overflow-y-auto py-1">
        {!results.length && <div className="px-4 py-8 text-center text-sm text-gray-400">Nothing matches “{pq}”</div>}
        {results.map(({ it, group }, i) => <button key={it[0]} onClick={() => go(it[0])} onMouseEnter={() => setHi(i)}
          className={'flex w-full items-center gap-3 px-4 py-2 text-left text-sm ' + (i === hi ? 'bg-leaf-50' : 'hover:bg-gray-50')}>
          <span>{it[2]}</span>
          <span className="flex-1 truncate">{it[1]}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{group}</span>
        </button>)}
      </div>
      <div className="border-t bg-gray-50 px-4 py-2 text-[11px] text-gray-500">↑↓ to move · ↵ to open · esc to close</div>
    </div>
  </div>;

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
        <button onClick={() => { setPq(''); setHi(0); setPalette(true); }} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10 whitespace-nowrap" title="Search menu (⌘K)">🔍 <span className="opacity-60">⌘K</span></button>
        <button onClick={() => setPrefs({ pos: 'left' })} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10" title="Move navigation to the left">▤</button>
        <button onClick={logout} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10">Logout</button>
      </div>
    </header>}

    {/* Mobile: top bar + off-canvas drawer */}
    {isMobile && <>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-gray-900 px-4 py-3 text-white">
        <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">☰</button>
        <span className="flex-1 font-bold truncate">🌾 {current ? current[1] : 'FreshRice Ops'}</span>
        <button onClick={() => { setPq(''); setHi(0); setPalette(true); }} aria-label="Search menu" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10">🔍</button>
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

    {palette && <Palette />}
  </div>;
}
