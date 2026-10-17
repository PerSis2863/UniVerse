// File and link hand-ins on the local Worker.
const B = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(B + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const T = 'demo@teacher.com', A = 'alice@student.com', BOB = 'bob@student.com';
const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const up = await fetch(`${B}/api/upload?filename=essay.pdf`, { method: 'POST', headers: { Authorization: `Bearer mock-token-${A}`, 'Content-Type': 'application/pdf' }, body: pdf }).then((r) => r.json());
console.log('upload', up.url?.slice(0, 20));

const [, f] = await call(T, '/api/assignments', { courseId: C, title: 'File test', instructions: 'Hand in your essay as a PDF.', rubric: [{ criterion: 'Content', points: 10 }], submitKind: 'FILE' });
const [, l] = await call(T, '/api/assignments', { courseId: C, title: 'Link test', instructions: 'Share your video.', rubric: [{ criterion: 'Content', points: 10 }], submitKind: 'LINK' });
console.log('kinds', f.submitKind, l.submitKind, '| bad kind', (await call(T, `/api/assignments/${f.id}`, { submitKind: 'CODE' }, 'PATCH'))[0]);
const F = `/api/assignments/${f.id}/submission`, L = `/api/assignments/${l.id}/submission`;
console.log('file: none', JSON.stringify(await call(A, F, { text: '' }, 'PUT')));
console.log('file: from elsewhere', (await call(A, F, { fileUrl: 'https://evil.example/x.pdf', fileName: 'x.pdf' }, 'PUT'))[0]);
console.log('file: ok, no note', JSON.stringify((await call(A, F, { fileUrl: up.url, fileName: 'essay.pdf', fileSize: pdf.length }, 'PUT'))));
console.log('link: bad', JSON.stringify(await call(BOB, L, { linkUrl: 'javascript:alert(1)' }, 'PUT')));
console.log('link: ok with note', (await call(BOB, L, { linkUrl: 'https://youtu.be/dQw4w9WgXcQ', text: 'My video' }, 'PUT'))[0]);
const [, fd] = await call(T, `/api/assignments/${f.id}`);
const fs = fd.submissions[0];
console.log('teacher sees file', fs.fileName, fs.fileSize, fs.fileUrl === up.url, '| AI draft', JSON.stringify((await call(T, `/api/assignments/submissions/${fs.id}/draft`, {}))[1]));
const [, ld] = await call(T, `/api/assignments/${l.id}`);
console.log('teacher sees link', ld.submissions[0].linkUrl, JSON.stringify(ld.submissions[0].text));
const [, mine] = await call(A, `/api/assignments/${f.id}`);
console.log('alice sees her file', mine.submitKind, mine.mine.fileName, !!mine.mine.fileUrl);
console.log('text assignment still needs 20 characters', (await call(A, `/api/assignments/${(await call(T, '/api/assignments', { courseId: C, title: 'Text test', instructions: 'Write.', rubric: [{ criterion: 'C', points: 5 }] }))[1].id}/submission`, { text: 'short' }, 'PUT'))[0]);
for (const a of (await call(T, `/api/assignments?courseId=${C}`))[1]) if (['File test', 'Link test', 'Text test'].includes(a.title)) await call(T, `/api/assignments/${a.id}`, null, 'DELETE');
console.log('cleaned');
