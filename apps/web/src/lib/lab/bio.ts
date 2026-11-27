// Hyperion's DNA and protein tools (M494, the owner's list, group 7: computational biology): a sequence's counts and
// GC content, its complement and reverse complement, translation by the standard genetic code, open reading frames in
// all six frames, pairwise alignment (Needleman–Wunsch for whole sequences, Smith–Waterman for the best local match,
// both with affine gaps by Gotoh's method), BLOSUM62 for proteins, distances between sequences (p-distance,
// Jukes–Cantor) and trees from them (UPGMA, neighbour joining) as Newick text. Pure: no language values here.

export const clean = (s: string) => s.replace(/[\s\d]/g, '');
const COMP: Record<string, string> = { A: 'T', T: 'A', U: 'A', G: 'C', C: 'G', N: 'N', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D' };
export const complement = (s: string) => [...s].map((c) => { const u = c.toUpperCase(), r = COMP[u] ?? c; return c === u ? r : r.toLowerCase(); }).join('');
export const reverseComplement = (s: string) => [...complement(s)].reverse().join('');
export const gcContent = (s: string) => { const t = s.toUpperCase().replace(/[^ACGTU]/g, ''); return t.length ? [...t].filter((c) => c === 'G' || c === 'C').length / t.length : NaN; };
export const counts = (s: string) => { const o: Record<string, number> = { A: 0, C: 0, G: 0, T: 0, Other: 0 }; for (const c of s.toUpperCase().replace(/U/g, 'T')) { if (c in o && c !== 'Other') o[c]++; else if (!/\s/.test(c)) o.Other++; } return o; };

// The standard genetic code, codons in the order TCAG × TCAG × TCAG.
const BASES = 'TCAG', AAS = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export function codonToAA(codon: string, code = AAS): string {
  const c = codon.toUpperCase().replace(/U/g, 'T');
  const i = BASES.indexOf(c[0]), j = BASES.indexOf(c[1]), k = BASES.indexOf(c[2]);
  return i < 0 || j < 0 || k < 0 ? 'X' : code[16 * i + 4 * j + k];
}
/** Translation from `frame` (1–3) to the end, stops as '*'; `code` a table's 64 letters (`geneticCode`, M512). */
export const translate = (s: string, frame = 1, code = AAS) => { const t = s.toUpperCase().replace(/U/g, 'T'); let out = ''; for (let i = frame - 1; i + 3 <= t.length; i += 3) out += codonToAA(t.slice(i, i + 3), code); return out; };

/** NCBI's genetic codes (M512; the translation tables of GenBank, checked against Biopython's copy): id | name | the
 * amino acids of the 64 codons in TCAG order | the start codons. */
const CODES = `1|Standard|FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|TTG CTG ATG
2|Vertebrate Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG|ATT ATC ATA ATG GTG
3|Yeast Mitochondrial|FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATA ATG GTG
4|Mold, Protozoan and Coelenterate Mitochondrial; Mycoplasma; Spiroplasma|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|TTA TTG CTG ATT ATC ATA ATG GTG
5|Invertebrate Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG|TTG ATT ATC ATA ATG GTG
6|Ciliate, Dasycladacean and Hexamita Nuclear|FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
9|Echinoderm and Flatworm Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG|ATG GTG
10|Euplotid Nuclear|FFLLSSSSYY**CCCWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
11|Bacterial, Archaeal and Plant Plastid|FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|TTG CTG ATT ATC ATA ATG GTG
12|Alternative Yeast Nuclear|FFLLSSSSYY**CC*WLLLSPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|CTG ATG
13|Ascidian Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSGGVVVVAAAADDEEGGGG|TTG ATA ATG GTG
14|Alternative Flatworm Mitochondrial|FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG|ATG
15|Blepharisma Macronuclear|FFLLSSSSYY*QCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
16|Chlorophycean Mitochondrial|FFLLSSSSYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
21|Trematode Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNNKSSSSVVVVAAAADDEEGGGG|ATG GTG
22|Scenedesmus obliquus Mitochondrial|FFLLSS*SYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
23|Thraustochytrium Mitochondrial|FF*LSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATT ATG GTG
24|Pterobranchia Mitochondrial|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG|TTG CTG ATG GTG
25|Candidate Division SR1 and Gracilibacteria|FFLLSSSSYY**CCGWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|TTG ATG GTG
26|Pachysolen tannophilus Nuclear|FFLLSSSSYY**CC*WLLLAPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|CTG ATG
27|Karyorelict Nuclear|FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
28|Condylostoma Nuclear|FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
29|Mesodinium Nuclear|FFLLSSSSYYYYCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
30|Peritrich Nuclear|FFLLSSSSYYEECC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
31|Blastocrithidia Nuclear|FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|ATG
32|Balanophoraceae Plastid|FFLLSSSSYY*WCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG|TTG CTG ATT ATC ATA ATG GTG
33|Cephalodiscidae Mitochondrial|FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG|TTG CTG ATG GTG`.split('\n').map((l) => { const [id, name, aas, starts] = l.split('|'); return { id: Number(id), name, aas, starts: starts.split(' ') }; });
export const geneticCodes = () => CODES;
export function geneticCode(id: number) { return CODES.find((c) => c.id === id); }

export interface Orf { strand: 1 | -1; frame: number; start: number; stop: number; length: number; protein: string }
/** Open reading frames (ATG … stop) of at least `minCodons` codons on both strands; positions are 1-based on the
 * given strand's own coordinates turned back to the original (start < stop on the forward strand, start > stop on
 * the reverse). The stop codon is included in the span, not in the protein. */
export function orfs(s: string, minCodons = 30): Orf[] {
  const fwd = s.toUpperCase().replace(/U/g, 'T'), n = fwd.length, out: Orf[] = [];
  for (const strand of [1, -1] as const) {
    const t = strand === 1 ? fwd : reverseComplement(fwd);
    for (let f = 0; f < 3; f++) {
      let open = -1;
      for (let i = f; i + 3 <= n; i += 3) {
        const aa = codonToAA(t.slice(i, i + 3));
        if (open < 0 && t.slice(i, i + 3) === 'ATG') open = i;
        else if (open >= 0 && aa === '*') {
          const codons = (i - open) / 3;
          if (codons >= minCodons) {
            const a = open + 1, b = i + 3;
            out.push({ strand, frame: f + 1, start: strand === 1 ? a : n - a + 1, stop: strand === 1 ? b : n - b + 1, length: b - a + 1, protein: translate(t.slice(open, i)) });
          }
          open = -1;
        }
      }
    }
  }
  return out.sort((x, y) => y.length - x.length);
}

// BLOSUM62 (Henikoff and Henikoff 1992).
const B62_AAS = 'ARNDCQEGHILKMFPSTWYVBZX*';
const B62 = `4 -1 -2 -2 0 -1 -1 0 -2 -1 -1 -1 -1 -2 -1 1 0 -3 -2 0 -2 -1 0 -4
-1 5 0 -2 -3 1 0 -2 0 -3 -2 2 -1 -3 -2 -1 -1 -3 -2 -3 -1 0 -1 -4
-2 0 6 1 -3 0 0 0 1 -3 -3 0 -2 -3 -2 1 0 -4 -2 -3 3 0 -1 -4
-2 -2 1 6 -3 0 2 -1 -1 -3 -4 -1 -3 -3 -1 0 -1 -4 -3 -3 4 1 -1 -4
0 -3 -3 -3 9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1 -3 -3 -2 -4
-1 1 0 0 -3 5 2 -2 0 -3 -2 1 0 -3 -1 0 -1 -2 -1 -2 0 3 -1 -4
-1 0 0 2 -4 2 5 -2 0 -3 -3 1 -2 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4
0 -2 0 -1 -3 -2 -2 6 -2 -4 -4 -2 -3 -3 -2 0 -2 -2 -3 -3 -1 -2 -1 -4
-2 0 1 -1 -3 0 0 -2 8 -3 -3 -1 -2 -1 -2 -1 -2 -2 2 -3 0 0 -1 -4
-1 -3 -3 -3 -1 -3 -3 -4 -3 4 2 -3 1 0 -3 -2 -1 -3 -1 3 -3 -3 -1 -4
-1 -2 -3 -4 -1 -2 -3 -4 -3 2 4 -2 2 0 -3 -2 -1 -2 -1 1 -4 -3 -1 -4
-1 2 0 -1 -3 1 1 -2 -1 -3 -2 5 -1 -3 -1 0 -1 -3 -2 -2 0 1 -1 -4
-1 -1 -2 -3 -1 0 -2 -3 -2 1 2 -1 5 0 -2 -1 -1 -1 -1 1 -3 -1 -1 -4
-2 -3 -3 -3 -2 -3 -3 -3 -1 0 0 -3 0 6 -4 -2 -2 1 3 -1 -3 -3 -1 -4
-1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4 7 -1 -1 -4 -3 -2 -2 -1 -2 -4
1 -1 1 0 -1 0 0 0 -1 -2 -2 0 -1 -2 -1 4 1 -3 -2 -2 0 0 0 -4
0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 1 5 -2 -2 0 -1 -1 0 -4
-3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1 1 -4 -3 -2 11 2 -3 -4 -3 -2 -4
-2 -2 -2 -3 -2 -1 -2 -3 2 -1 -1 -2 -1 3 -3 -2 -2 2 7 -1 -3 -2 -1 -4
0 -3 -3 -3 -1 -2 -2 -3 -3 3 1 -2 1 -1 -2 -2 0 -3 -1 4 -3 -2 -1 -4
-2 -1 3 4 -3 0 1 -1 0 -3 -4 0 -3 -3 -2 0 -1 -4 -3 -3 4 1 -1 -4
-1 0 0 1 -3 3 4 -2 0 -3 -3 1 -1 -3 -1 0 -1 -3 -2 -2 1 4 -1 -4
0 -1 -1 -1 -2 -1 -1 -1 -1 -1 -1 -1 -1 -1 -2 0 0 -2 -1 -1 -1 -1 -1 -4
-4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 1`.split('\n').map((r) => r.trim().split(/\s+/).map(Number));
/** Dayhoff's PAM250 (M512), the same 24 letters and order as BLOSUM62 (from the matrix file NCBI and Biopython ship). */
const PAM = `2 -2  0  0 -2  0  0  1 -1 -1 -2 -1 -1 -3  1  1  1 -6 -3  0  0  0  0 -8
-2  6  0 -1 -4  1 -1 -3  2 -2 -3  3  0 -4  0  0 -1  2 -4 -2 -1  0 -1 -8
0  0  2  2 -4  1  1  0  2 -2 -3  1 -2 -3  0  1  0 -4 -2 -2  2  1  0 -8
0 -1  2  4 -5  2  3  1  1 -2 -4  0 -3 -6 -1  0  0 -7 -4 -2  3  3 -1 -8
-2 -4 -4 -5 12 -5 -5 -3 -3 -2 -6 -5 -5 -4 -3  0 -2 -8  0 -2 -4 -5 -3 -8
0  1  1  2 -5  4  2 -1  3 -2 -2  1 -1 -5  0 -1 -1 -5 -4 -2  1  3 -1 -8
0 -1  1  3 -5  2  4  0  1 -2 -3  0 -2 -5 -1  0  0 -7 -4 -2  3  3 -1 -8
1 -3  0  1 -3 -1  0  5 -2 -3 -4 -2 -3 -5  0  1  0 -7 -5 -1  0  0 -1 -8
-1  2  2  1 -3  3  1 -2  6 -2 -2  0 -2 -2  0 -1 -1 -3  0 -2  1  2 -1 -8
-1 -2 -2 -2 -2 -2 -2 -3 -2  5  2 -2  2  1 -2 -1  0 -5 -1  4 -2 -2 -1 -8
-2 -3 -3 -4 -6 -2 -3 -4 -2  2  6 -3  4  2 -3 -3 -2 -2 -1  2 -3 -3 -1 -8
-1  3  1  0 -5  1  0 -2  0 -2 -3  5  0 -5 -1  0  0 -3 -4 -2  1  0 -1 -8
-1  0 -2 -3 -5 -1 -2 -3 -2  2  4  0  6  0 -2 -2 -1 -4 -2  2 -2 -2 -1 -8
-3 -4 -3 -6 -4 -5 -5 -5 -2  1  2 -5  0  9 -5 -3 -3  0  7 -1 -4 -5 -2 -8
1  0  0 -1 -3  0 -1  0  0 -2 -3 -1 -2 -5  6  1  0 -6 -5 -1 -1  0 -1 -8
1  0  1  0  0 -1  0  1 -1 -1 -3  0 -2 -3  1  2  1 -2 -3 -1  0  0  0 -8
1 -1  0  0 -2 -1  0  0 -1  0 -2  0 -1 -3  0  1  3 -5 -3  0  0 -1  0 -8
-6  2 -4 -7 -8 -5 -7 -7 -3 -5 -2 -3 -4  0 -6 -2 -5 17  0 -6 -5 -6 -4 -8
-3 -4 -2 -4  0 -4 -4 -5  0 -1 -1 -4 -2  7 -5 -3 -3  0 10 -2 -3 -4 -2 -8
0 -2 -2 -2 -2 -2 -2 -1 -2  4  2 -2  2 -1 -1 -1  0 -6 -2  4 -2 -2 -1 -8
0 -1  2  3 -4  1  3  0  1 -2 -3  1 -2 -4 -1  0  0 -5 -3 -2  3  2 -1 -8
0  0  1  3 -5  3  3  0  2 -2 -3  0 -2 -5  0  0 -1 -6 -4 -2  2  3 -1 -8
0 -1  0 -1 -3 -1 -1 -1 -1 -1 -1 -1 -1 -2 -1  0  0 -4 -2 -1 -1 -1 -1 -8
-8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8 -8  1`.split('\n').map((r) => r.trim().split(/\s+/).map(Number));
export type Scorer = (a: string, b: string) => number;
export const pam250: Scorer = (a, b) => { const i = B62_AAS.indexOf(a.toUpperCase()), j = B62_AAS.indexOf(b.toUpperCase()); return PAM[i < 0 ? 22 : i][j < 0 ? 22 : j]; };
export const blosum62: Scorer = (a, b) => { const i = B62_AAS.indexOf(a.toUpperCase()), j = B62_AAS.indexOf(b.toUpperCase()); return B62[i < 0 ? 22 : i][j < 0 ? 22 : j]; };
/** Nucleotides: +5 for a match, −4 for a mismatch (as NUC44 on A, C, G, T), −2 against N. */
export const nucleotide: Scorer = (a, b) => { const x = a.toUpperCase().replace('U', 'T'), y = b.toUpperCase().replace('U', 'T'); return x === 'N' || y === 'N' ? -2 : x === y ? 5 : -4; };
/** Whether a text is DNA/RNA (only ACGTUN). */
export const isNucleotide = (s: string) => /^[ACGTUN]+$/i.test(s);

export interface Alignment { score: number; top: string; mid: string; bottom: string; start: [number, number]; identity: number }
/** Gotoh's affine-gap dynamic programming: a gap of length L costs open + (L − 1) × extend. Global (Needleman–Wunsch)
 * or local (Smith–Waterman). */
export function align(a: string, b: string, score: Scorer, open = 8, extend = open, local = false): Alignment {
  const n = a.length, m = b.length, NEG = -1e18, W = m + 1, size = (n + 1) * W;
  // M ends in a pair, X in a letter of a against a gap, Y in a gap against a letter of b; P* remember which of the
  // three each came from (3: a local alignment starts here).
  const M = new Float64Array(size).fill(NEG), X = new Float64Array(size).fill(NEG), Y = new Float64Array(size).fill(NEG);
  const PM = new Uint8Array(size), PX = new Uint8Array(size), PY = new Uint8Array(size);
  M[0] = 0;
  for (let i = 1; i <= n; i++) { if (local) { M[i * W] = 0; PM[i * W] = 3; } else { X[i * W] = -open - (i - 1) * extend; PX[i * W] = i > 1 ? 1 : 0; } }
  for (let j = 1; j <= m; j++) { if (local) { M[j] = 0; PM[j] = 3; } else { Y[j] = -open - (j - 1) * extend; PY[j] = j > 1 ? 2 : 0; } }
  if (local) PM[0] = 3;
  const pick = (v: number[]) => { let k = 0; for (let q = 1; q < 3; q++) if (v[q] > v[k]) k = q; return k; };
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const k = i * W + j, d = k - W - 1, u = k - W, l = k - 1;
    const md = [M[d], X[d], Y[d]], km = pick(md);
    M[k] = md[km] + score(a[i - 1], b[j - 1]); PM[k] = km;
    if (local && M[k] <= 0) { M[k] = 0; PM[k] = 3; }
    const xu = [M[u] - open, X[u] - extend, Y[u] - open], kx = pick(xu); X[k] = xu[kx]; PX[k] = kx;
    const yl = [M[l] - open, X[l] - open, Y[l] - extend], ky = pick(yl); Y[k] = yl[ky]; PY[k] = ky;
    if (local && M[k] > best) { best = M[k]; bi = i; bj = j; }
  }
  let i = local ? bi : n, j = local ? bj : m;
  const end = i * W + j;
  let state = local ? 0 : pick([M[end], X[end], Y[end]]);
  const total = local ? best : [M, X, Y][state][end];
  let top = '', bottom = '', mid = '';
  while (i > 0 || j > 0) {
    const k = i * W + j;
    if (state === 0) {
      if (PM[k] === 3 || (i === 0 && j === 0)) break;
      const s = score(a[i - 1], b[j - 1]);
      top = a[i - 1] + top; bottom = b[j - 1] + bottom; mid = (a[i - 1].toUpperCase() === b[j - 1].toUpperCase() ? '|' : s > 0 ? ':' : ' ') + mid;
      state = PM[k]; i--; j--;
    } else if (state === 1) { top = a[i - 1] + top; bottom = '-' + bottom; mid = ' ' + mid; state = PX[k]; i--; }
    else { top = '-' + top; bottom = b[j - 1] + bottom; mid = ' ' + mid; state = PY[k]; j--; }
  }
  const same = [...mid].filter((c) => c === '|').length;
  return { score: total, top, mid, bottom, start: [i + 1, j + 1], identity: mid.length ? same / mid.length : 0 };
}

