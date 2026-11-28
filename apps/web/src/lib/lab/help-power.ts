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
`;
