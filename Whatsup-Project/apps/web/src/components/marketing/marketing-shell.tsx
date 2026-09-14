"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/brand-provider";
import { useLanguage, LANGUAGES } from "@/components/marketing/language-context";
import type { LangCode } from "@/lib/i18n";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const brand = useBrand();
  const { lang, setLang, t } = useLanguage();

  const navLinks = [
    { href: "/", label: t.nav.overview },
    { href: "/product/features", label: t.nav.features },
    { href: "/product/pricing", label: t.nav.pricing },
    { href: "/product/compare", label: t.nav.compare },
  ];

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold" style={{ color: brand.primaryColor }}>
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
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as LangCode)}
              title="Choose language"
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 hover:border-emerald-300"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-emerald-700">
              {t.nav.signIn}
            </Link>
            <Link href="/register"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              {t.nav.getStarted}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4 overflow-x-auto border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 sm:hidden">
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
              <p className="mt-2 text-sm text-zinc-500">{t.footer.tagline}</p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.footer.product}</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li><Link href="/product/features" className="hover:text-emerald-700">{t.nav.features}</Link></li>
                <li><Link href="/product/pricing" className="hover:text-emerald-700">{t.nav.pricing}</Link></li>
                <li><Link href="/product/compare" className="hover:text-emerald-700">{t.nav.compare}</Link></li>
                <li><Link href="/help" className="hover:text-emerald-700">{t.footer.help}</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.footer.account}</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li><Link href="/login" className="hover:text-emerald-700">{t.nav.signIn}</Link></li>
                <li><Link href="/register" className="hover:text-emerald-700">{t.footer.createOrg}</Link></li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.footer.builtOn}</div>
              <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
                <li>{t.footer.officialApi}</li>
                <li>{t.footer.zeroMarkup}</li>
                <li>{t.footer.gst}</li>
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