/** Distance between two aligned sequences: the share of differing sites (gaps left out), or Jukes–Cantor's
 * −¾ ln(1 − 4p/3) correction for multiple changes at one site. */
export function distance(a: string, b: string, method: 'p' | 'jukes-cantor' = 'jukes-cantor'): number {
  let diff = 0, sites = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === '-' || b[i] === '-') continue; sites++; if (a[i].toUpperCase() !== b[i].toUpperCase()) diff++; }
  const p = sites ? diff / sites : NaN;
  return method === 'p' ? p : p >= 0.75 ? Infinity : -0.75 * Math.log(1 - (4 * p) / 3);
}

export interface Tree { newick: string; /** Parent of each node (leaves 0…n−1 first), −1 at the root. */ parent: number[]; length: number[]; height: number[]; names: string[] }
/** UPGMA: join the closest pair, the new group's distance the size-weighted average; heights are half the distance. */
export function upgma(D: number[][], names: string[]): Tree {
  const n = D.length, parent: number[] = Array(2 * n - 1).fill(-1), height = Array(2 * n - 1).fill(0), size = Array(2 * n - 1).fill(1), length = Array(2 * n - 1).fill(0);
  const d = new Map<string, number>(), key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`), live = new Set(Array.from({ length: n }, (_, i) => i)), label: string[] = names.slice();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d.set(key(i, j), D[i][j]);
  for (let node = n; node < 2 * n - 1; node++) {
    let bi = -1, bj = -1, bd = Infinity;
    for (const i of live) for (const j of live) if (i < j && d.get(key(i, j))! < bd) { bd = d.get(key(i, j))!; bi = i; bj = j; }
    height[node] = bd / 2; size[node] = size[bi] + size[bj];
    for (const c of [bi, bj]) { parent[c] = node; length[c] = height[node] - height[c]; }
    live.delete(bi); live.delete(bj);
    for (const k of live) d.set(key(node, k), (size[bi] * d.get(key(bi, k))! + size[bj] * d.get(key(bj, k))!) / size[node]);
    live.add(node);
    label[node] = `(${label[bi]}:${fmt(length[bi])},${label[bj]}:${fmt(length[bj])})`;
  }
  return { newick: `${label[2 * n - 2]};`, parent, length, height, names };
}
const fmt = (x: number) => String(+x.toFixed(6));

/** Neighbour joining (Saitou and Nei 1987): unrooted; drawn rooted at the last join. */
export function neighborJoin(D0: number[][], names: string[]): Tree {
  const n = D0.length, parent: number[] = Array(2 * n - 2).fill(-1), length = Array(2 * n - 2).fill(0), label = names.slice();
  let nodes = Array.from({ length: n }, (_, i) => i), D = D0.map((r) => r.slice()), next = n;
  while (nodes.length > 2) {
    const r = nodes.length, sums = D.map((row) => row.reduce((s, x) => s + x, 0));
    let bi = 0, bj = 1, bq = Infinity;
    for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) { const q = (r - 2) * D[i][j] - sums[i] - sums[j]; if (q < bq) { bq = q; bi = i; bj = j; } }
    const li = D[bi][bj] / 2 + (sums[bi] - sums[bj]) / (2 * (r - 2)), lj = D[bi][bj] - li, u = next++;
    parent[nodes[bi]] = u; parent[nodes[bj]] = u; length[nodes[bi]] = Math.max(0, li); length[nodes[bj]] = Math.max(0, lj);
    label[u] = `(${label[nodes[bi]]}:${fmt(length[nodes[bi]])},${label[nodes[bj]]}:${fmt(length[nodes[bj]])})`;
    const du = D.map((row) => (row[bi] + row[bj] - D[bi][bj]) / 2);
    const keep = nodes.map((_, k) => k).filter((k) => k !== bi && k !== bj);
    D = [...keep.map((k) => [...keep.map((q) => D[k][q]), du[k]]), [...keep.map((k) => du[k]), 0]];
    nodes = [...keep.map((k) => nodes[k]), u];
  }
  // The last two joined by their distance: the root sits on the second, the first hangs from it.
  const [a, b] = nodes;
  parent[a] = b; length[a] = Math.max(0, D[0][1]);
  const height: number[] = Array(next).fill(0);
  const depth = (k: number): number => (parent[k] < 0 ? 0 : length[k] + depth(parent[k]));
  const d = Array.from({ length: next }, (_, k) => depth(k)), deepest = Math.max(...d);
  d.forEach((x, k) => { height[k] = deepest - x; });
  return { newick: `(${label[a]}:${fmt(length[a])},${label[b].replace(/^\(|\)$/g, '')});`, parent: parent.slice(0, next), length: length.slice(0, next), height, names };
}

/** Where to draw a tree: each node's x (its distance from the root) and y (leaves 1…n in drawing order; a node at
 * the middle of its children), and the elbow lines. */
export function treeLayout(t: Tree) {
  const N = t.parent.length, kids: number[][] = Array.from({ length: N }, () => []);
  t.parent.forEach((p, k) => { if (p >= 0) kids[p].push(k); });
  const root = t.parent.findIndex((p) => p < 0), x = Array(N).fill(0), y = Array(N).fill(0), order: number[] = [];
  const walk = (k: number, at: number) => { x[k] = at; if (!kids[k].length) { order.push(k); y[k] = order.length; return; } kids[k].forEach((c) => walk(c, at + t.length[c])); y[k] = kids[k].reduce((s, c) => s + y[c], 0) / kids[k].length; };
  walk(root, 0);
  const lx: number[] = [], ly: number[] = [];
  for (let k = 0; k < N; k++) if (t.parent[k] >= 0) { const p = t.parent[k]; lx.push(x[p], x[p], x[k], NaN); ly.push(y[p], y[k], y[k], NaN); }
  return { x, y, order, lx, ly };
}

// ——— Files (M512) ———
export interface FastaRecord { header: string; sequence: string }
/** FASTA text: '>' starts a record's header line, the lines after it are its sequence (spaces, digits and '*' at the
 * end dropped); ';' lines are old-style comments. */
export function parseFasta(text: string): FastaRecord[] {
  const out: FastaRecord[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('>')) out.push({ header: line.slice(1).trim(), sequence: '' });
    else if (out.length) out[out.length - 1].sequence += line.replace(/[\s\d]/g, '');
  }
  for (const r of out) r.sequence = r.sequence.replace(/\*$/, '');
  return out;
}
export const writeFasta = (recs: FastaRecord[], width = 70) => recs.map((r) => `>${r.header}\n${r.sequence.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\n') ?? ''}`).join('\n') + '\n';

export interface GenBank { locus: string; length: number; molecule: string; definition: string; accession: string; version: string; organism: string; sequence: string; features: { type: string; location: string; gene: string; product: string }[] }
/** The first record of a GenBank flat file: the LOCUS line, DEFINITION, ACCESSION, VERSION, ORGANISM, the FEATURES
 * table (type, location and its /gene and /product) and the ORIGIN sequence. */
export function parseGenBank(text: string): GenBank {
  const lines = text.split(/\r?\n/), g: GenBank = { locus: '', length: NaN, molecule: '', definition: '', accession: '', version: '', organism: '', sequence: '', features: [] };
  let section = '', seq = '';
  const field = (l: string) => l.slice(12).trim();
  for (const l of lines) {
    if (l.startsWith('//')) break;
    const key = /^([A-Z]+)\b/.exec(l)?.[1];
    if (key) section = key;
    if (key === 'LOCUS') { const w = field(l).split(/\s+/); g.locus = w[0] ?? ''; g.length = Number(w[1]); g.molecule = w.find((x) => /DNA|RNA|^AA$/i.test(x)) ?? (/aa\b/.test(l) ? 'AA' : ''); }
    else if (key === 'DEFINITION' || (section === 'DEFINITION' && !key)) g.definition += (g.definition ? ' ' : '') + field(l);
    else if (key === 'ACCESSION') g.accession = field(l).split(/\s+/)[0];
    else if (key === 'VERSION') g.version = field(l).split(/\s+/)[0];
    else if (/^ {2}ORGANISM/.test(l)) g.organism = field(l);
    else if (section === 'FEATURES' && !key) {
      const head = /^ {5}(\S+)\s+(\S.*)$/.exec(l), q = /^ {21}\/(\w+)=?"?([^"]*)"?/.exec(l), more = /^ {21}([^/].*)$/.exec(l);
      const f = g.features[g.features.length - 1];
      if (head) g.features.push({ type: head[1], location: head[2].trim(), gene: '', product: '' });
      else if (q && f) { if (q[1] === 'gene' && !f.gene) f.gene = q[2]; if (q[1] === 'product' && !f.product) f.product = q[2]; }
      else if (more && f && !f.gene && !f.product && /[\d.,()<>]$/.test(more[1].trim()) && /^[\w.,()<>]+$/.test(more[1].trim())) f.location += more[1].trim();
    } else if (section === 'ORIGIN' && !key) seq += l.replace(/[\s\d]/g, '');
  }
  g.sequence = seq.toUpperCase();
  if (!g.locus && !g.sequence) throw new Error('This doesn\'t look like a GenBank file (no LOCUS line or ORIGIN sequence).');
  return g;
}

