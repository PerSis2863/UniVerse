// Revision packs (M294): what a pack holds, checked before it is stored or shown (the AI's answer is
// untrusted), and the plain outline used when AI isn't available.

export interface PackTopic { title: string; summary: string; points: string[]; terms: { term: string; meaning: string }[] }
export interface PackQuestion { q: string; a: string; topic: string }
export interface RevisionPack { overview: string; topics: PackTopic[]; questions: PackQuestion[]; checklist: string[] }

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = <T,>(v: unknown, n: number, f: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null).slice(0, n) : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Keeps a pack to its shape and sizes: 12 topics, 30 questions, 20 checklist lines. */
export function cleanPack(raw: unknown): RevisionPack {
  const r = obj(raw);
  return {
    overview: s(r.overview, 800),
    topics: list(r.topics, 12, (t) => {
      const o = obj(t), title = s(o.title, 120);
      return title ? {
        title, summary: s(o.summary, 900),
        points: list(o.points, 8, (p) => s(p, 240) || null),
        terms: list(o.terms, 10, (x) => { const k = obj(x), term = s(k.term, 80), meaning = s(k.meaning, 300); return term && meaning ? { term, meaning } : null; }),
      } : null;
    }),
    questions: list(r.questions, 30, (x) => { const k = obj(x), q = s(k.q, 400), a = s(k.a, 900); return q && a ? { q, a, topic: s(k.topic, 120) } : null; }),
    checklist: list(r.checklist, 20, (c) => s(c, 200) || null),
  };
}

/** Without AI: one topic per module with its items as points, and a checklist to tick. */
export function outlinePack(modules: { title: string; summary?: string | null; items: string[] }[]): RevisionPack {
  const topics = modules.slice(0, 12).map((m) => ({ title: m.title.slice(0, 120), summary: (m.summary ?? '').slice(0, 900), points: m.items.slice(0, 8).map((i) => i.slice(0, 240)), terms: [] }));
  return {
    overview: topics.length ? `This pack follows the course’s ${topics.length} modules. Go through each, then test yourself.` : 'This course has no modules yet.',
    topics,
    questions: [],
    checklist: topics.map((t) => `I can explain “${t.title}” in my own words`),
  };
}

/** The text a pack is made from, cut to a size one AI request can read (the longest sources are cut first). */
export function joinSources(sources: { title: string; text: string }[], max = 24_000): string {
  const fair = Math.floor(max / Math.max(1, sources.length));
  return sources.map((x) => `## ${x.title}\n${x.text.slice(0, Math.max(fair, 1200))}`).join('\n\n').slice(0, max);
}
