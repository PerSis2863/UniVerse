// AI viva and oral-exam coach (Stage 5 · D11): the kinds of oral, their rubrics, what the AI examiner
// is told, and checking the scores the AI suggests. Shared by the server, the pages and the tests.

import { LANGUAGES, isLanguage } from './languages';

export const ORAL_KINDS = {
  VIVA: { label: 'Viva', hint: 'Explain and defend what you know about a topic.', exam: 'a viva (an oral exam where the student explains and defends their understanding)' },
  DEBATE: { label: 'Debate', hint: 'Argue a side; the examiner argues back.', exam: 'a debate practice (the student argues a position and you argue the other side)' },
  LANGUAGE: { label: 'Language oral', hint: 'Speak in the language you’re learning.', exam: 'a language oral (a conversation exam in the language the student is learning)' },
  INTERVIEW: { label: 'Interview', hint: 'Answer questions like in a job or university interview.', exam: 'an interview practice (like a job, internship or university interview)' },
} as const;
export type OralKind = keyof typeof ORAL_KINDS;
export const isOralKind = (x: unknown): x is OralKind => typeof x === 'string' && Object.hasOwn(ORAL_KINDS, x);

export interface Criterion { id: string; name: string; desc: string; max: number }
export interface Score { id: string; score: number; reason: string; quote: string }
export interface Line { who: 'you' | 'ai'; text: string }

const C = (id: string, name: string, desc: string, max = 4): Criterion => ({ id, name, desc, max });
const CLARITY = C('clarity', 'Clarity', 'Easy to follow: organised answers, clear words, gets to the point.');
const DEPTH = C('depth', 'Depth', 'Goes beyond facts: explains why and how, connects ideas, handles follow-ups.');
const EVIDENCE = C('evidence', 'Evidence', 'Backs points with examples, facts, data or sources.');

/** The rubric a kind of oral starts with (a teacher can change it for an oral check). */
export function defaultRubric(kind: OralKind): Criterion[] {
  if (kind === 'DEBATE') return [CLARITY, C('depth', 'Argument', 'A clear position with reasons that hold together.'), EVIDENCE, C('rebuttal', 'Rebuttal', 'Answers the other side’s points directly and fairly.')];
  if (kind === 'LANGUAGE') return [C('clarity', 'Clarity and fluency', 'Speaks smoothly and can be understood.'), C('accuracy', 'Accuracy', 'Grammar and word forms are correct.'), C('range', 'Range', 'Uses varied vocabulary and sentence types.'), DEPTH];
  if (kind === 'INTERVIEW') return [CLARITY, DEPTH, C('evidence', 'Examples', 'Gives concrete examples from their own experience (situation, action, result).')];
  return [CLARITY, DEPTH, EVIDENCE];
}

/** A rubric sent by a teacher: 1–8 criteria with a name and a maximum of 1–10 points. */
export function parseRubric(raw: unknown): Criterion[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: Criterion[] = [];
  for (const x of raw.slice(0, 8)) {
    const c = (x ?? {}) as Partial<Criterion>;
    const name = typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '';
    const max = Math.round(Number(c.max));
    if (!name || !(max >= 1 && max <= 10)) continue;
    let id = (typeof c.id === 'string' && /^[a-z0-9-]{1,24}$/.test(c.id) ? c.id : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)) || `c${out.length + 1}`;
    while (seen.has(id)) id = `${id.slice(0, 20)}-${out.length + 1}`;
    seen.add(id);
    out.push({ id, name, desc: typeof c.desc === 'string' ? c.desc.trim().slice(0, 300) : '', max });
  }
  return out.length ? out : null;
}

