import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface MedicationLine {
  medicationName: string;
  dosageText: string;
  frequency?: string;
  durationDays?: number;
}

interface VisitTemplate {
  id: string;
  organizationId: string | null;
  name: string;
  category: string;
  icd10Code: string | null;
  chiefComplaint: string;
  diagnosisDisplay: string;
  medicationsJson: MedicationLine[];
  testsJson: string[];
  advice: string;
  followUpDays: number | null;
  aiGenerated: boolean;
}

// 1-click visit templates — pick a condition, everything (chief complaint,
// ICD-10, medications, tests, advice, follow-up) fills in on an encounter in
// one call. See gap analysis vs arogyam.ai's flagship feature.
export default function VisitTemplatesPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VisitTemplate | null>(null);
  const [encounterId, setEncounterId] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<VisitTemplate[]>({
    queryKey: ['visit-templates'],
    queryFn: async () => (await api.get('/visit-templates')).data,
  });

  const draftMutation = useMutation({
    mutationFn: async (description: string) => (await api.post('/visit-templates/draft', { description })).data,
    onSuccess: () => {
      setDraftDescription('');
      queryClient.invalidateQueries({ queryKey: ['visit-templates'] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ templateId, encId }: { templateId: string; encId: string }) =>
      (await api.post(`/visit-templates/${templateId}/apply/${encId}`)).data,
    onSuccess: () => setApplyResult('Applied — diagnosis and medications added to the encounter.'),
    onError: () => setApplyResult('Could not apply the template — check the encounter ID.'),
  });

  return (
    <div>
      <h1>1-Click Visit Templates</h1>
      <p className="muted">Pick a condition — chief complaint, diagnosis, medications, tests and advice fill in on the encounter in one call.</p>

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="muted">Could not load templates — is the API running?</p>}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, maxHeight: 480, overflowY: 'auto' }}>
          {data?.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              style={{
                padding: 8,
                marginBottom: 6,
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                background: selected?.id === t.id ? '#f0f4ff' : 'white',
              }}
            >
              <strong>{t.name}</strong>
              <div className="muted">{t.icd10Code ?? t.category} · {t.category}{t.aiGenerated ? ' · AI-drafted' : ''}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {selected ? (
            <div>
              <h3>{selected.name}</h3>
              <p><strong>Chief complaint:</strong> {selected.chiefComplaint}</p>
              <p><strong>Diagnosis:</strong> {selected.diagnosisDisplay} {selected.icd10Code && `(${selected.icd10Code})`}</p>
              <p><strong>Medications:</strong></p>
              <ul>
                {selected.medicationsJson.map((m, i) => (
                  <li key={i}>{m.medicationName} — {m.dosageText} {m.frequency ?? ''} {m.durationDays ? `× ${m.durationDays}d` : ''}</li>
                ))}
              </ul>
              {selected.testsJson.length > 0 && (
                <p><strong>Tests:</strong> {selected.testsJson.join(', ')}</p>
              )}
              <p><strong>Advice:</strong> {selected.advice}</p>
              {selected.followUpDays != null && <p><strong>Follow-up:</strong> in {selected.followUpDays} days</p>}

              <div style={{ marginTop: 16 }}>
                <input
                  placeholder="Encounter ID to apply to"
                  value={encounterId}
                  onChange={(e) => setEncounterId(e.target.value)}
                  style={{ width: '70%' }}
                />
                <button
                  disabled={!encounterId || applyMutation.isPending}
                  onClick={() => applyMutation.mutate({ templateId: selected.id, encId: encounterId })}
                >
                  Apply to encounter
                </button>
                {applyResult && <p className="muted">{applyResult}</p>}
              </div>
            </div>
          ) : (
            <p className="muted">Select a template to preview it.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 32, borderTop: '1px solid #ddd', paddingTop: 16 }}>
        <h3>Draft a new template with AI</h3>
        <p className="muted">Describe a condition in two lines — AI drafts the template for review.</p>
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="e.g. acute viral fever in an adult, 3 days of symptoms"
          rows={2}
          style={{ width: '100%' }}
        />
        <button disabled={!draftDescription || draftMutation.isPending} onClick={() => draftMutation.mutate(draftDescription)}>
          {draftMutation.isPending ? 'Drafting…' : 'Draft with AI'}
        </button>
        {draftMutation.isError && <p className="muted">Drafting failed — check ANTHROPIC_API_KEY is configured.</p>}
      </div>
    </div>
  );
}
