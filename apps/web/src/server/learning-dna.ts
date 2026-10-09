import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { bandOf, masteryOf, nextBest, reteach, type Mastery, type Observation } from '@/lib/mastery';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';

// Learning DNA (Stage 5 · D1). A course's teacher keeps its concepts (AI can propose a list from the
// course once) and tags what tests each one: quiz questions, question-bank items, rubric criteria
// (AI can suggest tags). Each student's mastery of each concept is worked out when it's looked at,
// from their quiz answers (right / wrong) and the teacher's rubric scores (a share of the points),
// newest counting most (src/lib/mastery.ts); practice from second chances (D10) adds to it. Students
// see their own map and what to study next; teachers see the class (concept × student) and what to
// re-teach. Students never see anyone else's.

const MAX_CONCEPTS = 60;
export type TagKind = 'QUESTION' | 'BANK' | 'CRITERION';
const KINDS: TagKind[] = ['QUESTION', 'BANK', 'CRITERION'];
const parse = <T,>(v: unknown, fallback: T): T => { if (typeof v !== 'string') return (v as T) ?? fallback; try { return JSON.parse(v) as T; } catch { return fallback; } };

async function access(user: SessionUser, courseId: string, manage = false) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('That course isn’t one of yours.');
  if (manage && !a.canManage) throw new ForbiddenException('Only the course’s teacher changes its concepts.');
  return a;
}

// ── Concepts and tags (teachers) ────────────────────────────────────────────────────────────

/** GET /api/courses/:id/concepts: the concepts in order, with how many things test each. */
export async function listConcepts(user: SessionUser, courseId: string) {
  const a = await access(user, courseId);
  const concepts = await prisma.courseConcept.findMany({ where: { courseId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, description: true, parentId: true, position: true, _count: { select: { tags: true } } } });
  return { canManage: a.canManage, course: { id: a.course.id, code: a.course.code, name: a.course.name }, concepts: concepts.map((c) => ({ ...c, tagged: c._count.tags, _count: undefined })) };
}

/**
 * POST /api/courses/:id/concepts { action: 'add', concepts: [{ name, description?, parent? }] }
 * | { action: 'edit', id, name, description?, parentId? } | { action: 'remove', id } | { action: 'order', ids }
 */
