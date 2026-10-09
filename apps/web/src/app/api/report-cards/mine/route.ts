import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { myCards } from '@/server/report-cards';

// GET: the signed-in student's published report cards (Grades page).
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  return NextResponse.json({ cards: user.role === 'STUDENT' ? await myCards(user.id) : [] }, { headers: { 'Cache-Control': 'no-store' } });
}
