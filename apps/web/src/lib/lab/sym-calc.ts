import { LabError } from './parse';
import {
  add, coefOf, diff, div, eq, evalC, expand, flt, fn, fromPoly, has, HALF, I, INF, isInt, isNum, isOne, isZero, mainVar, MINUS, mul, NAN, neg, numden,
  ONE, PI, polyOf, pow, rat, same, ser, size, sqrt, sub, subst, sym, symbols, val, ZERO, type N,
} from './sym';

// Hyperion's symbolic calculus and algebra (M396), on the tidy trees of sym.ts: factor, simplify, integrals (a table,
// substitution, by parts, partial fractions), equations and systems, limits and Taylor series. Each gives up honestly
// (null, or an error that says so) rather than guess.

const X = (x: string) => sym(x);
const two = rat(2);

// ——— Polynomials with number coefficients (lowest power first) ———

const numeric = (cs: N[] | null): cs is N[] => !!cs && cs.every((c) => c.t === 'n');
const deg = (cs: N[]) => cs.length - 1;
const lead = (cs: N[]) => cs[cs.length - 1];
function trim(cs: N[]): N[] { const o = [...cs]; while (o.length > 1 && isZero(o[o.length - 1])) o.pop(); return o; }
/** a ÷ b: quotient and remainder. */
export function polyDivmod(a: N[], b: N[]): [N[], N[]] {
  const B = trim(b);
  if (B.length === 1 && isZero(B[0])) throw new LabError('That divides by a zero polynomial.');
  let r = trim(a);
  const q: N[] = Array(Math.max(1, r.length - B.length + 1)).fill(ZERO);
  while (r.length >= B.length && !(r.length === 1 && isZero(r[0]))) {
    const k = r.length - B.length, c = div(lead(r), lead(B));
    q[k] = c;
    const next = r.map((v, i) => (i >= k ? sub(v, mul(c, B[i - k])) : v));
    next.pop(); // the leading term is gone by construction
    r = next.length ? trim(next) : [ZERO];
  }
  return [trim(q), r];
}
const evalPoly = (cs: N[], at: N) => cs.reduceRight<N>((s, c) => add(mul(s, at), c), ZERO);
function monic(cs: N[]): N[] { const l = lead(cs); return cs.map((c) => div(c, l)); }
export function polyGcd(a: N[], b: N[]): N[] {
  let [p, q] = [trim(a), trim(b)];
  for (let i = 0; i < 200 && !(q.length === 1 && isZero(q[0])); i++) [p, q] = [q, polyDivmod(p, q)[1]];
  return p.length === 1 ? [ONE] : monic(p);
}
const divisors = (n: number) => { n = Math.abs(n); const out: number[] = []; for (let k = 1; k * k <= n && k < 1e6; k++) if (n % k === 0) { out.push(k); if (k * k !== n) out.push(n / k); } return out; };
/** Rational roots (with how many times each) and what is left after taking them out. */
export function rationalRoots(cs0: N[]): { roots: [N, number][]; rest: N[] } {
  let cs = trim(cs0);
  const roots: [N, number][] = [];
  let zeros = 0;
  while (cs.length > 1 && isZero(cs[0])) { cs = cs.slice(1); zeros++; }
  if (zeros) roots.push([ZERO, zeros]);
  if (!numeric(cs) || deg(cs) < 1) return { roots, rest: cs };
  // Whole-number coefficients: p | a0, q | an.
  const l = cs.reduce((m, c) => { const d = (c as { d: number }).d; let a = m, b = d; while (b) [a, b] = [b, a % b]; return (m / a) * d; }, 1);
  const ints = cs.map((c) => val(c) * l);
  if (ints.some((v) => !Number.isSafeInteger(v)) || Math.abs(ints[0]) > 1e10 || Math.abs(ints[ints.length - 1]) > 1e10) return { roots, rest: cs };
  const ps = divisors(ints[0]), qs = divisors(ints[ints.length - 1]);
  const tried = new Set<string>();
  for (const p of ps) for (const q of qs) for (const s of [1, -1]) {
    const r = rat(s * p, q), k = ser(r);
    if (tried.has(k)) continue;
    tried.add(k);
    let m = 0;
    while (deg(cs) >= 1 && isZero(evalPoly(cs, r))) { cs = polyDivmod(cs, [neg(r), ONE])[0]; m++; }
    if (m) roots.push([r, m]);
  }
  return { roots: roots.sort((a, b) => val(b[0]) - val(a[0])), rest: cs };
}
/** Every root of a number polynomial, as decimals (Durand–Kerner), complex ones as a + b·i. */
function numericRoots(cs: N[]): N[] {
  const n = deg(cs), a = cs.map(val), an = a[n];
  type C = [number, number];
  const ev = (z: C): C => { let r: C = [0, 0]; for (let k = n; k >= 0; k--) r = [r[0] * z[0] - r[1] * z[1] + a[k] / an, r[0] * z[1] + r[1] * z[0]]; return r; };
  let zs: C[] = Array.from({ length: n }, (_, k) => { const ang = (2 * Math.PI * k) / n + 0.4; return [Math.cos(ang) * 0.9, Math.sin(ang) * 0.9]; });
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    zs = zs.map((z, i) => {
      let d: C = [1, 0];
      zs.forEach((w, j) => { if (j !== i) d = [d[0] * (z[0] - w[0]) - d[1] * (z[1] - w[1]), d[0] * (z[1] - w[1]) + d[1] * (z[0] - w[0])]; });
      const f = ev(z), m = d[0] * d[0] + d[1] * d[1] || 1e-300, q: C = [(f[0] * d[0] + f[1] * d[1]) / m, (f[1] * d[0] - f[0] * d[1]) / m];
      moved = Math.max(moved, Math.hypot(q[0], q[1]));
      return [z[0] - q[0], z[1] - q[1]];
    });
    if (moved < 1e-15) break;
  }
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return zs.map(([re, im]) => (Math.abs(im) < 1e-10 ? flt(clean(re)) : add(flt(clean(re)), mul(flt(im), I)))).sort((p, q) => evalC(p)[0] - evalC(q)[0]);
}

