'use client';
// Last-resort boundary: catches errors thrown by the root layout / AuthProvider itself.
// Must render its own <html>/<body> because the root layout is what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f7f5', margin: 0 }}>
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🌾</div>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>FreshRice hit an unexpected error</h2>
        <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 16px', wordBreak: 'break-word' }}>{error?.message || 'Unknown error'}</p>
        <button onClick={() => reset()} style={{ background: '#2e7d4f', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer', marginRight: 8 }}>Try again</button>
        <button onClick={() => location.reload()} style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>Reload</button>
        {error?.digest && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 12, fontFamily: 'monospace' }}>ref {error.digest}</div>}
      </div>
    </div>
  </body></html>;
}
