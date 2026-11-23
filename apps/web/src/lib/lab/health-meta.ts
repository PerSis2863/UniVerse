// Hyperion Learn → Machine health (M465): the features' names and the matching script, with no imports, so the page
// can show them without loading the language (health.ts and its worker do the computing).

export interface FeatureDef { id: string; name: string; group: 'Time' | 'Frequency'; needs?: 'speed' | 'bearing' }
export const FEATURES: FeatureDef[] = [
  { id: 'rms', name: 'RMS', group: 'Time' }, { id: 'std', name: 'Standard deviation', group: 'Time' }, { id: 'mean', name: 'Mean', group: 'Time' },
  { id: 'peak', name: 'Peak', group: 'Time' }, { id: 'p2p', name: 'Peak to peak', group: 'Time' }, { id: 'crest', name: 'Crest factor', group: 'Time' },
  { id: 'kurt', name: 'Kurtosis', group: 'Time' }, { id: 'skew', name: 'Skewness', group: 'Time' }, { id: 'shape', name: 'Shape factor', group: 'Time' },
  { id: 'impulse', name: 'Impulse factor', group: 'Time' }, { id: 'clearance', name: 'Clearance factor', group: 'Time' },
  { id: 'centroid', name: 'Spectral centroid', group: 'Frequency' }, { id: 'dominant', name: 'Dominant frequency', group: 'Frequency' },
  { id: 'a1', name: '1× speed amplitude', group: 'Frequency', needs: 'speed' }, { id: 'a2', name: '2× speed amplitude', group: 'Frequency', needs: 'speed' },
  { id: 'a3', name: '3× speed amplitude', group: 'Frequency', needs: 'speed' }, { id: 'bpfo', name: 'Envelope at BPFO (outer race)', group: 'Frequency', needs: 'bearing' },
  { id: 'bpfi', name: 'Envelope at BPFI (inner race)', group: 'Frequency', needs: 'bearing' }, { id: 'skmax', name: 'Spectral kurtosis, highest', group: 'Frequency' },
];

/** The same work as a Hyperion script: a small fleet made in the language, its features, their ranking and a remaining-life prediction. */
export function healthScript(feature: string, kind: 'life' | 'faults'): string {
  const f = FEATURES.find((d) => d.id === feature)?.name ?? 'RMS';
  const expr: Record<string, string> = { rms: 'rms(x)', kurt: 'kurtosis(x)', p2p: 'peak2peak(x)', crest: 'peak2rms(x)', std: 'std(x)', peak: 'max(abs(x))', skew: 'skewness(x)' };
  const e = expr[feature] ?? 'rms(x)';
  if (kind === 'faults') {
    return `% Machine health: telling a pump's faults apart by ${f}\nrng(1); fs = 10000; t = (0:4095)'/fs;\nkinds = {'Healthy', 'Imbalance', 'Misalignment'};\nF = []; g = [];\nfor c = 1:3\n  for i = 1:20\n    a1 = 0.5 + (c == 2)*1.2; a2 = 0.15 + (c == 3)*0.9;\n    x = a1*sin(2*pi*25*t) + a2*sin(2*pi*50*t) + 0.3*randn(size(t));\n    F(end + 1, :) = [rms(x), kurtosis(x), peak2peak(x)];\n    g(end + 1) = c;\n  end\nend\nboxplot(F(:, 1), g); title('RMS by kind of fault')\n% Learn → Classify can train models on these features: save them with writematrix(F, 'features.csv')\n`;
  }
  return `% Machine health: when will this bearing fail? (${f}, as in Learn → Machine health)\nrng(1); fs = 10000; n = 4096; t = (0:n-1)'/fs;\nbpfo = 89.6;                                 % the outer race's defect frequency at 25 Hz\nlives = {};\nfor m = 1:6\n  life = 36 + randi(24); a0 = 0.02; b = log(1.4/a0)/life;\n  days = 0:2:life; y = zeros(size(days));\n  for d = 1:numel(days)\n    x = 0.5*sin(2*pi*25*t) + 0.3*randn(n, 1);\n    ring = exp(-(0:89)'/15).*sin(2*pi*3000*(0:89)'/fs);\n    for s = round((rand/bpfo:1/bpfo:n/fs - 0.01)*fs) + 1\n      x(s:s+89) = x(s:s+89) + a0*exp(b*days(d))*ring;\n    end\n    y(d) = ${e};\n  end\n  lives{m} = [days' y'];\nend\nmonotonicity(cellfun(@(h) h(:, 2), lives, 'UniformOutput', false))\nfor m = 1:6, plot(lives{m}(:, 1), lives{m}(:, 2)); hold on; end; hold off\nxlabel('Day'); ylabel('${f}'); title('${f} over each bearing''s life')\nlow = min(cellfun(@(h) min(h(:, 2)), lives));\nmdl = fit(exponentialDegradationModel('Phi', low*0.95), lives(1:5));\nlast = lives{6}; seen = last(1:ceil(end/2), :);\nlimit = mean(cellfun(@(h) h(end, 2), lives(1:5)));\npredictRUL(mdl, seen, limit)\nfprintf('It really had %d days left\\n', last(end, 1) - seen(end, 1))\n`;
}
