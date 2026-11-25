import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat, type Value } from './values';
import { textOf } from './interp';
import './sciences';
import * as bio from './bio';
import { FileStore } from './files';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };

describe('Hyperion DNA and protein tools (M494)', () => {
  it('complements, counts and translates', () => {
    expect(bio.reverseComplement('ATGCGTTA')).toBe('TAACGCAT');
    expect(bio.complement('acgtN')).toBe('tgcaN');
    expect(bio.gcContent('GGCCAT')).toBeCloseTo(4 / 6, 12);
    expect(bio.counts('AACGTTU')).toEqual({ A: 2, C: 1, G: 1, T: 3, Other: 0 });
    // The insulin B chain's first codons, and the standard code's stops and start.
    expect(bio.translate('ATGTTTGTGAATCAACACCTGTGCGGCTCACACCTGGTGGAAGCTTAA')).toBe('MFVNQHLCGSHLVEA*');
    expect(bio.translate('AUGUAAUAGUGA')).toBe('M***');
    expect(bio.translate('xATGGCC', 2)).toBe('MA');
  });
  it('finds open reading frames on both strands', () => {
    const gene = 'ATG' + 'GCT'.repeat(40) + 'TAA', s = 'CC' + gene + 'GG' + bio.reverseComplement('ATG' + 'AAA'.repeat(35) + 'TGA') + 'T';
    const r = bio.orfs(s, 30);
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ strand: 1, frame: 3, start: 3, stop: 2 + gene.length, length: gene.length });
    expect(r[0].protein).toBe('M' + 'A'.repeat(40));
    expect(r[1].strand).toBe(-1);
    expect(r[1].protein).toBe('M' + 'K'.repeat(35));
    expect(s.slice(r[1].stop - 1, r[1].start)).toBe(bio.reverseComplement('ATG' + 'AAA'.repeat(35) + 'TGA'));
  });
  it('aligns: Needleman–Wunsch and Smith–Waterman on textbook pairs', () => {
    // Durbin et al.'s example: HEAGAWGHEE against PAWHEAE, BLOSUM50 there; with BLOSUM62 and linear gaps of 8
    // the global alignment still lines up AW-HE.
    const g = bio.align('HEAGAWGHEE', 'PAWHEAE', bio.blosum62, 8, 8, false);
    expect(g.top.replace(/-/g, '')).toBe('HEAGAWGHEE');
    expect(g.bottom.replace(/-/g, '')).toBe('PAWHEAE');
    // The score of the alignment it returns is what the matrix says.
    let s = 0, gap = false;
    for (let i = 0; i < g.top.length; i++) { if (g.top[i] === '-' || g.bottom[i] === '-') { s -= 8; gap = true; } else s += bio.blosum62(g.top[i], g.bottom[i]); }
    expect(gap).toBe(true);
    expect(g.score).toBe(s);
    const l = bio.align('TTTTACGTACGTGGGG', 'CCACGTACGTCC', bio.nucleotide, 10, 1, true);
    expect(l.top).toBe('ACGTACGT');
    expect(l.score).toBe(40);
    expect(l.start).toEqual([5, 3]);
    // Affine gaps: one long gap beats two short ones.
    const af = bio.align('ACGTTTTTACGT', 'ACGTACGT', bio.nucleotide, 10, 1, false);
    expect(af.bottom.match(/-+/g)).toEqual(['----']);
    expect(af.score).toBe(40 - 10 - 3);
  });
  it('distances and trees', () => {
    expect(bio.distance('AAAAAAAAAA', 'AAAAAAAAAT', 'p')).toBeCloseTo(0.1, 12);
    expect(bio.distance('AAAAAAAAAA', 'AAAAAAAAAT')).toBeCloseTo(-0.75 * Math.log(1 - 0.4 / 3), 12);
    // Wikipedia's UPGMA worked example (5S rRNA of five bacteria).
    const D = [[0, 17, 21, 31, 23], [17, 0, 30, 34, 21], [21, 30, 0, 28, 39], [31, 34, 28, 0, 43], [23, 21, 39, 43, 0]];
    const u = bio.upgma(D, ['a', 'b', 'c', 'd', 'e']);
    expect(u.height[8]).toBeCloseTo(16.5, 9);
    expect(u.newick).toContain('(a:8.5,b:8.5)');
    // Wikipedia's neighbour-joining example: a and b join first, a's branch 2, b's 3.
    const nj = bio.neighborJoin([[0, 5, 9, 9, 8], [5, 0, 10, 10, 9], [9, 10, 0, 8, 7], [9, 10, 8, 0, 3], [8, 9, 7, 3, 0]], ['a', 'b', 'c', 'd', 'e']);
    expect(nj.newick).toContain('(a:2,b:3)');
    expect(nj.newick).toBe('((c:4,(a:2,b:3):3):2,d:2,e:1);'); // unrooted: three branches at the top
    const L = bio.treeLayout(nj);
    expect(L.order.length).toBe(5);
  });
  it('in the language', () => {
    const r = run("r = seqrcomplement('ATGC'); p = nt2aa('ATGGCCTAA'); [s, al] = nwalign('ACGTACGT', 'ACGACGT'); c = basecount('AAC'); n = c.A;\nD = seqpdist({'ACGTACGTAA', 'ACGTACGTAT', 'ACGTTCGTAT', 'TCGTTCGAAT'}, 'Method', 'p-distance'); t = seqlinkage(D, 'average', {'w', 'x', 'y', 'z'});\nseqneighjoin(D, 'equivar', {'w', 'x', 'y', 'z'})\no = findORFs(['ATG' repmat('GCT', 1, 40) 'TAA']);");
    expect(r.lab.vars.get('r')).toEqual({ k: 'str', v: 'GCAT' });
    expect(r.lab.vars.get('p')).toEqual({ k: 'str', v: 'MA*' });
    expect(r.d('s')[0]).toBe(35 - 8);
    expect(r.d('n')[0]).toBe(2);
    expect(r.d('D').map((x) => +x.toFixed(12))).toEqual([0.1, 0.2, 0.4, 0.1, 0.3, 0.2]);
    expect(r.out).toContain(';');
    expect(r.graphics.figures.length).toBe(1);
  });
});

