// Rich lesson pages on the local Worker: save, list, load, access, bad input.
const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ ...(e ? { Authorization: `Bearer mock-token-${e}` } : {}), 'Content-Type': 'application/json' });
const call = async (who, path, body) => { const r = await fetch(B + path, { method: body ? 'POST' : 'GET', headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', TOM = 'tom@teacher.com', S = 'demo@student.com';
const mods = `/api/courses/${C}/modules`;
const p = (text, marks) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });
const doc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Loops, step by step' }] },
  p('A link that must go', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
  { type: 'callout', attrs: { tone: 'warning' }, content: [p('Mind the off-by-one.')] },
  { type: 'embed', attrs: { kind: 'youtube', src: 'dQw4w9WgXcQ', title: 'Lecture', chapters: '0:00 Start\n1:10 for loops\n2:30 while loops' } },
  { type: 'embed', attrs: { kind: 'math', tex: 'x^2' } },
  { type: 'quickCheck', attrs: { question: 'How many times does range(3) loop?', options: ['2', '3', '4'], answer: 1, explain: '0, 1 and 2.' } },
  { type: 'flashcards', attrs: { title: 'Words', cards: [{ front: 'loop', back: 'repeat' }, { front: 'range', back: 'numbers in a row' }] } },
] };

const [, view] = await call(T, mods);
const created = [];
const [, open] = await call(T, mods, { action: 'create-module', title: 'Rich pages test', published: true });
const [, later] = await call(T, mods, { action: 'create-module', title: 'Locked test', published: true, releaseAt: new Date(Date.now() + 7 * 864e5).toISOString() });
const [, hidden] = await call(T, mods, { action: 'create-module', title: 'Hidden test', published: false });
created.push(open.id, later.id, hidden.id);
console.log('modules made', !!open.id, !!later.id, !!hidden.id, 'existing', view.modules.length);

const [as, page] = await call(T, mods, { action: 'add-item', moduleId: open.id, kind: 'PAGE', title: 'Loops' });
console.log('add page with only a title', as, page.body === null);
const [us] = await call(T, mods, { action: 'update-item', itemId: page.id, body: JSON.stringify(doc) });
console.log('save rich page', us);
const [, after] = await call(T, mods);
const listed = after.modules.find((m) => m.id === open.id).items[0];
console.log('in the list: rich', listed.rich, 'body', listed.body);
const [gs, got] = await call(T, `${mods}/${page.id}`);
const saved = JSON.parse(got.body);
console.log('teacher loads', gs, 'link mark dropped', JSON.stringify(saved.content[1].content[0].marks ?? null), 'chapters', JSON.stringify(saved.content[3].attrs.chapters), 'blocks', saved.content.map((n) => n.type).join(','));
console.log('student loads', (await call(S, `${mods}/${page.id}`))[0], '| signed out', (await call(null, `${mods}/${page.id}`))[0], '| other teacher', (await call(TOM, `${mods}/${page.id}`))[0]);

const [, lockedPage] = await call(T, mods, { action: 'add-item', moduleId: later.id, kind: 'PAGE', title: 'Next week', body: 'Plain text page' });
const [, hiddenPage] = await call(T, mods, { action: 'add-item', moduleId: hidden.id, kind: 'PAGE', title: 'Draft', body: JSON.stringify(doc) });
console.log('student, locked module', JSON.stringify(await call(S, `${mods}/${lockedPage.id}`)), '| hidden module', (await call(S, `${mods}/${hiddenPage.id}`))[0], '| teacher, locked', (await call(T, `${mods}/${lockedPage.id}`))[0]);
const [, plainList] = await call(T, mods);
const plain = plainList.modules.find((m) => m.id === later.id).items[0];
console.log('plain page in the list', plain.rich, JSON.stringify(plain.body));

const bad = async (label, body) => console.log(label, JSON.stringify(await call(T, mods, { action: 'update-item', itemId: page.id, body })));
await bad('unknown block', JSON.stringify({ type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://evil.example' } }] }));
await bad('unsafe picture', JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:1' } }] }));
await bad('too long', JSON.stringify({ type: 'doc', content: Array.from({ length: 4 }, () => p('x'.repeat(80_000))) }));
await bad('broken json', '{"type":"doc", nope');
console.log('student edits', (await call(S, mods, { action: 'update-item', itemId: page.id, body: 'hi' }))[0]);
console.log('page still there', JSON.parse((await call(T, `${mods}/${page.id}`))[1].body).content.length);
console.log('not a page', (await call(T, `${mods}/nope`))[0]);

for (const id of created) await call(T, mods, { action: 'delete-module', moduleId: id });
console.log('cleaned', (await call(T, mods))[1].modules.length === view.modules.length);
