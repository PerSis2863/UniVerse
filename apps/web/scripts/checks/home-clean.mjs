const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const list = await fetch(`${B}/api/courses/${C}/discussion`, { headers: H('demo@teacher.com') }).then((r) => r.json());
for (const t of (list.threads ?? list).filter?.((x) => x.title?.startsWith('Home test')) ?? []) {
  const r = await fetch(`${B}/api/courses/${C}/discussion/${t.id}`, { method: 'POST', headers: H('demo@teacher.com'), body: JSON.stringify({ action: 'delete' }) });
  console.log('delete', t.id, r.status);
}
