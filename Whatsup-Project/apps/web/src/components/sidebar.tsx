"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getToken } from "@/lib/api";
import { useBrand } from "@/components/brand-provider";
import { useResizableWidth } from "@/lib/use-resizable-width";
import { Icon } from "@/components/nav-icons";
import { LoqioLogo, LoqioMark } from "@/components/logo";

type NavItem = { href: string; label: string; icon: string; children?: NavItem[] };
type NavSection = { section: string; items: NavItem[] };

// Multi-level: a parent row expands to reveal its children, and stays expanded while
// one of them is the current page. Flat single-item groups keep their old behaviour.
const navSections: NavSection[] = [
  {
    section: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/analytics", label: "Analytics", icon: "analytics" },
    ],
  },
  {
    section: "Conversations",
    items: [
      { href: "/inbox", label: "Inbox", icon: "inbox" },
      { href: "/tickets", label: "Tickets", icon: "help" },
      { href: "/channels", label: "Channels", icon: "channels" },
    ],
  },
  {
    section: "CRM",
    items: [
      {
        href: "/contacts", label: "Contacts", icon: "contacts",
        children: [
          { href: "/companies", label: "Companies", icon: "companies" },
          { href: "/leads", label: "Leads", icon: "users" },
          { href: "/deals", label: "Deals", icon: "deals" },
          { href: "/quotes", label: "Quotes", icon: "templates" },
          { href: "/appointments", label: "Appointments", icon: "tasks" },
          { href: "/tasks", label: "Tasks", icon: "tasks" },
        ],
      },
    ],
  },
  {
    section: "Engage",
    items: [
      { href: "/broadcasts", label: "Broadcasts", icon: "broadcasts" },
      {
        href: "/templates", label: "Templates", icon: "templates",
        children: [{ href: "/flows", label: "WhatsApp Flows", icon: "flows" }],
      },
      { href: "/ads-manager", label: "Ads & Social", icon: "ads" },
    ],
  },
  {
    section: "Automation",
    items: [
      { href: "/bots", label: "Bots", icon: "bots" },
      { href: "/automations", label: "Rules", icon: "automations" },
      { href: "/surveys", label: "Surveys", icon: "analytics" },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/help", label: "Help & Guide", icon: "help" },
    ],
  },
];

const COLLAPSE_KEY = "sidebar_collapsed";

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

function NavRow({
  item, path, collapsed, depth = 0, onNavigate,
}: { item: NavItem; path: string; collapsed: boolean; depth?: number; onNavigate?: () => void }) {
  const active = isActive(path, item.href);
  const childActive = item.children?.some((c) => isActive(path, c.href)) ?? false;
  const [open, setOpen] = useState(active || childActive);

  useEffect(() => { if (active || childActive) setOpen(true); }, [active, childActive]);

  return (
    <div>
      <div className="group relative flex items-center">
        <Link
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={`lq-ring-focus flex flex-1 items-center gap-2.5 rounded-lg py-2 text-sm transition-all duration-200 ${
            collapsed ? "justify-center px-0" : depth ? "pl-9 pr-3" : "px-3"
          } ${
            active
              ? "bg-emerald-50 font-medium text-emerald-700"
              : "text-zinc-600 hover:bg-zinc-100 hover:translate-x-0.5"
          }`}
        >
          {/* Glowing accent bar on the active row */}
          {active && !collapsed && (
            <span className="absolute left-0 h-5 w-[3px] rounded-r bg-emerald-600 shadow-[0_0_10px_var(--brand-500)]" />
          )}
          <Icon name={item.icon} className={depth ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {!collapsed && item.children && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={open}
            className="lq-ring-focus mr-1 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>

      {item.children && !collapsed && (
        <div
          className="overflow-hidden transition-[max-height,opacity] duration-300"
          style={{ maxHeight: open ? `${item.children.length * 40}px` : 0, opacity: open ? 1 : 0 }}
        >
          <div className="mt-0.5 space-y-0.5 border-l border-zinc-100 pl-1">
            {item.children.map((c) => (
              <NavRow key={c.href} item={c} path={path} collapsed={collapsed} depth={1} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NavTree({ collapsed, path, hasPartner, onNavigate }: {
  collapsed: boolean; path: string; hasPartner: boolean; onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
      {navSections.map((s) => (
        <div key={s.section} className="space-y-0.5">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{s.section}</div>
          )}
          {collapsed && <div className="mx-auto my-1 h-px w-6 bg-zinc-200" />}
          {s.items.map((item) => (
            <NavRow key={item.href} item={item} path={path} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
      {hasPartner && (
        <div className="space-y-0.5">
          {!collapsed && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Reseller</div>
          )}
          {collapsed && <div className="mx-auto my-1 h-px w-6 bg-zinc-200" />}
          <NavRow item={{ href: "/partner", label: "Partner Console", icon: "partner" }}
            path={path} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  );
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  const brand = useBrand();
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt={brand.brandName} className={collapsed ? "h-8 w-8 object-contain" : "h-8 max-w-[9rem] object-contain"} />;
  }
  if (collapsed) {
    return <LoqioMark size={32} className="drop-shadow-[0_6px_18px_var(--brand-600)]" />;
  }
  return <LoqioLogo size={28} />;
}

export function Sidebar() {
  const path = usePathname();
  const brand = useBrand();
  const [hasPartner, setHasPartner] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { width, startDrag } = useResizableWidth("sidebar_width", { min: 200, max: 340, default: 248, edge: "right" });

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  // Close the mobile drawer on navigation so a tap-through never leaves it covering the page.
  useEffect(() => { setMobileOpen(false); }, [path]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${base}/v1/partners/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setHasPartner(Array.isArray(rows) && rows.length > 0))
      .catch(() => {});
  }, []);

  const footer = brand.footerText || `© ${new Date().getFullYear()} ${brand.brandName}`;

  return (
    <>
      {/* Mobile: a floating menu button and a slide-in drawer, since a fixed rail
          would eat most of a phone screen. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="lq-glass lq-ring-focus fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 shadow-lg md:hidden"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>

      <div
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white p-4 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-out)" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <BrandMark collapsed={false} />
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            className="lq-ring-focus rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <NavTree collapsed={false} path={path} hasPartner={hasPartner} onNavigate={() => setMobileOpen(false)} />
        <div className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">{footer}</div>
      </aside>

      {/* Desktop / tablet rail */}
      <aside
        style={{ width: collapsed ? 68 : width, transition: "width var(--dur) var(--ease-out)" }}
        className={`relative hidden shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex ${collapsed ? "px-2" : ""}`}
      >
        <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="lq-ring-focus absolute -right-3 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-transform duration-200 hover:bg-zinc-50 hover:scale-110">
          <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? "" : "rotate-180"}`} />
        </button>
        {!collapsed && (
          <div onPointerDown={startDrag} title="Drag to resize"
            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors hover:bg-emerald-200/60" />
        )}
        <div className={`mb-6 flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <BrandMark collapsed={collapsed} />
        </div>
        <NavTree collapsed={collapsed} path={path} hasPartner={hasPartner} />
        {!collapsed && (
          <div className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">{footer}</div>
        )}
      </aside>
    </>
  );
}
