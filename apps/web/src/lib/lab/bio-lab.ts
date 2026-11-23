import { LabError } from './parse';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Value } from './values';
import { table } from './table';
import * as bio from './bio';
import { call, col, def, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's DNA and protein tools in the language (M494): seqcomplement, seqrcomplement, seqreverse, basecount,
// gcContent, nt2aa, findORFs, nwalign, swalign, seqpdist, seqlinkage, seqneighjoin, plottree. MATLAB's names where they
// behave alike; findORFs, gcContent and plottree are our own (MATLAB prints ORFs in a window, has ntdensity, and draws a
// phytree object, which the engine doesn't have: our trees are structs with their Newick text).

const seq = (v: Value | undefined, what = 'The sequence') => {
  if (!v || (v.k !== 'str' && v.k !== 'mat')) throw new LabError(`${what} is text, like 'ATGGCC'.`);
  return bio.clean(textOf(v));
};
const cellOf = (d: string[]): Cell => ({ k: 'cell', r: d.length, c: 1, d: d.map(str) });

def('seqcomplement', (a) => [str(bio.complement(seq(a[0])))]);
def('seqrcomplement', (a) => [str(bio.reverseComplement(seq(a[0])))]);
def('seqreverse', (a) => [str([...seq(a[0])].reverse().join(''))]);
def('basecount', (a) => { const c = bio.counts(seq(a[0])); return [record(Object.entries(c))]; });
def('gcContent', (a) => [num(bio.gcContent(seq(a[0])))]);
def('nt2aa', (a) => {
  const s = seq(a[0]), o = options(a, 1, ['Frame'], 'nt2aa'), f = o.get('Frame');
  if (f?.k === 'str') { if (f.v.toLowerCase() !== 'all') throw new LabError("'Frame' is 1, 2, 3 or 'all'."); return [cellOf([1, 2, 3].map((k) => bio.translate(s, k)))]; }
  const k = Math.round(optNum(o, 'Frame', 1));
  if (![1, 2, 3].includes(k)) throw new LabError("'Frame' is 1, 2, 3 or 'all'.");
  return [str(bio.translate(s, k))];
});
def('findORFs', (a, nout, lab) => {
  const s = seq(a[0]), o = options(a, 1, ['MinLength'], 'findORFs'), min = Math.round(optNum(o, 'MinLength', 30));
  if (!(min >= 1)) throw new LabError("'MinLength' is the shortest reading frame in codons (1 or more).");
  if (s.length > 2e6) throw new LabError('findORFs reads up to 2 million bases.');
  const r = bio.orfs(s, min);
  const t = table([['Strand', col(r.map((x) => x.strand))], ['Frame', col(r.map((x) => x.frame))], ['Start', col(r.map((x) => x.start))], ['Stop', col(r.map((x) => x.stop))], ['Length', col(r.map((x) => x.length))], ['Protein', cellOf(r.map((x) => x.protein))]]);
  if (nout > 0) return [t];
  lab.host.out(r.length ? `${r.length} open reading frame${r.length > 1 ? 's' : ''} of ${min}+ codons:\n${r.slice(0, 20).map((x) => `  ${x.strand > 0 ? '+' : '−'}${x.frame}  ${x.start}–${x.stop}  ${x.length} nt  ${x.protein.slice(0, 40)}${x.protein.length > 40 ? '…' : ''}`).join('\n')}${r.length > 20 ? `\n  … and ${r.length - 20} more` : ''}\n` : `No open reading frame of ${min}+ codons.\n`);
  return [];
});

function alignWith(a: Value[], local: boolean, lab: Lab, nout: number, name: string) {
  const x = seq(a[0], 'The first sequence'), y = seq(a[1], 'The second sequence');
  if (x.length * y.length > 2.5e7) throw new LabError(`${name} aligns up to about 5,000 × 5,000 letters.`);
  const o = options(a, 2, ['GapOpen', 'ExtendGap', 'Alphabet'], name), alpha = optText(o, 'Alphabet', bio.isNucleotide(x) && bio.isNucleotide(y) ? 'NT' : 'AA').toUpperCase();
  if (alpha !== 'NT' && alpha !== 'AA') throw new LabError("'Alphabet' is 'NT' (nucleotides) or 'AA' (amino acids).");
  const open = optNum(o, 'GapOpen', 8), extend = optNum(o, 'ExtendGap', open);
  if (!(open >= 0 && extend >= 0)) throw new LabError('Gap penalties are positive numbers (taken away from the score).');
  const r = bio.align(x, y, alpha === 'NT' ? bio.nucleotide : bio.blosum62, open, extend, local), text = `${r.top}\n${r.mid}\n${r.bottom}`;
  if (nout > 0) return [num(r.score), str(text), row(r.start), num(r.identity)];
  lab.host.out(`Score ${r.score}, ${(100 * r.identity).toFixed(1)}% identical over ${r.mid.length}${local ? `, from ${r.start[0]} and ${r.start[1]}` : ''}:\n`);
  for (let i = 0; i < r.mid.length; i += 60) lab.host.out(`  ${r.top.slice(i, i + 60)}\n  ${r.mid.slice(i, i + 60)}\n  ${r.bottom.slice(i, i + 60)}\n\n`);
  return [];
}
def('nwalign', (a, nout, lab) => alignWith(a, false, lab, nout, 'nwalign'));
def('swalign', (a, nout, lab) => alignWith(a, true, lab, nout, 'swalign'));

def('seqpdist', (a) => {
  if (a[0]?.k !== 'cell' || a[0].d.length < 2) throw new LabError("seqpdist needs a cell array of at least two sequences: seqpdist({'ACGT', 'ACGA', 'TCGA'}).");
  const s = a[0].d.map((v) => seq(v)), o = options(a, 1, ['Method', 'SquareForm', 'Alphabet'], 'seqpdist');
  const m = optText(o, 'Method', 'jukes-cantor').toLowerCase(), method = m === 'p-distance' || m === 'p' ? 'p' : m === 'jukes-cantor' ? 'jukes-cantor' : null;
  if (!method) throw new LabError("'Method' is 'jukes-cantor' or 'p-distance'.");
  if (s.length > 200) throw new LabError('seqpdist compares up to 200 sequences.');
  const nt = s.every(bio.isNucleotide), D = s.map(() => s.map(() => 0));
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    // Unequal lengths are aligned first (Needleman–Wunsch).
    const [p, q] = s[i].length === s[j].length ? [s[i], s[j]] : (() => { const r = bio.align(s[i], s[j], nt ? bio.nucleotide : bio.blosum62); return [r.top, r.bottom]; })();
    D[i][j] = D[j][i] = bio.distance(p, q, method);
  }
  if (optNum(o, 'SquareForm', 0)) { const M = mat(s.length, s.length); D.forEach((r, i) => r.forEach((v, j) => { M.d[i + j * s.length] = v; })); return [M]; }
  const v: number[] = [];
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) v.push(D[i][j]);
  return [row(v)];
});

