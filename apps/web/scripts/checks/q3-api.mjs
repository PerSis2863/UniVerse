const base = 'http://localhost:8787';
const h = (email, extra = {}) => ({ Authorization: `Bearer mock-token-${email}`, ...extra });
const get = (p, email = 'demo@student.com') => fetch(base + p, { headers: h(email) });
// 1) Traffic so the 1-in-20 sample records something.
let codes = {};
for (let i = 0; i < 80; i++) { const r = await get(i % 2 ? '/api/notifications' : '/api/me'); codes[r.status] = (codes[r.status] ?? 0) + 1; await r.arrayBuffer(); }
console.log('traffic', codes);
// 2) Owner-only route stays hidden from the demo admin.
const own = await get('/api/core/owner/health-numbers', 'demo@admin.com'); console.log('owner route as demo admin', own.status);
// 3) School switch: wait for the guard to reload switches (every 60 s), then send a message as each.
const me = async (email) => (await (await get('/api/me', email)).json());
const alice = await me('alice@student.com'); const student = await me('demo@student.com');
console.log('ids', student.id ?? student.user?.id, alice.id ?? alice.user?.id);
await new Promise((r) => setTimeout(r, 62_000));
await (await get('/api/me')).arrayBuffer(); // triggers refresh
await new Promise((r) => setTimeout(r, 1500));
const post = async (email, path, body) => { const r = await fetch(base + path, { method: 'POST', headers: h(email, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); return [r.status, (await r.text()).slice(0, 160)]; };
console.log('student (school with chat off) start chat:', await post('demo@student.com', '/api/chat/conversations', { userId: alice.id ?? alice.user?.id }));
console.log('alice (no school) start chat:', await post('alice@student.com', '/api/chat/conversations', { userId: student.id ?? student.user?.id }));
// GET still works for the student
const list = await get('/api/chat/conversations'); console.log('student reads chats', list.status);
