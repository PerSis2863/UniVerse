import { CATEGORIES, isPeriod } from './carbon-ledger';

// Green → Business → Ledger's spreadsheet import (M270): a CSV read in the browser, its columns matched by name, each
// line's description sorted into a category by keywords and its date read as a month. Nothing is saved until a
// person has checked the lines.

/** Splits CSV text into rows (quotes, commas inside quotes, \r\n). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((c) => c.trim())) out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) out.push(row);
  return out;
}
const WORDS: [RegExp, string][] = [
  [/renewable|green tariff|solar/i, 'electricity-green'], [/electric|power|kwh|grid/i, 'electricity'], [/diesel/i, 'diesel'], [/petrol|gasoline/i, 'petrol'],
  [/lpg|propane/i, 'lpg'], [/natural gas|\bgas\b/i, 'gas'], [/heating oil|kerosene/i, 'heating-oil'], [/domestic.*fl|fl.*domestic/i, 'flight-domestic'],
  [/long.?haul/i, 'flight-long'], [/flight|air ?fare|airline/i, 'flight-short'], [/train|rail/i, 'rail'], [/taxi|cab|uber|ola|mileage/i, 'taxi'],
  [/hotel|accommodation|lodging/i, 'hotel'], [/courier|freight|shipping|lorry|truck/i, 'freight-road'], [/landfill|waste/i, 'waste-landfill'],
  [/recycl/i, 'waste-recycled'], [/water/i, 'water'], [/laptop|computer|hardware|electronics|\bit\b/i, 'buy-it'], [/stationery|office|furniture/i, 'buy-office'],
  [/food|catering|meal|canteen/i, 'buy-food'], [/cloud|software|saas|aws|azure/i, 'buy-cloud'], [/consult|legal|accounting|audit|services/i, 'buy-services'],
  [/material|steel|cotton|fabric|parts|raw/i, 'buy-materials'],
];
export const guessCategory = (s: string) => CATEGORIES.find((c) => c.id === s.trim().toLowerCase() || c.label.toLowerCase() === s.trim().toLowerCase())?.id ?? WORDS.find(([re]) => re.test(s))?.[1] ?? null;
/** "2026-03", "03/2026", "Mar 2026", "2026-03-31" → "2026-03". */
export function guessPeriod(s: string, year: number): string | null {
  const t = s.trim();
  if (!t) return `${year}-12`; // no date: the year's line
  let m = t.match(/^(\d{4})[-/.](\d{1,2})/); if (m) { const p = `${m[1]}-${m[2].padStart(2, '0')}`; return isPeriod(p) ? p : null; }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m) { const p = `${m[3]}-${m[2].padStart(2, '0')}`; return isPeriod(p) ? p : null; }
  m = t.match(/^(\d{1,2})[-/.](\d{4})$/); if (m) { const p = `${m[2]}-${m[1].padStart(2, '0')}`; return isPeriod(p) ? p : null; }
  const d = Date.parse(`1 ${t}`); if (!Number.isNaN(d)) { const p = new Date(d).toISOString().slice(0, 7); return isPeriod(p) ? p : null; }
  return null;
}
/** A number from a cell ("1,234.5 kWh" → 1234.5); null when there's none. */
export const num = (s: string) => { const n = Number(s.replace(/[^\d.-]/g, '')); return Number.isFinite(n) && s.trim() !== '' ? n : null; };
