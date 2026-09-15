"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-provider";
import { Icon } from "./nav-icons";
import { getCachedMe, getToken, logout as logoutSession, type Me } from "@/lib/api";

const PUBLIC_PATHS = ["/", "/login", "/register", "/accept-invite", "/accept-partner-invite"];
// Marketing/product site — public by prefix, not exact match (has its own sub-routes).
const PUBLIC_PREFIXES = ["/product"];
// Reachable with just a JWT — no cached org profile required. Partner-team-only users
// (partner_owner/admin/support who accepted a partner invite but belong to no org) land
// here; there's nothing in getCachedMe() for them since that shape assumes an org.
const TOKEN_ONLY_PATHS = ["/partner"];

const TOPBAR_COLLAPSE_KEY = "topbar_collapsed";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [checked, setChecked] = useState(false);
  const [topbarCollapsed, setTopbarCollapsed] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isTokenOnly = TOKEN_ONLY_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    try { setTopbarCollapsed(localStorage.getItem(TOPBAR_COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  function toggleTopbar() {
    setTopbarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(TOPBAR_COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    if (isPublic) { setChecked(true); return; }
    const token = getToken();
    const cached = getCachedMe();
    if (!token || (!cached && !isTokenOnly)) {
      // Not signed in: send to the website (marketing home), not straight to /login.
      // The site's own "Sign in" button is how a returning user reaches /login.
      router.replace("/");
      return;
    }
    setMe(cached);
    setHasToken(!!token);
    setChecked(true);
  }, [pathname, isPublic, isTokenOnly, router]);

  if (isPublic) return <>{children}</>;
  if (!checked) return null;
  if (!me && !(isTokenOnly && hasToken)) return null; // redirecting

  function logout() {
    logoutSession();
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky glass header. Folds to a thin strip (the fold state is kept from
            the previous shell) and carries the theme switch. */}
        <header
          className={`lq-glass sticky top-0 z-30 flex items-center justify-end gap-3 border-0 border-b border-zinc-200 text-sm text-zinc-500 transition-[height,padding] duration-200 overflow-hidden ${
            topbarCollapsed ? "h-0 py-0" : "h-12 px-4 py-2 pl-16 md:pl-6"
          }`}
          style={{ transitionTimingFunction: "var(--ease-out)" }}
        >
          {!topbarCollapsed && (
            <>
              <span className="mr-auto truncate font-medium text-zinc-700">
                {me ? me.orgName : "Partner team account"}
              </span>
              <ThemeToggle compact />
              <span className="hidden truncate sm:inline">{me ? me.name || me.email : ""}</span>
              <button onClick={logout}
                className="lq-ring-focus flex items-center gap-1 rounded-lg px-2 py-1 text-emerald-600 transition-colors hover:bg-zinc-100">
                Sign out
              </button>
            </>
          )}
        </header>
        <button onClick={toggleTopbar} title={topbarCollapsed ? "Show top bar" : "Fold top bar"}
          className="lq-ring-focus mx-auto -mb-2 mt-1 flex h-4 w-10 items-center justify-center rounded-b-md border border-t-0 border-zinc-200 bg-white text-zinc-400 transition-colors hover:bg-zinc-50">
          <Icon name="chevron" className={`h-3 w-3 ${topbarCollapsed ? "rotate-90" : "-rotate-90"}`} />
        </button>
        <main key={pathname} className="lq-fade min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
