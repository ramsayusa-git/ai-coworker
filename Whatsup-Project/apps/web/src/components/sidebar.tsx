"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getToken } from "@/lib/api";
import { useBrand } from "@/components/brand-provider";
import { useResizableWidth } from "@/lib/use-resizable-width";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/deals", label: "Deals", icon: "💼" },
  { href: "/broadcasts", label: "Broadcasts", icon: "📣" },
  { href: "/templates", label: "Templates", icon: "📄" },
  { href: "/bots", label: "Bots", icon: "🤖" },
  { href: "/automations", label: "Automations", icon: "🔀" },
  { href: "/ads-manager", label: "Ads & Social", icon: "📢" },
  { href: "/channels", label: "Channels", icon: "🔌" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/help", label: "Help & Guide", icon: "❓" },
];

const COLLAPSE_KEY = "sidebar_collapsed";

export function Sidebar() {
  const path = usePathname();
  const [hasPartner, setHasPartner] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const brand = useBrand();
  const { width, startDrag } = useResizableWidth("sidebar_width", { min: 176, max: 340, default: 224, edge: "right" });

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);

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

  return (
    <aside
      style={{ width: collapsed ? 64 : width }}
      className={`relative flex shrink-0 flex-col border-r border-zinc-200 bg-white p-4 ${collapsed ? "px-2" : ""}`}
    >
      <button onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs text-zinc-500 shadow-sm hover:bg-zinc-50">
        {collapsed ? "»" : "«"}
      </button>
      {!collapsed && (
        <div onPointerDown={startDrag} title="Drag to resize"
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-emerald-200/60" />
      )}
      <div className={`mb-6 flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.brandName} className={collapsed ? "h-6 w-6 object-contain" : "h-7 max-w-[9rem] object-contain"} />
        ) : collapsed ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold text-white" style={{ backgroundColor: brand.primaryColor }}>
            {brand.brandName.charAt(0)}
          </span>
        ) : (
          <span className="text-lg font-semibold" style={{ color: brand.primaryColor }}>{brand.brandName}</span>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              title={collapsed ? n.label : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${collapsed ? "justify-center px-0" : ""} ${
                active ? "bg-emerald-50 font-medium text-emerald-700" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <span aria-hidden>{n.icon}</span>
              {!collapsed && n.label}
            </Link>
          );
        })}
        {hasPartner && (
          <>
            {!collapsed && (
              <div className="mt-3 border-t border-zinc-100 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Reseller
              </div>
            )}
            {collapsed && <div className="my-2 border-t border-zinc-100" />}
            <Link
              href="/partner"
              title={collapsed ? "Partner Console" : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${collapsed ? "justify-center px-0" : ""} ${
                path.startsWith("/partner") ? "bg-emerald-50 font-medium text-emerald-700" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <span aria-hidden>🤝</span>
              {!collapsed && "Partner Console"}
            </Link>
          </>
        )}
      </nav>
      {!collapsed && (
        <div className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">
          {brand.footerText || `© ${new Date().getFullYear()} ${brand.brandName}`}
        </div>
      )}
    </aside>
  );
}
