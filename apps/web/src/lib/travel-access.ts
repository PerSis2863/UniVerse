// Accessibility for places (M322): what the map's data says (OpenStreetMap's wheelchair, toilets, hearing loop and
// lift tags) and what UniVerse's visitors say in their reviews (step-free, an accessible toilet, a lift or ramp,
// quiet, seating), added up per place ("3 of 4 visitors").

export const ACCESS_KEYS = { stepFree: 'Step-free entrance', toilet: 'Accessible toilet', lift: 'Lift or ramp', quiet: 'Quiet, calm', seating: 'Places to sit' } as const;
export type AccessKey = keyof typeof ACCESS_KEYS;
export type AccessNote = Partial<Record<AccessKey, boolean>> & { note?: string };
export type MapAccess = { wheelchair: 'yes' | 'limited' | 'no' | null; toilet: boolean | null; hearingLoop: boolean | null; lift: boolean | null; description: string | null };

/** OpenStreetMap's tags about getting in and around. */
export function accessFromTags(t: Record<string, string>): MapAccess | null {
  const w = t.wheelchair === 'yes' || t.wheelchair === 'limited' || t.wheelchair === 'no' ? t.wheelchair : null;
  const yn = (v: string | undefined) => (v === 'yes' ? true : v === 'no' ? false : null);
  const a: MapAccess = {
    wheelchair: w, toilet: yn(t['toilets:wheelchair']), hearingLoop: yn(t.hearing_loop ?? t['hearing_loop:installation']),
    lift: yn(t.elevator ?? t.lift), description: typeof t['wheelchair:description'] === 'string' ? t['wheelchair:description'].slice(0, 200) : null,
  };
  return Object.values(a).some((v) => v !== null) ? a : null;
}

/** A visitor's accessibility notes, checked (yes / no per thing, a short note). */
export function cleanAccess(raw: unknown): AccessNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: AccessNote = {};
  for (const k of Object.keys(ACCESS_KEYS) as AccessKey[]) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  if (typeof o.note === 'string' && o.note.trim()) out.note = o.note.replace(/\s+/g, ' ').trim().slice(0, 300);
  return Object.keys(out).length ? out : null;
}

/** Per thing, how many visitors said yes out of those who said anything about it. */
export function accessSummary(notes: (AccessNote | null)[]) {
  const said = notes.filter((n): n is AccessNote => !!n);
  const out = (Object.keys(ACCESS_KEYS) as AccessKey[]).map((k) => {
    const answered = said.filter((n) => typeof n[k] === 'boolean');
    return { key: k, label: ACCESS_KEYS[k], yes: answered.filter((n) => n[k]).length, of: answered.length };
  }).filter((x) => x.of > 0);
  return { things: out, notes: said.map((n) => n.note).filter((n): n is string => !!n).slice(0, 5), visitors: said.length };
}
