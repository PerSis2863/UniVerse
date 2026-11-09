import { optionalCookiesAllowed } from './cookie-consent';

// M137: which pages people use (the owner, 9 Nov 2026: "do from 1 to 6", 4 = "know which pages people
// use"), counted in the owner's PostHog project (EU). Off until the owner sets NEXT_PUBLIC_POSTHOG_KEY in
// Cloudflare (the project's public ingest key, made for web pages; Workers & Pages → universe-web →
// Settings → Build variables). Only after "Accept all" and never with the browser's Global Privacy
// Control (cookie-consent.ts). No library: one small request per page. No names, no profiles
// ($process_person_profile: false), a random id kept on this device, and addresses with their ids
// and tokens blanked (a share link's token must never leave the site).
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = 'https://eu.i.posthog.com';

/** The address with anything that looks like an id or a token as ":id". */
export const cleanPath = (path: string) =>
  path.split('?')[0].split('#')[0].split('/').map((s) => (s.length > 24 || (s.length > 6 && /\d/.test(s)) ? ':id' : s)).join('/') || '/';

function deviceId() {
  try {
    let id = localStorage.getItem('uv-aid');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('uv-aid', id); }
    return id;
  } catch { return 'anonymous'; }
}

/** Counts one page view, if the owner switched it on and the visitor agreed. */
export function pageview(path: string) {
  if (!KEY || typeof window === 'undefined' || !optionalCookiesAllowed()) return;
  const p = cleanPath(path);
  const body = JSON.stringify({ api_key: KEY, event: '$pageview', distinct_id: deviceId(), properties: { $current_url: location.origin + p, $pathname: p, $host: location.host, $process_person_profile: false } });
  try { void fetch(`${HOST}/capture/`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {}); } catch { /* blocked: not counted */ }
}
