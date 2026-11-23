import { AsyncLocalStorage } from 'node:async_hooks';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { SessionUser } from '@/lib/server-auth';
import type { AskPlan, AskTurn } from '@/lib/ask';
import { spendAi } from './ai-budget';
import { featureOff } from './moderation';
import { ghidraJson } from './ghidra/brain';
import { short } from './trace';
import { UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import { askOne } from './ask';

// Ghidra's chaining steps (M432; the owner, 22 Nov: "continue with chaining steps using langgraph"; LangGraph is MIT,
// github.com/langchain-ai/langgraph). One request with several parts ("plan a trip to Goa for 3 of us and then tell my
// friends") becomes a short plan: a PLANNER splits it into at most four requests, a SPECIALIST answers each one (Ghidra's
// one-request skill, askOne in ask.ts: the guardrails, the daily AI allowance, only the asker's own data), side by side,
// and the plan comes back in order. Nothing is done here: the person approves the plan and their browser does each step
// through the app's own routes (GhidraReply). This graph is where the multi-agent supervisor grows: specialists per app.
//
// On Cloudflare, LangGraph needs AsyncLocalStorage set up once (nodejs_compat gives it).
AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new AsyncLocalStorage());

const MAX_STEPS = 4;
export { looksMultiStep } from '@/lib/ask';

/** Without AI: split on the words that join steps (never on a plain "and": "bread and milk" is one thing). */
export function splitSteps(text: string): string[] {
  return text.split(/\s*(?:;|,?\s*\band then\b|,?\s*\bthen\b|,?\s*\bafter that\b|,?\s*\bafterwards\b|,?\s*\band also\b|,?\s*\balso\b)\s*/i)
    .map((s) => s.trim().replace(/^[,.\s]+|[,.\s]+$/g, '')).filter((s) => s.length >= 3).slice(0, MAX_STEPS);
}

export const PLANNER = [
  'You split one request to UniVerse\'s assistant into the separate requests it contains, in the order they should happen.',
  `At most ${MAX_STEPS}. Each one must make sense alone: repeat what it needs from the others (a place, a number, a name).`,
  'If it is really one request, return it alone. Never add steps the person did not ask for.',
  UNTRUSTED_RULE,
].join('\n');
export const PLANNER_SCHEMA = { type: 'OBJECT', properties: { steps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['steps'] };

/** The planner: AI when it's on and allowed, otherwise the joining words. */
async function plan(u: SessionUser, text: string): Promise<string[]> {
  if (process.env.GEMINI_API_KEY && !(await featureOff('ai')) && (await spendAi(u)).ok) {
    const out = await ghidraJson<{ steps?: unknown }>('assistant', PLANNER, text, PLANNER_SCHEMA, 400, true).catch(() => null);
    const steps = Array.isArray(out?.steps) ? out.steps.map((x) => short(x, 200) ?? '').filter((x) => x.length >= 3).slice(0, MAX_STEPS) : null;
    if (steps?.length) return steps;
  }
  return splitSteps(text);
}

const State = Annotation.Root({
  text: Annotation<string>(),
  steps: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  done: Annotation<{ i: number; plan: AskPlan }[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});
type Ctx = LangGraphRunnableConfig & { configurable?: { user?: SessionUser; history?: AskTurn[] } };
const who = (config: Ctx) => {
  const u = config.configurable?.user;
  if (!u) throw new Error('no user');
  return { u, history: config.configurable?.history ?? [] };
};

const graph = new StateGraph(State)
  .addNode('planner', async (s: typeof State.State, config: Ctx) => ({ steps: await plan(who(config).u, s.text) }))
  .addNode('specialist', async (s: { i: number; step: string }, config: Ctx) => {
    const { u, history } = who(config);
    return { done: [{ i: s.i, plan: (await askOne(u, s.step, history)) as AskPlan }] };
  })
  .addEdge(START, 'planner')
  // One specialist per step, side by side (LangGraph's Send); one step only: nothing to chain.
  .addConditionalEdges('planner', (s: typeof State.State) => (s.steps.length > 1 ? s.steps.map((step, i) => new Send('specialist', { i, step })) : END), ['specialist', END])
  .addEdge('specialist', END)
  .compile();

/** The plan for a request with several parts, or null when it is really one request (then Ghidra answers it alone). */
export async function askChain(u: SessionUser, text: string, history: AskTurn[]): Promise<(AskPlan & { ai: boolean }) | null> {
  const out = await graph.invoke({ text }, { configurable: { user: u, history } });
  if (out.steps.length < 2 || out.done.length < 2) return null;
  const steps = [...out.done].sort((a, b) => a.i - b.i).map((d) => d.plan);
  const acts = steps.filter((p) => !['answer', 'show'].includes(p.action)).length;
  const say = acts ? `Here’s the plan: ${steps.length} steps. Check them, then do ${acts === 1 ? 'it' : 'them all'}.` : `Here’s what I found, in ${steps.length} parts:`;
  return { action: 'chain', say, steps, ai: true };
}
