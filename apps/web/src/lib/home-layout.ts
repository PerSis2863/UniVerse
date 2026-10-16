// The home pages' cards (Stage 5 · Q8): which cards each role has, the order and the hidden ones a
// person chose ("Edit home", saved in users.homeLayout), and what "Up next" shows as time passes.
// Pure, so the server, the light API path and the page agree.

export type HomeRole = 'student' | 'teacher' | 'admin';
/** Where a card sits: across the top, the wide column or the narrow one (phones: one column). */
export type Zone = 'top' | 'main' | 'side';
export interface CardDef { id: string; title: string; zone: Zone }

export const HOME_CARDS: Record<HomeRole, CardDef[]> = {
  student: [
    { id: 'upnext', title: 'Up next', zone: 'top' },
    { id: 'brief', title: 'Daily brief', zone: 'top' },
    { id: 'impact', title: 'Impact network', zone: 'top' },
    { id: 'stats', title: 'Key numbers', zone: 'top' },
    { id: 'schedule', title: 'Today’s classes', zone: 'main' },
    { id: 'courses', title: 'My courses', zone: 'main' },
    { id: 'quick', title: 'Quick actions', zone: 'main' },
    { id: 'goal', title: 'Daily goal', zone: 'side' },
    { id: 'level', title: 'Impact level', zone: 'side' },
    { id: 'streak', title: 'Study streak', zone: 'side' },
    { id: 'deadlines', title: 'Deadlines', zone: 'side' },
    { id: 'grades', title: 'Recent grades', zone: 'side' },
  ],
  teacher: [
    { id: 'upnext', title: 'Up next', zone: 'top' },
    { id: 'kpis', title: 'Key numbers', zone: 'top' },
    { id: 'brief', title: 'Daily brief', zone: 'top' },
    { id: 'attention', title: 'Needs attention', zone: 'main' },
    { id: 'courses', title: 'My courses', zone: 'main' },
    { id: 'charts', title: 'Grades and trends', zone: 'main' },
    { id: 'create', title: 'Create', zone: 'side' },
    { id: 'recent', title: 'Recent students', zone: 'side' },
  ],
  admin: [
    { id: 'live', title: 'Today, live', zone: 'top' },
    { id: 'kpis', title: 'Key numbers', zone: 'top' },
    { id: 'departments', title: 'Departments', zone: 'main' },
    { id: 'approvals', title: 'Waiting for approval', zone: 'main' },
    { id: 'payments', title: 'Recent payments', zone: 'side' },
  ],
};

export interface HomeLayout {
  /** Card ids in the order chosen (cards not listed keep their place at the end of their zone). */
  order: string[];
  hidden: string[];
  /** Study actions a day the student aims for (quizzes, flashcard reviews, tutor questions). */
  goal: number;
}

export const DEFAULT_GOAL = 3;
export const EMPTY_LAYOUT: HomeLayout = { order: [], hidden: [], goal: DEFAULT_GOAL };
const ID = /^[a-z]{2,16}$/;

/** A layout from storage or a request body: anything odd is dropped. */
export function cleanLayout(raw: unknown): HomeLayout {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== 'object') return { ...EMPTY_LAYOUT };
  const o = v as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && ID.test(s)))].slice(0, 40) : []);
  const goal = Math.round(Number(o.goal));
  return { order: ids(o.order), hidden: ids(o.hidden), goal: goal >= 1 && goal <= 20 ? goal : DEFAULT_GOAL };
}

/** The cards in their zones, in the person's order, and the ones they hid. */
export function arrange(role: HomeRole, layout: HomeLayout) {
  const cards = HOME_CARDS[role];
  const rank = (c: CardDef) => { const i = layout.order.indexOf(c.id); return i < 0 ? 1000 + cards.indexOf(c) : i; };
  const shown = cards.filter((c) => !layout.hidden.includes(c.id)).sort((a, b) => rank(a) - rank(b));
  return {
    top: shown.filter((c) => c.zone === 'top'),
    main: shown.filter((c) => c.zone === 'main'),
    side: shown.filter((c) => c.zone === 'side'),
    hidden: cards.filter((c) => layout.hidden.includes(c.id)),
  };
}

/** Every card's id in the order shown (zone by zone), to save. */
function flatOrder(role: HomeRole, layout: HomeLayout) {
  const a = arrange(role, layout);
  return [...a.top, ...a.main, ...a.side, ...a.hidden].map((c) => c.id);
}

