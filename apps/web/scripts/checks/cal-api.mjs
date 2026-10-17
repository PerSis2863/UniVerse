// Q12 calendar and timetable APIs on the built Worker: own events (validation, repeat, move, someone
// else's, series delete), a course event only from its teacher, calendar-file import (and again:
// replaced), the generators' inputs for admins only, and that the read-only demo admin can't save.
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com', ADM = 'demo@admin.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const at = (days, h, m = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };
const r = {};

const [c1, e1] = await call(A, '/api/core/calendar', { title: 'Football', startAt: at(1, 10), endAt: at(1, 11), type: 'FOCUS', color: '#0f766e' });
r.create = { status: c1, type: e1.type, color: e1.color, batch: e1.batch };
r.badEnd = (await call(A, '/api/core/calendar', { title: 'x', startAt: at(1, 11), endAt: at(1, 10) }))[0];
r.noTitle = (await call(A, '/api/core/calendar', { title: '  ', startAt: at(1, 10), endAt: at(1, 11) }))[0];
r.tooLong = (await call(A, '/api/core/calendar', { title: 'x', startAt: at(1, 10), endAt: at(40, 10) }))[0];
const [, exam] = await call(A, '/api/core/calendar', { title: 'Fake exam', startAt: at(2, 9), endAt: at(2, 10), type: 'EXAM', color: 'red;' });
r.examWithoutCourse = { type: exam.type, color: exam.color };
r.studentCourseEvent = (await call(A, '/api/core/calendar', { title: 'Party', startAt: at(2, 9), endAt: at(2, 10), courseId: C }))[0];
const [, rep] = await call(A, '/api/core/calendar', { title: 'Revision', startAt: at(3, 15), endAt: at(3, 16), weeks: 4 });
r.repeat = { created: rep.created, batch: rep.batch?.startsWith('repeat:') };
// Move: the owner can, someone else can't.
const [m1, moved] = await call(A, `/api/core/calendar/${e1.id}`, { startAt: at(1, 12), endAt: at(1, 13) }, 'PATCH');
r.move = { status: m1, startAt: moved.startAt };
r.bobMoves = (await call(B, `/api/core/calendar/${e1.id}`, { startAt: at(1, 14), endAt: at(1, 15) }, 'PATCH'))[0];
r.bobDeletes = (await call(B, `/api/core/calendar/${e1.id}`, undefined, 'DELETE'))[0];
// The teacher's event on course C: Alice sees it, can't move it.
const [t1, tev] = await call(T, '/api/core/calendar', { title: 'Revision class', startAt: at(4, 9), endAt: at(4, 10), type: 'MEETING', courseId: C });
const [, mine] = await call(A, '/api/core/calendar/my');
r.courseEvent = { status: t1, aliceSees: mine.some((x) => x.id === tev.id), aliceMoves: (await call(A, `/api/core/calendar/${tev.id}`, { startAt: at(4, 11), endAt: at(4, 12) }, 'PATCH'))[0] };
const [, tmine] = await call('tara@teacher.com', '/api/core/calendar/my');
r.coTeacherSees = tmine.some((x) => x.id === tev.id);
// A series goes together.
const [, del] = await call(A, `/api/core/calendar/${rep.id}?series=1`, undefined, 'DELETE');
r.seriesDelete = del.removed;
// Import a calendar file's events; the same name again replaces them.
const events = [0, 1, 2].map((i) => ({ title: `Gym ${i}`, startAt: at(5 + i, 7), endAt: at(5 + i, 8), description: 'Leisure centre' }));
const [i1, imp] = await call(A, '/api/core/calendar/import', { name: 'My Google', events: [...events, { title: 'bad', startAt: 'never', endAt: 'x' }] });
const [, imp2] = await call(A, '/api/core/calendar/import', { name: 'My Google', events: events.slice(0, 2) });
const [, after] = await call(A, '/api/core/calendar/my');
r.import = { status: i1, first: imp.imported, again: imp2, gyms: after.filter((x) => x.title.startsWith('Gym')).length, batch: after.find((x) => x.title === 'Gym 0')?.batch };
r.emptyImport = (await call(A, '/api/core/calendar/import', { name: 'x', events: [] }))[0];
// The generators: admins only; the demo admin reads but can't save.
const [p1, plan] = await call(ADM, '/api/admin/timetable/plan');
r.plan = { status: p1, courses: plan.courses?.length, rooms: plan.rooms?.length, withSeats: plan.rooms?.filter((x) => x.capacity > 0).length, slots: plan.slots?.length, overlaps: plan.overlaps?.length, sample: plan.overlaps?.[0], exams: plan.exams };
r.teacherPlan = (await call(T, '/api/admin/timetable/plan'))[0];
r.demoAdminSave = (await call(ADM, '/api/admin/timetable/plan', { courseIds: [C], slots: [] }))[0];
r.demoAdminExams = (await call(ADM, '/api/admin/timetable/exams', { name: 'x', exams: [] }))[0];
r.teacherExams = (await call(T, '/api/admin/timetable/exams', { name: 'x', exams: [{ courseId: C, startAt: at(9, 9), endAt: at(9, 11) }] }))[0];
console.log(JSON.stringify(r, null, 1));
// Tidy up.
for (const id of [e1.id, exam.id]) await call(A, `/api/core/calendar/${id}`, undefined, 'DELETE');
await call(T, `/api/core/calendar/${tev.id}`, undefined, 'DELETE');
const g = after.find((x) => x.title === 'Gym 0');
if (g) await call(A, `/api/core/calendar/${g.id}?series=1`, undefined, 'DELETE');
