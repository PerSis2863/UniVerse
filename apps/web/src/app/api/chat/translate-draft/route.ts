import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { isLanguage, translateDraft } from '@/server/translate';

// POST { text, to }: translate a message before sending it (nothing is stored).
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write something to translate.' }, { status: 400 });
  if (!isLanguage(body.to)) return NextResponse.json({ error: 'Choose a language.' }, { status: 400 });
  const out = await translateDraft(text, body.to);
  if (!out) return NextResponse.json({ error: process.env.GEMINI_API_KEY ? 'Translation is unavailable right now.' : 'Translation isn’t set up yet.' }, { status: 503 });
  return NextResponse.json(out);
}
