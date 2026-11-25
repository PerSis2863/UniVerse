// Hyperion's maths teaching (M503, the owner's list, group 7: "mathematics teaching"): worked examples, step by step,
// on the symbolic maths of M396: derivatives naming each rule (sum, constant multiple, power, product, quotient, chain,
// the table), integrals by linearity, the power rule, the table and a substitution check, equations (linear and the
// quadratic formula with its discriminant), and linear algebra with exact fractions (Gauss–Jordan elimination row
// operation by row operation, a determinant from the pivots, eigenvalues from the characteristic polynomial). Each step
// is LaTeX for the window and plain text for copying. Pure: no language values here.
import * as S from './sym';
import { integrate, simplify, solveFor } from './sym-calc';
import type { N } from './sym';

export interface Step { rule: string; tex: string; plain: string }
const T = (e: N) => S.latex(e), P = (e: N) => S.print(e);
const tidy = (e: N) => simplify(e);
const dd = (x: string, e: N) => `\\frac{d}{d${x}}\\left[${T(e)}\\right]`;

/** d/dx of e with every rule written down; returns the derivative and the steps (outermost first). */
export function diffSteps(e: N, x: string): { result: N; steps: Step[] } {
  const steps: Step[] = [];
  const say = (rule: string, from: N, rhsTex: string, rhsPlain: string) => steps.push({ rule, tex: `${dd(x, from)} = ${rhsTex}`, plain: `d/d${x} [${P(from)}] = ${rhsPlain}` });
  const go = (f: N): N => {
    if (!S.has(f, x)) { say('a constant', f, '0', '0'); return S.ZERO; }
    if (f.t === 's') { say(`the derivative of ${x}`, f, '1', '1'); return S.ONE; }
    if (f.t === '+') {
      say('the sum rule: differentiate each term', f, f.a.map((t) => dd(x, t)).join(' + '), f.a.map((t) => `d/d${x}[${P(t)}]`).join(' + '));
      return S.add(...f.a.map(go));
    }
    if (f.t === '*') {
      const k = f.a.filter((t) => !S.has(t, x)), v = f.a.filter((t) => S.has(t, x));
      if (k.length) { const c = S.mul(...k), u = S.mul(...v); say('the constant multiple rule', f, `${T(c)}\\,${dd(x, u)}`, `${P(c)} · d/d${x}[${P(u)}]`); return S.mul(c, go(u)); }
      const den = v.filter((t) => t.t === '^' && S.isNum(t.e) && S.val(t.e) < 0), num = v.filter((t) => !den.includes(t));
      if (den.length && num.length) {
        const u = S.mul(...num), w = S.mul(...den.map((t) => S.pow((t as { b: N }).b, S.neg((t as { e: N }).e))));
        say('the quotient rule: (u′v − uv′) / v²', f, `\\frac{${dd(x, u)}\\,${T(w)} - ${T(u)}\\,${dd(x, w)}}{${T(S.pow(w, S.rat(2)))}}`, `(d/d${x}[${P(u)}]·${P(w)} − ${P(u)}·d/d${x}[${P(w)}]) / (${P(w)})^2`);
        const du = go(u), dw = go(w);
        return S.div(S.sub(S.mul(du, w), S.mul(u, dw)), S.pow(w, S.rat(2)));
      }
      const [a, ...rest] = v, b = S.mul(...rest);
      say('the product rule: (uv)′ = u′v + uv′', f, `${dd(x, a)}\\,${T(b)} + ${T(a)}\\,${dd(x, b)}`, `d/d${x}[${P(a)}]·${P(b)} + ${P(a)}·d/d${x}[${P(b)}]`);
      return S.add(S.mul(go(a), b), S.mul(a, go(b)));
    }
    if (f.t === '^') {
      const { b, e: p } = f;
      if (!S.has(p, x)) {
        const out = S.mul(p, S.pow(b, S.sub(p, S.ONE)));
        if (b.t === 's') { say('the power rule: (xⁿ)′ = n xⁿ⁻¹', f, T(out), P(out)); return out; }
        say('the chain rule with the power rule: (uⁿ)′ = n uⁿ⁻¹ u′', f, `${T(out)}\\cdot${dd(x, b)}`, `${P(out)} · d/d${x}[${P(b)}]`);
        return S.mul(out, go(b));
      }
      if (!S.has(b, x)) { say('the exponential rule: (aᵘ)′ = aᵘ ln a · u′', f, `${T(f)}\\ln ${T(b)}\\cdot${dd(x, p)}`, `${P(f)}·log(${P(b)})·d/d${x}[${P(p)}]`); return S.mul(f, S.fn('log', b), go(p)); }
      const r = S.diff(f, x); say('logarithmic differentiation', f, T(r), P(r)); return r;
    }
    if (f.t === 'fn') {
      const u = f.a[0], outer = S.diff(S.fn(f.name, S.sym('_u')), '_u'), at = S.subst(outer, S.sym('_u'), u);
      if (u.t === 's' && u.name === x) { say(`the table: the derivative of ${f.name}`, f, T(at), P(at)); return at; }
      say(`the chain rule: the derivative of ${f.name} at the inside, times the inside's derivative`, f, `${T(at)}\\cdot${dd(x, u)}`, `${P(at)} · d/d${x}[${P(u)}]`);
      return S.mul(at, go(u));
    }
    const r = S.diff(f, x); say('the rules above', f, T(r), P(r)); return r;
  };
  const raw = go(e), result = tidy(raw);
  steps.push({ rule: 'simplified', tex: `\\frac{d}{d${x}}\\left[${T(e)}\\right] = ${T(result)}`, plain: `d/d${x} [${P(e)}] = ${P(result)}` });
  return { result, steps };
}

