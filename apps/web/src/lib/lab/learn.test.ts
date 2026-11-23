import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import './ml-lab';
import { crossValidate, csvColumns, csvData, irisData, LEARNER_IDS, LEARNERS, madeData, MADE, regionGrid, scriptFor } from './learn';

describe('Hyperion Learn (M421): the engine', () => {
  it('makes the shapes, balanced', () => {
    for (const { id } of MADE) {
      const d = madeData(id, 120, 0.1, 3);
      expect(d.X).toHaveLength(120);
      const counts = d.classes.map((_, k) => d.y.filter((c) => c === k).length);
      expect(Math.min(...counts)).toBeGreaterThan(25);
    }
  });

  it('curved shapes need curved learners: a straight boundary fails on circles, neighbours and SVMs don’t', () => {
    const circles = madeData('circles', 200, 0.08, 2);
    expect(crossValidate('lda', circles, 5).accuracy).toBeLessThan(0.7);
    expect(crossValidate('knn', circles, 5).accuracy).toBeGreaterThan(0.95);
    expect(crossValidate('svm', circles, 5).accuracy).toBeGreaterThan(0.95);
    const moons = madeData('moons', 200, 0.1, 4);
    expect(crossValidate('forest', moons, 5).accuracy).toBeGreaterThan(0.93);
    expect(crossValidate('net', moons, 5).accuracy).toBeGreaterThan(0.93);
  });

  it('every learner does well on the iris flowers (logistic regression: two of them)', () => {
    const iris = irisData();
    for (const id of LEARNER_IDS.filter((l) => !LEARNERS[l].twoOnly)) {
      const r = crossValidate(id, iris, 5);
      expect(r.accuracy, id).toBeGreaterThan(0.9);
      expect(r.confusion.flat().reduce((s, v) => s + v, 0)).toBe(150);
    }
    const two = { ...iris, X: iris.X.slice(50), y: iris.y.slice(50).map((c) => c - 1), classes: iris.classes.slice(1) };
    expect(crossValidate('logistic', two, 5).accuracy).toBeGreaterThan(0.9);
  });

  it('draws decision regions on two predictors', () => {
    const g = regionGrid('tree', irisData(), 2, 3, 60, 40);
    expect(g.cls).toHaveLength(2400);
    expect(new Set(g.cls).size).toBe(3);
    // Short, narrow petals (the bottom left) are setosa.
    expect(g.cls[39 * 60]).toBe(0);
  });

  it('reads a CSV and writes a script Hyperion runs', () => {
    const csv = 'a,b,kind\n1,2,x\n2,3,x\n3,1,y\n4,2,y\n5,5,z\n';
    expect(csvColumns(csv).numeric).toEqual([true, true, false]);
    const d = csvData(csv, 2, [0, 1]);
    expect(d.classes).toEqual(['x', 'y', 'z']);
    expect(d.X[2]).toEqual([3, 1]);
    for (const [id, data] of [['knn', irisData()], ['tree', madeData('moons', 80, 0.1, 1)], ['lda', madeData('blobs', 90, 0.1, 1)], ['tree', madeData('spirals', 80, 0.05, 1)], ['knn', madeData('xor', 80, 0.1, 1)], ['knn', madeData('circles', 80, 0.1, 1)]] as const) {
      let out = '';
      new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }).run(scriptFor(id, data, 5));
      expect(out, `${id} ${data.name}`).toMatch(/Cross-validated accuracy: \d+\.\d%/);
    }
  });
});
