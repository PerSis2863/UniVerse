// Pinned items on Collaborate → Home (M17): each person keeps up to 24 boards, documents, task
// boards, code rooms or files at the top, on their account (users.collabPins, JSON).

export const PIN_KINDS = ['board', 'doc', 'sheet', 'slides', 'tasks', 'code', 'file'] as const;
export type PinKind = (typeof PIN_KINDS)[number];
export interface Pin { kind: PinKind; id: string; title: string; href: string }
export const MAX_PINS = 24;

/** Only well-formed pins, each once, at most MAX_PINS; links stay inside the app. */
export function cleanPins(v: unknown): Pin[] {
  const list = Array.isArray(v) ? v : (v as { pins?: unknown } | null)?.pins;
  if (!Array.isArray(list)) return [];
  const out: Pin[] = [];
  const seen = new Set<string>();
  for (const p of list as Partial<Pin>[]) {
    if (!p || !PIN_KINDS.includes(p.kind as PinKind) || typeof p.id !== 'string' || !/^[\w-]{1,64}$/.test(p.id)) continue;
    if (typeof p.href !== 'string' || !/^\/(?!\/)[\w\-/?=&.%]{0,300}$/.test(p.href)) continue;
    const key = `${p.kind}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: p.kind as PinKind, id: p.id, title: (typeof p.title === 'string' ? p.title.trim() : '').slice(0, 120) || 'Untitled', href: p.href });
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

export function parsePins(json: string | null | undefined): Pin[] {
  if (!json) return [];
  try { return cleanPins(JSON.parse(json)); } catch { return []; }
}
