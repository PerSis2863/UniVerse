import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { message, history } = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Fallback: return a mock streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const responses: Record<string, string> = {
          default: "I'm your AI Study Assistant! To enable real AI responses, add a GEMINI_API_KEY to your environment variables.",
        };
        const text = responses.default;
        let i = 0;
        const interval = setInterval(() => {
          if (i < text.length) {
            controller.enqueue(encoder.encode(text[i]));
            i++;
          } else {
            clearInterval(interval);
            controller.close();
          }
        }, 20);
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  try {
    const contents = [
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{
              text: `You are an intelligent AI Study Assistant for UniVerse, a university management platform. 
You help students with:
- Explaining academic concepts clearly
- Summarizing course notes  
- Creating study plans and schedules
- Answering questions about assignments and deadlines
- Providing motivational support
- Helping with exam preparation
Keep responses concise, friendly, and academically accurate.`
            }]
          },
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const encoder = new TextEncoder();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { controller.close(); break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const json = line.slice(6).trim();
                if (json === '[DONE]') { controller.close(); return; }
                try {
                  const parsed = JSON.parse(json);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) controller.enqueue(encoder.encode(text));
                } catch {}
              }
            }
          }
        } catch {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
