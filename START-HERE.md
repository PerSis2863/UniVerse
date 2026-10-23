# Start here

UniVerse is a school and university platform (students, teachers, admins, parents) with a
social-impact side. The whole app is in **`apps/web`**: a Next.js 16 site that runs on Cloudflare
Workers, with its database on Cloudflare D1 and uploads on R2. This page says where the work stands,
how to run it on your computer, and how to carry on (for the owner and for any AI agent, such as
Cursor's).

## Where things stand (21 October 2026)

- **`main` has everything through Q26** (merged 21 Oct): the full review, the phone smoothness second
  pass, the accessibility sweep, Phase E (Q23–Q26: undo, drag-and-drop and paste on file fields, bulk
  actions on Admin → Users, choosing several chat messages, accent colour, ringtone, course colours,
  scheduled report exports, CSV on the admin tables, a public blog written in the owner console) and
  smooth loading everywhere (S1: placeholders shaped like the page, parts arriving in turn), and
  S2 (22 Oct): AgentGPT-style entrance (the app assembles itself in about 1.2 s as it opens; longer,
  softer motions everywhere).
- **The plan:** `apps/web/STAGE-5-PLAN.md`. Section 4 "Remaining work queue" lists every item in
  order, and the **Progress** table at the end says what's done, where the code is and what's left
  for each item.
- **Notes for whoever continues:** `apps/web/STAGE-5-HANDOFF.md`: start with its "Next steps" and the
  S2, Q26, S1 and Q24/Q25 notes.
- **Next database update number: `0176`** (files in `apps/web/prisma/migrations/`).

**Moving to the $5 Cloudflare plan (Workers Paid)**, in this order:
1. In Cloudflare: Workers & Pages → Plans → Workers Paid ($5 a month, plus any local tax).
2. Done in the code since 22 Oct 2026 (the owner upgraded): `apps/web/wrangler.jsonc` sets
   `CF_PLAN=paid`, which turns on the paid limits and the spending guard's monthly $5 view, plus a
   15-second CPU cap per request and full Workers Logs. Nothing to add in the dashboard (an older
   `WORKERS_PAID` secret can stay). If the account ever goes back to Workers Free, remove `CF_PLAN`
   and `limits` from wrangler.jsonc first (Free refuses a deploy with a CPU limit).
3. Workers & Pages → universe-web → Settings → Build: builds only for `main` (turn off builds for
   other branches). 6,000 build minutes a month are included; each build takes ~15–20 minutes.
   (Since 22 Oct 2026 the app also does this itself: a build of any other branch stops in its first
   seconds, see `apps/web/scripts/build-budget.mjs`.)
4. Optional: Manage Account → Billing → Billable Usage → Set Budget Alert at $1 (an email if
   anything is ever charged beyond the $5).
5. Optional: a secret `CF_BILLING_DAY` = the day of the month you upgraded (without it the guard
   counts the last 31 days: never too little, so it may pause a little early).
The spending guard (`cloudflare/usage-guard.ts`) then emails at 70% of anything the $5 includes and
pauses the app at 90% until the next billing month, so nothing extra is charged. Site builds can't be
paused that way, so they have their own stop: past 90% of the 6,000 build minutes, each new build
stops in its first seconds (it asks the live site, `/api/build-budget`) and changes go live after the
next billing month starts. Nothing on the account can be billed beyond these: there are no AI,
KV, Queues, Vectorize or image services switched on. Cloudflare itself has no setting that caps the
bill. To go past a limit on purpose (and pay for it), add the secret `CF_GUARD_OFF`.

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
