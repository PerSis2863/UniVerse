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
# Physics
projectile | [x, y, t, info] = projectile(v0, angle, 'Drag', k, 'Gravity', 9.81, 'Height', h0, 'At', t) | A throw from the ground (or a height): drag k = ½ρ Cd A/m (1/m) slows it by k|v|v. info has Range, MaxHeight, FlightTime and ImpactSpeed. Drawn without outputs (beside the drag-free path), the ball at time 'At'.
pendulum | [t, theta, omega] = pendulum(L, theta0, T, 'Damping', b, 'Spin', w0, 'At', t) | A pendulum without the small-angle shortcut (degrees out). Drawn without outputs beside the shortcut; with 'At' the pendulum itself at that moment.
pendulumPeriod | T = pendulumPeriod(L, theta0, g) | The exact period from rest at theta0 degrees: 4√(L/g) K(sin(θ0/2)), longer than 2π√(L/g) for big swings.
doublePendulum | [t, angles, E] = doublePendulum(L1, L2, theta1, theta2, T, 'Masses', [m1 m2], 'At', t) | Two pendulums hung end to end: chaos (a tiny change in the start, a different motion). Drawn at 'At' with the path so far.
nbody | [t, X, E] = nbody(m, P, V, T, dt, 'G', G, 'Softening', eps, 'At', t) | Bodies under each other's gravity by velocity Verlet (the energy stays bounded): P and V a row per body (2 or 3 columns, SI). X has a row per time, [x1 y1 x2 y2 …]. Drawn without outputs.
chargedParticle | [t, r] = chargedParticle(q, m, E, B, r0, v0, T, dt) | A charge moving through uniform electric and magnetic fields (the Boris push): circles, helices, drifts. Drawn in 3D without outputs.
stringWave | [x, y] = stringWave(L, c, pluck, h, t, 'Modes', 200, 'Damping', g) | A guitar string plucked at pluck (0–1 of its length) to height h, at time t, by its Fourier modes. Put t on a slider and Sweep it to watch it move.
slitPattern | [I, x] = slitPattern(lambda, d, width, N, D, x) | The light on a screen D away from N slits of that width, d apart (Fraunhofer): fringes inside the single-slit envelope. Drawn without outputs.
waveField | Z = waveField(sources, lambda, f, x, y, t) | Ripples from point sources (rows [x y amplitude phase]) at time t: where they add and cancel. Drawn without outputs.
efield | [Ex, Ey, V] = efield(charges, x, y) | The electric field and potential of point charges (rows [x y q], coulombs, metres) on a grid. Drawn without outputs: equipotentials and the field's direction.
# Geoscience
seismogram | [x, t, tp, ts] = seismogram(dist, fs, T, 'Vp', 6, 'Vs', 3.5, 'Noise', 0.02) | A made-up seismogram dist km from a quake: P and S waves (Ricker wavelets and their codas) in noise, with their true arrival times. Drawn without outputs.
staLta | r = staLta(x, fs, sta, lta) | The short-term over long-term average of a trace's energy (0.5 s and 10 s unless given): it jumps when a wave arrives.
pickArrival | t = pickArrival(x, fs, 'STA', 0.5, 'LTA', 10, 'On', 4) | The first arrival's time (s): STA/LTA finds it, the AIC picker places it. Drawn without outputs.
locateQuake | q = locateQuake(stations, tp, 'Vp', 6, 'Depth', true) | The epicentre (X, Y km), OriginTime and RMS misfit from P arrival times at stations [x y] km (Geiger's method); 'Depth' also finds the depth. Drawn with the distance circles without outputs.
spDistance | d = spDistance(tsp, vp, vs) | The distance (km) to a quake from its S − P time: tsp·vp·vs/(vp − vs).
localMagnitude | ML = localMagnitude(amp, dist) | Richter's local magnitude from a Wood–Anderson amplitude (mm) at a distance (km), by Hutton and Boore.
distance | d = distance(lat1, lon1, lat2, lon2, ellipsoid) | The great-circle angle (degrees) between points; with a radius (e.g. 6371) the length in its units; with [a e] (wgs84Ellipsoid) the length on the ellipsoid (Vincenty).
azimuth | az = azimuth(lat1, lon1, lat2, lon2) | The bearing from the first point to the second, degrees clockwise from north.
reckon | [lat, lon] = reckon(lat, lon, arclen, az) | Where you arrive going arclen degrees along a great circle at bearing az.
deg2km | km = deg2km(deg, R) | Degrees of arc to kilometres on the Earth (or a sphere of radius R).
km2deg | deg = km2deg(km, R) | Kilometres to degrees of arc.
wgs84Ellipsoid | e = wgs84Ellipsoid | The WGS84 ellipsoid as [semimajor axis (m), eccentricity].
mapProject | [x, y] = mapProject(lat, lon, 'mercator', 'Origin', [lat0 lon0], 'Radius', R) | Map projections: 'mercator', 'equirectangular', 'lambert' (equal-area) and 'orthographic' (the far side NaN).
ll2utm | [E, N, zone] = ll2utm(lat, lon, zone) | Latitude and longitude to UTM eastings and northings (m) on WGS84.
utm2ll | [lat, lon] = utm2ll(E, N, zone, 'south') | UTM back to latitude and longitude.
fractalTerrain | Z = fractalTerrain(k, 'Roughness', 0.8, 'Relief', 1000) | A made-up landscape of (2^k + 1)² heights (the diamond-square method). Drawn as a contour map without outputs.
slopeAspect | [slope, aspect] = slopeAspect(Z, cell) | Each cell's slope (degrees) and the way it faces (degrees from north); rows run north to south.
hillshade | H = hillshade(Z, cell, 'Azimuth', 315, 'Altitude', 45) | How brightly the sun lights each cell (0 to 1): relief made visible. Drawn without outputs.
# ECG and biosignals (for learning, not diagnosis)
ecgSynth | [x, t, beats] = ecgSynth(fs, T, hr, 'RSA', 0.04, 'Noise', 0.02, 'Wander', 0.2, 'Mains', 0.05) | A made-up ECG (mV): P, QRS and T waves, the beat interval swaying with breathing; baseline wander and mains hum if asked. beats are the true R times.
panTompkins | [idx, times, rr] = panTompkins(x, fs) | QRS detection by Pan and Tompkins (band-pass 5–15 Hz, derivative, square, 150 ms integration, adaptive thresholds, search back): the R peaks and RR intervals (s). Drawn without outputs.
hrvMetrics | h = hrvMetrics(rr) | Heart rate variability from RR intervals (s): HeartRate, MeanRR, SDNN, RMSSD, pNN50 and the LF and HF powers (ms²) with LF/HF.
eegSynth | x = eegSynth(fs, T, [freq amp; …], background) | A made-up EEG (µV): a wandering background plus rhythms (10 Hz alpha unless given).
eegBandPower | [p, rel] = eegBandPower(x, fs) | Delta, theta, alpha, beta and gamma power (Welch's spectrum, 2 s segments) and their shares. Drawn without outputs.
patientMonitor | patientMonitor(ecg, fs, 'SpO2', 98, 'Resp', 15, 'BP', [120 80]) | A bedside-monitor-style view of the last 6 seconds: the ECG with its heart rate, a pleth wave and breathing. For learning, not diagnosis.
wdrc | y = wdrc(x, fs, threshold, ratio, 'Attack', 0.005, 'Release', 0.05, 'Gain', 10) | Wide dynamic range compression: above the threshold (dB re full scale) loudness grows 1/ratio as fast.
hearingAid | y = hearingAid(x, fs, 'Edges', [500 1000 2000 4000], 'Gains', [5 10 20 25 30], 'Threshold', -30, 'Ratio', 2) | A multi-band hearing aid: each band its own gain, all compressed. Drawn without outputs.
# Medical imaging (for learning, not diagnosis)
dicominfo | info = dicominfo('slice1.dcm') | A DICOM file's header: modality, size, pixel spacing, slice position, rescale and window values (patient identifiers are left out).
dicomread | I = dicomread('slice1.dcm') | A DICOM file's pixels as stored (int16 or uint16; frames as pages). Uncompressed little-endian files only.
dicomwrite | dicomwrite(I, 'slice1.dcm', 'Modality', 'CT', 'RescaleIntercept', -1024, 'PixelSpacing', [0.5 0.5], 'ImagePositionPatient', [0 0 z]) | Saves a greyscale image as a DICOM file (16-bit stored values) in Files.
dicomreadVolume | [V, spacing] = dicomreadVolume('slice') | Every slice*.dcm file (or a cell of names) as one volume in Hounsfield units (rescale applied), sorted by position, with [dy dx dz] in mm.
ctWindow | J = ctWindow(I, 'lung'), ctWindow(I, centre, width) | CT values seen through a window (0 to 1): 'brain', 'subdural', 'stroke', 'soft', 'abdomen', 'liver', 'lung', 'mediastinum', 'bone'. Drawn without outputs.
headPhantom | [V, spacing] = headPhantom(n, slices) | A made-up head CT in Hounsfield units (skull, brain, ventricles and a small lesion) to practise on.
orthoSlices | orthoSlices(V, [row col page], spacing, 'Window', 'brain') | Axial, coronal and sagittal slices through a point of a volume, at their true proportions.
regionGrow | mask = regionGrow(V, [row col page], tol) | The connected region around a seed whose values are within tol of the seed's (6-connected in 3D).
segmentHU | [mask, mL] = segmentHU(V, [low high], 'Largest', true, 'Spacing', [dy dx dz]) | Voxels between two HU values (the largest connected part by default) and their volume in millilitres.
# Finance: pricing
blsprice | [call, put] = blsprice(S, K, r, T, sigma, q) | Black–Scholes prices of European options: spot S, strike K, continuous rate r, T years, volatility sigma, dividend yield q (0 if left out).
blsdelta | [dc, dp] = blsdelta(S, K, r, T, sigma, q) | How much the call and put move per unit of the spot.
blsgamma | g = blsgamma(S, K, r, T, sigma, q) | How fast delta changes with the spot (the same for calls and puts).
blsvega | v = blsvega(S, K, r, T, sigma, q) | The change in price per unit of volatility (per 1.00, not per 1%).
blstheta | [tc, tp] = blstheta(S, K, r, T, sigma, q) | The change in price per year as time passes (usually negative).
blsrho | [rc, rp] = blsrho(S, K, r, T, sigma, q) | The change in price per unit of the interest rate.
blsimpv | v = blsimpv(S, K, r, T, value, 'Yield', q, 'Class', 'put') | The implied volatility: the sigma at which Black–Scholes gives the market price (NaN if none does).
binprice | [asset, value] = binprice(S, K, r, T, dt, sigma, flag, q) | A Cox–Ross–Rubinstein tree with American exercise (flag 1 a call, 0 a put): the asset's and the option's value at every node; value(1, 1) is the price.
mcOptionPrice | [price, se] = mcOptionPrice(S, K, r, T, sigma, 'Paths', 1e5, 'Type', 'put', 'Payoff', 'asian', 'Barrier', B, 'Steps', 252) | Monte Carlo prices of European, Asian (average) and knock-out barrier options, with antithetic paths and the standard error.
bondPrice | P = bondPrice(face, coupon, years, yield, f) | A bond's price from its yield (coupons f times a year, 2 unless given).
bondYield | y = bondYield(price, face, coupon, years, f) | The yield to maturity that gives the price.
bondDuration | [mac, mod, conv] = bondDuration(face, coupon, years, yield, f) | Macaulay duration (years), modified duration and convexity: how the price moves with the yield.
zeroCurve | [zero, df, t] = zeroCurve(par, f) | Zero rates and discount factors bootstrapped from par yields at 1/f, 2/f, … years. Drawn without outputs.
nelsonSiegel | y = nelsonSiegel([b0 b1 b2 tau], t) | The Nelson–Siegel yield curve at maturities t.
nelsonSiegelFit | [p, rmse] = nelsonSiegelFit(t, y) | Fits a Nelson–Siegel curve to yields at maturities t. Drawn without outputs.
# Finance: portfolios and risk
tick2ret | R = tick2ret(P, [], 'continuous') | Returns from prices (each column a series): simple (P2/P1 − 1) or continuous (log).
ret2tick | P = ret2tick(R, 'StartPrice', 100, 'Method', 'continuous') | Prices from returns.
ewstats | [mu, C] = ewstats(R) | Each column's mean return and the covariance of the columns.
portstats | [risk, ret] = portstats(mu, C, W) | Each portfolio's risk (standard deviation) and expected return; W has a row of weights per portfolio.
portvrisk | VaR = portvrisk(ret, risk, 0.05, value) | A normal value at risk: the loss exceeded with that probability.
maxdrawdown | [dd, idx] = maxdrawdown(P) | The deepest fall from a peak (a fraction) and where it started and ended.
efficientFrontier | [risk, ret, W] = efficientFrontier(mu, C, n, 'LongOnly', true) | Markowitz's efficient frontier: the least risk for each return, n points, the weights a row each. Drawn with the single assets without outputs.
maxSharpe | [w, ret, risk, sharpe] = maxSharpe(mu, C, rf, 'LongOnly', true) | The portfolio with the best return over the risk-free rate per unit of risk (the tangency portfolio).
valueAtRisk | [VaR, ES] = valueAtRisk(r, 0.99, 'Method', 'historical') | Value at risk and expected shortfall of returns as positive losses: 'historical', 'normal' or 'cornishfisher' (skew and fat tails).
varBacktest | t = varBacktest(r, VaR, 0.99) | Checks a VaR model against what happened: the days lost beyond VaR against the expected number, Kupiec's test and its p-value (reject below 0.05).
garchFit | g = garchFit(r) | A GARCH(1,1) volatility model by maximum likelihood: Omega, Alpha, Beta, the long-run volatility and the daily sigma. Drawn without outputs.
garchSim | r = garchSim(n, omega, alpha, beta) | Returns from a GARCH(1,1) model: calm and stormy spells.
ewmaVol | s = ewmaVol(r, 0.94) | RiskMetrics' exponentially weighted volatility, day by day.
backtestStrategy | b = backtestStrategy(P, 20, 100, 'Cost', 0.001) | A moving-average crossover (in the market while the short average is above the long) against buy and hold: CAGR, volatility, Sharpe, drawdown and trades. Drawn without outputs.
carbonStress | [loss, share, total] = carbonStress(values, emissions, price, 'PassThrough', 0.3, 'Rate', 0.08) | A carbon-price shock: each holding's extra yearly cost valued forever at the rate, as a loss of its value.
`;
