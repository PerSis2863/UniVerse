# Start here

UniVerse is a school and university platform (students, teachers, admins, parents) with a
social-impact side. The whole app is in **`apps/web`**: a Next.js 16 site that runs on Cloudflare
Workers, with its database on Cloudflare D1 and uploads on R2. This page says where the work stands,
how to run it on your computer, and how to carry on (for the owner and for any AI agent, such as
Cursor's).

## Where things stand (20 October 2026)

- **`main` has everything through Q18** (merged 20 Oct): Q14 skills passport, Q15 careers, Q16 global
  impact (and online payments counted only when the gateway confirms), Q17 student life, Q18 profile,
  settings search and the guided tour. Before that, through Q13 (pull request #64): the Office-style documents,
  spreadsheets and slides, home pages, notifications, search, attendance, the calendar and
  timetable, and the AI tutor.
- **The plan:** `apps/web/STAGE-5-PLAN.md`. Section 4 "Remaining work queue" lists every item in
  order, and the **Progress** table at the end says what's done, where the code is and what's left
  for each item. **Q19 Owner console, Q20 Chat apps and Q21 Languages are done (on branch `claude/great-hamilton-8g8xdm`, not merged yet). Next up: Q22 leftovers**, then Q23
  small items (Phase E).
- **Notes for whoever continues:** `apps/web/STAGE-5-HANDOFF.md`: one note per item with the traps
  and the rules for code that builds on it.
- **Q14–Q18 are on the live site** (merged together on 20 Oct).
- **Next database update number: `0165`** (files in `apps/web/prisma/migrations/`).

**Waiting on the owner** (things only you can provide):
- Two-way Google / Outlook calendar sync: a Google Cloud project and a Microsoft app.
- Google Classroom import: a sample export, or the Classroom API.
- Grade passback to an LMS: a real LMS to test with.
- Payments by UPI (Razorpay) and anything else that costs money or needs an account.
- Donations (Q16): in Stripe → Developers → Webhooks, make sure your UniVerse endpoint also sends
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`; then in Impact
  reports → Donations switch on the NGOs that should take donations (with their 80G number and PAN
  for Indian tax receipts). Rupee card gifts need a Stripe account that accepts INR.
- Event tickets (Q17): make sure `SESSION_SECRET` on the Cloudflare Worker is at least 32 characters
  (tickets and check-in codes are signed with it). Live bus positions need a GPS device or a driver app.
- Trying on the live site what couldn't be tried locally: a real AI reading of a homework photo,
  a calendar file from Google or Outlook, the voice tutor, a real card donation.

## Set up on your computer (once)

1. Install **Node.js 22** (20 or newer works), **Git**, and turn on **pnpm**: `corepack enable`.
   On **Windows**, use **WSL** (Ubuntu) and do everything inside it: the Cloudflare build doesn't
   work reliably on Windows itself.
2. Get the code: `git clone https://github.com/PerSis2863/UniVerse.git` (or `git pull` in your copy),
   then `cd UniVerse`.
3. `pnpm install` (in the `UniVerse` folder).
4. `cd apps/web` then `pnpm local:setup`: makes the local database with every update and the
   sample accounts and courses.
5. Only for the browser checks: `npm install -g playwright` then `npx playwright install chromium`.

No keys are needed to run it locally. Never put a real key in a file in this project.

## Run it

From `apps/web`:

| Command | What it does |
|---|---|
| `pnpm local:dev` | The quick way while editing: http://localhost:3000, pages change as you save. |
| `pnpm local:build` | Builds the site exactly as Cloudflare does (10–15 minutes). |
| `pnpm local:serve` | Runs that build on http://localhost:8787. Add `--ai-placeholder` for the AI tutor's checks. |
| `pnpm check` | The checks before every commit: types, lint of changed files, unit tests. |
| `node scripts/checks/<name>.mjs` | A browser or API check, while `local:serve` runs (list: `scripts/checks/README.md`). |

On the login page, **"Or test with demo accounts"** signs in without a password (locally only):
Demo Student, Demo Teacher, Demo Admin, IT support. The checks also use the sample test accounts
alice@student.com, bob@student.com (students), tara@teacher.com (co-teacher) and tom@teacher.com
(teaching assistant) of course CS101. The demo admin can look but not change things, on purpose.

After you `git pull` new work, run `pnpm install` and `pnpm local:setup` again (new database updates).

## Publishing

Merging into `main` publishes the site: Cloudflare builds it, applies new database updates, then
puts it live (about 15 minutes). Check it in the Cloudflare dashboard: Workers & Pages →
universe-web → Deployments (`apps/web/DEPLOY-CLOUDFLARE.md` has the details). Keys and passwords
live only in the dashboard (Settings → Variables and secrets).

## For AI agents (Cursor and others)

Read **`.cursor/rules/universe.mdc`** (Cursor loads it by itself): how the owner works, the rules
for code in this project and how to test. Then the Progress table and section 4 of
`apps/web/STAGE-5-PLAN.md`, and `apps/web/STAGE-5-HANDOFF.md`.
