import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface QueueEntry {
  id: string;
  tokenNumber: number | null;
  status: string;
  triageScore: number | null;
  patient: { givenName: string; familyName: string | null; phone: string };
}

export default function QueuePage() {
  const locationId = localStorage.getItem('aetos.locationId') ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery<QueueEntry[]>({
    queryKey: ['queue', locationId, today],
    queryFn: async () => (await api.get('/appointments/queue', { params: { locationId, date: today } })).data,
    enabled: !!locationId,
  });

  return (
    <div>
      <h1>Today's Queue</h1>
      {!locationId && <p className="muted">Set a clinic location to see the queue (see Branding page for org setup).</p>}
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="muted">Could not load the queue — is the API running?</p>}
      {data && data.length === 0 && <p className="muted">No appointments today.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr><th>Token</th><th>Patient</th><th>Phone</th><th>Status</th><th>Triage</th></tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td>{a.tokenNumber ?? '—'}</td>
                <td>{a.patient.givenName} {a.patient.familyName ?? ''}</td>
                <td>{a.patient.phone}</td>
                <td>{a.status}</td>
                <td>{a.triageScore != null ? Math.round(a.triageScore) : <span className="muted">smart-queue off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