export async function conceptAction(user: SessionUser, courseId: string, b: Record<string, unknown>) {
  await access(user, courseId, true);
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  switch (b.action) {
    case 'add': {
      const list = (Array.isArray(b.concepts) ? b.concepts : []).slice(0, 30).map((x) => (x ?? {}) as Record<string, unknown>);
      const existing = await prisma.courseConcept.findMany({ where: { courseId }, select: { id: true, name: true, position: true } });
      if (existing.length + list.length > MAX_CONCEPTS) throw new BadRequestException(`Up to ${MAX_CONCEPTS} concepts per course.`);
      const names = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
      let position = Math.max(-1, ...existing.map((c) => c.position)) + 1;
      const added: string[] = [];
      // Parents first, so children can point at them by name.
      const ordered = [...list.filter((x) => !text(x.parent, 80)), ...list.filter((x) => !!text(x.parent, 80))];
      for (const x of ordered) {
        const name = text(x.name, 80);
        if (!name || names.has(name.toLowerCase())) continue;
        const parentId = names.get(text(x.parent, 80).toLowerCase()) ?? null;
        const c = await prisma.courseConcept.create({ data: { courseId, name, description: text(x.description, 300) || null, parentId, position: position++ }, select: { id: true } });
        names.set(name.toLowerCase(), c.id);
        added.push(name);
      }
      if (!added.length) throw new BadRequestException(list.length ? 'Those concepts are in the list already.' : 'Name a concept.');
      return { added };
    }
    case 'edit': {
      const id = typeof b.id === 'string' ? b.id : '';
      const name = text(b.name, 80);
      if (!name) throw new BadRequestException('Name the concept.');
      const c = await prisma.courseConcept.findFirst({ where: { id, courseId }, select: { id: true } });
      if (!c) throw new NotFoundException('That concept isn’t in this course.');
      const clash = await prisma.courseConcept.findFirst({ where: { courseId, name, id: { not: id } }, select: { id: true } });
      if (clash) throw new ConflictException('There’s already a concept with that name.');
      const parentId = typeof b.parentId === 'string' && b.parentId !== id ? (await prisma.courseConcept.findFirst({ where: { id: b.parentId, courseId }, select: { id: true } }))?.id ?? null : null;
      await prisma.courseConcept.update({ where: { id }, data: { name, description: text(b.description, 300) || null, parentId } });
      return { saved: true };
    }
    case 'remove': {
      const res = await prisma.courseConcept.deleteMany({ where: { id: typeof b.id === 'string' ? b.id : '', courseId } });
      if (!res.count) throw new NotFoundException('That concept isn’t in this course.');
      return { removed: true };
    }
    case 'order': {
      const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_CONCEPTS) : [];
      // One statement: each concept's position is its place in the list.
      if (ids.length) await prisma.$executeRawUnsafe(`UPDATE course_concepts SET position = (SELECT key FROM json_each(?1) WHERE value = course_concepts.id) WHERE "courseId" = ?2 AND id IN (SELECT value FROM json_each(?1))`, JSON.stringify(ids), courseId);
      return { ordered: ids.length };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

/** What can be tagged in a course: quizzes' questions and assignments' rubric criteria, with their concepts. */
export async function taggables(user: SessionUser, courseId: string) {
  await access(user, courseId, true);
  const [quizzes, assignments, concepts] = await Promise.all([
    prisma.quiz.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, questions: { orderBy: { order: 'asc' }, select: { id: true, question: true } } } }),
    prisma.assignment.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, rubric: true } }),
    prisma.courseConcept.findMany({ where: { courseId }, select: { id: true } }),
  ]);
  const refs = [...quizzes.flatMap((q) => q.questions.map((x) => x.id)), ...assignments.flatMap((a) => parse<{ id: string }[]>(a.rubric, []).map((c) => `${a.id}:${c.id}`))];
  const tags = refs.length && concepts.length ? await prisma.conceptTag.findMany({ where: { conceptId: { in: concepts.map((c) => c.id) } }, select: { kind: true, refId: true, conceptId: true } }) : [];
  const of = (kind: TagKind, refId: string) => tags.filter((t) => t.kind === kind && t.refId === refId).map((t) => t.conceptId);
  return {
    quizzes: quizzes.map((q) => ({ id: q.id, title: q.title, items: q.questions.map((x) => ({ refId: x.id, text: x.question, concepts: of('QUESTION', x.id) })) })),
    assignments: assignments.map((a) => ({ id: a.id, title: a.title, items: parse<{ id: string; criterion: string; points: number }[]>(a.rubric, []).map((c) => ({ refId: `${a.id}:${c.id}`, text: c.criterion, concepts: of('CRITERION', `${a.id}:${c.id}`) })) })),
  };
}

/** POST /api/courses/:id/concepts/tags { kind, refId, conceptIds } or { items: [{ kind, refId, conceptIds }] }: what each item tests (replaces its tags). A few statements however many items. */
export async function setTags(user: SessionUser, courseId: string, b: Record<string, unknown>) {
  await access(user, courseId, true);
  const raw = (Array.isArray(b.items) ? b.items : [b]).slice(0, 80).map((x) => (x ?? {}) as Record<string, unknown>);
  const items = raw.map((it) => ({ kind: KINDS.find((k) => k === it.kind), refId: typeof it.refId === 'string' ? it.refId.slice(0, 120) : '', conceptIds: Array.isArray(it.conceptIds) ? it.conceptIds : [] }))
    .filter((it): it is { kind: TagKind; refId: string; conceptIds: unknown[] } => !!it.kind && !!it.refId);
  if (!items.length) throw new BadRequestException('Nothing to tag.');
  const [concepts, questions, bank, assignments] = await Promise.all([
    prisma.courseConcept.findMany({ where: { courseId }, select: { id: true } }),
    items.some((i) => i.kind === 'QUESTION') ? prisma.quizQuestion.findMany({ where: { quiz: { courseId }, id: { in: items.filter((i) => i.kind === 'QUESTION').map((i) => i.refId) } }, select: { id: true } }) : Promise.resolve([]),
    items.some((i) => i.kind === 'BANK') ? prisma.bankQuestion.findMany({ where: { courseId, id: { in: items.filter((i) => i.kind === 'BANK').map((i) => i.refId) } }, select: { id: true } }) : Promise.resolve([]),
    items.some((i) => i.kind === 'CRITERION') ? prisma.assignment.findMany({ where: { courseId, id: { in: [...new Set(items.filter((i) => i.kind === 'CRITERION').map((i) => i.refId.split(':')[0]))] } }, select: { id: true, rubric: true } }) : Promise.resolve([]),
  ]);
  const ok = new Set([...questions.map((q) => `QUESTION:${q.id}`), ...bank.map((q) => `BANK:${q.id}`), ...assignments.flatMap((a) => parse<{ id: string }[]>(a.rubric, []).map((c) => `CRITERION:${a.id}:${c.id}`))]);
  if (items.some((i) => !ok.has(`${i.kind}:${i.refId}`))) throw new NotFoundException('That question or criterion isn’t in this course.');
  const known = new Set(concepts.map((c) => c.id));
  const rows = items.flatMap((i) => [...new Set(i.conceptIds.filter((x): x is string => typeof x === 'string' && known.has(x)))].slice(0, 5).map((conceptId) => ({ conceptId, kind: i.kind, refId: i.refId })));
  // The items were checked to be this course's, so their ids are enough (and stay within D1's 100 values).
  await prisma.conceptTag.deleteMany({ where: { refId: { in: [...new Set(items.map((i) => i.refId))] } } });
  if (rows.length) await prisma.conceptTag.createMany({ data: rows });
  return { saved: items.length, tags: rows.length };
}