const GB = `LOCUS       TEST0001                  48 bp    DNA     linear   SYN 24-NOV-2026
DEFINITION  A made-up gene for the reader's test,
            on two lines.
ACCESSION   XX000001
VERSION     XX000001.1
SOURCE      synthetic construct
  ORGANISM  synthetic construct
            other sequences.
FEATURES             Location/Qualifiers
     source          1..48
                     /organism="synthetic construct"
     gene            4..45
                     /gene="tst"
     CDS             join(4..21,
                     25..45)
                     /gene="tst"
                     /product="test protein"
ORIGIN
        1 aaaatggctg ctaaaggtgg ccttcatgaa ggctggtatt aataaaaa
//
`;
describe('Hyperion DNA tools, the left-outs (M512)', () => {
  it('genetic codes: the vertebrate mitochondrion reads TGA as W and AGA as a stop', () => {
    const mito = bio.geneticCode(2)!.aas;
    expect(bio.translate('ATGTGAAGAATA', 1, mito)).toBe('MW*M');
    expect(bio.translate('ATGTGAAGAATA')).toBe('M*RI');
    expect(bio.geneticCodes().every((c) => c.aas.length === 64)).toBe(true);
    expect(bio.geneticCode(11)!.starts).toContain('GTG');
  });
  it('PAM250 is symmetric with its known diagonal; it changes an alignment\'s score', () => {
    const L = 'ARNDCQEGHILKMFPSTWYV';
    for (const a of L) for (const b of L) expect(bio.pam250(a, b)).toBe(bio.pam250(b, a));
    expect([...L].map((a) => bio.pam250(a, a)).join(' ')).toBe('2 6 2 4 12 4 4 5 6 5 6 5 6 9 6 2 3 17 10 4');
    expect(bio.pam250('W', 'C')).toBe(-8);
  });
  it('FASTA and GenBank', () => {
    const r = bio.parseFasta('>one first\nACGT\nAC GT*\n;old comment\n> two\nMKV\n');
    expect(r).toEqual([{ header: 'one first', sequence: 'ACGTACGT' }, { header: 'two', sequence: 'MKV' }]);
    expect(bio.parseFasta(bio.writeFasta(r, 3))).toEqual(r);
    const g = bio.parseGenBank(GB);
    expect(g).toMatchObject({ locus: 'TEST0001', length: 48, molecule: 'DNA', accession: 'XX000001', version: 'XX000001.1', organism: 'synthetic construct' });
    expect(g.definition).toBe("A made-up gene for the reader's test, on two lines.");
    expect(g.sequence).toBe('AAAATGGCTGCTAAAGGTGGCCTTCATGAAGGCTGGTATTAATAAAAA');
    expect(g.features.map((f) => [f.type, f.location, f.gene, f.product])).toEqual([['source', '1..48', '', ''], ['gene', '4..45', 'tst', ''], ['CDS', 'join(4..21,25..45)', 'tst', 'test protein']]);
  });
  it('multiple alignment puts a shared gap in place and keeps every letter', () => {
    const s = ['MKTAYIAKQRQISFVKSHFSRQ', 'MKTAYIAKQISFVKSHFSRQ', 'MKTAYLAKQRQISFVKSHFSRQ', 'MKTAYIAKQRQISFVKAHFSRQ'];
    const r = bio.multialign(s, bio.blosum62, 10, 0.5);
    expect(new Set(r.aligned.map((x) => x.length)).size).toBe(1);
    r.aligned.forEach((x, i) => expect(x.replace(/-/g, '')).toBe(s[i]));
    expect(r.aligned[1]).toMatch(/^MKTAYIAKQ--ISFVKSHFSRQ$|^MKTAYIAKQ-{2}ISFVKSHFSRQ$|^MKTAYIAK--QISFVKSHFSRQ$|^MKTAYIAKQ-?-?ISFVKSHFSRQ$/);
    expect(bio.consensus(r.aligned).seq).toBe('MKTAYIAKQRQISFVKSHFSRQ');
    const dna = bio.multialign(['ACGTACGTTT', 'ACGTCGTTT', 'ACGTACGTTT', 'TACGTACGTTT'], bio.nucleotide, 10, 1);
    dna.aligned.forEach((x, i) => expect(x.replace(/-/g, '')).toBe(['ACGTACGTTT', 'ACGTCGTTT', 'ACGTACGTTT', 'TACGTACGTTT'][i]));
  });
  it('in the language, with files', () => {
    let out = '';
    const files = new FileStore(), lab = new Lab({ out: (t) => { out += t; }, graphics: new Graphics(), files });
    files.putText('seqs.gb', GB);
    lab.run("fastawrite('a.fasta', {'x', 'y'}, {'ACGTACGT', 'ACGTCGT'}); [h, q] = fastaread('a.fasta'); s = fastaread(['>only' char(10) 'MKV']); g = genbankread('seqs.gb'); n = g.LocusSequenceLength;\np = nt2aa('ATGTGAAGA', 'GeneticCode', 2); c = geneticcode('yeast'); id = c.ID; a = multialign({'MKTAYIAKQR', 'MKTAYAKQR', 'MKSAYIAKQR'}, 'ScoringMatrix', 'PAM250'); [cs, sh] = seqconsensus(a);\nmultialign(q)\ngeneticcode\n[sc, al] = nwalign('HEAGAWGHEE', 'PAWHEAE', 'ScoringMatrix', 'PAM250');");
    const v = (n: string) => lab.vars.get(n)!;
    expect(textOf(v('p'))).toBe('MW*');
    expect([...toMat(v('n')).d]).toEqual([48]);
    expect([...toMat(v('id')).d]).toEqual([3]);
    expect(textOf((v('q') as { d: Value[] }).d[1])).toBe('ACGTCGT');
    expect(textOf((v('s') as { f: Map<string, Value> }).f.get('Sequence')!)).toBe('MKV');
    expect(textOf(v('cs'))).toBe('MKTAYIAKQR');
    expect(files.text('a.fasta')).toBe('>x\nACGTACGT\n>y\nACGTCGT\n');
    expect(out).toMatch(/columns identical in all 2/);
    expect(out).toMatch(/Vertebrate Mitochondrial/);
  });
});

