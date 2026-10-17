// The school's grading scale on the local Worker.
const B = 'http://localhost:8787';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const ADMIN = 'demo@admin.com', T = 'demo@teacher.com', S = 'demo@student.com';
for (const who of [ADMIN, T, S]) { const [st, d] = await call(who, '/api/grade-scale'); console.log(who, st, d.scale?.map((b) => b.letter).join(''), 'custom', d.custom, 'canEdit', d.canEdit); }
console.log('teacher sets', (await call(T, '/api/grade-scale', { scale: [] }, 'PUT'))[0]);
const [s1, r1] = await call(ADMIN, '/api/grade-scale', { scale: [{ letter: 'Distinction', min: 85, gpa: 4 }, { letter: 'Merit', min: 65, gpa: 3 }, { letter: 'Pass', min: 40, gpa: 2 }, { letter: 'Fail', min: 10, gpa: 0 }] }, 'PUT');
console.log('admin sets', s1, JSON.stringify(r1).slice(0, 160));
console.log('broken scale', JSON.stringify(await call(ADMIN, '/api/grade-scale', { scale: [{ letter: 'A', min: 90, gpa: 4 }] }, 'PUT')).slice(0, 120));
const [, tv] = await call(T, '/api/grade-scale');
console.log('teacher now sees', tv.scale?.map((b) => b.letter).join(','));
const [, dash] = await call(T, '/api/core/dashboard/teacher');
console.log('teacher dashboard bands', JSON.stringify(dash.gradeDistributionData ?? dash.stats?.gradeDistributionData ?? null)?.slice(0, 160));
console.log('reset', (await call(ADMIN, '/api/grade-scale', { scale: null }, 'PUT'))[1].custom);
