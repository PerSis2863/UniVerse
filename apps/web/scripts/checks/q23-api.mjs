// Q22 follow-ups and Q23 small items, through the API on the built Worker (pnpm local:serve):
// a flashcard review and a tutor question on the mastery map; a hybrid class (an in-person class
// linked to the class call marks a student who joins the call present); duplicate an assignment and
// remind who hasn't handed in (once per 12 hours); a half-day leave and the leave balances.
// Admin-only parts (late fees, leave allowances) need the real admin: the demo admin is read-only.
// Everything it makes is deleted at the end.
import { execSync } from 'node:child_process';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
// One retry: a kept-alive connection can go stale while the slow database commands run.
const send = (who, path, body, method) => fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined });
const call = async (who, path, body, method) => { const r = await send(who, path, body, method).catch(() => send(who, path, body, method)); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const ts = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const uid = (email) => rows(`SELECT id FROM users WHERE email='${email}'`)[0].id;
const began = ts();
const today = new Date().toISOString().slice(0, 10);
const out = {};
const made = { concepts: [], cards: [], sessions: [], assignments: [], leave: [], attendance: false };
const aId = uid(A), tId = uid(T);

try {
  // ── Flashcards and tutor questions on the mastery map ──
  const add = await call(T, `/api/courses/${C}/concepts`, { action: 'add', concepts: [{ name: 'Binary search trees', description: 'Ordered trees: left smaller, right larger; search, insert, balance' }] });
  const concept = (await call(T, `/api/courses/${C}/concepts`)).b.concepts?.find((c) => c.name === 'Binary search trees');
  out.conceptAdded = [add.s, !!concept];
  made.concepts.push(concept.id);
  const card = `q23card${Date.now()}`;
  made.cards.push(card);
  sql(`INSERT INTO study_cards (id, userId, courseId, front, back, due, interval, ease, reps, lapses, createdAt, updatedAt) VALUES ('${card}', '${aId}', '${C}', 'In a binary search tree, where do smaller keys go?', 'To the left of the node', '${ts()}', 0, 2.5, 0, 0, '${ts()}', '${ts()}')`);
  out.review = (await call(A, `/api/tutor/cards/${card}`, { grade: 'good' })).s;
  out.cardLinked = rows(`SELECT conceptId FROM study_cards WHERE id='${card}'`)[0]?.conceptId === concept.id;
  out.signal = rows(`SELECT kind, outcome FROM concept_signals WHERE refId='${card}'`).map((r) => `${r.kind}:${r.outcome}`);
  await call(A, `/api/tutor/cards/${card}`, { grade: 'easy' });
  out.oneADay = rows(`SELECT COUNT(*) AS n FROM concept_signals WHERE refId='${card}'`)[0].n; // 1: the same card counts once a day
  sql(`INSERT INTO concept_signals (id, courseId, studentId, conceptId, kind, outcome, refId, createdAt) VALUES ('q23sig${Date.now()}', '${C}', '${aId}', '${concept.id}', 'TUTOR', 0, NULL, '${ts()}')`);
  const mine = (await call(A, `/api/courses/${C}/mastery`)).b.concepts?.find((c) => c.id === concept.id);
  out.mastery = [mine?.n, mine?.level != null, mine?.asked];
  const cls = (await call(T, `/api/courses/${C}/mastery/class`)).b;
  const row = cls.concepts?.find((c) => c.id === concept.id);
  out.classAsked = row ? [row.asked, row.askedBy] : cls.error ?? 'no class view';

  // ── Hybrid class: the in-person class linked to the class call ──
  // A mark already there: made "absent" for the check (joining the call makes it present), put back after.
  const before = rows(`SELECT id, status, note FROM attendance WHERE courseId='${C}' AND studentId='${aId}' AND date LIKE '${today}%'`);
  if (before.length) { made.restore = before[0]; sql(`UPDATE attendance SET status='ABSENT', note=NULL WHERE id='${before[0].id}'`); }
  const s = (await call(T, '/api/classroom', { courseId: C })).b;
  made.sessions.push(s.id);
  out.link = (await call(T, `/api/classroom/${s.id}`, { action: 'link', on: true })).b.linked;
  out.teacherSees = (await call(T, `/api/classroom/${s.id}`)).b.linked;
  const ticket = await call(A, `/api/calls/c_${C}/ticket`, { kind: 'video' });
  out.ticket = ticket.s;
  const after = rows(`SELECT status, note FROM attendance WHERE courseId='${C}' AND studentId='${aId}' AND date LIKE '${today}%'`);
  made.attendance = !before.length && after.length > 0;
  out.marked = `${before.length ? 'ABSENT' : 'none'} → ${after.map((r) => `${r.status}:${r.note}`).join()}`;
  out.unlink = (await call(T, `/api/classroom/${s.id}`, { action: 'link', on: false })).b.linked;
  out.studentLink = (await call(A, `/api/classroom/${s.id}`, { action: 'link', on: true })).s; // not the teacher's: refused

  // ── Duplicate an assignment; remind who hasn't handed it in ──
  const src = rows(`SELECT id, title FROM assignments WHERE courseId='${C}' ORDER BY createdAt LIMIT 1`)[0];
  const copy = await call(T, `/api/assignments/${src.id}/duplicate`, {});
  made.assignments.push(copy.b.id);
  const c = rows(`SELECT title, status, dueDate FROM assignments WHERE id='${copy.b.id}'`)[0];
  out.duplicate = [copy.s, c?.title === `${src.title} (copy)`.slice(0, 200), c?.status, c?.dueDate];
  out.studentDuplicate = (await call(A, `/api/assignments/${src.id}/duplicate`, {})).s;
  const remind = await call(T, `/api/assignments/${copy.b.id}/remind`, {});
  out.remind = [remind.s, remind.b.reminded > 0, remind.b.late];
  out.remindAgain = (await call(T, `/api/assignments/${copy.b.id}/remind`, {})).s; // 400: once per 12 hours
  out.bobTold = rows(`SELECT title FROM notifications WHERE userId='${uid(B)}' AND link='/student/assignments/${copy.b.id}'`).map((r) => r.title);

  // ── A half day of leave and the balances ──
  const day = new Date(Date.now() + 9 * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  const d = day.toISOString().slice(0, 10);
  const leave = await call(T, '/api/staff/me', { action: 'leave', type: 'PERSONAL', fromDate: d, toDate: d, halfDay: 'PM', reason: 'Q23 check' });
  if (leave.b.id) made.leave.push(leave.b.id);
  out.halfDay = [leave.s, leave.b.days, rows(`SELECT halfDay FROM staff_leave WHERE id='${leave.b.id}'`)[0]?.halfDay];
  const me = (await call(T, `/api/staff/me?today=${today}`)).b;
  const personal = me.balances?.rows?.find((r) => r.type === 'PERSONAL');
  out.balance = [me.balances?.year, personal?.pending];
  out.studentLeave = (await call(A, '/api/staff/me', { action: 'leave', type: 'SICK', fromDate: d, toDate: d })).s; // 403
} finally {
  for (const id of made.concepts) sql(`DELETE FROM concept_signals WHERE conceptId='${id}'; DELETE FROM course_concepts WHERE id='${id}'`);
  for (const id of made.cards) sql(`DELETE FROM study_cards WHERE id='${id}'`);
  for (const id of made.sessions) sql(`DELETE FROM classroom_sessions WHERE id='${id}'`);
  if (made.restore) sql(`UPDATE attendance SET status='${made.restore.status}', note=${made.restore.note ? `'${made.restore.note}'` : 'NULL'} WHERE id='${made.restore.id}'`);
  if (made.attendance) sql(`DELETE FROM attendance WHERE courseId='${C}' AND studentId='${aId}' AND date LIKE '${today}%' AND note='Online (class call)'`);
  for (const id of made.assignments.filter(Boolean)) sql(`DELETE FROM notifications WHERE link='/student/assignments/${id}'; DELETE FROM concept_tags WHERE refId LIKE '${id}:%'; DELETE FROM assignments WHERE id='${id}'`);
  for (const id of made.leave) sql(`DELETE FROM staff_leave WHERE id='${id}'`);
  sql(`DELETE FROM notifications WHERE createdAt >= '${began}' AND (title LIKE 'Leave request:%' OR link LIKE '/admin/staff%')`);
  sql(`DELETE FROM audit_logs WHERE createdAt >= '${began}' AND summary LIKE 'Duplicated assignment%'`);
  out.leftBehind = rows(`SELECT (SELECT COUNT(*) FROM study_cards WHERE id LIKE 'q23card%') + (SELECT COUNT(*) FROM course_concepts WHERE name='Binary search trees' AND courseId='${C}') + (SELECT COUNT(*) FROM assignments WHERE title LIKE '% (copy)' AND createdById='${tId}' AND createdAt >= '${began}') AS n`)[0].n;
  console.log(JSON.stringify(out, null, 1));
}
