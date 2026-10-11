import { describe, expect, it } from 'vitest';
import { textHash } from './text-hash';

describe('text hash', () => {
  it('is the same for the same text and changes when it’s edited', () => {
    expect(textHash('Exam moved to Friday')).toBe(textHash('Exam moved to Friday'));
    expect(textHash('Exam moved to Friday')).not.toBe(textHash('Exam moved to Monday'));
    expect(textHash('')).toBe('811c9dc50');
    expect(textHash('é')).toMatch(/^[0-9a-f]{9}$/);
  });
});
