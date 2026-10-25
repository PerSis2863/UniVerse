import type { SessionUser } from '@/lib/server-auth';
import { ASK_PAGES, cleanPlan, localPlan, type AskPlan } from '@/lib/ask';
import { GREEN_FACTORS, GREEN_KINDS } from '@/lib/green';
import { RELIEF_KINDS } from '@/lib/relief';
import { MATH_RULE } from '@/lib/tutor-rules';
import { spendAi } from './ai-budget';
import { BadRequestException } from './http';
import { featureOff } from './moderation';
import { geminiJson } from './gemini';
import { short } from './trace';
import type { Body } from './body';

// POST /ask { text }: "Ask UniVerse" (M30, src/lib/ask.ts). The request becomes ONE proposed action
// the person confirms in the box; this route never changes anything itself. AI goes through the
// daily allowance (spendAi) and the owner's switch (featureOff('ai')); without it, or when it fails,
// the simple matcher answers. Every field AI returns is checked again (cleanPlan).

const SYSTEM = [
  'You are the assistant of UniVerse Impact, one account with several apps: UniVersity (school),',
  'Trace (product passports), Relief (needs and offers of help on a map) and Green (climate actions).',
  'Turn the person\'s request into exactly one action. Actions:',
  `- green_log: they did a climate action. kind is one of ${GREEN_KINDS.map((k) => `${k} (${GREEN_FACTORS[k].units})`).join(', ')}; amount is how many of that unit.`,
  `- relief_post: they need help (type NEED) or offer it (type OFFER). kind is one of ${RELIEF_KINDS.join(', ')}; title is a short line in their words; people is how many people; urgency LOW, MEDIUM, HIGH or CRITICAL.`,
  '- trace_check: they gave a product code to check.',
  `- open: they want a page. page is one of ${Object.keys(ASK_PAGES).join(', ')}.`,
  '- answer: anything else: a short, friendly answer about how to do it in UniVerse (never invent their data).',
  'Always fill "say": one plain sentence telling them what will happen, or the answer.',
  MATH_RULE,
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['green_log', 'relief_post', 'trace_check', 'open', 'answer'] },
    say: { type: 'STRING' }, kind: { type: 'STRING' }, amount: { type: 'NUMBER' }, note: { type: 'STRING' },
    type: { type: 'STRING' }, title: { type: 'STRING' }, people: { type: 'NUMBER' }, urgency: { type: 'STRING' },
    code: { type: 'STRING' }, page: { type: 'STRING' },
  },
  required: ['action', 'say'],
};

export async function askUniverse(u: SessionUser, b: Body): Promise<AskPlan & { ai: boolean; note?: string }> {
  const text = short(b.text, 400);
  if (!text) throw new BadRequestException('Type what you’d like to do.');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return { ...localPlan(text), ai: false };
  const spend = await spendAi(u);
  if (!spend.ok) return { ...localPlan(text), ai: false, note: spend.message };
  const out = await geminiJson<Record<string, unknown>>(SYSTEM, text, SCHEMA, 400, true).catch(() => null);
  return out ? { ...cleanPlan(out), ai: true } : { ...localPlan(text), ai: false };
}
