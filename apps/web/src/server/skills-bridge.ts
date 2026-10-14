import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { bestModule, byMatch, explain, sameSkill, skillMatcher, type GapModule, type GapTutor, type Level, type SkillMatch, type Verified } from '@/lib/skills-bridge';
import { courseWhereFor, studentCampuses } from './campus-network';
import { ForbiddenException } from './http';
import { parseSkills } from './skill-evidence';

// Stage 5 · D18, skills-to-jobs bridge: open internships and NGO projects ranked by how well the
// student's verified skills (passport evidence: work someone checked) cover what each asks for, with
// where to learn what's missing: a module of one of their classes (B2), a class they could join, or
// a peer tutor (D5). Plain rules, no AI. The matching itself is in src/lib/skills-bridge.ts.

export interface Gap { skill: string; module: GapModule | null; tutors: GapTutor[] }
export interface Opportunity {
  kind: 'INTERNSHIP' | 'PROJECT';
  id: string; title: string; org: string; location: string | null; deadline: string | null; applied: boolean;
  match: SkillMatch; gaps: Gap[]; summary: string;
}
export interface SkillsMatch { skills: Verified[]; opportunities: Opportunity[] }

const LEVELS = new Set(['Developing', 'Proficient', 'Advanced']);
const RANK: Record<string, number> = { Developing: 1, Proficient: 2, Advanced: 3 };

