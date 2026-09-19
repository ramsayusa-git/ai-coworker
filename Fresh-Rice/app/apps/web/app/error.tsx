'use client';
import { useEffect } from 'react';

// Route-level error boundary. Catches render/runtime errors in any page under app/ and
// shows a recoverable panel instead of a blank white screen. The rest of the layout stays mounted.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[FreshRice] page error:', error); }, [error]);
  const network = /cannot reach server|failed to fetch|networkerror/i.test(error?.message || '');
  return <div className="min-h-[50vh] flex items-center justify-center p-8">
    <div className="max-w-md w-full rounded-xl border bg-white p-6 shadow-sm text-center">
      <div className="text-3xl mb-2">{network ? '📡' : '⚠️'}</div>
      <h2 className="text-lg font-semibold mb-1">{network ? 'Server unreachable' : 'Something went wrong on this page'}</h2>
      <p className="text-sm text-gray-600 mb-4 break-words">{error?.message || 'Unexpected error'}</p>
      <div className="flex gap-2 justify-center">
        <button onClick={() => reset()} className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-800">Try again</button>
        <button onClick={() => location.reload()} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">Reload page</button>
        <a href="/admin" className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">Home</a>
      </div>
      {error?.digest && <div className="text-[10px] text-gray-400 mt-3 font-mono">ref {error.digest}</div>}
    </div>
  </div>;
}
