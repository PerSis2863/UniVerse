import { getCloudflareContext } from '@opennextjs/cloudflare';
import { HYPERION_AI_MODEL } from '@/lib/hyperion-ai';
import { featureOff } from '../moderation';
import { spendCloudAi } from '../ai-budget';
import type { SessionUser } from '@/lib/server-auth';
import { geminiJson } from '../gemini';
import { AGENTS, jsonRule, jsonSchema, type AgentKind } from './playbooks';

// The app agents' own model (M437; the owner, 23 Nov: "train the ai so that it can work in different sectors… customer
// support, travel planner…"): Qwen2.5-Coder 32B on Cloudflare (the model Hyperion's AI uses, which also takes add-ons)
// with UniVerse's agents add-on, trained on a rented graphics card on answers that passed each agent's rules
// (scripts/ai/agents-ai.py). Used only with the owner's "Agents' own AI on Cloudflare" switch on and AGENTS_LORA naming
// the uploaded add-on; otherwise, and whenever it fails or answers out of shape, Gemini answers as before.

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

/** The JSON object in a model's reply (the reply itself, or the first {...} in it), or null. */
export function jsonOf(out: unknown): Record<string, unknown> | null {
  const o = (out && typeof out === 'object' ? out : {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const r = o.response ?? o.choices?.[0]?.message?.content;
  if (r && typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>;
  if (typeof r !== 'string') return null;
  const m = /\{[\s\S]*\}/.exec(r);
  try { const v: unknown = m ? JSON.parse(m[0]) : null; return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
}

async function onCloudflare(who: SessionUser | null, kind: AgentKind, prompt: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  let env: { AI?: AiBinding; AGENTS_LORA?: string };
  try { env = getCloudflareContext().env as typeof env; } catch { return null; }
  const lora = env.AGENTS_LORA?.trim();
  if (!env.AI || !lora || (await featureOff('agents-ai')) || !(await spendCloudAi(who))) return null;
  try {
    const out = await env.AI.run(HYPERION_AI_MODEL, {
      messages: [{ role: 'system', content: `${AGENTS[kind].system}\n${jsonRule(kind)}` }, { role: 'user', content: prompt }],
      max_tokens: maxTokens, temperature: 0.2, lora,
      response_format: { type: 'json_schema', json_schema: jsonSchema(AGENTS[kind].schema) },
    });
    const v = jsonOf(out);
    // every required field present, or Gemini answers instead
    return v && AGENTS[kind].schema.required.every((k) => k in v) ? v : null;
  } catch { return null; }
}

/** An agent's answer as JSON: its own model on Cloudflare when switched on, otherwise (or on failure) Gemini. */
export async function agentJson<T>(who: SessionUser | null, kind: AgentKind, prompt: string, maxTokens: number): Promise<T | null> {
  return ((await onCloudflare(who, kind, prompt, maxTokens)) as T | null) ?? geminiJson<T>(AGENTS[kind].system, prompt, AGENTS[kind].schema, maxTokens, true);
}
