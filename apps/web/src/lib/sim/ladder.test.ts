import { describe, expect, it } from 'vitest';
import { EXAMPLES, newBlock, type Diagram } from './blocks';
import { buildIr, emulate } from './blockir';
import { generateCode } from './blockcode';
import { lowerLadder, runLadder } from './ladder';

const delayed = (): Diagram => {
  const s = newBlock('sine', 0, 0), d = newBlock('delay', 0, 0), sc = newBlock('scope', 0, 0);
  d.p = { ...d.p, time: 0.25 };
  return { stop: 10, dt: 0.01, blocks: [s, d, sc], wires: [{ id: 'a', from: s.id, out: 0, to: d.id, in: 0 }, { id: 'b', from: d.id, out: 0, to: sc.id, in: 0 }] };
};
const ex = (id: string) => (id === 'delayed' ? delayed() : EXAMPLES.find((e) => e.id === id)!.make());

describe('Ladder Diagram (M571)', () => {
  it('the rungs give the same numbers as Hyperion’s own step, charts, delays and nesting included', () => {
    for (const id of ['cruise', 'tank', 'spring', 'hil', 'modes', 'parallel', 'twoloops', 'delayed']) {
      const d = ex(id), ir = buildIr(d), want = emulate(ir, 2500);
      const got = runLadder(lowerLadder(ir), Object.fromEntries(ir.inputs.map((i) => [i.name, i.test])), 2500);
      for (const o of ir.outputs) got[o.name].forEach((v, k) => expect(Math.abs(v - want[o.name][k]), `${id} ${o.name} step ${k}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(want[o.name][k]))));
    }
  });
  it('writes the rungs drawn in text and as PLCopen XML that is well formed', () => {
    const files = generateCode(ex('tank'), 'ld');
    expect(files.map((f) => f.name)).toEqual(['model_ladder.txt', 'model.xml']);
    expect(files[0].text).toMatch(/--\[ g\d+ \]--/);
    const x = files[1].text;
    expect(x).toContain('<LD>');
    expect(x).toContain('pouType="functionBlock"');
    // Every element named once, every connection to one that exists, tags balanced.
    const ids = [...x.matchAll(/localId="(\d+)"/g)].map((m) => m[1]), refs = [...x.matchAll(/refLocalId="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of refs) expect(ids).toContain(r);
    const open = (x.match(/<[A-Za-z][^>]*[^/]>/g) ?? []).filter((t) => !t.startsWith('<?')).length, close = (x.match(/<\/[A-Za-z]/g) ?? []).length;
    expect(open).toBe(close);
  });
});
