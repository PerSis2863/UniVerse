import { describe, expect, it } from 'vitest';
import { assignPeers, peerAverage, type HandIn } from './peer-review';

const handIns = (n: number): HandIn[] => Array.from({ length: n }, (_, i) => ({ submissionId: `sub${i}`, authorId: `stu${i}` }));
const count = <T,>(xs: T[], key: (x: T) => string) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>());

describe('who reviews whom', () => {
  it('gives every answer k reviews and everyone k to do, never their own', () => {
    const subs = handIns(7);
    const pairs = assignPeers(subs, 2);
    expect(pairs).toHaveLength(14);
    expect([...count(pairs, (p) => p.submissionId).values()].every((c) => c === 2)).toBe(true);
    expect([...count(pairs, (p) => p.reviewerId).values()].every((c) => c === 2)).toBe(true);
    expect(pairs.some((p) => p.submissionId.replace('sub', '') === p.reviewerId.replace('stu', ''))).toBe(false);
    expect(new Set(pairs.map((p) => `${p.submissionId}:${p.reviewerId}`)).size).toBe(14);
  });
  it('asks for no more reviews than there are other answers', () => {
    expect(assignPeers(handIns(3), 5)).toHaveLength(6);
    expect(assignPeers(handIns(1), 3)).toEqual([]);
    expect(assignPeers(handIns(5), 0)).toEqual([]);
  });
  it('keeps reviews already done and fills in around them', () => {
    const subs = handIns(4);
    const done = [{ submissionId: 'sub1', reviewerId: 'stu0' }];
    const pairs = assignPeers(subs, 1, done);
    expect(pairs.find((p) => p.reviewerId === 'stu0')).toBeUndefined();
    expect(pairs.find((p) => p.submissionId === 'sub1')).toBeUndefined();
    expect(pairs).toHaveLength(3);
    expect(pairs.every((p) => p.submissionId.replace('sub', '') !== p.reviewerId.replace('stu', ''))).toBe(true);
  });
  it('fills every gap whatever the shuffle', () => {
    for (let run = 0; run < 200; run++) {
      const n = 3 + (run % 6), k = 1 + (run % 3);
      const done = run % 2 ? [{ submissionId: 'sub1', reviewerId: 'stu0' }] : [];
      const pairs = [...done, ...assignPeers(handIns(n), k, done)];
      const per = Math.min(k, n - 1);
      expect(pairs).toHaveLength(n * per);
      expect(pairs.some((p) => p.submissionId.slice(3) === p.reviewerId.slice(3))).toBe(false);
      expect(new Set(pairs.map((p) => `${p.submissionId}:${p.reviewerId}`)).size).toBe(pairs.length);
    }
  });
  it('averages the totals', () => {
    expect(peerAverage([7, 8, 8])).toBe(7.7);
    expect(peerAverage([])).toBeNull();
  });
});
