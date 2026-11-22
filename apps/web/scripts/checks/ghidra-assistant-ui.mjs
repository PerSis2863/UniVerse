// M363 Ghidra, the assistant, on the hub: "What's due this week?" answers from the student's own work (a list, or
// "Nothing is due"), "How am I doing in Green?" answers with their numbers, "I cycled 8 km to school" proposes Log it,
// Cancel leaves it undone, New chat clears it. Nothing is saved. Axe at 1280 (dark) and 390 (light, a touch phone),
// no sideways scroll, no page errors. M364: the corner assistant is Ghidra on every page (the student home): "What's due
// this week?" comes back as Ghidra's reply, "How do I log a climate action?" stays an instant built-in answer. M365: "What
// trips do I have?" lists them, "Plan a trip to Jaipur for 3 of us" proposes Make the trip (cancelled). M366: a teacher's
// "Make a quiz on fractions for CS101" finds the course and proposes Write the quiz (cancelled). M370: "i want to die" gets
// the helplines at once; an answer is reported (one ghidra_reports row for alice is left: Done in the console's Moderation).
//   BASE=http://localhost:3000 SHOTS=<folder> node scripts/checks/ghidra-assistant-ui.mjs
import { createRequire } from 'node:module';
import { launch, signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const AXE = require.resolve('axe-core/axe.min.js');
const base = process.env.BASE ?? 'http://localhost:8787', shots = process.env.SHOTS;
const browser = await launch();
const out = {}, errors = [];
try {
  for (const [theme, width] of [['dark', 1280], ['light', 390]]) {
    const phone = width < 600, r = (out[`${theme} ${width}`] = {});
    const ctx = await signedIn(browser, base, 'alice@student.com', { width, height: phone ? 844 : 900 }, phone ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript((th) => { localStorage.setItem('theme', th); localStorage.setItem('uv-cookies', 'essential'); }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message.slice(0, 160)} @ ${(e.stack ?? '').split('\n').slice(1, 3).join(' | ').slice(0, 300)}`));
    await page.goto(`${base}/hub`, { waitUntil: 'load', timeout: 180_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const box = page.locator('section[aria-labelledby="ghidra-h"]');
    await box.scrollIntoViewIfNeeded();
    const say = async (q) => {
      await box.getByLabel('Ask Ghidra').fill(q);
      await box.getByRole('button', { name: 'Ask', exact: true }).click();
      await box.getByText('Ghidra is thinking…').waitFor({ state: 'detached', timeout: 30_000 });
      return (await box.locator('ol > li').last().innerText()).replace(/\s+/g, ' ');
    };
    r.due = await say('What’s due this week?');
    r.green = await say('How am I doing in Green?');
    r.cycle = await say('I cycled 8 km to school');
    r.proposes = await box.getByRole('button', { name: 'Log it' }).isVisible();
    await box.getByRole('button', { name: 'Cancel' }).click();
    r.cancelled = await box.getByText('Cancelled.').isVisible();
    r.turns = await box.locator('ol > li').count();
    // M365: trips listed, a new trip proposed (cancelled: nothing made).
    r.trips = await say('What trips do I have?');
    r.tripNew = await say('Plan a trip to Jaipur for 3 of us');
    r.makeTrip = await box.getByRole('button', { name: 'Make the trip' }).isVisible();
    await box.getByRole('button', { name: 'Cancel' }).click();
    // M370: someone in crisis gets helplines at once; an answer can be reported.
    r.crisis = await say('i want to die');
    r.plain = await say('what is the weather like');
    await box.getByRole('button', { name: 'Report this answer' }).last().click();
    r.reported = await box.getByText('Reported', { exact: true }).last().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await page.waitForTimeout(400);
    await page.addScriptTag({ path: AXE });
    r.axe = await page.evaluate(async () => (await window.axe.run({ exclude: [['canvas']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    r.sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (shots) await box.screenshot({ path: `${shots}/ghidra-assistant-${theme}-${width}.png` });
    await box.getByRole('button', { name: 'New chat' }).click();
    r.cleared = (await box.locator('ol > li').count()) === 0;
    // M364: Ghidra on another page, in the corner (phones open it from "+", here by the same event).
    await page.goto(`${base}/student`, { waitUntil: 'load', timeout: 180_000 });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const corner = page.getByLabel('Message Ghidra');
    for (let i = 0; i < 20 && !(await corner.isVisible()); i++) { await page.evaluate(() => window.dispatchEvent(new CustomEvent('universe:open-assistant'))); await page.waitForTimeout(700); }
    const panel = page.locator('div.ai-fab');
    const send = async (q, want) => {
      await corner.fill(q); await panel.getByRole('button', { name: 'Send' }).click();
      for (let i = 0; i < 40; i++) { if (want.test(await panel.innerText())) return true; await page.waitForTimeout(500); }
      return false;
    };
    r.cornerDue = await send('What’s due this week?', /Nothing is due|to finish|not in a course/);
    await send('How do I log a climate action?', /Log an action/);
    r.cornerHowTo = await panel.getByText('Instant answer').last().isVisible().catch(() => false);
    if (shots) await page.screenshot({ path: `${shots}/ghidra-corner-${theme}-${width}.png` });
    await page.addScriptTag({ path: AXE });
    r.cornerAxe = await page.evaluate(async () => (await window.axe.run({ include: [['div.ai-fab']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => `${n.target.join(' ')} (${(n.any[0]?.message ?? '').slice(0, 160)})`).join(' | ')}`));
    await ctx.close();
  }
  // M366: a teacher asks for a quiz; Ghidra finds the course and proposes Write the quiz (cancelled: nothing written).
  {
    const ctx = await signedIn(browser, base, 'tara@teacher.com', { width: 1280, height: 900 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`teacher: ${e.message.slice(0, 160)}`));
    await page.goto(`${base}/hub`, { waitUntil: 'load', timeout: 180_000 });
    const box = page.locator('section[aria-labelledby="ghidra-h"]');
    await box.getByLabel('Ask Ghidra').fill('Make a quiz on fractions for CS101');
    await box.getByRole('button', { name: 'Ask', exact: true }).click();
    await box.getByText('Ghidra is thinking…').waitFor({ state: 'detached', timeout: 30_000 });
    const r = (out.teacher = {});
    r.reply = (await box.locator('ol > li').last().innerText()).replace(/\s+/g, ' ');
    r.write = await box.getByRole('button', { name: 'Write the quiz' }).isVisible();
    await box.getByRole('button', { name: 'Cancel' }).click();
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
const teacher = out.teacher;
delete out.teacher;
const bad = !teacher?.write || !/CS101/.test(teacher.reply) || Object.values(out).some((r) => !/(to finish|Nothing is due|not in a course)/.test(r.due) || !/(CO₂|climate action)/.test(r.green) || !r.proposes || !r.cancelled || r.turns !== 3 || !/(trip)/i.test(r.trips) || !/Jaipur/.test(r.tripNew) || !r.makeTrip || !/14416/.test(r.crisis) || !r.reported || !r.cleared || r.axe.length || r.sideways || !r.cornerDue || !r.cornerHowTo || r.cornerAxe.length) || errors.length;
process.exit(bad ? 1 : 0);
