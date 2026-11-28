// Help for Hyperion's battery systems (M570–), kept apart like help-power.ts. Same form:
// `name | how to call it | what it does`, `# ` starts a section.

export const BATTERY_HELP = `
# Battery systems: cell characterisation
ecmCell | c = ecmCell(2) | A cell as an equivalent circuit whose values change with the state of charge: OCV, R0 and each RC pair's R and Tau as tables over SOC (one row a pair). ecmCell(n) gives a sample 5 Ah NMC cell with 1–3 pairs; ecmCell('Capacity', 5, 'SOC', s, 'OCV', v, 'R0', r0, 'R', R, 'Tau', T) your own.
ecmSimulate | [v, soc] = ecmSimulate(c, I, dt, soc0) | The cell's terminal voltage and state of charge under a current (A, + discharging) sampled every dt seconds, each value read from its table at the present SOC. With no output, draws both.
hppcTest | [t, I] = hppcTest(capacity, 'PulseC', 1, 'ChargeC', 0.75, 'Pulse', 10, 'Rest', 40, 'LongRest', 3600, 'Step', 0.1) | A hybrid pulse power characterisation test's current: at each level a long rest, a discharge pulse, a rest, a charge pulse, a rest, then a discharge of Step of the capacity to the next level.
hppcFit | c = hppcFit(t, I, v, capacity, pairs) | Reads an HPPC test back into an ecmCell: OCV from the rested voltage at each level, R0 from the voltage's jump as each discharge pulse starts, and the RC pairs (1–3) fitted to each level's load and relaxation (variable projection: resistances by least squares, time constants searched). Adds FitRMS and Pulses. With no output, draws the test against the fitted cell and the resistances by SOC.
`;
