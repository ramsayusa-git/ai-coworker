"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { getCachedMe, getToken, logout as logoutSession, type Me } from "@/lib/api";

const PUBLIC_PATHS = ["/login", "/register", "/accept-invite", "/accept-partner-invite"];
// Reachable with just a JWT — no cached org profile required. Partner-team-only users
// (partner_owner/admin/support who accepted a partner invite but belong to no org) land
// here; there's nothing in getCachedMe() for them since that shape assumes an org.
const TOKEN_ONLY_PATHS = ["/partner"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [checked, setChecked] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isTokenOnly = TOKEN_ONLY_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isPublic) { setChecked(true); return; }
    const token = getToken();
    const cached = getCachedMe();
    if (!token || (!cached && !isTokenOnly)) {
      router.replace("/login");
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
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end gap-3 border-b border-zinc-200 bg-white px-6 py-2 text-sm text-zinc-500">
          <span>{me ? me.orgName : "Partner team account"}</span>
          <span className="text-zinc-300">|</span>
          <span>{me ? me.name || me.email : ""}</span>
          <button onClick={logout} className="text-emerald-600 hover:underline">Sign out</button>
        </div>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
