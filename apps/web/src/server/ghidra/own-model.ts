import { getCloudflareContext } from '@opennextjs/cloudflare';
import { HYPERION_AI_MODEL, HYPERION_SYSTEM } from '@/lib/hyperion-ai';
import { HELP } from '@/lib/lab/help';
import { UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import type { SessionUser } from '@/lib/server-auth';
import { featureOff } from '../moderation';
import { spendCloudAi } from '../ai-budget';
import { AGENTS, jsonRule, jsonSchema, type AgentKind } from '../agents/playbooks';
import { ghidraJson, ghidraText } from './brain';

// UniVerse's own models on Cloudflare, part of Ghidra's brain (./brain.ts): Qwen2.5-Coder 32B on Workers AI with the
// app agents' add-on (AGENTS_LORA, trained by scripts/ai/agents-ai.py) or for Hyperion's code (with HYPERION_LORA when
// set). Each behind the owner's opt-in switch and the paid-AI daily limit (M442); on failure Gemini answers.

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
type CfEnv = { AI?: AiBinding; AGENTS_LORA?: string; HYPERION_LORA?: string };
async function cfEnv(): Promise<CfEnv | null> {
  try { return getCloudflareContext().env as CfEnv; } catch { return null; }
}
/** The owner's switch is on and today's paid-AI limit (M442) has room. */
async function cloudAllowed(who: SessionUser | null, feature: 'agents-ai' | 'hyperion-ai') {
  return !(await featureOff(feature)) && (await spendCloudAi(who));
}

/** The JSON object in a model's reply (the reply itself, or the first {...} in it), or null. */
export function jsonOf(out: unknown): Record<string, unknown> | null {
  const r = replyOf(out);
  if (r && typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>;
  if (typeof r !== 'string') return null;
  const m = /\{[\s\S]*\}/.exec(r);
  try { const v: unknown = m ? JSON.parse(m[0]) : null; return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
}
function replyOf(out: unknown): unknown {
  const o = (out && typeof out === 'object' ? out : {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  return o.response ?? o.choices?.[0]?.message?.content;
}

/** An app agent's answer (Research, Social, Support, Travel) as JSON: the agents' add-on on Cloudflare when the owner
 *  switched it on and AGENTS_LORA names it (sent exactly the words it was trained with, scripts/ai/agents-ai.py),
 *  otherwise, on failure or a missing field, Gemini. */
export async function ghidraAgent<T>(who: SessionUser | null, kind: AgentKind, prompt: string, maxTokens: number): Promise<T | null> {
  return ((await agentOnCloudflare(who, kind, prompt, maxTokens)) as T | null) ?? ghidraJson<T>(kind, AGENTS[kind].system, prompt, AGENTS[kind].schema, maxTokens, true);
}

async function agentOnCloudflare(who: SessionUser | null, kind: AgentKind, prompt: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  const env = await cfEnv();
  const lora = env?.AGENTS_LORA?.trim();
  if (!env?.AI || !lora || !(await cloudAllowed(who, 'agents-ai'))) return null;
  try {
    const out = await env.AI.run(HYPERION_AI_MODEL, {
      messages: [{ role: 'system', content: `${AGENTS[kind].system}\n${jsonRule(kind)}` }, { role: 'user', content: prompt }],
      max_tokens: maxTokens, temperature: 0.2, lora,
      response_format: { type: 'json_schema', json_schema: jsonSchema(AGENTS[kind].schema) },
    });
    const v = jsonOf(out);
    return v && AGENTS[kind].schema.required.every((k) => k in v) ? v : null;  // every required field, or Gemini
  } catch { return null; }
}

/** Hyperion's instructions with the list of its functions (the model without the add-on needs the list). */
export const hyperionRich = async () => `${HYPERION_SYSTEM}\nThe functions Hyperion has (use no others): ${[...HELP.keys()].join(', ')}.`;

/** Code for Hyperion: Qwen2.5-Coder on Cloudflare when the owner switched "Hyperion's AI on Cloudflare" on (with the
 *  add-on when HYPERION_LORA names one: it knows the functions, so it gets the short instructions), otherwise and on
 *  failure Gemini with the function list. */
export async function ghidraCode(who: SessionUser | null, prompt: string): Promise<string | null> {
  return (await codeOnCloudflare(who, prompt)) ?? ghidraText('hyperion', await hyperionRich(), prompt, 1400);
}

async function codeOnCloudflare(who: SessionUser | null, prompt: string): Promise<string | null> {
  const env = await cfEnv();
  if (!env?.AI || !(await cloudAllowed(who, 'hyperion-ai'))) return null;
  const lora = env.HYPERION_LORA?.trim();
  const system = `${lora ? HYPERION_SYSTEM : await hyperionRich()}\n${UNTRUSTED_RULE}`;
  try {
    const out = await env.AI.run(HYPERION_AI_MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 1400, temperature: 0.2, ...(lora ? { lora } : {}) });
    const w = replyOf(out);
    return (typeof w === 'string' ? w.trim() : '') || null;
  } catch { return null; }
}
