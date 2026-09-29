'use client';

import { useEffect } from 'react';
import { captureError } from '@/lib/error-monitor';

// Last-resort screen when the whole app fails to render (the root layout itself crashed). It can't
// rely on the app's styles or fonts, so it's styled inline. The error is reported automatically.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, 'render', { global: true, ...(error.digest ? { digest: error.digest } : {}) });
  }, [error]);

  const button: React.CSSProperties = { height: 40, padding: '0 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' };
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0a0d13', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', background: '#121622', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32 }}>
          <div style={{ fontSize: 40 }} aria-hidden>🛠️</div>
          <h1 style={{ fontSize: 22, margin: '12px 0 8px' }}>UniVerse couldn’t load</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Something went wrong on our side and we’ve been told about it automatically. Please try again in a moment.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={() => reset()} style={{ ...button, background: '#4f46e5', color: '#fff' }}>Try again</button>
            <button onClick={() => window.location.reload()} style={{ ...button, background: 'transparent', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.15)' }}>Reload</button>
          </div>
          {error.digest && <p style={{ marginTop: 16, fontSize: 11, color: '#71717a' }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
