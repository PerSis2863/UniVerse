// Q22 leftovers, through the API on the built Worker (pnpm local:serve): AI receipts on quizzes and
// oral checks (and the class summary data), question-bank concept tags going with questions into a
// quiz, oral checks into the gradebook, the class TA switch (Whisper TA and in-person classes; no AI
// key locally, so the TA itself answers 503). Everything it makes is deleted at the end.
import { execSync } from 'node:child_process';
import { fileURLToPath as __path } from 'node:url';
const APP = __path(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const ts = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const uid = (email) => rows(`SELECT id FROM users WHERE email='${email}'`)[0].id;
const began = ts();
const out = {};
const made = { quizzes: [], checks: [], concepts: [], bank: [], uses: [] };
const aId = uid(A), bId = uid(B);
const ruleBefore = rows(`SELECT tutorRule FROM courses WHERE id='${C}'`)[0]?.tutorRule ?? null;
const addUse = (userId, detail) => { const id = `q22use${made.uses.length}${Date.now()}`; made.uses.push(id); sql(`INSERT INTO ai_uses (id, userId, kind, detail, courseId, createdAt) VALUES ('${id}', '${userId}', 'tutor', '${detail}', '${C}', '${ts()}')`); };

try {
  // ── Quiz with "AI not allowed" ──
  const quiz = (await call(T, '/api/core/quizzes', { courseId: C, title: 'Q22 receipts quiz' })).b;
  made.quizzes.push(quiz.id);
  await call(T, `/api/quizzes/${quiz.id}/questions`, { question: 'Pick yes', options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
  const set = (await call(T, `/api/quizzes/${quiz.id}`, { aiPolicy: 'NONE', status: 'PUBLISHED' }, 'PATCH')).b;
  out.rule = [set.aiPolicy, (await call(T, `/api/quizzes/${quiz.id}`, { aiPolicy: 'MAYBE' }, 'PATCH')).b.aiPolicy]; // NONE, NONE (unknown rule ignored)
  const qid = (await call(T, `/api/quizzes/${quiz.id}`)).b.questions[0].id;
  out.studentSeesRule = (await call(A, `/api/core/quizzes/${quiz.id}`)).b.aiPolicy;
  out.startA = !!(await call(A, `/api/core/quizzes/${quiz.id}/start`, {})).b.startedAt;
  addUse(aId, 'Q22 check: what is a loop');
  const preview = (await call(A, `/api/core/quizzes/${quiz.id}/ai-receipt`)).b;
  out.previewA = [preview.policy, preview.during, preview.uses?.length];
  out.teacherPreview = (await call(T, `/api/core/quizzes/${quiz.id}/ai-receipt`)).s; // 403: students only
  out.noChoice = (await call(A, `/api/core/quizzes/${quiz.id}/submit`, { answers: { [qid]: 'yes' }, aiReceipt: { attach: false, declaredNone: false, note: '' } })).s; // 400
  out.attachA = (await call(A, `/api/core/quizzes/${quiz.id}/submit`, { answers: { [qid]: 'yes' }, aiReceipt: { attach: true, declaredNone: false, note: 'Asked the tutor once' } })).s;
  // Bob: time ran out before he chose.
  await call(B, `/api/core/quizzes/${quiz.id}/start`, {});
  out.timeUpB = (await call(B, `/api/core/quizzes/${quiz.id}/submit`, { answers: { [qid]: 'no' }, aiReceipt: { attach: false, declaredNone: false, note: '' }, timeUp: true })).s;
  const subs = (await call(T, `/api/quizzes/${quiz.id}`)).b.submissions;
  const r = (name) => subs.find((x) => x.student.name.toLowerCase().startsWith(name))?.aiReceipt;
  out.teacherSeesA = [r('alice')?.attached, r('alice')?.during, r('alice')?.uses?.length, r('alice')?.note];
  out.teacherSeesB = [r('bob')?.auto, r('bob')?.attached, r('bob')?.declaredNone];

  // ── Oral check with "AI allowed with a receipt" (no AI key locally: the attempt is put in directly) ──
  const check = (await call(T, `/api/courses/${C}/oral-checks`, { title: 'Q22 viva', kind: 'VIVA', topic: 'Loops and recursion', minutes: 5, aiPolicy: 'RECEIPT' })).b;
  made.checks.push(check.id);
  const sid = `q22oral${Date.now()}`;
  sql(`INSERT INTO oral_sessions (id, userId, courseId, checkId, kind, topic, lang, rubric, transcript, durationSec, status, createdAt) VALUES ('${sid}', '${aId}', '${C}', '${check.id}', 'VIVA', 'Loops and recursion', '', (SELECT rubric FROM oral_checks WHERE id='${check.id}'), '[]', 240, 'SUBMITTED', '${ts(new Date(Date.now() - 60_000))}')`);
  out.oralOverview = (await call(A, '/api/orals')).b.checks?.find((c) => c.id === check.id)?.aiPolicy;
  const op = (await call(A, `/api/orals/${sid}/ai-receipt`)).b;
  out.oralPreview = [op.policy, op.during, op.uses?.length, op.canChange];
  out.oralNoAttach = (await call(A, `/api/orals/${sid}/ai-receipt`, { attach: false })).s; // 400: this rule needs the receipt
  out.oralAttach = (await call(A, `/api/orals/${sid}/ai-receipt`, { attach: true, note: 'Looked up recursion' })).b.aiReceipt?.uses?.length;
  out.oralOther = (await call(B, `/api/orals/${sid}/ai-receipt`)).s; // 404
  const detail = (await call(T, `/api/oral-checks/${check.id}`)).b;
  out.teacherOral = [detail.check?.aiPolicy, detail.sessions?.[0]?.aiReceipt?.attached];
  out.ruleChange = (await call(T, `/api/oral-checks/${check.id}`, { action: 'rule', aiPolicy: 'NONE' })).s;
  const rubric = detail.check.rubric;
  out.confirm = (await call(T, `/api/oral-checks/${check.id}`, { action: 'confirm', sessionId: sid, scores: rubric.map((c) => ({ id: c.id, score: c.max })), comment: 'Clear' })).b.ok;
  out.gradebook = rows(`SELECT score, maxScore FROM grades WHERE studentId='${aId}' AND courseId='${C}' AND assignmentName='Oral: Q22 viva'`).map((g) => `${g.score}/${g.maxScore}`);
  out.afterMarked = (await call(A, `/api/orals/${sid}/ai-receipt`, { attach: true })).s; // 409

  // ── Question bank tags go with the questions into a quiz ──
  await call(T, `/api/courses/${C}/concepts`, { action: 'add', concepts: [{ name: 'Q22 loops' }] });
  const concept = (await call(T, `/api/courses/${C}/concepts`)).b.concepts.find((c) => c.name === 'Q22 loops');
  made.concepts.push(concept.id);
  const bank = (await call(T, `/api/courses/${C}/question-bank`, { action: 'create', question: 'Q22 bank: pick yes', options: ['yes', 'no'], correctAnswer: 'yes', points: 1 })).b.questions.find((q) => q.question === 'Q22 bank: pick yes');
  made.bank.push(bank.id);
  out.tagBank = (await call(T, `/api/courses/${C}/concepts/tags`, { kind: 'BANK', refId: bank.id, conceptIds: [concept.id] })).b.tags;
  out.taggables = (await call(T, `/api/courses/${C}/concepts/tags`)).b.bank?.[0]?.items?.some((i) => i.refId === bank.id && i.concepts.includes(concept.id));
  out.addToQuiz = (await call(T, `/api/courses/${C}/question-bank`, { action: 'add-to-quiz', quizId: quiz.id, ids: [bank.id] })).b.added;
  const newQ = (await call(T, `/api/quizzes/${quiz.id}`)).b.questions.find((q) => q.question === 'Q22 bank: pick yes');
  out.tagCarried = rows(`SELECT kind FROM concept_tags WHERE conceptId='${concept.id}' AND refId='${newQ.id}'`).map((t) => t.kind);

  // ── The class TA switch ──
  await call(T, `/api/tutor/${C}/rule`, { whisperOff: true }, 'PUT');
  out.whisperOff = (await call(A, `/api/calls/c_${C}/whisper`)).b.off;
  out.whisperAsk = (await call(A, `/api/calls/c_${C}/whisper`, { question: 'What is a loop?' })).s; // 403
  await call(T, `/api/tutor/${C}/rule`, { whisperOff: false }, 'PUT');
  const room = (await call(T, '/api/classroom', { courseId: C })).b;
  const code = (await call(T, `/api/classroom/${room.id}/code`)).b.code;
  out.join = (await call(A, '/api/classroom/join', { code })).s;
  const q = (await call(A, `/api/classroom/${room.id}`, { action: 'ask', text: 'Why does the loop stop at n - 1?' })).b;
  out.roomTaOn = (await call(A, '/api/classroom/current')).b.session?.ta; // false: no AI key here
  const ta = await call(A, `/api/classroom/${room.id}`, { action: 'ta', questionId: q.id });
  out.roomTa = [ta.s, ta.b.error];
  out.roomTaOther = (await call(B, `/api/classroom/${room.id}`, { action: 'ta', questionId: q.id })).s; // 404: Bob hasn't joined
  await call(T, `/api/classroom/${room.id}`, { action: 'end' });
} finally {
  for (const id of made.quizzes) await call(T, `/api/core/quizzes/${id}`, null, 'DELETE');
  for (const id of made.checks) await call(T, `/api/oral-checks/${id}`, null, 'DELETE');
  for (const id of made.bank) await call(T, `/api/courses/${C}/question-bank`, { action: 'delete', questionId: id });
  for (const id of made.concepts) sql(`DELETE FROM course_concepts WHERE id='${id}'`);
  if (made.uses.length) sql(`DELETE FROM ai_uses WHERE id IN (${made.uses.map((x) => `'${x}'`).join(',')})`);
  sql(`DELETE FROM grades WHERE courseId='${C}' AND assignmentName='Oral: Q22 viva'`);
  sql(`DELETE FROM classroom_sessions WHERE courseId='${C}' AND id IN (SELECT sessionId FROM classroom_questions WHERE text='Why does the loop stop at n - 1?')`);
  sql(`DELETE FROM attendance WHERE courseId='${C}' AND studentId='${aId}' AND createdAt >= '${began}'`); // joining marked Alice present
  sql(`UPDATE courses SET tutorRule=${ruleBefore === null ? 'NULL' : `'${ruleBefore.replace(/'/g, "''")}'`} WHERE id='${C}'`);
}
console.log(JSON.stringify(out, null, 1));
