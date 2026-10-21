import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { createApp, listApps } from '@/server/chat-apps';
import { HttpException } from '@/server/http';

// Chat apps of the admin's school (Stage 5 · Q20, src/server/chat-apps.ts). GET: the apps.
// POST { name, description?, url, commands: [{ name, hint }], permissions }: adds one; its signing
// secret is in this answer only.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await listApps(auth.org.id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const app = await createApp(auth.org.id, auth.user.id, await req.json().catch(() => ({})));
    audit(auth.user, { action: 'chat_app.created', summary: `Added the chat app “${app.name}” (${app.commands.map((c) => `/${c.name}`).join(', ')})`, targetType: 'chat_app', targetId: app.id }, req);
    return NextResponse.json(app, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof HttpException ? e.status : 500 });
  }
}
