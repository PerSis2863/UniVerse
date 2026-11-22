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

describe('Hyperion ensembles (M418)', () => {
  it('bagging and random forests: out-of-bag error, importance', () => {
    const r = run("rng(1)\nload fisheriris\nbag = fitcensemble(meas, species, 'Method', 'Bag', 'NumLearningCycles', 60);\nol = oobLoss(bag);\nrf = TreeBagger(80, meas, species, 'OOBPrediction', 'on');\ncurve = oobError(rf);\nimp = predictorImportance(rf);\nlab = predict(rf, [6.5 3 5.5 2]);\nis = strcmp(lab{1}, 'virginica');\ncv = kfoldLoss(crossval(bag, 'KFold', 5));");
    expect(r.d('ol')[0]).toBeLessThan(0.08);
    const curve = r.d('curve');
    expect(curve).toHaveLength(80);
    expect(curve[79]).toBeLessThan(0.08);
    const imp = r.d('imp');
    // The petals (3 and 4) matter far more than the sepals.
    expect(Math.min(imp[2], imp[3])).toBeGreaterThan(Math.max(imp[0], imp[1]));
    expect(r.d('is')).toEqual([1]);
    expect(r.d('cv')[0]).toBeLessThan(0.1);
  });

  it('boosting: AdaBoostM1 on a ring, AdaBoostM2 on three classes, LSBoost on numbers', () => {
    const r = run("rng(2)\nt = [linspace(0, 2*pi, 100) linspace(0, 2*pi, 100)]'; rr = [ones(100,1)*0.5; ones(100,1)*1.5] + 0.1*randn(200,1);\nX = [rr.*cos(t) rr.*sin(t)]; Y = [zeros(100,1); ones(100,1)];\nada = fitcensemble(X, Y);\ne1 = resubLoss(ada);\nm = ada.Method;\nstump = fitcensemble(X, Y, 'Learners', templateTree('MaxNumSplits', 1), 'NumLearningCycles', 2);\ne0 = resubLoss(stump);\nload fisheriris\nm2 = fitcensemble(meas, species, 'NumLearningCycles', 30);\ne2 = resubLoss(m2);\nx = linspace(0, 6, 80)'; y = sin(x);\nls = fitrensemble(x, y, 'NumLearningCycles', 200, 'LearnRate', 0.1);\ne3 = resubLoss(ls);");
    expect(r.d('e1')[0]).toBeLessThan(0.05);
    expect(r.d('e1')[0]).toBeLessThan(r.d('e0')[0]);
    expect(r.d('e2')[0]).toBeLessThan(0.03);
    expect(r.d('e3')[0]).toBeLessThan(0.005);
    expect(() => run("fitcensemble([1;2;3;4], [1;2;3;1], 'Method', 'AdaBoostM1')")).toThrow(/two classes/);
  });
});

describe('Hyperion automatic tuning (M419)', () => {
  it('Bayesian optimisation finds a minimum in few tries; settings map to the unit box and back', async () => {
    const { tune, decode, encode } = await import('./ml-tune');
    const vars = [{ name: 'x', type: 'real' as const, range: [0, 1] as [number, number], log: false }, { name: 'c', type: 'real' as const, range: [1e-3, 1e3] as [number, number], log: true }];
    const r = tune(vars, ([x, c]) => (Number(x) - 0.3) ** 2 + (Math.log10(Number(c)) - 1) ** 2, seeded(4), { evals: 25 });
    const [x, c] = r.tried[r.best].map(Number);
    expect(Math.abs(x - 0.3)).toBeLessThan(0.08);
    expect(Math.abs(Math.log10(c) - 1)).toBeLessThan(0.25);
    expect(decode(vars, encode(vars, [0.25, 100])).map((v) => +Number(v).toFixed(9))).toEqual([0.25, 100]);
    const cats = [{ name: 'k', type: 'categorical' as const, range: ['a', 'b', 'c'], log: false }, { name: 'n', type: 'integer' as const, range: [1, 10] as [number, number], log: false }];
    expect(decode(cats, encode(cats, ['b', 7]))).toEqual(['b', 7]);
    const grid = tune(cats, () => 1, seeded(1), { method: 'gridsearch', divisions: 4, evals: 100 });
    expect(grid.tried).toHaveLength(12);
  });

  it('tunes a model by its cross-validated error, and bayesopt tunes any function', () => {
    const r = run("rng(1)\nload fisheriris\nm = fitcknn(meas, species, 'OptimizeHyperparameters', 'auto', 'HyperparameterOptimizationOptions', struct('MaxObjectiveEvaluations', 10, 'ShowPlots', false, 'Verbose', 0));\nk = m.NumNeighbors;\nres = m.HyperparameterOptimizationResults;\nn = height(res);\nbest = min(res.Objective);\ns = fitcsvm(meas(51:end, 3:4), species(51:end), 'KernelFunction', 'rbf', 'OptimizeHyperparameters', {'BoxConstraint'}, 'HyperparameterOptimizationOptions', struct('Optimizer', 'gridsearch', 'NumGridDivisions', 5, 'ShowPlots', false, 'Verbose', 0));\nns = height(s.HyperparameterOptimizationResults);\nx = optimizableVariable('x', [-5 5]);\nb = bayesopt(@(t) (t.x - 1.5)^2, x, 'MaxObjectiveEvaluations', 15, 'Verbose', 0, 'PlotFcn', []);\nxb = b.XAtMinObjective.x;");
    expect(r.d('n')).toEqual([10]);
    expect(r.d('best')[0]).toBeLessThan(0.07);
    expect(r.d('k')[0]).toBeGreaterThanOrEqual(1);
    expect(r.d('ns')).toEqual([5]);
    expect(Math.abs(r.d('xb')[0] - 1.5)).toBeLessThan(0.2);
    expect(() => run("fitcnb([1 2;3 4;5 6;7 8], [1;1;2;2], 'OptimizeHyperparameters', 'auto')")).toThrow(/no settings to tune/);
  });

  it('prints each try and draws the best so far', () => {
    const r = run("rng(2)\nload fisheriris\nm = fitctree(meas, species, 'OptimizeHyperparameters', 'auto', 'HyperparameterOptimizationOptions', struct('MaxObjectiveEvaluations', 5));");
    expect(r.out).toContain('Tuning classification tree by Bayesian optimisation (5 tries)');
    expect(r.out).toMatch(/Best: MinLeafSize = \d+/);
  });
});
