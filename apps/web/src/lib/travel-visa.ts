import { plain } from './travel-guide';

// Visas for a passport (M205): Wikipedia's "Visa requirements for X citizens" tables (CC BY-SA 4.0,
// credited and linked), one row per destination. Pure: src/server/travel.ts fetches the article and
// keeps what this reads for 30 days. Rules change: the app says to check before booking.

export type VisaStatus = 'free' | 'none' | 'eta' | 'evisa' | 'arrival' | 'required' | 'permit' | 'refused';
export interface VisaRule { s: VisaStatus; d?: string }

/** What each status means, and how it counts when ranking places (easier is higher). */
export const VISA: Record<VisaStatus, { words: string; score: number }> = {
  free: { words: 'Free to go and live', score: 2 },
  none: { words: 'No visa needed', score: 2 },
  eta: { words: 'Online travel permit (ETA)', score: 1.5 },
  evisa: { words: 'eVisa online', score: 1 },
  arrival: { words: 'Visa on arrival', score: 1 },
  required: { words: 'Visa needed before you go', score: -2 },
  permit: { words: 'Special permit needed', score: -3 },
  refused: { words: 'Entry refused', score: -9 },
};

const ETA = /\b(e-?ta|esta|k-eta|eta|electronic travel authori[sz]ation|travel authori[sz]ation|nzeta)\b/i;

function statusOf(kind: string, label: string): VisaStatus | null {
  switch (kind) {
    case 'free': return 'free';
    case 'yes': return ETA.test(label) ? 'eta' : 'none';
    case 'yes2': return /arrival/i.test(label) && !/e-?visa|online/i.test(label) ? 'arrival' : ETA.test(label) ? 'eta' : 'evisa';
    case 'yes-no': return 'arrival';
    case 'optional': return /e-?visa|online/i.test(label) ? 'evisa' : 'arrival';
    case 'no': return 'required';
    case 'no2': return /refus|not allowed|banned|denied|prohibit/i.test(label) ? 'refused' : 'permit';
    default: return null;
  }
}

/** Every country's English name to its code (for rows without a Timatic code), with older names too. */
let NAMES: Map<string, string> | null = null;
function codeOf(name: string): string | undefined {
  if (!NAMES) {
    NAMES = new Map();
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b), n = dn.of(code);
      if (n && n !== code) NAMES.set(n.toLowerCase(), code);
    }
    for (const [n, c] of Object.entries({ turkey: 'TR', 'czech republic': 'CZ', 'ivory coast': 'CI', 'republic of the congo': 'CG', 'democratic republic of the congo': 'CD', 'the gambia': 'GM', 'vatican city': 'VA', 'east timor': 'TL', burma: 'MM', macau: 'MO', 'cape verde': 'CV', 'north korea': 'KP', 'south korea': 'KR', 'federated states of micronesia': 'FM', palestine: 'PS', kosovo: 'XK', 'the bahamas': 'BS', swaziland: 'SZ', 'hong kong': 'HK', macao: 'MO' })) NAMES.set(n, c);
  }
  return NAMES.get(name.trim().toLowerCase());
}

/** The table's rows: each destination's status and how long you may stay ("90 days"). */
export function readVisas(wiki: string): Record<string, VisaRule> {
  const out: Record<string, VisaRule> = {};
  for (const row of wiki.split(/\n\|-/)) {
    const lines = row.split('\n');
    const at = lines.findIndex((l) => /^\|.*\{\{\s*(?:flag|flagcountry|flagu)\s*\|/i.test(l));
    if (at < 0) continue;
    const flag = /\{\{\s*(?:flag|flagcountry|flagu)\s*\|([^}|]+)/i.exec(lines[at])![1];
    const si = lines.findIndex((l, i) => i > at && /^\|/.test(l) && /\{\{\s*(free|yes|yes2|yes-no|optional|no|no2)\s*\|/i.test(l));
    if (si < 0) continue;
    const [, kind, label] = /\{\{\s*(free|yes|yes2|yes-no|optional|no|no2)\s*\|([^}]*)\}\}/i.exec(lines[si]) ?? [];
    const s = kind ? statusOf(kind.toLowerCase(), label ?? '') : null;
    const code = /destination\s*=\s*([A-Z]{2})\b/.exec(row)?.[1] ?? codeOf(flag);
    if (!s || !code || out[code]) continue;
    // How long: the next cell, and the bullet lines under it.
    let stay = '';
    for (let i = si + 1, cells = 0; i < lines.length; i++) {
      if (/^\|/.test(lines[i])) { if (++cells > 1) break; stay += ` ${lines[i].slice(1)}`; } else if (cells === 1 && /^\*/.test(lines[i])) stay += ` ${lines[i]}`;
    }
    const d = /\b(\d{1,3})\s*(days?|weeks?|months?|years?)\b/i.exec(plain(stay.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')));
    out[code] = d ? { s, d: `${d[1]} ${d[2].toLowerCase()}` } : { s };
  }
  return out;
}
