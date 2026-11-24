// Point-and-click windows for Hyperion's science and industry toolboxes (M508, the owner, 23 Nov: "all of them"). Each
// window is data: its fields (sliders, menus, switches, text) and the script they make. The window runs that script in
// Hyperion's engine and shows the figure, the results (lines the script prints as "= Label | value") and the script
// itself, to copy or open in Code. Pure: no React here.

export type Values = Record<string, number | string | boolean>;
interface Base { key: string; label: string; when?: (v: Values) => boolean; hint?: string }
export type Field =
  | (Base & { kind: 'num'; min: number; max: number; step: number; value: number; unit?: string })
  | (Base & { kind: 'menu'; options: [string, string][]; value: string })
  | (Base & { kind: 'toggle'; value: boolean })
  | (Base & { kind: 'text'; value: string; allow: RegExp; max: number });
export interface SciApp { id: string; title: string; blurb: string; note?: string; fields: Field[]; script: (v: Values) => string }

const num = (key: string, label: string, min: number, max: number, step: number, value: number, unit?: string, when?: Base['when']): Field => ({ kind: 'num', key, label, min, max, step, value, unit, when });
const menu = (key: string, label: string, options: [string, string][], value = options[0][0], when?: Base['when']): Field => ({ kind: 'menu', key, label, options, value, when });
const is = (key: string, ...vals: string[]) => (v: Values) => vals.includes(String(v[key]));

/** The values a window starts with. */
export const defaults = (app: SciApp): Values => Object.fromEntries(app.fields.map((f) => [f.key, f.value]));
/** Values made safe for a script: numbers inside their range, menus one of their options, text only its letters. */
export function clean(app: SciApp, v: Values): Values {
  const out: Values = {};
  for (const f of app.fields) {
    const x = v[f.key];
    if (f.kind === 'num') { const n = Number(x); out[f.key] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.value; }
    else if (f.kind === 'menu') out[f.key] = f.options.some(([o]) => o === x) ? String(x) : f.value;
    else if (f.kind === 'toggle') out[f.key] = typeof x === 'boolean' ? x : f.value;
    else out[f.key] = String(x ?? '').split('').filter((ch) => f.allow.test(ch)).join('').slice(0, f.max) || f.value;
  }
  return out;
}
/** The script for these values (cleaned first, so nothing typed can break out of a number or a quoted text). */
export const scriptFor = (app: SciApp, v: Values) => app.script(clean(app, v));
/** The results a run printed: "= Label | value" lines. */
export function resultsOf(text: string): { label: string; value: string }[] {
  return text.split('\n').filter((l) => l.startsWith('= ')).map((l) => { const [label, ...rest] = l.slice(2).split(' | '); return { label: label.trim(), value: rest.join(' | ').trim() }; });
}
/** What a run printed other than its results. */
export const otherText = (text: string) => text.split('\n').filter((l) => !l.startsWith('= ')).join('\n').trim();

const n = (x: Values[string]) => String(Number(x));
const BETA_GLOBIN = 'ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGCAGGCTGCTGGTGGTCTACCCTTGGACCCAGAGGTTCTTTGAGTCCTTTGGGGATCTGTCCACTCCTGATGCTGTTATGGGCAACCCTAAGGTGAAGGCTCATGGCAAGAAAGTGCTCGGTGCCTTTAGTGATGGCCTGGCTCACCTGGACAACCTCAAGGGCACCTTTGCCACACTGAGTGAGCTGCACTGTGACAAGCTGCACGTGGATCCTGAGAACTTCAGGCTCCTGGGCAACGTGCTGGTCTGTGTGCTGGCCCATCACTTTGGCAAAGAATTCACCCCACCAGTGCAGGCTGCCTATCAGAAAGTGGTGGCTGGTGTGGCTAATGCCCTGGCCCACAAGTATCACTAA';
const FUNCS: [string, string][] = [['t.^3 - 2*t', 'x³ − 2x'], ['sin(t)', 'sin x'], ['exp(-t.^2)', 'e^(−x²)'], ['cos(t) - t', 'cos x − x'], ['log(t + 4)', 'ln(x + 4)']];

