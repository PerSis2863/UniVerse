import prisma from '@/lib/db';

// Upgrade 2, proof-of-learning passport. Work that someone else checked becomes evidence for the
// skills it shows: a graded assignment (60%+) or a passed quiz (60%+) counts for the skills its
// course builds (Course.skills, chosen by the teacher; the course's own name when none are set),
// and an issued impact credential counts for the skills its project asked for. Written when the
// grade or credential is given (a few small writes), read on the passport.

export type EvidenceKind = 'QUIZ' | 'ASSIGNMENT' | 'COURSE' | 'IMPACT' | 'PROJECT';
export const PASS_RATIO = 0.6;

export const skillKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
const label = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60);

/** A course's skills (JSON string[] in Course.skills), cleaned; at most 6. */
export function parseSkills(raw: string | null | undefined): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    return v.map((x) => (typeof x === 'string' ? label(x) : '')).filter((x) => x && !seen.has(skillKey(x)) && seen.add(skillKey(x))).slice(0, 6);
  } catch { return []; }
}

const levelFor = (ratio: number) => (ratio >= 0.85 ? 'Advanced' : ratio >= 0.7 ? 'Proficient' : 'Developing');

interface Item { userId: string; kind: EvidenceKind; sourceId: string; skills: string[]; title: string; detail?: string | null; level?: string | null; verifiedById?: string | null; verifiedByName?: string | null; occurredAt?: Date }

/** Records (or refreshes) evidence for each skill; a re-grade updates the same rows. */
async function record(item: Item) {
  const skills = [...new Map(item.skills.map((s) => [skillKey(s), label(s)])).entries()].filter(([k]) => k).slice(0, 6);
  for (const [skill, shown] of skills) {
    const data = {
      label: shown, title: item.title.slice(0, 200), detail: item.detail?.slice(0, 300) ?? null, level: item.level ?? null,
      verifiedById: item.verifiedById ?? null, verifiedByName: item.verifiedByName?.slice(0, 120) ?? null, occurredAt: item.occurredAt ?? new Date(),
    };
    await prisma.skillEvidence.upsert({
      where: { userId_kind_sourceId_skill: { userId: item.userId, kind: item.kind, sourceId: item.sourceId, skill } },
      update: data,
      create: { userId: item.userId, kind: item.kind, sourceId: item.sourceId, skill, ...data },
    });
  }
}

const forget = (userId: string, kind: EvidenceKind, sourceId: string) => prisma.skillEvidence.deleteMany({ where: { userId, kind, sourceId } });

/** After a teacher returns an assignment grade (src/server/assignments.ts returnGrade). */
export async function evidenceFromGrade(a: {
  studentId: string; submissionId: string; assignmentTitle: string; score: number; maxScore: number;
  course: { name: string; code: string; skills: string | null }; teacher: { id: string; name: string };
}) {
  const ratio = a.maxScore > 0 ? a.score / a.maxScore : 0;
  if (ratio < PASS_RATIO) return forget(a.studentId, 'ASSIGNMENT', a.submissionId); // a corrected grade below the bar
  const skills = parseSkills(a.course.skills);
  await record({
    userId: a.studentId, kind: 'ASSIGNMENT', sourceId: a.submissionId, skills: skills.length ? skills : [a.course.name],
    title: a.assignmentTitle, detail: `${Math.round(ratio * 100)}% · ${a.course.code}`, level: levelFor(ratio),
    verifiedById: a.teacher.id, verifiedByName: a.teacher.name,
  });
}

/** After a quiz is submitted (auto-graded on the server, src/server/services/quizzes.service.ts). */
export async function evidenceFromQuiz(q: { studentId: string; submissionId: string; quizId: string; score: number; maxScore: number }) {
  const ratio = q.maxScore > 0 ? q.score / q.maxScore : 0;
  if (ratio < PASS_RATIO) return;
  const quiz = await prisma.quiz.findUnique({ where: { id: q.quizId }, select: { title: true, course: { select: { name: true, code: true, skills: true, teacher: { select: { id: true, name: true } } } } } });
  if (!quiz) return;
  const skills = parseSkills(quiz.course.skills);
  await record({
    userId: q.studentId, kind: 'QUIZ', sourceId: q.submissionId, skills: skills.length ? skills : [quiz.course.name],
    title: quiz.title, detail: `${Math.round(ratio * 100)}% · ${quiz.course.code} · graded automatically`, level: levelFor(ratio),
    verifiedById: quiz.course.teacher?.id ?? null, verifiedByName: quiz.course.teacher ? `${quiz.course.teacher.name}'s quiz` : null,
  });
}

