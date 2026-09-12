import { useEffect, useState } from 'react';
import { api } from './api';

interface OrgLocation {
  id: string;
  name: string;
}
interface Org {
  id: string;
  name: string;
  locations: OrgLocation[];
}

type GateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'choose'; orgs: Org[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/**
 * There is no login flow yet (TenantMiddleware falls back to reading an
 * X-Org-Id header — see apps/api/src/tenancy/tenant.middleware.ts) so
 * every page silently rendered its empty state with no clinic selected and
 * no way to select one. This resolves org/location context once, up front:
 * - exactly one organization on the server -> auto-select it, no prompt
 * - more than one -> a one-time picker (stored after that)
 * - none -> a clear "nothing set up yet" message instead of a blank app
 * Wrap <App/> in this so no page renders until X-Org-Id is actually known.
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' });

  useEffect(() => {
    if (localStorage.getItem('aetos.orgId')) {
      setState({ status: 'ready' });
      return;
    }
    let cancelled = false;
    api
      .get<Org[]>('/organizations')
      .then((res) => {
        if (cancelled) return;
        const orgs = res.data;
        if (orgs.length === 0) {
          setState({ status: 'empty' });
        } else if (orgs.length === 1) {
          selectOrg(orgs[0]);
        } else {
          setState({ status: 'choose', orgs });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err?.message ?? 'Could not reach the API to load organizations.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectOrg(org: Org) {
    localStorage.setItem('aetos.orgId', org.id);
    localStorage.setItem('aetos.role', 'OWNER');
    if (org.locations[0]) localStorage.setItem('aetos.locationId', org.locations[0].id);
    setState({ status: 'ready' });
  }

  if (state.status === 'ready') return <>{children}</>;

  return (
    <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
        {state.status === 'checking' && <p className="muted">Loading your clinic…</p>}

        {state.status === 'empty' && (
          <>
            <h2 style={{ marginBottom: 8 }}>No organization set up yet</h2>
            <p className="muted">
              This instance has no Organization row in the database. Create one (Settings &gt; Organizations, once
              that screen exists, or via the API/seed script) before the app has anything to show.
            </p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <h2 style={{ marginBottom: 8 }}>Can't reach the API</h2>
            <p className="muted">{state.message}</p>
          </>
        )}

        {state.status === 'choose' && (
          <>
            <h2 style={{ marginBottom: 8 }}>Choose a clinic</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {state.orgs.map((org) => (
                <button key={org.id} onClick={() => selectOrg(org)} style={{ padding: '10px 16px', cursor: 'pointer' }}>
                  {org.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
