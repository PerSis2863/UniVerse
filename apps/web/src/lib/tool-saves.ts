// Saved work in Collaborate → Create (M75): what a tool keeps on the device (`useKept`, keys "uv-…")
// can be saved to the account and shared by link. Pure checks, shared by the API and the page.

export const MAX_SAVE_CHARS = 200_000;
export const MAX_SAVES = 300;
const TOOL = /^[a-z][\w-]{0,40}$/;
const KEY = /^uv-[\w:-]{1,80}$/;

export interface SaveInput { tool: string; title: string; data: Record<string, string> }

/** A save from untrusted input, or an error message: only "uv-" keys with text values, 200 KB at most. */
export function cleanSave(v: unknown, partial = false): Partial<SaveInput> | string {
  if (!v || typeof v !== 'object') return 'Nothing to save.';
  const b = v as Record<string, unknown>, out: Partial<SaveInput> = {};
  if (b.tool !== undefined || !partial) { if (typeof b.tool !== 'string' || !TOOL.test(b.tool)) return 'Unknown tool.'; out.tool = b.tool; }
  if (b.title !== undefined || !partial) out.title = (typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim() : '').slice(0, 120) || 'Untitled';
  if (b.data !== undefined || !partial) {
    if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return 'Nothing to save.';
    const entries = Object.entries(b.data as Record<string, unknown>);
    if (!entries.length) return 'This tool has nothing to save yet.';
    if (entries.length > 40) return 'Too many parts to save.';
    const data: Record<string, string> = {};
    for (const [k, val] of entries) { if (!KEY.test(k) || typeof val !== 'string') return 'Something in this work can’t be saved.'; data[k] = val; }
    if (JSON.stringify(data).length > MAX_SAVE_CHARS) return 'This is too big to save (over 200 KB).';
    out.data = data;
  }
  return out;
}

/** An unguessable link token (24 letters and digits, about 143 bits). */
export function shareToken(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => A[b % A.length]).join('');
}
export const isToken = (t: string) => /^[A-Za-z0-9]{24}$/.test(t);

// ── Live editing (M76) ──
const KEY_RE = /^uv-[\w:-]{1,80}$/;

/** A save's data with one part changed (or removed when value is null), or an error message. */
export function mergePart(dataJson: string, key: unknown, value: unknown): string | { error: string } {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return { error: 'Something in this work can’t be saved.' };
  if (value !== null && typeof value !== 'string') return { error: 'Something in this work can’t be saved.' };
  let data: Record<string, string>;
  try { data = JSON.parse(dataJson) as Record<string, string>; } catch { data = {}; }
  if (value === null) delete data[key]; else data[key] = value as string;
  if (Object.keys(data).length > 40) return { error: 'Too many parts to save.' };
  const out = JSON.stringify(data);
  return out.length > MAX_SAVE_CHARS ? { error: 'This is too big to save (over 200 KB).' } : out;
}

export interface Editor { id: string; name: string; at: number }
/** Who has the save open: this person marked as here now (written only when it changed or a minute passed). */
export function touchEditors(json: string | null | undefined, me: { id: string; name: string }, now: number): { list: Editor[]; changed: boolean } {
  let list: Editor[] = [];
  try { list = JSON.parse(json ?? '[]') as Editor[]; } catch { /* start fresh */ }
  if (!Array.isArray(list)) list = [];
  const mine = list.find((e) => e.id === me.id);
  if (mine && now - mine.at < 60_000) return { list, changed: false };
  const next = [{ id: me.id, name: me.name.split(' ')[0] || 'Someone', at: now }, ...list.filter((e) => e.id !== me.id)].slice(0, 30);
  return { list: next, changed: true };
}
/** First names of people who had it open in the last two minutes. */
export const activeEditors = (list: Editor[], now: number, except?: string) => list.filter((e) => now - e.at < 120_000 && e.id !== except).map((e) => e.name);
