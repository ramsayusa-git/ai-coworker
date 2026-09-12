"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
      </nav>
    </aside>
  );
}