// ——— Factor ———

/** The factors of e, as MATLAB's factor gives them (a number first when it isn't 1). */
export function factorList(e: N): N[] {
  if (isNum(e)) {
    if (e.t === 'n' && e.d === 1 && Math.abs(e.n) > 1 && Math.abs(e.n) < 1e15) {
      const out: N[] = e.n < 0 ? [MINUS] : [];
      let m = Math.abs(e.n);
      for (let p = 2; p * p <= m; p++) while (m % p === 0) { out.push(rat(p)); m /= p; }
      if (m > 1) out.push(rat(m));
      return out;
    }
    return [e];
  }
  if (e.t === '*') return e.a.flatMap((f) => factorList(f));
  if (e.t === '^' && isInt(e.e) && val(e.e) > 0) { const fs = factorList(e.b); return Array.from({ length: val(e.e) }, () => fs).flat(); }
  const [n, d] = numden(e);
  if (!isOne(d)) return [...factorList(expand(n)), ...factorList(expand(d)).map((f) => pow(f, MINUS))];
  return polyFactors(expand(e));
}
function polyFactors(e: N): N[] {
  const terms = e.t === '+' ? e.a : [e];
  if (terms.length < 2) return [e];
  // What every term shares: a number and the smallest power of each symbol.
  // Factors every term has (x, exp(x), (y + 1)…), each to the smallest power it has in them.
  const powers = (t: N) => {
    const m = new Map<string, { b: N; e: number }>();
    for (const f of t.t === '*' ? t.a : [t]) {
      if (isNum(f)) continue;
      const [b, e] = f.t === '^' && isNum(f.e) && val(f.e) > 0 ? [f.b, val(f.e)] : [f, 1];
      m.set(ser(b), { b, e });
    }
    return m;
  };
  const maps = terms.map(powers);
  const common: N[] = [];
  for (const [k, { b }] of maps[0]) {
    const es = maps.map((m) => m.get(k)?.e ?? 0), low = Math.min(...es);
    if (low > 0) common.push(pow(b, rat(low)));
  }
  const coefs = terms.map((t) => coefOf(t)[0]);
  let content: N = ONE;
  if (coefs.every((c) => c.t === 'n')) {
    const g = coefs.reduce((a, c) => { let p = Math.abs((c as { n: number }).n), q = a; while (q) [p, q] = [q, p % q]; return p; }, 0);
    const lcm = coefs.reduce((a, c) => { const d = (c as { d: number }).d; let p = a, q = d; while (q) [p, q] = [q, p % q]; return (a / p) * d; }, 1);
    const sign = val(coefs[0]) < 0 ? -1 : 1;
    content = rat(sign * g, lcm);
  }
  let rest = expand(div(e, mul(content, ...common)));
  const out: N[] = [...(isOne(content) ? [] : [content]), ...common];
  // A polynomial in one letter with number coefficients: its rational roots.
  const v = mainVar(rest);
  const cs = v ? polyOf(rest, v) : null;
  if (v && cs && numeric(cs) && deg(cs) >= 2) {
    const { roots, rest: left } = rationalRoots(cs);
    for (const [r, m] of roots) {
      const f = r.t === 'n' && r.d !== 1 ? sub(mul(rat(r.d), X(v)), rat(r.n)) : sub(X(v), r);
      for (let k = 0; k < m; k++) out.push(f);
    }
    // Taking out (d·x − n) instead of (x − n/d) leaves a number to divide by.
    const used = roots.reduce<N>((s, [r, m]) => mul(s, pow(r.t === 'n' ? rat(r.d) : ONE, rat(m))), ONE);
    rest = div(fromPoly(left, v), used);
    if (!isOne(rest)) {
      const [k, r] = coefOf(expand(rest));
      if (!isOne(k)) out.unshift(k);
      if (!isOne(r)) out.push(r);
    }
    return mergeNumbers(out);
  }
  // A difference of two squares: a² − b².
  if (rest.t === '+' && rest.a.length === 2) {
    const [p, q] = rest.a;
    const qn = coefOf(q);
    if (val(qn[0]) < 0) {
      const a = root(p), b = root(neg(q));
      if (a && b && !isNum(a)) return mergeNumbers([...out, ...polyFactors(sub(a, b)), ...polyFactors(add(a, b))]);
    }
  }
  if (!isOne(rest)) out.push(rest);
  return mergeNumbers(out.length ? out : [e]);
}
/** √t when it is exact: a square number times even powers (x²·y⁴ → x·y²); otherwise null. */
function root(t: N): N | null {
  const fs = t.t === '*' ? t.a : [t], out: N[] = [];
  for (const f of fs) {
    if (isNum(f)) { const s = pow(f, HALF); if (!isNum(s)) return null; out.push(s); }
    else if (f.t === '^' && isInt(f.e) && val(f.e) % 2 === 0) out.push(pow(f.b, rat(val(f.e) / 2)));
    else return null;
  }
  return mul(...out);
}
function mergeNumbers(fs: N[]): N[] {
  const nums = fs.filter(isNum), rest = fs.filter((f) => !isNum(f));
  const k = mul(...nums);
  return isOne(k) && rest.length ? rest : [k, ...rest];
}