export const SCI_APPS: SciApp[] = [
  {
    id: 'epidemic', title: 'Epidemics', blurb: 'An outbreak in a city of a million: how fast it spreads, what a lockdown and vaccines change.',
    fields: [
      menu('model', 'Model', [['sir', 'SIR'], ['seir', 'SEIR (a latent stage)']]),
      num('r0', 'R0: people each case infects', 0.5, 8, 0.1, 3),
      num('days', 'Infectious for', 2, 21, 1, 10, 'days'),
      num('latent', 'Latent for', 1, 14, 1, 5, 'days', is('model', 'seir')),
      num('vacc', 'Vaccinated before it starts', 0, 90, 1, 0, '%'),
      num('cut', 'Lockdown: less contact', 0, 90, 5, 50, '%'),
      num('from', 'Lockdown from day', 0, 300, 1, 30),
      num('len', 'Lockdown lasts', 0, 300, 5, 60, 'days'),
      num('span', 'Days to follow', 60, 730, 10, 300),
      menu('show', 'Show', [['compare', 'Infectious, with and without the lockdown'], ['all', 'Everyone: susceptible, infectious, recovered']]),
    ],
    script: (v) => {
      const seir = v.model === 'seir', I = seir ? 3 : 2, y0 = seir ? '[N*(1-v)-10 0 10 N*v]' : '[N*(1-v)-10 10 N*v]';
      const call = (extra: string) => (seir ? `seir(beta, 1/${n(v.latent)}, gamma, ${y0}, ${n(v.span)}${extra})` : `sir(beta, gamma, ${y0}, ${n(v.span)}${extra})`);
      return `% Epidemics: ${seir ? 'SEIR' : 'SIR'} in a city of a million
N = 1e6; R0 = ${n(v.r0)}; gamma = 1/${n(v.days)}; beta = R0*gamma; v = ${n(v.vacc)}/100;
[t, y] = ${call(`, 'Intervention', [${n(v.from)} ${Number(v.from) + Number(v.len)} ${Number(v.len) > 0 ? Number(v.cut) / 100 : 0}]`)};
[~, y0] = ${call('')};
${v.show === 'all'
    ? `plot(t, y/1e3, 'LineWidth', 2); legend(${seir ? "'Susceptible', 'Exposed', 'Infectious', 'Recovered'" : "'Susceptible', 'Infectious', 'Recovered'"})
xlabel('Day'); ylabel('People (thousands)'); grid on; title('With the lockdown')`
    : `plot(t, y0(:, ${I})/1e3, '--', t, y(:, ${I})/1e3, 'LineWidth', 2); legend('Nothing done', 'With the lockdown')
xlabel('Day'); ylabel('Infectious (thousands)'); grid on`}
[pk, at] = max(y(:, ${I})); [pk0, at0] = max(y0(:, ${I}));
fprintf('= Effective R0 | %.2f (after vaccination %.2f)\\n', R0, R0*(1 - v))
fprintf('= Peak infectious | %.0f thousand on day %d\\n', pk/1e3, round(t(at)))
fprintf('= Without the lockdown | %.0f thousand on day %d\\n', pk0/1e3, round(t(at0)))
fprintf('= Ever infected | %.1f%% of the city\\n', 100*(y(end, end) - N*v)/N)
fprintf('= Immune share that stops it | %.0f%%\\n', 100*max(0, herdImmunity(R0)))
`;
    },
  },
  {
    id: 'pk', title: 'Drug dosing', blurb: 'Blood levels of a drug for a dose and a schedule, against the range where it works and stays safe.', note: 'A teaching model, not medical advice.',
    fields: [
      menu('route', 'Given', [['oral', 'By mouth'], ['iv', 'Into a vein (bolus)']]),
      num('dose', 'Dose', 10, 2000, 10, 400, 'mg'),
      num('every', 'Every', 2, 48, 1, 8, 'h'),
      num('doses', 'Doses', 1, 30, 1, 10),
      num('cl', 'Clearance', 0.2, 30, 0.1, 4, 'L/h'),
      num('vol', 'Volume', 5, 300, 1, 40, 'L'),
      num('ka', 'Absorption rate', 0.1, 5, 0.1, 1, '1/h', is('route', 'oral')),
      num('f', 'Absorbed', 5, 100, 1, 85, '%', is('route', 'oral')),
      num('mec', 'Lowest level that works', 0.1, 100, 0.1, 5, 'mg/L'),
      num('mtc', 'Highest safe level', 0.2, 200, 0.1, 15, 'mg/L'),
      menu('show', 'Show', [['levels', 'Levels over time'], ['window', 'The best schedule for the window']]),
    ],
    script: (v) => `% Drug dosing: a one-compartment model (a teaching model, not medical advice)
m = pkModel('CL', ${n(v.cl)}, 'V', ${n(v.vol)}, 'ka', ${n(v.ka)}, 'F', ${Number(v.f) / 100});
${v.show === 'window' ? `pkDosingWindow(m, ${n(v.mec)}, ${n(v.mtc)}, 'Route', '${v.route}')` : `pkSimulate(m, ${n(v.dose)}, 'Route', '${v.route}', 'Every', ${n(v.every)}, 'Doses', ${n(v.doses)}, 'Window', [${n(v.mec)} ${n(v.mtc)}])`}
s = pkSteadyState(m, ${n(v.dose)}, ${n(v.every)}, 'Route', '${v.route}');
fprintf('= Half-life | %.1f h\\n', log(2)*${n(v.vol)}/${n(v.cl)})
fprintf('= Steady state | %.2f to %.2f mg/L (mean %.2f)\\n', s.Cmin, s.Cmax, s.Cavg)
fprintf('= Builds up to | %.2f times the first dose, 90%% there after %.0f h\\n', s.Accumulation, s.TimeTo90)
if s.Cmin >= ${n(v.mec)} && s.Cmax <= ${n(v.mtc)}, fprintf('= In the window | yes, all the time\\n'), else, fprintf('= In the window | no: it leaves the range\\n'), end
`,
  },
  {
    id: 'dna', title: 'DNA and proteins', blurb: 'Read a gene, translate it, change one letter and see what it does to the protein; a family tree of five species.',
    fields: [
      { kind: 'text', key: 'gene', label: 'Gene (DNA letters)', value: BETA_GLOBIN, allow: /[ACGTacgt]/, max: 6000, hint: 'Human beta-globin to start with' },
      num('pos', 'Change the letter at', 1, 6000, 1, 20),
      menu('base', 'To', [['T', 'T'], ['A', 'A'], ['C', 'C'], ['G', 'G']]),
      menu('show', 'Show', [['tree', 'Family tree of the protein in five species'], ['orfs', 'Reading frames (printed)']]),
      menu('tree', 'Tree method', [['nj', 'Neighbour joining'], ['upgma', 'UPGMA']], 'nj', is('show', 'tree')),
    ],
    script: (v) => `% DNA and proteins
gene = '${String(v.gene).toUpperCase()}';
p = min(${n(v.pos)}, numel(gene));
mutant = gene; mutant(p) = '${v.base}';
a = nt2aa(gene); b = nt2aa(mutant);
k = find(a ~= b, 1);
fprintf('= Length | %d bases, %.1f%% GC\\n', numel(gene), 100*gcContent(gene))
fprintf('= Protein | %d amino acids\\n', numel(strrep(a, '*', '')))
if isempty(k), fprintf('= The change | silent: the protein is the same\\n')
else, fprintf('= The change | amino acid %d: %s becomes %s\\n', k, a(k), b(k)), end
${v.show === 'orfs' ? "findORFs(gene, 'MinLength', 60)" : `seqs = {'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAF', ...
        'MVHLTPEEKNAVTTLWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSSPDAVMGNPKVKAHGKKVLGAF', ...
        'MVHLSGEEKSAVTALWGKVNVEEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAF', ...
        'MVQLSGEEKAAVLALWDKVNEEEVGGEALGRLLVVYPWTQRFFDSFGDLSNPGAVMGNPKVKAHGKKVLHSF', ...
        'MVHWTAEEKQLITGLWGKVNVADCGAEALARLLIVYPWTQRFFASFGNLSSPTAILGNPMVRAHGKKVLTSF'};
D = seqpdist(seqs, 'Method', 'p-distance');
${v.tree === 'upgma' ? "seqlinkage(D, 'average', {'Human', 'Chimp', 'Mouse', 'Chicken', 'Frog'})" : "seqneighjoin(D, 'equivar', {'Human', 'Chimp', 'Mouse', 'Chicken', 'Frog'})"}`}
`,
  },
  {
    id: 'chem', title: 'Chemistry and reactors', blurb: 'Reactions in series, a stirred tank against a pipe, and how temperature speeds reactions.',
    fields: [
      menu('show', 'Show', [['series', 'A → B → C over time'], ['reactors', 'Stirred tank against plug flow'], ['arrhenius', 'Rate against temperature']]),
      num('k1', 'k₁ (A → B)', 0.05, 5, 0.05, 1, '1/min', is('show', 'series')),
      num('k2', 'k₂ (B → C)', 0.05, 5, 0.05, 0.3, '1/min', is('show', 'series')),
      num('tend', 'Time', 1, 60, 1, 15, 'min', is('show', 'series')),
      menu('order', 'Reaction', [['A -> B', 'A → B (first order)'], ['2 A -> B', '2A → B (second order)']], 'A -> B', is('show', 'reactors')),
      num('k', 'Rate constant', 0.05, 5, 0.05, 0.5, '', is('show', 'reactors')),
      num('tau', 'Longest residence time', 1, 50, 1, 10, '', is('show', 'reactors')),
      num('ea', 'Activation energy', 10, 200, 1, 55, 'kJ/mol', is('show', 'arrhenius')),
      num('t1', 'From', 250, 400, 1, 280, 'K', is('show', 'arrhenius')),
      num('t2', 'To', 260, 600, 1, 360, 'K', is('show', 'arrhenius')),
    ],
    script: (v) => v.show === 'series' ? `% A -> B -> C: the middle product peaks, then is used up
[t, C] = kineticsSim('A -> B; B -> C', [${n(v.k1)} ${n(v.k2)}], [1 0 0], ${n(v.tend)});
plot(t, C, 'LineWidth', 2); legend('A', 'B', 'C'); xlabel('Time (min)'); ylabel('mol/L'); grid on
[bmax, at] = max(C(:, 2));
fprintf('= Most B | %.3f mol/L at t = %.2f\\n', bmax, t(at))
fprintf('= Formula for that time | ln(k1/k2)/(k1 - k2) = %.2f\\n', log(${n(v.k1)}/${n(v.k2)})/(${n(v.k1)} - ${n(v.k2)} + eps))
fprintf('= Left at the end | A %.3f, B %.3f, C %.3f\\n', C(end, 1), C(end, 2), C(end, 3))
` : v.show === 'reactors' ? `% The same reaction in a stirred tank (CSTR) and a plug-flow pipe (PFR)
taus = linspace(0.1, ${n(v.tau)}, 40);
Cs = cstrReactor('${v.order}', ${n(v.k)}, [1 0], taus);
[tp, Cp] = pfrReactor('${v.order}', ${n(v.k)}, [1 0], ${n(v.tau)});
plot(taus, 1 - Cs(:, 1), tp, 1 - Cp(:, 1), 'LineWidth', 2)
legend('Stirred tank (CSTR)', 'Plug flow (PFR)'); xlabel('Residence time V/Q'); ylabel('Conversion of A'); grid on
fprintf('= Conversion at the longest time | tank %.1f%%, pipe %.1f%%\\n', 100*(1 - Cs(end, 1)), 100*(1 - Cp(end, 1)))
` : `% Arrhenius: how temperature speeds a reaction
T = linspace(${n(v.t1)}, ${Math.max(Number(v.t1) + 5, Number(v.t2))}, 60);
k = arrhenius(1e10, ${Number(v.ea) * 1000}, T);
semilogy(T, k, 'LineWidth', 2); grid on; xlabel('Temperature (K)'); ylabel('k (log scale)')
fprintf('= Ten degrees warmer near %g K | %.2f times faster\\n', T(1), arrhenius(1e10, ${Number(v.ea) * 1000}, T(1) + 10)/k(1))
fprintf('= Across the range | %.3g times faster\\n', k(end)/k(1))
`,
  },
  {
    id: 'neuro', title: 'Neurons', blurb: 'How a neuron fires: Hodgkin and Huxley’s axon, integrate-and-fire, and Izhikevich’s many kinds.',
    fields: [
      menu('model', 'Model', [['hh', 'Hodgkin–Huxley (squid axon)'], ['lif', 'Integrate and fire'], ['izh', 'Izhikevich']]),
      num('i', 'Current', 0, 40, 0.5, 10, 'µA/cm² or nA'),
      num('t', 'Duration', 50, 1000, 10, 200, 'ms'),
      num('start', 'Current on at', 0, 500, 5, 20, 'ms', is('model', 'hh')),
      num('stop', 'Current off at', 10, 1000, 5, 180, 'ms', is('model', 'hh')),
      menu('type', 'Kind', [['RS', 'Regular spiking'], ['IB', 'Bursting'], ['CH', 'Chattering'], ['FS', 'Fast spiking'], ['LTS', 'Low threshold'], ['TC', 'Thalamic'], ['RZ', 'Resonator']], 'RS', is('model', 'izh')),
    ],
    script: (v) => `% A neuron firing
${v.model === 'hh' ? `[t, V, gates, spikes] = hodgkinHuxley(${n(v.i)}, ${n(v.t)}, 'Start', ${n(v.start)}, 'Stop', ${n(v.stop)});
hodgkinHuxley(${n(v.i)}, ${n(v.t)}, 'Start', ${n(v.start)}, 'Stop', ${n(v.stop)})
on = max(1, min(${n(v.stop)}, ${n(v.t)}) - ${n(v.start)});`
    : v.model === 'lif' ? `[t, V, spikes] = lifNeuron(${n(v.i)}, ${n(v.t)});
lifNeuron(${n(v.i)}, ${n(v.t)})
on = ${n(v.t)};
fprintf('= The formula’s rate | %.1f Hz\\n', lifRate(${n(v.i)}))`
      : `[t, V, spikes] = izhikevich(${n(v.i)}, ${n(v.t)}, 'Type', '${v.type}', 'Start', 20);
izhikevich(${n(v.i)}, ${n(v.t)}, 'Type', '${v.type}', 'Start', 20)
on = ${n(v.t)} - 20;`}
fprintf('= Spikes | %d\\n', numel(spikes))
fprintf('= Rate while driven | %.1f Hz\\n', 1000*numel(spikes)/on)
`,
  },
  {
    id: 'physics', title: 'Physics', blurb: 'Throws with air resistance, swings, chaos, and light through slits.',
    fields: [
      menu('show', 'Experiment', [['throw', 'A throw'], ['swing', 'A pendulum'], ['double', 'A double pendulum'], ['slits', 'Light through slits']]),
      num('v0', 'Speed', 1, 100, 1, 25, 'm/s', is('show', 'throw')),
      num('angle', 'Angle', 1, 89, 1, 50, '°', is('show', 'throw')),
      num('drag', 'Air resistance k', 0, 0.1, 0.001, 0.01, '1/m', is('show', 'throw')),
      num('len', 'Length', 0.1, 5, 0.1, 1, 'm', is('show', 'swing', 'double')),
      num('a1', 'Start angle', 1, 179, 1, 120, '°', is('show', 'swing', 'double')),
      num('damp', 'Damping', 0, 2, 0.05, 0, '1/s', is('show', 'swing')),
      num('at', 'Moment', 0, 10, 0.05, 2, 's', is('show', 'throw', 'double')),
      num('lambda', 'Wavelength', 380, 750, 1, 633, 'nm', is('show', 'slits')),
      num('slits', 'Slits', 1, 10, 1, 2, '', is('show', 'slits')),
      num('gap', 'Slit spacing', 0.05, 1, 0.01, 0.25, 'mm', is('show', 'slits')),
      num('width', 'Slit width', 0.01, 0.5, 0.01, 0.05, 'mm', is('show', 'slits')),
    ],
    script: (v) => v.show === 'throw' ? `% A throw with air resistance
[x, y, t, info] = projectile(${n(v.v0)}, ${n(v.angle)}, 'Drag', ${n(v.drag)});
projectile(${n(v.v0)}, ${n(v.angle)}, 'Drag', ${n(v.drag)}, 'At', ${n(v.at)})
fprintf('= Range | %.1f m (without air %.1f m)\\n', info.Range, ${n(v.v0)}^2*sind(2*${n(v.angle)})/9.81)
fprintf('= Highest | %.1f m\\n', info.MaxHeight)
fprintf('= In the air | %.2f s\\n', info.FlightTime)
` : v.show === 'swing' ? `% A pendulum without the small-angle shortcut
pendulum(${n(v.len)}, ${n(v.a1)}, 10, 'Damping', ${n(v.damp)})
fprintf('= Period | %.3f s\\n', pendulumPeriod(${n(v.len)}, ${n(v.a1)}))
fprintf('= School formula | %.3f s (%.1f%% shorter)\\n', 2*pi*sqrt(${n(v.len)}/9.81), 100*(1 - 2*pi*sqrt(${n(v.len)}/9.81)/pendulumPeriod(${n(v.len)}, ${n(v.a1)})))
` : v.show === 'double' ? `% A double pendulum: chaos
doublePendulum(${n(v.len)}, ${n(v.len)}, ${n(v.a1)}, -10, max(${n(v.at)}, 0.05), 'At', max(${n(v.at)}, 0.05))
[~, a] = doublePendulum(${n(v.len)}, ${n(v.len)}, ${n(v.a1)}, -10, 10);
[~, b] = doublePendulum(${n(v.len)}, ${n(v.len)}, ${n(v.a1)} + 0.01, -10, 10);
fprintf('= A start 0.01° different | %.0f° apart after 10 s\\n', abs(a(end, 1) - b(end, 1)))
` : `% Light through slits (Fraunhofer)
slitPattern(${Number(v.lambda) * 1e-9}, ${Number(v.gap) * 1e-3}, ${Number(v.width) * 1e-3}, ${n(v.slits)}, 2)
fprintf('= Fringe spacing on a screen 2 m away | %.2f mm\\n', 1000*${Number(v.lambda) * 1e-9}*2/${Number(v.gap) * 1e-3})
fprintf('= Central bright band | %.2f mm wide\\n', 1000*2*${Number(v.lambda) * 1e-9}*2/${Number(v.width) * 1e-3})
`,
  },
  {
    id: 'geo', title: 'Geoscience', blurb: 'Find an earthquake from four seismometers, light a landscape, measure the globe.',
    fields: [
      menu('show', 'Show', [['quake', 'Locate an earthquake'], ['terrain', 'A landscape in the sun'], ['globe', 'Distance on the globe']]),
      num('qx', 'Quake east', -80, 120, 1, 30, 'km', is('show', 'quake')),
      num('qy', 'Quake north', -40, 120, 1, 40, 'km', is('show', 'quake')),
      num('noise', 'Noise on the traces', 0, 0.2, 0.01, 0.02, '', is('show', 'quake')),
      num('rough', 'Roughness', 0.4, 1, 0.05, 0.85, '', is('show', 'terrain')),
      num('relief', 'Relief', 100, 4000, 50, 1500, 'm', is('show', 'terrain')),
      num('az', 'Sun from', 0, 360, 5, 315, '° from north', is('show', 'terrain')),
      num('alt', 'Sun height', 5, 90, 1, 45, '°', is('show', 'terrain')),
      num('lat1', 'From latitude', -90, 90, 0.01, 28.61, '°', is('show', 'globe')),
      num('lon1', 'From longitude', -180, 180, 0.01, 77.21, '°', is('show', 'globe')),
      num('lat2', 'To latitude', -90, 90, 0.01, 35.68, '°', is('show', 'globe')),
      num('lon2', 'To longitude', -180, 180, 0.01, 139.69, '°', is('show', 'globe')),
    ],
    script: (v) => v.show === 'quake' ? `% Locate an earthquake from P-wave arrivals at four stations
rng(4)
stations = [0 0; 90 15; 35 100; -60 70]; quake = [${n(v.qx)} ${n(v.qy)}];
tp = zeros(1, 4);
for k = 1:4
  x = seismogram(norm(stations(k, :) - quake), 100, 60, 'Origin', 2, 'Noise', ${n(v.noise)});
  tp(k) = pickArrival(x, 100);
end
q = locateQuake(stations, tp);
locateQuake(stations, tp)
fprintf('= Found at | (%.1f, %.1f) km\\n', q.X, q.Y)
fprintf('= Off by | %.1f km\\n', norm([q.X q.Y] - quake))
` : v.show === 'terrain' ? `% A made-up landscape lit by the sun
rng(1)
Z = fractalTerrain(7, 'Roughness', ${n(v.rough)}, 'Relief', ${n(v.relief)});
hillshade(Z, 30, 'Azimuth', ${n(v.az)}, 'Altitude', ${n(v.alt)})
[s] = slopeAspect(Z, 30);
fprintf('= Steepest slope | %.0f°\\n', max(s(:)))
fprintf('= Highest and lowest | %.0f m and %.0f m\\n', max(Z(:)), min(Z(:)))
` : `% The distance between two places on the WGS84 ellipsoid
d = distance(${n(v.lat1)}, ${n(v.lon1)}, ${n(v.lat2)}, ${n(v.lon2)}, wgs84Ellipsoid);
az = azimuth(${n(v.lat1)}, ${n(v.lon1)}, ${n(v.lat2)}, ${n(v.lon2)});
lat = linspace(${n(v.lat1)}, ${n(v.lat2)}, 2); lon = linspace(${n(v.lon1)}, ${n(v.lon2)}, 2);
[la, lo] = reckon(${n(v.lat1)}, ${n(v.lon1)}, linspace(0, distance(${n(v.lat1)}, ${n(v.lon1)}, ${n(v.lat2)}, ${n(v.lon2)}), 60), az);
plot(lo, la, 'LineWidth', 2); hold on; plot(lon, lat, 'o'); hold off; grid on
xlabel('Longitude'); ylabel('Latitude'); title('The shortest way (a great circle)')
fprintf('= Distance | %.0f km\\n', d/1000)
fprintf('= Set off at | %.0f° from north\\n', az)
`,
  },
  {
    id: 'ecg', title: 'ECG and biosignals', blurb: 'A made-up heart trace, its beats found and its rhythm measured; brain waves eyes open and closed.', note: 'For learning, not diagnosis.',
    fields: [
      menu('show', 'Show', [['monitor', 'Bedside monitor'], ['rate', 'Heart rate beat by beat'], ['eeg', 'Brain waves (EEG)']]),
      num('hr', 'Heart rate', 30, 180, 1, 72, 'a minute', is('show', 'monitor', 'rate')),
      num('noise', 'Noise', 0, 0.3, 0.01, 0.05, 'mV', is('show', 'monitor', 'rate')),
      num('wander', 'Baseline wander', 0, 1, 0.05, 0.3, 'mV', is('show', 'monitor', 'rate')),
      num('spo2', 'Oxygen (SpO₂)', 70, 100, 1, 97, '%', is('show', 'monitor')),
      num('resp', 'Breaths', 4, 40, 1, 14, 'a minute', is('show', 'monitor')),
      num('alpha', 'Alpha strength', 0, 40, 1, 25, 'µV', is('show', 'eeg')),
      num('beta', 'Beta strength', 0, 40, 1, 4, 'µV', is('show', 'eeg')),
    ],
    script: (v) => v.show === 'eeg' ? `% EEG: the share of each band
x = eegSynth(256, 30, [10 ${n(v.alpha)}; 20 ${n(v.beta)}]);
eegBandPower(x, 256)
[~, rel] = eegBandPower(x, 256);
fprintf('= Alpha share | %.0f%%\\n', 100*rel(3))
fprintf('= Beta share | %.0f%%\\n', 100*rel(4))
` : `% An ECG: beats found by Pan and Tompkins, and the heart rate's variability
rng(7); fs = 360;
x = ecgSynth(fs, 60, ${n(v.hr)}, 'Noise', ${n(v.noise)}, 'Wander', ${n(v.wander)});
[idx, beats, rr] = panTompkins(x, fs);
${v.show === 'monitor' ? `patientMonitor(x, fs, 'SpO2', ${n(v.spo2)}, 'Resp', ${n(v.resp)})` : "plot(beats(2:end), 60./rr, '.-'); xlabel('Time (s)'); ylabel('Beats a minute'); grid on; title('Heart rate, beat by beat')"}
h = hrvMetrics(rr);
fprintf('= Beats found | %d in the minute, %.0f a minute on average\\n', numel(beats), h.HeartRate)
fprintf('= Variability | SDNN %.0f ms, RMSSD %.0f ms\\n', h.SDNN, h.RMSSD)
`,
  },
  {
    id: 'ct', title: 'Medical imaging', blurb: 'A made-up head CT: look through the usual windows, move through the slices, measure what is bright.', note: 'For learning, not diagnosis.',
    fields: [
      menu('show', 'Show', [['window', 'One slice through a window'], ['ortho', 'Three planes'], ['measure', 'Measure a range of values']]),
      num('slice', 'Slice', 1, 40, 1, 26),
      menu('win', 'Window', [['brain', 'Brain'], ['subdural', 'Subdural'], ['stroke', 'Stroke'], ['bone', 'Bone'], ['lung', 'Lung'], ['soft', 'Soft tissue']], 'brain', is('show', 'window', 'ortho')),
      num('lo', 'From', -1000, 3000, 10, 60, 'HU', is('show', 'measure')),
      num('hi', 'To', -1000, 3000, 10, 90, 'HU', is('show', 'measure')),
    ],
    script: (v) => `% A made-up head CT in Hounsfield units (for learning, not diagnosis)
[V, sp] = headPhantom(128, 40);
${v.show === 'window' ? `ctWindow(V(:, :, ${n(v.slice)}), '${v.win}'); title('Slice ${n(v.slice)}, ${v.win} window')`
    : v.show === 'ortho' ? `orthoSlices(V, [64 64 ${n(v.slice)}], sp, 'Window', '${v.win}')`
      : `[mask, mL] = segmentHU(V, [${n(v.lo)} ${Math.max(Number(v.lo), Number(v.hi))}], 'Spacing', sp);
s = ctWindow(V(:, :, ${n(v.slice)}), 'brain'); m = mask(:, :, ${n(v.slice)});
imshow(cat(3, max(s, m), s.*~m, s.*~m)); title('Slice ${n(v.slice)}: the measured part in red')
fprintf('= Volume | %.2f mL (%d voxels)\\n', mL, nnz(mask))`}
fprintf('= Slice ${n(v.slice)} | %.1f mm from the first\\n', (${n(v.slice)} - 1)*sp(3))
fprintf('= Pixel size | %.2f × %.2f mm, slices %.1f mm apart\\n', sp(1), sp(2), sp(3))
`,
  },
  {
    id: 'pricing', title: 'Option and bond pricing', blurb: 'Black–Scholes prices and Greeks, an American put on a tree, a bond’s price and duration.', note: 'A teaching model, not investment advice.',
    fields: [
      menu('show', 'Show', [['price', 'Option price against the spot'], ['delta', 'Delta against the spot'], ['bond', 'A bond against its yield']]),
      num('s', 'Spot', 1, 500, 1, 100, '', is('show', 'price', 'delta')),
      num('k', 'Strike', 1, 500, 1, 105, '', is('show', 'price', 'delta')),
      num('r', 'Interest rate', 0, 20, 0.1, 4, '%', is('show', 'price', 'delta')),
      num('t', 'Time to expiry', 0.02, 5, 0.01, 0.5, 'years', is('show', 'price', 'delta')),
      num('sigma', 'Volatility', 1, 150, 1, 25, '%', is('show', 'price', 'delta')),
      num('q', 'Dividend yield', 0, 15, 0.1, 0, '%', is('show', 'price', 'delta')),
      num('coupon', 'Coupon', 0, 20, 0.25, 5, '%', is('show', 'bond')),
      num('years', 'Years to maturity', 1, 50, 1, 10, '', is('show', 'bond')),
      num('yield', 'Yield', 0.1, 20, 0.1, 6, '%', is('show', 'bond')),
    ],
    script: (v) => v.show === 'bond' ? `% A bond: price, duration and convexity
y = linspace(0.002, max(0.2, ${Number(v.yield) / 100}*2), 80);
P = arrayfun(@(x) bondPrice(100, ${Number(v.coupon) / 100}, ${n(v.years)}, x), y);
plot(100*y, P, 'LineWidth', 2); grid on; xlabel('Yield (%)'); ylabel('Price (per 100)')
hold on; plot(${n(v.yield)}, bondPrice(100, ${Number(v.coupon) / 100}, ${n(v.years)}, ${Number(v.yield) / 100}), 'o'); hold off
[mac, md, cv] = bondDuration(100, ${Number(v.coupon) / 100}, ${n(v.years)}, ${Number(v.yield) / 100});
fprintf('= Price | %.2f per 100\\n', bondPrice(100, ${Number(v.coupon) / 100}, ${n(v.years)}, ${Number(v.yield) / 100}))
fprintf('= Duration | %.2f years (modified %.2f)\\n', mac, md)
fprintf('= If the yield rises 1%% | about %.1f%% less\\n', md - cv/200)
` : `% Black-Scholes (a teaching model, not investment advice)
S = ${n(v.s)}; K = ${n(v.k)}; r = ${Number(v.r) / 100}; T = ${n(v.t)}; sigma = ${Number(v.sigma) / 100}; q = ${Number(v.q) / 100};
spot = linspace(0.4*K, 1.6*K, 120);
${v.show === 'delta' ? `[dc, dp] = blsdelta(spot, K, r, T, sigma, q);
plot(spot, dc, spot, dp, 'LineWidth', 2); legend('Call delta', 'Put delta'); xlabel('Spot'); grid on`
    : `[cs, ps] = blsprice(spot, K, r, T, sigma, q);
plot(spot, cs, spot, ps, spot, max(spot - K, 0), ':', 'LineWidth', 2); legend('Call', 'Put', 'Call at expiry'); xlabel('Spot'); ylabel('Price'); grid on`}
[c, p] = blsprice(S, K, r, T, sigma, q); [dc, dp] = blsdelta(S, K, r, T, sigma, q);
[~, tree] = binprice(S, K, r, T, T/200, sigma, 0, q);
fprintf('= Call | %.3f (delta %.3f)\\n', c, dc)
fprintf('= Put | %.3f (delta %.3f)\\n', p, dp)
fprintf('= Gamma and vega | %.4f and %.2f\\n', blsgamma(S, K, r, T, sigma, q), blsvega(S, K, r, T, sigma, q))
fprintf('= American put (tree) | %.3f\\n', tree(1, 1))
`,
  },
  {
    id: 'portfolio', title: 'Portfolios and risk', blurb: 'Three made-up assets: the efficient frontier, the best mix, its value at risk, a trend rule and a carbon price.', note: 'A teaching model, not investment advice.',
    fields: [
      menu('show', 'Show', [['frontier', 'Efficient frontier'], ['var', 'Daily returns and their VaR'], ['strategy', 'A trend rule against buy and hold'], ['carbon', 'A carbon price on three holdings']]),
      num('rf', 'Risk-free rate', 0, 10, 0.1, 2, '%', is('show', 'frontier', 'var')),
      menu('conf', 'Confidence', [['0.95', '95%'], ['0.99', '99%']], '0.99', is('show', 'var')),
      menu('method', 'VaR method', [['historical', 'Historical'], ['normal', 'Normal'], ['cornishfisher', 'Cornish–Fisher']], 'historical', is('show', 'var')),
      num('fast', 'Short average', 2, 100, 1, 20, 'days', is('show', 'strategy')),
      num('slow', 'Long average', 10, 400, 5, 120, 'days', is('show', 'strategy')),
      num('cost', 'Cost a trade', 0, 1, 0.01, 0.1, '%', is('show', 'strategy')),
      menu('path', 'Carbon prices', [['fixed', 'One price from now on'], ['nzlow', 'NGFS Net Zero 2050, low end'], ['nzhigh', 'NGFS Net Zero 2050, high end']], 'fixed', is('show', 'carbon')),
      num('price', 'Carbon price', 0, 400, 5, 100, 'a tonne', (v) => v.show === 'carbon' && v.path === 'fixed'),
      num('decline', 'Emissions cut each year', 0, 15, 0.5, 0, '%', (v) => v.show === 'carbon' && v.path !== 'fixed'),
      num('pass', 'Passed on to customers', 0, 100, 5, 30, '%', is('show', 'carbon')),
    ],
    script: (v) => v.show === 'carbon' ? (v.path === 'fixed' ? `% A carbon price on three holdings (values, tonnes of CO2 a year)
vals = [4e6 3e6 3e6]; tonnes = [2000 800 100];
[loss, share, total] = carbonStress(vals, tonnes, ${n(v.price)}, 'PassThrough', ${Number(v.pass) / 100});
bar(100*share); set(gca, 'XLim', [0.5 3.5]); ylabel('Value lost (%)'); title('Carbon at ${n(v.price)} a tonne'); grid on
fprintf('= Steel maker | %.1f%% of its value\\n', 100*share(1))
fprintf('= Airline | %.1f%%\\n', 100*share(2))
fprintf('= Software firm | %.1f%%\\n', 100*share(3))
fprintf('= The whole portfolio | %.1f%%\\n', 100*total)
` : `% NGFS's Net Zero 2050 carbon price (${v.path === 'nzlow' ? 'the low' : 'the high'} end across its models), from 2026
h = ngfsHeadline;
vals = [4e6 3e6 3e6]; tonnes = [2000 800 100];
[loss, share, total] = carbonStressPath(vals, tonnes, h.Years, h.${v.path === 'nzlow' ? 'Low' : 'High'}, 'Start', 2026, 'PassThrough', ${Number(v.pass) / 100}, 'Decline', ${Number(v.decline) / 100});
subplot(1, 2, 1); plot([2026 h.Years], [0 h.${v.path === 'nzlow' ? 'Low' : 'High'}], '-o', 'LineWidth', 2); grid on; xlabel('Year'); ylabel('US$2010 a tonne'); title('The carbon price')
subplot(1, 2, 2); bar(100*share); set(gca, 'XLim', [0.5 3.5]); ylabel('Value lost (%)'); title('Lost by each holding'); grid on
fprintf('= Steel maker | %.1f%% of its value\\n', 100*share(1))
fprintf('= Airline | %.1f%%\\n', 100*share(2))
fprintf('= Software firm | %.1f%%\\n', 100*share(3))
fprintf('= The whole portfolio | %.1f%%\\n', 100*total)
fprintf('= Source | NGFS Phase V, Net Zero 2050: 100 to 260 US$2010/t in 2030, 500 to 1,250 in 2050 (licence: data.ene.iiasa.ac.at/ngfs)\\n')
`) : `% Three made-up assets: bonds, shares, emerging markets (five years of days)
rng(11)
n = 5*252; market = randn(n, 1);
R = [0.04/252 + 0.05/sqrt(252)*(0.1*market + randn(n, 1)), ...
     0.08/252 + 0.16/sqrt(252)*(0.8*market + 0.6*randn(n, 1)), ...
     0.11/252 + 0.24/sqrt(252)*(0.7*market + 0.7*randn(n, 1))];
[m, C] = ewstats(R); mA = m*252; CA = C*252;
[w, ret, risk, sharpe] = maxSharpe(mA, CA, ${Number(v.rf) / 100});
${v.show === 'frontier' ? `efficientFrontier(mA, CA, 30)
fprintf('= Best mix | %.0f%% bonds, %.0f%% shares, %.0f%% emerging\\n', 100*w)
fprintf('= Its return and risk | %.1f%% and %.1f%% a year (Sharpe %.2f)\\n', 100*ret, 100*risk, sharpe)`
    : v.show === 'var' ? `r = R*w;
[VaR, ES] = valueAtRisk(r, ${v.conf}, 'Method', '${v.method}');
histogram(100*r, 60); hold on; xline(-100*VaR, 'r--', 'VaR'); hold off; xlabel('Daily return (%)'); title('The best mix, day by day')
fprintf('= 1-day VaR on 1,000,000 | %.0f\\n', 1e6*VaR)
fprintf('= Expected shortfall | %.0f\\n', 1e6*ES)
t = varBacktest(r, VaR, ${v.conf});
fprintf('= Days beyond VaR | %d (expected %.1f): %s\\n', t.Failures, t.Expected, t.Result)`
      : `P = ret2tick(R(:, 2), 'StartPrice', 100);
b = backtestStrategy(P, ${n(v.fast)}, ${Math.max(Number(v.slow), Number(v.fast) + 1)}, 'Cost', ${Number(v.cost) / 100});
backtestStrategy(P, ${n(v.fast)}, ${Math.max(Number(v.slow), Number(v.fast) + 1)}, 'Cost', ${Number(v.cost) / 100})
fprintf('= Rule | %.1f%% a year, worst fall %.0f%%, %d trades\\n', 100*b.Strategy.CAGR, 100*b.Strategy.MaxDrawdown, b.Trades)
fprintf('= Buy and hold | %.1f%% a year, worst fall %.0f%%\\n', 100*b.BuyAndHold.CAGR, 100*b.BuyAndHold.MaxDrawdown)`}
`,
  },
  {
    id: 'teach', title: 'Maths for class', blurb: 'Tangents, areas under curves, Newton’s method and Taylor polynomials to move about in class.',
    fields: [
      menu('show', 'Show', [['tangent', 'A tangent line'], ['riemann', 'Area under a curve'], ['newton', 'Newton’s method'], ['taylor', 'Taylor polynomials']]),
      menu('f', 'Function', FUNCS, FUNCS[0][0], (v) => v.show !== 'taylor'),
      menu('g', 'Function', [['cos(x)', 'cos x'], ['sin(x)', 'sin x'], ['exp(x)', 'eˣ'], ['log(1 + x)', 'ln(1 + x)']], 'cos(x)', is('show', 'taylor')),
      num('x0', 'At x =', -3, 3, 0.05, 1, '', is('show', 'tangent', 'newton', 'taylor')),
      num('a', 'From', -3, 3, 0.1, 0, '', is('show', 'riemann')),
      num('b', 'To', -3, 3, 0.1, 2, '', is('show', 'riemann')),
      num('strips', 'Strips', 1, 100, 1, 8, '', is('show', 'riemann')),
      menu('method', 'Heights from', [['left', 'Left edge'], ['right', 'Right edge'], ['mid', 'Middle'], ['trap', 'Trapezia']], 'left', is('show', 'riemann')),
      num('steps', 'Steps', 1, 10, 1, 5, '', is('show', 'newton')),
      num('order', 'Highest order', 1, 12, 1, 6, '', is('show', 'taylor')),
    ],
    script: (v) => v.show === 'tangent' ? `tangentLine(@(t) ${v.f}, ${n(v.x0)}, [-3 3])
fprintf('= Slope at x = ${n(v.x0)} | %.4f\\n', (feval(@(t) ${v.f}, ${n(v.x0)} + 1e-6) - feval(@(t) ${v.f}, ${n(v.x0)} - 1e-6))/2e-6)
` : v.show === 'riemann' ? `[S, exact] = riemannSum(@(t) ${v.f}, ${n(v.a)}, ${Math.max(Number(v.b), Number(v.a) + 0.1)}, ${n(v.strips)}, 'Method', '${v.method}');
riemannSum(@(t) ${v.f}, ${n(v.a)}, ${Math.max(Number(v.b), Number(v.a) + 0.1)}, ${n(v.strips)}, 'Method', '${v.method}')
fprintf('= Strips add up to | %.6f\\n', S)
fprintf('= The integral | %.6f (off by %.2g)\\n', exact, abs(S - exact))
` : v.show === 'newton' ? `newtonSteps(@(t) ${v.f}, ${n(v.x0)}, ${n(v.steps)})
x = newtonSteps(@(t) ${v.f}, ${n(v.x0)}, ${n(v.steps)});
fprintf('= After ${n(v.steps)} steps | x = %.10f\\n', x(end))
fprintf('= f there | %.2g\\n', feval(@(t) ${v.f}, x(end)))
` : `syms x
taylorPlot(${v.g}, ${n(v.x0)}, [${[...new Set([1, Math.ceil(Number(v.order) / 2), Number(v.order)])].join(' ')}], [${Number(v.x0) - 4} ${Number(v.x0) + 4}])
fprintf('= Orders drawn | ${[...new Set([1, Math.ceil(Number(v.order) / 2), Number(v.order)])].join(', ')} about x = ${n(v.x0)}\\n')
`,
  },
  {
    id: 'materials', title: 'Semiconductors and materials', blurb: 'A pn junction under bias, a transistor’s curves, metals pulled apart and how long a part lasts.',
    fields: [
      menu('show', 'Show', [['junction', 'A pn junction'], ['mosfet', 'A MOSFET’s curves'], ['tensile', 'Metals pulled apart'], ['fatigue', 'Fatigue life']]),
      num('na', 'p-side doping', 14, 19, 0.1, 17, 'log₁₀ cm⁻³', is('show', 'junction', 'mosfet')),
      num('nd', 'n-side doping', 14, 19, 0.1, 16, 'log₁₀ cm⁻³', is('show', 'junction')),
      num('bias', 'Bias', -10, 0.7, 0.05, 0, 'V', is('show', 'junction')),
      num('tox', 'Oxide thickness', 1, 50, 0.5, 10, 'nm', is('show', 'mosfet')),
      menu('metal', 'Metal', [['steel', 'Steel'], ['aluminium', 'Aluminium'], ['titanium', 'Titanium'], ['copper', 'Copper']], 'steel', is('show', 'tensile', 'fatigue')),
      num('amp', 'Stress amplitude', 10, 800, 5, 250, 'MPa', is('show', 'fatigue')),
      num('mean', 'Mean stress', -200, 400, 5, 0, 'MPa', is('show', 'fatigue')),
    ],
    script: (v) => v.show === 'junction' ? `% A silicon pn junction (depletion approximation)
j = pnJunction(1e${n(v.na)}, 1e${n(v.nd)}, 'V', ${n(v.bias)});
pnJunction(1e${n(v.na)}, 1e${n(v.nd)}, 'V', ${n(v.bias)})
fprintf('= Built-in potential | %.3f V\\n', j.Vbi)
fprintf('= Depletion width | %.3f µm\\n', j.W*1e4)
fprintf('= Peak field | %.3g V/cm\\n', j.Emax)
` : v.show === 'mosfet' ? `% An n-MOSFET from its doping and oxide
Vth = mosfetVth(1e${n(v.na)}, ${n(v.tox)});
mosfetIV(Vth + [0.5 1 1.5 2], linspace(0, 3, 100), 'Vth', Vth)
fprintf('= Threshold voltage | %.2f V\\n', Vth)
` : v.show === 'tensile' ? `% A tensile test
materialCurve('${v.metal}')
[e, s] = materialCurve('${v.metal}');
t = tensileTest(e, s);
fprintf('= Stiffness E | %.0f GPa\\n', t.E/1000)
fprintf('= Yield (0.2%% offset) | %.0f MPa\\n', t.Yield)
fprintf('= Strength | %.0f MPa, stretching %.0f%% before it breaks\\n', t.UTS, 100*t.Elongation)
` : `% Fatigue: cycles to failure (Basquin, Goodman for the mean)
amps = linspace(0.2, 1.5, 60)*${n(v.amp)};
N = arrayfun(@(a) fatigueLife(a, '${v.metal}', 'Mean', ${n(v.mean)}), amps);
loglog(N, amps, 'LineWidth', 2); grid on; xlabel('Cycles to failure'); ylabel('Stress amplitude (MPa)')
hold on; plot(fatigueLife(${n(v.amp)}, '${v.metal}', 'Mean', ${n(v.mean)}), ${n(v.amp)}, 'o'); hold off
fprintf('= Life at %g MPa | %.3g cycles\\n', ${n(v.amp)}, fatigueLife(${n(v.amp)}, '${v.metal}', 'Mean', ${n(v.mean)}))
`,
  },
  {
    id: 'agri', title: 'Farms and power', blurb: 'Water for a crop and when to irrigate, the cost of solar power, and power stations sharing a load.',
    fields: [
      menu('show', 'Show', [['water', 'Irrigation for a crop'], ['dispatch', 'Power stations sharing a load'], ['lcoe', 'The cost of solar power']]),
      num('lat', 'Latitude', -60, 60, 0.1, 30.9, '°', is('show', 'water')),
      num('tmin', 'Night temperature', -5, 35, 0.5, 24, '°C', is('show', 'water')),
      num('raindays', 'Rainy days', 0, 40, 1, 6, '%', is('show', 'water')),
      num('taw', 'Water the roots can reach', 40, 250, 5, 140, 'mm', is('show', 'water')),
      num('p', 'Dry before stress', 0.2, 0.8, 0.05, 0.55, 'share', is('show', 'water')),
      num('demand', 'Demand', 300, 1200, 10, 850, 'MW', is('show', 'dispatch')),
      num('capex', 'Building cost', 1e5, 5e6, 1e4, 8e5, '', is('show', 'lcoe')),
      num('opex', 'Yearly upkeep', 0, 2e5, 1e3, 1.5e4, '', is('show', 'lcoe')),
      num('energy', 'Energy a year', 1e5, 1e7, 1e4, 1.6e6, 'kWh', is('show', 'lcoe')),
      num('rate', 'Discount rate', 0, 15, 0.5, 7, '%', is('show', 'lcoe')),
      num('life', 'Lifetime', 5, 40, 1, 25, 'years', is('show', 'lcoe')),
    ],
    script: (v) => v.show === 'water' ? `% FAO-56: evapotranspiration, the root zone's water and when to irrigate (maize, 120 days)
rng(8); days = 120;
Tmin = ${n(v.tmin)} + 3*randn(1, days); Tmax = Tmin + 10 + 2*rand(1, days);
ET0 = et0PM(Tmin, Tmax, 55, 2, NaN, 230, ${n(v.lat)}, 120 + (1:days), 'Sunshine', 9);
kc = kcCurve([0.3 1.2 0.5], [20 35 40 25]);
rain = 25*(rand(1, days) < ${Number(v.raindays) / 100});
w = soilWaterBalance(ET0, rain, kc, 'TAW', ${n(v.taw)}, 'p', ${n(v.p)});
soilWaterBalance(ET0, rain, kc, 'TAW', ${n(v.taw)}, 'p', ${n(v.p)})
dry = soilWaterBalance(ET0, rain, kc, 'TAW', ${n(v.taw)}, 'p', ${n(v.p)}, 'Irrigate', false);
g1 = cropGrowth(Tmin, Tmax, 22*ones(1, days)); g0 = cropGrowth(Tmin, Tmax, 22*ones(1, days), 'Ks', dry.Ks);
fprintf('= ET0 | %.1f mm a day on average\\n', mean(ET0))
fprintf('= Irrigations | %d, %.0f mm in all\\n', w.Events, w.TotalIrrigation)
fprintf('= Yield | %.1f t/ha irrigated, %.1f t/ha on rain alone\\n', g1.Yield, g0.Yield)
` : v.show === 'dispatch' ? `% Three power stations sharing a load at the least cost
b = [7.92 7.85 7.97]; c = [0.001562 0.00194 0.00482]; lo = [150 100 50]; hi = [600 400 200];
d = 300:10:1200;
Pd = economicDispatch(b, c, lo, hi, d);
area(d, Pd); legend('Unit 1', 'Unit 2', 'Unit 3'); xlabel('Demand (MW)'); ylabel('Output (MW)'); grid on
hold on; xline(${n(v.demand)}, 'k--'); hold off
[P, lambda] = economicDispatch(b, c, lo, hi, ${n(v.demand)});
if isempty(P) || any(isnan(P)), fprintf('= At ${n(v.demand)} MW | outside what the three can make (300 to 1200 MW)\\n')
else, fprintf('= At ${n(v.demand)} MW | %.0f, %.0f and %.0f MW\\n', P), fprintf('= Cost of the next MWh | %.3f\\n', lambda), end
` : `% The levelised cost of energy (with panels wearing 0.5% a year)
rates = linspace(0, 15, 61)/100;
c = arrayfun(@(r) lcoe(${n(v.capex)}, ${n(v.opex)}, ${n(v.energy)}, r, ${n(v.life)}, 'Degradation', 0.005), rates);
plot(100*rates, c, 'LineWidth', 2); grid on; xlabel('Discount rate (%)'); ylabel('Cost a kWh')
hold on; plot(${n(v.rate)}, lcoe(${n(v.capex)}, ${n(v.opex)}, ${n(v.energy)}, ${Number(v.rate) / 100}, ${n(v.life)}, 'Degradation', 0.005), 'o'); hold off
fprintf('= Cost a kWh | %.4f\\n', lcoe(${n(v.capex)}, ${n(v.opex)}, ${n(v.energy)}, ${Number(v.rate) / 100}, ${n(v.life)}, 'Degradation', 0.005))
`,
  },
];