/** ∫ e dx by linearity, the power rule and the table where they apply, otherwise by the integrator; with limits, F(b) − F(a). */
export function intSteps(e: N, x: string, lim?: [N, N]): { result: N | null; steps: Step[] } {
  const steps: Step[] = [], X = S.sym(x), I = (f: N) => `\\int ${T(f)}\\,d${x}`;
  const say = (rule: string, f: N, rhs: N | string, rhsPlain?: string) => steps.push({ rule, tex: `${I(f)} = ${typeof rhs === 'string' ? rhs : T(rhs)}`, plain: `∫ ${P(f)} d${x} = ${typeof rhs === 'string' ? rhsPlain : P(rhs)}` });
  const go = (f: N): N | null => {
    if (!S.has(f, x)) { const r = S.mul(f, X); say('a constant', f, r); return r; }
    if (f.t === '+') { say('linearity: integrate each term', f, f.a.map(I).join(' + '), f.a.map((t) => `∫ ${P(t)} d${x}`).join(' + ')); const parts = f.a.map(go); return parts.every(Boolean) ? S.add(...(parts as N[])) : null; }
    if (f.t === '*') {
      const k = f.a.filter((t) => !S.has(t, x)), v = f.a.filter((t) => S.has(t, x));
      if (k.length) { const c = S.mul(...k), u = S.mul(...v); say('a constant comes outside', f, `${T(c)}${I(u)}`, `${P(c)} · ∫ ${P(u)} d${x}`); const r = go(u); return r ? S.mul(c, r) : null; }
    }
    if (f.t === 's') { const r = S.div(S.pow(X, S.rat(2)), S.rat(2)); say('the power rule: ∫ xⁿ dx = xⁿ⁺¹/(n+1)', f, r); return r; }
    if (f.t === '^' && f.b.t === 's' && f.b.name === x && !S.has(f.e, x)) {
      if (S.isNum(f.e) && S.val(f.e) === -1) { const r = S.fn('log', S.fn('abs', X)); say('the table: ∫ 1/x dx = ln|x|', f, r); return r; }
      const n1 = S.add(f.e, S.ONE), r = S.div(S.pow(X, n1), n1); say('the power rule: ∫ xⁿ dx = xⁿ⁺¹/(n+1)', f, r); return r;
    }
    const r = integrate(f, x);
    if (r) { const back = simplify(S.sub(S.diff(r, x), f)); say(S.isZero(back) ? 'the table or a substitution (checked: its derivative gives the integrand back)' : 'the integrator', f, r); return r; }
    steps.push({ rule: 'no closed form found', tex: `${I(f)}\\ \\text{has no elementary form here}`, plain: `∫ ${P(f)} d${x}: no elementary form found` });
    return null;
  };
  const F = go(e);
  if (!F) return { result: null, steps };
  const Fs = simplify(F);
  steps.push({ rule: 'together, plus the constant of integration', tex: `${I(e)} = ${T(Fs)} + C`, plain: `∫ ${P(e)} d${x} = ${P(Fs)} + C` });
  if (!lim) return { result: Fs, steps };
  const [a, b] = lim, Fb = simplify(S.subst(Fs, X, b)), Fa = simplify(S.subst(Fs, X, a)), v = simplify(S.sub(Fb, Fa));
  steps.push({ rule: 'the fundamental theorem: F(b) − F(a)', tex: `\\int_{${T(a)}}^{${T(b)}} ${T(e)}\\,d${x} = \\left(${T(Fb)}\\right) - \\left(${T(Fa)}\\right) = ${T(v)}`, plain: `∫ from ${P(a)} to ${P(b)} = (${P(Fb)}) − (${P(Fa)}) = ${P(v)}` });
  return { result: v, steps };
}