// ——— Fractions put together and cancelled ———

export function together(e: N): N {
  const [n0, d0] = numden(e);
  let n = expand(n0), d = expand(d0);
  if (isOne(d)) return n;
  for (const v of symbols(add(n, d))) {
    const pn = polyOf(n, v), pd = polyOf(d, v);
    if (pn && pd && numeric(pn) && numeric(pd) && deg(pd) >= 1) {
      const g = polyGcd(pn, pd);
      if (deg(g) >= 1) { n = fromPoly(polyDivmod(pn, g)[0], v); d = fromPoly(polyDivmod(pd, g)[0], v); }
    }
  }
  // Common factors of several letters (x·y over x·z).
  const fn_ = factorList(n), fd = factorList(d), keep: N[] = [];
  const left = [...fd];
  for (const f of fn_) { const i = left.findIndex((g) => same(g, f)); if (i >= 0 && !isNum(f)) left.splice(i, 1); else keep.push(f); }
  if (keep.length !== fn_.length) { n = expand(mul(...keep)); d = expand(mul(...left)); }
  // The denominator's number in front goes to the top.
  const [k] = coefOf(d.t === '+' ? d.a[0] : d);
  if (isNum(k) && !isOne(k)) { n = expand(div(n, k)); d = expand(div(d, k)); }
  return isOne(d) ? n : div(n, d);
}

// ——— Simplify: try several forms, keep the smallest that is really equal ———

function samePoints(a: N, b: N): boolean {
  const vars = [...symbols(add(a, b))];
  for (const seed of [0.37, 1.61, -0.83]) {
    const env = new Map(vars.map((v, k) => [v, [seed + 0.29 * k, 0] as [number, number]]));
    try {
      const p = evalC(a, env), q = evalC(b, env);
      if (![p, q].flat().every(Number.isFinite)) continue;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-8 * (1 + Math.hypot(p[0], p[1]))) return false;
    } catch { return false; }
  }
  return true;
}
/** sin² written as 1 − cos² (and the other way), opened up. */
function trig(e: N, to: 'cos' | 'sin'): N {
  const from = to === 'cos' ? 'sin' : 'cos';
  const go = (x: N): N => {
    if (x.t === '^' && x.b.t === 'fn' && x.b.name === from && isInt(x.e) && val(x.e) >= 2) {
      const k = val(x.e), sq = sub(ONE, pow(fn(to, x.b.a[0]), two));
      return mul(pow(sq, rat(Math.floor(k / 2))), k % 2 ? x.b : ONE);
    }
    switch (x.t) {
      case '+': return add(...x.a.map(go));
      case '*': return mul(...x.a.map(go));
      case '^': return pow(go(x.b), go(x.e));
      case 'fn': return fn(x.name, ...x.a.map(go));
      default: return x;
    }
  };
  return expand(go(e));
}
/** exp(a)·exp(b) as exp(a + b). */
function joinExp(e: N): N {
  switch (e.t) {
    case '+': return add(...e.a.map(joinExp));
    case '^': { const b = joinExp(e.b); return b.t === 'fn' && b.name === 'exp' && isNum(e.e) ? fn('exp', mul(b.a[0], e.e)) : pow(b, joinExp(e.e)); }
    case 'fn': return fn(e.name, ...e.a.map(joinExp));
    case '*': {
      const fs = e.a.map(joinExp), ex = fs.filter((f) => f.t === 'fn' && f.name === 'exp') as Extract<N, { t: 'fn' }>[];
      if (ex.length < 2) return mul(...fs);
      return mul(...fs.filter((f) => !(f.t === 'fn' && f.name === 'exp')), fn('exp', add(...ex.map((f) => f.a[0]))));
    }
    default: return e;
  }
}
export function simplify(e: N, steps = 2): N {
  if (e.t === '=') return eq(simplify(e.l, steps), simplify(e.r, steps));
  // Inside first (the arguments of functions).
  const inner = (x: N): N => (x.t === 'fn' ? fn(x.name, ...x.a.map((a) => simplify(a, steps))) : x.t === '+' ? add(...x.a.map(inner)) : x.t === '*' ? mul(...x.a.map(inner)) : x.t === '^' ? pow(inner(x.b), inner(x.e)) : x);
  let best = inner(e);
  for (let round = 0; round < steps; round++) {
    const tries: N[] = [];
    const safe = (f: () => N) => { try { tries.push(f()); } catch { /* that form isn't possible */ } };
    safe(() => expand(best));
    safe(() => together(best));
    safe(() => joinExp(best));
    safe(() => trig(best, 'cos'));
    safe(() => trig(best, 'sin'));
    safe(() => together(trig(best, 'cos')));
    safe(() => { const fs = factorList(together(best)); return mul(...fs); });
    let changed = false;
    for (const t of tries) if (size(t) < size(best) && samePoints(t, best)) { best = t; changed = true; }
    if (!changed) break;
  }
  return best;
}

// ——— Integrals ———

