// The app's startup bundle (/api/bootstrap): when the signed-in app opens, the requests it would
// make one by one (profile, notifications, incoming calls, the dashboard's data, a live-updates
// ticket, the "app opened" report) are asked for in a single request. authedJson(), the axios API
// client and the live-updates connection then take their answer from it — once each, and only
// while it's fresh — instead of making their own request. Anything not in the bundle, or asked for
// again later, goes to the network as usual.

type Slot = { status: number; body: unknown };
type Bundle = { results: Record<string, Slot>; ticket?: string };

const FRESH_MS = 30_000; // answers older than this aren't used
const TICKET_MS = 45_000; // tickets are valid for 60 s on the server

let keys = new Set<string>();
let pending: Promise<Bundle | null> | null = null;
let doneAt = 0;
let ticketAsked = false;
// How many times each answer was used: twice in the first 10 s (two parts of the page often ask for
// the same thing as it opens), once after that.
const used = new Map<string, number>();
const uses = (key: string) => used.get(key) ?? 0;
const maxUses = () => (doneAt && Date.now() - doneAt > 10_000 ? 1 : 2);

/** The requests bundled for each dashboard's first screen (besides the ones every page makes). */
/** The home cards' request (Stage 5 · Q8, src/server/home-data.ts), as the home pages make it. */
export const homeKey = () => {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* no time zone: the server's guess */ }
  return `/api/home?tz=${encodeURIComponent(tz)}`;
};

const PAGE_KEYS: Record<string, () => string[]> = {
  '/student': () => [`/api/student/overview?dow=${(new Date().getDay() + 6) % 7}`, homeKey()],
  '/teacher': () => ['/api/core/dashboard/teacher', homeKey()],
  '/admin': () => ['/api/core/dashboard/admin', homeKey()],
  '/parent': () => ['/api/parent/children'],
};

/**
 * Starts the startup bundle (once per page load). `send` posts the body to /api/bootstrap.
 * Safe to call on every render.
 */
export function startBootstrap(pathname: string, send: (body: string) => Promise<Bundle>, opts: { session: boolean }) {
  if (pending || typeof window === 'undefined') return;
  const list = ['/api/core/users/me', '/api/me', '/api/notifications', ...(pathname === '/parent' ? [] : ['/api/chat/incoming']), ...(PAGE_KEYS[pathname]?.() ?? [])];
  keys = new Set(list);
  ticketAsked = typeof WebSocket !== 'undefined';
  pending = send(JSON.stringify({ keys: list, ticket: ticketAsked, session: opts.session }))
    .then((b) => { doneAt = Date.now(); return b; })
    .catch(() => { doneAt = Date.now(); return null; });
}

/** Whether `key` (a URL as the app requests it) can still be answered from the bundle. */
export function inBootstrap(key: string) {
  adoptEarlyBootstrap(); // the head script may have started it before anything else ran
  return !!pending && keys.has(key) && uses(key) < maxUses() && (!doneAt || Date.now() - doneAt < FRESH_MS);
}

/** The bundled answer for `key` (used once), or undefined if it isn't there or wasn't a success. */
export async function fromBootstrap<T = unknown>(key: string): Promise<T | undefined> {
  if (!inBootstrap(key)) return undefined;
  used.set(key, uses(key) + 1);
  const bundle = await pending;
  const slot = bundle?.results[key];
  return slot && slot.status === 200 ? (slot.body as T) : undefined;
}

/** The live-updates address from the bundle (used once, while still valid), or undefined. */
export async function bootstrapTicket(): Promise<string | undefined> {
  adoptEarlyBootstrap();
  if (!pending || !ticketAsked || used.has('ticket')) return undefined;
  used.set('ticket', 1);
  const bundle = await pending;
  return bundle?.ticket && Date.now() - doneAt < TICKET_MS ? bundle.ticket : undefined;
}

/**
 * The inline script in the page's <head> (see bootstrapPrefetchScript) starts the startup bundle
 * before the app's JavaScript has even downloaded. Adopt it if it ran.
 */
export function adoptEarlyBootstrap(): boolean {
  if (pending || typeof window === 'undefined') return !!pending;
  const early = (window as Window & { __universeBoot?: { keys: string[]; ticket: boolean; promise: Promise<Bundle | null> } }).__universeBoot;
  if (!early) return false;
  keys = new Set(early.keys);
  ticketAsked = early.ticket;
  pending = early.promise.then((b) => { doneAt = Date.now(); return b; }, () => { doneAt = Date.now(); return null; });
  return true;
}

/**
 * Inline script for the page's <head>: on dashboard pages with a saved, unexpired sign-in, it asks
 * for the startup bundle straight away, in parallel with downloading the app's JavaScript (the
 * first screen's data arrives about a second sooner on slow connections). Must stay in step with
 * startBootstrap above (same keys).
 */
export const bootstrapPrefetchScript = `(function(){try{
var p=location.pathname;if(!/^\\/(student|teacher|admin|boards|application|console|parent)(\\/|$)/.test(p))return;
if(sessionStorage.getItem('universe:sample-mode')==='1'||sessionStorage.getItem('uv-view-as'))return;
var t=localStorage.getItem('accessToken');if(!t||!localStorage.getItem('universe-auth'))return;
if(!/^(mock-token-|ut1\\.)/.test(t)){var b=JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(!b.exp||b.exp*1000<Date.now()+60000)return;}
var dow=(new Date().getDay()+6)%7;
var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}var home='/api/home?tz='+encodeURIComponent(tz);
var keys=['/api/core/users/me','/api/me','/api/notifications'].concat(p==='/parent'?[]:['/api/chat/incoming']).concat(({'/student':['/api/student/overview?dow='+dow,home],'/teacher':['/api/core/dashboard/teacher',home],'/admin':['/api/core/dashboard/admin',home],'/parent':['/api/parent/children']})[p]||[]);
var session=!sessionStorage.getItem('universe-session-reported');if(session)sessionStorage.setItem('universe-session-reported','1');
var ticket='WebSocket' in window;
window.__universeBoot={keys:keys,ticket:ticket,promise:fetch('/api/bootstrap',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t,'x-uv-pass':localStorage.getItem('uv-pass')||''},body:JSON.stringify({keys:keys,ticket:ticket,session:session})}).then(function(r){return r.ok?r.json():null},function(){return null})};
}catch(e){}})();`;