/** A distance matrix from a square matrix or a pdist-style row. */
function square(v: Value | undefined): number[][] {
  const m = toMat(v ?? mat(0, 0), 'The distances');
  if (m.r === m.c && m.r > 1) return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.r }, (_, j) => m.d[i + j * m.r]));
  const k = m.d.length, n = Math.round((1 + Math.sqrt(1 + 8 * k)) / 2);
  if ((n * (n - 1)) / 2 !== k || n < 2) throw new LabError('The distances are a square matrix or a row from seqpdist (n(n − 1)/2 numbers).');
  const D = Array.from({ length: n }, () => Array(n).fill(0));
  let q = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = m.d[q++];
  return D;
}
const namesOf = (v: Value | undefined, n: number) => {
  if (v?.k === 'cell') { if (v.d.length !== n) throw new LabError(`There are ${n} sequences: give ${n} names.`); return v.d.map((x) => textOf(x).replace(/[(),:;\s]/g, '_')); }
  return Array.from({ length: n }, (_, i) => `Seq${i + 1}`);
};
const treeValue = (t: bio.Tree, method: string) => record([['Type', 'phytree'], ['Method', method], ['Newick', t.newick], ['Names', cellOf(t.names)], ['Parent', t.parent.map((p) => p + 1)], ['Length', t.length]]);
function drawTree(lab: Lab, t: bio.Tree, title: string) {
  const L = bio.treeLayout(t);
  call(lab, 'plot', row(L.lx), row(L.ly), str('LineWidth'), num(1.5));
  call(lab, 'yticks', row(L.order.map((_, i) => i + 1))); call(lab, 'yticklabels', { k: 'cell', r: 1, c: L.order.length, d: L.order.map((k) => str(t.names[k])) });
  const far = Math.max(...L.x) || 1;
  call(lab, 'xlim', row([-0.04 * far, 1.08 * far])); call(lab, 'ylim', row([0.5, L.order.length + 0.5])); call(lab, 'xlabel', str('Distance from the root')); call(lab, 'title', str(title));
}
function tree(a: Value[], nout: number, lab: Lab, name: string, nj: boolean) {
  const D = square(a[0]);
  if (D.length > 500) throw new LabError(`${name} builds trees of up to 500 sequences.`);
  if (D.some((r) => r.some((x) => !Number.isFinite(x) || x < 0))) throw new LabError('Every distance must be a finite number ≥ 0 (Jukes–Cantor is infinite past 75% different: try p-distance).');
  const method = !nj && a[1]?.k === 'str' ? a[1].v.toLowerCase() : nj ? 'neighbor-joining' : 'average';
  if (!nj && method !== 'average' && method !== 'upgma') throw new LabError(`${name} builds 'average' (UPGMA) trees.`);
  const names = namesOf(a.find((v, i) => i > 0 && v.k === 'cell'), D.length), t = nj ? bio.neighborJoin(D, names) : bio.upgma(D, names);
  if (nout > 0) return [treeValue(t, nj ? 'neighbor-joining' : 'UPGMA')];
  drawTree(lab, t, nj ? 'Neighbour-joining tree' : 'UPGMA tree');
  lab.host.out(`${t.newick}\n`);
  return [];
}
def('seqlinkage', (a, nout, lab) => tree(a, nout, lab, 'seqlinkage', false));
def('seqneighjoin', (a, nout, lab) => tree(a, nout, lab, 'seqneighjoin', true));
def('plottree', (a, _n, lab) => {
  const v = a[0];
  if (v?.k !== 'struct' || !v.f.has('Newick') || !v.f.has('Parent')) throw new LabError('plottree draws a tree from seqlinkage or seqneighjoin.');
  const parent = [...toMat(v.f.get('Parent')!).d].map((p) => p - 1), length = [...toMat(v.f.get('Length')!).d], names = (v.f.get('Names') as Cell).d.map((x) => textOf(x));
  drawTree(lab, { newick: textOf(v.f.get('Newick')!), parent, length, height: [], names }, `${textOf(v.f.get('Method')!)} tree`);
  return [];
});
