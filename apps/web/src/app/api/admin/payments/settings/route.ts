import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: auth.org.id },
    select: {
      paymentProvider: true,
      razorpayKeyId: true,
      stripePublishableKey: true,
      // Secrets are masked for security
      razorpayKeySecret: true,
      stripeSecretKey: true,
    },
  });

  return NextResponse.json({
    paymentProvider: org?.paymentProvider || 'AUTO',
    razorpayKeyId: org?.razorpayKeyId || null,
    hasRazorpaySecret: Boolean(org?.razorpayKeySecret),
    stripePublishableKey: org?.stripePublishableKey || null,
    hasStripeSecret: Boolean(org?.stripeSecretKey),
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.paymentProvider === 'string') {
    const p = body.paymentProvider.toUpperCase();
    if (['AUTO', 'RAZORPAY', 'STRIPE'].includes(p)) data.paymentProvider = p;
  }

  if (typeof body.razorpayKeyId === 'string') data.razorpayKeyId = body.razorpayKeyId.trim() || null;
  if (typeof body.razorpayKeySecret === 'string' && body.razorpayKeySecret.trim()) {
    data.razorpayKeySecret = body.razorpayKeySecret.trim();
  }
  if (typeof body.stripePublishableKey === 'string') data.stripePublishableKey = body.stripePublishableKey.trim() || null;
  if (typeof body.stripeSecretKey === 'string' && body.stripeSecretKey.trim()) {
    data.stripeSecretKey = body.stripeSecretKey.trim();
  }

  const updated = await prisma.organization.update({
    where: { id: auth.org.id },
    data,
    select: {
      paymentProvider: true,
      razorpayKeyId: true,
      stripePublishableKey: true,
    },
  });

  audit(
    auth.user,
    {
      action: 'organization.payment_settings_updated',
      summary: `Updated institution payment gateway settings (Provider: ${updated.paymentProvider})`,
      targetType: 'organization',
      targetId: auth.org.id,
    },
    req,
  );

  return NextResponse.json(updated);
}
