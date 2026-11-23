// The worked example scripts of Hyperion's science and industry toolboxes (M492–M505): each opens in the editor's
// list beside the others and runs as it is. Kept apart from LabApp's own list so the branches built at the same time
// don't edit the same lines.
export const SCIENCE_EXAMPLES: { name: string; code: string }[] = [
  { name: 'epidemic.m', code: `% Epidemics: an outbreak, a lockdown, vaccines, and fitting a model to case counts
N = 1e6;                                   % a city of a million
beta = 0.3; gamma = 0.1;                   % each case infects 0.3 a day for 10 days
fprintf('R0 = %.1f: %.0f%% would catch it, %.0f%% must be immune to stop it\\n', epiR0(beta, gamma), 100*epiFinalSize(3), 100*herdImmunity(3))
cut = 0.5;     % slider 0 0.9
start = 30;    % slider 0 120
[t, y, new] = sir(beta, gamma, [N-10 10 0], 300, 'Intervention', [start start+60 cut]);
[~, y0] = sir(beta, gamma, [N-10 10 0], 300);
plot(t, y0(:, 2)/1e3, '--', t, y(:, 2)/1e3, 'LineWidth', 2)
legend('Nothing done', sprintf('%.0f%% less contact from day %d for 60 days', 100*cut, start))
xlabel('Day'); ylabel('Infectious (thousands)'); grid on
fprintf('Peak: %.0f thousand without, %.0f thousand with the lockdown\\n', max(y0(:, 2))/1e3, max(y(:, 2))/1e3)
% Fit SEIR to 80 days of (noisy) reported cases
rng(2)
[~, ~, truth] = seir(0.45, 0.2, 0.15, [N-20 0 20 0], 80);
cases = max(0, round(truth + 0.1*sqrt(truth).*randn(size(truth))));
figure; f = fitEpidemic(cases, N, 'Model', 'SEIR', 'Sigma', 0.2)
figure; epiRt(cases, 6, 3)                 % the reproduction number day by day
% Children, adults and the old mix differently
C = [12 4 1; 4 9 2; 1 2 4];               % daily contacts by age group
Ng = [2e5 6e5 2e5];
figure; sirAge(0.015, C, 0.1, Ng, [5 5 0], 250)
fprintf('R0 by age groups: %.2f\\n', epiR0(0.015, 0.1, C, Ng))
` },
  { name: 'dosing.m', code: `% Pharmacokinetics: how much of a drug, how often (a teaching example, not medical advice)
% A drug with clearance 4 L/h, volume 40 L (half-life about 7 h), taken by mouth (ka 1/h, 85% absorbed)
m = pkModel('CL', 4, 'V', 40, 'ka', 1, 'F', 0.85)
dose = 400;   % slider 100 800
every = 8;    % slider 4 24
pkSimulate(m, dose, 'Route', 'oral', 'Every', every, 'Doses', 10, 'Window', [5 15])
s = pkSteadyState(m, dose, every, 'Route', 'oral');
fprintf('Steady state: %.1f to %.1f mg/L (mean %.1f), %.1f times the first dose, reached in %.0f h\\n', s.Cmin, s.Cmax, s.Cavg, s.Accumulation, s.TimeTo90)
figure; pkDosingWindow(m, 5, 15, 'Route', 'oral')
% A second compartment: the quick fall, then the slow one
m2 = pkModel('CL', 4, 'V', 20, 'Q', 8, 'V2', 60);
[t, C] = pkSimulate(m2, 500, 'Hours', 48);
figure; semilogy(t, C); grid on; xlabel('Hours'); ylabel('mg/L (log scale)'); title('Two compartments after an IV dose')
% What the lab measured after one dose: area, half-life, clearance
ts = [0.5 1 2 4 6 8 12 24];
Cs = interp1(t, C, ts) .* (1 + 0.03*randn(size(ts)));
p = pkNCA(ts, Cs, 500)
% A saturating drug: double the dose, far more than double the level
sat = pkModel('V', 50, 'Vmax', 25, 'Km', 4);
[t1, c1] = pkSimulate(sat, 200, 'Every', 12, 'Doses', 14, 'Route', 'oral');
[t2, c2] = pkSimulate(sat, 260, 'Every', 12, 'Doses', 14, 'Route', 'oral');
figure; plot(t1, c1, t2, c2); legend('200 mg', '260 mg'); xlabel('Hours'); ylabel('mg/L'); title('Saturating elimination'); grid on
` },
  { name: 'dna.m', code: `% DNA and proteins: read a gene, translate it, compare it, and draw a family tree
gene = ['ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGCTGCTGGTGGTCTACCCTTGGACCCAGAGGTTCTTTGAGTCCTTTGGGGATCTGTCCACTCCTGATGCTGTTATGGGCAACCCTAAGGTGAAGGCTCATGGCAAGAAAGTGCTCGGTGCCTTTAGTGATGGCCTGGCTCACCTGGACAACCTCAAGGGCACCTTTGCCACACTGAGTGAGCTGCACTGTGACAAGCTGCACGTGGATCCTGAGAACTTCAGGCTCCTGGGCAACGTGCTGGTCTGTGTGCTGGCCCATCACTTTGGCAAAGAATTCACCCCACCAGTGCAGGCTGCCTATCAGAAAGTGGTGGCTGGTGTGGCTAATGCCCTGGCCCACAAGTATCACTAA'];
fprintf('%d bases, %.1f%% GC\\n', numel(gene), 100*gcContent(gene))
protein = nt2aa(gene)                         % human beta-globin (haemoglobin's beta chain)
findORFs(gene, 'MinLength', 100)
% Sickle-cell disease is one letter: GAG (glutamate) becomes GTG (valine) in codon 7
sickle = gene; sickle(20) = 'T';
swalign(nt2aa(gene), nt2aa(sickle))
% Compare the start of the protein across species (made-up but realistic variants) and draw a tree
seqs = {'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAF', ...
        'MVHLTPEEKNAVTTLWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSSPDAVMGNPKVKAHGKKVLGAF', ...
        'MVHLSGEEKSAVTALWGKVNVEEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAF', ...
        'MVQLSGEEKAAVLALWDKVNEEEVGGEALGRLLVVYPWTQRFFDSFGDLSNPGAVMGNPKVKAHGKKVLHSF', ...
        'MVHWTAEEKQLITGLWGKVNVADCGAEALARLLIVYPWTQRFFASFGNLSSPTAILGNPMVRAHGKKVLTSF'};
names = {'Human', 'Chimp', 'Mouse', 'Chicken', 'Frog'};
D = seqpdist(seqs, 'Method', 'p-distance');
seqneighjoin(D, 'equivar', names)
` },
  { name: 'reactors.m', code: `% Chemistry: a stiff mechanism, three reactors, temperature and equilibrium
% 1. Robertson's reactions: one fast, one slow (stiff). ode15s takes it in its stride.
f = @(t, y) [-0.04*y(1) + 1e4*y(2)*y(3); 0.04*y(1) - 1e4*y(2)*y(3) - 3e7*y(2)^2; 3e7*y(2)^2];
[t, y] = ode15s(f, [0 40], [1 0 0], odeset('RelTol', 1e-5, 'AbsTol', 1e-10));
fprintf('Robertson at t = 40: %.4f  %.3e  %.4f (%d steps)\\n', y(end, 1), y(end, 2), y(end, 3), numel(t))
% 2. A -> B -> C: the middle product peaks, then is used up
k1 = 1;     % slider 0.1 3
k2 = 0.3;   % slider 0.05 3
kineticsSim('A -> B; B -> C', [k1 k2], [1 0 0], 15)
% 3. The same reaction in a stirred tank and a plug-flow pipe of the same size
taus = linspace(0.1, 10, 40);
Cs = cstrReactor('2 A -> B', 0.5, [1 0], taus);
[tp, Cp] = pfrReactor('2 A -> B', 0.5, [1 0], 10);
figure; plot(taus, 1 - Cs(:, 1), tp, 1 - Cp(:, 1), 'LineWidth', 2)
legend('Stirred tank (CSTR)', 'Plug flow (PFR)'); xlabel('Residence time V/Q'); ylabel('Conversion of A'); grid on
title('A plug-flow reactor converts more for the same size')
% 4. Rate constants at four temperatures give the activation energy
T = [298 308 318 328];
k = arrhenius(4e8, 55e3, T) .* (1 + 0.03*randn(1, 4));
figure; arrheniusFit(T, k)
% 5. Ammonia: N2 + 3 H2 <-> 2 NH3 (K in concentration units, made up for the example)
[c, ~, names] = chemEquilibrium('N2 + 3 H2 <-> 2 NH3', 0.5, [1 3 0]);
fprintf('%s: %.3f mol/L\\n', names{1}, c(1), names{2}, c(2), names{3}, c(3))
fprintf('Vinegar (0.8 M acetic acid): pH %.2f\\n', acidPH(1.8e-5, 0.8))
` },
  { name: 'neurons.m', code: `% Neuroscience: how a neuron fires, and how many of them talk
% 1. Hodgkin and Huxley's squid axon: a current pulse from 10 to 90 ms
I = 10;   % slider 0 30
hodgkinHuxley(I, 100, 'Start', 10, 'Stop', 90)
% 2. The simplest model: integrate and fire. More current, faster firing (and the formula agrees)
currents = linspace(1, 5, 30);
figure; plot(currents, lifRate(currents), 'LineWidth', 2); grid on
xlabel('Current (nA)'); ylabel('Firing rate (Hz)'); title('Integrate-and-fire: rate against current')
% 3. One equation, many personalities
figure
types = {'RS', 'IB', 'CH', 'FS'};
for k = 1:4
  subplot(4, 1, k); izhikevich(10, 300, 'Type', types{k}, 'Start', 20)
end
% 4. A thousand neurons: 800 excitatory, 200 inhibitory; watch the rhythms appear
rng(3)
s = izhNetwork(800, 200, 1000);
figure; rasterPlot(s, 1000)
figure; psth(s, 1000, 5)
% 5. Is a train random? A Poisson train's CV is near 1, a regular one's near 0
st = isiStats(poissonSpikes(20, 60000));
fprintf('Poisson train: %.1f Hz, CV %.2f\\n', st.Rate, st.CV)
` },
  { name: 'physics.m', code: `% Physics: throws, swings, orbits, waves and fields
% Drag the time slider, or press Sweep on it to film the motion as a GIF.
t = 0.8;   % slider 0 4
subplot(2, 2, 1); projectile(25, 50, 'Drag', 0.01, 'At', t)
subplot(2, 2, 2); doublePendulum(1, 1, 120, -10, 4, 'At', t)
subplot(2, 2, 3); stringWave(0.65, 260, 0.2, 0.004, t/1000); title('A guitar string, 1/1000 of the time')
subplot(2, 2, 4); waveField([-1 0; 1 0], 0.5, 1, linspace(-4, 4, 120), linspace(-3, 3, 90), t)
% How much longer a big swing takes than the school formula says
fprintf('A 1 m pendulum from 10°: %.4f s; from 90°: %.4f s (formula: %.4f s)\\n', pendulumPeriod(1, 10), pendulumPeriod(1, 90), 2*pi*sqrt(1/9.81))
% The Earth and Mars round the Sun for two years (SI units)
M = 1.989e30; AU = 1.496e11; G = 6.674e-11;
P = [0 0; AU 0; 1.524*AU 0];
V = [0 0; 0 sqrt(G*M/AU); 0 sqrt(G*M/(1.524*AU))];
figure; nbody([M 5.97e24 6.42e23], P, V, 2*3.156e7, 3600)
% An electron spirals along a magnetic field
figure; chargedParticle(-1.602e-19, 9.109e-31, [0 0 0], [0 0 1e-3], [0 0 0], [1e6 0 2e5], 2e-7, 1e-11)
% Light through two slits, and the field of a dipole
figure; subplot(1, 2, 1); slitPattern(633e-9, 0.25e-3, 0.05e-3, 2, 1.5)
subplot(1, 2, 2); efield([-0.5 0 1e-9; 0.5 0 -1e-9], linspace(-2, 2, 61), linspace(-1.5, 1.5, 45))
` },
  { name: 'quake.m', code: `% Geoscience: find an earthquake from four seismometers, then map the land around it
rng(4)
stations = [0 0; 90 15; 35 100; -60 70];       % km east and north
quake = [30 40];                               % where it really was (the script pretends not to know)
tp = zeros(1, 4);
for k = 1:4
  d = norm(stations(k, :) - quake);
  [x, t] = seismogram(d, 100, 60, 'Origin', 2);
  tp(k) = pickArrival(x, 100);                 % STA/LTA, then the AIC picker
end
subplot(1, 2, 1); pickArrival(x, 100)
subplot(1, 2, 2); q = locateQuake(stations, tp);
locateQuake(stations, tp)
fprintf('Found at (%.1f, %.1f) km, %.1f km from the truth\\n', q.X, q.Y, norm([q.X q.Y] - quake))
fprintf('S arrived 8 s after P: %.0f km away. 2 mm on a Wood-Anderson at 120 km: magnitude %.1f\\n', spDistance(8), localMagnitude(2, 120))
% On the globe: Delhi to Tokyo
d = distance(28.61, 77.21, 35.68, 139.69, wgs84Ellipsoid);
fprintf('Delhi to Tokyo: %.0f km, setting off at %.0f degrees\\n', d/1000, azimuth(28.61, 77.21, 35.68, 139.69))
[E, N, zone] = ll2utm(28.61, 77.21);
fprintf('Delhi in UTM zone %dN: %.0f E, %.0f N\\n', zone, E, N)
% A landscape: contours and the sun on its slopes
Z = fractalTerrain(7, 'Roughness', 0.85, 'Relief', 1500);
figure; subplot(1, 2, 1); contour(Z, 16); axis equal; title('Contours')
sunFrom = 315;   % slider 0 360
subplot(1, 2, 2); hillshade(Z, 30, 'Azimuth', sunFrom)
` },
  { name: 'ecg.m', code: `% ECG and biosignals (for learning, not diagnosis)
rng(7); fs = 360;
rate = 72;    % slider 40 160
[x, t] = ecgSynth(fs, 60, rate, 'Noise', 0.05, 'Wander', 0.3, 'Mains', 0.05);
[idx, beats, rr] = panTompkins(x, fs);                % Pan-Tompkins QRS detection
patientMonitor(x, fs, 'SpO2', 97, 'Resp', 14)
h = hrvMetrics(rr);
fprintf('%d beats, %.0f a minute. HRV: SDNN %.0f ms, RMSSD %.0f ms, LF/HF %.2f\\n', numel(beats), h.HeartRate, h.SDNN, h.RMSSD, h.LFHF)
figure; plot(beats(2:end), 60./rr, '.-'); xlabel('Time (s)'); ylabel('Beats a minute'); title('Heart rate, beat by beat (it rises as you breathe in)'); grid on
% EEG: eyes closed (strong alpha) against eyes open (beta)
closed = eegSynth(256, 30, [10 25; 20 4]);
open = eegSynth(256, 30, [10 5; 20 8]);
[~, rc] = eegBandPower(closed, 256); [~, ro] = eegBandPower(open, 256);
fprintf('Alpha share: %.0f%% eyes closed, %.0f%% eyes open\\n', 100*rc(3), 100*ro(3))
figure; eegBandPower(closed, 256)
% A hearing aid: quiet speech-like sounds lifted, loud ones held back
fs2 = 16000; tt = (0:fs2-1)/fs2;
sound = (0.02 + 0.5*(tt > 0.5)) .* sin(2*pi*1500*tt);
figure; hearingAid(sound, fs2, 'Gains', [5 10 20 25 30], 'Threshold', -30, 'Ratio', 3)
` },
];
