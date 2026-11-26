import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat, type Value } from './values';
import './text-lab';

const run = (code: string) => { const lab = new Lab({ out: () => {}, graphics: new Graphics() }); lab.run(code); return { n: (k: string) => [...toMat(lab.vars.get(k)!).d], v: (k: string) => lab.vars.get(k) as Value & { v?: string } }; };

describe('Hyperion text, dates and maps (M559)', () => {
  it('text and numbers', () => {
    const r = run(`a = dec2base(255, 16); b = base2dec('FF', 16); c = validatestring('app', {'apple', 'banana'});
      t = typecast(single(1), 'uint32'); h = num2hex(1); x = hex2num('400921fb54442d18');
      C = textscan(sprintf('ann 3.5\\nbob 4.25'), '%s %f'); s2 = C{2}; j = strjust(sprintf('a  \\n  bb'), 'right');`);
    expect(r.v('a').v).toBe('FF');
    expect(r.n('b')).toEqual([255]);
    expect(r.v('c').v).toBe('apple');
    expect(r.n('t')).toEqual([1065353216]);
    expect(r.v('h').v).toBe('3ff0000000000000');
    expect(r.n('x')[0]).toBeCloseTo(Math.PI, 15);
    expect(r.n('s2')).toEqual([3.5, 4.25]);
    expect(r.v('j').v).toBe('   a\n  bb'); // the width is kept (4), as MATLAB does
  });
  it('dates: MATLAB’s day numbers, weekdays, month ends, calendars, adding months', () => {
    const r = run(`d = datenum(2000, 1, 1); d0 = datenum(0, 1, 1); s = datenum('2026-11-26'); [k, name] = weekday(s);
      e = eomday(2024, 2); c = calendar(2026, 11); m = addtodate(datenum(2026, 1, 31), 1, 'month'); [~, nm] = weekday(m);`);
    expect(r.n('d')).toEqual([730486]);
    expect(r.n('d0')).toEqual([1]);
    expect(r.n('k')).toEqual([5]);
    expect(r.v('name').v).toBe('Thu');
    expect(r.n('e')).toEqual([29]);
    expect(r.n('c')[0]).toBe(1); // 1 November 2026 is a Sunday: the first row's first cell
    expect(r.n('m')[0] - r.n('d')[0]).toBe(9555); // 28 February 2026: 26 years with 7 leap days, then 31 + 27
  });
  it('containers.Map (a handle) and dictionary (a value)', () => {
    const r = run(`m = containers.Map({'apple', 'pear'}, {3, 5}); m('fig') = 7; n = m.Count; v = m('pear');
      k = keys(m); first = k{1}; alias = m; alias('kiwi') = 1; shared = m.Count; has = isKey(m, {'fig', 'plum'});
      d = dictionary([1 2 3], [10 20 30]); d2 = d; d2(4) = 40; dn = numEntries(d); d2n = numEntries(d2); w = d(2);`);
    expect(r.n('n')).toEqual([3]);
    expect(r.n('v')).toEqual([5]);
    expect(r.v('first').v).toBe('apple');
    expect(r.n('shared')).toEqual([4]);
    expect(r.n('has')).toEqual([1, 0]);
    expect(r.n('dn')).toEqual([3]);
    expect(r.n('d2n')).toEqual([4]);
    expect(r.n('w')).toEqual([20]);
    expect(() => run("m = containers.Map(); x = m('none');")).toThrow(/no key/);
  });
});
