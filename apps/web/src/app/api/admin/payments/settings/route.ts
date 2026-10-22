import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { text } from '@/server/body';
import { canSeal, open, seal } from '@/server/secret-box';

// Admin → Payments: the school's own Razorpay / Stripe keys. Secrets are encrypted before they're
// saved (src/server/secret-box.ts) and never sent back, only whether one is saved and readable.

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

  // A saved secret that can't be decrypted (SESSION_SECRET changed) counts as missing: enter it again.
  const [rzp, stripe] = await Promise.all([open(org?.razorpayKeySecret, `${auth.org.id}:razorpayKeySecret`), open(org?.stripeSecretKey, `${auth.org.id}:stripeSecretKey`)]);
  return NextResponse.json({
    paymentProvider: org?.paymentProvider || 'AUTO',
    razorpayKeyId: org?.razorpayKeyId || null,
    hasRazorpaySecret: Boolean(rzp),
    stripePublishableKey: org?.stripePublishableKey || null,
    hasStripeSecret: Boolean(stripe),
    unreadableSecret: (!!org?.razorpayKeySecret && !rzp) || (!!org?.stripeSecretKey && !stripe),
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  const provider = text(body.paymentProvider).toUpperCase();
  if (['AUTO', 'RAZORPAY', 'STRIPE'].includes(provider)) data.paymentProvider = provider;
  if (typeof body.razorpayKeyId === 'string') data.razorpayKeyId = text(body.razorpayKeyId).trim().slice(0, 100) || null;
  if (typeof body.stripePublishableKey === 'string') data.stripePublishableKey = text(body.stripePublishableKey).trim().slice(0, 300) || null;
  const rzpSecret = text(body.razorpayKeySecret).trim().slice(0, 300), stripeSecret = text(body.stripeSecretKey).trim().slice(0, 300);
  if ((rzpSecret || stripeSecret) && !canSeal()) {
    return NextResponse.json({ error: 'Payment keys can’t be saved safely yet: the server’s SESSION_SECRET isn’t set. Ask the site owner.' }, { status: 503 });
  }
  if (rzpSecret) data.razorpayKeySecret = await seal(rzpSecret, `${auth.org.id}:razorpayKeySecret`);
  if (stripeSecret) data.stripeSecretKey = await seal(stripeSecret, `${auth.org.id}:stripeSecretKey`);

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