/** Moves a card one place up (-1) or down (1) within its zone. */
export function moveCard(role: HomeRole, layout: HomeLayout, id: string, dir: -1 | 1): HomeLayout {
  const card = HOME_CARDS[role].find((c) => c.id === id);
  if (!card) return layout;
  const zone = arrange(role, layout)[card.zone].map((c) => c.id);
  const i = zone.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= zone.length) return layout;
  [zone[i], zone[j]] = [zone[j], zone[i]];
  const order = flatOrder(role, layout);
  // Put the zone's new order back where the zone's cards were.
  const slots = order.map((x, k) => (zone.includes(x) ? k : -1)).filter((k) => k >= 0);
  slots.forEach((k, n) => { order[k] = zone[n]; });
  return { ...layout, order };
}

export function hideCard(role: HomeRole, layout: HomeLayout, id: string): HomeLayout {
  if (!HOME_CARDS[role].some((c) => c.id === id) || layout.hidden.includes(id)) return layout;
  return { ...layout, order: flatOrder(role, layout), hidden: [...layout.hidden, id] };
}

/** Shows a hidden card again, at the end of its zone. */
export function showCard(role: HomeRole, layout: HomeLayout, id: string): HomeLayout {
  if (!layout.hidden.includes(id)) return layout;
  const card = HOME_CARDS[role].find((c) => c.id === id);
  const next = { ...layout, hidden: layout.hidden.filter((x) => x !== id) };
  if (!card) return next;
  const order = flatOrder(role, layout).filter((x) => x !== id);
  const a = arrange(role, next);
  const zone = a[card.zone].map((c) => c.id).filter((x) => x !== id);
  const after = zone.length ? order.indexOf(zone[zone.length - 1]) + 1 : order.length;
  order.splice(after, 0, id);
  return { ...next, order };
}

// ─── Up next ─────────────────────────────────────────────────────────────────

export type UpNextKind = 'class' | 'call' | 'quiz' | 'assignment' | 'grade' | 'event';
export interface UpNextItem {
  kind: UpNextKind;
  id: string;
  title: string;
  /** Course code, room or what it's about. */
  sub?: string | null;
  /** Classes, calls and events: when they start and end (ms). */
  start?: number | null;
  end?: number | null;
  /** Quizzes and assignments: when they're due (ms). */
  due?: number | null;
  /** Things to do now with no time ("12 to grade"). */
  count?: number | null;
  href: string;
}
export type UpNextState = 'live' | 'soon' | 'todo' | 'later' | 'due';
export interface UpNextRow { item: UpNextItem; state: UpNextState; /** Minutes until it starts (or is due); 0 while live. */ minutes: number; action: string; ready: boolean }

/** A Join button switches on this long before a call starts. */
export const JOIN_EARLY_MIN = 10;
const SOON_MIN = 15;

/** What to show now, most urgent first: what's on now, what starts within 15 minutes, things to
 *  do, then the rest by time. Finished classes and passed deadlines drop off. */
export function upNext(items: UpNextItem[], now: number, max = 4): UpNextRow[] {
  const rows: UpNextRow[] = [];
  for (const item of items) {
    if (item.count != null) { if (item.count > 0) rows.push({ item, state: 'todo', minutes: 0, action: actionOf(item.kind), ready: true }); continue; }
    if (item.start != null) {
      const end = item.end ?? item.start + 60 * 60_000;
      if (end <= now) continue;
      const minutes = Math.max(0, Math.ceil((item.start - now) / 60_000));
      const live = item.start <= now;
      const state: UpNextState = live ? 'live' : minutes <= SOON_MIN ? 'soon' : 'later';
      rows.push({ item, state, minutes, action: actionOf(item.kind), ready: item.kind !== 'call' || live || minutes <= JOIN_EARLY_MIN });
      continue;
    }
    if (item.due != null && item.due > now) rows.push({ item, state: 'due', minutes: Math.ceil((item.due - now) / 60_000), action: actionOf(item.kind), ready: true });
  }
  const rank: Record<UpNextState, number> = { live: 0, soon: 1, todo: 2, later: 3, due: 3 };
  const when = (r: UpNextRow) => r.item.start ?? r.item.due ?? 0;
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || when(a) - when(b)).slice(0, max);
}

function actionOf(kind: UpNextKind) {
  return kind === 'call' ? 'Join' : kind === 'quiz' ? 'Start' : kind === 'grade' ? 'Grade' : 'Open';
}

/** When the list next changes by itself (something starts, ends or falls due), ms; null if never. */
export function nextChange(items: UpNextItem[], now: number): number | null {
  let soonest: number | null = null;
  const consider = (t: number | null | undefined) => { if (t != null && t > now && (soonest == null || t < soonest)) soonest = t; };
  for (const i of items) {
    if (i.start != null) { consider(i.start - SOON_MIN * 60_000); consider(i.start - JOIN_EARLY_MIN * 60_000); consider(i.start); consider(i.end ?? i.start + 3_600_000); }
    consider(i.due);
  }
  return soonest;
}
