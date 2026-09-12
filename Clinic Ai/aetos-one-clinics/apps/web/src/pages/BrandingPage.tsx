import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface BrandingForm {
  productName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  subdomain: string;
  customDomain: string;
  supportEmail: string;
  supportPhone: string;
  footerText: string;
  hidePoweredBy: boolean;
}

const EMPTY: BrandingForm = {
  productName: '',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#1F3A5F',
  accentColor: '#2F855A',
  subdomain: '',
  customDomain: '',
  supportEmail: '',
  supportPhone: '',
  footerText: '',
  hidePoweredBy: false,
};

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN ?? 'aetosone.clinics';

/** White-label settings — lets a reseller/multi-clinic org present the product under its own name, domain, and footer. */
export default function BrandingPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(EMPTY);
  const { data } = useQuery({ queryKey: ['branding'], queryFn: async () => (await api.get('/branding')).data });

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => api.put('/branding', form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });

  const field = (key: keyof BrandingForm, label: string, type = 'text', help?: string) => (
    <div style={{ marginBottom: 12 }}>
      <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{label}</label>
      {type === 'checkbox' ? (
        <input type="checkbox" checked={form[key] as boolean} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} />
      ) : (
        <input
          type={type}
          value={form[key] as string}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6 }}
        />
      )}
      {help && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{help}</div>}
    </div>
  );

  return (
    <div>
      <h1>Branding (white-label)</h1>
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>Identity</div>
        {field('productName', 'Product name shown to staff/patients')}
        {field('logoUrl', 'Logo URL', 'text', 'Shown in the sidebar and on printed prescriptions/invoices')}
        {field('faviconUrl', 'Favicon URL', 'text', 'Small square image (.ico/.png), shown in the browser tab')}

        <div className="card-title" style={{ fontSize: 13, margin: '16px 0 4px' }}>Colors</div>
        {field('primaryColor', 'Primary color', 'color')}
        {field('accentColor', 'Accent color', 'color')}

        <div className="card-title" style={{ fontSize: 13, margin: '16px 0 4px' }}>Domain</div>
        {field('subdomain', 'Free subdomain', 'text', form.subdomain ? `Reachable at ${form.subdomain}.${BASE_DOMAIN}` : `e.g. "sunrise" → sunrise.${BASE_DOMAIN}`)}
        {field('customDomain', 'Custom domain (reseller/white-label plans)', 'text', 'e.g. clinic.example.com — requires a CNAME to this platform')}

        <div className="card-title" style={{ fontSize: 13, margin: '16px 0 4px' }}>Support & footer</div>
        {field('supportEmail', 'Support email')}
        {field('supportPhone', 'Support phone')}
        {field('footerText', 'Custom footer text', 'text', 'Shown at the bottom of the sidebar, e.g. "© 2026 Sunrise Clinic"')}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {field('hidePoweredBy', 'Hide "Powered by Aetos One" (reseller plans only)', 'checkbox')}
        </div>

        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </div>
  );
}
