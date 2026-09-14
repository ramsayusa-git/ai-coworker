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

// The app's UI is built with ~200 hardcoded Tailwind `emerald-*` classes (buttons, links,
// borders, focus rings) rather than a per-className brand token, so re-skinning it for a
// reseller means redirecting those compiled utilities to CSS variables instead (see the
// `.bg-emerald-600 { background-color: var(--brand-600) !important }` block in globals.css).
// This derives a full 50-900 shade scale from the partner's single `primaryColor` hex —
// same hue/saturation throughout, lightness stepped to roughly match Tailwind's own curve —
// and writes it onto <html> so every emerald-* utility across the app picks it up.
function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

// Lightness (%) for each shade, independent of hue — approximates Tailwind's own scale.
const SHADE_LIGHTNESS: Record<string, number> = {
  "50": 97, "100": 91, "200": 82, "300": 70, "400": 56,
  "500": 44, "600": 36, "700": 29, "800": 24, "900": 20,
};

function applyBrandColorScale(primaryColor: string) {
  if (typeof document === "undefined") return;
  const hsl = hexToHsl(primaryColor);
  const root = document.documentElement.style;
  if (!hsl) {
    // Unparseable value from partner input — clear overrides so the default emerald scale
    // baked into globals.css (which already matches the platform default) takes over.
    Object.keys(SHADE_LIGHTNESS).forEach((shade) => root.removeProperty(`--brand-${shade}`));
    return;
  }
  const [h, s] = hsl;
  for (const [shade, l] of Object.entries(SHADE_LIGHTNESS)) {
    root.setProperty(`--brand-${shade}`, hslToHex(h, s, l));
  }
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
    applyBrandColorScale(brand.primaryColor);
  }, [brand]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
