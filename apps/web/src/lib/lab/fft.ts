// Hyperion's FFT (M378; moved here in M465 so pure methods use it without loading the language): radix-2 for powers of
// two, Bluestein's chirp-z for any other length.

function fftPow2(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
/** The DFT of one vector, any length (Bluestein's chirp-z for lengths that aren't powers of two). */
export function dft(re: number[], im: number[], inverse = false): [Float64Array, Float64Array] {
  const n = re.length;
  if (n === 0) return [new Float64Array(0), new Float64Array(0)];
  if ((n & (n - 1)) === 0) {
    const r = Float64Array.from(re), i = Float64Array.from(im);
    fftPow2(r, i, inverse);
    if (inverse) for (let k = 0; k < n; k++) { r[k] /= n; i[k] /= n; }
    return [r, i];
  }
  let m = 1; while (m < 2 * n - 1) m <<= 1;
  const s = inverse ? 1 : -1;
  const wr = new Float64Array(n), wi = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = (s * Math.PI * ((k * k) % (2 * n))) / n; wr[k] = Math.cos(a); wi[k] = Math.sin(a); }
  const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let k = 0; k < n; k++) { ar[k] = re[k] * wr[k] - im[k] * wi[k]; ai[k] = re[k] * wi[k] + im[k] * wr[k]; }
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
  fftPow2(ar, ai, false); fftPow2(br, bi, false);
  for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
  fftPow2(ar, ai, true);
  const outR = new Float64Array(n), outI = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const r = ar[k] / m, i = ai[k] / m;
    outR[k] = r * wr[k] - i * wi[k]; outI[k] = r * wi[k] + i * wr[k];
    if (inverse) { outR[k] /= n; outI[k] /= n; }
  }
  return [outR, outI];
}
