import 'server-only'
import { cache } from 'react'
import { controlDb } from '@/lib/control-db'
import { env } from '@/lib/env'

/**
 * White-label resolution. A brand is per-org, falls back to the deployment
 * defaults, and is applied at runtime through CSS custom properties — so a
 * reseller changes colours, logo, product name and sender identity without a
 * rebuild and without a fork.
 */

export type Brand = {
  productName: string
  shortName: string
  tagline: string | null
  vendorName: string
  supportEmail: string | null
  supportUrl: string | null
  docsUrl: string | null
  logoLight: string | null
  logoDark: string | null
  favicon: string | null
  colorPrimary: string
  colorAccent: string | null
  colorSidebar: string | null
  defaultTheme: string
  fontFamily: string | null
  cssVariables: Record<string, string>
  hideVendorMarks: boolean
  termsUrl: string | null
  privacyUrl: string | null
}

export const DEFAULT_BRAND: Brand = {
  productName: env.brand.productName,
  shortName: 'AOB',
  tagline: 'Bookkeeping that stays yours',
  vendorName: env.brand.vendorName,
  supportEmail: null,
  supportUrl: null,
  docsUrl: null,
  logoLight: null,
  logoDark: null,
  favicon: null,
  colorPrimary: env.brand.colorPrimary,
  colorAccent: null,
  colorSidebar: null,
  defaultTheme: 'system',
  fontFamily: null,
  cssVariables: {},
  hideVendorMarks: false,
  termsUrl: null,
  privacyUrl: null,
}

/** Only these custom properties may be overridden by an org's brand. */
const ALLOWED_VARS = new Set([
  '--brand-primary',
  '--brand-accent',
  '--sidebar',
  '--sidebar-foreground',
  '--radius',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
])

export const getBrand = cache(async (orgId: number | null): Promise<Brand> => {
  if (!orgId) return DEFAULT_BRAND
  const profile = await controlDb.brandProfile.findUnique({ where: { orgId } })
  if (!profile) return DEFAULT_BRAND

  const extra: Record<string, string> = {}
  if (profile.cssVariables && typeof profile.cssVariables === 'object') {
    for (const [key, value] of Object.entries(profile.cssVariables as Record<string, unknown>)) {
      if (ALLOWED_VARS.has(key) && typeof value === 'string' && value.length < 64) {
        extra[key] = value
      }
    }
  }

  return {
    productName: profile.productName,
    shortName: profile.shortName,
    tagline: profile.tagline,
    vendorName: profile.vendorName,
    supportEmail: profile.supportEmail,
    supportUrl: profile.supportUrl,
    docsUrl: profile.docsUrl,
    logoLight: profile.logoLightPath,
    logoDark: profile.logoDarkPath,
    favicon: profile.faviconPath,
    colorPrimary: profile.colorPrimary,
    colorAccent: profile.colorAccent,
    colorSidebar: profile.colorSidebar,
    defaultTheme: profile.defaultTheme,
    fontFamily: profile.fontFamily,
    cssVariables: extra,
    hideVendorMarks: profile.hideVendorMarks,
    termsUrl: profile.termsUrl,
    privacyUrl: profile.privacyUrl,
  }
})

/** Serialise a brand into the style block the layout injects. */
export function brandStyle(brand: Brand): string {
  const vars: Record<string, string> = {
    '--brand-primary': brand.colorPrimary,
    ...(brand.colorAccent ? { '--brand-accent': brand.colorAccent } : {}),
    ...(brand.colorSidebar ? { '--sidebar': brand.colorSidebar } : {}),
    ...brand.cssVariables,
  }
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('')
  return `:root{${body}}`
}
