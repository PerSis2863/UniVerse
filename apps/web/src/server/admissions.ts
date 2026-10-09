import { createHash, randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { saveFile } from '@/lib/storage';
import type { SessionUser } from '@/lib/server-auth';
import {
  DEFAULT_OFFER, FILE_TYPES, MAX_FILE_BYTES, MOVABLE, STAGE_FOR_FAMILY, STAGE_LABEL, STAGES,
  checkAnswers, cleanFields, type Answers, type FormField, type Stage,
} from '@/lib/admission-form';
import { notify } from './email';
import { need } from './permissions';
import { BadRequestException, HttpException, NotFoundException } from './http';

// Admissions (Stage 5 · B15.1). An admin opens a round: dates, the classes admitted students join,
// an application form (src/lib/admission-form.ts) and an offer letter template. Families apply on
// a public page (/apply/<slug>) without an account, documents included in the same request (so
// there's no open upload address), at most 5 applications an hour from one network. They follow
// their application on a private link (/apply/status/<token>); no email is sent, so the page tells
// them to keep the link. Admins move applications through stages, each scores them (1–5), keep
// notes, write to the family (shown on their page), make an offer the family accepts or declines
// there, and enrol accepted students: a pre-approved student invitation for the student's email
// and their classes waiting for them (pending_enrolments, src/server/bulk-import.ts).

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PER_HOUR = 5;
const FINAL: Stage[] = ['ENROLLED', 'DECLINED', 'REJECTED', 'WITHDRAWN'];
type Event = { at: string; by?: string; byName?: string; type: string; note?: string };
const events = (h: string) => { try { const x = JSON.parse(h); return Array.isArray(x) ? (x as Event[]) : []; } catch { return []; } };
const withEvent = (h: string, e: Omit<Event, 'at'>) => JSON.stringify([...events(h), { at: new Date().toISOString(), ...e }].slice(-200));
const parse = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };
const day = (v: unknown, end = false) => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  const d = new Date(`${s}T${end ? '23:59:59' : '00:00:00'}Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(d.getTime()) ? d : null;
};
/** A short reference families can read out on the phone: ABCD-2345. */
export function newRef() {
  const b = randomBytes(8);
  const s = Array.from(b, (x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const isOpen = (r: { opensAt: Date; closesAt: Date; closedAt: Date | null }, now = Date.now()) => !r.closedAt && r.opensAt.getTime() <= now && r.closesAt.getTime() >= now;
/** open, upcoming (not open yet), ended (past its closing date) or closed (by an admin). */
export const phaseOf = (r: { opensAt: Date; closesAt: Date; closedAt: Date | null }, now = Date.now()) =>
  r.closedAt ? 'closed' : r.opensAt.getTime() > now ? 'upcoming' : r.closesAt.getTime() < now ? 'ended' : 'open';
const school = async () => (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { name: true } }))?.name ?? 'Our school';

// ── Rounds (admins) ─────────────────────────────────────────────────────────────────────────

/** GET /api/admissions: every round with how many applications are at each stage; the classes to choose from. */
export async function admissionRounds(user: SessionUser) {
  await need(user, 'admissions.review');
  const [rounds, counts, courses] = await Promise.all([
    prisma.admissionRound.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, slug: true, title: true, opensAt: true, closesAt: true, closedAt: true, createdAt: true, courseIds: true } }),
    prisma.admissionApplication.groupBy({ by: ['roundId', 'stage'], _count: { _all: true } }),
    prisma.course.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 300 }),
  ]);
  return {
    courses,
    school: await school(),
    rounds: rounds.map((r) => {
      const byStage = Object.fromEntries(counts.filter((c) => c.roundId === r.id).map((c) => [c.stage, c._count._all]));
      return { ...r, courseIds: parse<string[]>(r.courseIds, []), open: isOpen(r), phase: phaseOf(r), byStage, total: Object.values(byStage).reduce((a, b) => a + b, 0) };
    }),
  };
}

function readRound(b: Record<string, unknown>) {
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
  if (!title) throw new BadRequestException('Give the round a name, like “Admissions 2027–28, Grade 6”.');
  const opensAt = day(b.opensAt), closesAt = day(b.closesAt, true);
  if (!opensAt || !closesAt) throw new BadRequestException('Choose when applications open and close.');
  if (closesAt <= opensAt) throw new BadRequestException('It closes before it opens.');
  let fields: FormField[];
  try { fields = cleanFields(b.fields); } catch (e) { throw new BadRequestException((e as Error).message); }
  const courseIds = Array.isArray(b.courseIds) ? [...new Set(b.courseIds.filter((x): x is string => typeof x === 'string'))].slice(0, 10) : [];
  const intro = typeof b.intro === 'string' ? b.intro.trim().slice(0, 3000) || null : null;
  const offerTemplate = typeof b.offerTemplate === 'string' && b.offerTemplate.trim() ? b.offerTemplate.trim().slice(0, 5000) : DEFAULT_OFFER;
  return { title, intro, opensAt, closesAt, fields, courseIds, offerTemplate };
}

async function checkCourses(ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.course.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new BadRequestException('One of those classes doesn’t exist any more.');
}

/** POST /api/admissions { title, intro?, opensAt, closesAt, fields, courseIds, offerTemplate? }: a new round. */
export async function createRound(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'admissions.manage');
  const r = readRound(b);
  await checkCourses(r.courseIds);
  const base = r.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'apply';
  const slug = `${base}-${randomBytes(3).toString('hex')}`;
  const round = await prisma.admissionRound.create({
    data: { slug, title: r.title, intro: r.intro, opensAt: r.opensAt, closesAt: r.closesAt, fields: JSON.stringify(r.fields), courseIds: JSON.stringify(r.courseIds), offerTemplate: r.offerTemplate, createdById: user.id },
    select: { id: true, slug: true, title: true },
  });
  return round;
}

/** GET /api/admissions/:id?stage=&q=: the round (with its form) and its applications. */
export async function roundDetail(user: SessionUser, id: string, q: URLSearchParams) {
  await need(user, 'admissions.review');
  const round = await prisma.admissionRound.findUnique({ where: { id } });
  if (!round) throw new NotFoundException('That round doesn’t exist.');
  const stage = STAGES.find((s) => s === q.get('stage'));
  const text = (q.get('q') ?? '').trim().slice(0, 60);
  const apps = await prisma.admissionApplication.findMany({
    where: { roundId: id, ...(stage ? { stage } : {}), ...(text ? { OR: [{ studentName: { contains: text } }, { contactName: { contains: text } }, { contactEmail: { contains: text } }, { ref: { contains: text.toUpperCase() } }] } : {}) },
    orderBy: { createdAt: 'desc' }, take: 500,
    select: { id: true, ref: true, studentName: true, contactName: true, contactEmail: true, stage: true, files: true, createdAt: true, updatedAt: true, reviews: { select: { score: true, reviewerId: true } } },
  });
  const counts = await prisma.admissionApplication.groupBy({ by: ['stage'], where: { roundId: id }, _count: { _all: true } });
  return {
    round: { ...round, fields: parse<FormField[]>(round.fields, []), courseIds: parse<string[]>(round.courseIds, []), open: isOpen(round), phase: phaseOf(round) },
    byStage: Object.fromEntries(counts.map((c) => [c.stage, c._count._all])),
    applications: apps.map((a) => ({
      id: a.id, ref: a.ref, studentName: a.studentName, contactName: a.contactName, contactEmail: a.contactEmail, stage: a.stage, createdAt: a.createdAt, updatedAt: a.updatedAt,
      documents: parse<unknown[]>(a.files, []).length,
      score: a.reviews.length ? Math.round((a.reviews.reduce((s, r) => s + r.score, 0) / a.reviews.length) * 10) / 10 : null,
      reviews: a.reviews.length, mine: a.reviews.find((r) => r.reviewerId === user.id)?.score ?? null,
    })),
  };
}

/** POST /api/admissions/:id { action: 'save', …round } | { action: 'close' | 'reopen' } */
export async function roundAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'admissions.manage');
  const round = await prisma.admissionRound.findUnique({ where: { id }, select: { id: true } });
  if (!round) throw new NotFoundException('That round doesn’t exist.');
  if (b.action === 'close' || b.action === 'reopen') {
    await prisma.admissionRound.update({ where: { id }, data: { closedAt: b.action === 'close' ? new Date() : null } });
    return { closed: b.action === 'close' };
  }
  if (b.action !== 'save') throw new BadRequestException('Unknown action.');
  const r = readRound(b);
  await checkCourses(r.courseIds);
  await prisma.admissionRound.update({ where: { id }, data: { title: r.title, intro: r.intro, opensAt: r.opensAt, closesAt: r.closesAt, fields: JSON.stringify(r.fields), courseIds: JSON.stringify(r.courseIds), offerTemplate: r.offerTemplate } });
  return { saved: true };
}

// ── Applications (admins) ───────────────────────────────────────────────────────────────────

const appSelect = {
  id: true, roundId: true, ref: true, studentName: true, studentDob: true, studentEmail: true, contactName: true, contactEmail: true, contactPhone: true, relation: true,
  answers: true, files: true, stage: true, message: true, offerLetter: true, offerSentAt: true, offerExpiresAt: true, respondedAt: true, enrolledAt: true, history: true, createdAt: true, updatedAt: true,
  round: { select: { title: true, fields: true, courseIds: true, offerTemplate: true } },
  reviews: { select: { score: true, comment: true, updatedAt: true, reviewer: { select: { id: true, name: true } } }, orderBy: { updatedAt: 'desc' as const } },
} as const;

/** GET /api/admissions/applications/:id: everything about one application. */
export async function applicationDetail(user: SessionUser, id: string) {
  await need(user, 'admissions.review');
  const a = await prisma.admissionApplication.findUnique({ where: { id }, select: appSelect });
  if (!a) throw new NotFoundException('That application doesn’t exist.');
  const courseIds = parse<string[]>(a.round.courseIds, []);
  const courses = courseIds.length ? await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { code: true, name: true } }) : [];
  return {
    ...a, answers: parse<Answers>(a.answers, {}), files: parse<{ fieldId: string; url: string; name: string }[]>(a.files, []), history: events(a.history),
    round: { title: a.round.title, fields: parse<FormField[]>(a.round.fields, []), courses, offerTemplate: a.round.offerTemplate },
    myReview: a.reviews.find((r) => r.reviewer.id === user.id) ?? null,
  };
}

/**
 * POST /api/admissions/applications/:id. Actions: 'stage' { stage, note? } (Received, In review,
 * Interview, Waiting list, Not offered), 'message' { message } (shown to the family), 'note' { note }
 * (admins only), 'score' { score 1–5, comment? }, 'offer' { letter, expiresAt? }, 'respond'
 * { answer: 'accept' | 'decline' } (the family told the school directly), 'enrol' { studentEmail }.
 */
export async function applicationAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, b.action === 'score' ? 'admissions.review' : 'admissions.manage');
  const a = await prisma.admissionApplication.findUnique({ where: { id }, select: { id: true, stage: true, history: true, studentName: true, studentEmail: true, contactName: true, offerExpiresAt: true, round: { select: { title: true, courseIds: true, offerTemplate: true } } } });
  if (!a) throw new NotFoundException('That application doesn’t exist.');
  const stage = a.stage as Stage;
  const by = { by: user.id, byName: user.name };
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) || undefined : undefined;
  const save = (data: Record<string, unknown>, e: Omit<Event, 'at' | 'by' | 'byName'>) =>
    prisma.admissionApplication.update({ where: { id }, data: { ...data, history: withEvent(a.history, { ...by, ...e }), updatedAt: new Date() } });
  switch (b.action) {
    case 'stage': {
      const to = MOVABLE.find((s) => s === b.stage);
      if (!to) throw new BadRequestException('Choose a stage.');
      if (stage === 'ENROLLED') throw new BadRequestException('This student is enrolled.');
      if (to === stage) return { stage };
      await save({ stage: to }, { type: `stage:${to}`, note });
      return { stage: to };
    }
    case 'message': {
      const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) || null : null;
      await save({ message }, { type: 'message', note: message ?? '(cleared)' });
      return { message };
    }
    case 'note': {
      if (!note) throw new BadRequestException('Write a note.');
      await save({}, { type: 'note', note });
      return { noted: true };
    }
    case 'score': {
      const score = Number(b.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new BadRequestException('Score from 1 to 5.');
      const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) || null : null;
      await prisma.admissionReview.upsert({ where: { applicationId_reviewerId: { applicationId: id, reviewerId: user.id } }, update: { score, comment, updatedAt: new Date() }, create: { applicationId: id, reviewerId: user.id, score, comment } });
      return { score };
    }
    case 'offer': {
      if (FINAL.includes(stage) || stage === 'ACCEPTED') throw new BadRequestException(`This application is ${STAGE_LABEL[stage].toLowerCase()}.`);
      const letter = typeof b.letter === 'string' && b.letter.trim() ? b.letter.trim().slice(0, 8000) : '';
      if (!letter) throw new BadRequestException('Write the offer letter.');
      const expiresAt = b.expiresAt ? day(b.expiresAt, true) : null;
      if (b.expiresAt && (!expiresAt || expiresAt.getTime() < Date.now())) throw new BadRequestException('The answer-by date should be in the future.');
      await save({ stage: 'OFFERED', offerLetter: letter, offerSentAt: new Date(), offerExpiresAt: expiresAt, respondedAt: null }, { type: 'offer', note });
      return { stage: 'OFFERED' };
    }
    case 'respond': {
      if (stage !== 'OFFERED') throw new BadRequestException('There’s no open offer.');
      const to = b.answer === 'accept' ? 'ACCEPTED' : b.answer === 'decline' ? 'DECLINED' : null;
      if (!to) throw new BadRequestException('Accept or decline?');
      await save({ stage: to, respondedAt: new Date() }, { type: `answered:${to}`, note: note ?? 'Recorded by the school' });
      return { stage: to };
    }
    case 'enrol': {
      if (stage !== 'ACCEPTED') throw new BadRequestException('Only accepted offers can be enrolled.');
      const email = typeof b.studentEmail === 'string' ? b.studentEmail.trim().toLowerCase() : (a.studentEmail ?? '');
      if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter the email the student will sign up with.');
      const courseIds = parse<string[]>(a.round.courseIds, []);
      const [user0] = await prisma.$queryRawUnsafe<{ id: string; role: string; name: string }[]>(`SELECT id, role, name FROM users WHERE lower(email) = ? LIMIT 1`, email);
      if (user0 && user0.role !== 'STUDENT') throw new BadRequestException(`${email} already has a ${user0.role.toLowerCase()} account. Use the student’s own email.`);
      if (user0) {
        // Already has a student account: straight into the classes.
        for (const courseId of courseIds) await prisma.enrollment.upsert({ where: { studentId_courseId: { studentId: user0.id, courseId } }, update: {}, create: { studentId: user0.id, courseId } });
      } else {
        await prisma.invitation.upsert({ where: { email }, update: { role: 'STUDENT', status: 'PENDING', expiresAt: new Date(Date.now() + 60 * 86_400_000) }, create: { email, role: 'STUDENT', status: 'PENDING', expiresAt: new Date(Date.now() + 60 * 86_400_000) } });
        for (const courseId of courseIds) await prisma.pendingEnrolment.upsert({ where: { email_courseId: { email, courseId } }, update: {}, create: { email, courseId } });
      }
      await save({ stage: 'ENROLLED', enrolledAt: new Date(), studentEmail: email }, { type: 'enrolled', note: user0 ? `Put ${user0.name} in their classes` : `Invited ${email} as a student` });
      return { stage: 'ENROLLED', invited: !user0, classes: courseIds.length };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

// ── The public form ─────────────────────────────────────────────────────────────────────────

/** GET /api/admissions/public/:slug: what the public form needs. */
export async function publicRound(slug: string) {
  const r = await prisma.admissionRound.findUnique({ where: { slug }, select: { id: true, title: true, intro: true, fields: true, opensAt: true, closesAt: true, closedAt: true } });
  if (!r) throw new NotFoundException('This application form doesn’t exist.');
  return { title: r.title, intro: r.intro, fields: parse<FormField[]>(r.fields, []), opensAt: r.opensAt, closesAt: r.closesAt, open: isOpen(r), notYet: !r.closedAt && r.opensAt.getTime() > Date.now(), school: await school() };
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * POST /api/admissions/public/:slug (multipart): `data` = JSON { student: {name, dob, email?},
 * contact: {name, email, phone?, relation?}, answers, website (must stay empty) } and one file per
 * document question as `file:<question id>`. Returns the reference and the private link's token.
 */
export async function submitApplication(slug: string, form: FormData, ip: string | null) {
  const r = await prisma.admissionRound.findUnique({ where: { slug }, select: { id: true, title: true, fields: true, opensAt: true, closesAt: true, closedAt: true, createdById: true } });
  if (!r) throw new NotFoundException('This application form doesn’t exist.');
  if (!isOpen(r)) throw new HttpException(r.opensAt.getTime() > Date.now() ? 'Applications haven’t opened yet.' : 'Applications are closed.', 410);
  const ipHash = ip ? createHash('sha256').update(`${r.id}:${ip}`).digest('base64url').slice(0, 32) : null;
  if (ipHash && (await prisma.admissionApplication.count({ where: { ipHash, createdAt: { gt: new Date(Date.now() - 3600_000) } } })) >= PER_HOUR) {
    throw new HttpException('Too many applications from this connection. Please try again in an hour.', 429);
  }
  let data: Record<string, unknown>;
  try { data = JSON.parse(String(form.get('data') ?? '{}')); } catch { throw new BadRequestException('The form didn’t arrive properly. Please try again.'); }
  // A field people can't see: robots fill it in.
  if (text(data.website, 200)) return { ref: newRef(), token: '' };
  const student = (data.student ?? {}) as Record<string, unknown>, contact = (data.contact ?? {}) as Record<string, unknown>;
  const fields = parse<FormField[]>(r.fields, []);
  const studentName = text(student.name, 120), contactName = text(contact.name, 120);
  const contactEmail = text(contact.email, 254).toLowerCase(), studentEmail = text(student.email, 254).toLowerCase() || null;
  const studentDob = text(student.dob, 10) || null;
  const errors: Record<string, string> = {};
  if (studentName.length < 2) errors.studentName = 'Enter the student’s full name.';
  if (studentDob && !/^\d{4}-\d{2}-\d{2}$/.test(studentDob)) errors.studentDob = 'Enter a date.';
  if (studentEmail && !EMAIL_RE.test(studentEmail)) errors.studentEmail = 'That doesn’t look like an email address.';
  if (contactName.length < 2) errors.contactName = 'Enter your name.';
  if (!EMAIL_RE.test(contactEmail)) errors.contactEmail = 'Enter an email address we can reach you on.';
  const answers = (typeof data.answers === 'object' && data.answers ? data.answers : {}) as Answers;
  const uploads = new Map<string, File>();
  for (const f of fields.filter((x) => x.type === 'file')) {
    const file = form.get(`file:${f.id}`);
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) errors[f.id] = 'Files up to 4 MB, please.';
      else if (!FILE_TYPES.includes(file.type)) errors[f.id] = 'Attach a PDF, JPG or PNG.';
      else uploads.set(f.id, file);
    }
  }
  Object.assign(errors, Object.fromEntries(Object.entries(checkAnswers(fields, answers, (id) => uploads.has(id))).filter(([k]) => !errors[k])));
  if (Object.keys(errors).length) throw new HttpException({ message: 'Please check the highlighted answers.', errors }, 400);
  // Only the answers to this form's questions, as text.
  const kept: Answers = {};
  for (const f of fields) {
    const v = answers[f.id];
    if (f.type === 'multi' && Array.isArray(v)) kept[f.id] = v.filter((x) => typeof x === 'string').slice(0, 30);
    else if (f.type !== 'file' && typeof v === 'string' && v.trim()) kept[f.id] = v.trim().slice(0, 5000);
  }
  const files: { fieldId: string; url: string; name: string }[] = [];
  for (const [fieldId, file] of uploads) {
    const url = await saveFile({ ownerId: r.createdById, name: file.name || 'document', mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    files.push({ fieldId, url, name: (file.name || 'document').slice(0, 120) });
  }
  const ref = newRef(), token = randomBytes(24).toString('base64url');
  await prisma.admissionApplication.create({
    data: {
      roundId: r.id, ref, token, studentName, studentDob, studentEmail, contactName, contactEmail, contactPhone: text(contact.phone, 30) || null, relation: text(contact.relation, 40) || null,
      answers: JSON.stringify(kept), files: JSON.stringify(files), ipHash, history: JSON.stringify([{ at: new Date().toISOString(), type: 'submitted', byName: contactName }]),
    },
  });
  await notify(r.createdById, { type: 'admissions', title: `New application: ${studentName}`, body: `${r.title} · from ${contactName} · ${ref}`, link: `/admin/admissions?round=${r.id}`, email: false });
  return { ref, token };
}

/** GET /api/admissions/status/:token: what the family sees on their private page. */
export async function familyStatus(token: string) {
  const a = token.length >= 20 ? await prisma.admissionApplication.findUnique({ where: { token }, select: { ref: true, studentName: true, stage: true, message: true, offerLetter: true, offerSentAt: true, offerExpiresAt: true, respondedAt: true, createdAt: true, files: true, round: { select: { title: true } } } }) : null;
  if (!a) throw new NotFoundException('This link doesn’t match an application.');
  const stage = a.stage as Stage;
  const offerOpen = stage === 'OFFERED' && (!a.offerExpiresAt || a.offerExpiresAt.getTime() > Date.now());
  return {
    school: await school(), round: a.round.title, ref: a.ref, studentName: a.studentName, submittedAt: a.createdAt,
    stage, stageLabel: STAGE_LABEL[stage], explanation: STAGE_FOR_FAMILY[stage], message: a.message,
    offer: ['OFFERED', 'ACCEPTED', 'DECLINED', 'ENROLLED'].includes(stage) && a.offerLetter ? { letter: a.offerLetter, sentAt: a.offerSentAt, expiresAt: a.offerExpiresAt, respondedAt: a.respondedAt } : null,
    canRespond: offerOpen, offerExpired: stage === 'OFFERED' && !offerOpen, canWithdraw: !FINAL.includes(stage) && stage !== 'ACCEPTED',
    documents: parse<{ name: string }[]>(a.files, []).map((f) => f.name),
  };
}

/** POST /api/admissions/status/:token { action: 'accept' | 'decline' | 'withdraw' } */
export async function familyAction(token: string, b: Record<string, unknown>) {
  const a = token.length >= 20 ? await prisma.admissionApplication.findUnique({ where: { token }, select: { id: true, stage: true, history: true, offerExpiresAt: true, studentName: true, contactName: true, round: { select: { title: true, createdById: true } } } }) : null;
  if (!a) throw new NotFoundException('This link doesn’t match an application.');
  const stage = a.stage as Stage;
  let to: Stage;
  if (b.action === 'accept' || b.action === 'decline') {
    if (stage !== 'OFFERED') throw new BadRequestException('There’s no offer to answer.');
    if (a.offerExpiresAt && a.offerExpiresAt.getTime() < Date.now()) throw new BadRequestException('The time to answer this offer has passed. Please contact the school.');
    to = b.action === 'accept' ? 'ACCEPTED' : 'DECLINED';
  } else if (b.action === 'withdraw') {
    if (FINAL.includes(stage) || stage === 'ACCEPTED') throw new BadRequestException('This application can’t be withdrawn now. Please contact the school.');
    to = 'WITHDRAWN';
  } else throw new BadRequestException('Unknown action.');
  const claim = await prisma.admissionApplication.updateMany({
    where: { id: a.id, stage },
    data: { stage: to, ...(to !== 'WITHDRAWN' ? { respondedAt: new Date() } : {}), history: withEvent(a.history, { type: to === 'WITHDRAWN' ? 'withdrawn' : `answered:${to}`, byName: a.contactName }), updatedAt: new Date() },
  });
  if (!claim.count) throw new BadRequestException('This application just changed. Reload the page.');
  const title = to === 'ACCEPTED' ? `Offer accepted: ${a.studentName}` : to === 'DECLINED' ? `Offer declined: ${a.studentName}` : `Application withdrawn: ${a.studentName}`;
  await notify(a.round.createdById, { type: 'admissions', title, body: `${a.round.title} · ${a.contactName}`, link: '/admin/admissions', email: false });
  return { stage: to };
}
