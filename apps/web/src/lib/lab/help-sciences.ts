// Help for Hyperion's science and industry toolboxes (M492–M505), in help.ts's format (name | syntax | text), kept apart
// so the toolboxes built at the same time on other branches don't edit the same lines.
export const SCIENCES_HELP = `
# Epidemics
sir | [t, y, new] = sir(beta, gamma, [S I R], days, 'Intervention', [from to cut], 'Vaccinate', v) | The SIR epidemic: y's columns are the susceptible, infectious and recovered each day, new the day's new infections. 'Intervention' rows cut transmission by that share between two days; 'Vaccinate' moves that share of S a day to R ('VaccineFrom' a day); 'Mu' births and deaths. Drawn without outputs.
seir | [t, y, new] = seir(beta, sigma, gamma, [S E I R], days, …) | SEIR: the infected wait in E (latent, 1/sigma days) before infecting. Same options as sir.
sirAge | [t, y, new] = sirAge(beta, C, gamma, N, I0, days, …) | SIR by age groups: C(i, j) the daily contacts a person in group i has with group j, N and I0 the groups' sizes and first infected. y is [S1…Sn I1…In R1…Rn].
epiR0 | R0 = epiR0(beta, gamma, C, N) | The basic reproduction number: beta / gamma, or with groups the largest eigenvalue of the next-generation matrix.
epiFinalSize | z = epiFinalSize(R0) | The share of a population ever infected when nothing intervenes: z = 1 − exp(−R0 z).
herdImmunity | h = herdImmunity(R0) | The share that must be immune for an outbreak to shrink: 1 − 1/R0.
fitEpidemic | f = fitEpidemic(cases, N, 'Model', 'SEIR', 'Sigma', 0.2, 'Report', 0.5) | Fits beta, gamma and the first infected to daily new cases (log scale, Levenberg–Marquardt from nine starts): a struct with Beta, Gamma, I0, R0, RMSE and Fitted. 'Report' is the share of infections counted. Drawn without outputs.
epiRt | [R, lo, hi] = epiRt(cases, mean, sd, 'Window', 7) | The reproduction number over time from daily cases (the renewal equation; the serial interval a gamma with that mean and sd, days), with a 95% band. Drawn without outputs.
# Pharmacokinetics
pkModel | m = pkModel('CL', 5, 'V', 50, 'Q', 10, 'V2', 80, 'ka', 1.2, 'F', 0.8) | A drug model: clearance CL (L/h) and volume V (L); 'Q' and 'V2' add a second (tissue) compartment, 'ka' (1/h) and 'F' are oral absorption and bioavailability; 'Vmax' (mg/h) and 'Km' (mg/L) make elimination saturate. Its HalfLife and Rates are in the struct.
pkSimulate | [t, C] = pkSimulate(m, dose, 'Route', 'oral', 'Every', 12, 'Doses', 6, 'Hours', 96, 'Window', [MEC MTC]) | The blood concentration over time for a schedule of doses: 'Route' 'iv' (a bolus), 'infusion' (with 'Duration', h) or 'oral'; 'Times' for doses at given hours. Drawn without outputs, with the window if given.
pkSteadyState | s = pkSteadyState(m, dose, tau, 'Route', 'oral') | After many doses every tau hours: Cmax, Cmin, Cavg (F·dose / (CL·tau)), the accumulation and the hours to reach 90% (TimeTo90), with the profile t, C.
pkDosingWindow | w = pkDosingWindow(m, MEC, MTC, 'Route', 'oral') | The longest interval and its dose that keep the steady state between the lowest level that works and the highest that is safe, and a practical interval (4, 6, 8, 12, 24 h…) with its dose. Drawn and explained without outputs.
pkNCA | p = pkNCA(t, C, dose, 'Tail', 3) | Non-compartmental analysis of measured levels after one dose: Cmax, Tmax, AUClast, AUCinf, LambdaZ, HalfLife, CL, Vz and MRT.
# DNA and proteins
seqcomplement | c = seqcomplement(seq) | The complementary strand (A↔T, C↔G, and the ambiguity letters), same direction.
seqrcomplement | r = seqrcomplement(seq) | The reverse complement: the other strand read 5′ to 3′.
seqreverse | r = seqreverse(seq) | The sequence backwards.
basecount | c = basecount(seq) | How many A, C, G, T (U counted as T) and other letters: a struct.
gcContent | g = gcContent(seq) | The share of G and C among the bases (0 to 1).
nt2aa | p = nt2aa(seq, 'Frame', 1) | Translates DNA or RNA to a protein by the standard genetic code ('*' a stop, 'X' unknown); 'Frame', 'all' gives the three frames in a cell.
findORFs | t = findORFs(seq, 'MinLength', 30) | Open reading frames (ATG to a stop) on both strands, longest first: a table of Strand, Frame, Start, Stop, Length and Protein. Printed without outputs.
nwalign | [score, alignment, start, identity] = nwalign(a, b, 'GapOpen', 8, 'ExtendGap', 2, 'Alphabet', 'AA') | Global alignment (Needleman–Wunsch, affine gaps): BLOSUM62 for proteins, +5/−4 for DNA. The alignment is three lines ('|' same, ':' similar). Printed without outputs.
swalign | [score, alignment, start, identity] = swalign(a, b, …) | Local alignment (Smith–Waterman): the best-matching stretch of each and where it starts.
seqpdist | D = seqpdist(seqs, 'Method', 'jukes-cantor', 'SquareForm', true) | Distances between the sequences in a cell ('jukes-cantor' or 'p-distance'; unequal lengths are aligned first): a row as pdist, or the square matrix.
seqlinkage | tree = seqlinkage(D, 'average', names) | A UPGMA tree from distances: a struct with its Newick text. Drawn without outputs.
seqneighjoin | tree = seqneighjoin(D, 'equivar', names) | A neighbour-joining tree from distances (unequal rates allowed). Drawn without outputs.
plottree | plottree(tree) | Draws a tree from seqlinkage or seqneighjoin, the leaves named.
`;
