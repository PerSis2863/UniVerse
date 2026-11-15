import type Stripe from 'stripe';
import prisma from '@/lib/db';
import { getStripe } from '@/lib/billing';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { brandOf } from './trace';

// M201: Trace brands pay by themselves, through the platform owner's Stripe account, while the owner's
// "Trace payments" switch is on (console → Server; off by default):
//  - PRO: a monthly subscription at TRACE_PRO_PRICE_CENTS (US cents, set in Cloudflare). The webhook
//    sets the plan from the subscription's state, and "Manage billing" opens Stripe's own page.
//  - A campaign's budget: points bought at the brand's own point value, in its currency. Each paid
//    Checkout session is recorded once (trace_fundings), so a resent webhook can't add it twice.
// Prices are decided here, never taken from the browser.

const MIN_POINTS = 100, MAX_POINTS = 1_000_000;

async function ready(user: SessionUser) {
  if (await featureOff('trace-payments')) throw new BadRequestException('Paying here isn’t open yet. Ask UniVerse’s team.');
  const stripe = getStripe();
  if (!stripe) throw new BadRequestException('Payments aren’t set up yet.');
  const brand = await brandOf(user);
  const me = await prisma.traceBrandMember.findFirst({ where: { brandId: brand.id, userId: user.id }, select: { role: true } });
  if (me?.role !== 'OWNER' && me?.role !== 'ADMIN') throw new ForbiddenException('Only the brand’s owners pay for it.');
  return { stripe, brand };
}

/** POST /api/trace/billing { kind: 'pro' } or { kind: 'campaign', campaignId, points }: a Stripe Checkout address. */
export async function traceCheckout(user: SessionUser, b: Record<string, unknown>, origin: string) {
  const { stripe, brand } = await ready(user);
  if (b.kind === 'pro') {
    const cents = Number(process.env.TRACE_PRO_PRICE_CENTS);
    if (!Number.isInteger(cents) || cents < 100) throw new BadRequestException('Trace PRO has no price yet. Ask UniVerse’s team.');
    if (brand.plan === 'PRO' && brand.stripeSubscriptionId) throw new BadRequestException('Your brand is already PRO. Use “Manage billing” to change it.');
    const meta = { traceBrandId: brand.id };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: brand.stripeCustomerId ?? undefined, customer_email: brand.stripeCustomerId ? undefined : user.email,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: cents, recurring: { interval: 'month' }, product_data: { name: 'UniVerse Trace PRO' } } }],
      metadata: meta, subscription_data: { metadata: meta },
      success_url: `${origin}/trace?paid=pro`, cancel_url: `${origin}/trace`,
    });
    return { url: session.url };
  }
  if (b.kind === 'campaign') {
    const campaign = await prisma.traceCampaign.findFirst({ where: { id: typeof b.campaignId === 'string' ? b.campaignId : '', brandId: brand.id }, select: { id: true, title: true } });
    if (!campaign) throw new NotFoundException('That campaign isn’t your brand’s.');
    const points = Math.round(Number(b.points));
    if (!Number.isFinite(points) || points < MIN_POINTS || points > MAX_POINTS) throw new BadRequestException(`Add between ${MIN_POINTS} and ${MAX_POINTS.toLocaleString()} points.`);
    const amount = Math.round(points * brand.pointValue * 100);
    if (amount < 50) throw new BadRequestException('That’s too little to pay by card: add more points.');
    const meta = { traceCampaignId: campaign.id, points: String(points) };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', customer: brand.stripeCustomerId ?? undefined, customer_email: brand.stripeCustomerId ? undefined : user.email,
      line_items: [{ quantity: 1, price_data: { currency: brand.currency.toLowerCase(), unit_amount: amount, product_data: { name: `${points.toLocaleString()} points for “${campaign.title.slice(0, 80)}”` } } }],
      metadata: meta, payment_intent_data: { metadata: meta },
      success_url: `${origin}/trace?tab=campaigns&paid=campaign`, cancel_url: `${origin}/trace?tab=campaigns`,
    });
    return { url: session.url };
  }
  throw new BadRequestException('Unknown payment.');
}

/** POST /api/trace/billing/portal: Stripe's own page to change or cancel PRO and see invoices. */
export async function tracePortal(user: SessionUser, origin: string) {
  const { stripe, brand } = await ready(user);
  if (!brand.stripeCustomerId) throw new BadRequestException('Nothing to manage yet.');
  const s = await stripe.billingPortal.sessions.create({ customer: brand.stripeCustomerId, return_url: `${origin}/trace` });
  return { url: s.url };
}

/** From the Stripe webhook: a Trace PRO subscription changed. True when it was one. */
export async function traceSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const brandId = sub.metadata?.traceBrandId;
  if (!brandId) return false;
  const on = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await prisma.traceBrand.updateMany({ where: { id: brandId }, data: { plan: on ? 'PRO' : 'FREE', stripeCustomerId: customer, stripeSubscriptionId: on ? sub.id : null } });
  return true;
}

/** From the Stripe webhook: a paid campaign top-up, added to the budget once. True when it was one. */
export async function traceFunding(session: Stripe.Checkout.Session): Promise<boolean> {
  const campaignId = session.metadata?.traceCampaignId;
  if (!campaignId) return false;
  if (session.payment_status !== 'paid') return true;
  const points = Math.round(Number(session.metadata?.points));
  const campaign = await prisma.traceCampaign.findUnique({ where: { id: campaignId }, select: { brandId: true } });
  if (!campaign || !Number.isFinite(points) || points <= 0) return true;
  // The amount must be what this many points cost the brand (nothing changed in between).
  const brand = await prisma.traceBrand.findUnique({ where: { id: campaign.brandId }, select: { pointValue: true, currency: true } });
  if (!brand || session.amount_total !== Math.round(points * brand.pointValue * 100) || (session.currency ?? '').toLowerCase() !== brand.currency.toLowerCase()) return true;
  // Claimed first (one row a session): a resent event adds nothing.
  const fresh = await prisma.traceFunding.createMany({ data: [{ sessionId: session.id, campaignId, points, amount: session.amount_total, currency: brand.currency }] }).then((r) => r.count, () => 0);
  if (fresh) await prisma.traceCampaign.update({ where: { id: campaignId }, data: { budgetPoints: { increment: points } } });
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customer) await prisma.traceBrand.updateMany({ where: { id: campaign.brandId, stripeCustomerId: null }, data: { stripeCustomerId: customer } });
  return true;
}
