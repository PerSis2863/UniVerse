import { GREEN_FACTORS, GREEN_KINDS, co2For, type GreenKind } from './green';
import { RELIEF_KINDS, URGENCIES, type ReliefKind, type Urgency } from './relief';
import { splitCode } from './trace';

// Ghidra, the assistant (M363; "Ask UniVerse" until then, M30): one chat that acts in every app. Each
// request becomes one proposed action (AI on the server, or the simple matcher below when AI is off),
// shown as a card the person must confirm; confirming calls the app's own route, which checks
// everything again. Nothing is done without the tap. Two actions only read the person's own data
// (what's due, their Green numbers): the server answers them with a list ('show'). Shared by the server
// (src/server/ask.ts), the chat (components/hub/Ghidra.tsx) and the sample demo.

/** Pages the assistant may open (the box turns role-specific ones into the person's own address). */
export const ASK_PAGES = {
  hub: { href: '/hub', label: 'All apps and your Impact Wallet' },
  green: { href: '/green', label: 'Green: your climate actions' },
  green_teams: { href: '/green/teams', label: 'Green teams and leaderboard' },
  relief: { href: '/relief', label: 'Relief: the live map of needs and offers' },
  relief_mine: { href: '/relief/mine', label: 'Your Relief requests and tasks' },
  trace: { href: '/trace', label: 'Trace: your brand console' },
  trace_wallet: { href: '/trace/wallet', label: 'Your Trace points' },
  trace_vault: { href: '/trace/vault', label: 'Things you own (Trace vault)' },
  courses: { href: ':home/courses', label: 'Your courses' },
  inbox: { href: ':home/inbox', label: 'Messages' },
  settings: { href: ':home/settings', label: 'Settings' },
  collab: { href: '/collab', label: 'Collaborate' },
  docs: { href: '/docs', label: 'Docs' },
  calendar: { href: ':home/calendar', label: 'Your calendar and timetable' },
  grades: { href: ':home/grades', label: 'Your grades' },
  assignments: { href: ':home/assignments', label: 'Your assignments' },
  calls: { href: '/calls', label: 'Meet & call' },
  travel: { href: '/travel', label: 'Travel: places, guides and trips' },
  travel_saved: { href: '/travel/saved', label: 'Your saved places and trips' },
  games: { href: '/play', label: 'Games' },
} as const;
export type AskPage = keyof typeof ASK_PAGES;

export type AskPlan =
  | { action: 'green_log'; kind: GreenKind; amount: number; note: string | null; say: string }
  | { action: 'relief_post'; type: 'NEED' | 'OFFER'; kind: ReliefKind; title: string; people: number; urgency: Urgency; say: string }
  | { action: 'trace_check'; code: string; say: string }
  | { action: 'open'; page: AskPage; say: string }
  | { action: 'my_due' | 'my_green' | 'my_trips' | 'my_courses'; say: string }
  | { action: 'trip_new'; name: string; startDate: string | null; travellers: number; say: string }
  | { action: 'message_draft'; text: string; say: string }
  | { action: 'show'; say: string; items: ShowItem[] }
  | { action: 'answer'; say: string };

/** One line of a 'show' answer: what, a detail (a date, a course, a number), and where to open it. */
export interface ShowItem { title: string; sub: string; href: string | null }

/** One turn of the chat, sent back with the next question so follow-ups work ("make it 10 km"). */
export interface AskTurn { who: 'me' | 'ghidra'; text: string }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const one = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as T) : null);

/** Checks a proposed action field by field (AI answers are untrusted); anything off becomes an answer. */
export function cleanPlan(raw: unknown): AskPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const say = str(r.say, 600);
  const fallback: AskPlan = { action: 'answer', say: say || 'I can show what’s due, your courses, your trips and how you’re doing in Green, log a climate action, post on Relief, start a trip, draft a message, check a product code, or open a page. Try “What’s due this week?”' };
  if (r.action === 'green_log') {
    const kind = one(GREEN_KINDS, r.kind), amount = num(r.amount);
    if (!kind || !(amount > 0) || amount > GREEN_FACTORS[kind].max) return fallback;
    const a = Math.round(amount * 10) / 10;
    return { action: 'green_log', kind, amount: a, note: str(r.note, 300) || null, say: say || `Log ${a} ${GREEN_FACTORS[kind].units}: ${GREEN_FACTORS[kind].label.toLowerCase()} (${co2For(kind, a)} kg CO₂ saved).` };
  }
  if (r.action === 'relief_post') {
    const type = r.type === 'OFFER' ? 'OFFER' : r.type === 'NEED' ? 'NEED' : null;
    const kind = one(RELIEF_KINDS, r.kind) ?? 'OTHER', title = str(r.title, 120), people = Math.round(num(r.people));
    if (!type || title.length < 3) return fallback;
    return { action: 'relief_post', type, kind, title, people: people >= 1 && people <= 10_000 ? people : 1, urgency: one(URGENCIES, r.urgency) ?? 'MEDIUM', say: say || `Post on Relief: ${title}.` };
  }
  if (r.action === 'trace_check') {
    const code = str(r.code, 40);
    return splitCode(code) ? { action: 'trace_check', code, say: say || 'Check this product’s passport.' } : fallback;
  }
  if (r.action === 'open' && typeof r.page === 'string' && r.page in ASK_PAGES) return { action: 'open', page: r.page as AskPage, say: say || `Open ${ASK_PAGES[r.page as AskPage].label}.` };
  if (r.action === 'my_due' || r.action === 'my_green' || r.action === 'my_trips' || r.action === 'my_courses') return { action: r.action, say };
  // M365: a new trip (Travel's own route makes it; its cities are added on the trip's page) and a message drafted for
  // the person to send themselves (it waits in Messages until they pick a chat and press Send).
  if (r.action === 'trip_new') {
    const name = str(r.name, 80), travellers = Math.round(num(r.travellers));
    const day = typeof r.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate) && !Number.isNaN(Date.parse(r.startDate)) ? r.startDate : null;
    if (name.length < 3) return fallback;
    return { action: 'trip_new', name, startDate: day, travellers: travellers >= 1 && travellers <= 20 ? travellers : 1, say: say || `Make a trip: ${name}.` };
  }
  if (r.action === 'message_draft') {
    const text = str(r.text, 1000);
    return text.length >= 2 ? { action: 'message_draft', text, say: say || 'Here’s a draft. Choose the chat to send it to.' } : fallback;
  }
  return fallback;
}

