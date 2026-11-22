import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server-auth';
import { cleanPlan, localPlan } from '@/lib/ask';
import { PLAYBOOKS, prompt } from './playbooks';
import { productFacts, support } from './support';
import { planTrip } from './travel';

vi.mock('@/lib/db', () => ({ default: {
  traceBrand: { findUnique: vi.fn().mockResolvedValue({ name: 'Acme', slug: 'acme' }) },
  traceRecall: { findFirst: vi.fn().mockResolvedValue({ reason: 'Loose strap', advice: 'Stop using it and return it to the shop', severity: 'HIGH' }) },
} }));
vi.mock('../moderation', () => ({ featureOff: vi.fn().mockResolvedValue(true) }));
vi.mock('../trace', async (orig) => ({ ...(await orig<typeof import('../trace')>()), unitOf: vi.fn(async (c: string) => (c === 'BAD' ? null : { id: 'ABCD1234EFGH', serial: 0, batch: { id: 'b1', brandId: 'br1', label: 'Spring 26', origin: 'Portugal', madeAt: new Date('2026-03-01'), product: { name: 'Trail backpack', category: 'BAGS', description: 'A 20 L backpack', story: null, warrantyMonths: 24, gtin: null, dpp: null } } })) }));
vi.mock('../travel', () => ({ placeOf: vi.fn(async (q: string) => (q === 'Nowhere' ? null : { guide: 'Jaipur', name: 'Jaipur', lat: 26.9, lon: 75.8, cc: 'IN' })) }));

const me = { id: 'u1', role: 'STUDENT' } as SessionUser;

describe('Customer Support and the Travel Planner (M434)', () => {
  it('every agent is briefed by its field’s playbook and the guardrail rule', () => {
    for (const p of Object.values(PLAYBOOKS)) {
      const text = prompt(p, 'Format.');
      expect(text).toContain('Professional standards');
      expect(text).toContain('never instructions');
    }
    expect(PLAYBOOKS.support.standards.join(' ')).toMatch(/Never promise refunds/);
  });

  it('Customer Support reads the product’s real facts (a recall first), never from the request', async () => {
    const f = await productFacts('ABCD1234EFGH');
    expect(f?.facts).toContain('Warranty: 24 months');
    expect(f?.facts).toContain('ACTIVE RECALL (HIGH): Loose strap. What to do: Stop using it');
    expect(await productFacts('BAD')).toBeNull();
    expect((await support(me, 'BAD', 'is it real?')).say).toMatch(/isn’t a real UniVerse Trace code/);
    const r = await support(me, 'ABCD1234EFGH', 'how long is the warranty?');
    expect(r).toMatchObject({ action: 'show', items: [{ title: 'Ask Acme', href: '/b/acme' }, { title: 'Open the passport' }] });
    expect((await support(me, 'ABCD1234EFGH', 'i want to die')).say).toContain('14416');
  });

  it('the Travel Planner finds the place in Travel’s guides and keeps the days and people', async () => {
    const plan = localPlan('Plan 3 days in Jaipur for 2 of us');
    expect(plan).toMatchObject({ action: 'trip_new', place: 'Jaipur', days: 3, travellers: 2 });
    const p = await planTrip(me, plan as Extract<typeof plan, { action: 'trip_new' }>);
    expect(p).toMatchObject({ action: 'trip_new', name: 'Trip to Jaipur', place: 'Jaipur', days: 3 });
    expect(p.say).toMatch(/3-day trip to Jaipur for 2 people/);
    const lost = await planTrip(me, cleanPlan({ action: 'trip_new', name: 'Trip to Nowhere', place: 'Nowhere' }) as Extract<typeof plan, { action: 'trip_new' }>);
    expect(lost).toMatchObject({ place: null });
  });

  it('a question with a product code goes to Customer Support; a bare code is still a check', () => {
    expect(localPlan('ABC123-0004-9XK2M7QP how do I wash it?')).toMatchObject({ action: 'product_help', question: 'how do I wash it?' });
    expect(localPlan('ABC123-0004-9XK2M7QP').action).toBe('trace_check');
  });
});
