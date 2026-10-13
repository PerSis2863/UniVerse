import { parseRubric, type Criterion } from './oral';

// Impact League (Stage 5 · D14): the plain rules shared by the server (src/server/impact-league.ts)
// and the pages. A challenge is DRAFT → OPEN (teams form and work) → JUDGING → DONE.

/** The 17 UN Sustainable Development Goals, in order (SDG 1 is index 0). */
export const SDGS = [
  'No poverty', 'Zero hunger', 'Good health and well-being', 'Quality education', 'Gender equality',
  'Clean water and sanitation', 'Affordable and clean energy', 'Decent work and economic growth',
  'Industry, innovation and infrastructure', 'Reduced inequalities', 'Sustainable cities and communities',
  'Responsible consumption and production', 'Climate action', 'Life below water', 'Life on land',
  'Peace, justice and strong institutions', 'Partnerships for the goals',
] as const;
export const sdgName = (n: number | null | undefined) => (typeof n === 'number' && n >= 1 && n <= 17 ? SDGS[n - 1] : null);
export const validSdg = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 17 ? n : null; };

export const LEAGUE_STATUSES = ['DRAFT', 'OPEN', 'JUDGING', 'DONE'] as const;
export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];
export const STATUS_LABEL: Record<LeagueStatus, string> = { DRAFT: 'Draft', OPEN: 'Open', JUDGING: 'Judging', DONE: 'Finished' };

export const LEAGUE_ROLES = ['ORGANIZER', 'MENTOR', 'JUDGE', 'SPONSOR'] as const;
export type LeagueRole = (typeof LEAGUE_ROLES)[number];
export const ROLE_LABEL: Record<LeagueRole, string> = { ORGANIZER: 'Organizer', MENTOR: 'Mentor', JUDGE: 'Judge', SPONSOR: 'Sponsor' };

export const TEAM_SIZE = { min: 1, max: 8 } as const;
export const MAX_MILESTONES = 8;
export const MAX_PRIZES = 10;

export interface Milestone { id: string; title: string; notes: string; dueAt: string | null }
export interface Prize { id: string; title: string; sponsor: string; description: string; teamId: string | null }

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v);

/** A web address for a slug: lower case letters, digits and dashes (at most 48). */
export function slugify(title: string) {
  const s = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return s || 'challenge';
}

/** A date the organizer typed (ISO), or null. */
export const isoOrNull = (v: unknown) => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/** Milestones from the organizer: 1–8, each with a title; notes and a due date are optional. */
export function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Milestone[] = [];
  for (const x of raw.slice(0, MAX_MILESTONES)) {
    const m = (x ?? {}) as Partial<Milestone>;
    const title = clip(m.title, 120);
    if (title.length < 2) continue;
    let id = idOk(m.id) ? m.id : `m${out.length + 1}`;
    for (let k = 2; seen.has(id); k++) id = `m${out.length + 1}-${k}`;
    seen.add(id);
    out.push({ id, title, notes: typeof m.notes === 'string' ? m.notes.trim().slice(0, 500) : '', dueAt: isoOrNull(m.dueAt) });
  }
  return out;
}

/** Prizes: up to 10, each with a title; a winner only when it's one of the challenge's teams. */
export function parsePrizes(raw: unknown, teamIds?: Set<string>): Prize[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Prize[] = [];
  for (const x of raw.slice(0, MAX_PRIZES)) {
    const p = (x ?? {}) as Partial<Prize>;
    const title = clip(p.title, 80);
    if (!title) continue;
    let id = idOk(p.id) ? p.id : `p${out.length + 1}`;
    for (let k = 2; seen.has(id); k++) id = `p${out.length + 1}-${k}`;
    seen.add(id);
    const teamId = typeof p.teamId === 'string' && (!teamIds || teamIds.has(p.teamId)) ? p.teamId : null;
    out.push({ id, title, sponsor: clip(p.sponsor, 80), description: typeof p.description === 'string' ? p.description.trim().slice(0, 300) : '', teamId });
  }
  return out;
}

export const parseJson = (s: string | null | undefined): unknown => { try { return JSON.parse(s ?? 'null'); } catch { return null; } };

/** What a new challenge starts with; organizers change it. */
export const defaultMilestones = (): Milestone[] => [
  { id: 'm1', title: 'Meet your team and pick the problem', notes: 'Agree who you’re helping and what “better” would look like for them.', dueAt: null },
  { id: 'm2', title: 'Talk to people affected', notes: 'Listen to at least three people the problem touches. Write down what surprised you.', dueAt: null },
  { id: 'm3', title: 'Build a first version', notes: 'A prototype, a pilot or a detailed plan. Small and real beats big and imagined.', dueAt: null },
  { id: 'm4', title: 'Get your pitch ready for demo day', notes: 'Three minutes: the problem, what you made, what you learned, what’s next.', dueAt: null },
];