const GREEN_WORDS: [RegExp, GreenKind][] = [
  [/\b(cycl|bik)/i, 'CYCLE'], [/\b(walk)/i, 'WALK'], [/\b(bus|train|metro|tram|transit|public transport)/i, 'TRANSIT'], [/\b(tree|planted)/i, 'TREE'],
  [/\b(recycl)/i, 'RECYCLE'], [/\b(solar)/i, 'SOLAR'], [/\b(meat.?free|vegetarian|vegan|plant.?based)/i, 'MEATFREE'], [/\b(litter|clean.?up|picked up)/i, 'CLEANUP'],
];
// Transport first: "a lift to the clinic" is a lift.
const RELIEF_WORDS: [RegExp, ReliefKind][] = [[/\b(lift|ride|transport|van|drive)/i, 'TRANSPORT'], [/\b(food|meal|hungry)/i, 'FOOD'], [/\b(water)/i, 'WATER'], [/\b(shelter|room|stay|bed)/i, 'SHELTER'], [/\b(medic|doctor|insulin|clinic)/i, 'MEDICAL'], [/\b(cloth|coat|blanket)/i, 'CLOTHES']];

/** A simple matcher for common requests: used when AI is off or used up, and in the demo. */
export function localPlan(text: string): AskPlan {
  const t = text.trim();
  const code = t.split(/\s+/).find((w) => splitCode(w));
  if (code) return cleanPlan({ action: 'trace_check', code });
  if (/\b(due|homework|assignments?|deadlines?|hand in|quiz(zes)?)\b/i.test(t) && !/\b(open|go to|take me)\b/i.test(t)) return cleanPlan({ action: 'my_due' });
  if (/\b(streak|co2|co₂|carbon|how am i doing|my green|saved)\b/i.test(t) && !/\b(i |we )(cycled|walked|recycled|planted)/i.test(t)) return cleanPlan({ action: 'my_green' });
  if (/\b(my trips?|trips)\b/i.test(t) && /\b(what|which|list|how many|upcoming|planned|have)\b/i.test(t)) return cleanPlan({ action: 'my_trips' });
  if (/\bmy (courses|classes|subjects)\b/i.test(t) && /\b(what|which|list|how many|am i in|do i (have|teach))\b/i.test(t)) return cleanPlan({ action: 'my_courses' });
  const trip = /\b(?:plan|make|create|start)\b.*?\btrip to ([\p{L}][\p{L}\s.'-]{1,40}?)(?:\s+(?:for|in|with|on|next|this)\b|[,.!?]|$)/iu.exec(t);
  if (trip) return cleanPlan({ action: 'trip_new', name: `Trip to ${trip[1].trim()}`, travellers: Number(t.match(/\bfor (\d{1,2})\b/i)?.[1] ?? 1) });
  const amount = Number(t.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? NaN);
  const green = GREEN_WORDS.find(([re]) => re.test(t))?.[1];
  if (green && /\b(i |i'|we |log|did|have|just)/i.test(`${t} `) && !/\b(need|offer)\b/i.test(t)) return cleanPlan({ action: 'green_log', kind: green, amount: amount > 0 ? amount : 1 });
  const need = /\b(need|help me|looking for|urgent)/i.test(t), offer = /\b(i can|offer|giving|give away|spare)/i.test(t);
  if (need || offer) {
    const people = Number(t.match(/\bfor (\d+)/i)?.[1] ?? 1);
    return cleanPlan({ action: 'relief_post', type: need ? 'NEED' : 'OFFER', kind: RELIEF_WORDS.find(([re]) => re.test(t))?.[1] ?? 'OTHER', title: t.slice(0, 120), people, urgency: /\burgent|now|asap\b/i.test(t) ? 'HIGH' : 'MEDIUM' });
  }
  const page = (Object.keys(ASK_PAGES) as AskPage[]).find((p) => new RegExp(`\\b${p.replace('_', '.?')}`, 'i').test(t)) ?? (/\bwallet\b/i.test(t) ? 'hub' : /\bmessage|chat/i.test(t) ? 'inbox' : /\b(meet|meetings?|calls?)\b/i.test(t) ? 'calls' : /\b(trips?|holidays?)\b/i.test(t) ? 'travel' : /\b(games?|play)\b/i.test(t) ? 'games' : null);
  if (page && /\b(open|show|go|see|take me|where)/i.test(t)) return cleanPlan({ action: 'open', page });
  return cleanPlan({});
}
