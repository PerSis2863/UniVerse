const B = 'http://localhost:8787';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
for (const who of ['demo@teacher.com', 'tom@teacher.com', 'alice@student.com']) {
  const docs = (await fetch(`${B}/api/docs`, { headers: H(who) }).then((r) => r.json())).docs ?? [];
  for (const d of docs.filter((x) => x.title.startsWith('Search test') || x.title.startsWith('Contrast test')) ) console.log('doc', d.title, (await fetch(`${B}/api/docs/${d.id}`, { method: 'DELETE', headers: H(who) })).status);
  const t = await fetch(`${B}/api/tasks`, { headers: H(who) }).then((r) => r.json());
  for (const b of (t.boards ?? []).filter((x) => x.title.startsWith('Search test'))) console.log('board', b.title, (await fetch(`${B}/api/tasks/${b.id}`, { method: 'DELETE', headers: H(who) })).status);
}
const list = await fetch(`${B}/api/assignments?courseId=cmulde0g900147d341qn9mxlw`, { headers: H('demo@teacher.com') }).then((r) => r.json());
for (const a of (list.assignments ?? list).filter?.((x) => x.title?.startsWith('Search test')) ?? []) console.log('assignment', a.title, (await fetch(`${B}/api/assignments/${a.id}`, { method: 'DELETE', headers: H('demo@teacher.com') })).status);
