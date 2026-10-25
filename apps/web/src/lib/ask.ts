import { GREEN_FACTORS, GREEN_KINDS, co2For, type GreenKind } from './green';
import { RELIEF_KINDS, URGENCIES, type ReliefKind, type Urgency } from './relief';
import { splitCode } from './trace';

// "Ask UniVerse" (M30): one box that acts in every app. The request becomes one proposed action
// (AI on the server, or the simple matcher below when AI is off), shown as a card the person must
// confirm; confirming calls the app's own route, which checks everything again. Nothing is done
// without the tap. Shared by the server (src/server/ask.ts), the box and the sample demo.

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
} as const;
export type AskPage = keyof typeof ASK_PAGES;

export type AskPlan =
  | { action: 'green_log'; kind: GreenKind; amount: number; note: string | null; say: string }
  | { action: 'relief_post'; type: 'NEED' | 'OFFER'; kind: ReliefKind; title: string; people: number; urgency: Urgency; say: string }
  | { action: 'trace_check'; code: string; say: string }
  | { action: 'open'; page: AskPage; say: string }
  | { action: 'answer'; say: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const one = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as T) : null);

/** Checks a proposed action field by field (AI answers are untrusted); anything off becomes an answer. */
export function cleanPlan(raw: unknown): AskPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const say = str(r.say, 600);
  const fallback: AskPlan = { action: 'answer', say: say || 'I can log a climate action, post a need or offer on Relief, check a product code, or open a page. Try “I cycled 8 km to school”.' };
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
  const amount = Number(t.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? NaN);
  const green = GREEN_WORDS.find(([re]) => re.test(t))?.[1];
  if (green && /\b(i |i'|we |log|did|have|just)/i.test(`${t} `) && !/\b(need|offer)\b/i.test(t)) return cleanPlan({ action: 'green_log', kind: green, amount: amount > 0 ? amount : 1 });
  const need = /\b(need|help me|looking for|urgent)/i.test(t), offer = /\b(i can|offer|giving|give away|spare)/i.test(t);
  if (need || offer) {
    const people = Number(t.match(/\bfor (\d+)/i)?.[1] ?? 1);
    return cleanPlan({ action: 'relief_post', type: need ? 'NEED' : 'OFFER', kind: RELIEF_WORDS.find(([re]) => re.test(t))?.[1] ?? 'OTHER', title: t.slice(0, 120), people, urgency: /\burgent|now|asap\b/i.test(t) ? 'HIGH' : 'MEDIUM' });
  }
  const page = (Object.keys(ASK_PAGES) as AskPage[]).find((p) => new RegExp(`\\b${p.replace('_', '.?')}`, 'i').test(t)) ?? (/\bwallet\b/i.test(t) ? 'hub' : /\bmessage|chat/i.test(t) ? 'inbox' : null);
  if (page && /\b(open|show|go|see|take me|where)/i.test(t)) return cleanPlan({ action: 'open', page });
  return cleanPlan({});
}
