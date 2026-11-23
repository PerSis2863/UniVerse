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
`;
