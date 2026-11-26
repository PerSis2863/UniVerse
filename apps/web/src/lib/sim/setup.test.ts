import { describe, expect, it } from 'vitest';
import { simChoices, studyFrom } from './setup';
import { partOf } from './model';

describe('Hyperion: Ghidra sets up a study (M549b)', () => {
  it('turns an answer into a study, keeping only what exists', () => {
    const { model, analysis } = studyFrom({ template: 'bracket', sizes: [{ key: 'A', value: 150 }, { key: 'B', value: 99999 }], material: 'aluminium', thickness: 8,
      supports: [{ kind: 'fixed', edge: 'Top bolt hole' }, { kind: 'fixed', edge: 'No such edge' }],
      loads: [{ kind: 'bearing', edge: 'end bolt hole', amount: 2000, direction: 'down' }], analysis: 'buckling', note: 'ok' });
    expect(model.template).toBe('bracket');
    expect(model.values.A).toBe(150);
    expect(model.values.B).toBe(5000);
    expect(model.material).toBe('aluminium');
    expect(model.supports).toHaveLength(1);
    const { edges } = partOf(model);
    expect(edges.filter((e) => model.loads[0].edges.includes(e.id)).every((e) => e.label === 'End bolt hole')).toBe(true);
    expect(model.loads[0]).toMatchObject({ kind: 'bearing', F: 2000, angle: -90 });
    expect(analysis).toBe('buckling');
  });
  it('falls back to the start for nonsense, and lists the shapes Ghidra may use', () => {
    const { model, analysis } = studyFrom({ template: 'rocket', material: 'cheese', supports: [], loads: [], analysis: 'magic' });
    expect(model.template).toBe('beam');
    expect(model.supports.length).toBeGreaterThan(0);
    expect(analysis).toBe('static');
    expect(simChoices()).toMatch(/bracket .*edges: .*Top bolt hole/);
    expect(simChoices()).not.toMatch(/^custom/m);
  });
});
