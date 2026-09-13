"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/brand-provider";

const navLinks = [
  { href: "/product", label: "Overview" },
  { href: "/product/features", label: "Features" },
  { href: "/product/pricing", label: "Pricing" },
  { href: "/product/compare", label: "Compare" },
];

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const brand = useBrand();

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/product" className="flex items-center gap-2 font-semibold" style={{ color: brand.primaryColor }}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.brandName} className="h-7 max-w-[10rem] object-contain" />
            ) : (
              <>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-sm text-white">A</span>
                <span>{brand.brandName}</span>
              </>
            )}
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href}
                className={`hover:text-emerald-700 ${pathname === l.href ? "font-semibold text-emerald-700" : ""}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-emerald-700">
              Sign in
            </Link>
            <Link href="/register"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Get started free
            </Link>
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 sm:hidden">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-emerald-700">{l.label}</Link>
          ))}
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-4">
            <div>
              <div className="font-semibold" style={{ color: brand.primaryColor }}>{brand.brandName}</div>
              <p className="mt-2 text-sm text-zinc-500">
                One platform for WhatsApp inbox, broadcasts, bots, ads and commerce — built on the official Meta Cloud API.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Product</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li><Link href="/product/features" className="hover:text-emerald-700">Features</Link></li>
                <li><Link href="/product/pricing" className="hover:text-emerald-700">Pricing</Link></li>
                <li><Link href="/product/compare" className="hover:text-emerald-700">Compare</Link></li>
                <li><Link href="/help" className="hover:text-emerald-700">Help &amp; Guide</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Account</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li><Link href="/login" className="hover:text-emerald-700">Sign in</Link></li>
                <li><Link href="/register" className="hover:text-emerald-700">Create an organization</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Built on</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li>Official Meta Cloud API</li>
                <li>0% message markup</li>
                <li>India GST invoicing</li>
              </ul>
            </div>
          </div>
          <p className="mt-8 text-xs text-zinc-400">
            {brand.footerText || `© ${new Date().getFullYear()} ${brand.brandName}. All rights reserved.`}
          </p>
        </div>
      </footer>
    </div>
  );
}
