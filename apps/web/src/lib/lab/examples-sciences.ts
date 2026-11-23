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
];
