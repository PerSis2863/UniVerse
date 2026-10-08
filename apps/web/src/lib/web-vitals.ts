// How fast pages are for real people (Stage 5 · A4): Core Web Vitals from 10% of page loads,
// sent once when the page is hidden (one request), anonymous. Owner console → Analytics → Speed.
// The measuring code (the web-vitals package) loads only on those 10%, after the page is up.

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
export const vitalsSampled = typeof window !== 'undefined'
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

/** Records one measure (from the web-vitals package). */
export function recordVital(m: { name: string; value: number }) {
  if (!vitalsSampled || !(VITALS as readonly string[]).includes(m.name) || !Number.isFinite(m.value)) return;
  if (!page) page = pageKey(location.pathname);
  values.set(m.name as Vital, m.value); // INP and CLS are reported again as they grow: keep the last
  if (armed) return;
  armed = true;
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
}

/** On the sampled page loads, loads web-vitals and starts measuring (it reads buffered entries). */
export function startVitals() {
  if (!vitalsSampled) return;
  import('web-vitals').then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
    for (const on of [onLCP, onINP, onCLS, onFCP, onTTFB]) on(recordVital);
  }).catch(() => {});
}
