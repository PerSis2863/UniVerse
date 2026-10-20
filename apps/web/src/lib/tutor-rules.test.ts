import { describe, expect, it } from 'vitest';
import { cleanRule, groupQuestions, modeFor, modeInstructions, tutorOff } from './tutor-rules';

describe('tutor rules (Stage 5 · Q13)', () => {
  it('cleans a stored rule and works out when the tutor is off', () => {
    expect(cleanRule('not json')).toEqual({ hintsOnly: false, note: '', off: false, offUntil: null, whisperOff: false });
    expect(cleanRule('{"whisperOff":true}').whisperOff).toBe(true); // Whisper TA off for this class (Q22)
    const r = cleanRule({ hintsOnly: true, note: `  Always ask for units. ${'x'.repeat(600)}`, off: true, offUntil: '2026-11-02T09:00:00Z' });
    expect(r.note.length).toBe(500);
    expect(r.offUntil).toBe('2026-11-02T09:00:00.000Z');
    expect(tutorOff(r, Date.parse('2026-11-01T00:00:00Z'))).toBe(true);
    expect(tutorOff(r, Date.parse('2026-11-03T00:00:00Z'))).toBe(false);
    expect(tutorOff(cleanRule({ off: true }))).toBe(true);
    expect(cleanRule({ off: false, offUntil: '2026-11-02T09:00:00Z' }).offUntil).toBeNull();
  });

  it('lets a hints-only course override the student’s mode, and says so to the AI', () => {
    expect(modeFor('simple', cleanRule({}))).toBe('simple');
    expect(modeFor('anything', cleanRule({}))).toBe('normal');
    expect(modeFor('normal', cleanRule({ hintsOnly: true }))).toBe('hints');
    const text = modeInstructions('hints', cleanRule({ note: 'Use SI units.' }));
    expect(text).toMatch(/never the final answer/);
    expect(text).toMatch(/Use SI units\./);
    expect(text).toMatch(/\\ce\{/);
  });

  it('groups questions by what they’re about, keeping only ones several students asked', () => {
    const q = (userId: string, text: string, at = '2026-10-10') => ({ userId, text, at });
    const groups = groupQuestions([
      q('a', 'What is recursion?'), q('b', 'Explain recursion with an example'), q('a', 'Why does my recursion never stop? base case'),
      q('c', 'How do I balance a redox equation?'), q('d', 'balance redox equations in acid'),
      q('e', 'What is the deadline for the lab report?'),
    ]);
    expect(groups.map((g) => [g.label.split(', ')[0], g.asked, g.people])).toEqual([['recursion', 3, 2], ['balance', 2, 2]]);
    expect(groups[0].examples[0]).toBe('What is recursion?');
  });
});
