import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import prisma from '@/lib/db';
import { traceFunding, traceSubscription } from './trace-billing';

// M201: a paid top-up is added once, only for the right amount; PRO follows the subscription.
vi.mock('@/lib/db', () => ({ default: {
  traceCampaign: { findUnique: vi.fn(), update: vi.fn() },
  traceBrand: { findUnique: vi.fn(), updateMany: vi.fn() },
  traceFunding: { createMany: vi.fn() },
} }));
vi.mock('./trace', () => ({ brandOf: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn(async () => true) }));
const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const session = (over: Partial<Stripe.Checkout.Session> = {}) => ({ id: 'cs_1', payment_status: 'paid', amount_total: 5000, currency: 'eur', customer: 'cus_1', metadata: { traceCampaignId: 'c1', points: '5000' }, ...over }) as unknown as Stripe.Checkout.Session;

beforeEach(() => {
  vi.clearAllMocks();
  db.traceCampaign.findUnique.mockResolvedValue({ brandId: 'b1' });
  db.traceBrand.findUnique.mockResolvedValue({ pointValue: 0.01, currency: 'EUR' });
});

describe('Trace payments', () => {
  it('adds the points once, even when Stripe sends the event again', async () => {
    db.traceFunding.createMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('UNIQUE'));
    await traceFunding(session());
    await traceFunding(session());
    expect(db.traceCampaign.update).toHaveBeenCalledTimes(1);
    expect(db.traceCampaign.update.mock.calls[0][0].data).toEqual({ budgetPoints: { increment: 5000 } });
  });
  it('adds nothing for another amount, another currency or an unpaid session', async () => {
    await traceFunding(session({ amount_total: 100 }));
    await traceFunding(session({ currency: 'usd' }));
    await traceFunding(session({ payment_status: 'unpaid' }));
    expect(db.traceFunding.createMany).not.toHaveBeenCalled();
  });
  it('makes a brand PRO while its subscription runs, and FREE when it ends', async () => {
    const sub = (status: string) => ({ id: 'sub_1', status, customer: 'cus_1', metadata: { traceBrandId: 'b1' } }) as unknown as Stripe.Subscription;
    expect(await traceSubscription(sub('active'))).toBe(true);
    expect(db.traceBrand.updateMany.mock.calls[0][0].data.plan).toBe('PRO');
    await traceSubscription(sub('canceled'));
    expect(db.traceBrand.updateMany.mock.calls[1][0].data).toMatchObject({ plan: 'FREE', stripeSubscriptionId: null });
    expect(await traceSubscription({ metadata: {} } as unknown as Stripe.Subscription)).toBe(false);
  });
});
