import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { logAiUse } from '@/server/ai-receipts';
import { withTextModels } from '@/server/ai-models';
import { MATH_RULE } from '@/lib/tutor-rules';
import { guard, guardReply, UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import { SAFETY } from '@/server/gemini';
import { isHard, thinkHard } from '@/server/ghidra-think';

// The models come from the owner's chain (owner console → Server → AI models): when one is busy
// or missing, the next answers (src/server/ai-models.ts).

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 8;

// Ghidra (M426, the owner: "people can ask anything and ghidra can do different kind of task"): a general assistant
// under UniVerse's own name. Its actions in the apps go through POST /ask (src/server/ask.ts), each confirmed by a tap.
const SYSTEM_PROMPT = `You are Ghidra, UniVerse's own AI assistant. People can ask you anything, as they would any
general-purpose assistant: explain any topic at the level they need, answer questions, write and improve texts (emails,
essays, messages, posts, CVs), summarise, translate, brainstorm, plan (study, trips, events, projects), solve maths
step by step, and write, explain and fix code (in fenced code blocks with the language named).
How to answer: clear and warm; as long as the question needs and no longer; short paragraphs; plain text (lists as lines
starting with "- ", no ** or # marks; code between lines of three backticks); say when you
are not sure, and never invent facts, sources or the person's own data (their marks, deadlines, trips or messages:
tell them to ask you "what's due", "my courses" or "my trips", which reads their real data).
Many people here are students, some under 18: keep answers suitable for them. With graded schoolwork, help them learn
and do it themselves (explain, give hints, check their work) rather than handing over finished work to submit.
Refuse anything harmful, dangerous or illegal, kindly. Health, legal or money questions: give general information and
suggest a qualified person. If anyone may be in danger, tell them to call the local emergency number first (112 in Europe
and India, 911 in North America).
About yourself: you are Ghidra, made by UniVerse. If someone asks which company's technology you run on, say UniVerse's
AI currently uses Google's models, as UniVerse's privacy policy explains; never claim to be another company's assistant.
${UNTRUSTED_RULE}
${MATH_RULE}`;

function plainTextStream(text: string) {
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function callGemini(model: string, apiKey: string, contents: unknown) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        safetySettings: SAFETY,
      }),
    },
  );
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to use the AI assistant.' }, { status: 401 });
  }

  let payload: { message?: unknown; history?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  // M429: someone in crisis or in danger gets the safe, human answer first, with or without AI (src/lib/ghidra-guard.ts).
  const g = guard(message);
  if (g) return plainTextStream(guardReply(g));

  const apiKey = process.env.GEMINI_API_KEY;
  const cannot = () => plainTextStream("I'm Ghidra, your UniVerse assistant! I can't answer that kind of question yet, but I can show what's due, how you're doing in Green, do things in any app for you, and answer how to use UniVerse.");
  // M430: maths, code and logic go to DeepSeek when the owner has it on (src/server/ghidra-think.ts); otherwise Gemini.
  const hard = isHard(message);
  if (!apiKey && !hard) return cannot();

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });
  await logAiUse(user.id, { kind: 'assistant', detail: message }); // the person's own record (Stage 5 · D12)

  const history = Array.isArray(payload.history) ? payload.history.slice(-MAX_HISTORY) : [];
  const contents = [
    ...history
      .filter((m): m is { role: string; content: string } => !!m && typeof (m as { content?: unknown }).content === 'string' && ((m as { content: string }).content).trim() !== '')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.slice(0, MAX_MESSAGE_CHARS) }],
      })),
    { role: 'user', parts: [{ text: message }] },
  ];

  if (hard) {
    const turns = contents.map((c) => ({ role: c.role === 'model' ? 'assistant' as const : 'user' as const, content: c.parts[0].text }));
    const deep = await thinkHard(SYSTEM_PROMPT, turns);
    if (deep) return new Response(deep, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (!apiKey) return cannot();

  try {
    const res = await withTextModels(false, (model) => callGemini(model, apiKey, contents));
    if (!res || !res.ok || !res.body) {
      console.error(`Gemini API error: ${res?.status}`);
      if (res?.status === 429) return NextResponse.json({ error: 'Lots of people are asking Ghidra right now. Please try again in a minute.' }, { status: 503, headers: { 'Retry-After': '60' } });
      return NextResponse.json({ error: 'Ghidra can’t answer that right now. Please try again soon.' }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const json = line.slice(6).trim();
              if (!json || json === '[DONE]') continue;
              try {
                const parsed = JSON.parse(json);
                const parts = parsed.candidates?.[0]?.content?.parts ?? [];
                for (const part of parts) {
                  // Skip internal "thought" parts that some models stream.
                  if (typeof part?.text === 'string' && !part.thought) controller.enqueue(encoder.encode(part.text));
                }
              } catch {
                /* ignore keep-alive / partial lines */
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (e) {
    console.error('AI route failed', e);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
