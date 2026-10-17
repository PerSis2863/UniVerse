const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const post = async (who, path, body) => { const r = await fetch(B + path, { method: 'POST', headers: H(who), body: JSON.stringify(body) }); return [r.status, await r.json().catch(() => ({}))]; };
const code = process.argv[2] ?? 'CS101-2027';
console.log('student tries', (await post('demo@student.com', `/api/courses/${C}/copy`, { code: 'X1' }))[0]);
console.log('same code', JSON.stringify(await post('demo@teacher.com', `/api/courses/${C}/copy`, { code: 'CS101' })));
const [st, start] = await post('demo@teacher.com', `/api/courses/${C}/copy`, { code, name: 'Intro to CS (2027)' });
console.log('start', st, JSON.stringify(start));
const target = start.course.id; let requests = 1;
for (const stage of start.stages) {
  let after = null, total = 0, steps = 0;
  do {
    const [s, r] = await post('demo@teacher.com', `/api/courses/${C}/copy/step`, { target, stage, after, shiftDays: 364 });
    requests++; steps++;
    if (s !== 200) { console.log('FAIL', stage, s, JSON.stringify(r)); process.exit(1); }
    total += r.copied; after = r.after;
  } while (after);
  console.log(stage.padEnd(12), 'copied', total, 'in', steps, 'step(s)');
}
// A step run again copies nothing new.
const [s2, again] = await post('demo@teacher.com', `/api/courses/${C}/copy/step`, { target, stage: 'questions', after: null, shiftDays: 364 });
console.log('repeat step', s2, JSON.stringify(again), 'requests', requests);
console.log('into itself', (await post('demo@teacher.com', `/api/courses/${C}/copy/step`, { target: C, stage: 'modules' }))[0]);
console.log('TARGET', target);
