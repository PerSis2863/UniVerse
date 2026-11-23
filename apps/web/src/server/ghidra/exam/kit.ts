// The exam's toolkit (STAGE-5-PLAN.md, "Ghidra, the one AI", step 2): what a question is, the rules an answer must pass,
// and a seeded dice so every run asks the same questions. Pure: no database, no network (exam.test.ts runs it).

/** How a question is asked: like the website's call for the skill (JSON with a schema, plain text, a picture, a recording, code). */
export type Mode = 'json' | 'text' | 'image' | 'audio' | 'code';

/** A rule an answer must pass: its name (the score card counts failures by name) and the test. For `json` the answer
 *  is the parsed object; for `text` and `audio` the reply; for `code`, what Hyperion's engine made of the reply's code. */
export type Rule = [name: string, ok: (a: never) => boolean];

export interface Ask {
  mode: Mode;
  system: string;
  prompt: string;
  schema?: object;
  maxTokens?: number;
  /** The website's smaller-model flag for this call. */
  lite?: boolean;
  /** `image`: a small HTML page the runner draws as the picture (a bill, a homework problem). */
  html?: string;
  /** `audio`: the words the runner reads aloud as the recording. */
  say?: string;
  rules: Rule[];
}

export interface Paper {
  /** How many questions (50–150). */
  n: number;
  ask(r: Rand, i: number): Ask;
}

/** What `code` rules see: the code found in the reply and how it ran in Hyperion's own engine. */
export interface CodeRun { code: string; ok: boolean; out: string; error: string; figures: number }

// ——— Dice ———

export class Rand {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next() { this.s ^= this.s << 13; this.s ^= this.s >>> 17; this.s ^= this.s << 5; return (this.s >>> 0) / 4294967296; }
  int(lo: number, hi: number) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  some<T>(xs: readonly T[], k: number): T[] { return [...xs].sort(() => this.next() - 0.5).slice(0, Math.min(k, xs.length)); }
  chance(p: number) { return this.next() < p; }
}

/** The questions of one paper, the same on every run (the seed is the skill's name). */
export function questions(skill: string, paper: Paper): Ask[] {
  let seed = 7;
  for (const ch of skill) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = new Rand(seed);
  return Array.from({ length: paper.n }, (_, i) => paper.ask(r, i));
}

// ——— Reading answers ———

/** The JSON object in a reply (the reply itself, or the first {...} in it), or null. */
export function jsonIn(text: string): Record<string, unknown> | null {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  try { const v: unknown = m ? JSON.parse(m[0]) : null; return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
}

/** Whether `v` fits a schema (Gemini's style or JSON Schema): required fields there, types and enums right. */
export function fits(v: unknown, s: Record<string, unknown>): boolean {
  const type = String(s.type ?? '').toLowerCase();
  if (type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>, props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
    if (!((s.required ?? []) as string[]).every((k) => o[k] !== undefined && o[k] !== null)) return false;
    return Object.entries(props).every(([k, p]) => o[k] === undefined || o[k] === null || fits(o[k], p));
  }
  if (type === 'array') return Array.isArray(v) && v.every((x) => fits(x, (s.items ?? {}) as Record<string, unknown>));
  if (type === 'string') return typeof v === 'string' && (!Array.isArray(s.enum) || s.enum.includes(v));
  if (type === 'integer') return Number.isInteger(v);
  if (type === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (type === 'boolean') return typeof v === 'boolean';
  return true;
}

/** Every string inside an answer, joined (for rules about the words used anywhere in it). */
export function words(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(words).join('\n');
  if (v && typeof v === 'object') return Object.values(v).map(words).join('\n');
  return '';
}

// ——— Rules every answer gets ———

/** Ghidra never says it is another company's assistant or model. */
const NAMES = 'gemini|bard|chatgpt|gpt-?[34o]|claude|qwen|deepseek|llama|mistral|universe ai';
/** It says it *is* one (naming one is fine: the console's advice says "ask Claude to fix"). */
const OTHER_AI = new RegExp(`\\b(i am|i'm|i’m|this is|as|i was)\\s+(an? |the )?(${NAMES})\\b|\\b(made|trained|developed|built|created) by (google|openai|meta|alibaba|anthropic|deepseek)\\b|\\bas an ai language model\\b|\\buniverse ai\\b`, 'i');
export const IDENTITY: Rule = ['says it is another AI', (a: unknown) => !OTHER_AI.test(words(a))];

// ——— Rule helpers ———

/** The numbers written in a text ("24", "3.5"), without list numbering ("1." at a line's start), [n] citations, dates
 *  (2026-03-14 counts as its parts) or hashtags. An answer may only use numbers it was given (support's rule, loosened
 *  for numbered steps). */
export function numbers(text: string): Set<string> {
  const t = (text ?? '').replace(/^\s*\d+[.)]\s/gm, '').replace(/\[\d+\]/g, '').replace(/#\w+/g, '').replace(/(\d),(\d{3})\b/g, '$1$2');
  return new Set((t.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
}
/** Numbers in `answer` that are not in `given` (small counting words like "2 steps" are allowed up to `free`). */
export function newNumbers(answer: string, given: string, free = 0): string[] {
  const ok = numbers(given);
  return [...numbers(answer)].filter((n) => !ok.has(n) && !(Number(n) <= free && Number.isInteger(Number(n))));
}
export const wordCount = (t: string) => (t ?? '').trim().split(/\s+/).filter(Boolean).length;
export const cites = (t: string) => [...(t ?? '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
export const has = (t: string, ...any: string[]) => any.some((w) => (t ?? '').toLowerCase().includes(w.toLowerCase()));
export const markdown = (t: string) => /\*\*|^#{1,6}\s/m.test(t ?? '');

/** A rough guess at a text's language from its letters and common words: 'hi', 'ar', 'zh', 'ja', 'ru', 'es', 'fr',
 *  'de', 'pt', 'it', 'en' (enough to tell whether an answer kept or changed the language). */
export function langOf(t: string): string {
  const s = (t ?? '').toLowerCase();
  if (/[ऀ-ॿ]/.test(s)) return 'hi';
  if (/[؀-ۿ]/.test(s)) return 'ar';
  if (/[぀-ヿ]/.test(s)) return 'ja';
  if (/[一-鿿]/.test(s)) return 'zh';
  if (/[Ѐ-ӿ]/.test(s)) return 'ru';
  const score = (ws: string[]) => ws.reduce((n, w) => n + (s.match(new RegExp(`(^|[^\\p{L}])${w}(?=[^\\p{L}]|$)`, 'gu'))?.length ?? 0), 0);
  const c = {
    es: score(['el', 'la', 'los', 'las', 'que', 'es', 'por', 'para', 'con', 'una', 'del', 'pero', 'cómo', 'qué', 'está']),
    fr: score(['le', 'la', 'les', 'des', 'est', 'une', 'pour', 'avec', 'que', 'pas', 'vous', 'dans', 'sur', 'du', 'mais']),
    de: score(['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'ein', 'eine', 'für', 'auf', 'wie', 'sie', 'ich', 'den']),
    pt: score(['o', 'os', 'as', 'que', 'não', 'uma', 'para', 'com', 'do', 'da', 'em', 'é', 'você', 'mas', 'como']),
    it: score(['il', 'lo', 'gli', 'che', 'non', 'una', 'per', 'con', 'del', 'della', 'è', 'sono', 'come', 'ma', 'anche']),
    en: score(['the', 'and', 'is', 'are', 'to', 'of', 'in', 'it', 'you', 'that', 'for', 'with', 'this', 'what', 'how']),
  };
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}
