"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getToken } from "@/lib/api";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts" },
  { href: "/broadcasts", label: "Broadcasts" },
  { href: "/templates", label: "Templates" },
  { href: "/bots", label: "Bots" },
  { href: "/channels", label: "Channels" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const path = usePathname();
  const [hasPartner, setHasPartner] = useState(false);

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
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white p-4">
      <div className="mb-6 text-lg font-semibold text-emerald-600">Whatsup</div>
      <nav className="flex flex-col gap-1">
        {nav.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-2 text-sm ${
                active ? "bg-emerald-50 font-medium text-emerald-700" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
        {hasPartner && (
          <>
            <div className="mt-3 border-t border-zinc-100 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Reseller
            </div>
            <Link
              href="/partner"
              className={`rounded-md px-3 py-2 text-sm ${
                path.startsWith("/partner") ? "bg-emerald-50 font-medium text-emerald-700" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Partner Console
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}
