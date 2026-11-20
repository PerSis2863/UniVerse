import { describe, expect, it } from 'vitest';
import { quickReplies } from './quick-replies';

describe('quickReplies', () => {
  it('answers what the message says', () => {
    expect(quickReplies('Thanks a lot for the notes!')[0]).toBe('You’re welcome!');
    expect(quickReplies('Can you send me the slides?')).toContain('Sure!');
    expect(quickReplies('Shall we meet tomorrow at 10?')).toContain('Yes, works for me');
    expect(quickReplies('See you at lunch')).toContain('See you then');
    expect(quickReplies('Is the test hard?')).toEqual(['Yes', 'No', 'Not sure yet']);
    expect(quickReplies('Thanks! Shall we meet tomorrow at 10?')).toContain('Yes, works for me'); // a question wins
    expect(quickReplies('Hey, how are you?')[0]).toBe('Good, thanks! You?');
  });
  it('has nothing for an empty or very long message, and at most three otherwise', () => {
    expect(quickReplies('  ')).toEqual([]);
    expect(quickReplies('x'.repeat(700))).toEqual([]);
    expect(quickReplies('ok').length).toBeLessThanOrEqual(3);
  });
  it('matches whole words only', () => {
    expect(quickReplies('Let me think about it')).not.toContain('Hi! 👋'); // "think" has no "hi" word
  });
});
