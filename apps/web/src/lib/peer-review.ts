import { shuffle } from './group-maker';

// Peer review (Stage 5 · B3.2): who reviews whom. Everyone who handed in reviews the next k answers in
// a shuffled circle, so every answer gets k reviews, nobody reviews their own, and nobody reviews the
// same answer twice. Reviews already done are kept; the rest are handed out again around them.
// Pure; tested in peer-review.test.ts.

export const MAX_PEER_REVIEWS = 5;

export interface HandIn { submissionId: string; authorId: string }
export interface Pair { submissionId: string; reviewerId: string }

/**
 * The reviews to hand out: k for each answer (at most one fewer than the answers), skipping pairs
 * already done (`done`), and never giving anyone more than k in all.
 */
export function assignPeers(handIns: HandIn[], k: number, done: Pair[] = [], random: () => number = Math.random): Pair[] {
  const n = handIns.length;
  const per = Math.min(Math.max(0, Math.floor(k)), MAX_PEER_REVIEWS, Math.max(0, n - 1));
  if (!per) return [];
  const key = (p: Pair) => `${p.submissionId}:${p.reviewerId}`;
  const taken = new Set(done.map(key));
  const load = new Map<string, number>();
  const got = new Map<string, number>();
  for (const p of done) { load.set(p.reviewerId, (load.get(p.reviewerId) ?? 0) + 1); got.set(p.submissionId, (got.get(p.submissionId) ?? 0) + 1); }
  const circle = shuffle(handIns, random);
  const out: Pair[] = [];
  for (let step = 1; step < n; step++) {
    for (let i = 0; i < n; i++) {
      const reviewer = circle[i], target = circle[(i + step) % n];
      if (reviewer.authorId === target.authorId) continue;
      const pair = { submissionId: target.submissionId, reviewerId: reviewer.authorId };
      if (taken.has(key(pair)) || (load.get(reviewer.authorId) ?? 0) >= per || (got.get(target.submissionId) ?? 0) >= per) continue;
      taken.add(key(pair));
      load.set(reviewer.authorId, (load.get(reviewer.authorId) ?? 0) + 1);
      got.set(target.submissionId, (got.get(target.submissionId) ?? 0) + 1);
      out.push(pair);
    }
  }
  // The circle can leave someone short when reviews were already done; swap pairs to fill the gaps.
  const authorOf = new Map(handIns.map((h) => [h.submissionId, h.authorId]));
  const ok = (submissionId: string, reviewerId: string) => authorOf.get(submissionId) !== reviewerId && !taken.has(`${submissionId}:${reviewerId}`);
  for (const r of handIns) {
    for (const t of handIns) {
      if ((load.get(r.authorId) ?? 0) >= per) break;
      if ((got.get(t.submissionId) ?? 0) >= per) continue;
      const add = (pair: Pair) => { taken.add(key(pair)); out.push(pair); };
      if (ok(t.submissionId, r.authorId)) {
        add({ submissionId: t.submissionId, reviewerId: r.authorId });
      } else {
        // r takes over someone's review of another answer, and they review t instead.
        const j = out.findIndex((p) => ok(p.submissionId, r.authorId) && ok(t.submissionId, p.reviewerId));
        if (j < 0) continue;
        const p = out[j];
        taken.delete(key(p));
        out.splice(j, 1);
        add({ submissionId: p.submissionId, reviewerId: r.authorId });
        add({ submissionId: t.submissionId, reviewerId: p.reviewerId });
      }
      load.set(r.authorId, (load.get(r.authorId) ?? 0) + 1);
      got.set(t.submissionId, (got.get(t.submissionId) ?? 0) + 1);
    }
  }
  return out;
}

/** The average of the reviews' totals (null without any). */
export const peerAverage = (totals: number[]) => (totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null);