/** Solving an equation for x: a linear one by moving terms, a quadratic by the formula with its discriminant, others by
 * the solver. */
export function solveSteps(e0: N, x: string): { result: N[]; steps: Step[] } {
  const steps: Step[] = [], lhs = e0.t === '=' ? S.sub(e0.l, e0.r) : e0, e = S.expand(lhs), cs = S.polyOf(e, x);
  steps.push({ rule: 'everything on one side', tex: `${T(e)} = 0`, plain: `${P(e)} = 0` });
  if (cs && cs.length === 2) {
    const r = simplify(S.div(S.neg(cs[0]), cs[1]));
    steps.push({ rule: 'move the constant across, divide by the coefficient', tex: `${x} = \\frac{${T(S.neg(cs[0]))}}{${T(cs[1])}} = ${T(r)}`, plain: `${x} = ${P(S.neg(cs[0]))} / ${P(cs[1])} = ${P(r)}` });
    return { result: [r], steps };
  }
  if (cs && cs.length === 3) {
    const [c, b, a] = cs, D = simplify(S.sub(S.pow(b, S.rat(2)), S.mul(S.rat(4), a, c)));
    steps.push({ rule: 'a quadratic: read a, b and c', tex: `a = ${T(a)},\\ b = ${T(b)},\\ c = ${T(c)}`, plain: `a = ${P(a)}, b = ${P(b)}, c = ${P(c)}` });
    steps.push({ rule: 'the discriminant b² − 4ac', tex: `\\Delta = ${T(b)}^2 - 4\\cdot${T(a)}\\cdot${T(c)} = ${T(D)}`, plain: `Δ = ${P(D)}` });
    const sign = S.isNum(D) ? Math.sign(S.val(D)) : NaN;
    steps.push({ rule: sign > 0 ? 'Δ > 0: two real roots' : sign === 0 ? 'Δ = 0: one repeated root' : sign < 0 ? 'Δ < 0: two complex roots' : 'the roots', tex: `${x} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}`, plain: `${x} = (−b ± √Δ) / (2a)` });
    const roots = [S.ONE, S.MINUS].map((s) => simplify(S.div(S.add(S.neg(b), S.mul(s, S.sqrt(D))), S.mul(S.rat(2), a))));
    const uniq = sign === 0 ? [roots[0]] : roots;
    steps.push({ rule: 'the roots', tex: uniq.map((r) => `${x} = ${T(r)}`).join(',\\quad '), plain: uniq.map((r) => `${x} = ${P(r)}`).join(', ') });
    return { result: uniq, steps };
  }
  const r = solveFor(e, x);
  steps.push({ rule: r.length ? 'by the solver (factoring and the rational-root test)' : 'no solution found', tex: r.length ? r.map((v) => `${x} = ${T(v)}`).join(',\\quad ') : '\\text{none found}', plain: r.map((v) => `${x} = ${P(v)}`).join(', ') || 'none found' });
  return { result: r, steps };
}

