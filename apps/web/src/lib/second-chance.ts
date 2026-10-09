// Second chances (Stage 5 · D10): the pure parts, so they can be tested. What a student missed is
// grouped into catch-ups (by concept when the question or criterion is tagged, otherwise one per
// item), and class moments are found for a topic by matching its key words in chapter titles, key
// moments, practice questions and what the teacher said.

export interface Miss { kind: 'QUESTION' | 'CRITERION'; refId: string; text: string; source: string; at: number }
export interface Candidate { key: string; conceptId: string | null; topic: string; misses: Miss[]; missedAt: number }

/** A rubric criterion counts as missed under this share of its points. */
export const LOW_SCORE = 0.6;
/** How much a practice answer counts towards mastery, next to a quiz answer (1) or a rubric score (1.5). */
export const PRACTICE_WEIGHT = 0.75;
/** Answering a missed question again, once its answer has been seen, counts for less. */
export const RETRY_WEIGHT = 0.5;

const STOP = new Set(('the and for are but not you all any can had her was one our out has have this that with from they will what when which their there then them than been were into more some such only also over very your about would could should these those does each other where while after before under between through during without within because being doing using used make made how why who whom its it’s it\'s le la les des une est pas que qui dans pour sur avec der die das und ist nicht ein eine mit von zu el los las del una por para con como que').split(' '));

const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A topic's key words, cut to a rough stem so "loops" finds "loop" and "recursion" finds "recursive". */
export function keywords(topic: string, max = 5): string[] {
  const words = fold(topic).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));
  const stems = [...new Set(words.map((w) => { const s = w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w; return s.length > 7 ? s.slice(0, 7) : s; }))];
  // The longest words say most about a topic; keep their original order.
  const keep = new Set([...stems].sort((a, b) => b.length - a.length).slice(0, max));
  return stems.filter((s) => keep.has(s));
}

/** How many of the key words a text has. */
export function hits(text: string, keys: string[]) {
  const f = fold(text);
  return keys.filter((k) => f.includes(k)).length;
}

/** Enough of the key words for a match: half of them, at least one. */
export const enough = (keys: string[]) => Math.max(1, Math.ceil(keys.length / 2));

/** Groups misses into catch-ups: one per tagged concept, or one per untagged question or criterion. Newest first. */
export function groupMisses(misses: Miss[], tagsByRef: Map<string, string[]>, concepts: { id: string; name: string }[]): Candidate[] {
  const out = new Map<string, Candidate>();
  const add = (key: string, conceptId: string | null, topic: string, m: Miss) => {
    const c = out.get(key) ?? { key, conceptId, topic, misses: [], missedAt: 0 };
    if (!c.misses.some((x) => x.refId === m.refId)) c.misses.push(m);
    c.missedAt = Math.max(c.missedAt, m.at);
    out.set(key, c);
  };
  for (const m of misses) {
    const tagged = (tagsByRef.get(m.refId) ?? []).map((id) => concepts.find((c) => c.id === id)).filter((c): c is { id: string; name: string } => !!c);
    if (tagged.length) for (const c of tagged) add(`CONCEPT:${c.id}`, c.id, c.name, m);
    else add(`${m.kind}:${m.refId}`, null, m.text.length > 120 ? `${m.text.slice(0, 117).trimEnd()}…` : m.text, m);
  }
  for (const c of out.values()) c.misses.sort((a, b) => b.at - a.at);
  return [...out.values()].sort((a, b) => b.missedAt - a.missedAt);
}

export interface SessionText {
  id: string; when: string; teacher: string | null;
  chapters: { t: number; title: string }[]; keyMoments: { t: number; text: string }[];
  transcript: { t: number; who: string; text: string }[];
}
export interface Moment { sessionId: string; when: string; t: number; text: string; kind: 'chapter' | 'moment' | 'said'; score: number }

/** The best class moments for a topic, across sessions: chapters first, then key moments, then what the teacher said. */
export function findMoments(sessions: SessionText[], keys: string[], max = 3): Moment[] {
  if (!keys.length) return [];
  const need = enough(keys);
  const rank = { chapter: 0.3, moment: 0.2, said: 0 };
  const found: Moment[] = [];
  for (const s of sessions) {
    const said = s.transcript.filter((l) => !s.teacher || l.who === s.teacher);
    const items: { t: number; text: string; kind: Moment['kind'] }[] = [
      ...s.chapters.map((c) => ({ t: c.t, text: c.title, kind: 'chapter' as const })),
      ...s.keyMoments.map((k) => ({ t: k.t, text: k.text, kind: 'moment' as const })),
      // Two lines said close together read as one explanation.
      ...said.map((l, i) => ({ t: l.t, text: said[i + 1] && said[i + 1].t - l.t < 60 ? `${l.text} ${said[i + 1].text}` : l.text, kind: 'said' as const })),
    ];
    for (const it of items) {
      const n = hits(it.text, keys);
      if (n < need) continue;
      // Near the same point of the same class, keep only the best.
      const near = found.findIndex((f) => f.sessionId === s.id && Math.abs(f.t - it.t) < 90);
      const score = n + rank[it.kind];
      if (near >= 0) { if (found[near].score < score) found[near] = { sessionId: s.id, when: s.when, t: it.t, text: it.text.slice(0, 240), kind: it.kind, score }; continue; }
      found.push({ sessionId: s.id, when: s.when, t: it.t, text: it.text.slice(0, 240), kind: it.kind, score });
    }
  }
  return found.sort((a, b) => b.score - a.score || b.when.localeCompare(a.when) || a.t - b.t).slice(0, max);
}
