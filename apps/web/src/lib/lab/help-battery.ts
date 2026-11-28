// Help for Hyperion's battery systems (M570–), kept apart like help-power.ts. Same form:
// `name | how to call it | what it does`, `# ` starts a section.

export const BATTERY_HELP = `
# Battery systems: cell characterisation
ecmCell | c = ecmCell(2) | A cell as an equivalent circuit whose values change with the state of charge: OCV, R0 and each RC pair's R and Tau as tables over SOC (one row a pair). ecmCell(n) gives a sample 5 Ah NMC cell with 1–3 pairs; ecmCell('Capacity', 5, 'SOC', s, 'OCV', v, 'R0', r0, 'R', R, 'Tau', T) your own.
ecmSimulate | [v, soc] = ecmSimulate(c, I, dt, soc0) | The cell's terminal voltage and state of charge under a current (A, + discharging) sampled every dt seconds, each value read from its table at the present SOC. With no output, draws both.
hppcTest | [t, I] = hppcTest(capacity, 'PulseC', 1, 'ChargeC', 0.75, 'Pulse', 10, 'Rest', 40, 'LongRest', 3600, 'Step', 0.1) | A hybrid pulse power characterisation test's current: at each level a long rest, a discharge pulse, a rest, a charge pulse, a rest, then a discharge of Step of the capacity to the next level.
hppcFit | c = hppcFit(t, I, v, capacity, pairs) | Reads an HPPC test back into an ecmCell: OCV from the rested voltage at each level, R0 from the voltage's jump as each discharge pulse starts, and the RC pairs (1–3) fitted to each level's load and relaxation (variable projection: resistances by least squares, time constants searched). Adds FitRMS and Pulses. With no output, draws the test against the fitted cell and the resistances by SOC.

# Battery systems: state of charge and health
socCoulomb | z = socCoulomb(I, dt, capacity, soc0, eta) | The state of charge by counting charge: z0 − ∫ I dt / (3600 C), I + discharging; eta (default 1) is the charging efficiency. Simple, but a wrong start or a biased sensor stays in it.
socKalman | [z, sigma] = socKalman(c, I, v, dt, 'Filter', 'ekf', 'SOC0', 0.5, 'P0', 0.1, 'Q', 1e-8, 'R', 1e-4) | The state of charge from current and measured voltage by an extended ('ekf') or unscented ('ukf') Kalman filter on an ecmCell with any number of RC pairs (states: SOC and each pair's voltage); sigma is its one-sigma spread. With no output, draws it with ±2σ.
ocvSOC | z = ocvSOC(c, v) | The state of charge a rested voltage means: the cell's OCV table read backwards.
sohEstimate | h = sohEstimate(c, I, v, dt, 'SOC0', 0.5, 'Rest', 300, 'Filter', 'ukf') | The state of health with the state of charge: R0 followed as a slow state of an adaptive Kalman filter (R0Growth, R0 over the table's), the capacity from rests (after each rest of 'Rest' s the voltage gives the SOC; the charge between rests over the SOC's change), or, with too few rests, by dual estimation. h has SOH (capacity over new), Capacity, R0Growth, SOC and R0Track.
`;
