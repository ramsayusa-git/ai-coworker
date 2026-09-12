"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { getCachedMe, getToken, clearSession, type Me } from "@/lib/api";

const PUBLIC_PATHS = ["/login", "/register", "/accept-invite"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (isPublic) { setChecked(true); return; }
    const token = getToken();
    const cached = getCachedMe();
    if (!token || !cached) {
      router.replace("/login");
      return;
    }
    setMe(cached);
    setChecked(true);
  }, [pathname, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (!checked) return null;
  if (!me) return null; // redirecting

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-end gap-3 border-b border-zinc-200 bg-white px-6 py-2 text-sm text-zinc-500">
          <span>{me.orgName}</span>
          <span className="text-zinc-300">|</span>
          <span>{me.name || me.email}</span>
          <button onClick={logout} className="text-emerald-600 hover:underline">Sign out</button>
        </div>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
