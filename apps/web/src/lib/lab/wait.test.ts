import { afterEach, describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { mat, toMat, type Value } from './values';
import { answer, newSlot, pack, sleepOn, unpack, waits } from './wait';
import { parallel, runResumable, runTask, type Task } from './parallel-lab';
import { serialFeed } from './serial-lab';
import './serial-lab';

const make = () => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, serial: () => {} } as never); return { lab, out: () => out, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
afterEach(() => { waits.page = null; parallel.pool = null; serialFeed({ state: { open: false, name: '', baud: 0, firmata: false, pins: [] } }); });

describe('Hyperion waiting mid-run (M521)', () => {
  it('packs values exactly: NaN, infinities, −0, typed arrays and maps', () => {
    const v = { k: 'struct', f: new Map<string, Value>([['a', mat(1, 4, [NaN, Infinity, -Infinity, -0])], ['b', mat(1, 1, [Math.PI])]]) };
    const back = unpack<typeof v>(pack(v));
    const a = back.f.get('a') as { d: Float64Array };
    expect(a.d).toBeInstanceOf(Float64Array);
    expect(Number.isNaN(a.d[0]) && a.d[1] === Infinity && a.d[2] === -Infinity && Object.is(a.d[3], -0)).toBe(true);
    expect((back.f.get('b') as { d: Float64Array }).d[0]).toBe(Math.PI);
  });
  it('a slot carries an answer to the thread that sleeps on it, and says when one is too big', () => {
    const sab = newSlot(64);
    answer(sab, { n: 1, v: 'hello' });
    expect(sleepOn(sab, 10)).toEqual({ n: 1, v: 'hello' });
    const small = newSlot(8);
    answer(small, 'far too long for eight bytes');
    expect(() => sleepOn(small, 10)).toThrow(/too big/);
    expect(sleepOn(newSlot(8), 1)).toBeUndefined();
  });
  it('readline waits for the device’s next line inside a loop and a function', () => {
    let k = 0;
    const asked: string[] = [];
    waits.page = (kind, body) => { asked.push(`${kind}:${(body as { want: string }).want}`); const want = (body as { want: string }).want; if (want === 'line') k++; return { lines: want === 'line' ? [`T=${20 + k}`] : [], state: { open: true, name: 'Arduino', baud: 9600, firmata: false, pins: [] } }; };
    const t = make();
    t.lab.run("function v = next(s)\n  t = readline(s); v = str2double(t(3:end));\nend\ns = serialport('Arduino', 9600, 'Timeout', 2);\nfor i = 1:3\n  v(i) = next(s);\nend");
    expect(t.d('v')).toEqual([21, 22, 23]);
    expect(asked).toEqual(['serial:peek', 'serial:line', 'serial:line', 'serial:line']);
  });
  it('without a line to the page, readline gives what had arrived (empty when nothing)', () => {
    serialFeed({ state: { open: true, name: 'Arduino', baud: 9600, firmata: false, pins: [] }, lines: ['one'] });
    const t = make();
    t.lab.run("s = serialport('Arduino', 9600); a = readline(s); b = readline(s);");
    expect(t.lab.vars.get('a')).toMatchObject({ k: 'str' });
    expect(toMat(t.lab.vars.get('b')!).d.length).toBe(0);
  });
  it('a parfor inside a function runs on the waiting pool, the same as in order', async () => {
    let calls = 0;
    parallel.pool = { size: 3, run: async (task: Task) => runTask(task), canWait: true, runNow: (tasks) => { calls++; return tasks.map((x) => unpack(pack(runTask(unpack(pack(x)))))); } };
    const code = "function [y, s] = squares(n)\n  y = zeros(1, n); s = 0;\n  parfor k = 1:n\n    y(k) = k^2;\n    s = s + k;\n  end\nend\n[y, s] = squares(7);";
    const t = make();
    await runResumable(t.lab, code);
    expect(calls).toBe(1);
    expect(t.d('y')).toEqual([1, 4, 9, 16, 25, 36, 49]);
    expect(t.d('s')).toEqual([28]);
  });
});
