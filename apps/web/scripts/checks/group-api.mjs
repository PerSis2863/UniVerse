// Group assignments on the local Worker.
const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', TOM = 'tom@teacher.com', S = 'demo@student.com', A = 'alice@student.com', BOB = 'bob@student.com';
const ids = Object.fromEntries((await call(T, `/api/courses/${C}/enrolment`))[1].students.map((s) => [s.email, s.id]));
const answer = 'Our group answer, long enough to hand in for everyone.';
for (const a of (await call(T, `/api/assignments?courseId=${C}`))[1]) if (a.title.startsWith('Group test')) await call(T, `/api/assignments/${a.id}`, null, 'DELETE');

const [, sh] = await call(T, '/api/assignments', { courseId: C, title: 'Group test shared', instructions: 'Work together.', rubric: [{ criterion: 'Content', points: 10 }], groupMode: 'SHARED' });
console.log('made with groups', sh.groupMode);
const G = `/api/assignments/${sh.id}/groups`, P = `/api/assignments/${sh.id}`;
console.log('alice hands in with no group', JSON.stringify((await call(A, `${P}/submission`, { text: answer }, 'PUT'))));
console.log('TA makes groups', (await call(TOM, G, { action: 'make', size: 2 }))[0], '| student', (await call(A, G, { action: 'make', size: 2 }))[0]);
console.log('teacher makes random groups of 2', JSON.stringify((await call(T, G, { action: 'make', size: 2 }))[1]));
let [, d] = await call(T, P);
console.log('groups', d.groups.map((g) => `${g.name}: ${g.members.map((m) => m.name).join('+')}`).join(' | '));
// Put Alice and Bob together, John alone in another.
const g1 = d.groups[0].id;
let g2 = d.groups[1]?.id;
if (!g2) g2 = (await call(T, G, { action: 'add', name: 'Group 2' }))[1].id;
for (const [who, g] of [[A, g1], [BOB, g1], [S, g2]]) await call(T, G, { action: 'move', studentId: ids[who], groupId: g });
[, d] = await call(T, P);
console.log('after moving', d.groups.map((g) => `${g.name}: ${g.members.map((m) => m.name).join('+')}`).join(' | '));
console.log('rename', (await call(T, G, { action: 'rename', groupId: g1, name: 'Team Loops' }))[0], '| duplicate name', (await call(T, G, { action: 'rename', groupId: g2, name: 'Team Loops' }))[0]);
// Alice hands in for the group; Bob sees it and replaces it (same hand-in).
console.log('alice hands in', (await call(A, `${P}/submission`, { text: answer }, 'PUT'))[0]);
const [, bobView] = await call(BOB, P);
console.log('bob sees group hand-in', bobView.group?.name, !!bobView.mine, bobView.mine?.text?.slice(0, 20));
console.log('bob replaces it', (await call(BOB, `${P}/submission`, { text: answer + ' (edited by Bob)' }, 'PUT'))[0]);
[, d] = await call(T, P);
console.log('hand-ins', d.submissions.length, 'by', d.submissions[0].student.name, 'group', d.submissions[0].groupId === g1, 'text', d.submissions[0].text.slice(-16));
console.log('switch to individual now', JSON.stringify((await call(T, G, { action: 'mode', groupMode: null }))[1]).slice(0, 90));
console.log('remake groups now', (await call(T, G, { action: 'make', size: 2 }))[0], '| delete the group that handed in', (await call(T, G, { action: 'delete', groupId: g1 }))[0]);
// Grade: both get 7.
const sub = d.submissions[0];
const crit = d.rubric.map((r) => ({ id: r.id, score: 7, comment: '' }));
console.log('return', JSON.stringify((await call(T, `/api/assignments/submissions/${sub.id}/return`, { criteria: crit, feedback: 'Nice teamwork' }))[1]));
for (const [who, name] of [[A, 'alice'], [BOB, 'bob'], [S, 'john']]) {
  const [, v] = await call(who, P);
  const [, list] = await call(who, '/api/assignments');
  console.log(name, 'sees', v.mine?.status ?? 'nothing', v.mine?.score ?? '-', '| list', JSON.stringify(list.find((x) => x.id === sh.id)?.mine?.score ?? null));
}
const [, grades] = await call(T, `/api/core/grades/course/${C}`);
const rows = JSON.stringify(grades).match(/Group test shared/g)?.length ?? 0;
console.log('grade rows for the assignment in the gradebook', rows);

// A grade each.
const [, ind] = await call(T, '/api/assignments', { courseId: C, title: 'Group test individual', instructions: 'Work together.', rubric: [{ criterion: 'Content', points: 10 }], groupMode: 'INDIVIDUAL' });
const G2 = `/api/assignments/${ind.id}/groups`, P2 = `/api/assignments/${ind.id}`;
const [, team] = await call(T, G2, { action: 'add', name: 'Pair' });
for (const who of [A, BOB]) await call(T, G2, { action: 'move', studentId: ids[who], groupId: team.id });
await call(BOB, `${P2}/submission`, { text: answer }, 'PUT');
const [, d2] = await call(T, P2);
console.log('individual: out of range', (await call(T, `/api/assignments/submissions/${d2.submissions[0].id}/return`, { criteria: d2.rubric.map((r) => ({ id: r.id, score: 8 })), members: [{ studentId: ids[A], score: 99 }] }))[0]);
console.log('individual: alice 9', JSON.stringify((await call(T, `/api/assignments/submissions/${d2.submissions[0].id}/return`, { criteria: d2.rubric.map((r) => ({ id: r.id, score: 8 })), members: [{ studentId: ids[A], score: 9 }] }))[1]).slice(0, 60));
console.log('alice', (await call(A, P2))[1].mine.score, '| bob', (await call(BOB, P2))[1].mine.score);
console.log('regrade: alice back to the group grade', (await call(T, `/api/assignments/submissions/${d2.submissions[0].id}/return`, { criteria: d2.rubric.map((r) => ({ id: r.id, score: 6 })), members: [] }))[0], 'alice', (await call(A, P2))[1].mine.score, 'bob', (await call(BOB, P2))[1].mine.score);

for (const a of (await call(T, `/api/assignments?courseId=${C}`))[1]) if (a.title.startsWith('Group test')) await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
console.log('cleaned');
