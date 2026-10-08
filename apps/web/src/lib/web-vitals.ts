// How fast pages are for real people (Stage 5 · A4): Core Web Vitals from 10% of page loads,
// sent once when the page is hidden (one request), anonymous. Owner console → Analytics → Speed.

export const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type Vital = (typeof VITALS)[number];

/** The page without ids, so /docs/clx… and /docs/cly… count as one page. */
export function pageKey(path: string): string {
  return (path.split('?')[0].split('#')[0] || '/')
    .split('/')
    .map((s) => (/^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s) || (s.length >= 16 && /\d/.test(s) && /^[a-z0-9_-]+$/i.test(s)) ? ':id' : s))
    .join('/')
    .slice(0, 120) || '/';
}

// Decided once per page load. Low-data mode and Save-Data don't send anything.
const sampled = typeof window !== 'undefined'
  && Math.random() < 0.1
  && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  && !document.documentElement.classList.contains('low-data');

let page = '';
const values = new Map<Vital, number>();
let armed = false;

function flush() {
  if (!values.size) return;
  const body = JSON.stringify({ page, device: matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop', metrics: [...values].map(([name, value]) => ({ name, value })) });
  values.clear();
  try { navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' })); } catch { /* best effort */ }
}

/** Give it each metric from Next's useReportWebVitals. */
export function recordVital(m: { name: string; value: number }) {
  if (!sampled || !(VITALS as readonly string[]).includes(m.name) || !Number.isFinite(m.value)) return;
  if (!page) page = pageKey(location.pathname);
  values.set(m.name as Vital, m.value); // INP and CLS are reported again as they grow: keep the last
  if (armed) return;
  armed = true;
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
}
