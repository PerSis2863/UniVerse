import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/server-auth';
import { askChain, looksMultiStep, splitSteps } from './ghidra-chain';

vi.mock('@/lib/db', () => ({ default: { enrollment: { findMany: vi.fn().mockResolvedValue([]) }, greenAction: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(true) }));

const me = { id: 'u1', role: 'STUDENT' } as SessionUser;

describe('Ghidra’s chaining steps with LangGraph (M432)', () => {
  it('asks the planner only when a request may have several parts', () => {
    expect(looksMultiStep('Plan a trip to Goa for 3 of us and then tell my friends')).toBe(true);
    expect(looksMultiStep('I bought bread and milk')).toBe(false);
  });
  it('splits on the words that join steps, never on a plain "and"', () => {
    expect(splitSteps('Plan a trip to Goa for 3 of us and then open games')).toEqual(['Plan a trip to Goa for 3 of us', 'open games']);
    expect(splitSteps('I cycled 8 km; what’s due this week, then how am I doing in Green')).toEqual(['I cycled 8 km', 'what’s due this week', 'how am I doing in Green']);
    expect(splitSteps('a; b; c; d; e; f')).toHaveLength(0); // too short to be steps
  });
  it('runs one specialist per step through the graph and gives the plan back in order', async () => {
    const out = await askChain(me, 'I cycled 8 km to school and then what’s due this week', []);
    expect(out?.action).toBe('chain');
    const steps = (out as { steps: { action: string }[] }).steps;
    expect(steps.map((s) => s.action)).toEqual(['green_log', 'show']);
  });
  it('leaves a single request alone', async () => {
    expect(await askChain(me, 'then what', [])).toBeNull();
  });
});