/** A skills column (JSON string[], stored as JSON or as text), cleaned; at most 12. */
function skillList(v: unknown): string[] {
  let list = v;
  if (typeof v === 'string') {
    try { list = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim().slice(0, 60)).slice(0, 12) : [];
}

/** The student's verified skills: one per skill, its strongest level and how many pieces of evidence. */
async function verifiedSkills(userId: string): Promise<Verified[]> {
  // Hidden items count here: they're only hidden from the public passport, and this is the student's own view.
  const rows = await prisma.skillEvidence.findMany({ where: { userId }, orderBy: { occurredAt: 'desc' }, take: 500, select: { skill: true, label: true, level: true } });
  const out = new Map<string, Verified>();
  for (const r of rows) {
    const v = out.get(r.skill) ?? { key: r.skill, label: r.label, level: null, count: 0 };
    v.count += 1;
    if (r.level && LEVELS.has(r.level) && (RANK[r.level] ?? 0) > (RANK[v.level ?? ''] ?? 0)) v.level = r.level as Level;
    out.set(r.skill, v);
  }
  return [...out.values()].sort((a, b) => b.count - a.count || (RANK[b.level ?? ''] ?? 0) - (RANK[a.level ?? ''] ?? 0) || a.label.localeCompare(b.label));
}

/** Where each missing skill can be learnt: a matching module of my classes first, then a class I could join. */
async function moduleFinder(user: SessionUser) {
  const [mine, campuses] = await Promise.all([
    prisma.course.findMany({
      where: { status: { not: 'ARCHIVED' }, enrollments: { some: { studentId: user.id } } },
      take: 40,
      select: {
        id: true, code: true, name: true, skills: true,
        modules: { where: { published: true }, orderBy: { position: 'asc' }, take: 40, select: { title: true, releaseAt: true } },
      },
    }),
    studentCampuses(user.id),
  ]);
  const others = await prisma.course.findMany({
    where: { status: 'PUBLISHED', enrollments: { none: { studentId: user.id } }, skills: { not: null }, AND: [courseWhereFor(campuses)] },
    orderBy: { updatedAt: 'desc' },
    take: 150,
    select: { id: true, code: true, name: true, skills: true },
  });
  const now = Date.now();
  const enrolled = mine.map((c) => ({ ...c, skillNames: parseSkills(c.skills), modules: c.modules.filter((m) => !m.releaseAt || m.releaseAt.getTime() <= now) }));
  const open = others.map((c) => ({ ...c, skillNames: parseSkills(c.skills) }));
  return (skill: string): GapModule | null => {
    const options: GapModule[] = [];
    for (const c of enrolled) {
      // A module named for the skill, or the class itself when it builds the skill.
      const m = c.modules.find((x) => sameSkill(skill, x.title));
      if (m || c.skillNames.some((s) => sameSkill(skill, s)) || sameSkill(skill, c.name)) {
        options.push({ courseId: c.id, courseCode: c.code, courseName: c.name, moduleTitle: m?.title ?? null, enrolled: true });
      }
    }
    if (!options.length) {
      for (const c of open) {
        if (c.skillNames.some((s) => sameSkill(skill, s)) || sameSkill(skill, c.name)) options.push({ courseId: c.id, courseCode: c.code, courseName: c.name, moduleTitle: null, enrolled: false });
      }
    }
    return bestModule(options);
  };
}

/** Peer tutors (D5) who can help with a skill: what they offer to teach, or their own checked evidence for it. */
async function tutorFinder(user: SessionUser) {
  const profiles = await prisma.peerTutorProfile.findMany({
    // Tutors of my school (or not tied to one), never another school's.
    where: { isActive: true, userId: { not: user.id }, ...(user.organizationId ? { OR: [{ organizationId: user.organizationId }, { organizationId: null }] } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 150,
    select: { userId: true, subjects: true, user: { select: { name: true } } },
  });
  const ids = profiles.map((p) => p.userId);
  const shown = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 90) {
    // Only what they show on their own passport.
    const rows = await prisma.skillEvidence.findMany({ where: { userId: { in: ids.slice(i, i + 90) }, hidden: false }, take: 3000, select: { userId: true, label: true } });
    for (const r of rows) shown.set(r.userId, [...(shown.get(r.userId) ?? []), r.label]);
  }
  const tutors = profiles.map((p) => {
    let subjects: { courseName?: unknown; conceptName?: unknown }[] = [];
    try { const v = JSON.parse(p.subjects); if (Array.isArray(v)) subjects = v; } catch { /* no subjects */ }
    const names = subjects.flatMap((s) => [s.conceptName, s.courseName]).filter((s): s is string => typeof s === 'string' && !!s);
    return { userId: p.userId, name: p.user.name, names: [...names, ...new Set(shown.get(p.userId) ?? [])] };
  });
  return (skill: string): GapTutor[] => tutors.filter((t) => t.names.some((n) => sameSkill(skill, n))).slice(0, 2).map(({ userId, name }) => ({ userId, name }));
}

/** Open internships and NGO projects, best skill match first, with where to learn each missing skill. */
export async function skillsMatch(user: SessionUser): Promise<SkillsMatch> {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Skills match is for students: it compares your own checked skills with what each opening asks for.');
  const now = new Date();
  const open = { isActive: true, OR: [{ deadline: null }, { deadline: { gte: now } }] };
  const [skills, internships, projects, applied, joined] = await Promise.all([
    verifiedSkills(user.id),
    prisma.internship.findMany({ where: open, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, title: true, location: true, deadline: true, skills: true, company: { select: { name: true } } } }),
    prisma.nGOProject.findMany({ where: open, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, name: true, location: true, deadline: true, skillsRequired: true, ngo: { select: { name: true } } } }),
    prisma.internshipApplication.findMany({ where: { studentId: user.id }, take: 200, select: { internshipId: true } }),
    prisma.nGOProjectApplication.findMany({ where: { studentId: user.id }, take: 200, select: { projectId: true } }),
  ]);
  const appliedTo = new Set([...applied.map((a) => a.internshipId), ...joined.map((a) => a.projectId)]);
  const match = skillMatcher(skills);
  const listed = [
    ...internships.map((i) => ({ kind: 'INTERNSHIP' as const, id: i.id, title: i.title, org: i.company?.name ?? '', location: i.location, deadline: i.deadline?.toISOString() ?? null, asked: skillList(i.skills) })),
    ...projects.map((p) => ({ kind: 'PROJECT' as const, id: p.id, title: p.name, org: p.ngo?.name ?? '', location: p.location, deadline: p.deadline?.toISOString() ?? null, asked: skillList(p.skillsRequired) })),
  ].filter((o) => o.asked.length);
  const ranked = byMatch(listed.map((o) => ({ ...o, match: match(o.asked) }))).slice(0, 30);

  // Where to learn each missing skill, looked up once however many openings ask for it.
  const missing = [...new Set(ranked.flatMap((o) => o.match.missing))];
  const [findModule, findTutors] = missing.length ? await Promise.all([moduleFinder(user), tutorFinder(user)]) : [() => null, () => []];
  const gapFor = new Map(missing.map((skill) => [skill, { skill, module: findModule(skill), tutors: findTutors(skill) }]));

  return {
    skills,
    opportunities: ranked.map((o) => {
      const gaps = o.match.missing.map((s) => gapFor.get(s)!);
      const first = gaps[0];
      return {
        kind: o.kind, id: o.id, title: o.title, org: o.org, location: o.location, deadline: o.deadline, applied: appliedTo.has(o.id),
        match: o.match, gaps, summary: explain(o.match, first && { skill: first.skill, module: first.module, tutor: first.tutors[0] ?? null }),
      };
    }),
  };
}
