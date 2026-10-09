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

/** The default letter scale (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60) and its GPA points. */
export function letter(p: number | null): { letter: string; gpa: number } | null {
  if (p == null) return null;
  if (p >= 90) return { letter: 'A', gpa: 4 };
  if (p >= 80) return { letter: 'B', gpa: 3 };
  if (p >= 70) return { letter: 'C', gpa: 2 };
  if (p >= 60) return { letter: 'D', gpa: 1 };
  return { letter: 'F', gpa: 0 };
}
