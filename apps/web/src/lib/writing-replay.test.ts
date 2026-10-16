import { describe, expect, it } from 'vitest';
import { MAX_CHUNKS, MAX_TOTAL, cleanReplay, diffChunk, record, replayStats, textAt, type Replay } from './writing-replay';

describe('writing replay', () => {
  it('keeps one change between two versions', () => {
    expect(diffChunk('Hello world', 'Hello there world', 1)).toEqual({ t: 1, p: 6, d: 0, i: 'there ' });
    expect(diffChunk('Hello there world', 'Hello world', 2)).toEqual({ t: 2, p: 6, d: 6, i: '' });
    expect(diffChunk('abc', 'abc', 3)).toBeNull();
    expect(diffChunk('', 'Pasted text', 4, true)).toEqual({ t: 4, p: 0, d: 0, i: 'Pasted text', paste: true });
  });
  it('replays to any point', () => {
    let r: Replay = { base: '', chunks: [] };
    const versions = ['Loops', 'Loops repeat', 'Loops repeat steps.', 'For loops repeat steps.'];
    let prev = '';
    versions.forEach((v, k) => { r = record(r, prev, v, 1000 * (k + 1)); prev = v; });
    expect(textAt(r, 0)).toBe('');
    expect(textAt(r, 2)).toBe('Loops repeat');
    expect(textAt(r, r.chunks.length)).toBe('For loops repeat steps.');
  });
  it('folds the oldest changes into the base past the limit', () => {
    let r: Replay = { base: '', chunks: [] };
    let prev = '';
    for (let k = 0; k < MAX_CHUNKS + 5; k++) { const next = `${prev}${k % 10}`; r = record(r, prev, next, k); prev = next; }
    expect(r.chunks).toHaveLength(MAX_CHUNKS);
    expect(r.base).toHaveLength(5);
    expect(textAt(r, r.chunks.length)).toBe(prev);
  });
  it('folds when too much text has come and gone', () => {
    let r: Replay = { base: '', chunks: [] };
    const big = 'x'.repeat(10_000);
    for (let k = 0; k < 30; k++) { r = record(r, '', big, 2 * k); r = record(r, big, '', 2 * k + 1); }
    expect(r.chunks.reduce((n, c) => n + c.i.length, r.base.length)).toBeLessThanOrEqual(MAX_TOTAL);
    expect(textAt(r, r.chunks.length)).toBe('');
    expect(cleanReplay(r, '')?.matches).toBe(true);
  });
  it('checks what the browser sends, and whether it ends at the answer', () => {
    const good = { base: '', chunks: [{ t: 1, p: 0, d: 0, i: 'Hello' }, { t: 2, p: 5, d: 0, i: ' world' }] };
    expect(cleanReplay(good, 'Hello world')?.matches).toBe(true);
    expect(cleanReplay(good, 'Something else')?.matches).toBe(false);
    expect(cleanReplay({ base: '', chunks: [{ t: 2, p: 0, d: 0, i: 'a' }, { t: 1, p: 0, d: 0, i: 'b' }] }, 'ba')).toBeNull();
    expect(cleanReplay({ base: 'ab', chunks: [{ t: 1, p: 1, d: 5, i: '' }] }, '')).toBeNull();
    expect(cleanReplay('nope', '')).toBeNull();
  });
  it('counts writing time, sittings and big pastes', () => {
    const r: Replay = { base: '', chunks: [
      { t: 0, p: 0, d: 0, i: 'a' }, { t: 5 * 60_000, p: 1, d: 0, i: 'b' },
      { t: 3 * 3600_000, p: 2, d: 0, i: 'x'.repeat(300), paste: true }, { t: 3 * 3600_000 + 60_000, p: 0, d: 0, i: 'c', paste: true },
    ] };
    expect(replayStats(r)).toEqual({ minutes: 6, sittings: 2, pastes: [{ t: 3 * 3600_000, length: 300 }], first: 0, last: 3 * 3600_000 + 60_000 });
  });
});
