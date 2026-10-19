import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanPan, donationMinor, isDonationCurrency, offers80G } from '@/lib/global-impact';
import type { Body } from './body';
import { BadRequestException, NotFoundException } from './http';
import { createUnifiedPaymentOrder } from './payments/provider';

// Starting a donation (Stage 5 · Q16): a pending donation and a Stripe Checkout payment for it. The
// donor comes back to /donations, where the payment is checked with Stripe (src/server/donations.ts).

/** POST /api/impact/donations { projectId, amount, currency, anonymous?, message?, pan?, address? } */
export async function startDonation(user: SessionUser, b: Body, origin?: string) {
  const projectId = typeof b.projectId === 'string' ? b.projectId : '';
  const project = await prisma.nGOProject.findFirst({
    where: { id: projectId, isActive: true },
    select: { id: true, name: true, ngo: { select: { id: true, name: true, donationsOn: true, reg80G: true, pan: true } } },
  });
  if (!project || !project.ngo.donationsOn) throw new NotFoundException('This project isn’t taking donations here.');
  const currency = isDonationCurrency(b.currency) ? b.currency : 'INR';
  const amount = donationMinor(b.amount, currency);
  if (amount === null) throw new BadRequestException(currency === 'INR' ? 'Give between ₹10 and ₹5,00,000.' : `Give between 1 and 10,000 ${currency}.`);
  // 80G details are only kept when the receipt can use them.
  const tax = offers80G(currency, project.ngo);
  const pan = tax && b.pan ? cleanPan(b.pan) : null;
  if (tax && b.pan && !pan) throw new BadRequestException('A PAN is 5 letters, 4 digits and a letter, like ABCDE1234F.');
  const address = tax && typeof b.address === 'string' ? b.address.trim().slice(0, 300) || null : null;
  if (pan && !address) throw new BadRequestException('Add your address too: an 80G receipt needs it.');

  const donation = await prisma.donation.create({
    data: {
      projectId: project.id, ngoId: project.ngo.id, projectName: project.name, ngoName: project.ngo.name,
      donorId: user.id, donorName: user.name, donorEmail: user.email ?? null, amount, currency,
      anonymous: b.anonymous === true, message: typeof b.message === 'string' ? b.message.trim().slice(0, 300) || null : null,
      pan, address, reg80G: tax ? project.ngo.reg80G : null, ngoPan: tax ? project.ngo.pan : null,
    },
    select: { id: true },
  });
  const orgId = user.organizationId ?? (await prisma.organization.findFirst({ select: { id: true } }))?.id;
  if (!orgId) throw new BadRequestException('Donations aren’t set up for this school yet.');
  try {
    const order = await createUnifiedPaymentOrder({
      orgId, userId: user.id, amount, currency, purpose: 'DONATION', provider: 'STRIPE', returnPath: '/donations', origin,
      customerName: user.name, customerEmail: user.email ?? '', description: `Donation: ${project.name} (${project.ngo.name})`.slice(0, 200),
      metadata: { donationId: donation.id },
    });
    await prisma.donation.update({ where: { id: donation.id }, data: { orderId: order.orderId } });
    return { donationId: donation.id, checkoutUrl: order.checkoutUrl, testMode: !!order.testMode };
  } catch (e) {
    await prisma.donation.update({ where: { id: donation.id }, data: { status: 'FAILED' } });
    throw e;
  }
}
