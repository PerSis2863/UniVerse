import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { deleteApp, updateApp } from '@/server/chat-apps';
import { HttpException } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };
const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof HttpException ? e.status : 500 });

// PATCH { enabled?, name?, description?, url?, commands?, permissions?, newSecret? }: changes a chat app.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const app = await updateApp(auth.org.id, id, await req.json().catch(() => ({})));
    audit(auth.user, { action: 'chat_app.updated', summary: `Changed the chat app “${app.name}”${app.enabled ? '' : ' (switched off)'}`, targetType: 'chat_app', targetId: id }, req);
    return NextResponse.json(app);
  } catch (e) {
    return fail(e);
  }
}

// DELETE: removes (uninstalls) the app; its commands stop working at once.
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const res = await deleteApp(auth.org.id, id);
    audit(auth.user, { action: 'chat_app.removed', summary: 'Removed a chat app', targetType: 'chat_app', targetId: id }, req);
    return NextResponse.json(res);
  } catch (e) {
    return fail(e);
  }
}