// ── AI suggestions ──────────────────────────────────────────────────────────────────────────

async function ai(user: SessionUser) {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
}

/** POST /api/courses/:id/concepts/suggest: a proposed concept list from the course (not saved: the teacher picks). */
export async function suggestConcepts(user: SessionUser, courseId: string) {
  const a = await access(user, courseId, true);
  await ai(user);
  const [course, materials, questions, assignments] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { description: true, department: true } }),
    prisma.material.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' }, take: 40, select: { title: true } }),
    prisma.quizQuestion.findMany({ where: { quiz: { courseId } }, take: 40, select: { question: true } }),
    prisma.assignment.findMany({ where: { courseId }, take: 15, select: { title: true } }),
  ]);
  const existing = await prisma.courseConcept.findMany({ where: { courseId }, select: { name: true } });
  const prompt = [
    `Course: ${a.course.code} · ${a.course.name}${course?.department ? ` (${course.department})` : ''}`,
    course?.description ? `About: ${course.description.slice(0, 800)}` : '',
    materials.length ? `Materials: ${materials.map((m) => m.title).join('; ').slice(0, 1500)}` : '',
    assignments.length ? `Assignments: ${assignments.map((x) => x.title).join('; ').slice(0, 600)}` : '',
    questions.length ? `Quiz questions: ${questions.map((q) => q.question.slice(0, 120)).join(' | ').slice(0, 2500)}` : '',
    existing.length ? `Already listed (don't repeat): ${existing.map((c) => c.name).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const out = await geminiJson<{ concepts: { name: string; description: string; parent?: string }[] }>(
    'You map what a course teaches into 8 to 16 concepts a student can master one by one: short names (2–5 words), a one-sentence description of what mastering it means, and optionally a broader concept from the same list as parent (at most two levels). In the order they are usually taught. Plain words, no numbering.',
    prompt,
    { type: 'object', properties: { concepts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, parent: { type: 'string' } }, required: ['name', 'description'] } } }, required: ['concepts'] },
    1500,
  );
  if (!out?.concepts?.length) throw new HttpException('The AI couldn’t suggest concepts this time. Try again, or add them yourself.', 503);
  const taken = new Set(existing.map((c) => c.name.toLowerCase()));
  return { concepts: out.concepts.filter((c) => c.name && !taken.has(c.name.toLowerCase())).slice(0, 20).map((c) => ({ name: c.name.slice(0, 80), description: (c.description ?? '').slice(0, 300), parent: c.parent?.slice(0, 80) || undefined })) };
}

/** POST /api/courses/:id/concepts/suggest-tags { quizId | assignmentId }: which concepts each item tests (not saved). */
export async function suggestTags(user: SessionUser, courseId: string, b: Record<string, unknown>) {
  await access(user, courseId, true);
  const concepts = await prisma.courseConcept.findMany({ where: { courseId }, orderBy: { position: 'asc' }, select: { id: true, name: true, description: true } });
  if (!concepts.length) throw new BadRequestException('Add the course’s concepts first.');
  let items: { refId: string; kind: TagKind; text: string }[] = [];
  if (typeof b.quizId === 'string') {
    const q = await prisma.quiz.findFirst({ where: { id: b.quizId, courseId }, select: { questions: { orderBy: { order: 'asc' }, take: 60, select: { id: true, question: true, options: true } } } });
    if (!q) throw new NotFoundException('That quiz isn’t in this course.');
    items = q.questions.map((x) => ({ refId: x.id, kind: 'QUESTION', text: `${x.question} (options: ${parse<string[]>(x.options, []).join(' / ')})`.slice(0, 400) }));
  } else if (typeof b.assignmentId === 'string') {
    const a = await prisma.assignment.findFirst({ where: { id: b.assignmentId, courseId }, select: { id: true, title: true, rubric: true } });
    if (!a) throw new NotFoundException('That assignment isn’t in this course.');
    items = parse<{ id: string; criterion: string; description?: string }[]>(a.rubric, []).map((c) => ({ refId: `${a.id}:${c.id}`, kind: 'CRITERION', text: `${a.title}: ${c.criterion}${c.description ? ` (${c.description})` : ''}`.slice(0, 400) }));
  } else throw new BadRequestException('Choose a quiz or an assignment.');
  if (!items.length) return { items: [] };
  await ai(user);
  const out = await geminiJson<{ items: { n: number; concepts: number[] }[] }>(
    'For each numbered item (a quiz question or a rubric criterion), list the numbers of the concepts it tests: usually one, at most three. Use only concept numbers from the list. Leave an item out if no concept fits.',
    `Concepts:\n${concepts.map((c, i) => `${i + 1}. ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n')}\n\nItems:\n${items.map((it, i) => `${i + 1}. ${it.text}`).join('\n')}`,
    { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, concepts: { type: 'array', items: { type: 'integer' } } }, required: ['n', 'concepts'] } } }, required: ['items'] },
    1200,
  );
  if (!out?.items) throw new HttpException('The AI couldn’t suggest tags this time. Try again, or tag them yourself.', 503);
  return {
    items: out.items.filter((x) => items[x.n - 1]).map((x) => ({ kind: items[x.n - 1].kind, refId: items[x.n - 1].refId, conceptIds: [...new Set(x.concepts.map((k) => concepts[k - 1]?.id).filter((id): id is string => !!id))].slice(0, 3) })),
  };
}

