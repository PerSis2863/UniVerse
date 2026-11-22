import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { inline, toMat } from './values';
import './ml-lab';
import * as ml from './ml';
import { IRIS_SPECIES, irisRows } from './iris';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, lab, graphics, v: (n: string) => inline(lab.vars.get(n)!, { long: true }), d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const X = irisRows(), y = X.map((_, i) => Math.floor(i / 50));
const errors = (pred: number[], truth = y) => pred.filter((p, i) => p !== truth[i]).length;
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

describe('Hyperion machine learning (M416): the methods', () => {
  it('has Fisher’s iris flowers', () => {
    expect(X).toHaveLength(150);
    expect(IRIS_SPECIES).toEqual(['setosa', 'versicolor', 'virginica']);
    expect(ml.colStats(X).mu.map((v) => +v.toFixed(4))).toEqual([5.8433, 3.0573, 3.758, 1.1993]);
  });

  it('k-nearest neighbours: one neighbour knows every training flower; five get almost all', () => {
    expect(errors(X.map((x) => ml.knn(X, y, 3, 1, x).cls))).toBe(0);
    expect(errors(X.map((x) => ml.knn(X, y, 3, 5, x).cls))).toBeLessThanOrEqual(6);
  });

  it('a decision tree finds the textbook splits: petal length 2.45, then petal width 1.75', () => {
    const t = ml.growTree(X.map((r) => [r[2], r[3]]), y, { K: 3 });
    expect([t.pred[0], t.cut[0]]).toEqual([0, 2.45]);
    const right = t.right[0];
    expect([t.pred[right], t.cut[right]]).toEqual([1, 1.75]);
    expect(t.value[t.left[0]]).toBe(0);
    const stump = ml.growTree(X, y, { K: 3, maxSplits: 2 });
    expect(stump.pred.filter((p) => p >= 0)).toHaveLength(2);
    expect(errors(X.map((x) => stump.value[ml.treeLeaf(stump, x)]))).toBe(6);
  });

  it('linear discriminant analysis gets all but 3 flowers (Fisher’s result); naive Bayes 6', () => {
    const lda = ml.fitLDA(X, y, 3), nb = ml.fitNB(X, y, 3);
    const argmax = (p: number[]) => p.indexOf(Math.max(...p));
    expect(errors(X.map((x) => argmax(ml.ldaPosterior(lda, x))))).toBe(3);
    expect(errors(X.map((x) => argmax(ml.nbPosterior(nb, x))))).toBe(6);
  });

  it('a support vector machine finds the widest gap between two groups', () => {
    const m = ml.fitSVM([[0, 0], [0, 1], [2, 0], [2, 1]], [-1, -1, 1, 1], { C: 100 });
    const w = [0, 1].map((j) => m.alpha.reduce((s, a, q) => s + a * m.svY[q] * m.sv[q][j], 0));
    expect(w[0]).toBeCloseTo(1, 3);
    expect(w[1]).toBeCloseTo(0, 3);
    expect(m.bias).toBeCloseTo(-1, 3);
    // A curved boundary with the radial kernel: points inside a circle against those outside.
    const P: number[][] = [], t: number[] = [];
    for (let i = 0; i < 120; i++) { const a = rand() * 2 * Math.PI, r = i % 2 ? 0.5 * rand() : 1.5 + rand(); P.push([r * Math.cos(a), r * Math.sin(a)]); t.push(i % 2 ? 1 : -1); }
    const rbf = ml.fitSVM(P, t, { kernel: 'rbf', scale: 1, C: 10 });
    expect(rbf.converged).toBe(true);
    expect(P.filter((p, i) => Math.sign(ml.svmScore(rbf, p)) !== t[i])).toHaveLength(0);
  });

  it('least squares: exact coefficients, and p-values from the t distribution', () => {
    const P = [[1, 4], [2, 1], [3, 5], [4, 2], [5, 7], [6, 3]], f = ml.linearFit(P, P.map(([a, b]) => 2 + 3 * a - b));
    f.b.forEach((v, i) => expect(v).toBeCloseTo([2, 3, -1][i], 9));
    expect(f.r2).toBeCloseTo(1, 12);
    expect(ml.tPValue(2.228138852, 10)).toBeCloseTo(0.05, 6);
    expect(ml.tPValue(1.959963985, 1e6)).toBeCloseTo(0.05, 4);
    // The slope's standard error is √(s² / Σ(x − x̄)²).
    const xs = [1, 2, 3, 4, 5], ys = [1, 2, 1.3, 3.75, 2.25], g = ml.linearFit(xs.map((v) => [v]), ys);
    const sxx = 10, s2 = ys.reduce((s, v, i) => s + (v - g.fitted[i]) ** 2, 0) / 3;
    expect(g.se[1]).toBeCloseTo(Math.sqrt(s2 / sxx), 12);
  });

  it('logistic regression matches the log odds of a two-by-two table', () => {
    // x = 0: 3 of 10 succeed; x = 1: 7 of 10.
    const P = Array.from({ length: 20 }, (_, i) => [i < 10 ? 0 : 1]), Y = Array.from({ length: 20 }, (_, i) => ((i < 10 ? i < 3 : i - 10 < 7) ? 1 : 0));
    const f = ml.logisticFit(P, Y);
    expect(f.converged).toBe(true);
    expect(f.b[0]).toBeCloseTo(Math.log(3 / 7), 8);
    expect(f.b[1]).toBeCloseTo(2 * Math.log(7 / 3), 8);
    expect(f.se[1]).toBeCloseTo(Math.sqrt(1 / 3 + 1 / 7 + 1 / 7 + 1 / 3), 6);
  });

  it('k-means finds iris’s best three clusters (within-cluster sum 78.85); PCA its variance shares', () => {
    const r = ml.kmeans(X, 3, rand, { replicates: 5 });
    expect(r.total).toBeCloseTo(78.851, 2);
    const p = ml.pca(X);
    expect(p.explained.map((v) => +v.toFixed(2))).toEqual([92.46, 5.31, 1.71, 0.52]);
    expect(p.coeff[2][0]).toBeCloseTo(0.8567, 3);
  });

  it('DBSCAN: two dense groups and a stray point', () => {
    const P = [[0, 0], [0, 0.1], [0.1, 0], [5, 5], [5, 5.1], [5.1, 5], [10, 0]];
    expect(ml.dbscan(P, 0.3, 2).idx).toEqual([1, 1, 1, 2, 2, 2, -1]);
  });

  it('folds keep each class’s share; ROC areas', () => {
    const f = ml.folds(y, 10, rand);
    for (let k = 0; k < 10; k++) for (let c = 0; c < 3; c++) expect(f.filter((v, i) => v === k && y[i] === c)).toHaveLength(5);
    expect(ml.roc([true, false, true, false], [0.9, 0.8, 0.7, 0.6]).auc).toBeCloseTo(0.75, 12);
    expect(ml.roc([true, true, false], [3, 2, 1]).auc).toBe(1);
  });
});

