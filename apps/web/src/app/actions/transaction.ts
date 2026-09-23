'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export async function createTransaction(data: {
  amount: number;
  description: string;
  status: string;
  userEmail: string;
  currency?: string;
}) {
  try {
    let user = await prisma.user.findUnique({
      where: { email: data.userEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.userEmail,
          name: data.userEmail.split('@')[0],
          role: 'STUDENT',
        }
      });
    }

    const payment = await prisma.payment.create({
      data: {
        amount: data.amount,
        currency: data.currency || 'USD',
        description: data.description,
        status: data.status === 'PAID' ? 'COMPLETED' : 'PENDING',
        type: 'OTHER',
        userId: user.id,
      },
    });

    revalidatePath('/admin/finances');
    return { id: payment.id };
  } catch (e: any) {
    console.error('Error creating transaction:', e);
    return { error: e.message || 'Database error occurred' };
  }
}

export async function getTransactions() {
  return await prisma.payment.findMany({
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getUserTransactions(userEmail: string) {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getTransactionById(id: string) {
  return await prisma.payment.findUnique({
    where: { id },
    include: {
      user: true
    }
  });
}
