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
];
