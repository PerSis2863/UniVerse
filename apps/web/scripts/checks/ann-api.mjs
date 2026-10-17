const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw', NEW = process.argv[2];
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body) => { const r = await fetch(B + path, body ? { method: 'POST', headers: H(who), body: JSON.stringify(body) } : { headers: H(who) }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', S = 'demo@student.com', A = 'alice@student.com';
const soon = new Date(Date.now() + 3 * 60_000).toISOString();
console.log('past time', JSON.stringify(await call(T, `/api/courses/${C}/board`, { kind: 'announcement', title: 'x', body: 'y', publishAt: '2020-01-01T00:00:00Z' })));
const [s1, later] = await call(T, `/api/courses/${C}/board`, { kind: 'announcement', title: 'Quiz moved to Friday', body: 'See you then.', publishAt: soon });
const [s2, now] = await call(T, `/api/courses/${C}/board`, { kind: 'announcement', title: 'Welcome to week 3', body: 'Slides are up.' });
console.log('posted', s1, s2);
const studentBoard = (await call(S, `/api/courses/${C}/board`))[1].announcements.map((a) => a.title);
const teacherBoard = (await call(T, `/api/courses/${C}/board`))[1].announcements.map((a) => `${a.title}${a.publishAt && !a.sentAt ? ' [scheduled]' : ''} seen=${a._count?.reads}`);
console.log('student sees', JSON.stringify(studentBoard.slice(0, 3)), '\nteacher sees', JSON.stringify(teacherBoard.slice(0, 3)));
console.log('student marks seen (incl. scheduled id)', JSON.stringify(await call(S, `/api/courses/${C}/announcements/seen`, { ids: [now.id, later.id] })));
console.log('again', JSON.stringify(await call(S, `/api/courses/${C}/announcements/seen`, { ids: [now.id] })));
console.log('teacher marking seen counts?', JSON.stringify(await call(T, `/api/courses/${C}/announcements/seen`, { ids: [now.id] })));
console.log('pin old one', (await call(T, `/api/courses/${C}/board`, { kind: 'pin', id: now.id, on: true }))[0], 'student pins', (await call(S, `/api/courses/${C}/board`, { kind: 'pin', id: now.id }))[0]);
console.log('teacher sees now', JSON.stringify((await call(T, `/api/courses/${C}/board`))[1].announcements.slice(0, 2).map((a) => `${a.title} pinned=${!!a.pinnedAt} seen=${a._count?.reads}`)));
// Visibility of the core list: a course with no students.
if (NEW) {
  const [, secret] = await call(T, `/api/courses/${NEW}/board`, { kind: 'announcement', title: 'Staff-only draft course note', body: 'not for students' });
  const list = (await call(A, '/api/core/announcements'))[1];
  console.log('alice core list has other course note?', list.some?.((a) => a.id === secret.id), 'has CS101 note?', list.some?.((a) => a.id === now.id), 'has scheduled?', list.some?.((a) => a.id === later.id));
  console.log('alice by id', (await call(A, `/api/core/announcements/${secret.id}`))[0], 'teacher by id', (await call(T, `/api/core/announcements/${secret.id}`))[0]);
  const tr = await call(A, '/api/translate', { items: [{ kind: 'announcement', id: secret.id }], lang: 'hi' });
  console.log('alice translate other course', tr[0], JSON.stringify(tr[1]).slice(0, 120));
}
console.log('LATER', later.id);
