import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// My saved replies and message templates (Stage 4 · 1.9): GET them, PUT { snippets } to save them
// all. Kept on my account, the same on every device. Up to 50, each with a title, the text (which
// may hold {name} and {date}, filled in when used) and an optional shortcut typed as "/shortcut".

interface Snippet { id: string; title: string; body: string; shortcut: string | null }
const MAX = 50;

function clean(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, MAX).flatMap((s) => {
    const x = s as Partial<Snippet>;
    const title = typeof x.title === 'string' ? x.title.trim().slice(0, 60) : '';
    const body = typeof x.body === 'string' ? x.body.trim().slice(0, 2000) : '';
    if (!title || !body) return [];
    const id = typeof x.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(x.id) ? x.id : crypto.randomUUID().slice(0, 8);
    let shortcut = typeof x.shortcut === 'string' ? x.shortcut.trim().toLowerCase().replace(/^\//, '').replace(/[^a-z0-9-]/g, '').slice(0, 20) : '';
    if (shortcut && seen.has(shortcut)) shortcut = '';
    if (shortcut) seen.add(shortcut);
    return [{ id, title, body, shortcut: shortcut || null }];
  });
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { chatSnippets: true } });
  let snippets: Snippet[] = [];
  try { snippets = clean(JSON.parse(row?.chatSnippets ?? '[]')); } catch { /* reset */ }
  return NextResponse.json({ snippets, max: MAX }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const raw = (body as { snippets?: unknown }).snippets;
  if (Array.isArray(raw) && raw.length > MAX) return NextResponse.json({ error: `You can keep up to ${MAX} saved replies.` }, { status: 400 });
  const snippets = clean(raw);
  await prisma.user.update({ where: { id: user.id }, data: { chatSnippets: snippets.length ? JSON.stringify(snippets) : null } });
  return NextResponse.json({ snippets, max: MAX });
}
