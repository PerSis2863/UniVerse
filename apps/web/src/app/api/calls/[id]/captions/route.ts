import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { callAccess } from '@/server/calls';
import { AiLimitError } from '@/server/ai-budget';
import { featureOff } from '@/server/moderation';
import { isLanguage, translateCaptions } from '@/server/translate';

type Ctx = { params: Promise<{ id: string }> };

// POST { to, lines: [{ id, text }] }: translated live captions (Stage 4 · 4.1) for a reader the call
// room asked, when their browser can't translate on the device. Only for people in the call.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const to = typeof b.to === 'string' ? b.to : '';
  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .slice(0, 12)
    .map((l: { id?: unknown; text?: unknown }) => ({ id: String(l?.id ?? '').slice(0, 40), text: String(l?.text ?? '').trim() }))
    .filter((l: { id: string; text: string }) => l.id && l.text);
  if (!isLanguage(to) || !lines.length) return NextResponse.json({ error: 'Nothing to translate.' }, { status: 400 });
  try {
    await callAccess(id, user);
  } catch {
    return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
  }
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return NextResponse.json({ error: 'Translation isn’t available right now.' }, { status: 503 });
  try {
    return NextResponse.json({ items: await translateCaptions(id, lines, to) });
  } catch (e) {
    if (e instanceof AiLimitError) return NextResponse.json({ error: 'Translated captions have reached today’s limit for this call. Chrome or Edge on a computer translate on the device, without a limit.' }, { status: 429 });
    throw e;
  }
}
