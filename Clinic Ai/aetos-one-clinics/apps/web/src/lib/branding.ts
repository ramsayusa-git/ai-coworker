import { useEffect, useState } from 'react';
import { api } from './api';

export interface Branding {
  productName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  footerText: string | null;
  hidePoweredBy: boolean;
  customDomain?: string | null;
  subdomain?: string | null;
}

const DEFAULT_BRANDING: Branding = {
  productName: 'Aetos One Clinics',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#1F3A5F',
  accentColor: '#2F855A',
  footerText: null,
  hidePoweredBy: false,
};

// The platform's own base domain for free per-clinic subdomains, e.g. a clinic
// with subdomain "sunrise" is reachable at sunrise.aetosone.clinics. Set via
// build-time env; falls back to a placeholder so local dev still works.
const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN ?? 'aetosone.clinics';

function applyBrandingToDocument(b: Branding) {
  document.documentElement.style.setProperty('--brand-primary', b.primaryColor);
  document.documentElement.style.setProperty('--brand-accent', b.accentColor);
  document.title = b.productName;

  if (b.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }
}

/**
 * White-labeling: fetches this clinic's branding row and applies it as CSS
 * custom properties on :root plus <title>/<favicon>, so every component that
 * uses var(--brand-primary) etc. re-themes automatically. Before login, if the
 * page is being viewed on a clinic's own subdomain or custom domain, resolves
 * branding from the hostname instead of the authenticated /branding endpoint.
 */
export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const orgId = localStorage.getItem('aetos.orgId');
      try {
        const res = orgId ? await api.get('/branding') : await resolveFromHostname();
        if (cancelled || !res) return;
        const b = { ...DEFAULT_BRANDING, ...res };
        setBranding(b);
        applyBrandingToDocument(b);
      } catch {
        /* not logged in yet / branding not configured — defaults already applied */
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}

async function resolveFromHostname(): Promise<Branding | null> {
  const host = window.location.hostname;
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    const subdomain = host.slice(0, -1 * (BASE_DOMAIN.length + 1));
    const res = await api.get(`/branding/by-subdomain/${subdomain}`);
    return res.data;
  }
  if (host !== 'localhost' && !host.endsWith(BASE_DOMAIN)) {
    const res = await api.get(`/branding/by-domain/${host}`);
    return res.data;
  }
  return null;
}
