const base = 'http://localhost:8787';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
for (const who of ['alice@student.com', 'demo@teacher.com']) {
  const list = await fetch(`${base}/api/core/calendar/my`, { headers: H(who) }).then((r) => r.json());
  const junk = list.filter((e) => ['Chem revision', 'Football practice', 'Football', 'Fake exam', 'Revision', 'Revision class', 'Office hours'].includes(e.title) || /^Gym \d/.test(e.title));
  for (const e of junk) await fetch(`${base}/api/core/calendar/${e.id}${e.batch ? '?series=1' : ''}`, { method: 'DELETE', headers: H(who) });
  console.log(who, 'removed', junk.length);
}
