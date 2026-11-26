import { describe, expect, it } from 'vitest';
import { contours, EPS0, MU0, solveFields, type FieldModel } from './fields';

/** The field size at the cell nearest (x, y) mm. */
const at = (r: ReturnType<typeof solveFields>, x: number, y: number) => r.mag[Math.floor(y / r.h) * r.nx + Math.floor(x / r.h)];

describe('Hyperion Simulate: fields (M548)', () => {
  it('a straight wire’s field falls as μ₀I/(2πr)', () => {
    const m: FieldModel = { mode: 'magnetic', width: 400, height: 400, regions: [{ id: 'w', kind: 'coil', x: 199, y: 199, w: 2, h: 2, value: 10 }] };
    const r = solveFields(m, 200), I = 10 * r.owner.filter((o) => o === 0).length * r.h * r.h; // A/mm² × the cells it fills
    for (const d of [10, 20, 30]) {
      const i = Math.floor((200 + d) / r.h), j = Math.floor(200 / r.h), cx = (i + 0.5) * r.h - 200, cy = (j + 0.5) * r.h - 200, rr = Math.hypot(cx, cy) * 1e-3;
      expect(r.mag[j * r.nx + i] / ((MU0 * I) / (2 * Math.PI * rr))).toBeCloseTo(1, 1);
    }
  });
  it('two wires with currents the same way pull together by μ₀I₁I₂/(2πd)', () => {
    const m: FieldModel = { mode: 'magnetic', width: 300, height: 300, regions: [
      { id: 'a', kind: 'coil', x: 128, y: 148, w: 4, h: 4, value: 5 }, { id: 'b', kind: 'coil', x: 168, y: 148, w: 4, h: 4, value: 5 }] };
    const r = solveFields(m, 300), I = 5 * 16, theory = (MU0 * I * I) / (2 * Math.PI * 0.04);
    expect(r.forces[0].fx / theory).toBeGreaterThan(0.9);
    expect(r.forces[0].fx / theory).toBeLessThan(1.1);
    expect(r.forces[1].fx).toBeLessThan(0);
    expect(contours(r).length).toBeGreaterThan(100);
  });
  it('iron gathers the flux: an iron core makes a coil’s field inside it far stronger', () => {
    const coil = (core: boolean): FieldModel => ({ mode: 'magnetic', width: 200, height: 200, regions: [
      ...(core ? [{ id: 'i', kind: 'iron' as const, x: 90, y: 60, w: 20, h: 80, value: 1000 }] : []),
      { id: 'a', kind: 'coil', x: 70, y: 80, w: 15, h: 40, value: 2 }, { id: 'b', kind: 'coil', x: 115, y: 80, w: 15, h: 40, value: -2 }] });
    expect(at(solveFields(coil(true), 100), 100, 100)).toBeGreaterThan(3 * at(solveFields(coil(false), 100), 100, 100));
  });
  it('a plate capacitor: E = V/d between the plates, C near ε·w/d, more with a dielectric', () => {
    const cap = (er: number): FieldModel => ({ mode: 'electric', width: 200, height: 120, regions: [
      { id: 'top', kind: 'electrode', x: 20, y: 70, w: 160, h: 2, value: 100 }, { id: 'bot', kind: 'electrode', x: 20, y: 48, w: 160, h: 2, value: 0 },
      ...(er > 1 ? [{ id: 'd', kind: 'dielectric' as const, x: 20, y: 50, w: 160, h: 20, value: er }] : [])] });
    const r = solveFields(cap(1), 200), d = 0.02;
    expect(at(r, 100, 60) / (100 / d)).toBeCloseTo(1, 1);
    const ideal = (EPS0 * 0.16) / d;
    expect(r.capacitance! / ideal).toBeGreaterThan(1);
    expect(r.capacitance! / ideal).toBeLessThan(1.35);
    expect(solveFields(cap(4), 200).capacitance! / r.capacitance!).toBeGreaterThan(3);
    // The plates attract each other.
    expect(r.forces[0].fy).toBeLessThan(0);
  });
  it('a magnet’s field comes out of its north face', () => {
    const r = solveFields({ mode: 'magnetic', width: 200, height: 200, regions: [{ id: 'm', kind: 'magnet', x: 90, y: 80, w: 20, h: 40, value: 1.2, angle: 90 }] }, 100);
    const c = Math.floor(130 / r.h) * r.nx + Math.floor(100 / r.h);
    expect(r.fy[c]).toBeGreaterThan(0.05);
    expect(() => solveFields({ mode: 'electric', width: 100, height: 100, regions: [] })).toThrow(/electrode/);
  });
});
