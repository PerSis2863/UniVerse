import { describe, expect, it } from 'vitest';
import { boxStl, parseStl, stlSolid, voxels } from './stl';
import { solveSolid } from './solid';
import { MATERIALS, peak } from './structure';

const binary = (tris: Float32Array) => {
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, tris[t * 9 + k], true);
  return buf;
};
const text = (tris: Float32Array) => {
  let s = 'solid part\n';
  for (let t = 0; t < tris.length / 9; t++) s += `facet normal 0 0 0\nouter loop\n${[0, 1, 2].map((v) => `vertex ${tris[t * 9 + v * 3]} ${tris[t * 9 + v * 3 + 1]} ${tris[t * 9 + v * 3 + 2]}`).join('\n')}\nendloop\nendfacet\n`;
  return new TextEncoder().encode(`${s}endsolid part\n`).buffer;
};

describe('Hyperion Simulate: parts from STL files (M552)', () => {
  it('reads binary and text STL alike, and refuses what isn’t one', () => {
    const box = boxStl(10, 20, 30);
    expect([...parseStl(binary(box))]).toEqual([...box]);
    expect([...parseStl(text(box))]).toEqual([...box]);
    expect(() => parseStl(new TextEncoder().encode('hello').buffer)).toThrow(/STL/);
  });
  it('fills a closed surface with cubes: a box’s volume', () => {
    const v = voxels(boxStl(40, 20, 10), 2);
    expect(v.filled * 8).toBeCloseTo(40 * 20 * 10, -1);
  });
  it('a bar from a file pulled at one end has stress F/A and stretches FL/(EA)', () => {
    const steel = MATERIALS[0], F = 40_000;
    const s = stlSolid(boxStl(100, 20, 20), 9000);
    // The boxes are stretched to fit: the part solved is the file's size.
    const [L, w, d] = s.size, A = w * d;
    expect(s.size.map((v) => +v.toFixed(6))).toEqual([100, 20, 20]);
    expect([...s.faces.keys()].sort()).toEqual(['Back', 'Bottom', 'Front', 'Left', 'Right', 'Top']);
    const r = solveSolid(s, { thickness: 20, material: steel, gravity: false,
      supports: [{ id: 'a', kind: 'fixed', edges: ['Left'] }], loads: [{ id: 'f', kind: 'force', edges: ['Right'], F, angle: 0 }] });
    // Away from the held end (where it can't narrow) the stress is F/A.
    let mid = 0;
    for (let n = 0; n < s.x.length; n++) if (Math.abs(s.x[n] - L * 0.6) < Math.abs(s.x[mid] - L * 0.6) || (Math.abs(s.x[n] - L * 0.6) === Math.abs(s.x[mid] - L * 0.6) && Math.hypot(s.y[n] - d / 2, s.z[n] - w / 2) < Math.hypot(s.y[mid] - d / 2, s.z[mid] - w / 2))) mid = n;
    expect(r.sx[mid] / (F / A)).toBeGreaterThan(0.95);
    expect(r.sx[mid] / (F / A)).toBeLessThan(1.05);
    expect(peak(r.ux).value / ((F * L) / (steel.E * A))).toBeGreaterThan(0.97);
    expect(peak(r.ux).value / ((F * L) / (steel.E * A))).toBeLessThan(1.08);
  });
});
