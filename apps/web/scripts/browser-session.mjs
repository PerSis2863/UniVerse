// Shared by the browser checks (cls.mjs, a11y.mjs): Playwright, demo sign-in and the pages to visit.
// Needs a dev server with demo login: NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);

/** Playwright, from this project or the global install. */
export function playwright() {
  try { return require('playwright'); } catch { /* not local */ }
  return require(`${execSync('npm root -g').toString().trim()}/playwright`);
}

export const launch = () => playwright().chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });

/** The main pages per demo account. */
export const PAGES = {
  'demo@student.com': ['/student', '/student/courses', '/student/assignments', '/student/quizzes', '/student/grades', '/student/attendance', '/student/inbox', '/student/calendar', '/student/skills', '/student/internships', '/student/planner', '/student/settings', '/tasks', '/docs'],
  'demo@teacher.com': ['/teacher', '/teacher/courses', '/teacher/grades', '/teacher/attendance', '/teacher/students', '/teacher/quizzes'],
  'demo@admin.com': ['/admin', '/admin/users', '/admin/finances', '/admin/announcements', '/admin/analytics'],
};

/** 15 more, for the accessibility audit (40 pages in all). */
export const MORE_PAGES = {
  'demo@student.com': ['/student/groups', '/student/impact/dashboard', '/student/life/medical', '/student/administrative/accounting', '/student/support', '/student/credentials', '/student/search/directory', '/student/passport', '/boards', '/code'],
  'demo@teacher.com': ['/teacher/calendar', '/teacher/services/rooms', '/teacher/collaborations'],
  'demo@admin.com': ['/admin/courses', '/admin/timetable'],
};

/** PAGES and MORE_PAGES together. */
export const ALL_PAGES = Object.fromEntries(Object.entries(PAGES).map(([email, pages]) => [email, [...pages, ...(MORE_PAGES[email] ?? [])]]));

/** A browser context signed in as a demo account (mock token, only with demo login on). */
export async function signedIn(browser, base, email, viewport = { width: 1366, height: 900 }) {
  const token = `mock-token-${email}`;
  const me = await fetch(`${base}/api/core/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(([t, user]) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 }));
  }, [token, me]);
  return ctx;
}

export const baseUrl = () => process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3100';