/** After an impact credential is issued (signed): the project's skills, or general impact skills. */
export async function evidenceFromCredential(certificateId: string) {
  const c = await prisma.impactCertificate.findUnique({ where: { id: certificateId }, select: { id: true, userId: true, title: true, projectName: true, organization: true, hoursCompleted: true, status: true, revokedAt: true, verifiedById: true, verifiedByName: true, issuedAt: true } });
  if (!c) return;
  if (c.status !== 'ISSUED' || c.revokedAt) return forget(c.userId, 'IMPACT', c.id);
  const project = await prisma.nGOProject.findFirst({ where: { name: c.projectName }, select: { skillsRequired: true } }).catch(() => null);
  const asked = Array.isArray(project?.skillsRequired) ? (project!.skillsRequired as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  await record({
    userId: c.userId, kind: 'IMPACT', sourceId: c.id, skills: asked.length ? asked : ['Social impact', 'Teamwork'],
    title: c.title, detail: `${c.hoursCompleted} h · ${c.projectName} · ${c.organization}`, level: c.hoursCompleted >= 40 ? 'Advanced' : c.hoursCompleted >= 15 ? 'Proficient' : 'Developing',
    verifiedById: c.verifiedById, verifiedByName: c.verifiedByName ?? 'UniVerse staff', occurredAt: c.issuedAt,
  });
}

/** A verified volunteer shift (upgrade 5): the project's skills, checked in on site. */
export async function evidenceFromShift(v: { userId: string; checkinId: string; title: string; projectName: string; organization: string; minutes: number; skills: unknown; verifiedById?: string | null; verifiedByName?: string | null; at: Date }) {
  const asked = Array.isArray(v.skills) ? (v.skills as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const hours = Math.round((v.minutes / 60) * 10) / 10;
  await record({
    userId: v.userId, kind: 'IMPACT', sourceId: `shift:${v.checkinId}`, skills: asked.length ? asked : ['Social impact', 'Teamwork'],
    title: `Volunteering: ${v.title}`, detail: `${hours} h · ${v.projectName} · ${v.organization}`, level: 'Developing',
    verifiedById: v.verifiedById ?? null, verifiedByName: v.verifiedByName ?? 'Checked in on site', occurredAt: v.at,
  });
}

/** Never lets evidence break the action that triggered it (grading, submitting, issuing). */
/** A teacher verified someone's part in a class's or study group's work (Stage 4 · 4.3, fair group work). */
export async function evidenceFromGroupWork(g: { userId: string; spaceKey: string; spaceTitle: string; skills: string[]; level: string; detail: string; teacher: { id: string; name: string } }) {
  if (!g.skills.length) return forget(g.userId, 'PROJECT', g.spaceKey);
  await record({
    userId: g.userId, kind: 'PROJECT', sourceId: g.spaceKey, skills: g.skills, title: `Group work · ${g.spaceTitle}`, detail: g.detail,
    level: g.level, verifiedById: g.teacher.id, verifiedByName: g.teacher.name,
  });
}

export const safely = (p: Promise<unknown>) => p.catch((e) => console.error('skill evidence', e));

export interface EvidenceGroup {
  skill: string; label: string; count: number; best: string | null; last: string;
  items: { id: string; kind: string; title: string; detail: string | null; level: string | null; verifiedByName: string | null; occurredAt: string; hidden: boolean }[];
}
const RANK: Record<string, number> = { Developing: 1, Proficient: 2, Advanced: 3 };

/** Evidence grouped by skill, strongest first. The public passport leaves hidden items out. */
export async function evidenceGroups(userId: string, includeHidden: boolean): Promise<EvidenceGroup[]> {
  const rows = await prisma.skillEvidence.findMany({
    where: { userId, ...(includeHidden ? {} : { hidden: false }) }, orderBy: { occurredAt: 'desc' }, take: 300,
    select: { id: true, skill: true, label: true, kind: true, title: true, detail: true, level: true, verifiedByName: true, occurredAt: true, hidden: true },
  });
  const groups = new Map<string, EvidenceGroup>();
  for (const r of rows) {
    const g = groups.get(r.skill) ?? { skill: r.skill, label: r.label, count: 0, best: null, last: r.occurredAt.toISOString(), items: [] };
    if (!r.hidden) {
      g.count += 1;
      if (r.level && (RANK[r.level] ?? 0) > (RANK[g.best ?? ''] ?? 0)) g.best = r.level;
    }
    g.items.push({ ...r, occurredAt: r.occurredAt.toISOString() });
    groups.set(r.skill, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (RANK[b.best ?? ''] ?? 0) - (RANK[a.best ?? ''] ?? 0) || a.label.localeCompare(b.label)).slice(0, 30);
}
