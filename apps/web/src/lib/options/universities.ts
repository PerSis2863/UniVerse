// The world list of universities (the file is cached for a year: change its name, e.g. v2, when
// its contents change).
// The world list of universities (~10,000 in 200 countries), from the MIT-licensed
// Hipo university-domains-list (https://github.com/Hipo/university-domains-list).
// Served as a static file (no Worker request) and fetched only when a field needs it; the
// promise is kept so every field on the page shares one download.

import type { ComboOption } from '@/components/ui/Combobox';

let loading: Promise<ComboOption[]> | null = null;

/** Short names people type for well-known universities. */
const KNOWN_AS: Record<string, string> = {
  'Massachusetts Institute of Technology': 'mit',
  'University of California, Los Angeles (UCLA)': 'ucla',
  'University of California, Berkeley': 'berkeley ucb',
  'New York University': 'nyu',
  'London School of Economics and Political Science, University of London': 'lse',
  'University College London, University of London': 'ucl',
  "King's College London, University of London": 'kcl',
  'Imperial College London': 'imperial icl',
  'ETHZ - ETH Zurich': 'eth ethz',
  'EPFL - EPF Lausanne': 'epfl',
  'California Institute of Technology': 'caltech',
  'Carnegie Mellon University': 'cmu',
  'University of Southern California': 'usc',
  'Georgia Institute of Technology': 'gatech georgia tech',
  'Virginia Tech': 'vt',
  'Indian Institute of Science': 'iisc',
  'University of Delhi': 'du delhi university',
  'Jawaharlal Nehru University': 'jnu',
  'Birla Institute of Technology and Science': 'bits pilani',
  'Indian Institute of Technology, Bombay': 'iitb',
  'Indian Institute of Technology, Delhi': 'iitd',
  "Institut d'Etudes Politiques de Paris (Sciences Po)": 'sciencespo sciences-po',
  'École des Hautes Études Commerciales (HEC Business School)': 'hec',
  'ESSEC Business School': 'essec',
  'ESCP Business School': 'escp',
  'École Polytechnique': 'polytechnique x',
  'Ecole Normale Supérieure de Paris': 'ens ulm',
  'Université PSL (Paris Sciences & Lettres)': 'psl',
  'National University of Singapore': 'nus',
  'Nanyang Technological University': 'ntu',
  'The University of Hong Kong': 'hku',
  'The Hong Kong University of Science and Technology': 'hkust',
  'Technische Universität München': 'tum',
  'Ludwig-Maximilians-Universität München': 'lmu',
  'Universidad Nacional Autónoma de México': 'unam',
  'Universidade de São Paulo': 'usp',
  'Korea Advanced Institute of Science & Technology': 'kaist',
  'Royal Melbourne Institute of Technology': 'rmit',
  'Rochester Institute of Technology': 'rit',
  'University of Toronto': 'uoft',
  'Delft University of Technology': 'tu delft tudelft',
};

const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

export function loadUniversities(): Promise<ComboOption[]> {
  if (!loading) {
    loading = fetch('/data/universities.v1.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<[string, string][]>;
      })
      .then((rows) => {
        let names: Intl.DisplayNames | null = null;
        try { names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); } catch { /* old browser */ }
        const country = (cc: string) => { try { return names?.of(cc) ?? cc; } catch { return cc; } };
        return rows.map(([label, cc]) => ({ label, hint: country(cc), icon: flag(cc), group: cc, keywords: KNOWN_AS[label] }));
      })
      .catch((e) => {
        loading = null; // let the next focus retry
        throw e;
      });
  }
  return loading;
}

/** The visitor's likely country (from the browser language, e.g. fr-FR → FR), to rank local results first. */
export function homeCountry(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = /-([A-Z]{2})\b/i.exec(l);
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}
