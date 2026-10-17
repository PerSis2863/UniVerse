// Late penalties, hand-in limits, extensions, reopening and accommodations on the local Worker.
const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ ...(e ? { Authorization: `Bearer mock-token-${e}` } : {}), 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', TOM = 'tom@teacher.com', S = 'demo@student.com', A = 'alice@student.com', BOB = 'bob@student.com';
const ids = Object.fromEntries((await call(T, `/api/courses/${C}/enrolment`))[1].students.map((s) => [s.email, s.id]));
const answer = 'This is my answer to the question, long enough to hand in.';
const DAY = 864e5;

const [cs, a] = await call(T, '/api/assignments', { courseId: C, title: 'Rules test', instructions: 'Write about loops.', rubric: [{ criterion: 'Content', points: 10 }], dueDate: new Date(Date.now() - 2 * DAY + 3600e3).toISOString(), latePenalty: 10, lateGraceMinutes: 30, latePenaltyMax: 50, maxAttempts: 2 });
console.log('create', cs, JSON.stringify({ latePenalty: a.latePenalty, grace: a.lateGraceMinutes, max: a.latePenaltyMax, attempts: a.maxAttempts }));
const P = `/api/assignments/${a.id}`;

// Alice: two days late (each started day after 30 minutes' grace), two hand-ins, no third.
const [s1, r1] = await call(A, `${P}/submission`, { text: answer }, 'PUT');
console.log('alice hands in', s1, JSON.stringify(r1).slice(0, 140));
console.log('alice again', JSON.stringify((await call(A, `${P}/submission`, { text: answer + ' v2' }, 'PUT'))[1]).slice(0, 120));
console.log('alice a third time', JSON.stringify(await call(A, `${P}/submission`, { text: answer + ' v3' }, 'PUT')));
const [, detail] = await call(T, P);
const sub = detail.submissions.find((x) => x.student.id === ids[A]);
console.log('teacher sees', JSON.stringify({ attempts: sub.attempts, lateDays: sub.lateDays, latePenalty: sub.latePenalty }), 'students listed', detail.students.length);
const crit = detail.rubric.map((r) => ({ id: r.id, score: 8, comment: '' }));
console.log('return 8/10 with penalty', JSON.stringify((await call(T, `/api/assignments/submissions/${sub.id}/return`, { criteria: crit, feedback: 'Good' }))[1]));
console.log('return again, waived', JSON.stringify((await call(T, `/api/assignments/submissions/${sub.id}/return`, { criteria: crit, feedback: 'Good', waiveLate: true }))[1]));
console.log('alice sees', JSON.stringify((({ mine, myDue, canHandIn, attemptsAllowed }) => ({ status: mine.status, score: mine.score, raw: mine.rawScore, waived: mine.lateWaived, canHandIn, attemptsAllowed, due: !!myDue }))((await call(A, P))[1])));
console.log('alice hands in after grading', (await call(A, `${P}/submission`, { text: answer }, 'PUT'))[0]);
console.log('TA reopens', (await call(TOM, `/api/assignments/submissions/${sub.id}/reopen`, {}))[0], '| student reopens', (await call(A, `/api/assignments/submissions/${sub.id}/reopen`, {}))[0]);
const [, reo] = await call(A, P);
console.log('alice after reopen', reo.mine.status, 'score shown', reo.mine.score, 'canHandIn', reo.canHandIn);
const [s4, r4] = await call(A, `${P}/submission`, { text: answer + ' v4' }, 'PUT');
console.log('alice hands in again', s4, 'attempts', r4.attempts);
const [, list] = await call(T, `/api/assignments?courseId=${C}`);
console.log('teacher list counts', JSON.stringify((Array.isArray(list) ? list : []).find((x) => x.id === a.id)?.counts));

// Bob: an extension (not late, and the closed assignment stays open for him); the TA can give it.
console.log('student gives extension', (await call(S, `${P}/extensions`, { studentId: ids[BOB], dueDate: new Date(Date.now() + 3 * DAY).toISOString() }))[0]);
console.log('TA gives Bob an extension', JSON.stringify(await call(TOM, `${P}/extensions`, { studentId: ids[BOB], dueDate: new Date(Date.now() + 3 * DAY).toISOString(), extraAttempts: 1, note: 'Ill' })).slice(0, 120));
console.log('extension for someone not in the course', (await call(T, `${P}/extensions`, { studentId: 'nope', dueDate: new Date(Date.now() + DAY).toISOString() }))[0], '| a past date', (await call(T, `${P}/extensions`, { studentId: ids[BOB], dueDate: '2020-01-01' }))[0]);
await call(T, P, { status: 'CLOSED' }, 'PATCH');
const [bs, br] = await call(BOB, `${P}/submission`, { text: answer }, 'PUT');
console.log('bob hands in after close', bs, 'late', br.late, '| john after close', (await call(S, `${P}/submission`, { text: answer }, 'PUT'))[0]);
await call(T, P, { status: 'OPEN' }, 'PATCH');
const [, bobView] = await call(BOB, P);
console.log('bob sees', JSON.stringify({ extended: bobView.extended, attemptsAllowed: bobView.attemptsAllowed, due: bobView.myDue?.slice(0, 10) }));

// John: an accommodation of 3 extra days: on time; and 50% extra time on timed quizzes.
console.log('TA sets accommodation', (await call(TOM, `/api/courses/${C}/accommodations`, { studentId: ids[S], extraDays: 3 }))[0]);
console.log('teacher sets accommodation', JSON.stringify((await call(T, `/api/courses/${C}/accommodations`, { studentId: ids[S], extraDays: 3, extraTimePct: 50, note: 'Plan from student services' }))[1]));
const [js, jr] = await call(S, `${P}/submission`, { text: answer }, 'PUT');
console.log('john hands in', js, 'late', jr.late, 'penalty', jr.latePenalty);
const [, roster] = await call(T, `/api/courses/${C}/enrolment`);
console.log('class list shows', JSON.stringify(roster.students.find((x) => x.id === ids[S]).accommodation));
const [, quizzes] = await call(T, '/api/core/quizzes');
const timed = (Array.isArray(quizzes) ? quizzes : []).find((q) => q.courseId === C && q.timeLimit && q.status === 'PUBLISHED');
if (timed) console.log('timed quiz', timed.timeLimit, 'min; john gets', (await call(S, `/api/core/quizzes/${timed.id}`))[1].timeLimit, '| alice gets', (await call(A, `/api/core/quizzes/${timed.id}`))[1].timeLimit);
else console.log('no timed quiz in the course to check');
console.log('clear accommodation', JSON.stringify((await call(T, `/api/courses/${C}/accommodations`, { studentId: ids[S], extraDays: 0, extraTimePct: 0 }))[1]));

console.log('delete', (await call(T, P, null, 'DELETE'))[0]);
