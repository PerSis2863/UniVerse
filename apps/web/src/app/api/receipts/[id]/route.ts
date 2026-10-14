import { NextResponse } from 'next/server';
import { getReceipt } from '@/lib/receipts';

// A completed payment's receipt for /receipt/[id] (public by its id, as the page always was: the id is
// long and random, and only what the receipt shows is returned).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getReceipt(id).catch(() => null);
  if (!t || t.status !== 'COMPLETED') return NextResponse.json({ error: 'Receipt not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(
    { id: t.id, amount: t.amount, currency: t.currency, description: t.description, createdAt: t.createdAt, user: t.user ? { name: t.user.name, email: t.user.email } : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
