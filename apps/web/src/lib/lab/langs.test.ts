import { describe, expect, it } from 'vitest';
import { langOf, LANGS, oneLine } from './langs';

describe('Hyperion languages (M444)', () => {
  it('knows a script’s language from its ending; anything else is MATLAB', () => {
    expect(['a.m', 'b.py', 'c.R', 'd.r', 'e.jl', 'f.cpp', 'g.cc', 'h.rs', 'notes.txt'].map((n) => langOf(n).id)).toEqual(['matlab', 'python', 'r', 'r', 'julia', 'cpp', 'cpp', 'rust', 'matlab']);
    expect(LANGS.filter((l) => l.where === 'computer').map((l) => l.id)).toEqual(['julia', 'cpp', 'rust']);
  });
  it('shortens a value to one line', () => {
    expect(oneLine('array([1,\n  2,  3])')).toBe('array([1, 2, 3])');
    expect(oneLine('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});
