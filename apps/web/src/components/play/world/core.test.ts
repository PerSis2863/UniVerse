import { describe, expect, it } from 'vitest';
import { Body, THREE } from './core';

const floor = new THREE.Box3(new THREE.Vector3(-32, -1, -32), new THREE.Vector3(32, 0, 32));
const wall = new THREE.Box3(new THREE.Vector3(3, 0, -32), new THREE.Vector3(4, 6, 32));

describe('Body', () => {
  it('jumps straight up from the floor (no sideways push to its edge)', () => {
    const b = new Body([0, 0, 0]);
    b.step(1 / 60, [floor]);
    expect(b.ground).toBe(true);
    b.vel.set(2, 10.5, -3);
    b.step(1 / 60, [floor]);
    expect(Math.abs(b.pos.x)).toBeLessThan(0.1);
    expect(Math.abs(b.pos.z)).toBeLessThan(0.1);
    for (let i = 0; i < 120; i++) b.step(1 / 60, [floor]);
    expect(b.ground).toBe(true);
    expect(b.pos.y).toBeCloseTo(0);
  });
  it('is still stopped by walls', () => {
    const b = new Body([2, 0, 0]);
    for (let i = 0; i < 60; i++) { b.vel.x = 5; b.step(1 / 60, [floor, wall]); }
    expect(b.pos.x).toBeLessThan(3);
  });
});
