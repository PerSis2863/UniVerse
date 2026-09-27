'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getUserFromToken } from '@/lib/server-auth';

// Server actions are public HTTP endpoints, so every action verifies the caller's token.
// Students can only see and create (pending) payments for themselves; admins manage all.

const MAX_AMOUNT = 1_000_000;
const userSummary = { select: { id: true, name: true, email: true } } as const;

export async function createTransaction(
  token: string | null,
  data: { amount: number; description: string; status: string; userEmail: string; currency?: string },
) {
  try {
    const caller = await getUserFromToken(token);
    if (!caller) return { error: 'Please sign in again.' };

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) return { error: 'Enter a valid amount.' };
    const description = String(data.description ?? '').trim().slice(0, 200) || 'Payment';
    const currency = /^[A-Z]{3}$/.test(data.currency ?? '') ? data.currency! : 'USD';

    const isAdmin = caller.role === 'ADMIN';
    if (!isAdmin && amount < 0) return { error: 'Enter a valid amount.' };

    const target = isAdmin
      ? await prisma.user.findUnique({ where: { email: String(data.userEmail ?? '').trim().toLowerCase() } })
      : await prisma.user.findUnique({ where: { id: caller.id } });
    if (!target) return { error: 'No user found with that email.' };

    const payment = await prisma.payment.create({
      data: {
        amount,
        currency,
        description,
        // Only admins can record a payment as already paid; everyone else starts as pending.
        status: isAdmin && data.status === 'PAID' ? 'COMPLETED' : 'PENDING',
        type: 'OTHER',
        userId: target.id,
      },
    });

    revalidatePath('/admin/finances');
    return { id: payment.id };
  } catch (e: any) {
    console.error('Error creating transaction:', e);
    return { error: 'Could not save the payment. Please try again.' };
  }
}

export async function getTransactions(token: string | null) {
  const caller = await getUserFromToken(token);
  if (caller?.role !== 'ADMIN') throw new Error('Not authorized');
  return prisma.payment.findMany({
    include: { user: userSummary },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function getUserTransactions(token: string | null) {
  const caller = await getUserFromToken(token);
  if (!caller) throw new Error('Not authorized');
  return prisma.payment.findMany({
    where: { userId: caller.id },
    orderBy: { createdAt: 'desc' },
  });
}
