import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Overview {
  periodDays: number;
  appointments: { total: number; noShows: number };
  encountersCompleted: number;
  revenueCollected: number;
  topDiagnoses: { diagnosis: string; count: number }[];
}

// Practice analytics — named in arogyam.ai's Full Suite/Multi-Clinic pricing
// tiers but absent from this scaffold entirely before this pass.
export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ['analytics-overview'],
    queryFn: async () => (await api.get('/analytics/overview')).data,
  });

  return (
    <div>
      <h1>Practice Analytics</h1>
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="muted">Could not load analytics — is the API running?</p>}
      {data && (
        <div>
          <p className="muted">Last {data.periodDays} days</p>
          <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
            <Stat label="Appointments" value={data.appointments.total} />
            <Stat label="No-shows" value={data.appointments.noShows} />
            <Stat label="Encounters completed" value={data.encountersCompleted} />
            <Stat label="Revenue collected" value={`₹${data.revenueCollected}`} />
          </div>
          <h3>Top diagnoses</h3>
          {data.topDiagnoses.length === 0 ? (
            <p className="muted">No conditions recorded yet.</p>
          ) : (
            <ul>
              {data.topDiagnoses.map((d) => (
                <li key={d.diagnosis}>{d.diagnosis} — {d.count}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12, minWidth: 120 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
