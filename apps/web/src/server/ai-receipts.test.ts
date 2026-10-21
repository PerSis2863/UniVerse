import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { logAiUse, makeReceipt, receiptForSubmission } from './ai-receipts';

vi.mock('@/lib/db', () => ({ default: { aiUse: { create: vi.fn(), findMany: vi.fn() } } }));
vi.mock('@/lib/course-access', () => ({ courseAccess: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as { aiUse: { create: Fn; findMany: Fn } };
const set = new Date('2026-10-01T09:00:00Z');
const a = (aiPolicy: string) => ({ courseId: 'c1', createdAt: set, aiPolicy });
const rows = [{ kind: 'tutor', detail: 'What is a quantum?', courseId: 'c1', createdAt: new Date('2026-10-02T10:00:00Z') }, { kind: 'writing', detail: 'Improve in “Essay”', courseId: null, createdAt: new Date('2026-10-03T11:00:00Z') }];

describe('AI receipts on the server (Stage 5 · D12)', () => {
  beforeEach(() => { vi.clearAllMocks(); db.aiUse.findMany.mockResolvedValue(rows); });

  it('records AI help with a short excerpt, never failing the help itself', async () => {
    await logAiUse('u1', { kind: 'tutor', detail: `  What is\n${'x'.repeat(300)}`, courseId: 'c1' });
    const data = db.aiUse.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'u1', kind: 'tutor', courseId: 'c1' });
    expect(data.detail.length).toBe(140);
    db.aiUse.create.mockRejectedValueOnce(new Error('db down'));
    await expect(logAiUse('u1', { kind: 'assistant', detail: 'hi' })).resolves.toBeUndefined();
    await logAiUse('cc:call1', { kind: 'voice' });
    await logAiUse(null, { kind: 'voice' });
    expect(db.aiUse.create).toHaveBeenCalledTimes(2);
  });

  it('builds the receipt from the student’s own record since the assignment was set, in its course', async () => {
    const json = await receiptForSubmission('u1', a('RECEIPT'), { attach: true, note: ' Outline from the tutor ', uses: [{ kind: 'fake' }] }, false);
    const r = JSON.parse(json!);
    expect(r).toMatchObject({ policy: 'RECEIPT', attached: true, declaredNone: false, note: 'Outline from the tutor', since: set.toISOString() });
    expect(r.uses).toEqual([
      { kind: 'tutor', detail: 'What is a quantum?', at: '2026-10-02T10:00:00.000Z', courseId: 'c1' },
      { kind: 'writing', detail: 'Improve in “Essay”', at: '2026-10-03T11:00:00.000Z', courseId: null },
    ]);
    const where = db.aiUse.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', createdAt: { gte: set }, OR: [{ courseId: null }, { courseId: 'c1' }] });
  });

  it('follows the assignment’s rule', async () => {
    await expect(receiptForSubmission('u1', a('RECEIPT'), {}, false)).rejects.toMatchObject({ message: expect.stringContaining('asks for your AI receipt') });
    await expect(receiptForSubmission('u1', a('NONE'), null, false)).rejects.toMatchObject({ message: expect.stringContaining('doesn’t allow AI') });
    const none = JSON.parse((await receiptForSubmission('u1', a('NONE'), { declaredNone: true }, false))!);
    expect(none).toMatchObject({ policy: 'NONE', declaredNone: true, attached: false, uses: [] });
    expect(db.aiUse.findMany).not.toHaveBeenCalled(); // a declaration attaches nothing
    expect(await receiptForSubmission('u1', a('FREE'), null, false)).toBeNull();
    expect(await receiptForSubmission('u1', a('FREE'), { attach: false }, false)).toBeNull();
    expect(JSON.parse((await receiptForSubmission('u1', a('FREE'), { attach: true }, false))!).uses).toHaveLength(2);
  });

  it('an answer sent later from an offline device is kept, marked offline', async () => {
    expect(JSON.parse((await receiptForSubmission('u1', a('RECEIPT'), undefined, true))!)).toMatchObject({ policy: 'RECEIPT', offline: true, uses: [] });
    expect(await receiptForSubmission('u1', a('FREE'), undefined, true)).toBeNull();
  });

  it('quizzes and oral checks (Q22): the receipt covers the attempt; a quiz handed in at time-up is kept as it was', async () => {
    const until = new Date('2026-10-02T10:30:00Z');
    const scope = { courseId: 'c1', since: set, until, policy: 'NONE', during: true };
    const r = JSON.parse((await makeReceipt('u1', scope, { attach: true, note: 'Asked the tutor once' }))!);
    expect(r).toMatchObject({ policy: 'NONE', attached: true, during: true, since: set.toISOString() });
    expect(db.aiUse.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: set, lte: until });
    // Time ran out before they chose: no throwing (the answers would be lost), marked for the teacher.
    const auto = JSON.parse((await makeReceipt('u1', scope, { attach: false, declaredNone: false }, 'auto'))!);
    expect(auto).toMatchObject({ policy: 'NONE', attached: false, declaredNone: false, auto: true, uses: [] });
    await expect(makeReceipt('u1', scope, { attach: false }, 'given')).rejects.toMatchObject({ message: expect.stringContaining('doesn’t allow AI') });
    // A choice that fits is kept as chosen, even at time-up.
    expect(JSON.parse((await makeReceipt('u1', scope, { declaredNone: true }, 'auto'))!)).toMatchObject({ declaredNone: true });
    expect(JSON.parse((await makeReceipt('u1', scope, { declaredNone: true }, 'auto'))!).auto).toBeUndefined();
  });
});
