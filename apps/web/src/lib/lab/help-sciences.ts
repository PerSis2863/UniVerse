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
# Chemistry and reactors
odeset | opts = odeset('RelTol', 1e-6, 'AbsTol', 1e-10) | Tolerances for the ODE solvers (ode15s, ode23s).
ode15s | [t, y] = ode15s(@(t, y) f, [t0 tEnd], y0, opts) | Solves a stiff ODE (fast and slow parts together, as in chemistry) by a Rosenbrock 2(3) method with error control; given more than two times, reports at those.
ode23s | [t, y] = ode23s(@(t, y) f, [t0 tEnd], y0, opts) | The same stiff solver as ode15s.
kineticsSim | [t, C, names] = kineticsSim('A + B -> C; C <-> D', k, c0, tEnd) | A reaction mechanism by mass action: one rate constant per one-way reaction, two (forward, backward) per reversible one; c0 in the order the species first appear. Drawn without outputs.
batchReactor | [t, C, names] = batchReactor(mechanism, k, c0, tEnd) | A well-mixed closed vessel: concentrations over time (isothermal).
pfrReactor | [tau, C, names] = pfrReactor(mechanism, k, cin, tau) | A plug-flow reactor at constant density: concentrations along it by residence time V/Q.
cstrReactor | [C, names] = cstrReactor(mechanism, k, cin, tau) | A continuously stirred tank's steady state for each residence time V/Q in tau (one row each).
arrhenius | k = arrhenius(A, Ea, T) | Arrhenius' law k = A exp(−Ea/(R T)): Ea in J/mol, T in kelvin.
arrheniusFit | [A, Ea, R2] = arrheniusFit(T, k) | A and Ea from rate constants at several temperatures (a straight line of ln k against 1/T). Drawn without outputs.
chemEquilibrium | [c, extent, names] = chemEquilibrium('N2 + 3 H2 <-> 2 NH3', K, c0) | The equilibrium of one or more reactions (K = Π c^ν for each), from the starting concentrations.
acidPH | pH = acidPH(Ka, C) | A weak acid's pH at concentration C (mol/L), water's own ions included (Ka = Inf for a strong acid).
# Neuroscience
hodgkinHuxley | [t, V, gates, spikes] = hodgkinHuxley(I, T, 'Start', 10, 'Stop', 90) | Hodgkin and Huxley's squid axon for T ms: a current I (µA/cm²) from 'Start' to 'Stop' ms (or one value per 0.01 ms step); gates are m, h, n. Drawn without outputs.
lifNeuron | [t, V, spikes] = lifNeuron(I, T, 'Tau', 10, 'R', 10, 'Threshold', -50, 'Reset', -65, 'Refractory', 2) | A leaky integrate-and-fire neuron (mV, ms, nA with R in MΩ), spike times exact within each step. Drawn without outputs.
lifRate | f = lifRate(I, …) | The integrate-and-fire neuron's firing rate (Hz) for each steady current: 1/(t_ref + τ ln((RI + rest − reset)/(RI + rest − θ))).
izhikevich | [t, V, spikes, u] = izhikevich(I, T, 'Type', 'CH') | Izhikevich's neuron: 'RS' regular, 'IB' bursting, 'CH' chattering, 'FS' fast, 'LTS' low-threshold, 'TC' thalamic, 'RZ' resonator, or 'Params', [a b c d]. Drawn without outputs.
izhNetwork | s = izhNetwork(800, 200, 1000) | Izhikevich's random network of excitatory and inhibitory neurons for T ms (1 ms steps): spikes as rows [time neuron]. A raster without outputs.
lifNetwork | [s, V] = lifNetwork(W, I, T, 'Noise', 1, 'Delay', 1) | Integrate-and-fire neurons wired by W (W(i, j) mV that a spike of j adds to i after the delay), each with its current: spikes [time neuron] and the first five voltages. A raster without outputs.
poissonSpikes | s = poissonSpikes(rate, T, n, 'DeadTime', 2) | Random (Poisson) spike times at rate Hz over T ms: a row, or for n trains rows [time train].
spikeTimes | s = spikeTimes(V, t, threshold) | The times V crosses the threshold upwards (0 mV unless given), between samples.
isiStats | s = isiStats(spikes) | Inter-spike intervals: MeanISI (ms), CV (1 Poisson-like, 0 a clock), Rate (Hz) and the ISI list.
fanoFactor | F = fanoFactor(spikes, T, window) | The variance of the spike count over its mean in windows of that many ms.
psth | [rate, edges] = psth(spikes, T, bin, trials) | Peri-stimulus time histogram in Hz (spikes from many trials or neurons as [time trial] rows). Drawn without outputs.
rasterPlot | rasterPlot(spikes, T) | A dot for every spike, neuron by neuron (spikes as [time neuron] rows).
spikeXcorr | [counts, lags] = spikeXcorr(a, b, maxLag, bin) | The cross-correlogram of two spike trains: how often b fires at each lag after a. Drawn without outputs.
`;
