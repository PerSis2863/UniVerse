import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ghidraExamRun: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  ghidraExamAnswer: { createMany: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ default: db }));
vi.mock('../moderation', () => ({ featureOff: vi.fn(async () => false) }));
vi.mock('./brain', async (real) => ({ ...(await real<object>()), ghidraJson: vi.fn(async () => null), ghidraText: vi.fn(async () => null) }));

import { examState, startExam, stepExam } from './exam-run';
import { ghidraJson } from './brain';

const run = { id: 'r1', per: 5, total: 195, cursor: 0, status: 'RUNNING', startedAt: new Date(), finishedAt: null };

describe('Ghidra’s exam from the console', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ghidraExamRun.findUnique.mockResolvedValue(run);
    db.ghidraExamAnswer.findMany.mockResolvedValue([]);
    process.env.GEMINI_API_KEY = 'test';
  });

  it('starts a run of every text and JSON question, stopping any unfinished one', async () => {
    db.ghidraExamRun.create.mockResolvedValue(run);
    await startExam(5);
    expect(db.ghidraExamRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'RUNNING' } }));
    const total = db.ghidraExamRun.create.mock.calls[0][0].data.total;
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThanOrEqual(5 * 43);
  });

  it('asks the next six once the cursor is claimed, and saves how each did', async () => {
    db.ghidraExamRun.updateMany.mockResolvedValue({ count: 1 });
    await stepExam('r1');
    expect(db.ghidraExamRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', cursor: 0, status: 'RUNNING' }, data: { cursor: 6 } }));
    expect(vi.mocked(ghidraJson).mock.calls.length).toBeGreaterThan(0);
    const saved = db.ghidraExamAnswer.createMany.mock.calls[0][0].data;
    expect(saved).toHaveLength(6);
    expect(JSON.parse(saved[0].failed)).toEqual(['no answer']);
  });

  it('asks nothing when another request claimed those questions', async () => {
    db.ghidraExamRun.updateMany.mockResolvedValue({ count: 0 });
    await stepExam('r1');
    expect(ghidraJson).not.toHaveBeenCalled();
    expect(db.ghidraExamAnswer.createMany).not.toHaveBeenCalled();
  });

  it('adds up the score card per skill, lowest first', async () => {
    db.ghidraExamAnswer.findMany.mockResolvedValue([
      { skill: 'safety', failed: '[]' }, { skill: 'safety', failed: '["wrong kind"]' }, { skill: 'tutor', failed: '[]' },
    ]);
    const { skills } = await examState('r1');
    expect(skills).toEqual([
      { skill: 'safety', passed: 1, asked: 2, score: 50, failed: [['wrong kind', 1]] },
      { skill: 'tutor', passed: 1, asked: 1, score: 100, failed: [] },
    ]);
  });
});
