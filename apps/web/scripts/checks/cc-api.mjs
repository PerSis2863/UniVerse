// Common Cartridge export data and import batches on the local Worker.
const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ ...(e ? { Authorization: `Bearer mock-token-${e}` } : {}), 'Content-Type': 'application/json' });
const call = async (who, path, body) => { const r = await fetch(B + path, { method: body ? 'POST' : 'GET', headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', TARA = 'tara@teacher.com', TOM = 'tom@teacher.com', S = 'demo@student.com';
const imp = `/api/courses/${C}/import`, mods = `/api/courses/${C}/modules`;
const page = (t) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

const [es, ex] = await call(T, `/api/courses/${C}/cartridge`);
console.log('export data', es, ex.course?.code, 'modules', ex.modules?.length, 'kinds', [...new Set(ex.modules?.flatMap((m) => m.items.map((i) => i.kind)))].join(','));
const q = ex.modules?.flatMap((m) => m.items).find((i) => i.kind === 'QUIZ');
if (q) console.log('a quiz in the export', JSON.stringify(q.quiz).slice(0, 160));
console.log('export: student', (await call(S, `/api/courses/${C}/cartridge`))[0], '| TA', (await call(TOM, `/api/courses/${C}/cartridge`))[0], '| co-teacher', (await call(TARA, `/api/courses/${C}/cartridge`))[0], '| signed out', (await call(null, `/api/courses/${C}/cartridge`))[0]);

const items = [
  { kind: 'PAGE', title: 'Imported page', body: page('From another LMS') },
  { kind: 'PAGE', title: 'Plain page', body: 'Just text' },
  { kind: 'VIDEO', title: 'Lecture', url: 'https://youtu.be/dQw4w9WgXcQ' },
  { kind: 'LINK', title: 'Docs', url: 'https://docs.python.org' },
  { kind: 'QUIZ', title: 'Imported quiz', description: 'Week 1', questions: [{ question: '2 + 2?', options: ['3', '4'], correct: '4', points: 2 }, { question: 'bad', options: ['a'], correct: 'a', points: 1 }] },
];
const [s1, r1] = await call(T, imp, { title: 'Imported week 1', items });
console.log('import batch 1', s1, JSON.stringify(r1));
const [s2, r2] = await call(T, imp, { moduleId: r1.moduleId, items: [{ kind: 'PAGE', title: 'Second batch page', body: 'More' }] });
console.log('import batch 2 (same module)', s2, JSON.stringify(r2));
const [, after] = await call(T, mods);
const m = after.modules.find((x) => x.id === r1.moduleId);
console.log('module', m.title, 'published', m.published, 'items', m.items.map((i) => `${i.kind}:${i.title}${i.rich ? '(rich)' : ''}${i.missing ? '(missing)' : ''}`).join(', '));
const quizItem = m.items.find((i) => i.kind === 'QUIZ');
const [, quizzes] = await call(T, '/api/core/quizzes');
const quiz = (Array.isArray(quizzes) ? quizzes : []).find((x) => x.id === quizItem?.refId);
console.log('quiz made', !!quiz, quiz?.status);
console.log('student sees the module', (await call(S, mods))[1].modules.some((x) => x.id === r1.moduleId));

const bad = async (label, body, who = T) => console.log(label, JSON.stringify(await call(who, imp, body)));
await bad('student imports', { items: [items[0]] }, S);
await bad('TA imports', { items: [items[0]] }, TOM);
await bad('nothing', { items: [] });
await bad('too many', { items: Array.from({ length: 21 }, (_, i) => ({ kind: 'LINK', title: `L${i}`, url: 'https://x.example' })) });
await bad('bad link', { items: [{ kind: 'LINK', title: 'x', url: 'javascript:alert(1)' }] });
await bad('file from elsewhere', { items: [{ kind: 'FILE', title: 'x', url: 'https://evil.example/a.pdf', fileName: 'a.pdf' }] });
await bad('bad page', { items: [{ kind: 'PAGE', title: 'x', body: JSON.stringify({ type: 'doc', content: [{ type: 'script' }] }) }] });
await bad('quiz with no good questions', { items: [{ kind: 'QUIZ', title: 'Empty', questions: [{ question: 'q', options: ['a', 'a'], correct: 'a' }] }] });
await bad('other course module', { moduleId: 'nope', items: [items[3]] });
await bad('unknown kind', { items: [{ kind: 'ASSIGNMENT', title: 'x' }] });

await call(T, mods, { action: 'delete-module', moduleId: r1.moduleId });
if (quizItem?.refId) console.log('remove quiz', (await fetch(`${B}/api/core/quizzes/${quizItem.refId}`, { method: 'DELETE', headers: H(T) })).status);
console.log('cleaned', !(await call(T, mods))[1].modules.some((x) => x.id === r1.moduleId));