const T = '_t';
/** The integral of e with respect to x, or null when this engine can't find one. */
export function integrate(e: N, x: string, depth = 0): N | null {
  if (depth > 7) return null;
  if (!has(e, x)) return mul(e, X(x));
  if (e.t === '+') { const parts = e.a.map((t) => integrate(t, x, depth + 1)); return parts.every(Boolean) ? add(...(parts as N[])) : integrate(expand(e), x, depth + 2) ; }
  if (e.t === '*') {
    const k = e.a.filter((f) => !has(f, x));
    if (k.length) { const r = integrate(mul(...e.a.filter((f) => has(f, x))), x, depth); return r ? mul(...k, r) : null; }
  }
  const t = table(e, x);
  if (t) return t;
  const p = polyOf(e, x);
  if (p) return add(...p.map((c, k) => mul(c, pow(X(x), rat(k + 1)), rat(1, k + 1))));
  const ex = expand(e);
  if (ser(ex) !== ser(e) && ex.t === '+') { const r = integrate(ex, x, depth + 1); if (r) return r; }
  const r = rational(e, x);
  if (r) return r;
  const s = substitution(e, x, depth);
  if (s) return s;
  return byParts(e, x, depth);
}
/** Functions of a linear argument (a·x + b) we know by heart. */
function table(e: N, x: string): N | null {
  const linear = (u: N) => { const d = diff(u, x); return has(d, x) ? null : d; };
  if (e.t === 's') return mul(HALF, pow(e, two));
  if (e.t === '^') {
    const { b, e: n } = e;
    if (!has(n, x)) {
      const du = linear(b);
      if (du) return isNum(n) && val(n) === -1 ? div(fn('log', b), du) : div(pow(b, add(n, ONE)), mul(add(n, ONE), du));
      // sin²(u), cos²(u)
      if (b.t === 'fn' && isInt(n) && val(n) === 2 && (b.name === 'sin' || b.name === 'cos')) {
        const u = b.a[0], d = linear(u);
        if (d) return div(b.name === 'sin' ? sub(mul(HALF, u), mul(rat(1, 4), fn('sin', mul(two, u)))) : add(mul(HALF, u), mul(rat(1, 4), fn('sin', mul(two, u)))), d);
      }
      if (b.t === 'fn' && isNum(n) && val(n) === -2 && b.name === 'cos') { const d = linear(b.a[0]); if (d) return div(fn('tan', b.a[0]), d); }
      if (b.t === 'fn' && isInt(n) && val(n) === 2 && b.name === 'sec') { const d = linear(b.a[0]); if (d) return div(fn('tan', b.a[0]), d); }
      // 1/√(1 − u²) and 1/√(u² + 1)
      if (isNum(n) && val(n) === -0.5 && b.t === '+' && b.a.length === 2) {
        const cs = polyOf(b, x);
        if (cs && cs.length === 3 && isZero(cs[1]) && isNum(cs[0]) && isNum(cs[2])) {
          const a0 = val(cs[0]), a2 = val(cs[2]);
          if (a0 > 0 && a2 < 0) return div(fn('asin', mul(sqrt(div(neg(cs[2]), cs[0])), X(x))), sqrt(neg(cs[2])));
          if (a0 > 0 && a2 > 0) return div(fn('asinh', mul(sqrt(div(cs[2], cs[0])), X(x))), sqrt(cs[2]));
        }
      }
    }
    if (!has(b, x)) { const du = linear(n); if (du) return div(e, mul(fn('log', b), du)); }
    return null;
  }
  if (e.t === 'fn' && e.a.length === 1) {
    const u = e.a[0], du = linear(u);
    if (!du) return null;
    const F: Record<string, () => N> = {
      exp: () => fn('exp', u), sin: () => neg(fn('cos', u)), cos: () => fn('sin', u), tan: () => neg(fn('log', fn('cos', u))),
      sinh: () => fn('cosh', u), cosh: () => fn('sinh', u), tanh: () => fn('log', fn('cosh', u)),
      log: () => sub(mul(u, fn('log', u)), u), atan: () => sub(mul(u, fn('atan', u)), mul(HALF, fn('log', add(pow(u, two), ONE)))),
      asin: () => add(mul(u, fn('asin', u)), sqrt(sub(ONE, pow(u, two)))), acos: () => sub(mul(u, fn('acos', u)), sqrt(sub(ONE, pow(u, two)))),
      sec: () => fn('log', add(fn('sec', u), fn('tan', u))), cot: () => fn('log', fn('sin', u)),
    };
    const f = F[e.name];
    return f ? div(f(), du) : null;
  }
  // exp(a·x)·sin(b·x) and ·cos(b·x)
  if (e.t === '*' && e.a.length === 2) {
    const ex = e.a.find((f) => f.t === 'fn' && f.name === 'exp') as Extract<N, { t: 'fn' }> | undefined;
    const tr = e.a.find((f) => f.t === 'fn' && (f.name === 'sin' || f.name === 'cos')) as Extract<N, { t: 'fn' }> | undefined;
    if (ex && tr) {
      const a = linear(ex.a[0]), b = linear(tr.a[0]);
      if (a && b) {
        const s = fn('sin', tr.a[0]), c = fn('cos', tr.a[0]), den = add(pow(a, two), pow(b, two));
        return mul(ex, div(tr.name === 'sin' ? sub(mul(a, s), mul(b, c)) : add(mul(a, c), mul(b, s)), den));
      }
    }
  }
  return null;
}
/** Every part of e that holds x (candidates for u in a substitution). */
function parts(e: N, x: string, out: N[] = []): N[] {
  if (!has(e, x)) return out;
  if (e.t !== 's') out.push(e);
  if (e.t === '+' || e.t === '*' || e.t === 'fn') e.a.forEach((a) => parts(a, x, out));
  if (e.t === '^') { parts(e.b, x, out); parts(e.e, x, out); }
  return out;
}
/** ∫ f(u(x))·u′(x) dx = ∫ f(t) dt at t = u(x), when e divided by u′ only depends on x through u. */
function substitution(e: N, x: string, depth: number): N | null {
  const seen = new Set<string>();
  for (const u of parts(e, x)) {
    const k = ser(u);
    if (seen.has(k) || same(u, e)) continue;
    seen.add(k);
    const du = diff(u, x);
    if (isZero(du)) continue;
    const q = subst(together(div(e, du)), u, sym(T));
    if (has(q, x)) continue;
    const F = integrate(q, T, depth + 1);
    if (F) return subst(F, sym(T), u);
  }
  return null;
}
/** ∫ u dv = u·v − ∫ v du, u a polynomial (or a log / inverse function times one). */
function byParts(e: N, x: string, depth: number): N | null {
  if (depth > 5) return null;
  const fs = e.t === '*' ? e.a : [e];
  const isPoly = (f: N) => polyOf(f, x) !== null;
  const hard = fs.filter((f) => f.t === 'fn' && ['log', 'atan', 'asin', 'acos', 'log10', 'log2'].includes(f.name));
  const polys = fs.filter((f) => isPoly(f) && has(f, x));
  // u = the log / inverse part, dv = the rest; otherwise u = the polynomial part.
  const [u, dv] = hard.length === 1 ? [hard[0], mul(...fs.filter((f) => f !== hard[0]))] : polys.length ? [mul(...polys), mul(...fs.filter((f) => !polys.includes(f)))] : [null, null];
  if (!u || !dv || isOne(dv) && !hard.length) return null;
  const v = integrate(dv, x, depth + 2);
  if (!v) return null;
  const rest = integrate(expand(mul(v, diff(u, x))), x, depth + 1);
  return rest ? sub(mul(u, v), rest) : null;
}
/** A fraction of two number polynomials: divided out, then partial fractions. */
function rational(e: N, x: string): N | null {
  const [n, d] = numden(e);
  const P = polyOf(n, x), Q = polyOf(d, x);
  if (!P || !Q || !numeric(P) || !numeric(Q) || deg(Q) < 1) return null;
  const [q, r] = polyDivmod(P, Q);
  const whole = q.length && !(q.length === 1 && isZero(q[0])) ? integrate(fromPoly(q, x), x) : ZERO;
  if (r.length === 1 && isZero(r[0])) return whole;
  const { roots, rest } = rationalRoots(Q);
  const L = lead(Q), quad = monic(rest);
  if (deg(quad) > 2) return null;
  // Unknowns: A/(x − r)^l for each root, (B·x + C)/quad for a quadratic left over.
  const basis: { num: N[]; term: (c: N) => N | null }[] = [];
  const Qm = monic(Q);
  for (const [root, m] of roots) {
    for (let l = 1; l <= m; l++) {
      const lin = [neg(root), ONE];
      let den: N[] = [ONE];
      for (let k = 0; k < l; k++) den = polyMul(den, lin);
      const num = polyDivmod(Qm, den)[0];
      basis.push({ num, term: (c) => (l === 1 ? mul(c, fn('log', sub(X(x), root))) : mul(c, div(pow(sub(X(x), root), rat(1 - l)), rat(1 - l)))) });
    }
  }
  if (deg(quad) === 2) {
    const other = polyDivmod(Qm, quad)[0];
    const p = quad[1], qq = quad[0], k2 = sub(qq, div(pow(p, two), rat(4)));
    if (val(k2) <= 0) return null;
    const k = sqrt(k2), qx = fromPoly(quad, x);
    basis.push({ num: polyMul(other, [ZERO, ONE]), term: (B) => mul(B, HALF, fn('log', qx)) });
    basis.push({ num: other, term: (C) => div(mul(C, fn('atan', div(add(X(x), div(p, two)), k))), k) });
    // (B·x + C) splits into B·(x + p/2) + (C − B·p/2): fixed up below.
    const sol = solveLinear(basis.map((b) => b.num), r.map((c) => div(c, L)), deg(Qm));
    if (!sol) return null;
    const B = sol[sol.length - 2], C = sol[sol.length - 1];
    const terms = basis.slice(0, -2).map((b, i) => b.term(sol[i]));
    terms.push(mul(B, HALF, fn('log', qx)), div(mul(sub(C, mul(B, div(p, two))), fn('atan', div(add(X(x), div(p, two)), k))), k));
    return add(whole, ...terms.filter(Boolean) as N[]);
  }
  const sol = solveLinear(basis.map((b) => b.num), r.map((c) => div(c, L)), deg(Qm));
  if (!sol) return null;
  return add(whole, ...basis.map((b, i) => b.term(sol[i])).filter(Boolean) as N[]);
}
function polyMul(a: N[], b: N[]): N[] {
  const out: N[] = Array(a.length + b.length - 1).fill(ZERO);
  a.forEach((p, i) => b.forEach((q, j) => { out[i + j] = add(out[i + j], mul(p, q)); }));
  return out;
}
/** Coefficients c with Σ c_i·basis_i = target (each a polynomial with n coefficients). */
function solveLinear(basis: N[][], target: N[], n: number): N[] | null {
  const A = Array.from({ length: n }, (_, row) => [...basis.map((b) => b[row] ?? ZERO), target[row] ?? ZERO]);
  const sol = gauss(A, basis.length);
  return sol;
}
/** Gaussian elimination on an augmented matrix (rows × (vars + 1)); null when there isn't one answer. */
export function gauss(A: N[][], vars: number): N[] | null {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  let r = 0;
  const pivots: number[] = [];
  for (let c = 0; c < vars && r < rows; c++) {
    let p = -1;
    for (let i = r; i < rows; i++) if (!isZero(together(M[i][c]))) { p = i; break; }
    if (p < 0) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const pv = M[r][c];
    M[r] = M[r].map((v) => together(div(v, pv)));
    for (let i = 0; i < rows; i++) if (i !== r && !isZero(M[i][c])) { const f = M[i][c]; M[i] = M[i].map((v, j) => together(sub(v, mul(f, M[r][j])))); }
    pivots.push(c);
    r++;
  }
  if (pivots.length < vars) return null;
  for (let i = r; i < rows; i++) if (!isZero(together(M[i][vars]))) return null;
  return pivots.map((_, i) => M[i][vars]);
}

