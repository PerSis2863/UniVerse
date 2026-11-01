import { describe, expect, it } from 'vitest';
import { seeded } from './big-tools';
import { asciiArt, bingoCard, blobPath, chmodOctal, chmodText, csvToSql, det, inverse, jsonToTs, matMul, mix, molarMass, poemLines, regression, sampleSize, shiftHours, solveTriangle, subnet, tintsShades, typeScale, typingScore } from './tools-5';

describe('tools, fifth set', () => {
  it('scores typing', () => {
    expect(typingScore('hello world', 'hello world', 60000 / 5)).toMatchObject({ accuracy: 100, errors: 0 });
    expect(typingScore('abcde', 'abxde', 60000).accuracy).toBe(80);
  });
  it('counts syllables for poems', () => {
    expect(poemLines('An old silent pond\nA frog jumps into the pond\nSplash! Silence again').haiku).toBe(true);
  });
  it('weighs chemical formulas', () => {
    expect(molarMass('H2O').total).toBeCloseTo(18.015, 2);
    expect(molarMass('Ca(OH)2').total).toBeCloseTo(74.09, 1);
    expect(molarMass('CuSO4·5H2O').total).toBeCloseTo(249.68, 1);
    expect(() => molarMass('Xy2')).toThrow(/isn’t an element/);
    expect(() => molarMass('Ca(OH2')).toThrow();
  });
  it('solves triangles', () => {
    const t = solveTriangle({ a: 3, b: 4, c: 5 });
    expect(t.C).toBeCloseTo(90); expect(t.area).toBeCloseTo(6);
    expect(solveTriangle({ a: 5, B: 60, C: 60 }).b).toBeCloseTo(5);
    expect(() => solveTriangle({ a: 1, b: 1, c: 5 })).toThrow();
    expect(() => solveTriangle({ A: 60, B: 60, C: 60 })).toThrow();
  });
  it('does matrices', () => {
    expect(det([[1, 2], [3, 4]])).toBe(-2);
    expect(det([[2, 0, 1], [1, 3, 2], [1, 1, 2]])).toBe(6);
    const inv = inverse([[4, 7], [2, 6]]);
    expect(matMul([[4, 7], [2, 6]], inv).flat().map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0, 1]);
    expect(() => inverse([[1, 2], [2, 4]])).toThrow();
  });
  it('fits lines and sizes surveys', () => {
    const r = regression([[1, 2], [2, 4], [3, 6]])!;
    expect(r.slope).toBeCloseTo(2); expect(r.intercept).toBeCloseTo(0); expect(r.r2).toBeCloseTo(1);
    expect(sampleSize(95, 5, 0)).toBe(385);
    expect(sampleSize(95, 5, 1000)).toBe(278);
  });
  it('mixes colours and scales type', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(tintsShades('#ff0000', 3).tints).toHaveLength(3);
    expect(typeScale(16, 1.25, [0, 1])).toEqual([{ step: 0, px: 16 }, { step: 1, px: 20 }]);
  });
  it('writes SQL and TypeScript', () => {
    expect(csvToSql([['name', 'age'], ["O'Brien", '30']], 'people')).toContain("INSERT INTO people (name, age) VALUES ('O''Brien', 30);");
    expect(jsonToTs({ id: 1, tags: ['a'], owner: { name: 'x' } })).toContain('owner: Owner;');
  });
  it('reads permissions, subnets and shifts', () => {
    expect(chmodText('755')).toBe('rwxr-xr-x'); expect(chmodOctal('rw-r--r--')).toBe('644');
    expect(subnet('192.168.1.10/24')).toMatchObject({ network: '192.168.1.0', broadcast: '192.168.1.255', hosts: 254, private: true });
    expect(subnet('10.0.0.0/8').mask).toBe('255.0.0.0');
    expect(() => subnet('300.1.1.1/24')).toThrow();
    expect(shiftHours('09:00', '17:30', 30)).toBe(8);
    expect(shiftHours('22:00', '06:00', 0)).toBe(8);
  });
  it('makes bingo cards, ASCII art and blobs', () => {
    const card = bingoCard(seeded(4));
    expect(card[2][2]).toBeNull();
    expect(card.every((row) => row.every((v, c) => v === null || (v > c * 15 && v <= c * 15 + 15)))).toBe(true);
    expect(asciiArt(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1, 2)).toBe('@');
    expect(blobPath(6, 0.3, seeded(1))).toMatch(/^M[\d.,]+ Q.* Z$/);
  });
});
