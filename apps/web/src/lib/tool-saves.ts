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
