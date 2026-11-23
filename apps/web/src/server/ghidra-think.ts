import { getCloudflareContext } from '@opennextjs/cloudflare';
import { featureOff } from './moderation';
import { spendCloudAi } from './ai-budget';
import type { SessionUser } from '@/lib/server-auth';

// Ghidra thinks harder with DeepSeek (M430; the owner, 22 Nov: "use this model in the ai", DeepSeek-R1). R1 itself is too
// big to run and Cloudflare stopped hosting its smaller copy on 20 Nov 2026; its successor with the same step-by-step
// thinking, DeepSeek V4.1 Flash, runs on Cloudflare's own servers (Workers AI, the `AI` binding in wrangler.jsonc; zero
// data retention) and answers Ghidra's HARD questions: maths, code, logic. Everything else stays with Gemini. Off until
// the owner turns on "Ghidra thinks with DeepSeek" (console → Server; it costs money past Workers AI's free daily amount);
// when off, not set up, busy (20 requests a minute for the account) or failing, the answer comes from Gemini as before.
// Guardrails (src/lib/ghidra-guard.ts) run before either; its thinking is never shown, only the answer.

export const DEEPSEEK = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';

const HARD = [
  /\d\s*[-+*/×÷^=<>]\s*\d/, /\b(solve|prove|proof|calculate|compute|equation|integral|derivative|differentiate|probability|factori[sz]e|simplify|algebra|geometry|trigonometry|theorem|logic puzzle|riddle)\b/i,
  /\b(code|coding|function|bug|debug|error message|stack trace|algorithm|python|javascript|typescript|java|c\+\+|sql|regex|compile|recursion)\b/i, /```/, /\bstep[- ]by[- ]step\b/i,
];

/** Whether a question is the kind that needs careful thinking (maths, code, logic). */
export const isHard = (text: string) => HARD.some((re) => re.test(text));

/** The answer's words in one line of the stream ("data: {…}"), Workers AI's own shape or the chat-completions one; its
 *  thinking (reasoning_content) is left out. */
export function streamWords(line: string): string {
  const t = line.trim();
  if (!t.startsWith('data:')) return '';
  const body = t.slice(5).trim();
  if (!body || body === '[DONE]') return '';
  try {
    const j = JSON.parse(body) as { response?: unknown; choices?: { delta?: { content?: unknown } }[] };
    const w = typeof j.response === 'string' ? j.response : j.choices?.[0]?.delta?.content;
    return typeof w === 'string' ? w : '';
  } catch { return ''; }
}

/** The answer in a whole (non-streamed) reply. */
export function wholeAnswer(out: unknown): string {
  const o = (out && typeof out === 'object' ? out : {}) as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  const w = typeof o.response === 'string' ? o.response : o.choices?.[0]?.message?.content;
  return typeof w === 'string' ? w.trim() : '';
}

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
type Turn = { role: 'user' | 'assistant'; content: string };

async function binding(who: SessionUser | null): Promise<AiBinding | null> {
  if (await featureOff('deepseek')) return null;
  let ai: AiBinding | null;
  try { ai = (getCloudflareContext().env as { AI?: AiBinding }).AI ?? null; } catch { return null; }
  return ai && (await spendCloudAi(who)) ? ai : null;  // past today's paid-AI limit (M442): Gemini answers
}

/** DeepSeek's answer as a stream of plain text, or null (off, not set up, busy, failed): then Gemini answers. */
export async function thinkHard(who: SessionUser | null, system: string, turns: Turn[]): Promise<ReadableStream<Uint8Array> | null> {
  const ai = await binding(who);
  if (!ai) return null;
  let out: unknown;
  try { out = await ai.run(DEEPSEEK, { messages: [{ role: 'system', content: system }, ...turns], stream: true, max_tokens: 2048 }); } catch { return null; }
  if (!(out instanceof ReadableStream)) { const w = wholeAnswer(out); return w ? new Response(w).body : null; }
  let rest = '';
  const words = new TransformStream<string, string>({
    transform(chunk, c) {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      for (const l of lines) { const w = streamWords(l); if (w) c.enqueue(w); }
    },
    flush(c) { const w = streamWords(rest); if (w) c.enqueue(w); },
  });
  const text = (out as ReadableStream<Uint8Array>).pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).pipeThrough(words);
  return text.pipeThrough(new TextEncoderStream() as unknown as ReadableWritablePair<Uint8Array, string>);
}

/** DeepSeek's whole answer, or null (then Gemini's stands). For the hub's chat, which answers in one piece. */
export async function thinkHardText(who: SessionUser | null, system: string, turns: Turn[]): Promise<string | null> {
  const ai = await binding(who);
  if (!ai) return null;
  try { return wholeAnswer(await ai.run(DEEPSEEK, { messages: [{ role: 'system', content: system }, ...turns], max_tokens: 2048 })) || null; } catch { return null; }
}
