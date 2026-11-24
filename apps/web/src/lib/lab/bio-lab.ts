import { LabError } from './parse';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Value } from './values';
import { table } from './table';
import * as bio from './bio';
import { fileText, writeFileText } from './files';
import { call, col, def, options, optNum, optText, record, row } from './sci-kit';

// Hyperion's DNA and protein tools in the language (M494): seqcomplement, seqrcomplement, seqreverse, basecount,
// gcContent, nt2aa, findORFs, nwalign, swalign, seqpdist, seqlinkage, seqneighjoin, plottree; fastaread, fastawrite,
// genbankread, geneticcode, multialign, seqconsensus, nt2aa's 'GeneticCode' and the aligners' 'ScoringMatrix' (M512). MATLAB's names where they
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
/** A genetic code by NCBI's number or (part of) its name. */
function codeOf(v: Value | undefined) {
  if (!v) return bio.geneticCode(1)!;
  const c = v.k === 'str' ? bio.geneticCodes().find((x) => x.name.toLowerCase().includes(v.v.toLowerCase().trim())) : bio.geneticCode(Math.round(toMat(v).d[0]));
  if (!c) throw new LabError(`There's no genetic code ${v.k === 'str' ? `named like '${v.v}'` : toMat(v).d[0]}: NCBI's numbers are ${bio.geneticCodes().map((x) => x.id).join(', ')} (geneticcode lists them).`);
  return c;
}
def('nt2aa', (a) => {
  const s = seq(a[0]), o = options(a, 1, ['Frame', 'GeneticCode'], 'nt2aa'), f = o.get('Frame'), code = codeOf(o.get('GeneticCode')).aas;
  if (f?.k === 'str') { if (f.v.toLowerCase() !== 'all') throw new LabError("'Frame' is 1, 2, 3 or 'all'."); return [cellOf([1, 2, 3].map((k) => bio.translate(s, k, code)))]; }
  const k = Math.round(optNum(o, 'Frame', 1));
  if (![1, 2, 3].includes(k)) throw new LabError("'Frame' is 1, 2, 3 or 'all'.");
  return [str(bio.translate(s, k, code))];
});
def('geneticcode', (a, nout, lab) => {
  if (!a.length && nout === 0) { lab.host.out(bio.geneticCodes().map((c) => `  ${String(c.id).padStart(2)}  ${c.name}`).join('\n') + '\n'); return []; }
  const c = codeOf(a[0]);
  const B = 'TCAG', codons = [...B].flatMap((x) => [...B].flatMap((y) => [...B].map((z) => x + y + z)));
  return [record([['ID', c.id], ['Name', c.name], ['AminoAcids', c.aas], ['Codons', cellOf(codons)], ['Starts', cellOf(c.starts)], ['Stops', cellOf(codons.filter((_, i) => c.aas[i] === '*'))]])];
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

/** 'ScoringMatrix': 'BLOSUM62' or 'PAM250' for proteins, 'NUC44'-like +5/−4 for DNA. */
function scorer(o: Map<string, Value>, nt: boolean): bio.Scorer {
  const m = optText(o, 'ScoringMatrix', nt ? 'NUC' : 'BLOSUM62').toUpperCase();
  if (m === 'BLOSUM62') return bio.blosum62;
  if (m === 'PAM250') return bio.pam250;
  if (m === 'NUC' || m === 'NUC44') return bio.nucleotide;
  throw new LabError("'ScoringMatrix' is 'BLOSUM62' or 'PAM250' (proteins), or 'NUC44' (DNA: +5 for a match, −4 for a mismatch).");
}
function alignWith(a: Value[], local: boolean, lab: Lab, nout: number, name: string) {
  const x = seq(a[0], 'The first sequence'), y = seq(a[1], 'The second sequence');
  if (x.length * y.length > 2.5e7) throw new LabError(`${name} aligns up to about 5,000 × 5,000 letters.`);
  const o = options(a, 2, ['GapOpen', 'ExtendGap', 'Alphabet', 'ScoringMatrix'], name), alpha = optText(o, 'Alphabet', bio.isNucleotide(x) && bio.isNucleotide(y) ? 'NT' : 'AA').toUpperCase();
  if (alpha !== 'NT' && alpha !== 'AA') throw new LabError("'Alphabet' is 'NT' (nucleotides) or 'AA' (amino acids).");
  const open = optNum(o, 'GapOpen', 8), extend = optNum(o, 'ExtendGap', open);
  if (!(open >= 0 && extend >= 0)) throw new LabError('Gap penalties are positive numbers (taken away from the score).');
  const r = bio.align(x, y, scorer(o, alpha === 'NT'), open, extend, local), text = `${r.top}\n${r.mid}\n${r.bottom}`;
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

// ——— Files (M512) ———
const textArg = (lab: Lab, v: Value | undefined, what: string, mark: RegExp) => {
  if (v?.k !== 'str') throw new LabError(`${what} needs a file name (from Files) or the file's text.`);
  return mark.test(v.v) ? v.v : fileText(lab, v.v);
};
/** FASTA from a file kept in Files, or from text that starts with '>'. One output: a struct of Header and Sequence
 * (text for one record, cells for several); two: the headers and sequences as cells. */
def('fastaread', (a, nout, lab) => {
  const recs = bio.parseFasta(textArg(lab, a[0], 'fastaread', /^\s*[>;]/));
  if (!recs.length) throw new LabError("No FASTA records: each starts with a '>' header line.");
  if (nout >= 2) return [cellOf(recs.map((r) => r.header)), cellOf(recs.map((r) => r.sequence))];
  return [recs.length === 1 ? record([['Header', recs[0].header], ['Sequence', recs[0].sequence]]) : record([['Header', cellOf(recs.map((r) => r.header))], ['Sequence', cellOf(recs.map((r) => r.sequence))]])];
});
/** fastawrite(file, header, sequence), or (file, struct) from fastaread, or (file, headers, sequences) as cells; adds to
 * the file when it exists, as MATLAB does. */
def('fastawrite', (a, _n, lab) => {
  const name = a[0]?.k === 'str' ? a[0].v : '';
  if (!name) throw new LabError('fastawrite needs a file name first.');
  const list = (v: Value | undefined) => (v?.k === 'cell' ? v.d.map((x) => textOf(x)) : v ? [textOf(v)] : []);
  let h: string[], q: string[];
  if (a[1]?.k === 'struct') { h = list(a[1].f.get('Header')); q = list(a[1].f.get('Sequence')); }
  else if (a.length >= 3) { h = list(a[1]); q = list(a[2]); }
  else { q = list(a[1]); h = q.map((_, i) => `Sequence ${i + 1}`); }
  if (!q.length || h.length !== q.length) throw new LabError('fastawrite needs as many headers as sequences.');
  let before = '';
  try { before = fileText(lab, name); } catch { before = ''; }
  writeFileText(lab, name, before + bio.writeFasta(q.map((s, i) => ({ header: h[i], sequence: bio.clean(s) }))));
  return [];
});
/** The first record of a GenBank file: its locus, definition, accession, organism, sequence and features (a table). */
def('genbankread', (a, _n, lab) => {
  let g: bio.GenBank;
  try { g = bio.parseGenBank(textArg(lab, a[0], 'genbankread', /^\s*LOCUS\b/)); } catch (e) { if (e instanceof LabError) throw e; throw new LabError(`genbankread: ${(e as Error).message}`); }
  const f = g.features;
  const feats = table([['Type', cellOf(f.map((x) => x.type))], ['Location', cellOf(f.map((x) => x.location))], ['Gene', cellOf(f.map((x) => x.gene))], ['Product', cellOf(f.map((x) => x.product))]]);
  return [record([['LocusName', g.locus], ['LocusSequenceLength', g.length], ['LocusMoleculeType', g.molecule], ['Definition', g.definition], ['Accession', g.accession], ['Version', g.version], ['Organism', g.organism], ['Sequence', g.sequence], ['Features', feats]])];
});

// ——— Multiple alignment (M512) ———
const seqList = (v: Value | undefined, what: string) => {
  if (v?.k === 'struct' && v.f.get('Sequence')?.k === 'cell') return (v.f.get('Sequence') as Cell).d.map((x) => seq(x));
  if (v?.k !== 'cell' || v.d.length < 2) throw new LabError(`${what} needs a cell array of at least two sequences (or fastaread's struct).`);
  return v.d.map((x) => seq(x));
};
def('multialign', (a, nout, lab) => {
  const s = seqList(a[0], 'multialign'), o = options(a, 1, ['GapOpen', 'ExtendGap', 'ScoringMatrix'], 'multialign'), nt = s.every(bio.isNucleotide);
  if (s.length > 100) throw new LabError('multialign aligns up to 100 sequences.');
  if (s.some((x) => !x.length) || s.reduce((t, x) => t + x.length, 0) > 60_000) throw new LabError('multialign takes sequences that are not empty, up to 60,000 letters in all.');
  const open = optNum(o, 'GapOpen', 10), extend = optNum(o, 'ExtendGap', nt ? 1 : 0.5);
  if (!(open >= 0 && extend >= 0)) throw new LabError('Gap penalties are positive numbers.');
  const r = bio.multialign(s, scorer(o, nt), open, extend);
  if (nout > 0) return [cellOf(r.aligned), treeValue(r.tree, 'UPGMA guide tree')];
  const c = bio.consensus(r.aligned), marks = c.agree.map((k, i) => (k === s.length && c.seq[i] !== '-' ? '*' : ' ')).join('');
  const w = String(s.length).length + 2;
  for (let i = 0; i < marks.length; i += 60) {
    lab.host.out(r.aligned.map((x, k) => `${`S${k + 1}`.padEnd(w)}${x.slice(i, i + 60)}`).join('\n') + `\n${' '.repeat(w)}${marks.slice(i, i + 60)}\n\n`);
  }
  lab.host.out(`${[...marks].filter((x) => x === '*').length} of ${marks.length} columns identical in all ${s.length}.\n`);
  return [];
});
def('seqconsensus', (a) => {
  const s = seqList(a[0], 'seqconsensus');
  if (s.some((x) => x.length !== s[0].length)) throw new LabError('seqconsensus needs aligned sequences (all the same length): use multialign first.');
  const c = bio.consensus(s);
  return [str(c.seq), row(c.agree.map((k) => k / s.length))];
});
