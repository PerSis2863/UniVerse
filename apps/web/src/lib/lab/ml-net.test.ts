import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat } from './values';
import './ml-lab';
import { lossGrad, netPredictor, trainNet } from './ml-net';
import { irisRows } from './iris';
import { colStats, standardise } from './ml';

const run = (code: string) => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics() }); lab.run(code); return { out, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const seeded = (s: number) => () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);

describe('Hyperion neural networks (M417)', () => {
  it('backpropagation agrees with the slope measured by small nudges', () => {
    const rand = seeded(3), X = Array.from({ length: 7 }, () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
    for (const [act, K, lambda] of [['tanh', 3, 0], ['sigmoid', 2, 0.1], ['relu', 0, 0.05], ['none', 0, 0]] as const) {
      const sizes = [3, 4, 5, K || 1], y = X.map((_, i) => (K ? i % K : Math.sin(i))), P = sizes.slice(1).reduce((s, v, i) => s + v * (sizes[i] + 1), 0);
      const th = Float64Array.from({ length: P }, () => rand() - 0.5), [, g] = lossGrad([...sizes], act, K, lambda, X, y, th);
      for (let i = 0; i < P; i += 3) {
        const h = 1e-6, up = Float64Array.from(th), dn = Float64Array.from(th);
        up[i] += h; dn[i] -= h;
        const num = (lossGrad([...sizes], act, K, lambda, X, y, up)[0] - lossGrad([...sizes], act, K, lambda, X, y, dn)[0]) / (2 * h);
        expect(g[i]).toBeCloseTo(num, 6);
      }
    }
  });

  it('learns XOR, which no straight line can', () => {
    const X = [[0, 0], [0, 1], [1, 0], [1, 1]], y = [0, 1, 1, 0], net = trainNet(X, y, seeded(1), { layers: [8], act: 'tanh', K: 2 }), f = netPredictor(net);
    expect(X.map((x) => (f(x)[1] > 0.5 ? 1 : 0))).toEqual(y);
    expect(net.history[net.history.length - 1]).toBeLessThan(0.01);
  });

  it('classifies the iris flowers and fits a sine wave', () => {
    const X = irisRows(), y = X.map((_, i) => Math.floor(i / 50)), s = colStats(X), Z = standardise(X, s.mu, s.sd);
    const f = netPredictor(trainNet(Z, y, seeded(5), { layers: [10], K: 3 }));
    expect(Z.filter((z, i) => { const p = f(z); return p.indexOf(Math.max(...p)) !== y[i]; }).length).toBeLessThanOrEqual(2);
    const xs = Array.from({ length: 60 }, (_, i) => -Math.PI + (2 * Math.PI * i) / 59), g = netPredictor(trainNet(xs.map((x) => [x]), xs.map(Math.sin), seeded(2), { layers: [20], act: 'tanh' }));
    const rmse = Math.sqrt(xs.reduce((acc, x) => acc + (g([x])[0] - Math.sin(x)) ** 2, 0) / xs.length);
    expect(rmse).toBeLessThan(0.02);
  });

  it('in the language: fitcnet and fitrnet, history, cross-validation', () => {
    const r = run("rng(0)\nload fisheriris\nnet = fitcnet(meas, species, 'Standardize', true, 'LayerSizes', [10 5]);\ne = resubLoss(net);\nh = net.TrainingHistory.TrainingLoss;\nfirst = h(1); last = h(end);\nnw = numel(net.LayerWeights);\ncv = crossval(net, 'KFold', 5); ce = kfoldLoss(cv);\nx = linspace(0, 1, 40)'; y = x.^2;\nrn = fitrnet(x, y, 'Activations', 'tanh', 'LayerSizes', 8);\nyh = predict(rn, 0.5);");
    expect(r.d('e')[0]).toBeLessThanOrEqual(0.02);
    expect(r.d('last')[0]).toBeLessThan(r.d('first')[0] / 10);
    expect(r.d('nw')).toEqual([3]);
    expect(r.d('ce')[0]).toBeLessThan(0.1);
    expect(r.d('yh')[0]).toBeCloseTo(0.25, 2);
    expect(() => run("fitcnet([1;2;3], [1;2;3], 'Activations', 'swish')")).toThrow(/relu/);
  });
});
