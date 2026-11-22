import { describe, expect, it } from 'vitest';
import { codeOf } from './hyperion-ai';

describe('Hyperion’s AI (M435)', () => {
  it('takes the last code block of an answer', () => {
    expect(codeOf('Sum it:\n```matlab\nx = 1:3;\ndisp(sum(x))\n```')).toBe('x = 1:3;\ndisp(sum(x))');
    expect(codeOf('```\na = 1\n```\nthen\n```octave\nb = 2\n```')).toBe('b = 2');
    expect(codeOf('No code here.')).toBeNull();
  });
});