export const DEFAULT_RUBRIC: Criterion[] = [
  { id: 'impact', name: 'Impact', desc: 'How much good it could do for the people affected.', max: 10 },
  { id: 'evidence', name: 'Evidence', desc: 'They talked to people affected and tested their idea.', max: 10 },
  { id: 'feasibility', name: 'Feasibility', desc: 'It could really be built and kept running.', max: 10 },
  { id: 'creativity', name: 'Creativity', desc: 'A fresh idea, not just the obvious one.', max: 10 },
  { id: 'pitch', name: 'Pitch', desc: 'Clear and convincing on demo day.', max: 10 },
];
export const leagueRubric = (raw: unknown): Criterion[] => parseRubric(raw) ?? DEFAULT_RUBRIC;

export interface JudgeScore { id: string; score: number }
/** A judge's scores: one whole number per criterion, within its maximum; null when one is missing. */
export function cleanJudgeScores(raw: unknown, rubric: Criterion[]): JudgeScore[] | null {
  const list = Array.isArray(raw) ? (raw as Partial<JudgeScore>[]) : [];
  const out: JudgeScore[] = [];
  for (const c of rubric) {
    const n = Number(list.find((s) => s?.id === c.id)?.score);
    if (!Number.isFinite(n) || n < 0 || n > c.max) return null;
    out.push({ id: c.id, score: Math.round(n) });
  }
  return out;
}

export interface Ranked { teamId: string; average: number | null; judges: number; rank: number | null }
/**
 * Teams by their average total across the judges who scored them (one decimal). Equal averages share
 * a rank (1, 1, 3); teams nobody has scored come last, without a rank.
 */
export function rankTeams(teamIds: string[], scores: { teamId: string; total: number }[]): Ranked[] {
  const by = new Map<string, number[]>();
  for (const s of scores) if (teamIds.includes(s.teamId)) by.set(s.teamId, [...(by.get(s.teamId) ?? []), s.total]);
  const rows = teamIds.map((teamId) => {
    const t = by.get(teamId) ?? [];
    return { teamId, average: t.length ? Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10 : null, judges: t.length, rank: null as number | null };
  });
  rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  rows.forEach((r, i) => { if (r.average !== null) r.rank = i > 0 && rows[i - 1].average === r.average ? rows[i - 1].rank : i + 1; });
  return rows;
}

/** A team's average on each criterion, from every judge's scores (for its feedback). */
export function criterionAverages(rubric: Criterion[], sheets: JudgeScore[][]) {
  return rubric.map((c) => {
    const xs = sheets.map((s) => s.find((x) => x.id === c.id)?.score).filter((n): n is number => typeof n === 'number');
    return { id: c.id, name: c.name, max: c.max, average: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null };
  });
}

/**
 * Students under 18 stay with their own university: a team with someone under 18 in it must have
 * everyone from one campus (people with no campus count as one more "campus").
 */
export function campusMixAllowed(people: { campusId: string | null; minor: boolean }[]) {
  if (!people.some((p) => p.minor)) return true;
  return new Set(people.map((p) => p.campusId ?? '')).size <= 1;
}

/** Why a team can't hand in its project yet, or null. */
export function submitProblem(t: { members: number; campuses: number; projectTitle: string; pitch: string }, c: { teamMin: number; mixCampuses: boolean }) {
  if (t.members < c.teamMin) return `A team needs at least ${c.teamMin} ${c.teamMin === 1 ? 'person' : 'people'}.`;
  if (c.mixCampuses && t.campuses < 2) return 'This challenge needs teams with people from at least two universities.';
  if (t.projectTitle.trim().length < 3) return 'Give your project a title.';
  if (t.pitch.trim().length < 40) return 'Describe your project in a few sentences (at least 40 characters).';
  return null;
}

/** A team project's link: a full https address, or ''. */
export function cleanLink(v: unknown) {
  const s = typeof v === 'string' ? v.trim().slice(0, 300) : '';
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Teams may sign up while the challenge is open and before sign-up closes. */
export const signupOpen = (c: { status: string; signupClosesAt: Date | string | null }, now = Date.now()) =>
  c.status === 'OPEN' && (!c.signupClosesAt || new Date(c.signupClosesAt).getTime() > now);

/** Demo day's call can be joined from 15 minutes before it starts until 4 hours after. */
export const demoOpen = (at: Date | string | null, now = Date.now()) => {
  if (!at) return false;
  const t = new Date(at).getTime();
  return now >= t - 15 * 60_000 && now <= t + 4 * 3600_000;
};
export const leagueCallId = (challengeId: string) => `lg_${challengeId}`;
