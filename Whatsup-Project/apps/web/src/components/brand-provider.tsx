"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_BRAND, getCachedMe, getPublicBranding, getToken, type Brand } from "@/lib/api";

// White-label brand: logo, favicon, footer text and accent color. Signed-in users get their
// org's partner brand from /me (cached at login); signed-out screens (login/register/
// accept-invite) and the tab favicon resolve it from the public /public/branding lookup,
// keyed off the custom domain the request came in on. Always falls back to the platform
// default "Loqio" brand — nothing here can leave the UI unbranded or broken.
const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export function useBrand(): Brand {
  return useContext(BrandContext);
}

function applyFavicon(url: string | null) {
  if (typeof document === "undefined" || !url) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      // Signed-in: the cached /me response already carries the org's partner brand — no
      // extra request needed, and it stays correct across client-side navigation.
      const me = getToken() ? getCachedMe() : null;
      const resolved = me?.brand ?? (await getPublicBranding());
      if (!cancelled) setBrand(resolved);
    }
    resolve();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = brand.brandName;
    applyFavicon(brand.faviconUrl);
  }, [brand]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
