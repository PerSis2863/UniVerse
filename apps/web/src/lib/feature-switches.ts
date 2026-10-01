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
  { id: 'ai', label: 'AI features', hint: 'AI tutor, summaries, translation and reports stop. Saves AI costs.', paths: /^\/api\/(ai|summarize|tutor\/.*|premium\/ai-report|chat\/translate-draft|chat\/conversations\/[^/]+\/translate)$/ },
  { id: 'groups', label: 'Groups and posts', hint: 'Nobody can create, join or post in groups.', paths: /^\/api\/(groups\/.*|core\/groups(\/.*)?)$/ },
  { id: 'boards', label: 'Whiteboards', hint: 'Whiteboards become view-only.', paths: /^\/api\/(boards(\/.*)?|courses\/[^/]+\/board)$/ },
  { id: 'signups', label: 'New sign-ups', hint: 'New people can’t finish creating an account. Existing accounts are fine.', paths: /^\/api\/core\/auth\/register$/ },
  { id: 'payments', label: 'Payments', hint: 'Nobody can start a new payment or subscription.', paths: /^\/api\/(billing\/checkout|create-checkout-session)$/ },
  { id: 'digest', label: 'Your daily summary email', hint: 'Stops the 07:30 UTC email with yesterday’s numbers and what needs a look. Only affects you.' },
];

const IDS = new Set(FEATURE_SWITCHES.map((f) => f.id));

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