describe('Hyperion machine learning (M416): in the language', () => {
  it('loads the iris flowers, learns a tree and predicts', () => {
    const r = run("load fisheriris\nmdl = fitctree(meas, species);\nlabel = predict(mdl, [5 3.4 1.5 0.2; 6.7 3 5.2 2.3]);\nl1 = label{1}; l2 = label{2};\nn = mdl.NumObservations;\nfirst = mdl.CutPredictor{1};");
    expect([r.v('l1'), r.v('l2')]).toEqual(["'setosa'", "'virginica'"]);
    expect(r.v('n')).toBe('150');
    expect(r.v('first')).toBe("'x3'");
  });

  it('cross-validates, counts mistakes and draws a confusion chart', () => {
    const r = run("rng(1)\nload fisheriris\nknn = fitcknn(meas, species, 'NumNeighbors', 5);\ncv = crossval(knn, 'KFold', 5);\nerr = kfoldLoss(cv);\n[C, order] = confusionmat(species, kfoldPredict(cv));\no3 = order{3};\nlda = fitcdiscr(meas, species);\nr = resubLoss(lda);\nconfusionchart(species, predict(lda, meas))");
    const err = Number(r.v('err'));
    expect(err).toBeGreaterThan(0);
    expect(err).toBeLessThan(0.08);
    expect(Number(r.v('r'))).toBeCloseTo(0.02, 12);
    expect(r.v('o3')).toBe("'virginica'");
    const C = r.d('C');
    expect([C[0], C[1], C[2], C[3], C[6]]).toEqual([50, 0, 0, 0, 0]);
    expect(C.reduce((s, v) => s + v, 0)).toBe(150);
    expect(r.graphics.figures.length).toBeGreaterThan(0);
  });

  it('SVMs: two classes with fitcsvm, three with fitcecoc', () => {
    const r = run("load fisheriris\nkeep = ~strcmp(species, 'setosa');\nsvm = fitcsvm(meas(keep, 3:4), species(keep), 'KernelFunction', 'rbf', 'KernelScale', 'auto');\ne1 = resubLoss(svm);\necoc = fitcecoc(meas, species);\ne2 = resubLoss(ecoc);\n[lab, score] = predict(svm, [4 1.2]);\nl = lab{1};");
    expect(Number(r.v('e1'))).toBeLessThan(0.08);
    expect(Number(r.v('e2'))).toBeLessThan(0.05);
    expect(r.v('l')).toBe("'versicolor'");
  });

  it('linear and logistic models from a table, with their coefficients', () => {
    const r = run("x1 = (1:8)'; x2 = [3 1 4 1 5 9 2 6]'; y = 1 + 2*x1 - 0.5*x2;\nT = table(x1, x2, y, 'VariableNames', {'x1', 'x2', 'y'});\nlm = fitlm(T, 'y ~ x1 + x2');\nb = lm.Coefficients.Estimate';\nr2 = lm.Rsquared.Ordinary;\nyhat = predict(lm, [10 0]);\ng = fitglm([0;0;0;0;1;1;1;1], [0;0;0;1;0;1;1;1], 'Distribution', 'binomial');\np = predict(g, 1);");
    r.d('b').forEach((v, i) => expect(v).toBeCloseTo([1, 2, -0.5][i], 10));
    expect(r.d('r2')[0]).toBeCloseTo(1, 12);
    expect(r.d('yhat')[0]).toBeCloseTo(21, 10);
    expect(Number(r.v('p'))).toBeCloseTo(0.75, 6);
  });

  it('clusters, components, partitions and repeatable random numbers', () => {
    const r = run("rng(3); a = rand(1, 3); rng(3); b = rand(1, 3); same = isequal(a, b);\nload fisheriris\n[idx, C] = kmeans(meas, 3, 'Replicates', 5);\nk = numel(unique(idx));\n[coeff, score, latent, ~, explained] = pca(meas);\nc = cvpartition(species, 'HoldOut', 0.2);\nnt = sum(test(c, 1)); ntr = sum(training(c, 1));\np = randperm(5);");
    expect(r.v('same')).toBe('1');
    expect(r.v('k')).toBe('3');
    expect(r.d('explained')[0]).toBeCloseTo(92.4619, 3);
    expect([r.v('nt'), r.v('ntr')]).toEqual(['30', '120']);
    expect(r.d('p').sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('explains mistakes in plain words', () => {
    expect(() => run('fitcsvm([1;2;3], [1;2;3])')).toThrow(/two classes/);
    expect(() => run('fitcknn([1 2; 3 4], [1; 2; 3])')).toThrow(/one answer per row/);
    expect(() => run('mdl = fitctree([1 2;2 1;3 4;4 3], [1;1;2;2]); predict(mdl, [1 2 3])')).toThrow(/2 predictors/);
  });
});
