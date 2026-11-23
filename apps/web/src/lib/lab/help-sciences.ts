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
`;
