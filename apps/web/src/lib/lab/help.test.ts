import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import './plot';
import './files';
import './ml-lab';
import './optim-lab';
import './maint-lab';
import './energy-lab';
import './grid-lab';
import './comms-lab';
import './image-lab';
import './radar-lab';
import './filters-lab';
import './help-commands';
import { BUILTINS } from './builtins';
import { HELP, helpFor, lookFor } from './help';

describe('Hyperion: help (M391)', () => {
  it('has a line of help for every function', () => {
    expect(Object.keys(BUILTINS).filter((n) => !HELP.has(n))).toEqual([]);
  });
  it('prints help and finds functions by a word', () => {
    let out = '';
    const lab = new Lab({ out: (t) => { out += t; } });
    lab.run('help sin');
    expect(out).toContain('sin  —  Sine (radians).');
    expect(out).toContain('See also: cos');
    expect(helpFor('nope')).toBeNull();
    expect(lookFor('fourier').map((e) => e.name)).toContain('fft');
  });
});

describe('the function browser’s first form (M391)', () => {
  it('splits ways of calling only between whole forms', async () => {
    const { firstForm } = await import('@/components/lab/FunctionBrowser');
    expect(firstForm('fft(x, n), fft(A)')).toBe('fft(x, n)');
    expect(firstForm("zeros(r, c), zeros(r, c, p, …, 'uint8')")).toBe('zeros(r, c)');
    expect(firstForm('hold on, hold off')).toBe('hold on');
  });
});
