// The EU Digital Product Passport for UniVerse Trace (M108; the owner's seven ideas: "the EU Digital
// Product Passport for Trace (GS1 codes, supplier portal)"). Shared by the server and the pages: what a
// passport holds (after the Ecodesign for Sustainable Products Regulation, 2024/1781: identity, the
// maker, materials and their origin, substances of concern, footprint, recycled content, durability,
// repair, care, end of life, documents), how it's cleaned before saving, how complete it is, GTINs
// with their check digit, and GS1 Digital Link addresses (/01/<GTIN>/21/<serial>), so one printed QR
// code works for a shop's till and for anyone's phone.

export interface DppMaterial { name: string; percent: number | null; recycled: number | null; origin: string | null; supplier: string | null }
export interface DppSubstance { name: string; cas: string | null; percent: number | null }
export interface DppDocument { title: string; url: string }
export interface Dpp {
  madeIn: string | null;
  manufacturer: { name: string | null; address: string | null; website: string | null };
  materials: DppMaterial[];
  substances: DppSubstance[];
  /** kg CO₂e for one unit, cradle to gate, and how it was worked out (e.g. ISO 14067, PEF). */
  carbonKg: number | null;
  carbonMethod: string | null;
  /** Percentages of the whole product. */
  recycledContent: number | null;
  recyclable: number | null;
  durabilityYears: number | null;
  /** 0 to 10, like the French repairability index. */
  repairScore: number | null;
  spareYears: number | null;
  care: string | null;
  repair: string | null;
  endOfLife: string | null;
  certifications: string[];
  documents: DppDocument[];
}

export const EMPTY_DPP: Dpp = {
  madeIn: null, manufacturer: { name: null, address: null, website: null }, materials: [], substances: [], carbonKg: null, carbonMethod: null,
  recycledContent: null, recyclable: null, durabilityYears: null, repairScore: null, spareYears: null, care: null, repair: null, endOfLife: null,
  certifications: [], documents: [],
};

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
const para = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const number = (v: unknown, min: number, max: number, places = 2) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10 ** places) / 10 ** places : null;
};
/** Only https links, so a passport never links to a script or a plain-text page. */
export const httpsLink = (v: unknown) => { const s = text(v, 500); try { return s && new URL(s).protocol === 'https:' ? s : null; } catch { return null; } };
/** Two capital letters (ISO 3166-1, "ES"), or the place as written ("Jaén, Spain"). */
const place = (v: unknown) => text(v, 80);
const list = <T,>(v: unknown, max: number, one: (x: unknown) => T | null) => (Array.isArray(v) ? v.slice(0, max).map(one).filter((x): x is T => x !== null) : []);

/** A passport as sent by a brand (or merged from a supplier), cleaned: every field checked and bounded. */
export function parseDpp(raw: unknown): Dpp {
  const r = obj(raw), m = obj(r.manufacturer);
  return {
    madeIn: place(r.madeIn),
    manufacturer: { name: text(m.name, 120), address: text(m.address, 240), website: httpsLink(m.website) },
    materials: list(r.materials, 30, (x) => { const o = obj(x); const name = text(o.name, 80); return name ? { name, percent: number(o.percent, 0, 100, 1), recycled: number(o.recycled, 0, 100, 1), origin: place(o.origin), supplier: text(o.supplier, 120) } : null; }),
    substances: list(r.substances, 30, (x) => { const o = obj(x); const name = text(o.name, 120); const cas = text(o.cas, 20); return name ? { name, cas: cas && /^\d{2,7}-\d{2}-\d$/.test(cas) ? cas : null, percent: number(o.percent, 0, 100, 3) } : null; }),
    carbonKg: number(r.carbonKg, 0, 1_000_000, 3),
    carbonMethod: text(r.carbonMethod, 60),
    recycledContent: number(r.recycledContent, 0, 100, 1),
    recyclable: number(r.recyclable, 0, 100, 1),
    durabilityYears: number(r.durabilityYears, 0, 100, 1),
    repairScore: number(r.repairScore, 0, 10, 1),
    spareYears: number(r.spareYears, 0, 50, 1),
    care: para(r.care, 1500),
    repair: para(r.repair, 1500),
    endOfLife: para(r.endOfLife, 1500),
    certifications: list(r.certifications, 20, (x) => text(x, 60)),
    documents: list(r.documents, 20, (x) => { const o = obj(x); const title = text(o.title, 120), url = httpsLink(o.url); return title && url ? { title, url } : null; }),
  };
}

/** A stored passport (JSON text), or the empty one. */
export function readDpp(json: string | null | undefined): Dpp {
  if (!json) return EMPTY_DPP;
  try { return parseDpp(JSON.parse(json)); } catch { return EMPTY_DPP; }
}

