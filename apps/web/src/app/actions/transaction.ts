'use server';

import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export async function createTransaction(data: {
  amount: number;
  description: string;
  status: string;
  userEmail: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: data.userEmail },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const transaction = await prisma.transaction.create({
    data: {
      amount: data.amount,
      description: data.description,
      status: data.status,
      userId: user.id,
    },
  });

  revalidatePath('/admin/finances');
  return transaction;
}

export async function getTransactions() {
  return await prisma.transaction.findMany({
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

  return await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