// ——— Linear algebra with exact fractions ———
const texM = (A: N[][]) => `\\left[\\begin{array}{${'c'.repeat(A[0].length)}}${A.map((r) => r.map(T).join(' & ')).join(' \\\\ ')}\\end{array}\\right]`;
const plainM = (A: N[][]) => `[${A.map((r) => r.map(P).join(' ')).join('; ')}]`;
const R = (i: number) => `R_{${i + 1}}`, Rp = (i: number) => `R${i + 1}`;
/** Gauss–Jordan to reduced row echelon form, one row operation at a time; also the pivots' product and the swaps. */
export function rrefSteps(A0: N[][]) {
  const A = A0.map((r) => r.slice()), m = A.length, n = A[0].length, steps: Step[] = [{ rule: 'the matrix', tex: texM(A), plain: plainM(A) }];
  let row = 0, swaps = 0, det: N = S.ONE;
  const pivots: number[] = [];
  const show = (rule: string, tex: string, plain: string) => steps.push({ rule, tex: `${tex}\\quad\\Rightarrow\\quad ${texM(A)}`, plain: `${plain}  →  ${plainM(A)}` });
  for (let c = 0; c < n && row < m; c++) {
    const p = A.findIndex((r, i) => i >= row && !S.isZero(simplify(r[c])));
    if (p < 0) { det = S.ZERO; continue; }
    if (p !== row) { [A[p], A[row]] = [A[row], A[p]]; swaps++; show('swap rows to get a pivot', `${R(row)} \\leftrightarrow ${R(p)}`, `${Rp(row)} ↔ ${Rp(p)}`); }
    const piv = A[row][c];
    det = S.mul(det, piv);
    if (!S.isOne(simplify(piv))) { A[row] = A[row].map((v) => simplify(S.div(v, piv))); show('scale the pivot row to make the pivot 1', `${R(row)} \\leftarrow ${R(row)} / ${S.isInt(piv) && S.val(piv) > 0 ? T(piv) : `\\left(${T(piv)}\\right)`}`, `${Rp(row)} ← ${Rp(row)} / ${S.isInt(piv) && S.val(piv) > 0 ? P(piv) : `(${P(piv)})`}`); }
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = simplify(A[i][c]);
      if (S.isZero(f)) continue;
      A[i] = A[i].map((v, j) => simplify(S.sub(v, S.mul(f, A[row][j]))));
      show('clear the column', `${R(i)} \\leftarrow ${R(i)} - ${S.isNum(f) && S.val(f) < 0 ? `(${T(f)})` : T(f)}\\,${R(row)}`, `${Rp(i)} ← ${Rp(i)} − (${P(f)})·${Rp(row)}`);
    }
    pivots.push(c); row++;
  }
  const square = m === n;
  return { R: A, steps, rank: pivots.length, pivots, det: square ? (pivots.length < n ? S.ZERO : simplify(S.mul(swaps % 2 ? S.MINUS : S.ONE, det))) : null, swaps };
}
/** The characteristic polynomial det(A − λI) and its roots, the eigenvalues. */
export function eigSteps(A: N[][]) {
  const lam = S.sym('lambda'), M = A.map((r, i) => r.map((v, j) => (i === j ? S.sub(v, lam) : v)));
  const det = (B: N[][]): N => (B.length === 1 ? B[0][0] : S.add(...B[0].map((v, j) => S.mul(j % 2 ? S.MINUS : S.ONE, v, det(B.slice(1).map((r) => r.filter((_, k) => k !== j)))))));
  const p = S.expand(det(M)), roots = solveFor(p, 'lambda');
  return {
    poly: p, values: roots,
    steps: [
      { rule: 'subtract λ down the diagonal', tex: `A - \\lambda I = ${texM(M)}`, plain: `A − λI = ${plainM(M)}` },
      { rule: 'its determinant: the characteristic polynomial', tex: `\\det(A - \\lambda I) = ${T(p)}`, plain: `det(A − λI) = ${P(p)}` },
      { rule: 'its roots are the eigenvalues', tex: roots.map((r) => `\\lambda = ${T(r)}`).join(',\\quad ') || '\\text{none found}', plain: roots.map((r) => `λ = ${P(r)}`).join(', ') || 'none found' },
    ] as Step[],
  };
}
