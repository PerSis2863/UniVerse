import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { testApp } from '@/server/chat-apps';
import { HttpException } from '@/server/http';

// POST: sends the app a signed "ping" and says whether it answered (Admin → Chat apps → Send a test).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await testApp(auth.org.id, (await params).id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof HttpException ? e.status : 500 });
  }
}
