// M161 (dev server or built Worker): fields that line up, on the pages with date and time fields, as an
// admin, a teacher and a student, at 1280 and 390: no date or time field narrower than what it holds
// ("09:00 AM" with its icon), no field written under its label (mt-*) sitting beside it, no sideways scroll.
//   node scripts/checks/fields-ui.mjs [http://localhost:8787]
import { baseUrl, launch, signedIn } from '../browser-session.mjs';
const B = baseUrl();
const PAGES = [
  ['demo@admin.com', ['/admin/attendance', '/admin/timetable', '/admin/impact-reports/shifts', '/admin/internships', '/admin/administrative', '/admin/reports/report-cards', '/trace/campaigns', '/settings']],
  ['demo@teacher.com', ['/teacher/attendance', '/teacher/services/rooms', '/teacher/assignments', '/teacher/meetings', '/settings']],
  ['demo@student.com', ['/student/internships/applications', '/student/beesafe', '/student/life/rooms', '/student/planner', '/settings']],
];
const browser = await launch();
const out = [], fail = [];
for (const [who, paths] of PAGES) for (const [w, h] of [[1280, 900], [390, 844]]) {
  const ctx = await signedIn(browser, B, who, { width: w, height: h }, w < 600 ? { isMobile: true, hasTouch: true } : {});
  const page = await ctx.newPage();
  for (const path of paths) {
    try {
      await page.goto(B + path, { waitUntil: 'load', timeout: 240000 });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const bad = [];
        for (const i of document.querySelectorAll('input[type=time],input[type=date],input[type=datetime-local],input[type=month]')) {
          if (!i.offsetParent) continue;
          const w = i.getBoundingClientRect().width; const old = i.style.width; i.style.width = 'max-content'; const need = i.getBoundingClientRect().width; i.style.width = old;
          if (need > w + 1) bad.push(`clipped ${i.type} ${Math.round(w)}<${Math.round(need)}`);
        }
        for (const i of document.querySelectorAll('label > .input')) {
          if (!i.offsetParent || !/(^| )mt-/.test(i.className)) continue;
          const lab = i.closest('label'); const t = [...lab.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
          if (t && Math.abs(i.getBoundingClientRect().top - lab.getBoundingClientRect().top) < 4) bad.push('beside its label');
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`sideways ${document.documentElement.scrollWidth - innerWidth}px`);
        return { n: document.querySelectorAll('input[type=time],input[type=date],input[type=datetime-local]').length, bad };
      });
      if (r.bad.length) fail.push(`${who} ${path} ${w}: ${[...new Set(r.bad)].join('; ')}`);
      else out.push(`${who.split('@')[0]} ${path} ${w}: ${r.n} date/time fields`);
    } catch (e) { fail.push(`${path} ${w}: ${e.message.slice(0, 80)}`); }
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ out, fail }, null, 2));
process.exit(fail.length ? 1 : 0);
