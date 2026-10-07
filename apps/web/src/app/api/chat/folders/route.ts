import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// My chat folders (Stage 4 · 1.6): GET them, PUT { folders } to save them all. Kept on my account,
// so they're the same on every device. Up to 10 folders of up to 200 chats each.

interface ChatFolder { id: string; name: string; emoji: string; chatIds: string[] }

function clean(raw: unknown): ChatFolder[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).flatMap((f) => {
    const x = f as Partial<ChatFolder>;
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 24) : '';
    if (!name) return [];
    const id = typeof x.id === 'string' && /^[a-z0-9-]{1,40}$/i.test(x.id) ? x.id : crypto.randomUUID().slice(0, 8);
    const emoji = typeof x.emoji === 'string' ? [...x.emoji].slice(0, 2).join('') : '';
    const chatIds = Array.isArray(x.chatIds) ? [...new Set(x.chatIds.filter((c): c is string => typeof c === 'string' && c.length <= 40))].slice(0, 200) : [];
    return [{ id, name, emoji, chatIds }];
  });
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { chatFolders: true } });
  let folders: ChatFolder[] = [];
  try { folders = clean(JSON.parse(row?.chatFolders ?? '[]')); } catch { /* reset */ }
  return NextResponse.json({ folders }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const folders = clean((body as { folders?: unknown }).folders);
  await prisma.user.update({ where: { id: user.id }, data: { chatFolders: folders.length ? JSON.stringify(folders) : null } });
  return NextResponse.json({ folders });
}
