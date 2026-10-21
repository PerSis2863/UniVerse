// Q22 in the browser on the built Worker (pnpm local:serve --test-secret --ai-placeholder): AI
// receipts on a quiz (Bob hands in and says he didn't use AI; the teacher sees each receipt and the
// class at a glance) and on an oral check (Bob attaches his after the oral; the teacher sees it), and
// "Ask the TA" in an in-person class. Axe at 390 and 1280 px, light and dark, no sideways scrolling.
// Everything made here is removed at the end.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../browser-session.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const APP = fileURLToPath(new URL('../..', import.meta.url));
const base = 'http://localhost:8787', C = 'cmulde0g900147d341qn9mxlw';
const T = 'demo@teacher.com', A = 'alice@student.com', B = 'bob@student.com';
const H = (e) => ({ Authorization: `Bearer mock-token-${e}`, 'Content-Type': 'application/json' });
const call = async (who, path, body, method) => { const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: H(who), body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
const sql = (c) => execSync(`npx wrangler d1 execute universe-db --local --json --command "${c.replace(/"/g, '\\"')}"`, { cwd: APP, encoding: 'utf8' });
const rows = (c) => JSON.parse(sql(c))[0]?.results ?? [];
const ts = (d = new Date()) => d.toISOString().replace('Z', '+00:00');
const uid = (email) => rows(`SELECT id FROM users WHERE email='${email}'`)[0].id;
const aId = uid(A), bId = uid(B);
const began = ts();
const out = { checks: [], axe: [], wide: [] };
const ok = (name, v) => out.checks.push(`${v ? '✓' : '✗'} ${name}`);

async function axe(page, where) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  if (v.length) out.axe.push(`${where}: ${v.join('; ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) out.wide.push(where);
}

// ── Data ──
const quiz = (await call(T, '/api/core/quizzes', { courseId: C, title: 'Q22 UI quiz' })).b;
const checkIds = [];
const useIds = [];
let roomId = null;
try {
  await call(T, `/api/quizzes/${quiz.id}/questions`, { question: 'Q22: pick yes', options: ['yes', 'no'], correctAnswer: 'yes', points: 1 });
  await call(T, `/api/quizzes/${quiz.id}`, { aiPolicy: 'NONE', status: 'PUBLISHED' }, 'PATCH');
  const qid = (await call(T, `/api/quizzes/${quiz.id}`)).b.questions[0].id;
  await call(A, `/api/core/quizzes/${quiz.id}/start`, {});
  const useId = `q22ui${Date.now()}`;
  useIds.push(useId);
  sql(`INSERT INTO ai_uses (id, userId, kind, detail, courseId, createdAt) VALUES ('${useId}', '${aId}', 'tutor', 'What is a loop?', '${C}', '${ts()}')`);
  await call(A, `/api/core/quizzes/${quiz.id}/submit`, { answers: { [qid]: 'yes' }, aiReceipt: { attach: true, declaredNone: false, note: 'Asked the tutor once' } });
  const check = (await call(T, `/api/courses/${C}/oral-checks`, { title: 'Q22 UI viva', kind: 'VIVA', topic: 'Loops and recursion', minutes: 5, aiPolicy: 'RECEIPT' })).b;
  checkIds.push(check.id);
  sql(`INSERT INTO oral_sessions (id, userId, courseId, checkId, kind, topic, lang, rubric, transcript, durationSec, status, createdAt) VALUES ('q22uioral', '${bId}', '${C}', '${check.id}', 'VIVA', 'Loops and recursion', '', (SELECT rubric FROM oral_checks WHERE id='${check.id}'), '[]', 240, 'SUBMITTED', '${ts(new Date(Date.now() - 60_000))}')`);
  const room = (await call(T, '/api/classroom', { courseId: C })).b;
  roomId = room.id;
  const code = (await call(T, `/api/classroom/${room.id}/code`)).b.code;
  await call(B, '/api/classroom/join', { code });
  await call(B, `/api/classroom/${room.id}`, { action: 'ask', text: 'Why does the loop stop at n - 1?' });

  const browser = await launch();
  const me = {};
  for (const e of [T, B]) me[e] = (await call(e, '/api/core/auth/me')).b;
  const open = async (who, width, theme) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([t, u, th]) => {
      localStorage.setItem('accessToken', t); localStorage.setItem('universe-auth', JSON.stringify({ state: { user: u }, version: 0 }));
      localStorage.setItem('theme', th); localStorage.setItem(`universe-tour-done:${u.id}`, '1');
    }, [`mock-token-${who}`, me[who], theme]);
    return { ctx, page: await ctx.newPage() };
  };
  try {
    // Bob takes the quiz: the rule shows, then the AI receipt step when handing in.
    {
      const { ctx, page } = await open(B, 390, 'light');
      await page.goto(`${base}/student/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
      const card = page.locator('div.card, div').filter({ hasText: 'Q22 UI quiz' }).filter({ has: page.getByRole('button', { name: /Start Quiz/ }) }).last();
      await card.getByRole('button', { name: /Start Quiz/ }).click();
      await page.getByText('No AI.').first().waitFor({ timeout: 15_000 });
      ok('quiz shows its AI rule', true);
      await page.getByRole('radio', { name: /yes/ }).first().click();
      await page.getByRole('button', { name: /Finish/ }).first().click();
      await page.getByText('AI receipt').first().waitFor({ timeout: 10_000 });
      ok('hand-in step asks about AI', await page.getByText('I didn’t use AI for this quiz.').isVisible());
      await axe(page, 'quiz hand-in 390 light');
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await page.waitForTimeout(800);
      ok('submitting without a choice is refused', await page.getByText('This quiz doesn’t allow AI', { exact: false }).first().isVisible().catch(() => false));
      await page.getByText('I didn’t use AI for this quiz.').click();
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await page.getByText('Quiz submitted successfully.').waitFor({ timeout: 10_000 });
      ok('handed in with "no AI"', true);
      await ctx.close();
    }
    const stored = rows(`SELECT aiReceipt FROM quiz_submissions WHERE quizId='${quiz.id}' AND studentId='${bId}'`)[0]?.aiReceipt ?? '';
    ok('Bob’s declaration is kept, made during the attempt', /"declaredNone":true/.test(stored) && /"during":true/.test(stored));

    // Bob attaches his oral receipt after the oral.
    {
      const { ctx, page } = await open(B, 390, 'dark');
      await page.goto(`${base}/student/oral-practice`, { waitUntil: 'networkidle', timeout: 60_000 });
      ok('oral check asks for the receipt', await page.getByText('Add your AI receipt: open it').isVisible());
      await page.getByRole('button', { name: /Sent/ }).first().click();
      await page.getByRole('button', { name: 'Send my AI receipt' }).waitFor({ timeout: 10_000 });
      await axe(page, 'oral receipt 390 dark');
      await page.getByRole('button', { name: 'Send my AI receipt' }).click();
      await page.getByText('Your AI receipt', { exact: true }).waitFor({ timeout: 10_000 });
      ok('oral receipt sent', true);
      await ctx.close();
    }

    // In-person class: Bob's question with "Ask the TA" (the placeholder key can't really answer).
    for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
      const { ctx, page } = await open(B, width, theme);
      await page.goto(`${base}/student/live`, { waitUntil: 'networkidle', timeout: 60_000 });
      const btn = page.getByRole('button', { name: /Ask the TA now/ });
      await btn.waitFor({ timeout: 15_000 });
      if (width === 390 && theme === 'light') {
        ok('Ask the TA is offered', true);
        await btn.click();
        await page.waitForTimeout(1500);
        ok('a TA failure is told kindly', await page.getByText(/TA couldn’t answer|TA isn’t available/).first().isVisible().catch(() => false));
      }
      await axe(page, `in-person class ${width} ${theme}`);
      await ctx.close();
    }

    // The teacher: the quiz's results with each receipt and the class at a glance; the oral check.
    for (const [width, theme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark']]) {
      const { ctx, page } = await open(T, width, theme);
      await page.goto(`${base}/teacher/quizzes`, { waitUntil: 'networkidle', timeout: 60_000 });
      const card = page.locator('div.card').filter({ hasText: 'Q22 UI quiz' }).first();
      await card.getByRole('button', { name: 'Edit quiz' }).click();
      await page.getByText('AI receipts:', { exact: false }).first().waitFor({ timeout: 15_000 });
      if (width === 1280 && theme === 'light') {
        const summary = await page.getByRole('note', { name: 'AI receipts in this class' }).innerText();
        ok(`quiz summary: ${summary.replace(/\s+/g, ' ').slice(0, 120)}`, /1 of 2 attached/.test(summary) && /1 said they didn’t use AI/.test(summary));
        await page.getByText(/AI receipt: 1 use/).first().click();
        ok('teacher sees Alice’s receipt', await page.getByText('Asked the tutor once').first().isVisible());
        ok('AI rule picker shows', await page.getByRole('combobox', { name: /AI use/ }).first().isVisible());
      }
      await page.waitForTimeout(1000); // the panel slides in on phones
      await axe(page, `teacher quiz ${width} ${theme}`);
      await page.goto(`${base}/teacher/blackboard?course=${C}&tab=orals`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByText('Q22 UI viva').first().click();
      await page.getByText('AI receipts:', { exact: false }).first().waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: /Bob/ }).first().click();
      await page.getByRole('heading', { name: 'AI receipt' }).waitFor({ timeout: 10_000 });
      if (width === 1280 && theme === 'light') ok('teacher sees Bob’s oral receipt', await page.getByText(/attached a receipt|attached \d+ use/).first().isVisible());
      await axe(page, `teacher oral ${width} ${theme}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await call(T, `/api/core/quizzes/${quiz.id}`, null, 'DELETE');
  for (const id of checkIds) await call(T, `/api/oral-checks/${id}`, null, 'DELETE');
  if (useIds.length) sql(`DELETE FROM ai_uses WHERE id IN (${useIds.map((x) => `'${x}'`).join(',')})`);
  if (roomId) { await call(T, `/api/classroom/${roomId}`, { action: 'end' }); sql(`DELETE FROM classroom_sessions WHERE id='${roomId}'`); }
  // Joining the class marked Bob present today: that goes too.
  sql(`DELETE FROM attendance WHERE courseId='${C}' AND studentId='${bId}' AND createdAt >= '${began}'`);
}
console.log(JSON.stringify(out, null, 1));
