// Student life (Stage 5 · Q17): the rules shared by the server, the pages and the tests. Ticket
// prices, club elections (candidates, when they're open, the count and its fingerprint text), club
// budgets, the campus board (marketplace, rides, housing) and cafeteria pre-orders.

// ── Event tickets ──────────────────────────────────────────────────────
export const TICKET_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
/** A ticket price in whole units as minor units: 0 or empty means free; up to 1,00,000. */
export function ticketPrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n * 100), 10_000_000);
}
/** How long a seat is held while its buyer pays (Stripe's checkout page closes after 30 minutes). */
export const HOLD_MINUTES = 35;

// ── Club elections ─────────────────────────────────────────────────────
export interface Candidate { id: string; name: string }
/** 2–10 distinct names (up to 60 characters each), with short ids for the ballots. */
export function cleanCandidates(raw: unknown): Candidate[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const names = raw.map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, 60) : ''))
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  if (names.length < 2 || names.length > 10) return null;
  return names.map((name, i) => ({ id: `c${i + 1}`, name }));
}
export type ElectionState = 'UPCOMING' | 'OPEN' | 'CLOSED';
export const electionState = (e: { opensAt: Date | string; closesAt: Date | string }, now = Date.now()): ElectionState =>
  now < new Date(e.opensAt).getTime() ? 'UPCOMING' : now < new Date(e.closesAt).getTime() ? 'OPEN' : 'CLOSED';
/** Votes per candidate, most first, and the winners (more than one on a tie). */
export function tally(candidates: Candidate[], ballots: { choice: string }[]) {
  const counts = candidates.map((c) => ({ ...c, votes: ballots.filter((b) => b.choice === c.id).length })).sort((a, b) => b.votes - a.votes);
  const top = counts[0]?.votes ?? 0;
  return { counts, total: ballots.length, winners: top > 0 ? counts.filter((c) => c.votes === top).map((c) => c.id) : [] };
}
/** The text whose SHA-256 is the election's fingerprint: every ballot as "receipt:choice", sorted, one a line. */
export const ballotListText = (ballots: { receipt: string; choice: string }[]) =>
  ballots.map((b) => `${b.receipt}:${b.choice}`).sort().join('\n');

// ── Club budgets ───────────────────────────────────────────────────────
export function budgetSummary(budgetMinor: number, entries: { kind: string; amount: number }[]) {
  const income = entries.filter((e) => e.kind === 'INCOME').reduce((t, e) => t + e.amount, 0);
  const spent = entries.filter((e) => e.kind === 'EXPENSE').reduce((t, e) => t + e.amount, 0);
  return { budget: budgetMinor, income, spent, left: budgetMinor + income - spent };
}

// ── Campus board ───────────────────────────────────────────────────────
export const BOARD_SECTIONS = {
  market: { label: 'Marketplace', kinds: ['SELL', 'SWAP', 'FREE', 'WANTED'] },
  rides: { label: 'Rides', kinds: ['RIDE_OFFER', 'RIDE_WANT'] },
  housing: { label: 'Housing', kinds: ['ROOM_OFFER', 'ROOM_WANT'] },
} as const;
export type BoardSection = keyof typeof BOARD_SECTIONS;
export const KIND_LABEL: Record<string, string> = {
  SELL: 'For sale', SWAP: 'To swap', FREE: 'Free', WANTED: 'Wanted',
  RIDE_OFFER: 'Offering a ride', RIDE_WANT: 'Looking for a ride', ROOM_OFFER: 'Room available', ROOM_WANT: 'Looking for a room',
};
export const sectionOf = (kind: string): BoardSection | null =>
  (Object.keys(BOARD_SECTIONS) as BoardSection[]).find((s) => (BOARD_SECTIONS[s].kinds as readonly string[]).includes(kind)) ?? null;
export const MARKET_CATEGORIES = ['Books', 'Electronics', 'Furniture', 'Clothes', 'Bikes', 'Sports', 'Other'] as const;
/** Reports that hide a listing until an admin looks at it. */
export const HIDE_AFTER_REPORTS = 3;

