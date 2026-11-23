import { describe, expect, it } from 'vitest';
import { langOf, LANGS, oneLine } from './langs';

describe('Hyperion languages (M466)', () => {
  it('knows a script’s language from its ending; anything else is MATLAB', () => {
    expect(['a.m', 'b.py', 'c.R', 'd.r', 'e.jl', 'f.cpp', 'g.cc', 'h.rs', 'notes.txt'].map((n) => langOf(n).id)).toEqual(['matlab', 'python', 'r', 'r', 'julia', 'cpp', 'cpp', 'rust', 'matlab']);
    expect(LANGS.filter((l) => l.where === 'computer').map((l) => l.id)).toEqual(['julia', 'cpp', 'rust']);
  });
  it('shortens a value to one line', () => {
    expect(oneLine('array([1,\n  2,  3])')).toBe('array([1, 2, 3])');
    expect(oneLine('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('Hyperion’s R (M467)', () => {
  it('finds the packages a script asks for, leaving out R’s own', async () => {
    const { packagesIn } = await import('./langs');
    expect(packagesIn("library(ggplot2)\nrequire('dplyr')\nx <- tidyr::pivot_longer(d)\nstats::sd(1:3)\nlibrary(stats)")).toEqual(['ggplot2', 'dplyr', 'tidyr']);
  });
});

describe('Julia, C++ and Rust in the computer app (M470)', () => {
  it('finds the line of the first error a compiler names', async () => {
    const { errorLine } = await import('@/components/lab/lang-runner');
    expect(errorLine('cpp', "main.cpp: In function 'int main()':\nmain.cpp:7:20: error: 'x' was not declared")).toBe(7);
    expect(errorLine('rust', 'error[E0425]: cannot find value `x`\n --> main.rs:3:5\n')).toBe(3);
    expect(errorLine('julia', 'ERROR: LoadError: UndefVarError\nin expression starting at /tmp/h/main.jl:4')).toBe(4);
    expect(errorLine('cpp', 'all fine')).toBeUndefined();
  });
});