// ── Mastery ─────────────────────────────────────────────────────────────────────────────────

/** Every tagged observation for these students in a course, by student then concept. */
async function observations(courseId: string, studentIds: string[]) {
  const concepts = await prisma.courseConcept.findMany({ where: { courseId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, description: true, parentId: true, position: true } });
  const out = new Map<string, Map<string, Observation[]>>();
  if (!concepts.length || !studentIds.length) return { concepts, out };
  const tags = await prisma.conceptTag.findMany({ where: { conceptId: { in: concepts.map((c) => c.id) } }, select: { kind: true, refId: true, conceptId: true } });
  const byRef = new Map<string, string[]>();
  for (const t of tags) byRef.set(t.refId, [...(byRef.get(t.refId) ?? []), t.conceptId]);
  const add = (student: string, concept: string, o: Observation) => {
    const m = out.get(student) ?? new Map<string, Observation[]>();
    m.set(concept, [...(m.get(concept) ?? []), o]);
    out.set(student, m);
  };
  const questionIds = tags.filter((t) => t.kind === 'QUESTION').map((t) => t.refId);
  const assignmentIds = [...new Set(tags.filter((t) => t.kind === 'CRITERION').map((t) => t.refId.split(':')[0]))];
  const ids = studentIds.slice(0, 90);
  const [questions, submissions, assignments, returned] = await Promise.all([
    questionIds.length ? prisma.quizQuestion.findMany({ where: { quiz: { courseId } }, select: { id: true, quizId: true, correctAnswer: true } }) : Promise.resolve([]),
    questionIds.length ? prisma.quizSubmission.findMany({ where: { quiz: { courseId }, studentId: { in: ids } }, select: { quizId: true, studentId: true, answers: true, submittedAt: true }, take: 5000 }) : Promise.resolve([]),
    assignmentIds.length ? prisma.assignment.findMany({ where: { id: { in: assignmentIds.slice(0, 90) }, courseId }, select: { id: true, rubric: true } }) : Promise.resolve([]),
    assignmentIds.length ? prisma.assignmentSubmission.findMany({ where: { assignmentId: { in: assignmentIds.slice(0, 90) }, studentId: { in: ids }, status: 'RETURNED' }, select: { assignmentId: true, studentId: true, criteriaScores: true, returnedAt: true }, take: 5000 }) : Promise.resolve([]),
  ]);
  for (const s of submissions) {
    const answers = parse<Record<string, string>>(s.answers, {});
    for (const q of questions.filter((x) => x.quizId === s.quizId)) {
      const cs = byRef.get(q.id);
      if (!cs) continue;
      const given = answers[q.id];
      if (given == null || given === '') continue;
      for (const c of cs) add(s.studentId, c, { at: s.submittedAt.getTime(), outcome: given === q.correctAnswer ? 1 : 0, weight: 1 });
    }
  }
  for (const s of returned) {
    const rubric = parse<{ id: string; points: number }[]>(assignments.find((a) => a.id === s.assignmentId)?.rubric, []);
    for (const sc of parse<{ id: string; score: number }[]>(s.criteriaScores, [])) {
      const crit = rubric.find((r) => r.id === sc.id);
      const cs = byRef.get(`${s.assignmentId}:${sc.id}`);
      if (!crit || !cs || !(crit.points > 0)) continue;
      for (const c of cs) add(s.studentId, c, { at: (s.returnedAt ?? new Date()).getTime(), outcome: Math.max(0, Math.min(1, Number(sc.score) / crit.points)), weight: 1.5 });
    }
  }
  return { concepts, out };
}