type Clean = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const when = (v: unknown) => { const d = v ? new Date(String(v)) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const DAY = 86_400_000;

/** A board post's fields by kind, checked: what's needed, sensible numbers and dates, and when it expires. */
export function cleanListing(b: Record<string, unknown>, now = Date.now()): Clean {
  const kind = typeof b.kind === 'string' ? b.kind : '';
  const section = sectionOf(kind);
  if (!section) return { ok: false, error: 'Pick what kind of post this is.' };
  const title = text(b.title, 100);
  if (title.length < 3) return { ok: false, error: 'Add a short title.' };
  const data: Record<string, unknown> = { kind, title, description: text(b.description, 1000) || null, expiresAt: new Date(now + 60 * DAY) };
  const money = (v: unknown, max: number) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) : undefined;
  };
  if (section === 'market') {
    data.category = (MARKET_CATEGORIES as readonly string[]).includes(String(b.category)) ? b.category : 'Other';
    if (kind === 'SELL') {
      const p = money(b.price, 500_000);
      if (p === undefined || p === null || p === 0) return { ok: false, error: 'Add a price (or post it as free).' };
      data.price = p;
    }
    if (typeof b.photoUrl === 'string' && b.photoUrl) data.photoUrl = b.photoUrl.slice(0, 500);
  }
  if (section === 'rides') {
    const from = text(b.fromPlace, 80), to = text(b.toPlace, 80), at = when(b.departAt);
    if (!from || !to) return { ok: false, error: 'Add where from and where to.' };
    if (!at || at.getTime() < now - 3_600_000 || at.getTime() > now + 90 * DAY) return { ok: false, error: 'Pick when, within the next 90 days.' };
    const seats = Math.round(Number(b.seats));
    if (kind === 'RIDE_OFFER' && !(seats >= 1 && seats <= 8)) return { ok: false, error: 'How many seats (1–8)?' };
    const share = money(b.price, 10_000);
    if (share === undefined) return { ok: false, error: 'The cost share looks wrong.' };
    Object.assign(data, { fromPlace: from, toPlace: to, departAt: at, seats: kind === 'RIDE_OFFER' ? seats : null, price: share, expiresAt: new Date(at.getTime() + DAY) });
  }
  if (section === 'housing') {
    const area = text(b.area, 80);
    if (!area) return { ok: false, error: 'Add the area or neighbourhood.' };
    const rent = money(b.price, 1_000_000);
    if (rent === undefined || (kind === 'ROOM_OFFER' && !rent)) return { ok: false, error: 'Add the monthly rent.' };
    const from = when(b.availableFrom);
    Object.assign(data, { area, price: rent, availableFrom: from && from.getTime() < now + 365 * DAY ? from : null });
  }
  return { ok: true, data };
}

// ── Cafeteria pre-orders ───────────────────────────────────────────────
/** A menu's dishes: one a line (as the admin typed them). */
export const dishesOf = (description: string | null | undefined) =>
  (description ?? '').split('\n').map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 40);
/** An order's lines: dishes on the menu, 1–5 of each, up to 8 lines. */
export function cleanOrderItems(raw: unknown, dishes: string[]): { dish: string; qty: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const out = new Map<string, number>();
  for (const r of raw.slice(0, 20)) {
    const o = (r ?? {}) as { dish?: unknown; qty?: unknown };
    const dish = typeof o.dish === 'string' ? dishes.find((d) => d === o.dish) : undefined;
    const qty = Math.round(Number(o.qty));
    if (!dish || !(qty >= 1 && qty <= 5)) continue;
    out.set(dish, Math.min(5, (out.get(dish) ?? 0) + qty));
  }
  if (!out.size || out.size > 8) return null;
  return [...out.entries()].map(([dish, qty]) => ({ dish, qty }));
}
/** A pickup on the menu's day (the menu is stored at noon of its day), at least 20 minutes from now. */
export const pickupOk = (menuDay: Date | string, pickupAt: Date, now = Date.now()) =>
  Math.abs(pickupAt.getTime() - new Date(menuDay).getTime()) <= 13 * 3_600_000 && pickupAt.getTime() >= now + 20 * 60_000;
/** Dishes to prepare: totals across orders. */
export function prepList(orders: { items: { dish: string; qty: number }[]; status: string }[]) {
  const t = new Map<string, number>();
  for (const o of orders) if (o.status !== 'CANCELLED') for (const i of o.items) t.set(i.dish, (t.get(i.dish) ?? 0) + i.qty);
  return [...t.entries()].map(([dish, qty]) => ({ dish, qty })).sort((a, b) => b.qty - a.qty);
}
