// Help for Hyperion's power electronics (M563–), kept apart like help-machines.ts. Same form:
// `name | how to call it | what it does`, `# ` starts a section.

export const POWER_HELP = `
# Power electronics: losses and heat
powerDevice | d = powerDevice('mosfet', 'Rds', 6e-3, 'I', [0 10 20 40], 'Eon', [0 8 18 42]*1e-6, 'Vtest', 48) | A switch with its diode as a struct, from its datasheet: 'mosfet' (Rds at 25 °C and Alpha, its rise per °C) or 'igbt' (knee Vce0 and slope Rce), the diode's Vf and Rd, and the switching energies Eon, Eoff, Err (J) against current I at the test voltage Vtest.
conductionLoss | [Psw, Pdiode] = conductionLoss(d, Iavg, Irms, Tj) | Conduction losses (W) of the switch and of its diode carrying that average and RMS current, the MOSFET at junction temperature Tj (°C).
switchingLoss | [Pon, Poff, Prr] = switchingLoss(d, I, V, fsw) | Switching losses (W): the datasheet's energies read at current I, scaled to voltage V, times the switching frequency. One output gives their sum.
buckLosses | r = buckLosses(Vin, Vout, Iout, 'fsw', 100e3, 'L', 10e-6, 'DCR', 5e-3, 'Device', d, 'Tj', 25, 'Sync', true) | Where a buck converter's power goes at one working point: each switch's conduction and switching, the diode's recovery, the inductor's copper; the ripple, CCM or DCM, and the efficiency.
efficiencyMap | E = efficiencyMap(Vins, Vout, Iouts, …) | A buck's efficiency over input voltages (rows) and output currents (columns), with buckLosses' options; contourf(Iouts, Vins, E) draws the map.
fosterNet | n = fosterNet(R, tau) | A Foster thermal network: the datasheet's Zth curve as resistances (K/W) and time constants (s).
zth | Z = zth(n, t) | The network's thermal impedance at times t: Σ R (1 − e^(−t/τ)).
foster2cauer | [R, C] = foster2cauer(n) | The same network as a Cauer ladder (each layer's resistance and heat capacity), to stack onto a heatsink's.
junctionTemp | Tj = junctionTemp(n, P, dt, 'Ambient', 25, 'Sink', [Rth tau]) | The junction's temperature over a power profile P (W, a sample every dt s), on a case held at the ambient or through a heatsink stage.

# Power electronics: converter design
converterModel | [op, G] = converterModel('buck', 'Vin', 48, 'Vout', 12, 'L', 22e-6, 'C', 100e-6, 'R', 1.2, 'fsw', 200e3, 'ESR', 0) | A converter's averaged model ('buck', 'boost', 'buckboost'): op holds the duty, CCM or DCM (K = 2L/(R·Ts) against its critical value), the ratio, the ripple; G is the duty-to-output transfer function (the boost's right-half-plane zero included), for bode, margin, step and pidtune. 'Duty' in place of 'Vout'.
llcGain | M = llcGain(fn, Ln, Q) | An LLC resonant converter's voltage gain by first-harmonic approximation over normalised frequency fn = f/fr, for Ln = Lm/Lr and each quality factor in Q (one row each).
dabPower | P = dabPower(V1, V2, n, phi, fsw, L) | A dual active bridge's power with single phase shift phi (rad): V1·n·V2·φ(π − |φ|)/(2π²·fsw·L).
buckDesign | [best, all] = buckDesign(Vin, Vout, Iout, 'Inductors', [L DCR cost; …], 'Capacitors', [C ESR cost; …], 'Fsw', [100e3 200e3], 'MaxRipple', 0.4, 'MaxVoutRipple', 0.01, 'MinEfficiency', 0.9, 'Goal', 'efficiency') | Picks real parts: every frequency, inductor and capacitor from your lists, kept when they meet the limits, best first by efficiency (or 'cost'). all's columns: fsw L DCR C ESR efficiency ripple VoutRipple cost.
monteCarlo | [Y, info] = monteCarlo(@(p) f(p), nominal, tol, N, 'Dist', 'uniform', 'Spec', [lo hi]) | A tolerance study: N runs with each parameter moved within its tolerance (a fraction; 'normal' takes it as 3σ); info holds the first output's mean, spread, range and, with 'Spec', the share inside it (the yield).
prbs | u = prbs(n, len, amp) | A maximal-length pseudo-random binary sequence (±amp) from an n-bit register (2–16), period 2ⁿ − 1, to excite a system for frequency-response estimation.
idinput | u = idinput(N, 'prbs', band, [lo hi]) | An identification input: a PRBS ('prbs') or random binary ('rbs') sequence of N samples between the two levels.
frestimate | [H, w] = frestimate(u, y, Ts, w) | A frequency response estimated from a simulation's or test's input and output (sample time Ts) at frequencies w (rad/s): complex values, abs(H) and angle(H) for a Bode plot.
pidtune | [C, info] = pidtune(G, 'PI', wc, 'PhaseMargin', 60) | P, PI or PID gains for plant G with the loop crossing over at wc (rad/s; chosen when left out) with that phase margin. C is the controller as a transfer function; info holds Kp, Ki, Kd, the crossover and the margin reached (more than asked when the plant lags little).

# Power electronics: converter control
buckControlSim | r = buckControlSim('voltage', 'Vin', 12, 'Vref', 3.3, 'L', 4.7e-6, 'C', 100e-6, 'R', 1, 'fsw', 200e3, 'Cycles', 400, 'Steps', [1e-3 0.5]) | A buck switched cycle by cycle under 'voltage'-mode or peak-'current'-mode control (with slope compensation), its gains tuned on its own averaged model; 'Steps' rows [t R] change the load. r holds t, Vout, IL, Duty, Peak, the gains and the settling time after the first step.
pfcSim | r = pfcSim('Vrms', 230, 'Fline', 50, 'Vout', 400, 'L', 1e-3, 'C', 470e-6, 'P', 500, 'fsw', 65e3, 'Cycles', 10) | A boost power-factor-correction stage under average-current control: the line current, the output, and the PowerFactor, THD and Ripple over the last line cycle.
mpptSim | r = mpptSim('po', G, 'T', 25, 'Step', 0.2, 'Series', 1) | Maximum power point tracking on a solar panel as the irradiance G (W/m², one value a step) changes: perturb-and-observe ('po') or incremental conductance ('inccond'); r holds the voltage, power, the true maximum and the tracking Efficiency.
svpwm | [da, db, dc, sector] = svpwm(valpha, vbeta, Vdc) | Space vector modulation: each phase's duty (0–1) for the reference vector on the DC link, and its sector (1–6).
gridInverterSim | r = gridInverterSim('Vgrid', 400, 'f', 50, 'Vdc', 700, 'L', 5e-3, 'fsw', 10e3, 'Tend', 0.2, 'Steps', [0 5e3 0; 0.1 10e3 3e3]) | A three-phase inverter feeding the grid: a synchronous-frame PLL, dq current control with the cross-coupling cancelled, following the [t P Q] steps; r holds P, Q, Id, Iq, Ia and the PLL's angle error.
droopShare | [P, f, info] = droopShare(load, m, Pmax, f0) | How inverters with frequency droops m (Hz/W) share a load: each unit's power and the common frequency; a unit at its limit holds there.
`;
