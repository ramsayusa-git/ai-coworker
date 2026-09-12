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

interface BrandingData extends BrandingForm {
  customDomainStatus: 'unset' | 'pending' | 'verified' | 'failed';
  customDomainActive: boolean;
}

interface DomainRecord {
  type: string;
  host: string;
  value: string | null;
}

interface VerifyResult {
  status: string;
  ownershipOk: boolean;
  cnameOk: boolean;
  expectedCname: string;
  error?: string;
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
  const { data } = useQuery<BrandingData>({ queryKey: ['branding'], queryFn: async () => (await api.get('/branding')).data });
  const { data: instructions } = useQuery<{ records: DomainRecord[] }>({
    queryKey: ['branding-domain-instructions'],
    queryFn: async () => (await api.get('/branding/domain-instructions')).data,
    enabled: !!data?.customDomain,
  });
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => api.put('/branding', form),
    onSuccess: () => {
      setVerifyResult(null);
      qc.invalidateQueries({ queryKey: ['branding'] });
      qc.invalidateQueries({ queryKey: ['branding-domain-instructions'] });
    },
  });

  const verify = useMutation({
    mutationFn: async () => (await api.post('/branding/domain-verify')).data as VerifyResult,
    onSuccess: (result) => {
      setVerifyResult(result);
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
  });

  const activate = useMutation({
    mutationFn: async (active: boolean) => api.post('/branding/domain-activate', { active }),
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

  const records = instructions?.records ?? [];
  const statusColors: Record<string, string> = {
    verified: '#2F855A',
    failed: '#C53030',
    pending: '#B7791F',
    unset: 'var(--border)',
  };

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

        <div style={{ marginBottom: 4 }}>
          <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Custom domain (reseller/white-label plans)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={form.customDomain}
              onChange={(e) => setForm((f) => ({ ...f, customDomain: e.target.value }))}
              placeholder="clinic.example.com"
              style={{ flex: 1, padding: 8, border: '1px solid var(--border)', borderRadius: 6 }}
            />
            {data?.customDomain && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  color: '#fff',
                  background: statusColors[data.customDomainStatus] ?? '#666',
                }}
              >
                {data.customDomainStatus}
              </span>
            )}
            {data?.customDomain && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  color: data.customDomainActive ? '#fff' : 'var(--muted)',
                  background: data.customDomainActive ? '#2B6CB0' : 'var(--border)',
                }}
              >
                {data.customDomainActive ? 'active' : 'inactive'}
              </span>
            )}
          </div>
          {!data?.customDomain && (
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Type a domain above, then click <b>Save branding</b> at the bottom of this card — that generates your
              DNS records and unlocks the Verify/Activate buttons below.
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 8,
            marginBottom: 16,
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--card-alt, rgba(127,127,127,0.06))',
            fontSize: 12,
          }}
        >
          <div className="muted" style={{ marginBottom: 8 }}>
            {records.length > 0
              ? 'Add these DNS records at your domain registrar, then verify — this does a real live DNS lookup, no manual approval needed:'
              : 'How connecting a custom domain works — save a domain above to generate your real records:'}
          </div>
          <div
            style={{
              marginBottom: records.length > 0 ? 12 : 0,
              padding: 8,
              border: '1px dashed var(--border)',
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            <div style={{ marginBottom: 4, fontWeight: 600 }}>
              Example — connecting <code>{form.customDomain || 'clinic.example.com'}</code>:
            </div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Log into wherever <code>{(form.customDomain || 'clinic.example.com').split('.').slice(-2).join('.')}</code>{' '}
                is registered (GoDaddy, Namecheap, Cloudflare, etc.) and open its DNS settings.
              </li>
              <li>
                Add a <code>TXT</code> record — Host: <code>_aetosclinics-verify.{form.customDomain || 'clinic.example.com'}</code>,
                Value: {records.find((r) => r.type === 'TXT')?.value ?? '(shown here once you Save branding)'}.
              </li>
              <li>
                Add a <code>CNAME</code> record — Host:{' '}
                <code>{(form.customDomain || 'clinic.example.com').split('.')[0]}</code> (just the subdomain part), Value:{' '}
                <code>edge.aetosone.clinics</code>.
              </li>
              <li>
                DNS changes can take a few minutes up to ~24h to propagate. Click <b>Verify domain</b> below once
                you've added both — it does a live lookup, so it'll fail cleanly if not ready yet, just try again.
              </li>
              <li>
                Once verified, click <b>Activate domain</b> to actually start serving your branding on it —
                verifying alone doesn't make it live.
              </li>
            </ol>
          </div>

          {records.length > 0 && (
            <table style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, borderCollapse: 'collapse' }}>
              <tbody>
                {records.map((r) => (
                  <tr key={r.type} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px 4px 0', color: 'var(--muted)' }}>{r.type}</td>
                    <td style={{ padding: '4px 8px 4px 0' }}>{r.host}</td>
                    <td style={{ padding: '4px 0' }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {records.length === 0 && (
            <div className="muted" style={{ fontSize: 11 }}>
              No domain saved yet — the Verify and Activate buttons appear here once you save one above.
            </div>
          )}

          {records.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => verify.mutate()} disabled={verify.isPending}>
                {verify.isPending ? 'Checking DNS…' : 'Verify domain'}
              </button>
              <button
                onClick={() => activate.mutate(!data?.customDomainActive)}
                disabled={activate.isPending || (!data?.customDomainActive && data?.customDomainStatus !== 'verified')}
                title={
                  !data?.customDomainActive && data?.customDomainStatus !== 'verified'
                    ? 'Verify the domain first'
                    : undefined
                }
              >
                {activate.isPending ? 'Working…' : data?.customDomainActive ? 'Deactivate domain' : 'Activate domain'}
              </button>
            </div>
          )}

          {verifyResult && (
            <div style={{ marginTop: 8, color: verifyResult.status === 'verified' ? '#2F855A' : '#C53030' }}>
              {verifyResult.status === 'verified'
                ? 'Verified — both records resolved correctly.'
                : `Not verified yet — TXT ${verifyResult.ownershipOk ? 'ok' : 'missing'}, CNAME ${verifyResult.cnameOk ? 'ok' : 'missing'}.${verifyResult.error ? ` (${verifyResult.error})` : ''}`}
            </div>
          )}
        </div>

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
