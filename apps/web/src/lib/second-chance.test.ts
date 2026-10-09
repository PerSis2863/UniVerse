import { describe, expect, it } from 'vitest';
import { enough, findMoments, groupMisses, hits, keywords, type Miss, type SessionText } from './second-chance';

const miss = (refId: string, at: number, text = `Question ${refId}`, kind: Miss['kind'] = 'QUESTION'): Miss => ({ kind, refId, text, source: 'Quiz 1', at });

describe('topic key words', () => {
  it('drops short and common words and stems the rest', () => {
    expect(keywords('Loops and recursion')).toEqual(['loop', 'recursi']);
    expect(keywords('What is the base case of a recursive function?')).toEqual(['base', 'case', 'recursi', 'functio']);
  });
  it('keeps the longest words, in order', () => {
    expect(keywords('Which keyword makes a loop stop early in Python programs', 3)).toEqual(['keyword', 'python', 'program']);
  });
  it('ignores accents and case', () => {
    expect(keywords('Récursivité')).toEqual(['recursi']);
    expect(hits('RECURSION is when a function calls itself', keywords('recursive functions'))).toBe(2);
  });
  it('needs half the words, at least one', () => {
    expect(enough([])).toBe(1);
    expect(enough(['a'])).toBe(1);
    expect(enough(['a', 'b', 'c'])).toBe(2);
  });
});

describe('grouping misses', () => {
  const concepts = [{ id: 'c1', name: 'Loops' }, { id: 'c2', name: 'Recursion' }];
  it('groups tagged misses by concept and keeps untagged ones apart, newest first', () => {
    const tags = new Map([['q1', ['c1']], ['q2', ['c1', 'c2']]]);
    const out = groupMisses([miss('q1', 10), miss('q2', 30), miss('q3', 20, 'What does a while loop do?')], tags, concepts);
    expect(out.map((c) => c.key)).toEqual(['CONCEPT:c1', 'CONCEPT:c2', 'QUESTION:q3']);
    expect(out[0]).toMatchObject({ conceptId: 'c1', topic: 'Loops', missedAt: 30 });
    expect(out[0].misses.map((m) => m.refId)).toEqual(['q2', 'q1']);
    expect(out[2]).toMatchObject({ conceptId: null, topic: 'What does a while loop do?' });
  });
  it('ignores tags to concepts that were removed, and shortens long topics', () => {
    const long = 'x'.repeat(200);
    const out = groupMisses([miss('a:k', 5, long, 'CRITERION')], new Map([['a:k', ['gone']]]), concepts);
    expect(out[0].key).toBe('CRITERION:a:k');
    expect(out[0].topic.length).toBe(118);
    expect(out[0].topic.endsWith('…')).toBe(true);
  });
  it('counts each question once per concept', () => {
    const out = groupMisses([miss('q1', 1), miss('q1', 2)], new Map([['q1', ['c2']]]), concepts);
    expect(out[0].misses).toHaveLength(1);
    expect(out[0].missedAt).toBe(2);
  });
});

describe('finding class moments', () => {
  const session = (id: string, when: string, over: Partial<SessionText> = {}): SessionText => ({ id, when, teacher: 'Dr Smith', chapters: [], keyMoments: [], transcript: [], ...over });
  it('ranks chapters over key moments over what was said, and skips students', () => {
    const s = session('s1', '2026-10-01', {
      chapters: [{ t: 600, title: 'Recursion and the call stack' }],
      keyMoments: [{ t: 1200, text: 'A recursive function needs a base case' }],
      transcript: [{ t: 30, who: 'Sam', text: 'Is recursion on the test?' }, { t: 2000, who: 'Dr Smith', text: 'Recursion again: think of it as a loop that calls itself' }],
    });
    const out = findMoments([s], keywords('Recursion'));
    expect(out.map((m) => [m.t, m.kind])).toEqual([[600, 'chapter'], [1200, 'moment'], [2000, 'said']]);
  });
  it('keeps one moment near the same point of a class, and the best ones across classes', () => {
    const a = session('a', '2026-10-01', { transcript: [{ t: 100, who: 'Dr Smith', text: 'Loops repeat' }, { t: 130, who: 'Dr Smith', text: 'A for loop over a list' }] });
    const b = session('b', '2026-10-05', { chapters: [{ t: 50, title: 'For loops' }] });
    const out = findMoments([a, b], keywords('loops'));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ sessionId: 'b', kind: 'chapter' });
    expect(out[1].sessionId).toBe('a');
  });
  it('needs enough of the key words and gives at most three', () => {
    const s = session('s', '2026-10-01', { chapters: [1, 2, 3, 4, 5].map((i) => ({ t: i * 200, title: `Binary search trees part ${i}` })) });
    expect(findMoments([s], keywords('binary search trees'))).toHaveLength(3);
    expect(findMoments([s], keywords('hash tables and binary heaps'))).toHaveLength(0);
    expect(findMoments([s], [])).toEqual([]);
  });
});
