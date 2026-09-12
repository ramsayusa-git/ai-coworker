import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Patient {
  id: string;
  givenName: string;
  familyName: string | null;
  phone: string;
  abhaNumber: string | null;
}

export default function PatientsPage() {
  const [q, setQ] = useState('');
  const { data, refetch, isFetching } = useQuery<Patient[]>({
    queryKey: ['patients', q],
    queryFn: async () => (await api.get('/patients', { params: q ? { q } : {} })).data,
  });

  return (
    <div>
      <h1>Patients</h1>
      <div className="card">
        <input
          placeholder="Search by phone or ABHA number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refetch()}
          style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6 }}
        />
      </div>
      {isFetching && <p className="muted">Searching…</p>}
      {data && (
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>ABHA</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td>{p.givenName} {p.familyName ?? ''}</td>
                <td>{p.phone}</td>
                <td>{p.abhaNumber ?? <span className="muted">not linked</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