// ——— Equations ———

/** The roots of a polynomial (exact when they can be, decimals otherwise). */
function polyRoots(cs0: N[]): N[] {
  const cs = trim(cs0);
  if (deg(cs) < 1) return [];
  if (deg(cs) === 1) return [neg(div(cs[0], cs[1]))];
  if (deg(cs) === 2) {
    const [c, b, a] = cs, disc = sub(pow(b, two), mul(rat(4), a, c));
    if (isZero(disc)) return [neg(div(b, mul(two, a)))];
    const s = sqrt(disc), den = mul(two, a);
    return [div(sub(neg(b), s), den), div(add(neg(b), s), den)].map((r) => simplify(r, 1));
  }
  if (!numeric(cs)) throw new LabError('I can only solve polynomials above degree 2 when their coefficients are numbers.');
  const { roots, rest } = rationalRoots(cs);
  const out = roots.map(([r]) => r);
  if (deg(rest) >= 1) out.push(...(deg(rest) <= 2 ? polyRoots(rest) : numericRoots(rest)));
  return out;
}
/** Answers smallest first when they are numbers (real part, then imaginary); otherwise as found. */
function order(xs: N[]): N[] {
  try {
    const vs = xs.map((x) => evalC(x));
    return xs.map((x, i) => ({ x, v: vs[i] })).sort((a, b) => a.v[0] - b.v[0] || a.v[1] - b.v[1]).map((p) => p.x);
  } catch { return xs; }
}
const unique = (xs: N[]) => { const seen = new Set<string>(); return xs.filter((r) => { const k = ser(r); if (seen.has(k)) return false; seen.add(k); return true; }); };
/** Solve e == 0 for x. */
export function solveFor(e0: N, x: string, depth = 0): N[] {
  const e = e0.t === '=' ? sub(e0.l, e0.r) : e0;
  if (depth > 6) return [];
  const [n0, d] = numden(together(e));
  const n = expand(n0);
  const cs = polyOf(n, x);
  let roots: N[];
  if (cs) roots = polyRoots(cs);
  else roots = invert(n, x, depth) ?? numericSolve(n, x);
  // Not where the denominator is 0.
  return order(unique(roots)).filter((r) => { try { const v = evalC(subst(d, X(x), r), new Map([...symbols(d)].filter((s) => s !== x).map((s) => [s, [0.7, 0]]))); return Math.hypot(v[0], v[1]) > 1e-12; } catch { return true; } });
}
function invert(n: N, x: string, depth: number): N[] | null {
  // A product is 0 when one of its factors is.
  if (n.t === '*') { const fs = n.a.filter((f) => has(f, x)); return fs.flatMap((f) => solveFor(f, x, depth + 1)); }
  const terms = n.t === '+' ? n.a : [n];
  const withX = terms.filter((t) => has(t, x));
  if (withX.length !== 1) {
    // a·f(u) + b·f(u)²…: try u = f(…) as a new letter when one part repeats (e.g. exp(x)² − 3·exp(x) + 2).
    const cand = parts(n, x).filter((p) => p.t === 'fn');
    for (const u of cand) {
      const q = subst(n, u, sym(T));
      if (has(q, x)) continue;
      const vs = solveFor(q, T, depth + 1);
      if (vs.length) return vs.flatMap((v) => solveFor(sub(u, v), x, depth + 1));
    }
    return null;
  }
  const t = withX[0], others = add(...terms.filter((u) => u !== t));
  const [k, f] = coefOf(t);
  const target = div(neg(others), k);
  if (f.t === 's') return [target];
  if (f.t === '^' && !has(f.e, x)) {
    if (isNum(f.e) && val(f.e) === 2) return [sqrt(target), neg(sqrt(target))].flatMap((v) => solveFor(sub(f.b, v), x, depth + 1));
    return solveFor(sub(f.b, pow(target, div(ONE, f.e))), x, depth + 1);
  }
  if (f.t === '^' && !has(f.b, x)) return solveFor(sub(f.e, div(fn('log', target), fn('log', f.b))), x, depth + 1);
  if (f.t === 'fn') {
    const u = f.a[0];
    const inv: Record<string, N[]> = {
      exp: [fn('log', target)], log: [fn('exp', target)], sin: [fn('asin', target), sub(PI, fn('asin', target))], cos: [fn('acos', target), neg(fn('acos', target))],
      tan: [fn('atan', target)], sinh: [fn('asinh', target)], tanh: [fn('atanh', target)], asin: [fn('sin', target)], acos: [fn('cos', target)], atan: [fn('tan', target)],
      log10: [pow(rat(10), target)], log2: [pow(two, target)], cosh: [fn('acosh', target), neg(fn('acosh', target))],
    };
    const vs = inv[f.name];
    if (vs) return unique(vs).flatMap((v) => solveFor(sub(u, v), x, depth + 1));
  }
  return null;
}
/** Real roots found by scanning for sign changes (a last resort). */
function numericSolve(e: N, x: string): N[] {
  if ([...symbols(e)].some((s) => s !== x)) throw new LabError(`I couldn’t solve that for ${x} exactly, and it has other letters in it, so I can’t find numbers either.`);
  const f = (v: number) => { const r = evalC(e, new Map([[x, [v, 0]]])); return Math.abs(r[1]) < 1e-9 ? r[0] : NaN; };
  const out: number[] = [];
  const N0 = 4000, lo = -50, hi = 50;
  let px = lo, pf = f(lo);
  for (let k = 1; k <= N0; k++) {
    const cx = lo + ((hi - lo) * k) / N0, cf = f(cx);
    if (Number.isFinite(pf) && Number.isFinite(cf) && (pf === 0 || pf * cf < 0)) {
      let a = px, b = cx, fa = pf;
      for (let i = 0; i < 80; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
      const r = (a + b) / 2;
      if (Math.abs(f(r)) < 1e-6 && !out.some((o) => Math.abs(o - r) < 1e-9)) out.push(r);
    }
    px = cx; pf = cf;
    if (out.length > 30) break;
  }
  if (!out.length) throw new LabError(`I couldn’t find a solution for ${x} (exactly, or between −50 and 50).`);
  return out.map((v) => flt(Math.abs(v) < 1e-12 ? 0 : v));
}
/** Several equations in several letters: linear ones by elimination, others one letter at a time. */
export function solveSystem(eqs: N[], vars: string[], depth = 0): Map<string, N>[] {
  const es = eqs.map((e) => (e.t === '=' ? sub(e.l, e.r) : e)).filter((e) => !isZero(e));
  if (!vars.length) return es.every((e) => isZero(simplify(e))) ? [new Map()] : [];
  const linear = es.every((e) => vars.every((v) => { const d = diff(e, v); return vars.every((w) => isZero(simplify(diff(d, w), 1))); }));
  if (linear && es.length >= vars.length) {
    const A = es.map((e) => [...vars.map((v) => diff(e, v)), neg(vars.reduce((s, v) => subst(s, X(v), ZERO), e))]);
    const sol = gauss(A, vars.length);
    if (sol) return [new Map(vars.map((v, i) => [v, simplify(sol[i], 1)]))];
    if (es.length === vars.length) return [];
  }
  if (depth > 4) throw new LabError('That system is too tangled for me to solve.');
  // The equation with the fewest of the letters, solved for one of them.
  const order = [...es].sort((a, b) => vars.filter((v) => has(a, v)).length - vars.filter((v) => has(b, v)).length);
  for (const e of order) {
    const v = vars.find((w) => has(e, w));
    if (!v) continue;
    let roots: N[];
    try { roots = solveFor(e, v); } catch { continue; }
    const out: Map<string, N>[] = [];
    for (const r of roots) {
      const rest = es.filter((x) => x !== e).map((x) => expand(subst(x, X(v), r)));
      for (const s of solveSystem(rest, vars.filter((w) => w !== v), depth + 1)) {
        const full = new Map(s);
        full.set(v, simplify([...s].reduce((acc, [k, val_]) => subst(acc, X(k), val_), r), 1));
        out.push(full);
      }
    }
    return out;
  }
  return [];
}

// ——— Limits and Taylor series ———

const isInf = (e: N) => e.t === 'c' && e.name === 'inf';
const isMinusInf = (e: N) => e.t === '*' && e.a.length === 2 && isNum(e.a[0]) && val(e.a[0]) < 0 && isInf(e.a[1]);
const bad = (e: N) => hasNaN(e);
function hasNaN(e: N): boolean {
  if (e.t === 'c') return e.name === 'nan';
  if (e.t === '+' || e.t === '*' || e.t === 'fn') return e.a.some(hasNaN);
  if (e.t === '^') return hasNaN(e.b) || hasNaN(e.e);
  return false;
}
/** The limit of e as x → a (dir: 'left', 'right' or both). */
export function limitOf(e: N, x: string, a: N, dir: 'left' | 'right' | 'both' = 'both', depth = 0): N {
  if (depth > 10) return numericLimit(e, x, a, dir);
  if (isInf(a)) return limitOf(subst(e, X(x), pow(X(x), MINUS)), x, ZERO, 'right', depth + 1);
  if (isMinusInf(a)) return limitOf(subst(e, X(x), neg(pow(X(x), MINUS))), x, ZERO, 'right', depth + 1);
  // f^g with x in g: exp(lim g·log f).
  if (e.t === '^' && has(e.e, x)) return fn('exp', limitOf(mul(e.e, fn('log', e.b)), x, a, dir, depth + 1));
  let direct: N | null = null;
  try { direct = subst(e, X(x), a); } catch { direct = null; }
  if (direct && !bad(direct) && !hasInfinity(direct)) return simplify(direct, 1);
  const [n, d] = numden(together(e));
  const n0 = subst(n, X(x), a), d0 = subst(d, X(x), a);
  if (isZero(d0) && isZero(n0)) return limitOf(div(diff(n, x), diff(d, x)), x, a, dir, depth + 1);
  if ((isInf(n0) || isMinusInf(n0)) && (isInf(d0) || isMinusInf(d0))) return limitOf(div(diff(n, x), diff(d, x)), x, a, dir, depth + 1);
  if (isZero(d0) && !isZero(n0) && !bad(n0)) {
    // ±∞ from each side that is asked for (NaN when the sides disagree).
    const near = (s: number) => { const v = evalC(e, new Map([...symbols(e)].map((k) => [k, k === x ? [val(a) + s * 1e-7, 0] : [0.5, 0]]))); return Math.sign(v[0]); };
    const L = near(-1), R = near(1);
    const pick = (sg: number) => (sg > 0 ? INF : neg(INF));
    if (dir === 'left') return pick(L);
    if (dir === 'right') return pick(R);
    return L === R ? pick(L) : NAN;
  }
  return numericLimit(e, x, a, dir);
}
const hasInfinity = (e: N): boolean => (e.t === 'c' ? e.name === 'inf' : e.t === '+' || e.t === '*' || e.t === 'fn' ? e.a.some(hasInfinity) : e.t === '^' ? hasInfinity(e.b) || hasInfinity(e.e) : false);
/** Values closer and closer to a; the answer as a neat fraction when it is one. */
function numericLimit(e: N, x: string, a: N, dir: 'left' | 'right' | 'both'): N {
  if ([...symbols(e)].some((s) => s !== x)) return fn('limit', e, X(x), a);
  const at = val(a);
  const side = (s: number) => { let last = NaN; for (let k = 3; k <= 9; k++) { const v = evalC(e, new Map([[x, [at + s * 10 ** -k, 0]]])); if (Math.abs(v[1]) < 1e-9 && Number.isFinite(v[0])) last = v[0]; } return last; };
  const L = dir === 'right' ? NaN : side(-1), R = dir === 'left' ? NaN : side(1);
  const v = dir === 'left' ? L : dir === 'right' ? R : Math.abs(L - R) < 1e-5 * (1 + Math.abs(L)) ? (L + R) / 2 : NaN;
  if (Number.isNaN(v)) return NAN;
  return nice(v);
}
/** A decimal as a fraction (or a fraction of pi, or e) when it is very close to one. */
export function nice(v: number): N {
  if (Number.isInteger(Math.round(v)) && Math.abs(v - Math.round(v)) < 1e-6 * (1 + Math.abs(v))) return rat(Math.round(v));
  for (let d = 2; d <= 64; d++) { const n = Math.round(v * d); if (Math.abs(v - n / d) < 1e-7) return rat(n, d); }
  for (let d = 1; d <= 12; d++) { const n = Math.round((v / Math.PI) * d); if (n && Math.abs(v - (n * Math.PI) / d) < 1e-7) return mul(rat(n, d), PI); }
  if (Math.abs(v - Math.E) < 1e-7) return fn('exp', ONE);
  return flt(v);
}
/** The Taylor polynomial of e about x = a, terms below (x − a)^order. */
export function taylor(e: N, x: string, a: N = ZERO, order = 6): N {
  const out: N[] = [];
  let d = e, fact = 1;
  for (let k = 0; k < order; k++) {
    if (k) { d = diff(d, x); fact *= k; }
    const c = simplify(limitOf(d, x, a), 1);
    if (!isZero(c)) out.push(mul(c, rat(1, fact), pow(sub(X(x), a), rat(k))));
  }
  return out.length ? add(...out) : ZERO;
}

/** The definite integral of e from a to b (a number by Simpson's rule when no formula is found). */
export function definite(e: N, x: string, a: N, b: N): N {
  const F = integrate(e, x);
  if (F) {
    const at = (p: N) => (isInf(p) || isMinusInf(p) ? limitOf(F, x, p) : (() => { const v = subst(F, X(x), p); return bad(v) || hasInfinity(v) ? limitOf(F, x, p) : v; })());
    return simplify(sub(at(b), at(a)), 1);
  }
  if ([...symbols(e)].some((s) => s !== x) || !isNum(a) && a.t !== 'c' && !isNum(b)) return fn('int', e, X(x), a, b);
  const lo = evalC(a)[0], hi = evalC(b)[0];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return fn('int', e, X(x), a, b);
  const f = (v: number) => evalC(e, new Map([[x, [v, 0]]]))[0];
  const simpson = (p: number, q: number, fp: number, fm: number, fq: number, whole: number, depth: number): number => {
    const m = (p + q) / 2, l = (p + m) / 2, r = (m + q) / 2, fl = f(l), fr = f(r);
    const left = ((m - p) / 6) * (fp + 4 * fl + fm), right = ((q - m) / 6) * (fm + 4 * fr + fq);
    if (depth > 40 || Math.abs(left + right - whole) < 1e-12 * 15) return left + right + (left + right - whole) / 15;
    return simpson(p, m, fp, fl, fm, left, depth + 1) + simpson(m, q, fm, fr, fq, right, depth + 1);
  };
  const fa = f(lo), fb = f(hi), fm = f((lo + hi) / 2);
  return flt(simpson(lo, hi, fa, fm, fb, ((hi - lo) / 6) * (fa + 4 * fm + fb), 0));
}
export { NAN };
