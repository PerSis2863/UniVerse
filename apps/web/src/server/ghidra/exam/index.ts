import { jsonSchema } from '../../agents/playbooks';
import { asGhidra } from '../brain';
import { SKILLS, type SkillId } from '../skills';
import { fits, IDENTITY, jsonIn, questions, type Ask, type CodeRun, type Paper } from './kit';
import { AETHER_HYPERION_PAPERS, APP_PAPERS, hyperionPaper } from './papers-apps';
import { LEARNING_PAPERS } from './papers-learning';
import { SHARED_PAPERS } from './papers-shared';

// Ghidra's exam (STAGE-5-PLAN.md, "Ghidra, the one AI", step 2): 50–150 questions per skill, each with pass / fail
// rules, asked with the skill's own instructions exactly as the website asks them. scripts/ai/ghidra-exam.mjs asks
// them and prints the score card; exam.test.ts checks that every skill has a paper and that the rules work.

export { questions, type Ask, type CodeRun, type Paper };

/** Every skill's paper. */
export async function papers(): Promise<Record<SkillId, Paper>> {
  const all = { ...APP_PAPERS, ...AETHER_HYPERION_PAPERS, ...LEARNING_PAPERS, ...SHARED_PAPERS, hyperion: await hyperionPaper() };
  return all satisfies Record<SkillId, Paper>;
}
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** The rules an answer failed (empty: it passed). `answer` is the reply's text, or the parsed object the website's
 *  brain returns, or for `code` what Hyperion made of it; null when nothing came back. */
export function mark(ask: Ask, answer: unknown): string[] {
  if (answer === null || answer === undefined || answer === '') return ['no answer'];
  let a = answer;
  if (ask.mode === 'json' || ask.mode === 'image') {
    a = typeof answer === 'string' ? jsonIn(answer) : answer;
    if (!a) return ['not JSON'];
    if (ask.schema && !fits(a, ask.schema as Record<string, unknown>)) return ['wrong shape'];
  }
  const failed: string[] = [];
  for (const [name, ok] of [IDENTITY, ...ask.rules]) {
    try { if (!(ok as (x: unknown) => boolean)(a)) failed.push(name); } catch { failed.push(name); }
  }
  return failed;
}

/** The code in a reply: its fenced blocks joined, or the whole reply when it has none. */
export function codeIn(reply: string) {
  const blocks = [...reply.matchAll(/```[a-z]*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  return (blocks.length ? blocks.join('\n') : reply).trim();
}

/** The instructions a model without a schema option gets (UniVerse's own model, the exam's `--via openai`, the lessons):
 *  Ghidra's, the job's, and for JSON the line asking for one object matching the schema. */
export function plainSystem(ask: Ask) {
  return asGhidra(ask.system) + (ask.schema ? `\nReply with only one JSON object, no other text, matching this JSON Schema: ${JSON.stringify(jsonSchema(ask.schema))}` : '');
}
