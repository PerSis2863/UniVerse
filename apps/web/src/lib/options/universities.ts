// The world list of universities (~10,000 in 200 countries), from the MIT-licensed
// Hipo university-domains-list (https://github.com/Hipo/university-domains-list).
// Served as a static file (no Worker request) and fetched only when a field needs it; the
// promise is kept so every field on the page shares one download.

import type { ComboOption } from '@/components/ui/Combobox';

let loading: Promise<ComboOption[]> | null = null;

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
        return rows.map(([label, cc]) => ({ label, hint: country(cc), icon: flag(cc), group: cc }));
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
