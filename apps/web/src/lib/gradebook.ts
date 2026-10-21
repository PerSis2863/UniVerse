// Gradebook maths (Stage 5 · B3.4), shared by the teacher's gradebook, students' grades and CSV
// exports. Import-free. Grades are percentages; categories have weights (percent of the final)
// and can drop each student's lowest N grades. Assessments ("Midterm", "Lab 2") belong to a
// category by name, so every grade for that assessment counts there, including later ones.

export interface Category { id: string; name: string; weight: number; dropLowest: number }
export interface GradeIn { assessment: string; score: number; maxScore: number }
export interface CategoryResult { id: string; name: string; weight: number; average: number | null; counted: number; dropped: number }

export const pct = (score: number, maxScore: number) => (maxScore > 0 ? (score / maxScore) * 100 : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The lowest `n` dropped (always keeping at least one). */
export function dropLowest(xs: number[], n: number): { kept: number[]; dropped: number } {
  const k = Math.max(0, Math.min(Math.floor(n), xs.length - 1));
  return { kept: [...xs].sort((a, b) => a - b).slice(k), dropped: k };
}

/**
 * A student's final percentage. With no categories it's the plain average. With categories it's
 * the weighted average of the categories that have grades (weights are re-scaled over those, so an
 * empty category doesn't pull the final down); grades in no category count in an "Other" bucket
 * weighted by whatever is left of 100%.
 */
export function finalGrade(grades: GradeIn[], categories: Category[], categoryOf: (assessment: string) => string | null): { final: number | null; byCategory: CategoryResult[]; uncategorized: number } {
  const percents = grades.map((g) => ({ a: g.assessment, p: pct(g.score, g.maxScore) }));
  if (!categories.length) return { final: mean(percents.map((x) => x.p)), byCategory: [], uncategorized: 0 };
  const known = new Set(categories.map((c) => c.id));
  const groups = new Map<string, number[]>();
  let uncategorized = 0;
  for (const x of percents) {
    const id = categoryOf(x.a);
    const key = id && known.has(id) ? id : '';
    if (!key) uncategorized++;
    groups.set(key, [...(groups.get(key) ?? []), x.p]);
  }
  const leftover = Math.max(0, 100 - categories.reduce((s, c) => s + c.weight, 0));
  const all = [...categories, ...(uncategorized ? [{ id: '', name: 'Other', weight: leftover, dropLowest: 0 }] : [])];
  const byCategory = all.map((c) => {
    const { kept, dropped } = dropLowest(groups.get(c.id) ?? [], c.dropLowest);
    return { id: c.id, name: c.name, weight: c.weight, average: mean(kept), counted: kept.length, dropped };
  });
  const used = byCategory.filter((c) => c.average != null && c.weight > 0);
  const w = used.reduce((s, c) => s + c.weight, 0);
  return { final: w ? used.reduce((s, c) => s + c.weight * (c.average as number), 0) / w : null, byCategory, uncategorized };
}

/** A school's letter grades (Stage 5 · B3.4): each band from its minimum %, highest first, with GPA points. */
export interface Band { letter: string; min: number; gpa: number }
export type Scale = Band[];

/** The default letter scale (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60) and its GPA points. */
export const DEFAULT_SCALE: Scale = [
  { letter: 'A', min: 90, gpa: 4 }, { letter: 'B', min: 80, gpa: 3 }, { letter: 'C', min: 70, gpa: 2 }, { letter: 'D', min: 60, gpa: 1 }, { letter: 'F', min: 0, gpa: 0 },
];

/**
 * Ready-made scales to start from (Stage 5 · Q22): the school can still change any band. Boards set
 * their own rules each year, so these are the usual ones, not official conversions: CBSE's nine-point
 * grades (pass at 33%), the 10-point bands many ICSE schools use, and IB's 1–7 with typical
 * boundaries (each IB subject's real boundaries differ every session).
 */
export const SCALE_PRESETS: { id: string; label: string; scale: Scale }[] = [
  { id: 'standard', label: 'A–F on 4.0', scale: DEFAULT_SCALE },
  { id: 'cbse', label: 'CBSE (A1–E, 10 points)', scale: [
    { letter: 'A1', min: 91, gpa: 10 }, { letter: 'A2', min: 81, gpa: 9 }, { letter: 'B1', min: 71, gpa: 8 }, { letter: 'B2', min: 61, gpa: 7 },
    { letter: 'C1', min: 51, gpa: 6 }, { letter: 'C2', min: 41, gpa: 5 }, { letter: 'D', min: 33, gpa: 4 }, { letter: 'E', min: 0, gpa: 0 },
  ] },
  { id: 'icse', label: 'ICSE-style (A+–E, 10 points)', scale: [
    { letter: 'A+', min: 90, gpa: 10 }, { letter: 'A', min: 80, gpa: 9 }, { letter: 'B+', min: 70, gpa: 8 }, { letter: 'B', min: 60, gpa: 7 },
    { letter: 'C+', min: 50, gpa: 6 }, { letter: 'C', min: 40, gpa: 5 }, { letter: 'D', min: 33, gpa: 4 }, { letter: 'E', min: 0, gpa: 0 },
  ] },
  { id: 'ib', label: 'IB (7 to 1)', scale: [
    { letter: '7', min: 80, gpa: 7 }, { letter: '6', min: 70, gpa: 6 }, { letter: '5', min: 60, gpa: 5 }, { letter: '4', min: 50, gpa: 4 },
    { letter: '3', min: 40, gpa: 3 }, { letter: '2', min: 25, gpa: 2 }, { letter: '1', min: 0, gpa: 1 },
  ] },
];

/** The letter and GPA points for a percentage on a scale (the default when none is given). */
export function letter(p: number | null, scale: Scale = DEFAULT_SCALE): { letter: string; gpa: number } | null {
  if (p == null) return null;
  const band = scale.find((b) => p >= b.min) ?? scale[scale.length - 1];
  return band ? { letter: band.letter, gpa: band.gpa } : null;
}

/** The highest GPA points on a scale (4 on the default one). */
export const maxGpa = (scale: Scale = DEFAULT_SCALE) => Math.max(0, ...scale.map((b) => b.gpa));

/**
 * A scale as an admin sent it, made safe: 2–15 bands, distinct names of up to 12 characters, distinct minimums from
 * 0 to 100, GPA points 0–10, highest first, the lowest band starting at 0. Null when it isn't one.
 */
export function cleanScale(raw: unknown): Scale | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 15) return null;
  const bands = raw.map((b) => {
    const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    return { letter: typeof o.letter === 'string' ? o.letter.trim().slice(0, 12) : '', min: Number(o.min), gpa: Number(o.gpa) };
  });
  if (bands.some((b) => !b.letter || !Number.isFinite(b.min) || b.min < 0 || b.min > 100 || !Number.isFinite(b.gpa) || b.gpa < 0 || b.gpa > 10)) return null;
  if (new Set(bands.map((b) => b.letter.toUpperCase())).size !== bands.length || new Set(bands.map((b) => b.min)).size !== bands.length) return null;
  const sorted = bands.map((b) => ({ letter: b.letter, min: Math.round(b.min * 100) / 100, gpa: Math.round(b.gpa * 100) / 100 })).sort((a, b) => b.min - a.min);
  sorted[sorted.length - 1].min = 0;
  return sorted;
}

/** A stored scale (JSON), or the default. */
export function parseScale(raw: string | null | undefined): Scale {
  if (!raw) return DEFAULT_SCALE;
  try { return cleanScale(JSON.parse(raw)) ?? DEFAULT_SCALE; } catch { return DEFAULT_SCALE; }
}
