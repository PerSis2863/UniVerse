import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { spendAi } from '@/server/ai-budget';
import { withTextModels } from '@/server/ai-models';

// The models come from the owner's chain (owner console → Server → AI models): when one is busy
// or missing, the next answers (src/server/ai-models.ts).

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 8;

const SYSTEM_PROMPT = `You are an intelligent AI Study Assistant for UniVerse, a university and social-impact platform.
You help students with:
- Explaining academic concepts clearly
- Summarizing course notes
- Creating study plans and schedules
- Answering questions about assignments and deadlines
- Providing motivational support
- Helping with exam preparation
Keep responses concise, friendly, and academically accurate. If you don't know something about the
student's specific courses or deadlines, say so instead of guessing.`;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return plainTextStream("I'm your AI Study Assistant! The assistant isn't configured yet — an administrator needs to add a GEMINI_API_KEY in the hosting settings.");
  }

  const spend = await spendAi(user);
  if (!spend.ok) return NextResponse.json({ error: spend.message, code: 'ai-limit' }, { status: 429 });

  const history = Array.isArray(payload.history) ? payload.history.slice(-MAX_HISTORY) : [];
  const contents = [
    ...history
      .filter((m): m is { role: string; content: string } => !!m && typeof (m as any).content === 'string' && (m as any).content.trim() !== '')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.slice(0, MAX_MESSAGE_CHARS) }],
      })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const res = await withTextModels(false, (model) => callGemini(model, apiKey, contents));
    if (!res || !res.ok || !res.body) {
      console.error(`Gemini API error: ${res?.status}`);
      if (res?.status === 429) return NextResponse.json({ error: 'Lots of people are using the assistant right now. Please try again in a minute.' }, { status: 503, headers: { 'Retry-After': '60' } });
      return NextResponse.json({ error: 'The AI assistant is temporarily unavailable.' }, { status: 502 });
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
