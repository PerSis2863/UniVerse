// Quiz question types through the API: one of each, a student's answers marked, the key hidden,
// results, item analysis, the bank, and bad input.
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const out = {};
for (const q of (await call(T, '/api/core/quizzes')).b ?? []) if (q.title?.startsWith('Types API')) await call(T, `/api/core/quizzes/${q.id}`, null, 'DELETE');
const quiz = (await call(T, '/api/core/quizzes', { courseId: C, title: 'Types API' })).b;
const Q = [
  { type: 'CHOICE', question: '2 + 2?', options: ['3', '4', '5'], correctAnswer: '4' },
  { type: 'TRUE_FALSE', question: 'The sun is a star.', correctAnswer: 'True' },
  { type: 'MULTI', question: 'Primes?', options: ['2', '3', '4', '5'], correct: ['2', '3', '5'], partial: true },
  { type: 'SHORT', question: 'Capital of France?', accepted: ['Paris'] },
  { type: 'BLANKS', question: 'Water boils at [[100]] °C at [[sea level|sea-level]].' },
  { type: 'MATCH', question: 'Match the capitals.', pairs: [{ left: 'France', right: 'Paris' }, { left: 'Spain', right: 'Madrid' }], extra: ['Berlin'] },
  { type: 'ORDER', question: 'Smallest first.', items: ['1', '2', '3'] },
  { type: 'NUMBER', question: 'g in m/s²?', value: '9.81', tolerance: '0.1', unit: 'm/s²' },
];
const made = [];
for (const q of Q) { const r = await call(T, `/api/quizzes/${quiz.id}/questions`, { ...q, points: 2 }); made.push(r.b); if (r.s !== 201) out[`add ${q.type}`] = `${r.s} ${r.b.error}`; }
out.bad = [
  (await call(T, `/api/quizzes/${quiz.id}/questions`, { type: 'BLANKS', question: 'No blanks' })).b.error,
  (await call(T, `/api/quizzes/${quiz.id}/questions`, { type: 'NUMBER', question: 'x', value: 'abc' })).b.error,
  (await call(T, `/api/quizzes/${quiz.id}/questions`, { type: 'MATCH', question: 'x', pairs: [{ left: 'a', right: 'b' }] })).b.error,
  (await call(A, `/api/quizzes/${quiz.id}/questions`, Q[0])).s,
];
await call(T, `/api/quizzes/${quiz.id}`, { status: 'PUBLISHED' }, 'PATCH');
// What a student gets: no key, no meta; blanks count, match prompts, unit.
const seen = (await call(A, `/api/core/quizzes/${quiz.id}`)).b;
out.studentLeaks = seen.questions.some((q) => 'correctAnswer' in q || 'meta' in q);
out.studentQuestionTextHasAnswer = seen.questions.some((q) => /\[\[|100\]\]/.test(q.question));
out.ask = Object.fromEntries(seen.questions.map((q) => [q.type, q.ask && Object.keys(q.ask).length ? q.ask : q.options.length]));
const byType = Object.fromEntries(seen.questions.map((q) => [q.type, q]));
// Alice: everything right. Bob: some partly right, junk in places.
const right = { CHOICE: '4', TRUE_FALSE: 'True', MULTI: ['5', '2', '3'], SHORT: ' paris. ', BLANKS: ['100', 'Sea-level'], MATCH: ['Paris', 'Madrid'], ORDER: ['1', '2', '3'], NUMBER: '9,8' };
const partly = { CHOICE: '3', TRUE_FALSE: 'False', MULTI: ['2', '3'], SHORT: 'Lyon', BLANKS: ['100', 'beach'], MATCH: ['Madrid', 'Madrid'], ORDER: ['1', '3', '2'], NUMBER: { evil: 1 } };
const ans = (m) => Object.fromEntries(Object.entries(m).map(([t, v]) => [byType[t].id, v]));
const ra = await call(A, `/api/core/quizzes/${quiz.id}/submit`, { answers: { ...ans(right), unknownId: 'x' } });
const rb = await call(B, `/api/core/quizzes/${quiz.id}/submit`, { answers: ans(partly) });
out.alice = [ra.s, ra.b.score, ra.b.maxScore];
// Bob: MULTI 2 of 3 right partial (0.67*2=1.34), BLANKS 0.5*2=1, MATCH 0.5*2=1, ORDER 1/3*2=0.66
out.bob = [rb.s, rb.b.score, rb.b.maxScore];
// Results before reveal (open): no key; then close and look again.
const before = (await call(B, `/api/quizzes/${quiz.id}/result`)).b;
out.beforeReveal = before.questions.some((q) => q.correctAnswer !== undefined || q.credit !== undefined);
await call(T, `/api/quizzes/${quiz.id}`, { status: 'CLOSED' }, 'PATCH');
const after = (await call(B, `/api/quizzes/${quiz.id}/result`)).b;
out.afterReveal = after.questions.map((q) => `${q.type}:${q.credit}:${q.yourText}|${q.correctAnswer}`);
// Item analysis for the teacher.
const t = (await call(T, `/api/quizzes/${quiz.id}`)).b;
out.analysis = t.analysis?.items.map((i) => `${i.right}/${i.counts.length}`).join(' ');
// Bank: save a matching question from the quiz, add it to another quiz.
const saved = await call(T, `/api/courses/${C}/question-bank`, { action: 'save-from-quiz', questionId: made[5].id });
const bank = (await call(T, `/api/courses/${C}/question-bank`)).b.questions;
const inBank = bank.find((x) => x.question === 'Match the capitals.');
out.bank = [saved.s, inBank?.type, inBank?.correctAnswer];
const quiz2 = (await call(T, '/api/core/quizzes', { courseId: C, title: 'Types API 2' })).b;
await call(T, `/api/courses/${C}/question-bank`, { action: 'add-to-quiz', quizId: quiz2.id, ids: [inBank.id] });
const q2 = (await call(T, `/api/quizzes/${quiz2.id}`)).b.questions[0];
out.copied = [q2?.type, !!q2?.meta];
const newBank = await call(T, `/api/courses/${C}/question-bank`, { action: 'create', type: 'ORDER', question: 'Types API order', items: ['a', 'b', 'c'], points: 1, tags: 'x' });
out.bankCreate = newBank.s;
for (const x of (await call(T, `/api/courses/${C}/question-bank`)).b.questions) if (/^(Match the capitals\.|Types API)/.test(x.question)) await call(T, `/api/courses/${C}/question-bank`, { action: 'delete', questionId: x.id });
for (const id of [quiz.id, quiz2.id]) await call(T, `/api/core/quizzes/${id}`, null, 'DELETE');
console.log(JSON.stringify(out, null, 1));
