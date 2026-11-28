// A time delay e^(−sL) as a ratio of polynomials (Padé's approximation of order N, M567): numerator and denominator,
// highest power first. Exact in its first 2N derivatives at s = 0; good while ω·L stays under about N + 2.
export function pade(L: number, N = 4): { n: number[]; d: number[] } {
  if (!(L > 0)) return { n: [1], d: [1] };
  const fact = (k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
  const c = Array.from({ length: N + 1 }, (_, k) => (fact(2 * N - k) * fact(N)) / (fact(2 * N) * fact(k) * fact(N - k)) * L ** k);
  // Lowest power first, then reversed: d = Σ c_k s^k, n = Σ (−1)^k c_k s^k.
  return { n: c.map((ck, k) => (k % 2 ? -ck : ck)).reverse(), d: [...c].reverse() };
}