/** The parts a passport needs, in the order a brand fills them in (the console's checklist). */
export const DPP_PARTS: { id: string; label: string; done: (d: Dpp, gtin: string | null) => boolean }[] = [
  { id: 'gtin', label: 'Product number (GTIN)', done: (_d, g) => !!g },
  { id: 'maker', label: 'Who makes it, and where', done: (d) => !!d.manufacturer.name && !!d.madeIn },
  { id: 'materials', label: 'Materials and where they come from', done: (d) => d.materials.length > 0 && d.materials.every((m) => !!m.origin) },
  { id: 'substances', label: 'Substances of concern (or none)', done: (d) => d.substances.length > 0 || d.certifications.some((c) => /no substances of concern|reach compliant/i.test(c)) },
  { id: 'carbon', label: 'Carbon footprint', done: (d) => d.carbonKg !== null },
  { id: 'recycled', label: 'Recycled content and recyclability', done: (d) => d.recycledContent !== null && d.recyclable !== null },
  { id: 'durability', label: 'How long it lasts, and repair', done: (d) => d.durabilityYears !== null && (d.repairScore !== null || !!d.repair) },
  { id: 'care', label: 'Care and use', done: (d) => !!d.care },
  { id: 'end', label: 'End of life: recycling or taking it back', done: (d) => !!d.endOfLife },
  { id: 'docs', label: 'Declaration of conformity or certificates', done: (d) => d.documents.length > 0 },
];

/** How complete a passport is: parts done, of how many, and the first ones still missing. */
export function dppScore(d: Dpp, gtin: string | null) {
  const missing = DPP_PARTS.filter((p) => !p.done(d, gtin));
  return { done: DPP_PARTS.length - missing.length, of: DPP_PARTS.length, missing: missing.map((p) => p.label) };
}

/** Whether a passport has anything worth showing to the public. */
export const hasDpp = (d: Dpp) => JSON.stringify(d) !== JSON.stringify(EMPTY_DPP);

/** The passport part of a unit's page (src/server/trace.ts scan): its GTIN and passport, when filled in. */
export function unitDpp(p: { gtin: string | null; dpp: string | null }) {
  const dpp = readDpp(p.dpp);
  return { gtin: p.gtin, dpp: hasDpp(dpp) ? dpp : null };
}

// ─── GTINs and GS1 Digital Link ─────────────────────────────────────────────────────────────

/** GS1's check digit for the digits before it (weights 3 and 1 from the right). */
export function gs1CheckDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** A GTIN-8, -12, -13 or -14 with a correct check digit, as the 14 digits GS1 Digital Link uses; else null. */
export function gtin14(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.replace(/[\s-]/g, '') : typeof raw === 'number' ? String(raw) : '';
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return null;
  const g = s.padStart(14, '0');
  return gs1CheckDigit(g.slice(0, 13)) === Number(g[13]) ? g : null;
}

/** The GS1 Digital Link address for one unit: tills read the GTIN from it, phones open the passport. */
export const gs1Link = (origin: string, gtin: string, code: string) => `${origin}/01/${gtin}/21/${encodeURIComponent(code)}`;

/**
 * Where a GS1 Digital Link address goes: /01/<GTIN>[/22/<cpv>][/10/<lot>][/21/<serial>] (the part
 * after /01/). A serial is one of our signed unit codes, so it opens that unit's passport (/t/<code>);
 * without one, the product's passport (/dpp?g=<GTIN>). Anything else isn't ours to answer: null.
 */
export function gs1Target(rest: string): [path: string, query: string] | null {
  const parts = rest.split('/').filter(Boolean);
  const g = gtin14(parts.shift());
  if (!g || parts.length % 2) return null;
  const ai: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 2) {
    if (!['22', '10', '21'].includes(parts[i]) || parts[i] in ai) return null;
    ai[parts[i]] = parts[i + 1];
  }
  if (ai['21']) return [`/t/${encodeURIComponent(ai['21'])}`, ''];
  return ['/dpp', `g=${g}${ai['10'] ? `&lot=${encodeURIComponent(ai['10'])}` : ''}`];
}

// ─── Supplier requests ──────────────────────────────────────────────────────────────────────

/** What a supplier sends back about one material or part: it becomes one row of the passport's materials. */
export interface SupplyAnswer { material: DppMaterial; carbonKg: number | null; certifications: string[]; documents: DppDocument[]; note: string | null }

export function parseSupplyAnswer(raw: unknown): SupplyAnswer | null {
  const r = obj(raw);
  const d = parseDpp({ materials: [r.material], certifications: r.certifications, documents: r.documents });
  if (!d.materials.length) return null;
  return { material: d.materials[0], carbonKg: number(r.carbonKg, 0, 1_000_000, 3), certifications: d.certifications, documents: d.documents, note: para(r.note, 600) };
}

/** A supplier's answer added to a passport: its material (replacing one of the same name), certificates and documents. */
export function mergeSupply(d: Dpp, a: SupplyAnswer): Dpp {
  const same = (x: string) => x.trim().toLowerCase() === a.material.name.trim().toLowerCase();
  return parseDpp({
    ...d,
    materials: [...d.materials.filter((m) => !same(m.name)), a.material],
    certifications: [...new Set([...d.certifications, ...a.certifications])],
    documents: [...d.documents, ...a.documents.filter((x) => !d.documents.some((y) => y.url === x.url))],
  });
}