// ——— Multiple alignment (M512) ———
/** Progressive multiple alignment, as ClustalW does in outline: every pair aligned globally for its distance (1 −
 * identity), a UPGMA guide tree, then the two closest groups aligned as profiles, group by group up the tree. Two
 * profiles' columns score the average of their letters' pair scores (gaps against letters 0); gaps by Gotoh's three
 * states (open + (L − 1) × extend), so gaps once opened in a group stay in every member. */
export function multialign(seqs: string[], score: Scorer, open = 10, extend = 0.5): { aligned: string[]; tree: Tree } {
  const n = seqs.length, D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = 1 - align(seqs[i], seqs[j], score, open, extend).identity;
  const tree = upgma(D, seqs.map((_, i) => `S${i + 1}`)), groups = new Map<number, { rows: number[]; cols: string[] }>();
  seqs.forEach((s, i) => groups.set(i, { rows: [i], cols: [s.toUpperCase()] }));
  for (let node = n; node < 2 * n - 1; node++) {
    const [a, b] = tree.parent.map((p, k) => (p === node ? k : -1)).filter((k) => k >= 0);
    const A = groups.get(a)!, B = groups.get(b)!;
    groups.set(node, { rows: [...A.rows, ...B.rows], cols: alignProfiles(A.cols, B.cols, score, open, extend) });
    groups.delete(a); groups.delete(b);
  }
  const root = groups.get(2 * n - 2) ?? groups.get(0)!, aligned: string[] = new Array(n);
  root.rows.forEach((r, k) => { aligned[r] = root.cols[k]; });
  return { aligned, tree };
}
function alignProfiles(A: string[], B: string[], score: Scorer, open: number, extend: number): string[] {
  const m = A[0].length, n = B[0].length, NEG = -1e18;
  const col = (P: string[], i: number) => P.map((s) => s[i]);
  const ca = Array.from({ length: m }, (_, i) => col(A, i)), cb = Array.from({ length: n }, (_, j) => col(B, j));
  const memo = new Map<string, number>(), pair = (x: string, y: string) => { const k = x + y; let v = memo.get(k); if (v === undefined) { v = x === '-' || y === '-' ? 0 : score(x, y); memo.set(k, v); } return v; };
  const sc = (i: number, j: number) => { let s = 0; for (const x of ca[i]) for (const y of cb[j]) s += pair(x, y); return s / (ca[i].length * cb[j].length); };
  // M: column i against column j; X: column i against a gap; Y: a gap against column j. Pointers: 0 from M, 1 X, 2 Y.
  const W = n + 1, M = new Float64Array((m + 1) * W).fill(NEG), X = new Float64Array((m + 1) * W).fill(NEG), Y = new Float64Array((m + 1) * W).fill(NEG);
  const PM = new Uint8Array((m + 1) * W), PX = new Uint8Array((m + 1) * W), PY = new Uint8Array((m + 1) * W);
  M[0] = 0;
  for (let i = 1; i <= m; i++) { X[i * W] = -open - (i - 1) * extend; PX[i * W] = i === 1 ? 0 : 1; }
  for (let j = 1; j <= n; j++) { Y[j] = -open - (j - 1) * extend; PY[j] = j === 1 ? 0 : 2; }
  const best3 = (a: number, b: number, c: number): [number, number] => (a >= b && a >= c ? [a, 0] : b >= c ? [b, 1] : [c, 2]);
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const d = (i - 1) * W + (j - 1), u = (i - 1) * W + j, l = i * W + (j - 1), h = i * W + j;
    const [vm, pm] = best3(M[d], X[d], Y[d]); M[h] = vm + sc(i - 1, j - 1); PM[h] = pm;
    const [vx, px] = best3(M[u] - open, X[u] - extend, Y[u] - open); X[h] = vx; PX[h] = px;
    const [vy, py] = best3(M[l] - open, X[l] - open, Y[l] - extend); Y[h] = vy; PY[h] = py;
  }
  const outA = A.map(() => [] as string[]), outB = B.map(() => [] as string[]);
  let i = m, j = n, state = best3(M[m * W + n], X[m * W + n], Y[m * W + n])[1];
  while (i > 0 || j > 0) {
    const h = i * W + j;
    if (state === 0 && i > 0 && j > 0) { A.forEach((s, k) => outA[k].push(s[i - 1])); B.forEach((s, k) => outB[k].push(s[j - 1])); state = PM[h]; i--; j--; }
    else if (state === 1 && i > 0) { A.forEach((s, k) => outA[k].push(s[i - 1])); B.forEach((_, k) => outB[k].push('-')); state = PX[h]; i--; }
    else { A.forEach((_, k) => outA[k].push('-')); B.forEach((s, k) => outB[k].push(s[j - 1])); state = j > 0 ? PY[h] : 1; j--; if (j < 0) break; }
  }
  return [...outA, ...outB].map((r) => r.reverse().join(''));
}
/** The most common letter of each aligned column (gaps count; ties to the earlier letter), and how many agree. */
export function consensus(aligned: string[]): { seq: string; agree: number[] } {
  let seq = '';
  const agree: number[] = [];
  for (let i = 0; i < (aligned[0]?.length ?? 0); i++) {
    const c = new Map<string, number>();
    for (const s of aligned) { const x = s[i].toUpperCase(); c.set(x, (c.get(x) ?? 0) + 1); }
    let bx = '-', bn = 0;
    for (const [x, k] of c) if (k > bn) { bx = x; bn = k; }
    seq += bx; agree.push(bn);
  }
  return { seq, agree };
}
