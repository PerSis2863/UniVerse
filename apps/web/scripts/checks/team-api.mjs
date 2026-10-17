const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', TARA = 'tara@teacher.com', TOM = 'tom@teacher.com', S = 'demo@student.com';
const staff = `/api/courses/${C}/staff`;
console.log('before: tara board', (await call(TARA, `/api/courses/${C}/board`))[0], 'tara courses', (await call(TARA, '/api/core/courses/my'))[1].length);
console.log('student adds', (await call(S, staff, { action: 'add', email: TARA, role: 'CO_TEACHER' }))[0]);
console.log('add a student', JSON.stringify(await call(T, staff, { action: 'add', email: 'alice@student.com', role: 'TA' })));
console.log('add unknown', JSON.stringify(await call(T, staff, { action: 'add', email: 'nobody@x.com', role: 'TA' })));
console.log('add tara', JSON.stringify(await call(T, staff, { action: 'add', email: TARA, role: 'CO_TEACHER' })), 'add tom', JSON.stringify(await call(T, staff, { action: 'add', email: TOM, role: 'TA' })));
const [, team] = await call(TOM, staff); console.log('tom sees team', team.canEdit, team.staff.map((s) => `${s.name}:${s.role}`).join(', '));
console.log('tom changes tara role', (await call(TOM, staff, { action: 'role', userId: 'tara_local_teacher', role: 'TA' }))[0]);
// What each can do.
const [tb, taraBoard] = await call(TARA, `/api/courses/${C}/board`);
const [mb, tomBoard] = await call(TOM, `/api/courses/${C}/board`);
console.log('boards', tb, JSON.stringify({ canManage: taraBoard.canManage, canGrade: taraBoard.canGrade, owns: taraBoard.owns, roster: taraBoard.roster?.length }), mb, JSON.stringify({ canManage: tomBoard.canManage, canGrade: tomBoard.canGrade, owns: tomBoard.owns, roster: tomBoard.roster?.length }));
console.log('my courses: tara', (await call(TARA, '/api/core/courses/my'))[1].map((c) => c.code).join(','), '| tom', (await call(TOM, '/api/core/courses/my'))[1].map((c) => c.code).join(','));
console.log('announce: tara', (await call(TARA, `/api/courses/${C}/board`, { kind: 'announcement', title: 'From Tara', body: 'Hello' }))[0], 'tom', (await call(TOM, `/api/courses/${C}/board`, { kind: 'announcement', title: 'From Tom', body: 'Hi' }))[0]);
const asg = (await call(T, `/api/assignments?courseId=${C}`))[1];
const aid = (Array.isArray(asg) ? asg : asg.assignments ?? [])[0]?.id;
console.log('assignment', aid);
if (aid) {
  const [ds, d] = await call(TOM, `/api/assignments/${aid}`);
  console.log('tom opens assignment', ds, JSON.stringify({ canManage: d.canManage, canGrade: d.canGrade, submissions: d.submissions?.length }));
  console.log('tom edits assignment', (await call(TOM, `/api/assignments/${aid}`, { title: 'x' }, 'PATCH'))[0], '| tara edits', (await call(TARA, `/api/assignments/${aid}`, { title: 'Loop essay' }, 'PATCH'))[0]);
  const sub = d.submissions?.[0];
  if (sub) console.log('tom returns a grade', JSON.stringify(await call(TOM, `/api/assignments/submissions/${sub.id}/return`, { score: 8, feedback: 'Nice work', criteriaScores: [] })).slice(0, 140));
}
console.log('gradebook: tom', (await call(TOM, `/api/core/grades/course/${C}`))[0], 'tara', (await call(TARA, `/api/core/grades/course/${C}`))[0]);
console.log('attendance: tom', (await call(TOM, `/api/core/attendance/course/${C}?date=2026-10-15`))[0]);
console.log('quizzes: tara list', (await call(TARA, '/api/core/quizzes'))[1].length, 'tom list', (await call(TOM, '/api/core/quizzes'))[1].length);
console.log('copy: tara', (await call(TARA, `/api/courses/${C}/copy`, { code: 'CS101-TARA' }))[0]);
console.log('tara removes tom', (await call(TARA, staff, { action: 'remove', userId: 'tom_local_teacher' }))[0], '| tom leaves', (await call(TOM, staff, { action: 'remove', userId: 'tom_local_teacher' }))[0], '| tom board after', (await call(TOM, `/api/courses/${C}/board`))[0]);
