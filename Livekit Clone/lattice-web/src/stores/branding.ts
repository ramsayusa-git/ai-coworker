import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Admin, type Brand } from '../api'

/** Neutral fallback. Used if branding cannot be fetched, so the console never
 *  renders half-styled or blank while waiting on the network. */
const FALLBACK: Brand = {
  product_name: 'Lattice Net',
  logo_url: '', logo_dark_url: '', favicon_url: '', login_art_url: '',
  colors: {
    primary: '#6d5efc', accent: '#22d3ee', bg: '#07080d', panel: '#0f111a',
    text: '#f2f4f8', muted: '#9aa2b4', success: '#34d399',
    warning: '#fbbf24', danger: '#f87171',
  },
  typography: { font_body: 'Inter Variable', font_mono: 'JetBrains Mono', scale: 1 },
  radius: { sm: '8px', md: '12px', lg: '18px' },
  support_url: '', docs_url: '', privacy_url: '', terms_url: '',
  custom_css: '',
}

const STYLE_ID = 'lattice-brand-vars'
const CUSTOM_ID = 'lattice-brand-custom'

export const useBranding = defineStore('branding', () => {
  const brand = ref<Brand>({ ...FALLBACK })
  const loaded = ref(false)

  /** Write the profile out as CSS custom properties on :root. */
  function apply(b: Brand) {
    brand.value = { ...FALLBACK, ...b, colors: { ...FALLBACK.colors, ...(b.colors || {}) } }
    const c = brand.value.colors
    const r = { ...FALLBACK.radius, ...(brand.value.radius || {}) }
    const t = { ...FALLBACK.typography, ...(brand.value.typography || {}) }

    const vars = [
      `--brand-primary:${c.primary}`,
      `--brand-accent:${c.accent}`,
      `--brand-bg:${c.bg}`,
      `--brand-panel:${c.panel}`,
      `--brand-text:${c.text}`,
      `--brand-muted:${c.muted}`,
      `--brand-success:${c.success}`,
      `--brand-warning:${c.warning}`,
      `--brand-danger:${c.danger}`,
      `--brand-radius-sm:${r.sm}`,
      `--brand-radius-md:${r.md}`,
      `--brand-radius-lg:${r.lg}`,
      `--brand-font:${t.font_body}`,
      `--brand-mono:${t.font_mono}`,
    ].join(';')

    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_ID
      document.head.appendChild(el)
    }
    el.textContent = `:root{${vars}}`

    // custom_css is injected last so a partner can override anything above.
    let custom = document.getElementById(CUSTOM_ID) as HTMLStyleElement | null
    if (brand.value.custom_css) {
      if (!custom) {
        custom = document.createElement('style')
        custom.id = CUSTOM_ID
        document.head.appendChild(custom)
      }
      custom.textContent = brand.value.custom_css
    } else if (custom) {
      custom.remove()
    }

    if (brand.value.product_name) document.title = brand.value.product_name
    if (brand.value.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = brand.value.favicon_url
    }
  }

  /** Pre-auth branding, resolved by host — the login screen needs it. */
  async function loadPublic() {
    try {
      apply(await Admin.publicBranding())
    } catch {
      apply(FALLBACK)
    } finally {
      loaded.value = true
    }
  }

  async function load() {
    try {
      apply(await Admin.branding())
    } catch {
      /* keep whatever is already applied */
    } finally {
      loaded.value = true
    }
  }

  async function save(patch: Partial<Brand>) {
    apply(await Admin.saveBranding(patch))
  }

  /** Live preview without persisting — used by the brand editor. */
  function preview(patch: Partial<Brand>) {
    apply({ ...brand.value, ...patch } as Brand)
  }

  return { brand, loaded, apply, load, loadPublic, save, preview, FALLBACK }
})
