import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { logAiUse } from '@/server/ai-receipts';
import { featureOff } from '@/server/moderation';
import { geminiText } from '@/server/gemini';
import { guard, guardReply, UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import { HELP } from '@/lib/lab/help';
import { HYPERION_AI_MODEL, HYPERION_SYSTEM } from '@/lib/hyperion-ai';

// Hyperion's AI (M435): writes, explains and fixes MATLAB / Octave code for Hyperion. With the owner's "Hyperion's AI on
// Cloudflare" switch on: Qwen2.5-Coder 32B on Workers AI, with UniVerse's trained add-on when HYPERION_LORA names it
// (scripts/ai/hyperion-gpu.md); the add-on knows Hyperion's functions, so it gets the short instructions. Otherwise,
// and whenever Workers AI fails, Gemini answers with the list of functions. The answer's code is run by the person,
// in their own Hyperion window: nothing is run here.

const MAX = 6000;
const rich = () => `${HYPERION_SYSTEM}\nThe functions Hyperion has (use no others): ${[...HELP.keys()].join(', ')}.\n${UNTRUSTED_RULE}`;

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
function answerOf(out: unknown) {
  const o = (out && typeof out === 'object' ? out : {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const w = typeof o.response === 'string' ? o.response : o.choices?.[0]?.message?.content;
  return typeof w === 'string' ? w.trim() : '';
}

async function onCloudflare(prompt: string): Promise<string | null> {
  if (await featureOff('hyperion-ai')) return null;
  let env: { AI?: AiBinding; HYPERION_LORA?: string };
  try { env = getCloudflareContext().env as typeof env; } catch { return null; }
  if (!env.AI) return null;
  const lora = env.HYPERION_LORA?.trim();
  const system = lora ? `${HYPERION_SYSTEM}\n${UNTRUSTED_RULE}` : rich();
  try {
    const out = await env.AI.run(HYPERION_AI_MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: 1400, temperature: 0.2, ...(lora ? { lora } : {}) });
    return answerOf(out) || null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in to use Hyperion’s AI.' }, { status: 401 });
  let body: { question?: unknown; code?: unknown; error?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX) : '';
  const code = typeof body.code === 'string' ? body.code.slice(0, MAX) : '';
  const error = typeof body.error === 'string' ? body.error.slice(0, 600) : '';
  if (!question && !(code && error)) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  const g = guard(question);
  if (g) return NextResponse.json({ answer: guardReply(g) });

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });
  await logAiUse(user.id, { kind: 'assistant', detail: `Hyperion: ${question || error}` });

  const prompt = code && error
    ? `This script gives an error in Hyperion:\n\`\`\`matlab\n${code}\n\`\`\`\nThe error: ${error}\n${question ? `They also say: ${question}\n` : ''}Fix it.`
    : code ? `${question}\n\nTheir script:\n\`\`\`matlab\n${code}\n\`\`\`` : question;
  const answer = (await onCloudflare(prompt)) ?? (await geminiText(rich(), prompt, 1400));
  if (!answer) return NextResponse.json({ error: 'Hyperion’s AI can’t answer right now. Please try again soon.' }, { status: 503 });
  return NextResponse.json({ answer });
}
