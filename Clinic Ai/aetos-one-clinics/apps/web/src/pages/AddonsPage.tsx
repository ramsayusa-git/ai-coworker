import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AddonManifest } from '@aetos/shared-types';

interface AddonRow {
  manifest: AddonManifest;
  state: { slug: string; enabled: boolean; configJson?: Record<string, unknown>; lastHealthOk?: boolean | null };
}

/**
 * The Add-ons store — modeled directly on the Home Assistant Supervisor
 * add-on store: a card per add-on with its icon/description, an enable
 * toggle, a config form driven by the manifest's configSchema, and a
 * health-check action. See apps/api/src/addons for the supervisor this talks to.
 */
export default function AddonsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<AddonRow[]>({
    queryKey: ['addons'],
    queryFn: async () => (await api.get('/addons')).data,
  });

  const toggle = useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      api.patch(`/addons/${slug}/enabled`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addons'] }),
  });

  const healthCheck = useMutation({
    mutationFn: async (slug: string) => api.post(`/addons/${slug}/health-check`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addons'] }),
  });

  return (
    <div>
      <h1>Add-ons</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Every AI capability runs as an independent add-on, the same way Home Assistant Supervisor
        manages add-ons. Enable only what this clinic's plan includes.
      </p>
      {isLoading && <p className="muted">Loading…</p>}
      <div className="grid">
        {data?.map((row) => (
          <AddonCard
            key={row.manifest.slug}
            row={row}
            onToggle={(enabled) => toggle.mutate({ slug: row.manifest.slug, enabled })}
            onHealthCheck={() => healthCheck.mutate(row.manifest.slug)}
          />
        ))}
      </div>
    </div>
  );
}

function AddonCard({
  row,
  onToggle,
  onHealthCheck,
}: {
  row: AddonRow;
  onToggle: (enabled: boolean) => void;
  onHealthCheck: () => void;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const { manifest, state } = row;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">{manifest.name}</div>
          <div className="muted">v{manifest.version} · {manifest.category}</div>
        </div>
        <span className={`badge ${state.enabled ? 'on' : 'off'}`}>{state.enabled ? 'ENABLED' : 'DISABLED'}</span>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>{manifest.description}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="primary" onClick={() => onToggle(!state.enabled)}>
          {state.enabled ? 'Disable' : 'Enable'}
        </button>
        {manifest.configSchema.length > 0 && (
          <button onClick={() => setShowConfig((s) => !s)}>Configure</button>
        )}
        <button onClick={onHealthCheck}>Check health</button>
      </div>
      {state.lastHealthOk != null && (
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Last health check: {state.lastHealthOk ? 'OK' : 'failed'}
        </div>
      )}
      {showConfig && <AddonConfigForm slug={manifest.slug} manifest={manifest} initial={state.configJson ?? {}} />}
    </div>
  );
}

function AddonConfigForm({
  slug,
  manifest,
  initial,
}: {
  slug: string;
  manifest: AddonManifest;
  initial: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const save = useMutation({
    mutationFn: async () => api.patch(`/addons/${slug}/config`, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addons'] }),
  });

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      {manifest.configSchema.map((field) => (
        <div key={field.key} style={{ marginBottom: 8 }}>
          <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
            {field.label}{field.required ? ' *' : ''}
          </label>
          {field.type === 'select' ? (
            <select
              value={(values[field.key] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              style={{ width: '100%', padding: 6 }}
            >
              <option value="">Select…</option>
              {field.options?.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              value={(values[field.key] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              style={{ width: '100%', padding: 6, border: '1px solid var(--border)', borderRadius: 4 }}
            />
          )}
        </div>
      ))}
      <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save config'}
      </button>
    </div>
  );
}
