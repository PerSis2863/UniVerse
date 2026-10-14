// Stage 5 · D18, skills-to-jobs bridge: how a student's verified skills (the passport's evidence)
// cover what an internship or NGO project asks for, in words they can act on. No database here
// (src/server/skills-bridge.ts gathers the data), so it's tested directly.

export type Level = 'Developing' | 'Proficient' | 'Advanced';

/** A skill the student has shown, from checked work (src/server/skill-evidence.ts). */
export interface Verified { key: string; label: string; level: Level | null; count: number }

/** Where a missing skill can be learnt: a module of a class, or a peer tutor (D5). */
export interface GapModule { courseId: string; courseCode: string; courseName: string; moduleTitle: string | null; enrolled: boolean }
export interface GapTutor { userId: string; name: string }

export interface SkillMatch {
  matched: { skill: string; level: Level | null; evidence: number }[];
  missing: string[];
  /** 0–100, of the skills asked for. */
  percent: number;
}

const STOP = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'a', 'an', 'with', '&']);
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').replace(/\s+/g, ' ').trim();
// The same few names are compared many times (every opportunity against every skill), so each
// name is split into words once.
const cache = new Map<string, string[]>();
function words(s: string): string[] {
  let w = cache.get(s);
  if (!w) {
    if (cache.size > 5000) cache.clear();
    w = norm(s).split(' ').filter((x) => x && !STOP.has(x)).map((x) => x.replace(/\.$/, ''));
    cache.set(s, w);
  }
  return w;
}

/** The passport's key for a skill name (as src/server/skill-evidence.ts stores it). */
export const skillKeyOf = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * Whether evidence for `have` shows the skill `want` asks for: the same name, or one name's words
 * all appear in the other ("SQL" ↔ "SQL basics", "Data analysis" ↔ "Data analysis with Python").
 * Whole words only, so "Java" never counts as "JavaScript" and "R" never as "React".
 */
export function sameSkill(want: string, have: string): boolean {
  const a = words(want), b = words(have);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

const rank = (l: Level | null) => (l === 'Advanced' ? 3 : l === 'Proficient' ? 2 : l === 'Developing' ? 1 : 0);

/**
 * Matches lists of asked-for skills against one student's verified skills. Each skill name is looked
 * up once, however many opportunities ask for it.
 */
export function skillMatcher(verified: Verified[]): (asked: string[]) => SkillMatch {
  const memo = new Map<string, { level: Level | null; evidence: number } | null>();
  const find = (skill: string) => {
    const key = skillKeyOf(skill);
    if (!memo.has(key)) {
      // The strongest evidence that shows it.
      const hits = verified.filter((v) => sameSkill(skill, v.label));
      const best = hits.length ? hits.reduce((x, y) => (rank(y.level) > rank(x.level) || (rank(y.level) === rank(x.level) && y.count > x.count) ? y : x)) : null;
      memo.set(key, best && { level: best.level, evidence: hits.reduce((n, h) => n + h.count, 0) });
    }
    return memo.get(key) ?? null;
  };
  return (asked) => {
    const seen = new Set<string>();
    const wanted = asked.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s && !seen.has(skillKeyOf(s)) && seen.add(skillKeyOf(s))).slice(0, 12);
    const matched: SkillMatch['matched'] = [];
    const missing: string[] = [];
    for (const skill of wanted) {
      const hit = find(skill);
      if (hit) matched.push({ skill, ...hit });
      else missing.push(skill);
    }
    return { matched, missing, percent: wanted.length ? Math.round((matched.length / wanted.length) * 100) : 0 };
  };
}

/** The asked-for skills (deduplicated, at most 12), each found or not in the verified ones. */
export const matchSkills = (asked: string[], verified: Verified[]): SkillMatch => skillMatcher(verified)(asked);

/** The first place to learn a missing skill: a class you're in first, then any class. */
export function bestModule(options: GapModule[]): GapModule | null {
  return [...options].sort((a, b) => Number(b.enrolled) - Number(a.enrolled) || Number(!!b.moduleTitle) - Number(!!a.moduleTitle))[0] ?? null;
}

/** "You match 4 of 5 skills; finish 'SQL basics' in CS201 to match all." */
export function explain(m: SkillMatch, firstGap?: { skill: string; module: GapModule | null; tutor: GapTutor | null }): string {
  const total = m.matched.length + m.missing.length;
  if (!total) return 'No skills listed for this one.';
  if (!m.missing.length) return total === 1 ? 'You match the skill it asks for.' : `You match all ${total} skills it asks for.`;
  const head = `You match ${m.matched.length} of ${total} skills`;
  if (m.missing.length > 1 || !firstGap) return `${head}; ${m.missing.length} to learn.`;
  const mod = firstGap.module;
  const where = mod
    ? mod.enrolled ? `finish ${mod.moduleTitle ? `‘${mod.moduleTitle}’ in ` : ''}${mod.courseCode}` : `take ${mod.courseCode}`
    : firstGap.tutor
      ? `learn ${firstGap.skill} with ${firstGap.tutor.name.split(' ')[0]}, a peer tutor,`
      : `learn ${firstGap.skill}`;
  return `${head}; ${where} to match all.`;
}

/** Best matches first (share of skills, then how many), then the soonest deadline. */
export function byMatch<T extends { match: SkillMatch; deadline: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    b.match.percent - a.match.percent
    || b.match.matched.length - a.match.matched.length
    || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
}
