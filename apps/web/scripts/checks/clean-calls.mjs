const B = 'http://localhost:8787';
const H = { Authorization: 'Bearer mock-token-demo@teacher.com', 'Content-Type': 'application/json' };
const list = await fetch(`${B}/api/calls/scheduled`, { headers: H }).then((r) => r.json());
for (const c of list.filter((x) => x.title === 'Home test call')) console.log('delete', c.id, (await fetch(`${B}/api/calls/scheduled/${c.id}`, { method: 'DELETE', headers: H })).status);
