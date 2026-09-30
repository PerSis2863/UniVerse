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
const used = new Set<string>();

/** The requests bundled for each dashboard's first screen (besides the ones every page makes). */
const PAGE_KEYS: Record<string, () => string[]> = {
  '/student': () => [`/api/student/overview?dow=${(new Date().getDay() + 6) % 7}`],
  '/teacher': () => ['/api/core/dashboard/teacher'],
  '/admin': () => ['/api/core/dashboard/admin'],
};

/**
 * Starts the startup bundle (once per page load). `send` posts the body to /api/bootstrap.
 * Safe to call on every render.
 */
export function startBootstrap(pathname: string, send: (body: string) => Promise<Bundle>, opts: { session: boolean }) {
  if (pending || typeof window === 'undefined') return;
  const list = ['/api/core/users/me', '/api/me', '/api/notifications', '/api/chat/incoming', ...(PAGE_KEYS[pathname]?.() ?? [])];
  keys = new Set(list);
  ticketAsked = typeof WebSocket !== 'undefined';
  pending = send(JSON.stringify({ keys: list, ticket: ticketAsked, session: opts.session }))
    .then((b) => { doneAt = Date.now(); return b; })
    .catch(() => { doneAt = Date.now(); return null; });
}

/** Whether `key` (a URL as the app requests it) can still be answered from the bundle. */
export function inBootstrap(key: string) {
  return !!pending && keys.has(key) && !used.has(key) && (!doneAt || Date.now() - doneAt < FRESH_MS);
}

/** The bundled answer for `key` (used once), or undefined if it isn't there or wasn't a success. */
export async function fromBootstrap<T = unknown>(key: string): Promise<T | undefined> {
  if (!inBootstrap(key)) return undefined;
  used.add(key);
  const bundle = await pending;
  const slot = bundle?.results[key];
  return slot && slot.status === 200 ? (slot.body as T) : undefined;
}

/** The live-updates address from the bundle (used once, while still valid), or undefined. */
export async function bootstrapTicket(): Promise<string | undefined> {
  if (!pending || !ticketAsked || used.has('ticket')) return undefined;
  used.add('ticket');
  const bundle = await pending;
  return bundle?.ticket && Date.now() - doneAt < TICKET_MS ? bundle.ticket : undefined;
}
