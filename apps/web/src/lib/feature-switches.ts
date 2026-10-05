// Features the owner can turn off for everyone (owner console → Server → Feature switches). The
// Worker refuses changes to a feature that is off (cloudflare/usage-guard.ts) by matching the
// request path, so it costs nothing per request; the owner still gets through. Calls share the
// messages route with chat, so the send route checks that one itself.
// No imports: the Worker loads this file too.

export interface FeatureSwitch {
  id: string;
  label: string;
  hint: string;
  /** Changes (anything but GET) to these paths are refused while the feature is off. */
  paths?: RegExp;
  /** Methods that still work while it's off (e.g. deleting your own message). */
  allow?: string[];
}

export const FEATURE_SWITCHES: FeatureSwitch[] = [
  { id: 'chat', label: 'Sending messages', hint: 'Nobody can send chat messages or start new chats. Reading still works.', paths: /^\/api\/chat\/(conversations(\/[^/]+\/messages)?|messages\/[^/]+(\/(reactions|vote))?)$/, allow: ['DELETE'] },
  { id: 'calls', label: 'Voice and video calls', hint: 'Nobody can start a call.' },
  { id: 'uploads', label: 'File uploads', hint: 'Nobody can upload photos or files.', paths: /^\/api\/(upload(\/token)?|core\/files\/upload)$/ },
  { id: 'ai', label: 'AI features', hint: 'AI tutor, summaries, translation and reports stop. Saves AI costs.', paths: /^\/api\/(ai|summarize|student\/planner|tutor\/.*|premium\/ai-report|chat\/translate-draft|chat\/conversations\/[^/]+\/translate)$/ },
  { id: 'groups', label: 'Groups and posts', hint: 'Nobody can create, join or post in groups.', paths: /^\/api\/(groups\/.*|core\/groups(\/.*)?)$/ },
  { id: 'boards', label: 'Whiteboards', hint: 'Whiteboards become view-only.', paths: /^\/api\/(boards(\/.*)?|courses\/[^/]+\/board)$/ },
  { id: 'signups', label: 'New sign-ups', hint: 'New people can’t finish creating an account. Existing accounts are fine.', paths: /^\/api\/core\/auth\/register$/ },
  { id: 'payments', label: 'Payments', hint: 'Nobody can start a new payment or subscription.', paths: /^\/api\/(billing\/checkout|create-checkout-session)$/ },
];

const IDS = new Set(FEATURE_SWITCHES.map((f) => f.id));

// ─── Your emails: how often each owner email comes ─────────────────────────────────────────────
// Stored in the same server_control.switches list as "email:<id>=<every>" (no database change).
// Weekly emails come on Mondays, monthly ones on the 1st (UTC), each covering the time since
// the last one. Fewer emails also leave more of the Resend allowance for everyone else.

export type EmailEvery = 'daily' | 'weekly' | 'monthly' | 'off';

export interface OwnerEmail { id: 'digest' | 'errors' | 'security'; label: string; hint: string; options: EmailEvery[]; normal: EmailEvery }

export const OWNER_EMAILS: OwnerEmail[] = [
  { id: 'digest', label: 'Summary', hint: 'People active, new accounts, messages, money and what needs a look (07:30 UTC).', options: ['daily', 'weekly', 'monthly', 'off'], normal: 'daily' },
  { id: 'errors', label: 'New problems', hint: 'Errors found since the last email, with the AI’s diagnosis (08:00 UTC).', options: ['daily', 'weekly', 'monthly', 'off'], normal: 'daily' },
  { id: 'security', label: 'Security check', hint: 'The Health check: security and error problems ranked by AI (Mondays or the 1st).', options: ['weekly', 'monthly', 'off'], normal: 'weekly' },
];

const EVERY = new Set<string>(['daily', 'weekly', 'monthly', 'off']);

/** How often each owner email comes. Older settings ("digest"/"security" switched off) count as off. */
export function parseEmailSchedule(raw: string | null | undefined): Record<OwnerEmail['id'], EmailEvery> {
  const out = Object.fromEntries(OWNER_EMAILS.map((e) => [e.id, e.normal])) as Record<OwnerEmail['id'], EmailEvery>;
  let list: unknown = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { /* keep defaults */ }
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (item === 'digest' || item === 'security') out[item] = 'off';
    const m = typeof item === 'string' ? /^email:(digest|errors|security)=(\w+)$/.exec(item) : null;
    const def = m && OWNER_EMAILS.find((e) => e.id === m[1]);
    if (m && def && EVERY.has(m[2]) && def.options.includes(m[2] as EmailEvery)) out[m[1] as OwnerEmail['id']] = m[2] as EmailEvery;
  }
  return out;
}

/** The schedule as list entries, to store next to the switched-off features. */
export function emailScheduleEntries(schedule: Partial<Record<OwnerEmail['id'], EmailEvery>>): string[] {
  return OWNER_EMAILS.filter((e) => schedule[e.id] && schedule[e.id] !== e.normal).map((e) => `email:${e.id}=${schedule[e.id]}`);
}

/** Whether an email on this schedule goes out today (UTC), and how many days it covers. */
export function emailDue(every: EmailEvery, now = new Date()): { due: boolean; days: number } {
  if (every === 'daily') return { due: true, days: 1 };
  if (every === 'weekly') return { due: now.getUTCDay() === 1, days: 7 };
  if (every === 'monthly') return { due: now.getUTCDate() === 1, days: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate() };
  return { due: false, days: 0 };
}

/** The switched-off feature ids stored in server_control.switches (a JSON list). */
export function parseSwitches(raw: string | null | undefined): string[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && IDS.has(x)) : [];
  } catch {
    return [];
  }
}

/** The switched-off feature this request belongs to, if any. */
export function blockedFeature(off: string[], method: string, path: string): FeatureSwitch | null {
  if (!off.length || method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  return FEATURE_SWITCHES.find((f) => off.includes(f.id) && f.paths?.test(path) && !f.allow?.includes(method)) ?? null;
}

/** Watch words as a clean list (stored one per line or comma-separated). */
export function parseWatchWords(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? '').split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2))].slice(0, 100);
}

/** The watch words in this text, matched as whole words or phrases in any case ("cheat" not in "cheating"). */
export function findWatchWords(words: string[], text: string): string[] {
  if (!words.length || !text) return [];
  const lower = text.toLowerCase();
  return words.filter((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(lower));
}
