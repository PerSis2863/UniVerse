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
figure; fitEpidemic(cases, N, 'Model', 'SEIR', 'Sigma', 0.2)   % draws the fit and prints beta, gamma and R0
figure; epiRt(cases, 6, 3)                 % the reproduction number day by day
% Children, adults and the old mix differently
C = [12 4 1; 4 9 2; 1 2 4];               % daily contacts by age group
Ng = [2e5 6e5 2e5];
figure; sirAge(0.015, C, 0.1, Ng, [5 5 0], 250)
fprintf('R0 by age groups: %.2f\\n', epiR0(0.015, 0.1, C, Ng))
% Chance: in a village of 2,000, one case may or may not start an outbreak
figure; sirGillespie(0.25, 0.1, [1999 1 0], 150, 'Runs', 30)
% Hospitals: what happens when patients outnumber the beds
figure; seihrd(0.4, 0.2, 0.15, [N-20 0 20 0 0 0], 250, 'Hospital', 0.04, 'Fatality', 0.15, 'Beds', 2500, 'FatalityNoBed', 0.5)
f = fitEpidemic(cases, N, 'Model', 'SEIR', 'Sigma', 0.2);
fprintf('R0 = %.2f, 95%% interval %.2f to %.2f\\n', f.R0, f.R0CI)
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
% Fit a model to a patient's measured levels (a tablet taken twice a day, levels taken on day 2)
rng(4)
truth = pkModel('CL', 3, 'V', 35, 'ka', 0.8, 'F', 0.9, 'Lag', 0.5);
th = [24.5 25 26 28 30 33 36];
[tt, ct] = pkSimulate(truth, 400, 'Route', 'oral', 'Every', 12, 'Doses', 3, 'Hours', 36, 'Step', 0.5);
lv = interp1(tt, ct, th) .* (1 + 0.05*randn(size(th)));
figure; pkFit(th, lv, 400, 'Route', 'oral', 'Every', 12, 'Doses', 3, 'F', 0.9, 'Lag', 0.5)
% The effect lags the level: a pain score falls behind the blood level (an effect site, ke0 = 0.3 /h)
[t3, c3] = pkSimulate(m, 500, 'Route', 'oral', 'Hours', 24, 'Step', 0.1);
figure; pkEffect(t3, c3, 'Emax', -80, 'EC50', 4, 'Hill', 2, 'E0', 90, 'ke0', 0.3)
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
% Sequences from a FASTA file (here written first; upload your own in Files), aligned all together
fastawrite('globins.fasta', names, seqs);
[h, q] = fastaread('globins.fasta');
multialign({q{1}(1:40), q{4}(1:38), q{5}(5:44)}, 'ScoringMatrix', 'PAM250')
% Mitochondria read some codons differently: AGA stops a human mitochondrial gene, TGA is tryptophan
code = geneticcode(2); fprintf('%s: stops %s\\n', code.Name, strjoin(code.Stops, ' '))
fprintf('Standard: %s   Mitochondrial: %s\\n', nt2aa('ATGTGAAGA'), nt2aa('ATGTGAAGA', 'GeneticCode', 2))
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
  { name: 'solutions.m', code: `% Chemistry: formulas, balancing, acids and buffers, and reactors that heat up
fprintf('Glucose C6H12O6: %.3f g/mol; blue vitriol CuSO4·5H2O: %.3f g/mol\\n', molarMass('C6H12O6'), molarMass('CuSO4·5H2O'))
balanceEquation('C3H8 + O2 -> CO2 + H2O')
balanceEquation('MnO4^- + Fe^2+ + H+ -> Mn^2+ + Fe^3+ + H2O')
% Phosphoric acid gives up three protons, one after another
Ka = [7.1e-3 6.3e-8 4.5e-13];
fprintf('0.1 M H3PO4: pH %.2f\\n', polyproticPH(Ka, 0.1))
acidSpecies(Ka)
figure; titrationCurve(Ka, 0.1, 10, 0.1)          % 10 mL of 0.1 M acid with 0.1 M NaOH
% A buffer, ideal and with real activities (Davies)
fprintf('Acetate buffer 0.1/0.1 M: pH %.3f ideal, %.3f with activities\\n', bufferPH(1.8e-5, 0.1, 0.1), bufferPH(1.8e-5, 0.1, 0.1, 'Activity', true))
% A reaction that gives heat: with too little cooling it runs away
UA = 20;     % slider 0 200
figure; heatedBatch('A -> B', 4e9, 75e3, -150e3, [2 0], 310, 600, 'UA', UA, 'Tcool', 300)
% A cooled stirred tank can settle cold, or hot: three steady states
figure; cstrSteadyStates('A -> B', 1e10, 7500*8.314, -209e3, [2 0], 300, 0.05*exp(25)/1e10)
` },
  { name: 'beds.m', code: `% Chemistry: a packed bed losing pressure, a catalyst's own rate law, and very salty water
% 1. A gas over a catalyst bed: A -> 2 B makes moles, Ergun's friction takes pressure
particle_mm = 6;   % slider 2 12
alpha = ergunAlpha(1.5, particle_mm/1000, 0.45, 1.5e-5, 0.4, 0.01, 2000, 1e6);
packedBed('A -> 2 B', 2e-3, [0.1 0], 20, 'P0', 1e6, 'T', 500, 'Alpha', alpha)
% 2. A surface reaction: A and B must both sit on the catalyst (Langmuir–Hinshelwood)
pA = linspace(0, 5, 100);
r = lhRate(1, [1 1], [pA' ones(100, 1)], 2);
figure; plot(pA, r, 'LineWidth', 2); grid on
xlabel('Pressure of A'); ylabel('Rate'); title('Too much A crowds B off the surface')
figure; rateLawSim('A + B -> C', @(c) 5*c(1)*c(2)/(1 + c(1) + c(2))^2, [2 1 0], 10)
% 3. Sea water and brines: past 0.5 mol/kg Davies' equation fails, Pitzer's holds
figure; pitzerActivity('NaCl')
[g, phi, aw] = pitzerActivity('NaCl', 0.6);
fprintf('Sea water (0.6 mol/kg NaCl): gamma %.3f, osmotic coefficient %.3f, water activity %.4f\\n', g, phi, aw)
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
  { name: 'brain.m', code: `% Neuroscience: spikes that travel, synapses that learn, and sorting spikes from a recording
% 1. A spike runs down the squid's giant axon. Colder nerves conduct slower.
celsius = 18.5;   % slider 5 25
cableNeuron('Active', true, 'Celsius', celsius)
% 2. A thin passive dendrite: the voltage fades over its length constant
figure; cableNeuron('Length', 1500, 'Diameter', 1)
% 3. A synapse's conductance: fast rise, slower decay
figure; synapseConductance([5 12 14 40], 0:0.1:80, 'Rise', 0.5, 'Decay', 5)
% 4. Learning from timing: inputs that fire just before the neuron grow, the rest shrink
figure; stdpWindow()
figure; stdpNeuron('Seconds', 60)
% 5. Two neurons on one electrode, then sorted apart
rng(4); fs = 24000; x = 8*randn(1, 10*fs); t = (0:47)/fs*1000 - 0.5;
a = -100*exp(-(t/0.15).^2) + 20*exp(-((t-0.5)/0.3).^2);
b = -60*exp(-(t/0.35).^2) + 30*exp(-((t-0.5)/0.7).^2);
for s = 1:60:numel(x)-5000
  if rand < 0.2, x(s:s+47) = x(s:s+47) + a; elseif rand < 0.2, x(s:s+47) = x(s:s+47) + b; end
end
figure; spikeSort(x, fs)
` },
  { name: 'branches.m', code: `% Neuroscience: a neuron with branches, and a raw recording cleaned before sorting
% 1. A small neuron in SWC (the format of NeuroMorpho's 200,000 reconstructions): a soma, an axon, two dendrites
swc = sprintf(['1 1 0 0 0 10 -1\\n', '2 2 60 0 0 0.6 1\\n', '3 2 300 0 0 0.5 2\\n', '4 2 600 0 0 0.5 3\\n', ...
               '5 3 -80 60 0 1.5 1\\n', '6 3 -200 160 0 1 5\\n', '7 3 -120 -150 0 1 1\\n', '8 3 -260 -260 0 0.7 7\\n']);
% A current into the soma fires a spike that runs down the axon (channels in the soma and axon only)
treeNeuron(swc, 'Active', 'axon', 'Current', 1.5, 'Start', 2, 'Stop', 3, 'Time', 12, 'Celsius', 20, 'Record', [1 4])
% 2. A synapse far out on a dendrite: its voltage fades on the way to the soma
far = 80;   % slider 0 300
figure; treeNeuron(swc, 'Synapses', [6 5 far/100 0.5 3 0], 'Time', 30, 'Record', [6 1])
% 3. A raw recording: slow waves and mains hum swamp the spikes until it is filtered
rng(2); fs = 24000; t = (0:fs*3-1)/fs;
x = 10*randn(size(t)) + 300*sin(2*pi*4*t) + 80*sin(2*pi*50*t);
x(1000:2400:end) = x(1000:2400:end) - 150;
y = filterRecording(x, fs, 'Band', [300 6000], 'Notch', 50);
figure; plot(t(1:6000), x(1:6000), t(1:6000), y(1:6000)); legend('Raw', 'Filtered'); xlabel('s'); grid on
figure; spikeSort(x, fs, 'Band', [300 6000], 'Notch', 50)
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
  { name: 'physics2.m', code: `% Physics: currents and their fields, lenses and lasers, relativity, quantum wells, spinning and colliding
% 1. A loop of wire: its field lines thread through it
th = linspace(0, 2*pi, 121)';
bfield([0.1*cos(th) 0.1*sin(th) 0*th], 10)
fprintf('At the centre: %.3g T (mu0 I / 2R = %.3g T)\\n', norm(bfield([0.1*cos(th) 0.1*sin(th) 0*th], 10, [0 0 0])), 4e-7*pi*10/0.2)
figure; fieldLines([-1 0 0 1; 1 0 0 -1])
% 2. Lenses: an image, rays through two lenses, and a laser focused
figure; lensImage(50, 120, 10)
opticsSystem('f 50; d 20; f 100')
figure; rayTrace('d 50; f 50; d 30; f -40; d 150', 'Heights', -1:0.5:1)
figure; gaussianBeam(1, 633e-6, 'd 500; f 200; d 400')   % mm: a red laser 2 mm across
% 3. Relativity: a moving frame's view, and a fast electron's circle
figure; minkowskiDiagram(0.5, [2 1; 1 2; 3 0])
e = relativistic(9.109e-31, 0.9*299792458); fprintf('An electron at 0.9c: gamma %.3f, kinetic energy %.0f keV\\n', e.Gamma, e.Kinetic/1.602e-16)
% 4. Quantum: a harmonic well's evenly spaced levels, and tunnelling through two barriers
x = linspace(-4, 4, 801);
figure; schrodinger1D(x, 0.5*x.^2, 'States', 5)
fprintf('A 0.3 eV, 5 nm GaAs well holds %d states\\n', numel(finiteWell(0.3, 5, 'Mass', 0.067)))
x = 0:0.05:8; V = 0.4*((x > 1 & x < 2) | (x > 5 & x < 6));
figure; transmission(x, V, 'Mass', 0.067)
% 5. A book spun about its middle axis tumbles; disks collide in a box
figure; rigidBody([1 2 3], [0.01 1 0.01], 60)
t = 10;   % slider 0 10
figure; diskCollisions(25, 'Time', 10, 'At', t)
` },
  { name: 'physics3.m', code: `% Physics: a spinning top, a real lens, a black hole, and quantum particles that move
% 1. A top on a table: spin it fast and its axis circles slowly (precession) with small nods (nutation)
spin = 150;   % slider 40 300
rigidRotation([1 1 0.5], [0 0 spin], 3, 'Orientation', [cos(0.3) sin(0.3) 0 0], 'Gravity', 2)
% 2. A real lens: rays at the edge focus short of the middle (spherical aberration), blue short of red
lens = [51.68 6 1.5168 64.17; Inf 95 1 0];    % plano-convex BK7, f ≈ 100 mm
figure; realRayTrace(lens, 12)
figure; lensAberration(lens, 12)
figure; spotDiagram(lens, 12, 3)
% 3. Einstein's gravity: orbits that turn, light that bends, Mercury's 43 seconds of arc a century
figure; schwarzschildOrbit(12, 40, 4)
figure; lightBending()
fprintf('Mercury: %.1f arcseconds a century\\n', perihelionShift(5.7909e10, 0.2056, 1.98892e30) * 415.2 * 206265)
% 4. An electron as a moving wave packet meets a thin barrier: part goes through, part bounces back
x = linspace(-80, 80, 3000); V = 0.3*(x >= 0 & x < 0.5);
figure; wavePacket(x, V, 'X0', -25, 'K0', 2.6, 'Sigma', 4)
% 5. A quantum dot: an electron held in 2D, its lowest states
g = linspace(-6, 6, 60);
figure; schrodinger2D(g, g, @(x, y) 0.02*(x.^2 + 2*y.^2), 'States', 6)
` },
  { name: 'physics4.m', code: `% Physics: shapes that tumble, a spinning black hole, and an atom-sized box in 3D
% 1. A box, a ball and a wedge fall onto a fixed ramp and bounce, spin and slide
t = 4;   % slider 0 4
rigidShapes({[8 0; 0 0; 0 4], [1 1], 0.5, [0 0; 1.4 0; 0.7 1.2]}, [3 2 0; 2 8 20; 4 9 0; 6 7 10], [], 'Fixed', 1, 'Time', 4, 'At', t)
% 2. A spinning black hole: the innermost orbits, an orbit whose plane is dragged round, light, the shadow
R = kerrRadii(0.9)
figure; kerrOrbit(0.9, 9, 0.2, 40, 'Orbits', 6)
figure; kerrLight(0.9)
figure; kerrShadow([0 0.5 0.9 0.998], 90)
% 3. An electron in a 3D box with soft walls: its lowest states as 3D shapes (blue +, orange −)
g = linspace(-2, 2, 20);
figure; schrodinger3D(g, g, g, @(x, y, z) 0.5*(x.^2 + y.^2 + z.^2), 'States', 4)
% 4. Any 3D field as a surface: where x² + y² + z² + sin(3x) = 2
[x, y, z] = meshgrid(-2:0.1:2);
figure; isosurface(x, y, z, x.^2 + y.^2 + z.^2 + sin(3*x), 2)
` },
  { name: 'physics5.m', code: `% Physics: shapes with dents, solids tumbling in 3D, a charged black hole, light from above
% 1. An L, a star and a ball fall into a fixed cup (dents are split into convex parts by themselves)
star = [cos(pi/2 + (0:9)*pi/5)' sin(pi/2 + (0:9)*pi/5)'] .* repmat([1; 0.45], 5, 1);
cup = [0 0; 4 0; 4 2; 3.5 2; 3.5 0.5; 0.5 0.5; 0.5 2; 0 2];
t = 3;   % slider 0 3
rigidShapes({cup, [0 0; 2 0; 2 0.7; 0.7 0.7; 0.7 2; 0 2], star, 0.4}, [5 1 0; 4.5 6 30; 5.5 8 0; 5 9.5 0], [], 'Fixed', 1, 'Time', 3, 'At', t)
% 2. A ball, a box and a pyramid tumble down onto the floor
figure; rigidShapes3D({0.6, [1.5 1 0.8], [0 0 0; 1.5 0 0; 0 1.5 0; 0 0 1.5]}, [3 5 6 0 0 0; 6 5 4 20 30 0; 5 3 7 0 0 0], [2 0 0 0 0 0; -1 0 0 0 3 0; 0 1 0 0 0 0], 'Time', 3)
% 3. A charged spinning black hole: its radii shrink, orbits change
R = kerrRadii(0.6, 0.7)
figure; kerrShadow([0 0.6], 90, 'Charge', 0.7)
figure; kerrOrbit(0.6, 9, 0.2, 35, 'Orbits', 4, 'Charge', 0.7, 'ParticleCharge', 0.3)
% 4. Light reaching someone 70° off the spin axis, traced back past the hole in 3D
figure; kerrLight(0.9, -8:2:8, 'Inclination', 70, 'Beta', 2)
` },
  { name: 'physics6.m', code: `% Physics: rolling resistance, solids with dents, a magnetic charge, a black hole's glowing disc
% 1. Three balls roll across the floor: none, a little and more rolling resistance
figure; rigidShapes3D({0.4, 0.4, 0.4}, [1 2 0.4; 1 5 0.4; 1 8 0.4], [3 0 0 0 7.5 0; 3 0 0 0 7.5 0; 3 0 0 0 7.5 0], 'Time', 3, 'Rolling', 0.05, 'Box', [12 10 4])
% 2. An L-shaped solid (two boxes glued) and a U-shaped cup (three boxes, fixed): a ball falls into the cup
L = {[2 1 1 0 0 0], [1 1 1 0.5 0 1]};
U = {[3 3 0.5 0 0 0], [0.5 3 2 -1.25 0 1.25], [0.5 3 2 1.25 0 1.25]};
t = 3;   % slider 0 3
figure; rigidShapes3D({U, L, 0.5}, [5 5 0.7 0 0 0; 2 5 3 20 10 0; 5.2 5 5 0 0 0], [], 'Fixed', 1, 'Time', 3, 'At', t)
% 3. A charged particle beside a magnetic charge rides a cone instead of a flat orbit
figure; kerrOrbit(0, 12, 0, 40, 'Orbits', 3, 'Magnetic', 0.5, 'ParticleCharge', 2)
% 4. A black hole's glowing disc, as a camera would see it: light bent over the top, the near side brighter
figure; kerrDisc(0.9, 80, 'Pixels', 120)
` },
  { name: 'physics7.m', code: `% Physics: boxes that rock to rest, a dented solid split by itself, a hot see-through disc
% 1. A hexagon tumbles along the floor, then again with rolling resistance: it stops sooner
hex = [cosd(0:60:300)' sind(0:60:300)'] * 0.5;
figure; rigidShapes({hex}, [1 0.5 0], [3 0 -6], 'Box', [12 2], 'Time', 4, 'Restitution', 0, 'Friction', 0.8)
figure; rigidShapes({hex}, [1 0.5 0], [3 0 -6], 'Box', [12 2], 'Time', 4, 'Restitution', 0, 'Friction', 0.8, 'Rolling', 0.1)
% 2. An L-shaped mesh (an outline pushed up), cut into convex parts by convexSplit, then dropped
P = [0 0; 2 0; 2 1; 1 1; 1 2; 0 2]; n = 6;
V = [P zeros(n, 1); P ones(n, 1)];
F = {n:-1:1, n+1:2*n};                         % the bottom and top faces, then the walls
for k = 1:n, F{end+1} = [k, mod(k, n)+1, n+mod(k, n)+1, n+k]; end
parts = convexSplit(V, F)
figure; rigidShapes3D({parts}, [5 5 3 30 20 0], [], 'Time', 3)
% 3. A thick, half see-through disc coloured by its temperature: the far side shows through
figure; kerrDisc(0.9, 80, 'Pixels', 90, 'Thickness', 0.05, 'Opacity', 0.6, 'Colour', 'temperature')
` },
  { name: 'physics8.m', code: `% Physics: a curved solid split by itself, a thick disc's glowing wall and its own shadow
% 1. A doughnut (curved all over) split into convex parts, then dropped: it lands on its side and rests
N = 12; M = 6; [u, v] = ndgrid(2*pi*(0:N-1)/N, 2*pi*(0:M-1)/M);
V = [(2 + 0.6*cos(v(:))).*cos(u(:)), (2 + 0.6*cos(v(:))).*sin(u(:)), 0.6*sin(v(:))];
id = @(i, j) mod(i, N) + N*mod(j, M) + 1;        % ndgrid runs down u first
F = zeros(N*M, 4);
for i = 0:N-1, for j = 0:M-1, F(i*M + j + 1, :) = [id(i, j) id(i+1, j) id(i+1, j+1) id(i, j+1)]; end, end
parts = convexSplit(V, F);
fprintf('The doughnut in %d convex parts\\n', numel(parts))
figure; rigidShapes3D({parts}, [5 5 3 40 0 0], [], 'Time', 2)
% 2. A thick solid disc seen from above: its inner wall glows; then see-through, nearly edge-on, shadowing itself
figure; kerrDisc(0.5, 60, 'Pixels', 80, 'Thickness', 0.2)
figure; kerrDisc(0, 85, 'Pixels', 80, 'Thickness', 0.2, 'Opacity', 0.3)
` },
  { name: 'physics9.m', code: `% Physics: a pyramid pushed into a cube, cut into parts by itself; a disc's gas taking light by colour
% 1. No single cut helps this one (each diagonal cut leaves the same empty space), so it looks one cut ahead
V = [0 0 0; 1 0 0; 1 1 0; 0 1 0; 0 0 1; 1 0 1; 1 1 1; 0 1 1; 0.5 0.5 0.2];
F = [4 3 2 1; 1 2 6 5; 2 3 7 6; 3 4 8 7; 4 1 5 8; 5 6 9 NaN; 6 7 9 NaN; 7 8 9 NaN; 8 5 9 NaN];   % NaN pads the triangles
parts = convexSplit(V, F);
fprintf('The dented cube in %d convex parts\\n', numel(parts))
% 2. A see-through thick disc nearly edge-on, coloured by the light that reaches us. Gas glows most at the colours it
%    takes most: hot gas (free-free, p = 2) glows redder, the far side coming through it bluer; dust (p = -1) the other way
figure; kerrDisc(0.9, 82, 'Pixels', 70, 'Thickness', 0.15, 'Opacity', 0.5, 'Colour', 'temperature', 'Absorption', 2)
figure; kerrDisc(0.9, 82, 'Pixels', 70, 'Thickness', 0.15, 'Opacity', 0.5, 'Colour', 'temperature', 'Absorption', -1)
` },
  { name: 'physics10.m', code: `% Physics: a ring split with a look ahead and merging; a disc whose gas scatters light, and its spectrum
% 1. A half ring: 'full' looks one cut ahead at every cut, then merges neighbours while their hull stays solid
t = linspace(0, pi, 13)'; P = [2*cos(t) 2*sin(t); flipud(1.4*cos(t)) flipud(1.4*sin(t))]; n = size(P, 1);
V = [P zeros(n, 1); P 0.5*ones(n, 1)];
F = nan(n + 2, n); F(1, :) = n:-1:1; F(2, :) = n+1:2*n;
for i = 1:n, j = mod(i, n) + 1; F(i + 2, 1:4) = [i j n+j n+i]; end
p1 = convexSplit(V, F); p2 = convexSplit(V, F, 'Search', 'full');
fprintf('Half ring: %d parts, %d with the full search\\n', numel(p1), numel(p2))
% 2. The same disc without and with scattering: its spectrum, summed over the picture, hardens
[I0, ~, ~, ~, S0, lam] = kerrDisc(0.5, 60, 'Pixels', 40);
[I1, ~, ~, ~, S1] = kerrDisc(0.5, 60, 'Pixels', 40, 'Scattering', 0.99);
s0 = squeeze(sum(sum(S0, 1), 2)); s1 = squeeze(sum(sum(S1, 1), 2));
figure; plot(lam, s0 / max(s0), lam, s1 / max(s1)); xlabel('wavelength (nm)'); ylabel('light (peak 1)')
legend('no scattering', '99% scattering'); title('Scattering hardens a disc''s light')
figure; kerrDisc(0.5, 60, 'Pixels', 70, 'Colour', 'temperature', 'Scattering', 0.99)
` },
  { name: 'physics11.m', code: `% Physics: V-HACD's search on cubes; light scattered across a disc; a hot corona boosting it to X-rays
% 1. A cube with a pyramid pushed into its top, split by the plain search and by 'voxel' (planes chosen on cubes)
V = [0 0 0; 1 0 0; 1 1 0; 0 1 0; 0 0 1; 1 0 1; 1 1 1; 0 1 1; 0.5 0.5 0.2];
F = [4 3 2 1; 1 2 6 5; 2 3 7 6; 3 4 8 7; 4 1 5 8; 5 6 9 NaN; 6 7 9 NaN; 7 8 9 NaN; 8 5 9 NaN];
p1 = convexSplit(V, F); p2 = convexSplit(V, F, 'Search', 'voxel');
fprintf('Dented cube: %d parts plain, %d with the voxel search\\n', numel(p1), numel(p2))
% 2. A thick see-through disc whose gas mostly scatters: each point's light as in a flat slab, then from all of the disc
I1 = kerrDisc(0.5, 70, 'Pixels', 40, 'Thickness', 0.2, 'Opacity', 0.999, 'Scattering', 0.5);
I2 = kerrDisc(0.5, 70, 'Pixels', 40, 'Thickness', 0.2, 'Opacity', 0.999, 'Scattering', 0.5, 'Transfer', 'disc');
fprintf('Light from all of the disc: %.3f of the slab''s\\n', sum(I2(:)) / sum(I1(:)))
% 3. A stellar black hole's disc (10 million K) under a corona of 100 keV electrons: the X-ray tail
[~, ~, ~, ~, ~, ~, E, X0] = kerrDisc(0.5, 60, 'Pixels', 30, 'Temperature', 1e7);
[~, ~, ~, ~, ~, ~, ~, X1] = kerrDisc(0.5, 60, 'Pixels', 30, 'Temperature', 1e7, 'Corona', [100 1]);
figure; loglog(E, X0, E, X1); xlabel('energy (keV)'); ylabel('E F_E'); ylim([1e-4 1] * max(X1))
legend('the disc', 'with the corona'); title('Compton up-scattering: a power law to about kT_e')
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
  { name: 'ctscan.m', code: `% Medical imaging: a CT series as DICOM files, windows, slices and a measurement (for learning, not diagnosis)
[V, sp] = headPhantom(128, 40);            % a made-up head in Hounsfield units, spacing in mm
% Save it as 40 DICOM slices (stored values = HU + 1024), as a scanner would, then read them back
for k = 1:size(V, 3)
  dicomwrite(V(:, :, k) + 1024, sprintf('head%02d.dcm', k), 'Modality', 'CT', 'RescaleIntercept', -1024, ...
    'PixelSpacing', sp(1:2), 'SliceThickness', sp(3), 'ImagePositionPatient', [0 0 (k-1)*sp(3)], 'InstanceNumber', k);
end
info = dicominfo('head20.dcm')
[W, spacing] = dicomreadVolume('head');
% The same slice through four windows
s = W(:, :, 26);
names = {'brain', 'subdural', 'bone', 'lung'};
for k = 1:4
  subplot(2, 2, k); ctWindow(s, names{k}); title(names{k})
end
slice = 26;   % slider 1 40
figure; orthoSlices(W, [64 64 slice], spacing, 'Window', 'brain')
% Find the bright lesion: grow a region from a point inside it, and measure it
[mask, mL] = segmentHU(W, [60 90], 'Spacing', spacing);
fprintf('Lesion: %.2f mL (%d voxels)\\n', mL, nnz(mask))
[skull, skullmL] = segmentHU(W, [500 3000], 'Spacing', spacing);
fprintf('Skull: %.0f mL\\n', skullmL)
% With the 2D image tools (M428): label what is above the brain window in one slice
L = bwlabel(ctWindow(s, 'brain') > 0.9);
fprintf('Bright regions in slice 26: %d\\n', max(L(:)))
` },
  { name: 'options.m', code: `% Finance: pricing options and bonds (a teaching example, not investment advice)
S = 100; K = 105; r = 0.04; T = 0.5;
sigma = 0.25;   % slider 0.05 0.8
[c, p] = blsprice(S, K, r, T, sigma);
fprintf('Black-Scholes: call %.3f, put %.3f\\n', c, p)
[dc, dp] = blsdelta(S, K, r, T, sigma);
fprintf('Delta %.3f / %.3f, gamma %.4f, vega %.2f\\n', dc, dp, blsgamma(S, K, r, T, sigma), blsvega(S, K, r, T, sigma))
% The price and delta across spot prices
spot = 60:1:150;
[cs, ps] = blsprice(spot, K, r, T, sigma);
subplot(1, 2, 1); plot(spot, cs, spot, ps, spot, max(spot - K, 0), ':'); legend('Call', 'Put', 'Payoff at expiry'); xlabel('Spot'); grid on
subplot(1, 2, 2); plot(spot, blsdelta(spot, K, r, T, sigma)); xlabel('Spot'); ylabel('Call delta'); grid on
% A binomial tree with early exercise, and Monte Carlo for path-dependent options
[~, V] = binprice(S, K, r, T, T/200, sigma, 0);
fprintf('American put (tree): %.3f, European put: %.3f\\n', V(1, 1), p)
rng(3)
[asian, se] = mcOptionPrice(S, K, r, T, sigma, 'Paths', 40000, 'Payoff', 'asian', 'Steps', 126);
fprintf('Asian call (Monte Carlo): %.3f +/- %.3f\\n', asian, 1.96*se)
% Implied volatility from a market price
fprintf('A market call price of 6.00 implies %.1f%% volatility\\n', 100*blsimpv(S, K, r, T, 6))
% Bonds and the yield curve
P = bondPrice(100, 0.05, 10, 0.06);
[mac, md, cv] = bondDuration(100, 0.05, 10, 0.06);
fprintf('10-year 5%% bond at a 6%% yield: %.2f; duration %.2f years, convexity %.1f\\n', P, mac, cv)
t = [0.25 0.5 1 2 3 5 7 10 20 30];
y = [5.30 5.28 5.10 4.70 4.45 4.25 4.22 4.25 4.50 4.45]/100;
figure; nelsonSiegelFit(t, y)
figure; zeroCurve([0.051 0.047 0.0445 0.043 0.0425 0.0423 0.0424], 1)
` },
  { name: 'portfolio.m', code: `% Finance: build a portfolio, measure its risk, test a strategy (a teaching example, not investment advice)
rng(11)
% Three made-up assets: bonds, shares, emerging markets (a year of 252 days, five years)
n = 5*252; market = randn(n, 1);           % one shared market factor makes shares and emerging markets move together
R = [0.04/252 + 0.05/sqrt(252)*(0.1*market + randn(n, 1)), ...
     0.08/252 + 0.16/sqrt(252)*(0.8*market + 0.6*randn(n, 1)), ...
     0.11/252 + 0.24/sqrt(252)*(0.7*market + 0.7*randn(n, 1))];
[m, C] = ewstats(R);
mA = m*252; CA = C*252;                     % yearly
efficientFrontier(mA, CA, 30)
rf = 0.02;
[w, ret, risk, sharpe] = maxSharpe(mA, CA, rf);
fprintf('Best Sharpe (%.2f): %.0f%% bonds, %.0f%% shares, %.0f%% emerging; %.1f%% return, %.1f%% risk\\n', sharpe, 100*w, 100*ret, 100*risk)
% Risk of that portfolio: one day at 99%
r = R * w;
[v1, e1] = valueAtRisk(r, 0.99);
[v2, e2] = valueAtRisk(r, 0.99, 'Method', 'normal');
fprintf('1-day 99%% VaR on 1,000,000: historical %.0f (ES %.0f), normal %.0f (ES %.0f)\\n', 1e6*v1, 1e6*e1, 1e6*v2, 1e6*e2)
t = varBacktest(r, v2, 0.99)
% Volatility comes in spells: GARCH
x = garchSim(2000, 2e-6, 0.09, 0.89);
figure; garchFit(x)
% A trend-following rule against buy and hold
P = ret2tick(0.0003 + garchSim(2000, 2e-6, 0.09, 0.89), 'StartPrice', 100);
fast = 20;   % slider 5 60
figure; backtestStrategy(P, fast, 120)
[dd, at] = maxdrawdown(P);
fprintf('Buy and hold fell %.0f%% at worst\\n', 100*dd)
% Climate transition risk, plainly: a carbon price of 100 a tonne on three holdings
[loss, share, total] = carbonStress([4e6 3e6 3e6], [2000 800 100], 100, 'PassThrough', 0.3);
fprintf('Carbon at 100/t: %.0f%%, %.0f%%, %.0f%% of each holding; %.1f%% of the portfolio\\n', 100*share, 100*total)
` },
  { name: 'teach.m', code: `% Maths teaching: worked examples step by step, and graphs to explore in class
syms x
diffSteps(x^2*sin(x))
diffSteps(exp(3*x^2))
intSteps(3*x^2 + cos(x), x, 0, pi)
solveSteps(2*x^2 - 3*x - 2 == 0, x)
rrefSteps([2 1 -1 8; -3 -1 2 -11; -2 1 2 -3])     % a 3 x 3 system, augmented
eigSteps([4 1; 2 3])
% Graphs: move the sliders
x0 = 1;     % slider -3 3
tangentLine(@(t) t.^3 - 2*t, x0, [-3 3])
strips = 8; % slider 1 60
figure; riemannSum(@(t) exp(-t.^2), 0, 2, strips, 'Method', 'left')
figure; newtonSteps(@(t) cos(t) - t, 1, 5)
figure; taylorPlot(cos(x), 0, [2 4 8], [-7 7])
` },
  { name: 'materials.m', code: `% Semiconductors and materials: a junction, a transistor, a metal under load, and ore in the ground
% 1. A silicon pn junction and its band diagram; forward bias shrinks the barrier
bias = 0;   % slider -5 0.6
j = pnJunction(1e17, 1e16, 'V', bias);
pnJunction(1e17, 1e16, 'V', bias)
fprintf('Built-in potential %.3f V; depletion %.3f um; ni = %.2e per cm3\\n', j.Vbi, j.W*1e4, siliconNi(300))
% 2. A diode with some series resistance, and a MOSFET's curves
figure; subplot(1, 2, 1); diodeIV(linspace(0, 1, 200), 'Rs', 0.5)
subplot(1, 2, 2); mosfetIV([1 1.5 2 2.5], linspace(0, 3, 100), 'Vth', mosfetVth(1e17, 10))
% 3. Four metals pulled apart, and what a tensile test reads off
figure; materialCurve('steel', 'aluminium', 'titanium', 'copper')
[e, s] = materialCurve('aluminium');
t = tensileTest(e, s)
% 4. A bracket's load history: count its cycles and add up the damage
rng(5)
force = 120*sin(linspace(0, 40*pi, 4000)) + 60*randn(1, 4000);
c = rainflowCount(force);
[D, repeats] = minerDamage(c, 'steel');
fprintf('Damage per history %.2e: it survives about %.0f repeats (Miner)\\n', D, repeats)
% 5. Gold grades from 40 drill holes, estimated across the claim by kriging
xy = 100*rand(40, 2);
grade = 2 + 1.5*sin(xy(:, 1)/20) + 0.3*randn(40, 1);
figure; variogramExp(xy, grade, 8, 10)
[X, Y] = meshgrid(0:2:100);
est = krigeGrade(xy, grade, [X(:) Y(:)], [0.08 1.1 60]);
figure; contourf(X, Y, reshape(est, size(X)), 12); colorbar; hold on
plot(xy(:, 1), xy(:, 2), 'k^'); hold off; axis equal; title('Kriged grade (g/t)')
` },
  { name: 'farm_energy.m', code: `% Agriculture and energy: water for a crop, the cheapest feed, and power stations sharing a load
% 1. Reference evapotranspiration for a summer in Punjab (made-up but typical weather)
rng(8); days = 120;
Tmin = 24 + 3*randn(1, days); Tmax = Tmin + 10 + 2*rand(1, days);
ET0 = et0PM(Tmin, Tmax, 55, 2, NaN, 230, 30.9, 120 + (1:days), 'Sunshine', 9);
fprintf('ET0: %.1f mm a day on average\\n', mean(ET0))
% 2. Maize: its crop coefficient, the rain, and when to irrigate
kc = kcCurve([0.3 1.2 0.5], [20 35 40 25]);
rain = 25*(rand(1, days) < 0.06);
taw = 140;   % slider 60 200
w = soilWaterBalance(ET0, rain, kc, 'TAW', taw, 'p', 0.55);
soilWaterBalance(ET0, rain, kc, 'TAW', taw, 'p', 0.55)
% ... and what water stress would cost without irrigation
dry = soilWaterBalance(ET0, rain, kc, 'TAW', taw, 'p', 0.55, 'Irrigate', false);
g1 = cropGrowth(Tmin, Tmax, 22*ones(1, days)); g0 = cropGrowth(Tmin, Tmax, 22*ones(1, days), 'Ks', dry.Ks);
fprintf('%d irrigations (%.0f mm): %.1f t/ha against %.1f t/ha rain-fed\\n', w.Events, w.TotalIrrigation, g1.Yield, g0.Yield)
% 3. Process optimisation (M422): the cheapest cattle feed that meets protein and energy needs
%     maize   soymeal  wheat bran   (per kg)
cost    = [0.22    0.45     0.18];
protein = [0.09    0.44     0.15];     % kg protein per kg
energy  = [13.5    12.5     10.0];     % MJ per kg
% at least 16% protein and 12 MJ/kg, at most 50% bran, the mix adds up to 1 kg
x = linprog(cost, -[protein; energy], -[0.16; 12], [1 1 1], 1, [0 0 0], [1 1 0.5]);
fprintf('Feed: %.0f%% maize, %.0f%% soymeal, %.0f%% bran at %.3f a kg\\n', 100*x, cost*x)
% 4. How much water pays: yield response to irrigation (a made-up curve), price and pumping cost
profit = @(I) -(180*(1 - exp(-I/250)) * 22 - 0.9*I);   % I in mm; yield value minus pumping
best = fminbnd(profit, 0, 800);
fprintf('Most profitable seasonal irrigation: %.0f mm\\n', best)
% 5. Three power stations sharing 850 MW at the least cost (equal incremental cost)
[P, lambda] = economicDispatch([7.92 7.85 7.97], [0.001562 0.00194 0.00482], [150 100 50], [600 400 200], 850);
fprintf('Dispatch: %.0f, %.0f, %.0f MW at %.3f per MWh at the margin\\n', P, lambda)
demand = 400:25:1200;
[Pd, lam] = economicDispatch([7.92 7.85 7.97], [0.001562 0.00194 0.00482], [150 100 50], [600 400 200], demand);
figure; area(demand, Pd); legend('Unit 1', 'Unit 2', 'Unit 3'); xlabel('Demand (MW)'); ylabel('Output (MW)'); title('Who runs as demand grows'); grid on
fprintf('Solar farm LCOE: %.3f a kWh\\n', lcoe(8e5, 1.5e4, 1.6e6, 0.07, 25, 'Degradation', 0.005))
` },
  { name: 'datacenter_power.m', code: `% Data centres: from one accelerator to a gigawatt campus
% 1. An AI server and how its power follows the work
s = dcServer('Chips', 8, 'Chip', 'gpu1000');
u = 0:0.1:1;
[P, parts] = dcServerPower(s, u, 'Inlet', 27);
fprintf('Server: %.1f kW idle, %.1f kW flat out (peak in hot air %.1f kW)\\n', P(1)/1e3, P(end)/1e3, s.Peak/1e3)
figure; plot(u, P/1e3, 'LineWidth', 2); xlabel('Accelerator utilisation'); ylabel('Wall power (kW)'); grid on; title('One server')
% 2. A training job across a hall of 10,000 servers: power swings in step
t = 0:0.05:120;
w = dcWorkload(t, 'Checkpoint', [60 6], 'Period', 3);
hall = dcServerPower(s, w) * 10000 / 1e6;    % MW
figure; plot(t, hall); xlabel('Time (s)'); ylabel('Hall IT power (MW)'); grid on
title(sprintf('Swings of %.0f MW within a second', max(hall) - min(hall)))
% 3. The whole facility through a summer day: cooling and PUE
h = 0:23;
Tout = 24 + 8*cos(2*pi*(h - 15)/24);
Pit = mean(hall) * ones(size(h));
f = dcFacility(Pit, Tout, 'Rated', 120, 'Supply', 22);
fprintf('PUE from %.2f at night to %.2f in the afternoon\\n', min(f.PUE), max(f.PUE))
figure; dcFacility(Pit, Tout, 'Rated', 120, 'Supply', 22)
% 4. A gigawatt campus built in four phases (year it opens, IT MW)
phases = [1 250; 2 250; 3 300; 4 400];
c = dcCampus(phases, 6, 'Fill', 15, 'Climate', [16 10 6]);
fprintf('Year %d: peak %.0f MW, %.1f TWh a year\\n', [c.Year c.PeakMW c.EnergyGWh/1e3]')
figure; dcCampus(phases, 6, 'Fill', 15, 'Climate', [16 10 6])
% 5. How much air or water carries a 130 kW rack's heat away
fprintf('A 130 kW rack: %.1f m3/s of air at 12 K, or %.0f L/min of water at 10 K\\n', dcHeatFlow(130e3, 12, 'air'), dcHeatFlow(130e3, 10, 'water'))
` },
  { name: 'datacenter_grid.m', code: `% Data centres on the grid: voltage, hosting capacity, frequency, harmonics and ride-through
% 1. A 300 MW campus on a 132 kV line (system base 1000 MVA): its load swings with training jobs
t = 0:1:600;
P = 0.3*(0.75 + 0.2*(mod(t, 120) < 90));       % pu: compute bursts and pauses
Q = 0.06*ones(size(t));
figure; dcGridVoltage(P, Q, 'Z', [0.02 0.15], 'Tap', true, 'Delay', 20)
% 2. How much more could the connection host?
h = dcHostingCapacity([0.02 0.15], 'PF', 0.98, 'Vmin', 0.95);
fprintf('Hosting capacity %.0f MW (limited by %s); the nose at %.0f MW\\n', 1000*h.Capacity, h.LimitedBy, 1000*h.Nose)
% 3. The campus trips off all at once (a fault it fails to ride through): frequency rises
tt = 0:0.05:40;
dP = -0.03*(tt >= 1);            % 3% of a 10 GW system lost in a second
[df, s] = dcFrequency(tt, dP, 'H', 3.5, 'F0', 50);
[dfb, sb] = dcFrequency(tt, dP, 'H', 3.5, 'F0', 50, 'Battery', [0.01 0.1]);
figure; plot(tt, 50 + df, tt, 50 + dfb, 'LineWidth', 1.5); legend('Without storage', 'With a 100 MW battery'); grid on
xlabel('Time (s)'); ylabel('Frequency (Hz)'); title(sprintf('Peak %.3f Hz, %.3f Hz with the battery', 50 + s.Nadir, 50 + sb.Nadir))
% 4. Harmonics at the 34.5 kV bus: old 6-pulse rectifiers against active front ends, with a capacitor bank
H6 = dcHarmonics(120, 34.5, 3000, 'Rectifier', '6pulse', 'Capacitor', 30);
Ha = dcHarmonics(120, 34.5, 3000, 'Rectifier', 'afe', 'Capacitor', 30);
fprintf('THDv: %.2f%% with 6-pulse (resonance at order %.1f), %.2f%% with active front ends\\n', H6.THDv, H6.Resonance, Ha.THDv)
figure; dcHarmonics(120, 34.5, 3000, 'Rectifier', [0.3 0.2 0.3 0.2], 'Capacitor', 30)
% 5. Last year's voltage sags at the bus: which did the servers ride through?
V = [0.1 0.55 0.72 0.85 0.6 0.0];  dur = [0.01 0.05 0.3 2 0.8 0.03];
figure; itic(V, dur)
` },
  { name: 'datacenter_sst.m', code: `% Data centres: an 800 V DC solid-state transformer for AI racks
% 1. Design the dual active bridge: 1600 V link to the 800 V bus, 250 kW at 50 kHz
d = dabDesign(1600, 800, 250e3, 50e3);
fprintf('n = %.2f, L = %.1f uH, at most %.0f kW\\n', d.n, 1e6*d.L, d.Pmax/1e3)
phi = linspace(-pi/2, pi/2, 101);
figure; plot(phi*180/pi, dabPower(1600, 800, d.n, d.L, d.fs, phi)/1e3, 'LineWidth', 2); grid on
xlabel('Phase shift (degrees)'); ylabel('Power (kW)'); title('Power set by the phase shift')
% 2. One switching period: is it soft-switching?
figure; dabWaveform(1600, 800, d.n, d.L, d.fs, pi/6)
% 3. Efficiency across the load with silicon-carbide switches
P = linspace(20e3, 250e3, 24);
figure; dabEfficiency(1600, 800, d.n, d.L, d.fs, P, 'Rds', [0.016 0.004])
% 4. The closed loop against an AI training load that swings 120 to 220 kW every 4 ms
t = 0:2e-5:0.04;
load = 170e3 + 50e3*sign(sin(2*pi*t/8e-3));
bw = 300;      % slider 50 800
figure; sstSimulate(d, t, load, 'Bandwidth', [20 bw])
r = sstSimulate(d, t, load, 'Bandwidth', [20 bw]);
fprintf('Bus held within %.1f V; tuned Kp = %.3g rad/V, Ki = %.3g rad/(V s)\\n', max(abs(r.V2 - 800)), r.Kp(2), r.Ki(2))
% 5. The same converter switching for real, 2 ms: the bus ripple at 100 kHz
ts = 0:2e-6:2e-3;
s = sstSimulate(d, ts, 200e3, 'Fidelity', 'switching');
figure; plot(ts*1e3, s.V2); xlabel('Time (ms)'); ylabel('Bus (V)'); grid on; title('Ideal switching: ripple on the bus')
% 6. The controller as code for the processor and for an FPGA
disp(dcControllerCode(r.Kp(2), r.Ki(2), 2e-5, 800))
v = dcControllerCode(r.Kp(2), r.Ki(2), 2e-5, 800, 'Language', 'verilog');
fprintf('Verilog: %d lines\\n', numel(strfind(v, char(10))))
` },
  { name: 'datacenter_cooling.m', code: `% Data centres: cooling 130 kW AI racks
% 1. A year of hourly weather for a hot, humid site (made up but typical)
h = 15:24:8759;                                   % 3 pm each day keeps it quick
dry = 27 + 6*cos(2*pi*(h/24 - 200)/365) + 5*cos(2*pi*(mod(h, 24) - 15)/24);
wet = wetBulb(dry, 60);
% 2. Air against single-phase and two-phase liquid for a 20 MW hall
figure; coolingCompare(20000, 130, 'Chip', 1200, 'Dry', dry, 'Wet', wet, 'FacilityWater', 32)
c = coolingCompare(20000, 130, 'Chip', 1200, 'Dry', dry, 'Wet', wet, 'FacilityWater', 32);
names = {'Air', 'Single-phase', 'Two-phase'};
for k = 1:3
  fprintf('%-12s pPUE %.3f, chip %.0f C, chiller %3d of %d days, %.2f L/kWh\\n', names{k}, c.pPUE(k), c.ChipMax(k), c.ChillerHours(k), numel(h), c.WUE(k))
end
% 3. The chiller at part load and pump control strategies
plr = 0.1:0.05:1;
[~, cop] = chillerPower(2000, 6, plr, 28);
q = linspace(0.2, 1, 50);
figure; subplot(1, 2, 1); plot(plr, cop, 'LineWidth', 2); xlabel('Part load'); ylabel('COP'); grid on; title('Chiller')
subplot(1, 2, 2); plot(q, pumpPower(q, 1, 15, 'Strategy', 'constant'), q, pumpPower(q, 1, 15), q, pumpPower(q, 1, 15, 'Strategy', 'dpreset'), 'LineWidth', 1.5)
legend('Constant speed', 'Variable speed', 'Pressure reset'); xlabel('Flow (share)'); ylabel('Pump power (kW)'); grid on
% 4. One rack through a training job's start, a pump failure at 20 minutes, with and without a spare
t = 0:10:3600;
P = 60e3 + 70e3*(t > 300);
figure; coolingLoop(t, P, 'FailAt', 1200, 'Pumps', [2 1])
bad = coolingLoop(t, P, 'FailAt', 1200, 'Pumps', [2 0]);
fprintf('Without a spare pump the chips reach %.0f C (%.0f s over 85 C)\\n', bad.Peak, bad.SecondsOver)
% 5. Predictive maintenance: the CDU's exchanger fouling, read from its temperatures each week
wk = 0:7:140;
Thi = 45 + 0.002*wk; Tho = 35 + 0.006*wk; Tci = 30*ones(size(wk)); Tco = Tci + (Thi - Tho);
UA = hxUA(Thi, Tho, Tci, Tco, 3.2);
figure; foulingTrend(wk, UA, 0.8)
f = foulingTrend(wk, UA, 0.8);
fprintf('Clean the exchanger on day %.0f\\n', f.CleanAt)
` },
  { name: 'datacenter_onsite.m', code: `% Data centres: power on site when the grid can't give enough
% 1. Gas turbines in a hot summer: part load costs efficiency
figure; gasTurbine(0.5, 'Rated', 50, 'Ambient', 35)
g = gasTurbine([0.4 0.7 1], 'Rated', 50, 'Ambient', 35, 'Price', 3.5);
fprintf('At 40/70/100%%: %.1f/%.1f/%.1f%% efficient, $%.0f/MWh of fuel at full load\\n', 100*g.Efficiency, g.Cost(3)/g.Power(3))
% 2. A generator set taking the cooling plant's start-up in two blocks
t = 0:0.01:12;
figure; gensetStep(t, [0 0.15; 1 0.45; 6 0.8])
[~, s] = gensetStep(t, [0 0.15; 1 0.45]);
fprintf('A 30%% block: dip %.1f%%, ISO 8528-5 class %s\\n', s.Dip, s.Classes)
% 3. A fuel cell stack for clean back-up (a dozen of these make a megawatt)
figure; fuelCell(300, 'Type', 'pem', 'Cells', 400, 'Area', 600)
[V, P, f] = fuelCell(500, 'Cells', 400, 'Area', 600);
fprintf('At 500 mA/cm2: %.2f V a cell, %.0f kW, %.0f%% efficient, %.1f kg of hydrogen an hour\\n', V, P, 100*f.Efficiency, f.H2)
% 4. A day minute by minute: a 300 MW AI campus, 150 MW from the grid, turbines, a battery and solar
m = 0:1439;
load = 260 + 40*sign(sin(2*pi*m/15)) .* (mod(m, 240) < 200);      % training bursts, pauses every 4 h
pv = max(0, 80*sin(pi*(m/60 - 6)/12));
mwh = 120;     % slider 0 400
figure; hybridPower(load, 1/60, 'Grid', 150, 'Turbines', [4 50 0.3 6], 'Battery', [mwh mwh/2 0.88], 'Solar', pv)
h = hybridPower(load, 1/60, 'Grid', 150, 'Turbines', [4 50 0.3 6], 'Battery', [mwh mwh/2 0.88], 'Solar', pv);
fprintf('Served all but %.2f MWh; %.0f t CO2; the battery cycled %.1f times\\n', h.UnservedMWh, h.CO2, h.Cycles)
% 5. A digital twin for condition monitoring: measured heat rate against the model, CUSUM finds the drift
rng(4); days = 1:120;
model = gasTurbine(0.8*ones(size(days)), 'Rated', 50).HeatRate;
meas = model .* (1 + 0.004*randn(size(days)) + 0.02*(days > 70).*(days - 70)/50);   % fouled compressor from day 70
r = (meas./model - 1)/0.004;          % the residual in standard deviations
S = 0; alarm = NaN;
for k = days                           % a one-sided CUSUM, slack 0.5, limit 5 (cusum() does the same)
  S = max(0, S + r(k) - 0.5);
  if S > 5 && isnan(alarm), alarm = k; end
end
fprintf('Heat rate drifting up, flagged on day %d: wash the compressor\\n', alarm)
` },
  { name: 'datacenter_interconnect.m', code: `% Data centres: signal and power integrity for AI accelerator links
% 1. A 30 cm board trace between accelerators, and the same with a 3 mm via stub
f = 1e8:1e8:5e10;
S = sparamLine(f, 'Length', 0.3, 'Dk', 3.5, 'Df', 0.006, 'Width', 150e-6);
Sv = sparamLine(f, 'Length', 0.3, 'Dk', 3.5, 'Df', 0.006, 'Width', 150e-6, 'Stub', [0.003 0.5 50]);
figure; plot(f/1e9, 20*log10(abs(rfparam(S, 2, 1))), f/1e9, 20*log10(abs(rfparam(Sv, 2, 1))), 'LineWidth', 1.5); grid on
xlabel('Frequency (GHz)'); ylabel('Insertion loss (dB)'); legend('Trace', 'With a via stub'); title('The channel')
% 2. Its pulse response at 56 GBd: inter-symbol interference
figure; pulseResponse(S, 56e9)
% 3. PAM4 at 56 GBd (112 Gb/s): no equalisation, then CTLE + 6-tap DFE, with jitter and crosstalk
figure; eyeDiagram(S, 56e9, 'Modulation', 'PAM4', 'Symbols', 1500, 'RJ', 0.01, 'DJ', 0.03)
figure; eyeDiagram(S, 56e9, 'Modulation', 'PAM4', 'CTLE', 'auto', 'DFE', 6, 'Symbols', 1500, 'RJ', 0.01, 'DJ', 0.03, 'Noise', 0.002, 'Crosstalk', [0.01 0.02], 'Mask', [0.2 0.02])
e = eyeDiagram(S, 56e9, 'Modulation', 'PAM4', 'CTLE', 'auto', 'DFE', 6, 'Symbols', 1500, 'RJ', 0.01, 'DJ', 0.03, 'Noise', 0.002);
fprintf('Equalised PAM4 eye: %.0f mV x %.2f UI, BER %.1e; CTLE %.1f dB\\n', 1000*e.Height, e.Width, e.BER, e.CTLE(1))
% 4. Transmit FFE chosen by zero forcing for 28 GBd NRZ
n = eyeDiagram(S, 28e9, 'FFE', 'auto', 'FFETaps', [1 3], 'Symbols', 1000);
fprintf('FFE taps: %s\\n', mat2str(n.FFETaps, 3))
% 5. Power integrity: the accelerator's 0.8 V rail, 400 A, 3% ripple
target = 0.8*0.03/200;                         % a 200 A load step
fz = logspace(3, 9, 300);
caps = [12 470e-6 4e-3 1.2e-9; 80 22e-6 3e-3 0.35e-9; 200 1e-6 6e-3 0.25e-9];
figure; pdnImpedance(fz, 'VRM', [0.2e-3 5e-9], 'Caps', caps, 'Plane', [80e-9 0.2e-3 15e-12], 'Die', [400e-9 0.5e-3 1e-12], 'Target', target, 'Step', [200 2e-9 20e-6])
% 6. DC drop across the 0.8 V planes (three 2-oz layers): regulators on the left, the package in the middle, a void for a connector
figure; irDrop('Size', [0.08 0.06], 'Grid', [80 60], 'Copper', 6, 'VRM', [0 0.01 0.008 0.04 0.8], 'Loads', [0.045 0.02 0.02 0.02 200], 'Voids', [0.025 0.035 0.01 0.025], 'Limit', 2)
r = irDrop('Size', [0.08 0.06], 'Grid', [80 60], 'Copper', 6, 'VRM', [0 0.01 0.008 0.04 0.8], 'Loads', [0.045 0.02 0.02 0.02 200], 'Voids', [0.025 0.035 0.01 0.025], 'Limit', 2);
fprintf('The package sees %.3f V (%.1f mV lost); %d cells over 2%%\\n', r.LoadV, 1000*(0.8 - r.LoadV), r.CellsOverDrop)
` },
];
