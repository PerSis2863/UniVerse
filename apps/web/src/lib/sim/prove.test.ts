import { describe, expect, it } from 'vitest';
import { parseChart } from './chart';
import { prove } from './prove';

const v = (r: ReturnType<typeof prove>, text: string) => r.proofs.find((p) => p.text === text)?.verdict;

describe('proving charts for every input (M573)', () => {
  const pump = parseChart(`inputs: level
outputs: pump, alarm
state Filling
  entry: pump = 1; alarm = 0
state Draining
  entry: pump = 0
state Stuck
  entry: alarm = 1
Filling -> Draining: level >= 2
Draining -> Filling: level <= 1
Draining -> Stuck: level > 5 && level < 3
Filling -> Draining: level > 10`);
  it('proves a state unreachable, a transition dead, the outputs’ bounds, and an invariant', () => {
    const r = prove(pump, { props: ['!(pump == 1 && alarm == 1)', 'in(Filling) == (pump == 1)'] });
    expect(v(r, 'state Stuck can never be reached')).toBe('proved');
    expect(v(r, 'Draining → Stuck [level > 5 && level < 3] can never fire')).toBe('proved');
    expect(v(r, 'Filling → Draining [level > 10] can never fire')).toBe('proved'); // shadowed by level >= 2
    expect(v(r, 'state Draining can be reached')).toBe('proved');
    expect(r.proofs.find((p) => p.name === 'pump')?.range).toEqual([0, 1]);
    expect(v(r, 'always !(pump == 1 && alarm == 1)')).toBe('proved');
    expect(v(r, 'always in(Filling) == (pump == 1)')).toBe('proved');
  });
  it('finds a counterexample to a property that fails, and replays it', () => {
    const r = prove(pump, { props: ['pump == 1'] }), p = r.proofs.find((x) => x.text === 'always pump == 1')!;
    expect(p.verdict).toBe('falsified');
    expect(p.trace!.at(-1)!.state).toBe('Draining');
    expect(p.trace!.at(-1)!.inputs.level).toBeGreaterThanOrEqual(2);
  });
  it('input ranges count: with the level kept under 2 the pump never stops', () => {
    const r = prove(pump, { ranges: { level: [0, 1.9] }, props: ['pump == 1'] });
    expect(v(r, 'always pump == 1')).toBe('proved');
    expect(v(r, 'state Draining can never be reached')).toBe('proved');
  });
  it('a counter with a timer: bounds widened to stay sound, a waiting transition reached', () => {
    const ch = parseChart(`inputs: go
outputs: n
state Idle
state Busy
  entry: n = n + 1
Idle -> Busy: go > 0
Busy -> Idle: 1 after 3`);
    const r = prove(ch, { props: ['n >= 0'] });
    expect(r.widened).toBe(true);
    expect(v(r, 'always n >= 0')).toBe('proved');
    expect(v(r, 'state Busy can be reached')).toBe('proved');
    expect(r.proofs.find((p) => p.name === 'n')?.range).toEqual([0, Infinity]);
  });
  it('side-by-side states: the regions’ coupling proved', () => {
    const ch = parseChart(`inputs: u
outputs: pump, light
state On parallel
state Pump in On
state Idle in Pump
  entry: pump = 0
state Run in Pump
  entry: pump = 1
state Light in On
state Green in Light
  entry: light = 1
state Red in Light
  entry: light = 2
Idle -> Run: u > 1
Run -> Idle: u < 1
Green -> Red: pump == 1
Red -> Green: pump == 0`);
    const r = prove(ch, { props: ['pump == 0 || light == 2', 'in(Run) == (pump == 1)'] });
    expect(v(r, 'always pump == 0 || light == 2')).toBe('proved');
    expect(v(r, 'always in(Run) == (pump == 1)')).toBe('proved');
  });
});
