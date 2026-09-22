'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

// Documents
export async function getAdminDocuments() {
  const documents = await prisma.studentDocument.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
  });
  return documents;
}

export async function createAdminDocument(data: any) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  
  // Note: we assume the user provides a real user ID in the form, 
  // or we default to the admin's own ID if none is provided for school docs
  await prisma.studentDocument.create({
    data: {
      title: data.title,
      userId: data.userId || userId,
      type: 'OTHER',
      fileUrl: data.fileUrl || '',
      isVerified: data.status === 'Published',
      issuedAt: data.date ? new Date(data.date) : null,
    } as any
  });
  revalidatePath('/admin/administrative');
}

export async function deleteAdminDocument(id: string) {
  await prisma.studentDocument.delete({ where: { id } });
  revalidatePath('/admin/administrative');
}

// Invoices (Billing)
export async function getAdminInvoices() {
  const invoices = await prisma.invoice.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
  });
  return invoices;
}

export async function createAdminInvoice(data: any) {
  const { userId } = auth();
  if (!userId) throw new Error('Unauthorized');
  
  const student = await prisma.user.findFirst({ where: { id: data.studentId } }) || 
                  await prisma.user.findFirst({ where: { role: 'STUDENT' } });
                  
  if (!student) throw new Error('Student not found');

  await prisma.invoice.create({
    data: {
      userId: student.id,
      number: `INV-${Date.now()}`,
      amount: data.amount,
      description: data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status === 'Paid' ? 'PAID' : data.status === 'Overdue' ? 'OVERDUE' : 'PENDING',
      items: [],
    }
  });
  revalidatePath('/admin/administrative');
}

export async function deleteAdminInvoice(id: string) {
  await prisma.invoice.delete({ where: { id } });
  revalidatePath('/admin/administrative');
}

// Scholarships
export async function getAdminScholarships() {
  const scholarships = await prisma.scholarship.findMany({
    include: {
      _count: { select: { applications: true } }
    },
    orderBy: { createdAt: 'desc' },
  });
  return scholarships;
}

export async function createAdminScholarship(data: any) {
  await prisma.scholarship.create({
    data: {
      name: data.name,
      amount: data.amount,
      deadline: data.deadline ? new Date(data.deadline) : null,
      isActive: data.status === 'Open',
    }
  });
  revalidatePath('/admin/administrative');
}

export async function deleteAdminScholarship(id: string) {
  await prisma.scholarship.delete({ where: { id } });
  revalidatePath('/admin/administrative');
}