/** Scores for a rubric, kept to whole numbers within each criterion's maximum; quotes must be the student's own words. */
export function cleanScores(raw: unknown, rubric: Criterion[], studentText?: string): Score[] {
  const list = Array.isArray(raw) ? (raw as Partial<Score>[]) : [];
  const said = studentText?.toLowerCase().replace(/\s+/g, ' ');
  return rubric.map((c) => {
    const x = list.find((s) => s?.id === c.id) ?? {};
    const n = Number(x.score);
    let quote = typeof x.quote === 'string' ? x.quote.trim().replace(/^["“]|["”]$/g, '').slice(0, 300) : '';
    if (quote && said !== undefined && !said.includes(quote.toLowerCase().replace(/\s+/g, ' '))) quote = '';
    return { id: c.id, score: Number.isFinite(n) ? Math.max(0, Math.min(c.max, Math.round(n))) : 0, reason: typeof x.reason === 'string' ? x.reason.trim().slice(0, 400) : '', quote };
  });
}

export const totalOf = (scores: Score[]) => scores.reduce((n, s) => n + s.score, 0);
export const maxOf = (rubric: Criterion[]) => rubric.reduce((n, c) => n + c.max, 0);

/** A transcript from the browser: who said what, with no empty or overlong lines. */
export function cleanTranscript(raw: unknown, maxLines = 120, maxChars = 30_000): Line[] {
  let chars = 0;
  const out: Line[] = [];
  for (const l of Array.isArray(raw) ? raw.slice(-maxLines) : []) {
    const x = (l ?? {}) as { who?: unknown; text?: unknown };
    const text = String(x.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    if (!text || (chars += text.length) > maxChars) continue;
    out.push({ who: x.who === 'ai' ? 'ai' : 'you', text });
  }
  return out;
}

/** What the student said, all together (to check quotes, and whether there's enough to score). */
export const studentWords = (lines: Line[]) => lines.filter((l) => l.who === 'you').map((l) => l.text).join(' ');

/** The AI examiner's instructions, locked into the voice session by the server. */
export function examinerPrompt(o: { kind: OralKind; topic: string; questions?: string; lang?: string; minutes: number; name?: string; course?: string }) {
  const lang = o.lang && isLanguage(o.lang) ? LANGUAGES[o.lang].name : '';
  const asks = Math.max(3, Math.min(10, Math.round(o.minutes * 0.8)));
  return [
    `You are a fair, calm and friendly oral examiner on UniVerse, a learning platform, running ${ORAL_KINDS[o.kind].exam} with ${o.name || 'a student'}.`,
    o.course ? `Course: ${o.course}.` : '',
    `Topic: ${o.topic || 'chosen by the student; ask them what they would like to be examined on'}.`,
    o.questions ? `The teacher wants these covered, in this order where it makes sense:\n${o.questions}` : '',
    'Ask one question at a time, then wait for the answer. After each answer, ask one follow-up that goes deeper: ask why or how, ask for evidence or an example, or press on a weak or vague point.',
    o.kind === 'DEBATE' ? 'Take the opposite side to the student and argue it with real reasons, briefly, so they must answer your points.' : '',
    o.kind === 'LANGUAGE' ? `Speak only ${lang || 'the language the student is learning'}, simply and clearly, at a pace for a learner. Don't correct mistakes during the exam.` : 'Reply in the language the student speaks.',
    o.kind === 'INTERVIEW' ? 'Ask the kind of questions real interviewers ask (motivation, strengths, a time they solved a problem, teamwork), and ask for specific examples.' : '',
    'This is an exam: don\'t teach, don\'t give answers or hints, don\'t say whether an answer is right, and don\'t praise or criticise during it. Keep your turns short (one or two sentences).',
    `Aim for about ${asks} questions including follow-ups in about ${o.minutes} minutes. When the topic is covered or time is nearly up, thank the student, say the exam is over, and stop asking questions.`,
    'If the student asks for help or the answers, say kindly that you can\'t help during the exam. Stay on the exam; for anything about safety or wellbeing, suggest they talk to a trusted adult or the school\'s support team.',
    'Begin now: greet the student in one short sentence and ask the first question.',
  ].filter(Boolean).join('\n');
}

/** Lines of the transcript for the scorer: "Examiner: …" and "Student: …". */
export const transcriptForScoring = (lines: Line[]) => lines.map((l) => `${l.who === 'ai' ? 'Examiner' : 'Student'}: ${l.text}`).join('\n');