/** A concept's evidence: its own and its sub-concepts' (knowing loops and recursion is evidence of control flow). */
function withChildren(concepts: { id: string; parentId: string | null }[], mine: Map<string, Observation[]> | undefined, id: string) {
  return [...(mine?.get(id) ?? []), ...concepts.filter((c) => c.parentId === id).flatMap((c) => mine?.get(c.id) ?? [])];
}

/** GET /api/courses/:id/mastery?student=: one student's map (theirs, or any of the class for the teacher) and what to study next. */
export async function studentMastery(user: SessionUser, courseId: string, studentParam: string | null) {
  const a = await access(user, courseId);
  const studentId = a.canManage && studentParam ? studentParam : user.id;
  if (a.canManage && studentParam && !(await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } }))) throw new NotFoundException('That student isn’t in this course.');
  if (!a.canManage && user.role !== 'STUDENT') throw new ForbiddenException('This is for the course’s students and teacher.');
  const { concepts, out } = await observations(courseId, [studentId]);
  const mine = out.get(studentId);
  const rows = concepts.map((c) => ({ ...c, mastery: masteryOf(withChildren(concepts, mine, c.id)) }));
  // Study the specific sub-concepts, not the broad concept above them.
  const leaves = rows.filter((r) => !concepts.some((c) => c.parentId === r.id));
  const name = studentId === user.id ? null : (await prisma.user.findUnique({ where: { id: studentId }, select: { name: true } }))?.name ?? null;
  return {
    course: { id: a.course.id, code: a.course.code, name: a.course.name }, student: name,
    concepts: rows.map((r) => ({ id: r.id, name: r.name, description: r.description, parentId: r.parentId, band: bandOf(r.mastery), ...r.mastery })),
    next: nextBest(leaves).map((r) => ({ id: r.id, name: r.name, band: bandOf(r.mastery) })),
    counts: { mastered: rows.filter((r) => bandOf(r.mastery) === 'mastered').length, total: rows.length },
  };
}

/** GET /api/courses/:id/mastery/class: the class grid (concept × student) and what to re-teach. Teachers only. */
export async function classMastery(user: SessionUser, courseId: string) {
  const a = await access(user, courseId, true);
  const students = await prisma.enrollment.findMany({ where: { courseId }, select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: 'asc' } }, take: 90 });
  const ids = students.map((s) => s.student.id);
  const { concepts, out } = await observations(courseId, ids);
  const grid = concepts.map((c) => ({ conceptId: c.id, levels: ids.map((id) => { const o = withChildren(concepts, out.get(id), c.id); return o.length ? masteryOf(o) : null; }) }));
  const cell = (m: Mastery | null) => (m ? { level: m.level, n: m.n, band: bandOf(m) } : null);
  return {
    course: { id: a.course.id, code: a.course.code, name: a.course.name },
    students: students.map((s) => s.student),
    concepts: concepts.map((c, i) => ({ id: c.id, name: c.name, parentId: c.parentId, cells: grid[i].levels.map(cell) })),
    reteach: reteach(grid).map((r) => ({ ...r, name: concepts.find((c) => c.id === r.conceptId)?.name ?? '' })),
    untagged: concepts.length > 0 && !grid.some((g) => g.levels.some((l) => l)),
  };
}
