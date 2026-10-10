import { describe, expect, it } from 'vitest';
import { HEARD_CHARS, HEARD_MS, cleanHeard, clusterTopics, heardText, recentHeard } from './whisper';

describe('what the TA heard', () => {
  const now = 1_000_000_000;
  it('keeps the last ten minutes, oldest first, as seconds ago', () => {
    const lines = [
      { at: now - HEARD_MS - 1000, who: 'Dr Smith', text: 'too old' },
      { at: now - 120_000, who: 'Dr Smith', text: 'a base case stops the recursion' },
      { at: now - 5_000, who: 'Sam', text: 'can you repeat that' },
    ];
    expect(recentHeard(lines, now)).toEqual([
      { ago: 120, who: 'Dr Smith', text: 'a base case stops the recursion' },
      { ago: 5, who: 'Sam', text: 'can you repeat that' },
    ]);
  });
  it('keeps the newest when there is too much', () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({ at: now - (100 - i) * 1000, who: 'T', text: 'x'.repeat(200) }));
    const out = recentHeard(lines, now);
    expect(out.length).toBeLessThan(100);
    expect(out.reduce((n, l) => n + l.text.length + l.who.length, 0)).toBeLessThanOrEqual(HEARD_CHARS);
    expect(out[out.length - 1].ago).toBe(1);
  });
  it('cleans what a request sends: bounded, ordered, junk dropped', () => {
    const out = cleanHeard([
      { ago: 30, who: '  Dr   Smith ', text: ' loops   repeat ' },
      { ago: 400, who: '', text: 'earlier' },
      { ago: -5, who: 'x', text: 'future' },
      { ago: 99_999, who: 'x', text: 'ancient' },
      { ago: 10, who: 'x', text: '' },
      'nonsense',
    ]);
    expect(out).toEqual([{ ago: 400, who: 'Someone', text: 'earlier' }, { ago: 30, who: 'Dr Smith', text: 'loops repeat' }]);
    expect(cleanHeard('nope')).toEqual([]);
  });
  it('writes it for the prompt', () => {
    expect(heardText([{ ago: 300, who: 'Dr Smith', text: 'Recursion again' }, { ago: 20, who: 'Sam', text: 'ok' }])).toBe('[5 min ago] Dr Smith: Recursion again\n[just now] Sam: ok');
  });
});

describe('grouping questions by topic', () => {
  it('groups similar labels, counts students not questions, most students first', () => {
    const out = clusterTopics([
      { topic: 'base case', studentId: 'a', at: 1 },
      { topic: 'Base cases', studentId: 'b', at: 2 },
      { topic: 'base case in recursion', studentId: 'a', at: 3 },
      { topic: 'for loops', studentId: 'c', at: 4 },
      { topic: '', studentId: 'd', at: 5 },
      { topic: null, studentId: 'e', at: 6 },
    ]);
    expect(out.map((c) => [c.topic, c.students, c.questions])).toEqual([['base case', 2, 3], ['for loops', 1, 1]]);
    expect(out[0].topics).toEqual(['base case', 'base cases', 'base case in recursion']);
  });
  it('keeps unrelated topics apart and puts the newest first on a tie', () => {
    const out = clusterTopics([
      { topic: 'hash tables', studentId: 'a', at: 1 },
      { topic: 'binary search', studentId: 'b', at: 2 },
    ]);
    expect(out.map((c) => c.topic)).toEqual(['binary search', 'hash tables']);
  });
});
