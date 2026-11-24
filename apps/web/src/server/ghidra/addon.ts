import { getCloudflareContext } from '@opennextjs/cloudflare';
import { jsonSchema } from '../agents/playbooks';
import { featureOff } from '../moderation';
import { spendCloudAi } from '../ai-budget';
import { setOwnModel } from './brain';
import { SKILLS, type SkillId } from './skills';
import { ADDON_SKILLS } from './addon-skills';

// Ghidra's own add-on (M451; STAGE-5-PLAN.md, "Ghidra, the one AI", step 4): for the skills where it passed more of the
// exam than the model without it (./addon-skills.ts, from the training run's wins.json), the brain asks UniVerse's own
// model on Cloudflare with the add-on GHIDRA_LORA first; anything else, a failure or a missing field goes to Gemini as
// before. Behind the owner's switch "Ghidra's own add-on" (off) and the paid-AI daily limit (M442). The skills with their
// own Cloudflare path (the agents, Hyperion: SKILLS[id].own) keep it. Registered with the brain when the API loads
// (src/server/app.ts, src/server/assignments.ts), so the brain itself stays light.

const MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';  // the add-on's base (scripts/ai/ghidra-ai.py)
interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

/** The text of a Workers AI reply, or its first {...} parsed when a schema was asked. */
function reply(out: unknown, schema: object | null): unknown {
  const o = (out && typeof out === 'object' ? out : {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const r = o.response ?? o.choices?.[0]?.message?.content;
  if (!schema) return typeof r === 'string' && r.trim() ? r.trim() : null;
  if (r && typeof r === 'object' && !Array.isArray(r)) return r;
  const m = typeof r === 'string' ? /\{[\s\S]*\}/.exec(r) : null;
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

export const addonFor = (skill: SkillId) => ADDON_SKILLS.includes(skill) && !('own' in SKILLS[skill]);

setOwnModel(async (skill, system, prompt, schema, maxTokens) => {
  if (!addonFor(skill)) return null;
  let env: { AI?: AiBinding; GHIDRA_LORA?: string } | null = null;
  try { env = getCloudflareContext().env as typeof env; } catch { return null; }
  const lora = env?.GHIDRA_LORA?.trim();
  if (!env?.AI || !lora || (await featureOff('ghidra-addon')) || !(await spendCloudAi(null))) return null;
  const rule = schema ? `\nReply with only one JSON object, no other text, matching this JSON Schema: ${JSON.stringify(jsonSchema(schema))}` : '';
  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: system + rule }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.2, lora,
      ...(schema ? { response_format: { type: 'json_schema', json_schema: jsonSchema(schema) } } : {}),
    });
    const v = reply(out, schema);
    const required = ((schema as { required?: string[] } | null)?.required ?? []);
    return v && (!schema || required.every((k) => k in (v as object))) ? v : null;
  } catch { return null; }
});
