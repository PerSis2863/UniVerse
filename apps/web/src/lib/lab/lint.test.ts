import { describe, expect, it } from 'vitest';
import { lintScript } from './lint';
import { explainScript } from './explain';
import { HELP } from './help';

// M399: the checker and the line-by-line explanations. Functions are the ones with help (as the window knows them).
const isFn = (n: string) => HELP.has(n);
const lint = (src: string) => lintScript(src, isFn).problems.map((p) => `${p.severity}: ${src.slice(p.from, p.to)} | ${p.message}${p.fix ? ` [${p.fix.label}]` : ''}`);
const has = (list: string[], start: string) => list.some((x) => x.startsWith(start));
const explain = (src: string) => { const { prog } = lintScript(src, isFn); return Object.fromEntries(explainScript(src, prog!, isFn)); };

describe('Hyperion code checker (M399)', () => {
  it('finds a name with no value, and offers the near one', () => {
    const r = lintScript('speed = 3;\ny = sped * 2;', isFn).problems;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: 'error', from: 15, to: 19 });
    expect(r[0].message).toMatch(/Did you mean speed/);
    expect(r[0].fix).toMatchObject({ insert: 'speed', from: 15, to: 19 });
  });
  it('catches a loop total that never started', () => {
    const r = lint('for k = 1:3\n  total = total + k;\nend');
    expect(r).toHaveLength(1);
    expect(has(r, 'error: total | “total” has no value here')).toBe(true);
  });
  it('lets a loop read last pass’s value under an if', () => {
    expect(lint('for k = 1:3\n  if k > 1, disp(prev), end\n  prev = k;\nend')).toEqual([]);
  });
  it('points out loops that print, arrays that grow, hidden functions and text compared with ==', () => {
    const r = lint("sum = 0;\nfor k = 1:10\n  sq(k) = k^2\nend\nif name == 'abc', disp(1), end");
    expect(has(r, 'info: sum | sum is also a function')).toBe(true);
    expect(has(r, 'info: sq | sq grows on every pass of the loop')).toBe(true);
    expect(r.find((x) => x.includes('prints'))).toMatch(/\[Add ;\]$/);
    expect(r.find((x) => x.includes('strcmp'))).toBeDefined();
  });
  it('adds the ; in the right place, before a comment', () => {
    const src = 'for k = 1:2\n  y = k   % square\nend';
    const fix = lintScript(src, isFn).problems.find((p) => p.fix)!.fix!;
    expect(src.slice(0, fix.from) + fix.insert + src.slice(fix.to)).toBe('for k = 1:2\n  y = k;   % square\nend');
  });
  it('knows code after return never runs, and unused results inside functions', () => {
    const r = lint('function y = f(x)\n  t = x * 2;\n  y = x;\n  return\n  disp(y)\nend');
    expect(has(r, 'warning: t | t gets a value here but is never used afterwards')).toBe(true);
    expect(has(r, 'warning: disp(y) | This line never runs: it comes after return')).toBe(true);
  });
  it('reports what it can’t read, where it is', () => {
    const r = lintScript("x = 'abc", isFn).problems;
    expect(r[0]).toMatchObject({ severity: 'error' });
  });
  it('is quiet about good code (syms, load, functions below)', () => {
    expect(lint('syms x\nf = x^2;\nload data.mat\ny = whatever + 1;')).toEqual([]);
    expect(lint('y = twice(3);\nfunction r = twice(a)\n  r = 2*a;\nend')).toEqual([]);
  });
});

describe('Hyperion explains each line (M399)', () => {
  it('joins the help with the values written', () => {
    const e = explain('x = linspace(0, 2*pi, 200);\nfor k = 1:10\n  plot(x, sin(k*x))\nend\nA = [1 2; 3 4];\nb = A \\ [5; 6];\nf = @(t) t.^2;');
    expect(e[1]).toMatch(/^x: .*\(.*= 0, .*= 2\*pi, .*= 200\)\.$/);
    expect(e[2]).toBe('Repeats the lines up to its end for each k from 1 to 10.');
    expect(e[5]).toBe('A: a 2×2 matrix written out.');
    expect(e[6]).toBe('b: the solution x of A·x = [5; 6].');
    expect(e[7]).toBe('f: a function of t that works out t.^2.');
  });
  it('explains functions and commands', () => {
    const e = explain('function [m, s] = stats(v)\n  m = mean(v);\nend');
    expect(e[1]).toBe('Defines the function stats(v), giving back m, s.');
    expect(explain('hold on')[1]).toMatch(/\(on\)\.$/);
  });
});
